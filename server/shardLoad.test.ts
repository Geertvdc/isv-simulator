import { describe, expect, it } from 'vitest';
import { NET_SHARD_MAX_ROOMS } from '../src/sim/balance';
import { ShardLoad } from './shardLoad';

describe('ShardLoad', () => {
  it('counts rooms and their players against the limit', () => {
    const load = new ShardLoad(2);
    const a = {};
    const b = {};
    let aPlayers = 1;
    expect([load.rooms, load.players, load.isFull()]).toEqual([0, 0, false]);
    load.add(a, () => aPlayers);
    load.add(b, () => 3);
    aPlayers = 2;
    expect([load.rooms, load.players, load.isFull()]).toEqual([2, 5, true]);
    load.remove(a);
    load.remove(a);
    expect([load.rooms, load.players, load.isFull()]).toEqual([1, 3, false]);
    expect(new ShardLoad().maxRooms).toBe(NET_SHARD_MAX_ROOMS);
  });

  it('adds up connections and lists the rooms that describe themselves', () => {
    const load = new ShardLoad(5);
    const summary = (code: string) => ({
      code,
      members: 1,
      players: 1,
      screen: 'lobby',
      levelId: null,
      ageS: 0,
      idleS: 0,
    });
    load.add(
      {},
      () => 1,
      () => ({ connections: 2, summary: summary('AAAA') }),
    );
    load.add({}, () => 1);
    load.add(
      {},
      () => 1,
      () => ({ connections: 1, summary: summary('BBBB') }),
    );
    expect(load.connections).toBe(3);
    expect(load.roomList().map((r) => r.code)).toEqual(['AAAA', 'BBBB']);
    expect(load.roomList(1).map((r) => r.code)).toEqual(['AAAA']);
    expect([load.roundsStarted, load.serverFullRefusals]).toEqual([0, 0]);
  });
});
