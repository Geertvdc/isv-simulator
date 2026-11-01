/// <reference types="node" />

/**
 * Renders draft maps (`maps/drafts/`) in the real 3D game for the level
 * redesign doc (phase 23), as `docs/plan/images/level-redesign/<id>-3d.webp`.
 *
 *   npm run draft-shots -- <level-id> [<level-id> …]
 *   npm run draft-shots -- --drafts      every draft
 *   (reorg phases `<id>.phaseN.txt` render too, as `<id>-phaseN-3d.webp`)
 *
 * Starts vite in this checkout on a free port and takes the level's scene
 * shot with `scripts/screenshots.ts`, loading the draft with the dev-only
 * greybox loader (`?scene=level-<id>&draft=<id>[&phase=N]`, see
 * `src/render/scene/draftLevel.ts`). Uncommitted draft edits render too. The
 * screenshot script always uses Chrome debug port 9333, so runs (from any
 * worktree) wait for each other on a lock dir. Needs Chrome, like
 * `npm run screenshots`.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draftQuery, levelShotName, renderFileName, shotIds } from './mapTools/draftShots';
import { SKETCH_DIR, draftIds, draftPhases } from './mapTools/mapFiles';

// A fixed path (not `os.tmpdir()`) so every checkout and session agrees on it.
const LOCK_DIR = '/tmp/isv-draft-shots.lock';
const LOCK_WAIT_MS = 10 * 60_000;
const VITE_READY_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Cleanup: runs once, on success, errors and Ctrl+C ----

// Children run in their own process group (detached) so cleanup can stop the
// whole tree, including the headless Chrome that screenshots.ts starts.
const children = new Set<ChildProcess>();
let workDir: string | null = null;
let haveLock = false;

function stopGroup(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Group already gone.
  }
}

function cleanup(): void {
  for (const child of children) stopGroup(child);
  children.clear();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  workDir = null;
  if (haveLock) rmSync(LOCK_DIR, { recursive: true, force: true });
  haveLock = false;
}

process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    cleanup();
    process.exit(130);
  });
}

// ---- Lock ----

function lockOwnerAlive(): boolean {
  try {
    const pid = Number(readFileSync(join(LOCK_DIR, 'pid'), 'utf8'));
    if (!pid) return true;
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: alive but someone else's. ENOENT on the pid file: just created, give it time.
    const code = (e as NodeJS.ErrnoException).code;
    return code === 'EPERM' || code === 'ENOENT';
  }
}

async function acquireLock(): Promise<void> {
  const until = Date.now() + LOCK_WAIT_MS;
  let told = false;
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      haveLock = true;
      writeFileSync(join(LOCK_DIR, 'pid'), String(process.pid));
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    if (!lockOwnerAlive()) {
      console.log(`removing stale lock ${LOCK_DIR}`);
      rmSync(LOCK_DIR, { recursive: true, force: true });
      continue;
    }
    if (Date.now() > until) throw new Error(`Timed out waiting for ${LOCK_DIR}`);
    if (!told) console.log(`waiting for another draft-shots run (${LOCK_DIR})…`);
    told = true;
    await sleep(1000);
  }
}

// ---- Vite, screenshots ----

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => {
        done(port);
      });
    });
  });
}

async function startVite(port: number): Promise<string> {
  const base = `http://localhost:${port}`;
  const child = spawn(
    join('node_modules', '.bin', 'vite'),
    ['--port', String(port), '--strictPort'],
    { env: { ...process.env, PORT: String(port) }, stdio: 'ignore', detached: true },
  );
  children.add(child);
  const until = Date.now() + VITE_READY_MS;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw new Error(`vite exited with code ${child.exitCode}`);
    try {
      if ((await fetch(base)).ok) return base;
    } catch {
      // Not listening yet.
    }
    await sleep(300);
  }
  throw new Error(`vite did not answer on ${base}`);
}

function run(command: string, args: readonly string[]): Promise<number> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: 'inherit', detached: true });
    children.add(child);
    child.once('error', fail);
    child.once('exit', (code) => {
      children.delete(child);
      done(code ?? 1);
    });
  });
}

async function shoot(base: string, id: string, phase: number, out: string): Promise<string> {
  const code = await run(join('node_modules', '.bin', 'vite-node'), [
    'scripts/screenshots.ts',
    '--',
    `--base=${base}`,
    `--only=${levelShotName(id)}`,
    `--query=${draftQuery(id, phase)}`,
    `--out=${out}`,
  ]);
  const shot = join(out, `${levelShotName(id)}.webp`);
  if (code !== 0 || !existsSync(shot)) throw new Error(`screenshot of ${id} phase ${phase} failed`);
  mkdirSync(SKETCH_DIR, { recursive: true });
  const target = join(SKETCH_DIR, renderFileName(id, phase));
  copyFileSync(shot, target);
  rmSync(shot);
  return target;
}

async function main(): Promise<void> {
  const request = shotIds(process.argv.slice(2), draftIds());
  if ('error' in request) {
    console.log(request.error);
    console.log('Usage: npm run draft-shots -- <level-id> [<level-id> …] | --drafts');
    process.exitCode = 1;
    return;
  }
  await acquireLock();
  workDir = mkdtempSync(join(tmpdir(), 'isv-draft-shots-'));
  const base = await startVite(await freePort());
  for (const id of request.ids) {
    for (const { phase } of draftPhases(id)) {
      console.log(`wrote ${await shoot(base, id, phase, workDir)}`);
    }
  }
}

try {
  await main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  cleanup();
}
