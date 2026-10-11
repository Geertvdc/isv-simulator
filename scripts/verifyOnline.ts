/// <reference types="node" />

/**
 * The online smoke test: three headless Chromes (separate profiles, so
 * three user ids) play an online session against a real server and the
 * Vite dev build, including what goes wrong on real networks. Not part of
 * CI (it needs Chrome and takes about two and a half minutes).
 *
 *   npm run verify:online -- [--out=<dir>] [--base=<vite url> --server=<server url>]
 *
 * Without `--base`/`--server` it starts its own server (rounds of
 * `ROUND_SECONDS`=20) and Vite on free-ish ports and stops them after.
 * Set CHROME to the Chrome binary if it isn't in the usual place.
 *
 * What it checks, in order:
 * 1. Host online, join with the code, the guest's first Esc in the lobby
 *    only asks, both join a player, the guest's level-select hint says the
 *    host picks, the host starts Garage, both walk.
 * 2. The guest's network goes away for 5 s mid-round: the guest shows
 *    "Reconnecting…", the host sees "Grace reconnecting…", the guest comes
 *    back into the same round and walks again.
 * 3. The guest reloads the page mid-round: back in the same round with
 *    their player, walking.
 * 4. A third browser joins mid-round: it watches ("you're watching").
 * 5. The host leaves mid-round: the guest is host and pauses and resumes,
 *    the round ends, the late joiner joins on the results, the guest starts
 *    the next round and the late joiner plays in it.
 * 6. The late joiner is offline past the grace period: they're told they
 *    couldn't get back in, go back to the title, and the room lets them go.
 * 7. The host's profile got the round they left.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NET_RECONNECT_GRACE_MS } from '../src/sim/balance';
import { type Browser, type Page, launchChrome, sleep } from './cdp';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = arg('out') ?? mkdtempSync(join(tmpdir(), 'isv-verify-online-'));
mkdirSync(OUT, { recursive: true });
const ROOT = join(import.meta.dirname, '..');

const SERVER_PORT = 2591;
const VITE_PORT = 5191;
const BASE = arg('base') ?? `http://localhost:${VITE_PORT}`;
const SERVER = arg('server') ?? `http://localhost:${SERVER_PORT}`;
const startOwn = arg('base') === undefined;

const checks: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/** Runs `step`; a failure is recorded and the run goes on with the next step. */
async function step(name: string, run: () => Promise<boolean | string>): Promise<boolean> {
  try {
    const result = await run();
    check(name, result === true, typeof result === 'string' ? result : undefined);
    return result === true;
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
    return false;
  }
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

/** The drawn round, from the dev debug handle (`window.isvNet`). */
interface Drawn {
  screen: string | null;
  players: Record<number, { x: number; y: number }>;
  count: number;
}

const drawn = (page: Page): Promise<Drawn | null> =>
  page.eval(`(() => {
    const n = window.isvNet;
    if (!n || !n.state) return null;
    return { screen: n.screen, players: JSON.parse(JSON.stringify(n.players)), count: n.state.players.length };
  })()`);

const visible = (page: Page, selector: string): Promise<boolean> =>
  page.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    return !!el && !el.hidden && el.offsetParent !== null;
  })()`);

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
  await page.key('Enter'); // wake the title
  await page.key('ArrowDown');
  await page.key('ArrowDown');
  await page.key('Enter'); // Join online
  for (const ch of code) await page.key(`Key${ch}`, ch.toLowerCase(), ch.toLowerCase());
  await page.key('Enter');
}

/**
 * Walks player `id` on `driver`'s keyboard with `key` and checks that
 * `watcher` sees that player move.
 */
async function walks(driver: Page, watcher: Page, id: number, key: string): Promise<string | true> {
  const before = (await drawn(watcher))?.players[id];
  if (!before) return `player ${id} not drawn on ${watcher.name}`;
  await driver.hold(key, 500);
  await sleep(800);
  const after = (await drawn(watcher))?.players[id];
  if (!after) return `player ${id} gone on ${watcher.name}`;
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  return moved > 0.5 ? true : `moved only ${moved.toFixed(2)} tiles`;
}

/** Presses Enter on `driver` until `watcher` plays a round (results → next round, intro card). */
async function startNextRound(driver: Page, watcher: Page): Promise<boolean> {
  for (let i = 0; i < 12; i++) {
    const d = await drawn(watcher);
    if (d?.screen === 'playing') return true;
    if (d?.screen !== 'countdown') await driver.key('Enter');
    await sleep(800);
  }
  return false;
}

// ---- The run ----

const browsers: Browser[] = [];

async function main(): Promise<void> {
  if (startOwn) {
    start(process.execPath, ['node_modules/vite-node/dist/cli.mjs', 'server/main.ts'], {
      PORT: String(SERVER_PORT),
      ROUND_SECONDS: '20',
      PROFILE_STORE_PATH: join(OUT, 'profiles.json'),
    });
    start(
      process.execPath,
      ['node_modules/vite/bin/vite.js', '--port', String(VITE_PORT), '--strictPort'],
      {
        VITE_SERVER_URL: SERVER,
      },
    );
  }
  await waitForUrl(`${SERVER}/health`);
  await waitForUrl(BASE);
  console.log(`Server ${SERVER}, game ${BASE}, screenshots in ${OUT}\n`);

  const hostB = await launchChrome(9411, 'host');
  const guestB = await launchChrome(9412, 'guest');
  const lateB = await launchChrome(9413, 'late');
  browsers.push(hostB, guestB, lateB);
  const [host, guest, late] = [hostB.page, guestB.page, lateB.page];
  const shot = (page: Page, name: string): Promise<void> => page.shot(join(OUT, `${name}.png`));
  await Promise.all([openGame(host, 'Ada'), openGame(guest, 'Grace'), openGame(late, 'Linus')]);

  // 1. Lobby and a round.
  let code = '';
  const inRound = await step('host and guest start a round together', async () => {
    await host.key('Enter');
    await host.key('ArrowDown');
    await host.key('Enter'); // Host online
    code = await host.waitFor<string>(
      `(() => { const t = document.querySelector('.online-code')?.textContent ?? ''; return t.length === 4 ? t : ''; })()`,
      'a room code',
    );
    await joinWithCode(guest, code);
    await host.waitFor(`document.querySelectorAll('.online-member').length === 2`, 'two members');
    // One Esc in the lobby only asks.
    await guest.key('Escape');
    const asked = await visible(guest, '.online-lobby .screen-hint.armed');
    const stayed = await visible(guest, '.online-lobby');
    check('one Esc in the online lobby asks before leaving', asked && stayed);
    await host.key('Enter');
    await guest.key('Enter');
    await host.waitFor(`document.querySelectorAll('.online-player').length === 2`, 'two players');
    await shot(host, '01-lobby');
    await host.key('KeyE'); // level select
    await guest.waitFor(
      `document.body.innerText.includes('The host picks the level')`,
      'guest hint',
    );
    check('the guest level select says the host picks', true);
    await host.key('Enter'); // Garage: intro card
    await sleep(800);
    await host.key('Enter'); // countdown
    await host.waitFor(`window.isvNet?.screen === 'playing'`, 'the round', 8000);
    await guest.waitFor(`window.isvNet?.screen === 'playing'`, 'the round', 8000);
    const walked = await walks(guest, host, 2, 'KeyS');
    return walked;
  });
  if (!inRound) return;

  // 2. The guest's network goes away for a few seconds.
  await step('a guest offline for 5 s comes back into the same round', async () => {
    await guest.offline(true);
    await guest.waitFor(
      `!!document.querySelector('.online-banner:not([hidden])')`,
      'the reconnecting banner',
    );
    check('the dropped guest shows "Reconnecting…"', true);
    const away = await host
      .waitFor<string>(
        `(() => { const t = document.querySelector('.online-bar-away')?.textContent ?? ''; return t.includes('Grace') ? t : ''; })()`,
        'Grace reconnecting on the host',
        12_000,
      )
      .catch(() => '');
    check('the host sees "Grace reconnecting…"', away !== '', away || 'not shown');
    await shot(guest, '02-guest-offline');
    await shot(host, '02-host-sees-guest-away');
    await sleep(2000);
    await guest.offline(false);
    await guest.waitFor(
      `!document.querySelector('.online-banner:not([hidden])') && window.isvNet?.screen === 'playing'`,
      'the guest back in the round',
      25_000,
    );
    await host.waitFor(
      `(document.querySelector('.online-bar-away')?.textContent ?? '') === ''`,
      'the host seeing the guest back',
    );
    return walks(guest, host, 2, 'KeyD');
  });

  // 3. The guest reloads the page.
  await step('a guest who reloads the page comes back into the same round', async () => {
    const ticket = await guest.eval<string | null>(
      `sessionStorage.getItem('isv-simulator.rejoin')`,
    );
    if (!ticket) return 'no rejoin ticket in sessionStorage';
    await guest.send('Page.reload');
    await guest.waitFor(
      `window.isvNet?.screen === 'playing' && window.isvNet.state?.players.length === 2`,
      'the round after the reload',
      15_000,
    );
    await shot(guest, '03-guest-after-reload');
    return walks(guest, host, 2, 'KeyA');
  });

  // 4. A third browser joins while the round runs.
  await step('someone joining mid-round watches', async () => {
    await joinWithCode(late, code);
    const watching = await late.waitFor<string>(
      `(() => { const t = document.querySelector('.online-bar-waiting')?.textContent ?? ''; return t.includes('watching') ? t : ''; })()`,
      'the spectator line',
    );
    const d = await drawn(late);
    await shot(late, '04-late-joiner-watches');
    return d?.count === 2 ? true : `${watching}; drawn ${JSON.stringify(d)}`;
  });

  // 5. The host leaves mid-round.
  const hostId = await host.eval<string>(`localStorage.getItem('isv-simulator.userId')`);
  await step('the host leaves mid-round; the guest can pause, resume and finish', async () => {
    await host.eval(`document.querySelector('.online-bar-leave').click()`);
    await host.waitFor(`!document.querySelector('.online-bar:not([hidden])')`, 'the host out');
    await sleep(500);
    await guest.key('Escape');
    await guest.waitFor(`window.isvNet?.screen === 'paused'`, 'the guest pausing');
    const lateSees = await late.waitFor<string>(
      `(() => { const t = document.querySelector('.online-bar-waiting')?.textContent ?? ''; return t.includes('Paused') ? t : ''; })()`,
      'the late joiner seeing the pause',
    );
    await shot(guest, '05-guest-host-paused');
    await guest.key('Escape');
    await guest.waitFor(`window.isvNet?.screen === 'playing'`, 'the guest resuming');
    await guest.waitFor(`window.isvNet?.screen === 'results'`, 'the results', 40_000);
    await late.waitFor(`window.isvNet?.screen === 'results'`, 'the results on the late joiner');
    await shot(guest, '06-results');
    return lateSees.includes('Paused') ? true : lateSees;
  });

  await step('the late joiner joins on the results and plays the next round', async () => {
    await sleep(1500);
    await late.waitFor(
      `(document.querySelector('.online-bar-waiting')?.textContent ?? '').includes('join the next round')`,
      'the join hint',
    );
    await late.key('Enter');
    await late.waitFor(
      `!(document.querySelector('.online-bar-waiting')?.textContent ?? '').includes('join the next round')`,
      'the late joiner having a player',
    );
    if (!(await startNextRound(guest, late))) return 'the next round did not start';
    const d = await drawn(late);
    if (d?.count !== 2) return `players in the next round: ${d?.count ?? 'none'}`;
    await shot(late, '07-late-joiner-plays');
    return walks(late, guest, 2, 'KeyS');
  });

  await step('someone away longer than the grace period is told, and removed', async () => {
    await late.offline(true);
    const error = await late.waitFor<string>(
      `(() => { const s = document.querySelector('.online-status'); return s && s.dataset.status === 'closed' && s.offsetParent !== null ? s.textContent : ''; })()`,
      'the reconnect-failed message',
      NET_RECONNECT_GRACE_MS + 15_000,
    );
    await late.offline(false);
    await shot(late, '08-late-joiner-gave-up');
    await guest.waitFor(
      `!(document.querySelector('.online-bar-away')?.textContent ?? '').includes('Linus')`,
      'Linus gone on the guest',
    );
    await late.key('Escape');
    const title = await late.waitFor<boolean>(
      `!document.querySelector('.online-lobby:not([hidden])')`,
      'the title',
    );
    return error.includes("Couldn't get back") && title ? true : error;
  });

  await step("the round the host left counts in the host's profile", async () => {
    const res = await fetch(`${SERVER}/profiles/${hostId}`);
    if (!res.ok) return `profile answered ${res.status}`;
    const profile = (await res.json()) as { levels?: Record<string, { plays: number }> };
    const plays = profile.levels?.garage?.plays ?? 0;
    return plays >= 1 ? true : `garage plays: ${plays}`;
  });
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
  `\n${checks.length - failed.length}/${checks.length} checks passed; screenshots in ${OUT}`,
);
process.exit(failed.length > 0 ? 1 : 0);
