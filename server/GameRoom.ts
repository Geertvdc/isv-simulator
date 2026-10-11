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
 */

import { randomInt } from 'node:crypto';
import { type Client, Room, ServerError } from 'colyseus';
import { type LagLine, type LagSettings, createLagLine, deliveryTime } from '../src/net/lag';
import { MAX_PLAYERS } from '../src/sim/level';
import { releaseJoinCode, reserveJoinCode } from './joinCodes';
import type { ProfileStore } from './profileStore';
import {
  type Outgoing,
  type RoomOptions,
  type RoomState,
  TICK_MS,
  advanceRoom,
  createRoomState,
  handleMessage,
  joinRoom,
  leaveRoom,
  setMemberProfile,
  takeProfileWrites,
} from './roomLogic';

export { GAME_ROOM } from '../src/net/protocol';

/**
 * HTTP-style status for a refused join. The SDK rejects the join with this
 * code and our `ErrorCode` (`roomFull`, `protocolMismatch`, ...) as the message.
 */
export const JOIN_REFUSED = 4400;

/** How the server's rooms play: `RoomOptions` plus the dev lag simulator. */
export interface GameRoomSettings extends RoomOptions {
  /** Delays every message in and out (`NET_LAG_MS`, `NET_JITTER_MS`); dev only. */
  lag?: LagSettings | null;
}

export class GameRoom extends Room {
  // Every member brings at least one player.
  maxClients = MAX_PLAYERS;
  private core!: RoomState;
  /** Set by `gameRoomWith`; without one the room plays without profiles. */
  protected store: ProfileStore | null = null;
  /** Set by `gameRoomWith`. */
  protected settings: GameRoomSettings = {};
  /** The lag simulator's delays for messages in and out, when it's on. */
  private lagIn: LagLine | null = null;
  private lagOut: LagLine | null = null;

  onCreate(): void {
    const code = reserveJoinCode();
    this.roomId = code;
    this.core = createRoomState(code, randomInt(2 ** 31), this.settings);
    const lag = this.settings.lag;
    if (lag) {
      this.lagIn = createLagLine(lag, randomInt(2 ** 31));
      this.lagOut = createLagLine(lag, randomInt(2 ** 31));
    }
    this.onMessage('*', (client: Client, _type: string | number, message: unknown) => {
      this.later(this.lagIn, () => {
        this.deliver(handleMessage(this.core, client.sessionId, message));
      });
    });
    // Colyseus calls this about every tick with the real time since the
    // last call; `advanceRoom` turns that into whole ticks (our own tested
    // accumulator rather than `setFixedTimestep`, so tests can drive it).
    this.setTimestep((deltaMs) => {
      this.deliver(advanceRoom(this.core, deltaMs));
      this.writeProfiles();
    }, TICK_MS);
  }

  onJoin(client: Client, options: unknown): void {
    const result = joinRoom(this.core, client.sessionId, options);
    if (!result.ok) throw new ServerError(JOIN_REFUSED, result.code);
    this.deliver(result.out);
    this.loadProfile(client.sessionId);
  }

  onLeave(client: Client): void {
    this.deliver(leaveRoom(this.core, client.sessionId));
  }

  onDispose(): void {
    releaseJoinCode(this.core.joinCode);
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

  /** Runs `fn` now, or after the simulated lag when the lag simulator is on. */
  private later(line: LagLine | null, fn: () => void): void {
    if (!line) {
      fn();
      return;
    }
    const now = performance.now();
    setTimeout(fn, deliveryTime(line, now) - now);
  }

  private deliver(out: readonly Outgoing[]): void {
    if (out.length === 0) return;
    const send = (): void => {
      for (const { to, message } of out) {
        if (to === null) this.broadcast(message.type, message);
        else this.clients.get(to)?.send(message.type, message);
      }
    };
    this.later(this.lagOut, send);
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
