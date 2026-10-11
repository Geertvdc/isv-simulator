/// <reference types="node" />

/**
 * The prediction check (13g): two headless Chromes play an online round on
 * Garage against a real server and the Vite dev build. The host's page is
 * measured with prediction on and off (`?predict=0`), without lag and with
 * `?lag=100&jitter=20`; it gets back into the same round after each switch
 * through the rejoin ticket (13f), so all four run in one round.
 *
 *   npm run verify:prediction -- [--out=<dir>] [--base=<vite url> --server=<server url>]
 *
 * For each setting it measures:
 * - Key to motion: the time from the keydown event to the first drawn frame
 *   where your own player has moved, over a number of taps.
 * - Correction jitter: every drawn frame of your own player is recorded
 *   (`isvNet.trace`) while walking into walls, along stations, around
 *   corners and dashing. A backward step is a frame where the drawn player
 *   moves against the keys held (more than 0.005 tiles, ignoring the first
 *   200 ms after a key change, when the old velocity still carries it); a
 *   snap is a frame that moves further than a dash can.
 * - Drift: standing still afterwards, the drawn player is where the server
 *   has it.
 * And once, with lag and prediction: a pause pressed while walking (the
 * player stops where the server stopped it), a ticket carried while walking
 * (screenshot), and the guest's view of the host (interpolated, no
 * backward steps).
 *
 * Not part of CI (needs Chrome). Set CHROME if it isn't in the usual place.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DASH_SPEED } from '../src/sim/balance';
import { type Browser, type Page, launchChrome, sleep } from './cdp';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = arg('out') ?? mkdtempSync(join(tmpdir(), 'isv-verify-prediction-'));
mkdirSync(OUT, { recursive: true });
const ROOT = join(import.meta.dirname, '..');

const SERVER_PORT = 2592;
const VITE_PORT = 5192;
const BASE = arg('base') ?? `http://localhost:${VITE_PORT}`;
const SERVER = arg('server') ?? `http://localhost:${SERVER_PORT}`;
const startOwn = arg('base') === undefined;
const TAPS = 10;
/** A drawn frame moving against the keys by more than this (tiles) is a backward step. */
const BACK_EPSILON = 0.005;
/** Frames this soon after a key change are not judged: the old velocity still carries the player. */
const SETTLE_MS = 200;

const checks: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

// ---- Servers ----

const children: ChildProcess[] = [];

function start(command: string, argv: string[], env: Record<string, string>): void {
  const child = spawn(command, argv, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  children.push(child);
}

async function waitForUrl(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }
  throw new Error(`${url} did not come up`);
}

// ---- Page helpers ----

interface Pos {
  x: number;
  y: number;
}

interface TraceFrame {
  t: number;
  players: Record<number, Pos>;
}

interface KeyEvent {
  t: number;
  code: string;
  down: boolean;
}

interface PredictStats {
  reconciles: number;
  corrections: number;
  snaps: number;
  maxErrorTiles: number;
}

async function openGame(page: Page, displayName: string): Promise<void> {
  await page.open(`${BASE}/`, 1500);
  await page.eval(
    `localStorage.setItem('isv-simulator.displayName', ${JSON.stringify(displayName)})`,
  );
  await page.eval(
    `localStorage.setItem('isv-simulator.save', ${JSON.stringify(JSON.stringify({ version: 1, levels: {}, tutorialDone: true }))})`,
  );
  await page.open(`${BASE}/`);
}

async function joinWithCode(page: Page, code: string): Promise<void> {
  await page.key('Enter');
  await page.key('ArrowDown');
  await page.key('ArrowDown');
  await page.key('Enter');
  for (const ch of code) await page.key(`Key${ch}`, ch.toLowerCase(), ch.toLowerCase());
  await page.key('Enter');
}

/** Records key events in the page (same clock as the trace: `performance.now`). */
const LISTEN_KEYS = `(() => {
  if (window.__keysOn) return true;
  window.__keysOn = true;
  window.__keys = [];
  const log = (down) => (e) => { if (!e.repeat) window.__keys.push({ t: performance.now(), code: e.code, down }); };
  addEventListener('keydown', log(true), true);
  addEventListener('keyup', log(false), true);
  return true;
})()`;

