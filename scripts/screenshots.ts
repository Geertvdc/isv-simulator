/// <reference types="node" />

/**
 * Takes the screenshots in `docs/game/images/`. Drives headless Chrome over
 * the DevTools protocol: menus with key presses, moments of a round with
 * `?scene=<id>` (built in `src/sim/scenes.ts`, frozen once they're there).
 *
 * Usage: start `npm run dev`, then
 *   npm run screenshots -- [--base=http://localhost:5173] [--only=pipeline]
 * `--only` takes shots whose name contains the text. Set CHROME to the
 * Chrome binary if it isn't in the usual place.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SCENES } from '../src/sim/scenes';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const BASE = arg('base') ?? 'http://localhost:5173';
const ONLY = arg('only');
const OUT = join(import.meta.dirname, '..', 'docs', 'game', 'images');
const WIDTH = 1440;
const HEIGHT = 810;
const PORT = 9333;

const CHROME_PATHS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- A tiny DevTools protocol client ----

interface CdpMessage {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message: string };
}

class Page {
  private nextId = 0;
  private readonly pending = new Map<number, (m: CdpMessage) => void>();

  constructor(private readonly ws: WebSocket) {
    ws.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as CdpMessage;
      if (msg.id === undefined) return;
      this.pending.get(msg.id)?.(msg);
      this.pending.delete(msg.id);
    };
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) => {
        if (m.error) reject(new Error(`${method}: ${m.error.message}`));
        else resolve(m.result ?? {});
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates `expression` in the page and returns its value. */
  async eval<T>(expression: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    const details = r.exceptionDetails as { exception?: { description?: string } } | undefined;
    if (details) throw new Error(details.exception?.description ?? `Failed: ${expression}`);
    return (r.result as { value: T }).value;
  }

  /** Loads a page; `settle` waits for boot, asset loading and the first frames. */
  async open(path: string, settle = 2500): Promise<void> {
    await this.send('Page.navigate', { url: BASE + path });
    await sleep(settle);
  }

  /** Presses and releases a key, held long enough for a frame to see it. */
  async key(code: string, key = code): Promise<void> {
    const vk = VIRTUAL_KEYS[code] ?? 0;
    const base = { code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await this.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await sleep(80);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(250);
  }

  async shot(name: string, clip?: { x: number; y: number; width: number; height: number }) {
    const r = await this.send('Page.captureScreenshot', {
      format: 'webp',
      quality: 75,
      ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
    });
    const file = join(OUT, `${name}.webp`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(r.data as string, 'base64'));
    console.log(`  ${name}.png`);
  }
}

const VIRTUAL_KEYS: Readonly<Record<string, number>> = {
  Enter: 13,
  Escape: 27,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  KeyE: 69,
};

async function launch(): Promise<{ chrome: ChildProcess; page: Page; profile: string }> {
  const bin = CHROME_PATHS.find((p) => p !== undefined && existsSync(p));
  if (!bin) throw new Error('No Chrome found; set CHROME to its binary');
  const profile = mkdtempSync(join(tmpdir(), 'isv-screens-'));
  const chrome = spawn(
    bin,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      '--hide-scrollbars',
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let targets: { type: string; webSocketDebuggerUrl: string }[] = [];
  for (let i = 0; i < 80 && targets.length === 0; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      targets = ((await res.json()) as typeof targets).filter((t) => t.type === 'page');
    } catch {
      await sleep(250);
    }
  }
  const target = targets[0];
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const page = new Page(ws);
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return { chrome, page, profile };
}

// ---- Scenes ----

/** Opens a scene and waits until it froze on its moment. */
async function showScene(page: Page, id: string): Promise<void> {
  // Straight to polling: popups from the last tick fade within a second.
  await page.open(`/?scene=${id}`, 0);
  for (let i = 0; i < 200; i++) {
    if (await page.eval<boolean>(`window.isvScene?.done === true`)) {
      // Let effects that started on the last tick show.
      await sleep(150);
      return;
    }
    await sleep(50);
  }
  throw new Error(`Scene ${id} never got there`);
}

