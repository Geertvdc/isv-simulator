/** Routing a member's message: ping, bad messages, strangers and renames. */

import { describe, expect, it } from 'vitest';
import { playerIdsOf } from './lobby';
import { createRoomState } from './room';
import { handleMessage } from './roomLogic';
import { join, menu, messages, playingRoom, press, steps } from './testing';

describe('messages', () => {
  it('answers a ping with the server tick', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    steps(room, 5);
    expect(handleMessage(room, 'a', { type: 'ping', id: 7, clientTimeMs: 123.5 })).toEqual([
      { to: 'a', message: { type: 'pong', id: 7, clientTimeMs: 123.5, serverTick: 5 } },
    ]);
  });

  it('answers bad messages with an error and ignores strangers', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    expect(handleMessage(room, 'a', { type: 'nope' })).toMatchObject([
      { to: 'a', message: { type: 'error', code: 'badMessage' } },
    ]);
    expect(handleMessage(room, 'stranger', { type: 'ping', id: 1, clientTimeMs: 0 })).toEqual([]);
  });
});

describe('renaming', () => {
  it('changes the name everyone sees, without touching the couch players', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    join(room, 'b');
    menu(room, 'a', press('kb-left', { join: true }), press('pad-0', { join: true }));
    const out = handleMessage(room, 'a', { type: 'rename', displayName: '  Grace ' });
    const lobby = messages(out, 'lobby').at(-1);
    expect(lobby?.members.map((m) => m.displayName)).toEqual(['Grace', 'b']);
    expect(lobby?.members[0]?.localPlayers).toBe(2);
    expect(playerIdsOf(room, 'a')).toEqual([1, 2]);
  });

  it('works mid-round and sends nothing when the name is the same', () => {
    const room = playingRoom();
    const [first] = room.members;
    if (!first) throw new Error('no member');
    expect(
      handleMessage(room, first.sessionId, { type: 'rename', displayName: 'Lin' }),
    ).toHaveLength(1);
    expect(first.displayName).toBe('Lin');
    expect(handleMessage(room, first.sessionId, { type: 'rename', displayName: 'Lin' })).toEqual(
      [],
    );
  });

  it('refuses an empty name', () => {
    const room = createRoomState('ABCD', 1);
    join(room, 'a');
    expect(handleMessage(room, 'a', { type: 'rename', displayName: ' ' })).toMatchObject([
      { message: { type: 'error', code: 'badMessage' } },
    ]);
    expect(room.members[0]?.displayName).toBe('a');
  });
});