async function startRecording(page: Page): Promise<void> {
  await page.eval(`${LISTEN_KEYS}; window.__keys = []; window.isvNet.trace = []; true`);
}

async function stopRecording(page: Page): Promise<{ trace: TraceFrame[]; keys: KeyEvent[] }> {
  return page.eval(`(() => {
    const out = { trace: window.isvNet.trace.map((f) => ({ t: f.t, players: f.players })), keys: window.__keys };
    window.isvNet.trace = null;
    return out;
  })()`);
}

const localPos = (page: Page, id: number): Promise<Pos | null> =>
  page.eval(
    `(() => { const p = window.isvNet?.players?.[${id}]; return p ? { x: p.x, y: p.y } : null; })()`,
  );

/** Where the newest snapshot the page has puts player `id` (the server's word, not drawn). */
const serverPos = (page: Page, id: number): Promise<Pos | null> =>
  page.eval(
    `(() => { const p = window.isvNet?.server?.[${id}]; return p ? { x: p.x, y: p.y } : null; })()`,
  );

const predictStats = (page: Page): Promise<PredictStats | null> =>
  page.eval(`window.isvNet?.predict?.stats ?? null`);

/** Holds `codes` together for `ms`. */
async function holdKeys(page: Page, codes: string[], ms: number): Promise<void> {
  for (const c of codes) await page.down(c);
  await sleep(ms);
  for (const c of [...codes].reverse()) await page.up(c);
}

/** Walks player `id` (keyboard left scheme) to near (x, y) with short taps. */
async function walkTo(page: Page, id: number, x: number, y: number): Promise<Pos | null> {
  for (let i = 0; i < 80; i++) {
    const p = await localPos(page, id);
    if (!p) return null;
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return p;
    const keys: string[] = [];
    if (dx > 0.15) keys.push('KeyD');
    if (dx < -0.15) keys.push('KeyA');
    if (dy > 0.15) keys.push('KeyS');
    if (dy < -0.15) keys.push('KeyW');
    await holdKeys(page, keys, Math.min(120, 20 + 120 * Math.max(Math.abs(dx), Math.abs(dy))));
    await sleep(250);
  }
  return localPos(page, id);
}

// ---- Analysis ----

const DIRS: Record<string, Pos> = {
  KeyW: { x: 0, y: -1 },
  KeyS: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 },
  KeyD: { x: 1, y: 0 },
};

/** Key to motion, in ms, for each tap in the recording. */
function latencies(trace: TraceFrame[], keys: KeyEvent[], id: number): number[] {
  const out: number[] = [];
  for (const k of keys.filter((k) => k.down && DIRS[k.code])) {
    const before = [...trace].reverse().find((f) => f.t <= k.t)?.players[id];
    if (!before) continue;
    const dir = DIRS[k.code] ?? { x: 0, y: 0 };
    const moved = trace.find((f) => {
      const p = f.players[id];
      if (f.t <= k.t || p === undefined) return false;
      return (p.x - before.x) * dir.x + (p.y - before.y) * dir.y > 0.01;
    });
    if (moved) out.push(moved.t - k.t);
  }
  return out;
}

interface Jitter {
  frames: number;
  judged: number;
  backward: number;
  worstBackward: number;
  snaps: number;
  fastestTilesPerS: number;
}

