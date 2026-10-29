/**
 * The Colyseus room: a thin shell around `roomLogic.ts`. It turns Colyseus
 * callbacks into calls on the room's plain state and delivers the messages
 * those calls return. Messages go both ways as Colyseus messages whose type
 * is the protocol message's `type` and whose payload is the whole message.
 *
 * Profiles: each member's profile is loaded from the store after they join
 * (the host's drives the room's unlocks), and every finished round is
 * written to every member's profile. Store trouble is logged and never stops
 * the room: the round just isn't saved online.
 *
 * Connections: a member whose socket drops (`onDrop`) keeps their place for
 * the reconnect grace period (`allowReconnection`); the SDK reconnects on its
 * own, a reloaded page with the stored token (`onReconnect`). After the grace
 * period, or when they leave on purpose, `onLeave` removes them.
 */

import { randomInt } from 'node:crypto';
import { type Client, Room, ServerError } from 'colyseus';
import { type LagSettings, createLagRunner } from '../src/net/lag';
import {
  NET_FLOOD_KICK_FACTOR,
  NET_MAX_MESSAGES_PER_SECOND,
  NET_RECONNECT_GRACE_MS,
} from '../src/sim/balance';
import { MAX_PLAYERS } from '../src/sim/level';
import { releaseJoinCode, reserveJoinCode } from './joinCodes';
import type { ProfileStore } from './profileStore';
import { dropMember, joinRoom, leaveRoom, rejoinMember, setMemberProfile } from './membership';
import { type Outgoing, type RoomOptions, type RoomState, TICK_MS, createRoomState } from './room';
import { handleMessage } from './roomLogic';
import { advanceRoom, takeProfileWrites } from './round';

export { GAME_ROOM } from '../src/net/protocol';

/**
 * HTTP-style status for a refused join. The SDK rejects the join with this
 * code and our `ErrorCode` (`roomFull`, `protocolMismatch`, ...) as the message.
 */
export const JOIN_REFUSED = 4400;

/** Colyseus close codes: a goodbye (the client doesn't try to reconnect), and the server going away. */
const CONSENTED = 4000;
const SERVER_SHUTDOWN = 4001;

/** How the server's rooms play: `RoomOptions` plus the dev lag simulator. */
export interface GameRoomSettings extends RoomOptions {
  /** Delays every message in and out (`NET_LAG_MS`, `NET_JITTER_MS`); dev only. */
  lag?: LagSettings | null;
  /** How long a dropped member may take to reconnect; `NET_RECONNECT_GRACE_MS` by default (tests use less). */
  reconnectGraceMs?: number;
}

export class GameRoom extends Room {
  // Every member brings at least one player.
  maxClients = MAX_PLAYERS;
  // `roomLogic` drops messages past the budget; a client this far past it is broken or hostile.
  maxMessagesPerSecond = NET_MAX_MESSAGES_PER_SECOND * NET_FLOOD_KICK_FACTOR;
  private core!: RoomState;
  /** Set by `gameRoomWith`; without one the room plays without profiles. */
  protected store: ProfileStore | null = null;
  /** Set by `gameRoomWith`. */
  protected settings: GameRoomSettings = {};
  /** Runs message handling and sending, after the simulated lag when it's on. */
  private lagIn: (fn: () => void) => void = (fn) => {
    fn();
  };
  private lagOut: (fn: () => void) => void = (fn) => {
    fn();
  };

  onCreate(): void {
    const code = reserveJoinCode();
    this.roomId = code;
    this.core = createRoomState(code, randomInt(2 ** 31), this.settings);
    const lag = this.settings.lag;
    if (lag) {
      const clock = {
        now: () => performance.now(),
        setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms),
      };
      this.lagIn = createLagRunner(lag, randomInt(2 ** 31), clock);
      this.lagOut = createLagRunner(lag, randomInt(2 ** 31), clock);
    }
    this.onMessage('*', (client: Client, _type: string | number, message: unknown) => {
      this.lagIn(() => {
        this.deliver(handleMessage(this.core, client.sessionId, message));
      });
    });
    // Colyseus calls this about every tick with the real time since the
    // last call; `advanceRoom` turns that into whole ticks (our own tested
    // accumulator rather than `setFixedTimestep`, so tests can drive it).
    this.setTimestep((deltaMs) => {
      if (this.closing) return;
      this.deliver(advanceRoom(this.core, deltaMs));
      this.writeProfiles();
      if (this.core.closing) this.close();
    }, TICK_MS);
  }

  onJoin(client: Client, options: unknown): void {
    const result = joinRoom(this.core, client.sessionId, options);
    if (!result.ok) throw new ServerError(JOIN_REFUSED, result.code);
    this.deliver(result.out);
    this.loadProfile(client.sessionId);
  }

  /** The socket dropped without a goodbye: keep their place while they reconnect. */
  onDrop(client: Client): void {
    this.deliver(dropMember(this.core, client.sessionId));
    const grace = this.settings.reconnectGraceMs ?? NET_RECONNECT_GRACE_MS;
    // A rejected reconnection (the grace ran out, or the room closes) ends in `onLeave`.
    this.allowReconnection(client, grace / 1000).catch(() => undefined);
  }

  onReconnect(client: Client): void {
    this.deliver(rejoinMember(this.core, client.sessionId));
  }

  /** Gone for good: left on purpose, or didn't come back in time. */
  onLeave(client: Client): void {
    this.deliver(leaveRoom(this.core, client.sessionId));
  }

  /**
   * The server is shutting down: everyone hears why, nobody waits for a
   * reconnect that can't happen, then the room closes.
   */
  onBeforeShutdown(): void {
    this.sendNow([{ to: null, message: { type: 'closing', reason: 'shutdown' } }]);
    this.close(SERVER_SHUTDOWN);
  }

  onDispose(): void {
    releaseJoinCode(this.core.joinCode);
  }

  private closing = false;

  /** Closes the room: pending reconnections are dropped, everyone is disconnected. */
  private close(code = CONSENTED): void {
    if (this.closing) return;
    this.closing = true;
    this.disconnect(code).catch(() => undefined);
  }

  private loadProfile(sessionId: string): void {
    const userId = this.core.members.find((m) => m.sessionId === sessionId)?.profileId;
    if (!this.store || !userId) return;
    this.store.get(userId).then(
      (profile) => {
        if (profile) this.deliver(setMemberProfile(this.core, sessionId, profile.levels));
      },
      (error: unknown) => {
        console.error(`Could not load profile ${userId}:`, error);
      },
    );
  }

  private writeProfiles(): void {
    const writes = takeProfileWrites(this.core);
    if (!this.store) return;
    const now = new Date().toISOString();
    for (const w of writes) {
      this.store
        .recordResult(w.userId, w.levelId, w.result, now, w.displayName)
        .catch((error: unknown) => {
          console.error(`Could not record a round for ${w.userId}:`, error);
        });
    }
  }

  private deliver(out: readonly Outgoing[]): void {
    if (out.length === 0) return;
    this.lagOut(() => {
      this.sendNow(out);
    });
  }

  private sendNow(out: readonly Outgoing[]): void {
    for (const { to, message } of out) {
      if (to === null) this.broadcast(message.type, message);
      else this.clients.get(to)?.send(message.type, message);
    }
  }
}

/** The room class for a server whose rooms keep profiles in `store` and play by `settings`. */
export function gameRoomWith(
  store: ProfileStore,
  settings: GameRoomSettings = {},
): typeof GameRoom {
  return class extends GameRoom {
    protected override store = store;
    protected override settings = settings;
  };
}
