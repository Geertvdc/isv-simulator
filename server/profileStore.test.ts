import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultDisplayName } from '../src/flow/identity';
import {
  DEFAULT_PROFILE_STORE_PATH,
  JsonFileProfileStore,
  MemoryProfileStore,
  type ProfileStore,
} from './profileStore';

const ID_A = '3f2b8c1e-9d4a-4e6b-8a1c-2b3c4d5e6f70';
const ID_B = 'a1b2c3d4-e5f6-4a7b-9c8d-0e1f2a3b4c5d';
const T1 = '2026-10-11T10:00:00.000Z';
const T2 = '2026-10-11T11:00:00.000Z';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'isv-profiles-'));
  path = join(dir, 'nested', 'profiles.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const stores: [string, () => ProfileStore][] = [
  ['memory', () => new MemoryProfileStore()],
  ['json file', () => new JsonFileProfileStore(path)],
];

describe.each(stores)('%s store', (_name, make) => {
  it('has no profile for an unknown user', async () => {
    expect(await make().get(ID_A)).toBeNull();
  });

  it('creates a profile on the first merge', async () => {
    const store = make();
    const levels = { garage: { bestStars: 2, bestScore: 80, plays: 3 } };
    const profile = await store.merge(ID_A, { levels }, T1);
    expect(profile).toEqual({
      userId: ID_A,
      displayName: defaultDisplayName(ID_A),
      levels,
      createdAt: T1,
      updatedAt: T1,
    });
    expect(await store.get(ID_A)).toEqual(profile);
    expect(await store.get(ID_B)).toBeNull();
  });

  it('merges: best stars and score win, plays is the larger count, the name is replaced', async () => {
    const store = make();
    await store.merge(ID_A, { levels: { garage: { bestStars: 3, bestScore: 50, plays: 4 } } }, T1);
    const merged = await store.merge(
      ID_A,
      {
        displayName: ' Grace ',
        levels: {
          garage: { bestStars: 1, bestScore: 90, plays: 2 },
          'open-plan': { bestStars: 1, bestScore: 10, plays: 1 },
        },
      },
      T2,
    );
    expect(merged.displayName).toBe('Grace');
    expect(merged.levels).toEqual({
      garage: { bestStars: 3, bestScore: 90, plays: 4 },
      'open-plan': { bestStars: 1, bestScore: 10, plays: 1 },
    });
    expect(merged.createdAt).toBe(T1);
    expect(merged.updatedAt).toBe(T2);
  });

  it('records a round result', async () => {
    const store = make();
    await store.recordResult(ID_A, 'garage', { score: 40, stars: 2 }, T1, 'Ada');
    const profile = await store.recordResult(ID_A, 'garage', { score: 20, stars: 3 }, T2);
    expect(profile.displayName).toBe('Ada');
    expect(profile.levels).toEqual({ garage: { bestStars: 3, bestScore: 40, plays: 2 } });
  });

  it('hands out copies', async () => {
    const store = make();
    const profile = await store.merge(ID_A, {}, T1);
    profile.levels.garage = { bestStars: 3, bestScore: 1, plays: 1 };
    expect((await store.get(ID_A))?.levels).toEqual({});
  });

  it('lands every one of many concurrent writes', async () => {
    const store = make();
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        store.recordResult(i % 2 ? ID_A : ID_B, 'garage', { score: i, stars: 1 }, T1),
      ),
    );
    expect((await store.get(ID_A))?.levels.garage).toEqual({
      bestStars: 1,
      bestScore: 49,
      plays: 25,
    });
    expect((await store.get(ID_B))?.levels.garage).toEqual({
      bestStars: 1,
      bestScore: 48,
      plays: 25,
    });
  });
});

describe('JsonFileProfileStore', () => {
  it('keeps profiles across restarts', async () => {
    await new JsonFileProfileStore(path).merge(ID_A, { displayName: 'Linus' }, T1);
    const reloaded = await new JsonFileProfileStore(path).get(ID_A);
    expect(reloaded?.displayName).toBe('Linus');
  });

  it('writes plain JSON and leaves no temp file behind', async () => {
    const store = new JsonFileProfileStore(path);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.recordResult(ID_A, 'garage', { score: i, stars: 1 }, T1),
      ),
    );
    const data = JSON.parse(await readFile(path, 'utf8')) as {
      version: number;
      profiles: Record<string, { levels: Record<string, { plays: number }> }>;
    };
    expect(data.version).toBe(1);
    expect(data.profiles[ID_A]?.levels.garage?.plays).toBe(20);
    expect(await readdir(join(dir, 'nested'))).toEqual(['profiles.json']);
    expect((await new JsonFileProfileStore(path).get(ID_A))?.levels.garage?.plays).toBe(20);
  });

  it('backs up a corrupt file and starts empty', async () => {
    const store = new JsonFileProfileStore(path, () => new Date(T1));
    await store.merge(ID_A, {}, T1);
    await writeFile(path, '{"profiles": {', 'utf8');
    const fresh = new JsonFileProfileStore(path, () => new Date(T1));
    expect(await fresh.get(ID_A)).toBeNull();
    const files = await readdir(join(dir, 'nested'));
    const backup = files.find((f) => f.startsWith('profiles.json.corrupt-'));
    expect(backup).toBeDefined();
    expect(await readFile(join(dir, 'nested', backup ?? ''), 'utf8')).toBe('{"profiles": {');
    await fresh.merge(ID_B, {}, T2);
    expect((await new JsonFileProfileStore(path).get(ID_B))?.userId).toBe(ID_B);
  });

  it('skips broken profiles in an otherwise good file', async () => {
    await new JsonFileProfileStore(path).merge(ID_A, {}, T1);
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        profiles: {
          [ID_A]: { displayName: 42, levels: { garage: { bestStars: 2 }, bad: 'x' } },
          [ID_B]: 'nope',
        },
      }),
      'utf8',
    );
    const store = new JsonFileProfileStore(path);
    expect(await store.get(ID_A)).toEqual({
      userId: ID_A,
      displayName: defaultDisplayName(ID_A),
      levels: { garage: { bestStars: 2, bestScore: 0, plays: 1 } },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
    expect(await store.get(ID_B)).toBeNull();
  });
});

describe('the default profile file', () => {
  it('sits outside every folder `npm run server` watches', async () => {
    // A profile write inside a watched folder restarts the dev server, which
    // drops every room ("The server is restarting").
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const watched = [...(pkg.scripts.server ?? '').matchAll(/--watch-path=(\S+)/g)].map(
      (m) => m[1],
    );
    expect(watched.length).toBeGreaterThan(0);
    for (const folder of watched) {
      expect(DEFAULT_PROFILE_STORE_PATH.startsWith(`${folder}/`)).toBe(false);
    }
  });
});
