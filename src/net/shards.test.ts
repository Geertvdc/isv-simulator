import { describe, expect, it } from 'vitest';
import { NET_SHARD_MAX_ROOMS } from '../sim/balance';
import { parseMaxRooms, parseShard, parseShardUrls } from './shards';

describe('parseShard', () => {
  it('defaults to the only shard', () => {
    expect(parseShard(undefined, undefined)).toEqual({ index: 0, count: 1 });
    expect(parseShard('', ' ')).toEqual({ index: 0, count: 1 });
  });

  it('reads the index and count', () => {
    expect(parseShard('2', '3')).toEqual({ index: 2, count: 3 });
    expect(parseShard(' 0 ', '24')).toEqual({ index: 0, count: 24 });
    expect(parseShard('23', '24')).toEqual({ index: 23, count: 24 });
  });

  it('refuses what is not a whole number or out of range', () => {
    expect(() => parseShard('one', '2')).toThrow('SHARD_INDEX must be a whole number');
    expect(() => parseShard('-1', '2')).toThrow('SHARD_INDEX must be a whole number');
    expect(() => parseShard('0', '1.5')).toThrow('SHARD_COUNT must be a whole number');
    expect(() => parseShard('0', '0')).toThrow('SHARD_COUNT must be from 1 to 24');
    expect(() => parseShard('0', '25')).toThrow('SHARD_COUNT must be from 1 to 24');
    expect(() => parseShard('2', '2')).toThrow('SHARD_INDEX must be below SHARD_COUNT');
    expect(() => parseShard('1', undefined)).toThrow('SHARD_INDEX must be below SHARD_COUNT');
  });
});

describe('parseShardUrls', () => {
  it('reads the URLs in order, trimmed, without trailing slashes or empties', () => {
    expect(
      parseShardUrls('https://a.example/, https://b.example ,,http://localhost:2569//', 3),
    ).toEqual(['https://a.example', 'https://b.example', 'http://localhost:2569']);
  });

  it('may be left out with one shard only', () => {
    expect(parseShardUrls(undefined, 1)).toEqual(['']);
    expect(parseShardUrls(' , ', 1)).toEqual(['']);
    expect(parseShardUrls('https://one.example', 1)).toEqual(['https://one.example']);
    expect(() => parseShardUrls(undefined, 2)).toThrow("SHARD_URLS must list the 2 shards' URLs");
  });

  it('needs exactly one http(s) URL per shard', () => {
    expect(() => parseShardUrls('https://a', 2)).toThrow('SHARD_URLS has 1 URLs, SHARD_COUNT is 2');
    expect(() => parseShardUrls('https://a,https://b,https://c', 2)).toThrow('has 3 URLs');
    expect(() => parseShardUrls('https://a,b.example', 2)).toThrow('"b.example" is not');
  });
});

describe('parseMaxRooms', () => {
  it('defaults to the balance number and reads whole numbers from 1', () => {
    expect(parseMaxRooms(undefined)).toBe(NET_SHARD_MAX_ROOMS);
    expect(parseMaxRooms(' ')).toBe(NET_SHARD_MAX_ROOMS);
    expect(parseMaxRooms(' 2 ')).toBe(2);
    expect(() => parseMaxRooms('0')).toThrow('SHARD_MAX_ROOMS must be a whole number from 1');
    expect(() => parseMaxRooms('1.5')).toThrow('SHARD_MAX_ROOMS');
    expect(() => parseMaxRooms('lots')).toThrow('SHARD_MAX_ROOMS');
  });
});
