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
});