/** Where each scene's picture goes; scenes not listed go to `mechanics/<id>`. */
function sceneImage(id: string): string {
  return id.startsWith('level-') ? `levels/${id.slice('level-'.length)}` : `mechanics/${id}`;
}

// ---- Menus ----

/** From a fresh load to the level select with two keyboard players. */
async function toLevelSelect(page: Page, query = '?unlockAll'): Promise<void> {
  await page.open(`/${query}`);
  await page.key('Enter'); // wake the title
  await page.key('Enter'); // Play
  await page.key('Enter'); // join: left keyboard
  await page.key('Enter'); // join: right keyboard
  await page.key('KeyE'); // player 1 starts
}

/** Moves the level select to chapter `chapter` (0-based), level `row`, and opens its intro card. */
async function openIntro(page: Page, chapter: number, row: number): Promise<void> {
  for (let i = 0; i < chapter; i++) await page.key('ArrowRight');
  for (let i = 0; i < row; i++) await page.key('ArrowDown');
  await page.key('Enter');
  await sleep(500);
}

// ---- The shots ----

type Shot = (page: Page) => Promise<void>;

const SHOTS: Record<string, Shot> = {
  async 'screens/title'(page) {
    await page.open('/');
    await page.shot('screens/title');
    await page.key('Enter');
    await sleep(400);
    await page.shot('screens/title-menu');
    await page.key('ArrowDown');
    await page.key('ArrowDown');
    await page.key('Enter');
    await sleep(400);
    await page.shot('screens/credits');
    await page.key('Escape');
    await page.key('ArrowUp');
    await page.key('Enter');
    await sleep(400);
    await page.shot('screens/settings');
    await page.key('Escape');
    await page.key('ArrowUp');
    await page.key('Enter');
    await page.key('Enter');
    await page.key('Enter');
    await sleep(400);
    await page.shot('screens/lobby');
  },

  async 'screens/level-select'(page) {
    // A fresh save: later chapters still locked.
    await toLevelSelect(page, '');
    await page.key('ArrowDown');
    await sleep(400);
    await page.shot('screens/level-select');
  },

  async 'screens/round-start'(page) {
    await toLevelSelect(page);
    await page.key('Enter');
    await sleep(500);
    await page.shot('screens/intro-garage');
    await page.key('Enter');
    await sleep(350);
    await page.shot('screens/countdown');
    await sleep(2600);
    await page.shot('screens/first-level-hints');
    await page.key('Escape');
    await sleep(400);
    await page.shot('screens/pause');
  },

  async 'screens/intros'(page) {
    const intros: [string, number, number][] = [
      ['open-plan', 0, 1],
      ['scale-up', 0, 2],
      ['seed-round', 1, 0],
      ['middle-management', 2, 0],
      ['back-to-back', 3, 0],
    ];
    for (const [id, chapter, row] of intros) {
      await toLevelSelect(page);
      await openIntro(page, chapter, row);
      await page.shot(`screens/intro-${id}`);
    }
  },

  async 'screens/results'(page) {
    await showScene(page, 'results');
    // The stars fill in one by one.
    await sleep(2500);
    await page.shot('screens/results');
  },

  async 'mechanics/orders-bar'(page) {
    await showScene(page, 'orders');
    await page.shot('mechanics/orders-bar', { x: 0, y: 0, width: WIDTH, height: 125 });
  },

  ...Object.fromEntries(
    SCENES.filter((scene) => scene.id !== 'results').map((scene): [string, Shot] => [
      sceneImage(scene.id),
      async (page) => {
        await showScene(page, scene.id);
        await page.shot(sceneImage(scene.id));
      },
    ]),
  ),
};

async function main(): Promise<void> {
  const { chrome, page, profile } = await launch();
  let failed = 0;
  try {
    for (const [name, shot] of Object.entries(SHOTS)) {
      if (ONLY && !name.includes(ONLY)) continue;
      console.log(name);
      try {
        await shot(page);
      } catch (err) {
        failed++;
        console.error(`  failed: ${(err as Error).message}`);
      }
    }
  } finally {
    chrome.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
  if (failed > 0) process.exitCode = 1;
}

await main();
