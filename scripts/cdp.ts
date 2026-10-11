/// <reference types="node" />

/**
 * A tiny DevTools protocol client for driving headless Chrome from scripts
 * (`verifyOnline.ts`): launch a browser with its own profile, press keys,
 * evaluate page JS, take screenshots, cut the network.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME_PATHS = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
}

const VIRTUAL_KEYS: Readonly<Record<string, number>> = {
  Enter: 13,
  Escape: 27,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
};

function virtualKey(code: string): number {
  const known = VIRTUAL_KEYS[code];
  if (known !== undefined) return known;
  // KeyA..KeyZ are their upper-case letter's code.
  return /^Key[A-Z]$/.test(code) ? code.charCodeAt(3) : 0;
}

export class Page {
  private nextId = 0;
  private readonly pending = new Map<number, (m: CdpMessage) => void>();

  constructor(
    private readonly ws: WebSocket,
    readonly name: string,
  ) {
    ws.onmessage = (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as CdpMessage;
      if (msg.id !== undefined) {
        this.pending.get(msg.id)?.(msg);
        this.pending.delete(msg.id);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const details = msg.params?.exceptionDetails as
          { exception?: { description?: string } } | undefined;
        console.log(`  [${name} exception] ${details?.exception?.description ?? '?'}`);
      }
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

  /** Polls `expression` until it is truthy; throws with `what` after `timeoutMs`. */
  async waitFor<T>(expression: string, what: string, timeoutMs = 10_000): Promise<T> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const value = await this.eval<T>(expression).catch(() => undefined);
      if (value) return value;
      if (Date.now() > end) throw new Error(`${this.name}: timed out waiting for ${what}`);
      await sleep(150);
    }
  }

  async open(url: string, settle = 2500): Promise<void> {
    await this.send('Page.navigate', { url });
    await sleep(settle);
  }

  async down(code: string, key = code, text?: string): Promise<void> {
    const vk = virtualKey(code);
    const base = { code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    const down = text === undefined ? { type: 'rawKeyDown' } : { type: 'keyDown', text };
    await this.send('Input.dispatchKeyEvent', { ...down, ...base });
  }

  async up(code: string, key = code): Promise<void> {
    const vk = virtualKey(code);
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      code,
      key,
      windowsVirtualKeyCode: vk,
      nativeVirtualKeyCode: vk,
    });
  }

  /** Presses and releases a key, held long enough for a frame to see it. */
  async key(code: string, key = code, text?: string): Promise<void> {
    await this.down(code, key, text);
    await sleep(90);
    await this.up(code, key);
    await sleep(250);
  }

  async hold(code: string, ms: number): Promise<void> {
    await this.down(code);
    await sleep(ms);
    await this.up(code);
  }

  /** Takes the network away (`true`) or gives it back, like pulling the wifi. */
  async offline(off: boolean): Promise<void> {
    await this.send('Network.emulateNetworkConditions', {
      offline: off,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }

  async shot(file: string): Promise<void> {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(file, Buffer.from(r.data as string, 'base64'));
  }
}

export interface Browser {
  page: Page;
  close(): void;
}

/** A headless Chrome with a fresh profile (so its own user id), on `port`. */
export async function launchChrome(
  port: number,
  name: string,
  size = { width: 1280, height: 720 },
): Promise<Browser> {
  const bin = CHROME_PATHS.find((p) => p !== undefined && existsSync(p));
  if (!bin) throw new Error('No Chrome found; set CHROME to its binary');
  const profile = mkdtempSync(join(tmpdir(), `isv-${name}-`));
  const chrome: ChildProcess = spawn(
    bin,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${size.width},${size.height}`,
      '--mute-audio',
      '--autoplay-policy=no-user-gesture-required',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let targets: { type: string; webSocketDebuggerUrl: string }[] = [];
  for (let i = 0; i < 80 && targets.length === 0; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      targets = ((await res.json()) as typeof targets).filter((t) => t.type === 'page');
    } catch {
      await sleep(250);
    }
  }
  const target = targets[0];
  if (!target) throw new Error(`Chrome (${name}) did not start`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  const page = new Page(ws, name);
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    ...size,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return {
    page,
    close: () => {
      ws.close();
      chrome.kill();
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        // Chrome may still hold files for a moment; the OS cleans tmp.
      }
    },
  };
}
