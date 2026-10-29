/**
 * Routes a member's message to the room logic it belongs to: the roster
 * (`lobby.ts`), the member themselves (`membership.ts`) or the round
 * (`round.ts`). See `room.ts` for the room's state.
 */

import { parseClientMessage } from '../src/net/protocol';
import { configurePlayer, queuePresses, takeOverSlot } from './lobby';
import { renameMember, spendMessage, updateMember } from './membership';
import { type Outgoing, type RoomState, errorTo } from './room';
import { bufferInputs } from './round';

/** A message from a member: checked first, refused with an `error` when it doesn't parse. */
export function handleMessage(room: RoomState, sessionId: string, raw: unknown): Outgoing[] {
  const member = room.members.find((m) => m.sessionId === sessionId);
  if (!member?.connected) return [];
  // A flood is dropped before anything else looks at it.
  if (!spendMessage(member)) return [];
  const parsed = parseClientMessage(raw);
  if (!parsed.ok) return [errorTo(sessionId, 'badMessage', parsed.reason)];
  const message = parsed.value;
  switch (message.type) {
    case 'role':
    case 'ready':
      return configurePlayer(room, sessionId, message);
    case 'takeover':
      return takeOverSlot(room, sessionId, message);
    case 'ping':
      return [
        {
          to: sessionId,
          message: {
            type: 'pong',
            id: message.id,
            clientTimeMs: message.clientTimeMs,
            serverTick: room.serverTick,
          },
        },
      ];
    case 'inputs':
      bufferInputs(room, sessionId, message.inputs);
      return [];
    case 'menu':
      queuePresses(room, sessionId, message.presses);
      return [];
    case 'hello':
      return updateMember(room, member, message);
    case 'rename':
      return renameMember(room, member, message.displayName);
  }
}
