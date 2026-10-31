/// <reference types="node" />

/**
 * Renders draft maps (`maps/drafts/`) in the real 3D game for the level
 * redesign doc (phase 23), as `docs/plan/images/level-redesign/<id>-3d.webp`.
 *
 *   npm run draft-shots -- <level-id> [<level-id> …]
 *   npm run draft-shots -- --drafts      every draft
 *
 * Works in a throwaway git worktree (detached at HEAD, `node_modules`
 * symlinked in): copies each draft over its live `maps/level-NN-*.txt`, with
 * stand-ins for chars the game can't read yet, starts vite there on a free
 * port and takes the level's shot with `scripts/screenshots.ts`. The
 * screenshot script always uses Chrome debug port 9333, so runs (from any
 * worktree) wait for each other on a lock dir. Needs Chrome, like
 * `npm run screenshots`.
 */

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { levelShotName, renderFileName, shotIds } from './mapTools/draftShots';
import { toStandIns } from './mapTools/mapChars';
import { SKETCH_DIR, currentMapPath, draftIds, draftMapPath } from './mapTools/mapFiles';

// A fixed path (not `os.tmpdir()`) so every checkout and session agrees on it.
const LOCK_DIR = '/tmp/isv-draft-shots.lock';
const LOCK_WAIT_MS = 10 * 60_000;
const VITE_READY_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Cleanup: runs once, on success, errors and Ctrl+C ----

// Children run in their own process group (detached) so cleanup can stop the
// whole tree, including the headless Chrome that screenshots.ts starts.
const children = new Set<ChildProcess>();
let worktree: string | null = null;
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
  if (worktree) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktree], { stdio: 'ignore' });
    } catch {
      // Already gone; prune below forgets it.
    }
    execFileSync('git', ['worktree', 'prune'], { stdio: 'ignore' });
    worktree = null;
  }
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

// ---- Worktree, vite, screenshots ----

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

/** A detached worktree at HEAD with the drafts in place of the live maps. */
function makeWorktree(ids: readonly string[]): string {
  workDir = mkdtempSync(join(tmpdir(), 'isv-draft-shots-'));
  const dir = join(workDir, 'worktree');
  execFileSync('git', ['worktree', 'add', '--detach', dir, 'HEAD'], { stdio: 'ignore' });
  worktree = dir;
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
  for (const id of ids) {
    const live = currentMapPath(id);
    if (!live) throw new Error(`No live map file for ${id}`);
    // Drafts come from this checkout, so uncommitted edits are rendered too.
    const draft = readFileSync(draftMapPath(id), 'utf8');
    writeFileSync(join(dir, live), toStandIns(draft));
  }
  return dir;
}

async function startVite(dir: string, port: number): Promise<string> {
  const base = `http://localhost:${port}`;
  const child = spawn(
    join(dir, 'node_modules', '.bin', 'vite'),
    ['--port', String(port), '--strictPort'],
    { cwd: dir, env: { ...process.env, PORT: String(port) }, stdio: 'ignore', detached: true },
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

function run(command: string, args: readonly string[], cwd: string): Promise<number> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', detached: true });
    children.add(child);
    child.once('error', fail);
    child.once('exit', (code) => {
      children.delete(child);
      done(code ?? 1);
    });
  });
}

async function shoot(dir: string, base: string, id: string, out: string): Promise<string> {
  const code = await run(
    join(dir, 'node_modules', '.bin', 'vite-node'),
    [
      'scripts/screenshots.ts',
      '--',
      `--base=${base}`,
      `--only=${levelShotName(id)}`,
      `--out=${out}`,
    ],
    dir,
  );
  const shot = join(out, `${levelShotName(id)}.webp`);
  if (code !== 0 || !existsSync(shot)) throw new Error(`screenshot of ${id} failed`);
  mkdirSync(SKETCH_DIR, { recursive: true });
  const target = join(SKETCH_DIR, renderFileName(id));
  copyFileSync(shot, target);
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
  const dir = makeWorktree(request.ids);
  const base = await startVite(dir, await freePort());
  const out = join(workDir ?? dir, 'shots');
  for (const id of request.ids) console.log(`wrote ${await shoot(dir, base, id, out)}`);
}

try {
  await main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  cleanup();
}
