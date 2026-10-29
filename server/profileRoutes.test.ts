/** The profile routes: the body parser on its own, then the routes over real HTTP. */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type RunningServer, startGameServer } from './app';
import { MAX_LEVELS_PER_UPDATE, parseProfileUpdate } from './profileRoutes';
import { MemoryProfileStore } from './profileStore';

const garage = { bestStars: 2, bestScore: 50, plays: 3 };

function levels(n: number): Record<string, typeof garage> {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`level-${i}`, garage]));
}

describe('parseProfileUpdate', () => {
  it('takes an empty object as an empty update', () => {
    expect(parseProfileUpdate({})).toEqual({ ok: true, value: {} });
  });

  it('cleans up the display name and keeps valid levels', () => {
    expect(parseProfileUpdate({ displayName: '  Ada   Lovelace ', levels: { garage } })).toEqual({
      ok: true,
      value: { displayName: 'Ada Lovelace', levels: { garage } },
    });
  });

  it('refuses anything but an object', () => {
    for (const raw of [null, undefined, [], 'text', 42, true]) {
      expect(parseProfileUpdate(raw)).toEqual({ ok: false, reason: 'body must be a JSON object' });
    }
  });

  it('refuses empty, too long and non-string names', () => {
    for (const displayName of ['', '   ', 'x'.repeat(25), 42, null, {}]) {
      expect(parseProfileUpdate({ displayName })).toMatchObject({ ok: false });
    }
    expect(parseProfileUpdate({ displayName: 'x'.repeat(24) })).toMatchObject({ ok: true });
  });

  it('refuses levels that are not an object, or too many of them', () => {
    for (const raw of [[], 'garage', 1, null]) {
      expect(parseProfileUpdate({ levels: raw })).toEqual({
        ok: false,
        reason: 'levels must be an object',
      });
    }
    expect(parseProfileUpdate({ levels: levels(MAX_LEVELS_PER_UPDATE) })).toMatchObject({
      ok: true,
    });
    expect(parseProfileUpdate({ levels: levels(MAX_LEVELS_PER_UPDATE + 1) })).toEqual({
      ok: false,
      reason: 'too many levels',
    });
  });

  it('refuses bad level ids, __proto__ included', () => {
    const proto: unknown = JSON.parse(
      '{"levels":{"__proto__":{"bestStars":3,"bestScore":1,"plays":1}}}',
    );
    expect(parseProfileUpdate(proto)).toEqual({ ok: false, reason: 'bad level id "__proto__"' });
    for (const id of ['', 'Garage', 'has space', 'x'.repeat(65), 'constructor!']) {
      expect(parseProfileUpdate({ levels: { [id]: garage } })).toMatchObject({ ok: false });
    }
    expect(parseProfileUpdate({ levels: { ['x'.repeat(64)]: garage } })).toMatchObject({
      ok: true,
    });
  });

  it('drops level records that make no sense, keeping the rest', () => {
    expect(
      parseProfileUpdate({ levels: { garage, broken: { bestStars: 'three' }, empty: null } }),
    ).toEqual({ ok: true, value: { levels: { garage } } });
  });
});

describe('profile routes over HTTP', () => {
  const ID = '6c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
  let server: RunningServer;
  let store: MemoryProfileStore;
  let base: string;

  beforeAll(async () => {
    store = new MemoryProfileStore();
    server = await startGameServer(0, { store });
    base = `http://localhost:${server.port}/profiles`;
  });

  afterAll(async () => {
    await server.close();
  });

  /** A unique profile id per test, so tests don't see each other's profiles. */
  let n = 0;
  const freshId = (): string => ID.replace(/.{4}$/, (n++).toString(16).padStart(4, '0'));

  const put = (id: string, body: string, type = 'application/json'): Promise<Response> =>
    fetch(`${base}/${id}`, { method: 'PUT', headers: { 'content-type': type }, body });

  async function expectError(res: Promise<Response>, status: number, error: string) {
    const r = await res;
    expect(r.status).toBe(status);
    expect(await r.json()).toEqual({ error });
  }

  it('answers 404 for an unknown profile', async () => {
    await expectError(fetch(`${base}/${freshId()}`), 404, 'no such profile');
  });

  it('refuses ids that are not UUID v4s, or not even decodable', async () => {
    for (const id of [
      'not-a-uuid',
      ID.replace('-4c6d-', '-1c6d-'),
      `${ID}0`,
      '%E0%A4%A',
      encodeURIComponent(`${ID}/x`),
    ]) {
      await expectError(fetch(`${base}/${id}`), 400, 'not a user id');
      await expectError(put(id, '{}'), 400, 'not a user id');
    }
    expect(await store.get(ID)).toBeNull();
  });

  it('refuses malformed and non-object bodies without creating a profile', async () => {
    const id = freshId();
    expect((await put(id, '{"levels": {')).status).toBe(400);
    for (const body of ['', 'null', '[]', '"text"', '42']) {
      await expectError(put(id, body), 400, 'body must be a JSON object');
    }
    await expectError(put(id, '{}', 'text/plain'), 400, 'body must be a JSON object');
    expect(await store.get(id)).toBeNull();
  });

  it('refuses oversized names and level lists', async () => {
    const id = freshId();
    await expectError(
      put(id, JSON.stringify({ displayName: 'x'.repeat(100_000) })),
      400,
      'displayName must be 1 to 24 characters',
    );
    await expectError(
      put(id, JSON.stringify({ levels: levels(MAX_LEVELS_PER_UPDATE + 1) })),
      400,
      'too many levels',
    );
    expect(await store.get(id)).toBeNull();
  });

  it('refuses a __proto__ level id', async () => {
    const id = freshId();
    await expectError(
      put(id, '{"levels":{"__proto__":{"bestStars":3,"bestScore":1,"plays":1}}}'),
      400,
      'bad level id "__proto__"',
    );
    expect(await store.get(id)).toBeNull();
    expect(({} as Record<string, unknown>).bestStars).toBeUndefined();
  });

  it('creates a profile with a default name, then reads it back by id in any case', async () => {
    const id = freshId();
    const created = await put(id.toUpperCase(), JSON.stringify({ levels: { garage } }));
    expect(created.status).toBe(200);
    const profile = (await created.json()) as Record<string, unknown>;
    expect(profile).toMatchObject({ userId: id, levels: { garage } });
    expect(profile.displayName).toMatch(/\S/);
    expect(profile.createdAt).toBe(profile.updatedAt);
    const got = await fetch(`${base}/${id.toUpperCase()}`);
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual(profile);
  });

  it('merges updates: the best of each level wins, and the name changes only when given', async () => {
    const id = freshId();
    await put(id, JSON.stringify({ displayName: 'Ada', levels: { garage } }));
    const merged = await put(
      id,
      JSON.stringify({
        levels: { garage: { bestStars: 3, bestScore: 10, plays: 1 }, attic: garage },
      }),
    );
    expect(await merged.json()).toMatchObject({
      displayName: 'Ada',
      levels: { garage: { bestStars: 3, bestScore: 50, plays: 3 }, attic: garage },
    });
    const renamed = await put(id, JSON.stringify({ displayName: 'Grace' }));
    expect(await renamed.json()).toMatchObject({ displayName: 'Grace', levels: { attic: garage } });
  });
});
