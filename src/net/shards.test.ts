import { describe, expect, it } from 'vitest';
import { hostOrder, parseShard, serverUrls, shardUrl } from './shards';

const page = { protocol: 'http:', hostname: 'localhost' };

describe('serverUrls', () => {
  it('reads VITE_SERVER_URLS in order, trimmed, without trailing slashes or empties', () => {
    expect(
      serverUrls('https://a.example/, https://b.example ,,https://c.example//', '', page),
    ).toEqual(['https://a.example', 'https://b.example', 'https://c.example']);
    expect(serverUrls('https://a.example', 'https://ignored.example', page)).toEqual([
      'https://a.example',
    ]);
  });

  it('falls back to VITE_SERVER_URL, then to this page on port 2567', () => {
    expect(serverUrls(undefined, 'https://one.example/', page)).toEqual(['https://one.example']);
    expect(serverUrls(' , ', 'https://one.example', page)).toEqual(['https://one.example']);
    expect(serverUrls(undefined, undefined, page)).toEqual(['http://localhost:2567']);
  });
});

describe('shardUrl', () => {
  const urls = ['https://s0', 'https://s1', 'https://s2'];

  it("picks the shard named by the code's first letter", () => {
    expect(shardUrl(urls, 'ABCD')).toBe('https://s0');
    expect(shardUrl(urls, 'BBCD')).toBe('https://s1');
    expect(shardUrl(urls, 'CBCD')).toBe('https://s2');
    expect(shardUrl(urls, 'DBCD')).toBe('https://s0');
    expect(shardUrl(['https://only'], 'ZZZZ')).toBe('https://only');
  });
});

describe('hostOrder', () => {
  const urls = ['https://s0', 'https://s1', 'https://s2'];

  it('tries every shard once, starting at a random one', () => {
    expect(hostOrder(urls, () => 0)).toEqual(urls);
    expect(hostOrder(urls, () => 1)).toEqual(['https://s1', 'https://s2', 'https://s0']);
    expect(hostOrder(urls, () => 2)).toEqual(['https://s2', 'https://s0', 'https://s1']);
  });

  it('asks for a number below the shard count, and nothing with one shard', () => {
    const asked: number[] = [];
    hostOrder(urls, (n) => {
      asked.push(n);
      return 0;
    });
    expect(asked).toEqual([3]);
    expect(
      hostOrder(['https://only'], () => {
        throw new Error('not asked');
      }),
    ).toEqual(['https://only']);
    expect(hostOrder([], () => 0)).toEqual([]);
  });
});

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
