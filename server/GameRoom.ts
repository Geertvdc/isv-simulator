/**
 * The Colyseus room: a thin shell around `roomLogic.ts`. It turns Colyseus
 * callbacks into calls on the room's plain state and delivers the messages
 * those calls return. Messages go both ways as Colyseus messages whose type
 * is the protocol message's `type` and whose payload is the whole message.
 */

import { randomInt } from 'node:crypto';
import { type Client, Room, ServerError } from 'colyseus';
import { MAX_PLAYERS } from '../src/sim/level';
import { releaseJoinCode, reserveJoinCode } from './joinCodes';
import {
  type Outgoing,
  type RoomState,
  TICK_MS,
  advanceRoom,
  createRoomState,
  handleMessage,
  joinRoom,
  leaveRoom,
} from './roomLogic';

/** The room type clients create and join: `client.create(GAME_ROOM, hello)`. */
export const GAME_ROOM = 'game';

/**
 * HTTP-style status for a refused join. The SDK rejects the join with this
 * code and our `ErrorCode` (`roomFull`, `protocolMismatch`, ...) as the message.
 */
export const JOIN_REFUSED = 4400;

export class GameRoom extends Room {
  // Every member brings at least one player.
  maxClients = MAX_PLAYERS;
  private core!: RoomState;

  onCreate(): void {
    const code = reserveJoinCode();
    this.roomId = code;
    this.core = createRoomState(code, randomInt(2 ** 31));
    this.onMessage('*', (client: Client, _type: string | number, message: unknown) => {
      this.deliver(handleMessage(this.core, client.sessionId, message));
    });
    // Colyseus calls this about every tick with the real time since the
    // last call; `advanceRoom` turns that into whole ticks (our own tested
    // accumulator rather than `setFixedTimestep`, so tests can drive it).
    this.setTimestep((deltaMs) => {
      this.deliver(advanceRoom(this.core, deltaMs));
    }, TICK_MS);
  }

  onJoin(client: Client, options: unknown): void {
    const result = joinRoom(this.core, client.sessionId, options);
    if (!result.ok) throw new ServerError(JOIN_REFUSED, result.code);
    this.deliver(result.out);
  }

  onLeave(client: Client): void {
    this.deliver(leaveRoom(this.core, client.sessionId));
  }

  onDispose(): void {
    releaseJoinCode(this.core.joinCode);
  }

  private deliver(out: readonly Outgoing[]): void {
    for (const { to, message } of out) {
      if (to === null) this.broadcast(message.type, message);
      else this.clients.get(to)?.send(message.type, message);
    }
  }
}
