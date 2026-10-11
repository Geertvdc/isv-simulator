import { describe, expect, it } from 'vitest';
import { defaultDisplayName } from '../flow/identity';
import {
  type FetchLike,
  type ProfileApi,
  createProfileApi,
  parseProfile,
  serverUrl,
  syncLevels,
} from './profileApi';

const ID = '3f2b8c1e-9d4a-4e6b-8a1c-2b3c4d5e6f70';

describe('serverUrl', () => {
  it('uses VITE_SERVER_URL when set', () => {
    const page = { protocol: 'http:', hostname: 'localhost' };
    expect(serverUrl('https://isv.example.com/', page)).toBe('https://isv.example.com');
    expect(serverUrl('  ', page)).toBe('http://localhost:2567');
  });

  it("defaults to this page's host on port 2567", () => {
    expect(serverUrl(undefined, { protocol: 'https:', hostname: '192.168.1.20' })).toBe(
      'https://192.168.1.20:2567',
    );
    expect(serverUrl(undefined, { protocol: 'http:', hostname: '::1' })).toBe('http://[::1]:2567');
  });
});

describe('createProfileApi', () => {
  function recorder(respond: () => Response): FetchLike & { calls: [string, RequestInit?][] } {
    const calls: [string, RequestInit?][] = [];
    const fetchFn = (url: string, init?: RequestInit): Promise<Response> => {
      calls.push([url, init]);
      return Promise.resolve(respond());
    };
    return Object.assign(fetchFn, { calls });
  }

  it('PUTs JSON and reads the profile back', async () => {
    const profile = { userId: ID, displayName: 'Ada', levels: {}, createdAt: 'x' };
    const fetchFn = recorder(() => Response.json(profile));
    const api = createProfileApi('http://srv', fetchFn);
    expect(await api.put(ID, { levels: {} })).toEqual({
      userId: ID,
      displayName: 'Ada',
      levels: {},
    });
    const [url, init] = fetchFn.calls[0] ?? [];
    expect(url).toBe(`http://srv/profiles/${ID}`);
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe('{"levels":{}}');
  });

  it('answers null for an unknown profile and rejects other errors', async () => {
    const missing = createProfileApi(
      'http://srv',
      recorder(() => new Response('', { status: 404 })),
    );
    expect(await missing.get(ID)).toBeNull();
    const broken = createProfileApi(
      'http://srv',
      recorder(() => new Response('', { status: 500 })),
    );
    await expect(broken.get(ID)).rejects.toThrow('500');
    const junk = createProfileApi(
      'http://srv',
      recorder(() => Response.json([1, 2])),
    );
    await expect(junk.put(ID, {})).rejects.toThrow();
  });
});

describe('parseProfile', () => {
  it('keeps the known fields and drops broken levels', () => {
    expect(
      parseProfile({ userId: ID, displayName: 'A', levels: { a: { bestStars: 1 }, b: 2 } }),
    ).toEqual({
      userId: ID,
      displayName: 'A',
      levels: { a: { bestStars: 1, bestScore: 0, plays: 1 } },
    });
    expect(parseProfile({ userId: ID })).toBeNull();
    expect(parseProfile('x')).toBeNull();
  });
});

describe('syncLevels', () => {
  const local = { garage: { bestStars: 3, bestScore: 10, plays: 4 } };

  function fakeApi(
    levels: Record<string, { bestStars: number; bestScore: number; plays: number }>,
  ) {
    const puts: Parameters<ProfileApi['put']>[] = [];
    const api: ProfileApi = {
      get: () => Promise.resolve(null),
      put: (userId, update) => {
        puts.push([userId, update]);
        return Promise.resolve({ userId, displayName: 'x', levels });
      },
    };
    return { api, puts };
  }

  it('sends the local levels and answers both merged', async () => {
    const { api, puts } = fakeApi({
      garage: { bestStars: 1, bestScore: 90, plays: 2 },
      'open-plan': { bestStars: 2, bestScore: 5, plays: 1 },
    });
    const merged = await syncLevels(api, { userId: ID, displayName: 'Grace' }, local);
    expect(merged).toEqual({
      garage: { bestStars: 3, bestScore: 90, plays: 4 },
      'open-plan': { bestStars: 2, bestScore: 5, plays: 1 },
    });
    expect(puts).toEqual([[ID, { displayName: 'Grace', levels: local }]]);
  });

  it("doesn't send a default name", async () => {
    const { api, puts } = fakeApi({});
    await syncLevels(api, { userId: ID, displayName: defaultDisplayName(ID) }, {});
    expect(puts[0]?.[1]).toEqual({ levels: {} });
  });

  it('answers null when the server fails', async () => {
    const api: ProfileApi = {
      get: () => Promise.reject(new Error('offline')),
      put: () => Promise.reject(new TypeError('Failed to fetch')),
    };
    expect(await syncLevels(api, { userId: ID, displayName: 'A' }, local)).toBeNull();
  });
});