/** Backward steps and snaps of player `id` over a recording (see the top). */
function jitter(trace: TraceFrame[], keys: KeyEvent[], id: number): Jitter {
  const held = new Set<string>();
  let k = 0;
  let lastChange = -Infinity;
  const result: Jitter = {
    frames: trace.length,
    judged: 0,
    backward: 0,
    worstBackward: 0,
    snaps: 0,
    fastestTilesPerS: 0,
  };
  for (let i = 1; i < trace.length; i++) {
    const prev = trace[i - 1];
    const frame = trace[i];
    if (!prev || !frame) continue;
    while (k < keys.length && (keys[k]?.t ?? Infinity) <= frame.t) {
      const e = keys[k++];
      if (!e) continue;
      if (e.down) held.add(e.code);
      else held.delete(e.code);
      lastChange = e.t;
    }
    const a = prev.players[id];
    const b = frame.players[id];
    if (!a || !b) continue;
    const d = { x: b.x - a.x, y: b.y - a.y };
    const dt = (frame.t - prev.t) / 1000;
    const speed = dt > 0 ? Math.hypot(d.x, d.y) / dt : 0;
    result.fastestTilesPerS = Math.max(result.fastestTilesPerS, speed);
    // Faster than a dash, over a frame of at least 8 ms: a jump.
    if (dt > 0.008 && speed > DASH_SPEED * 1.3) result.snaps++;
    if (frame.t - lastChange < SETTLE_MS) continue;
    const dir = [...held].reduce(
      (s, c) => {
        const v = DIRS[c];
        return v ? { x: s.x + v.x, y: s.y + v.y } : s;
      },
      { x: 0, y: 0 },
    );
    const len = Math.hypot(dir.x, dir.y);
    if (len === 0) continue;
    result.judged++;
    const along = (d.x * dir.x + d.y * dir.y) / len;
    if (along < -BACK_EPSILON) {
      result.backward++;
      result.worstBackward = Math.max(result.worstBackward, -along);
    }
  }
  return result;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length === 0
    ? NaN
    : sorted.length % 2
      ? (sorted[mid] ?? NaN)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

// ---- The run ----

const browsers: Browser[] = [];

interface Setting {
  name: string;
  query: string;
  predict: boolean;
  lag: boolean;
}

const SETTINGS: Setting[] = [
  { name: 'no lag, prediction', query: '', predict: true, lag: false },
  { name: 'no lag, predict=0', query: 'predict=0', predict: false, lag: false },
  { name: 'lag 100±20, prediction', query: 'lag=100&jitter=20', predict: true, lag: true },
  {
    name: 'lag 100±20, predict=0',
    query: 'lag=100&jitter=20&predict=0',
    predict: false,
    lag: true,
  },
];

interface Row {
  setting: Setting;
  rttMs: number | null;
  latency: number[];
  course: Jitter;
  stats: PredictStats | null;
  driftTiles: number | null;
}

const rows: Row[] = [];

/** Taps D and A in turn; returns key-to-motion per tap. */
async function measureLatency(page: Page, id: number): Promise<number[]> {
  await startRecording(page);
  for (let i = 0; i < TAPS; i++) {
    // Long enough apart that the last tap's motion is over, even 340 ms late.
    await sleep(900 + ((i * 37) % 60));
    await holdKeys(page, [i % 2 === 0 ? 'KeyD' : 'KeyA'], 250);
  }
  await sleep(600);
  const { trace, keys } = await stopRecording(page);
  return latencies(trace, keys, id);
}

/** Walls, the station row, corners and dashes; returns the drawn frames' jitter. */
async function runCourse(page: Page, id: number, label: string): Promise<Jitter> {
  await walkTo(page, id, 3, 3);
  await sleep(500);
  await startRecording(page);
  await holdKeys(page, ['KeyA'], 1200); // into the left wall
  await holdKeys(page, ['KeyW'], 700); // up into the keyboard station at (1, 1)
  await holdKeys(page, ['KeyW', 'KeyD'], 900); // along the station row, into the gap and out
  await holdKeys(page, ['KeyS'], 500);
  await page.down('KeyD');
  await sleep(300);
  await holdKeys(page, ['ShiftLeft'], 80); // dash right
  await sleep(600);
  await page.up('KeyD');
  await holdKeys(page, ['KeyS', 'KeyD'], 900); // toward the counters' corner
  await page.down('KeyA');
  await sleep(200);
  await holdKeys(page, ['ShiftLeft'], 80); // dash left
  await sleep(300);
  await page.up('KeyA');
  await sleep(600);
  const { trace, keys } = await stopRecording(page);
  writeFileSync(join(OUT, `trace-${label}.json`), JSON.stringify({ trace, keys }));
  return jitter(trace, keys, id);
}

/** Into the room again with `query` on the URL, through the rejoin ticket. */
async function reopen(page: Page, query: string, predict: boolean): Promise<void> {
  await page.open(`${BASE}/${query ? `?${query}` : ''}`, 1000);
  await page.waitFor(
    `window.isvNet?.screen === 'playing' && window.isvNet.predict?.on === ${predict} && window.isvNet.rttMs !== null`,
    'back in the round',
    20_000,
  );
  // Let the clock sync settle (the first pings come fast).
  await sleep(2500);
}

async function main(): Promise<void> {
  if (startOwn) {
    start(process.execPath, ['node_modules/vite-node/dist/cli.mjs', 'server/main.ts'], {
      PORT: String(SERVER_PORT),
      ROUND_SECONDS: '600',
      PROFILE_STORE_PATH: join(OUT, 'profiles.json'),
    });
    start(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--port', String(VITE_PORT), '--strictPort'],
      { VITE_SERVER_URL: SERVER },
    );
  }
  await waitForUrl(`${SERVER}/health`);
  await waitForUrl(BASE);
  console.log(`Server ${SERVER}, game ${BASE}, traces and screenshots in ${OUT}\n`);

  const hostB = await launchChrome(9421, 'host');
  const guestB = await launchChrome(9422, 'guest');
  browsers.push(hostB, guestB);
  const [host, guest] = [hostB.page, guestB.page];
  const shot = (page: Page, name: string): Promise<void> => page.shot(join(OUT, `${name}.png`));
  await Promise.all([openGame(host, 'Ada'), openGame(guest, 'Grace')]);

  await host.key('Enter');
  await host.key('ArrowDown');
  await host.key('Enter');
  const code = await host.waitFor<string>(
    `(() => { const t = document.querySelector('.online-code')?.textContent ?? ''; return t.length === 4 ? t : ''; })()`,
    'a room code',
  );
  await joinWithCode(guest, code);
  await host.waitFor(`document.querySelectorAll('.online-member').length === 2`, 'two members');
  await host.key('Enter');
  await guest.key('Enter');
  await host.waitFor(`document.querySelectorAll('.online-player').length === 2`, 'two players');
  await host.key('KeyE');
  await sleep(800);
  await host.key('Enter');
  await sleep(800);
  await host.key('Enter');
  await host.waitFor(`window.isvNet?.screen === 'playing'`, 'the round', 10_000);
  await guest.waitFor(`window.isvNet?.screen === 'playing'`, 'the round', 10_000);
  // The guest steps out of the course (down, toward the bottom right).
  await holdKeys(guest, ['KeyS'], 500);

  for (const setting of SETTINGS) {
    await reopen(host, setting.query, setting.predict);
    const rttMs = await host.eval<number | null>(`window.isvNet.rttMs`);
    const before = await predictStats(host);
    const latency = await measureLatency(host, 1);
    const course = await runCourse(host, 1, setting.query || 'default');
    await sleep(800);
    const after = await predictStats(host);
    const drawnPos = await localPos(host, 1);
    const truth = await serverPos(host, 1);
    const driftTiles =
      drawnPos && truth ? Math.hypot(drawnPos.x - truth.x, drawnPos.y - truth.y) : null;
    const stats =
      before && after
        ? {
            reconciles: after.reconciles - before.reconciles,
            corrections: after.corrections - before.corrections,
            snaps: after.snaps - before.snaps,
            maxErrorTiles: after.maxErrorTiles,
          }
        : null;
    rows.push({ setting, rttMs, latency, course, stats, driftTiles });
    console.log(
      `${setting.name.padEnd(26)} rtt ${rttMs === null ? '?' : Math.round(rttMs)} ms · key to motion median ${median(latency).toFixed(0)} ms (min ${Math.min(...latency).toFixed(0)}, max ${Math.max(...latency).toFixed(0)}, ${latency.length} taps) · course: ${course.frames} frames, ${course.judged} judged, ${course.backward} backward (worst ${course.worstBackward.toFixed(3)}), ${course.snaps} snaps, fastest ${course.fastestTilesPerS.toFixed(1)} tiles/s · drift ${driftTiles?.toFixed(4) ?? '?'} · ${stats ? `${stats.reconciles} snapshots, ${stats.corrections} corrections, ${stats.snaps} snapped, max error ${stats.maxErrorTiles.toFixed(3)}` : ''}`,
    );
  }

  for (const row of rows) {
    const { setting, latency, course, driftTiles } = row;
    if (setting.predict) {
      const limit = 50;
      check(
        `${setting.name}: own player moves within ${limit} ms of the key`,
        latency.length >= TAPS - 1 && median(latency) < limit,
        `median ${median(latency).toFixed(0)} ms over ${latency.length} taps`,
      );
    }
    check(
      `${setting.name}: no backward steps or snaps walking into walls, around corners and dashing`,
      course.backward === 0 && course.snaps === 0 && course.judged > 100,
      `${course.backward} backward, ${course.snaps} snaps, ${course.judged} frames judged`,
    );
    check(
      `${setting.name}: standing still, drawn where the server has it`,
      driftTiles !== null && driftTiles < 0.01,
      `${driftTiles?.toFixed(4) ?? '?'} tiles off`,
    );
  }
  const on = rows.find((r) => r.setting.lag && r.setting.predict);
  const off = rows.find((r) => r.setting.lag && !r.setting.predict);
  if (on && off) {
    check(
      'with lag, prediction answers the keys much faster than without',
      median(on.latency) * 4 < median(off.latency),
      `${median(on.latency).toFixed(0)} ms vs ${median(off.latency).toFixed(0)} ms`,
    );
  }

  // With lag and prediction (the last setting with prediction): pause, a carried ticket, the guest's view.
  await reopen(host, 'lag=100&jitter=20', true);

  // The guest watches the host walk: interpolated, smooth.
  await walkTo(host, 1, 3, 2);
  await sleep(800);
  await startRecording(guest);
  await startRecording(host);
  await holdKeys(host, ['KeyD'], 900);
  await holdKeys(host, ['KeyA'], 900);
  await sleep(600);
  const guestSaw = await stopRecording(guest);
  await stopRecording(host);
  // Keys are on the host's clock: on the guest, count direction changes and jumps.
  const guestJitter = jitter(guestSaw.trace, [], 1);
  let reversals = 0;
  let lastDx = 0;
  for (let i = 1; i < guestSaw.trace.length; i++) {
    const a = guestSaw.trace[i - 1]?.players[1];
    const b = guestSaw.trace[i]?.players[1];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    if (Math.abs(dx) < 0.001) continue;
    if (lastDx !== 0 && Math.sign(dx) !== Math.sign(lastDx)) reversals++;
    lastDx = dx;
  }
  check(
    "the guest sees the host's walk interpolated, without jitter",
    reversals === 1 && guestJitter.snaps === 0,
    `${reversals} direction changes (1 expected), ${guestJitter.snaps} snaps, ${guestSaw.trace.length} frames`,
  );

  // A pause pressed while walking: the player stops where the server stopped it.
  await walkTo(host, 1, 3, 3);
  await sleep(400);
  await startRecording(host);
  await host.down('KeyD');
  await sleep(500);
  await host.key('Escape');
  await host.waitFor(`window.isvNet?.screen === 'paused'`, 'the pause');
  await sleep(400);
  await host.up('KeyD');
  await sleep(1000);
  const paused = await stopRecording(host);
  const p1 = await localPos(host, 1);
  await sleep(500);
  const p2 = await localPos(host, 1);
  const truth = await serverPos(host, 1);
  const back = paused.trace.reduce((worst, f, i) => {
    const prev = paused.trace[i - 1]?.players[1];
    const now = f.players[1];
    return prev && now ? Math.max(worst, prev.x - now.x) : worst;
  }, 0);
  const still = p1 && p2 ? Math.hypot(p1.x - p2.x, p1.y - p2.y) : NaN;
  const off2 = p2 && truth ? Math.hypot(p2.x - truth.x, p2.y - truth.y) : NaN;
  check(
    'a pause stops your own player where the server did, and it stays there',
    still < 0.001 && off2 < 0.01,
    `glided back at most ${back.toFixed(3)} tiles in a frame, ${off2.toFixed(4)} tiles from the server, moved ${still.toFixed(4)} while paused`,
  );
  await shot(host, 'pause-with-lag');
  await host.key('Escape');
  await host.waitFor(`window.isvNet?.screen === 'playing'`, 'resumed');

  // A ticket carried while walking: drawn with the body (screenshot).
  // Row 2 first, then straight up into the gap under the inbox at (2, 0).
  await walkTo(host, 1, 2, 2.2);
  await walkTo(host, 1, 2, 1.2);
  await holdKeys(host, ['KeyW'], 60);
  await sleep(300);
  const carrying = async (): Promise<boolean> =>
    host.eval<boolean>(
      `!!window.isvNet?.state?.tickets.some((t) => t.location.kind === 'player' && t.location.playerId === 1)`,
    );
  for (let i = 0; i < 20 && !(await carrying()); i++) {
    await host.key('KeyE');
    await sleep(500);
  }
  const carried = await carrying();
  if (carried) {
    // Out of the gap, then walk right with it.
    await holdKeys(host, ['KeyS'], 250);
    await sleep(200);
    await host.down('KeyD');
    await sleep(350);
    await shot(host, 'carrying-with-lag');
    await sleep(300);
    await host.up('KeyD');
  }
  const where = await host.eval<string>(
    `JSON.stringify({ me: window.isvNet.state.players.find((p) => p.id === 1), tickets: window.isvNet.state.tickets.map((t) => t.location) })`,
  );
  check(
    'a ticket is picked up and carried (see carrying-with-lag.png)',
    carried,
    carried ? undefined : where,
  );

  // Walking into a teammate standing still (on another machine).
  if (carried) await holdKeys(host, ['KeyE'], 80); // put it down (or throw it): hands free
  const mate = await serverPos(host, 2);
  if (mate) {
    await walkTo(host, 1, mate.x - 1.6, mate.y);
    await sleep(800);
    const before = await predictStats(host);
    await startRecording(host);
    await holdKeys(host, ['KeyD'], 1200);
    await sleep(500);
    const { trace, keys } = await stopRecording(host);
    const after = await predictStats(host);
    const j = jitter(trace, keys, 1);
    const pushed = await serverPos(host, 2);
    const corrections = (after?.corrections ?? 0) - (before?.corrections ?? 0);
    check(
      'walking into a teammate: no backward steps or snaps',
      j.backward === 0 && j.snaps === 0,
      `${j.backward} backward (worst ${j.worstBackward.toFixed(3)}), ${j.snaps} snaps, ${corrections} corrections (max error so far ${after?.maxErrorTiles.toFixed(3) ?? '?'}), teammate pushed ${pushed ? (pushed.x - mate.x).toFixed(2) : '?'} tiles`,
    );
  }

  // The countdown of a restarted round: nothing moves before it, then the player answers at once.
  await host.key('Escape');
  await host.waitFor(`window.isvNet?.screen === 'paused'`, 'the pause');
  await host.key('ArrowDown');
  await host.key('Enter'); // Restart
  await host.waitFor(`window.isvNet?.screen === 'countdown'`, 'the countdown', 10_000);
  await sleep(300);
  await startRecording(host);
  const spawn = await localPos(host, 1);
  await host.down('KeyD');
  await host.waitFor(`window.isvNet?.screen === 'playing'`, 'the restarted round', 10_000);
  const playingAt = await host.eval<number>(`performance.now()`);
  await sleep(700);
  await host.up('KeyD');
  await sleep(500);
  const restart = await stopRecording(host);
  const moved = restart.trace.find((f) => {
    const p = f.players[1];
    return spawn && p && Math.hypot(p.x - spawn.x, p.y - spawn.y) > 0.01;
  });
  const j = jitter(restart.trace, restart.keys, 1);
  check(
    'the countdown: standing still until the round plays, then no jitter',
    !!moved && moved.t > playingAt - 600 && j.backward === 0 && j.snaps === 0,
    `first moved ${moved ? (moved.t - playingAt).toFixed(0) : '?'} ms after this page saw "playing", ${j.backward} backward, ${j.snaps} snaps`,
  );

  writeFileSync(join(OUT, 'results.json'), JSON.stringify(rows, null, 2));
}

try {
  await main();
} catch (error) {
  check('run', false, error instanceof Error ? error.message : String(error));
} finally {
  for (const b of browsers) b.close();
  for (const child of children) child.kill();
}
const failed = checks.filter((c) => !c.ok);
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed; traces and screenshots in ${OUT}`,
);
process.exit(failed.length > 0 ? 1 : 0);
