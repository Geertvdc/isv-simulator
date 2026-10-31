/// <reference types="node" />
/**
 * Character turnaround evidence: every production developer from four sides,
 * the whole crew in every action, and the gameplay cast scenes.
 * `npx vite-node scripts/characterTurnaround.ts --out=<dir>` with the dev server running.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChrome } from './cdp';

const arg = (name: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = arg('out');
if (!out) throw new Error('Pass --out=<absolute evidence directory>');
const directory = resolve(out);
mkdirSync(directory, { recursive: true });
const base = arg('base') ?? 'http://localhost:5173';
const only = arg('only');
const extra = arg('extra') ?? '';
const browser = await launchChrome(Number(arg('cdp-port') ?? 9371), 'character-turnaround', {
  width: 2000,
  height: 900,
});
const wanted = (name: string): boolean => !only || only.split(',').some((o) => name.includes(o));
try {
  const sheets: [string, string][] = [
    ...['generalist', 'frontend', 'backend', 'qa', 'platform'].map((role): [string, string] => [
      `turnaround-${role}`,
      `role=${role}&action=idle&time=900`,
    ]),
    // Times land on each action's key pose: stride extremes, wind-up, release, push, stumble.
    ...(
      [
        ['idle', 'idle', 900],
        ['walk', 'walk', 1023],
        ['work', 'work', 900],
        ['carry', 'carry', 1023],
        ['dash', 'dash', 1023],
        ['throw-windup', 'throw', 900],
        ['throw-cocked', 'throw', 1560],
        ['throw-release', 'throw', 1800],
        ['shove-push', 'shove', 300],
        ['shove-stumble', 'shove', 1345],
      ] as const
    ).map(([name, action, time]): [string, string] => [
      `lineup-${name}`,
      `lineup&action=${action}&time=${time}`,
    ]),
    ['lineup-rear-gray', 'lineup&action=idle&time=900&rear&gray'],
    ['lineup-faces', 'lineup&action=idle&time=900&faces'],
    ['lineup-faces-side', 'lineup&action=idle&time=900&faces&side'],
    ['lineup-faces-rear', 'lineup&action=idle&time=900&faces&rear'],
  ];
  for (const [name, query] of sheets) {
    if (!wanted(name)) continue;
    await browser.page.open(`${base}/models.html?turnaround&still&${query}${extra}`, 1500);
    await browser.page.waitFor('document.body.dataset.castReady === "true"', name);
    await new Promise((done) => setTimeout(done, 600));
    await browser.page.shot(join(directory, `${name}.png`));
  }
  await browser.page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const scene of [
    'cast-mixed',
    'cast-duplicates',
    'cast-platform',
    'cast-windup',
    'work-code',
  ]) {
    const name = `gameplay-${scene}`;
    if (!wanted(name)) continue;
    await browser.page.open(`${base}/?scene=${scene}&quality=low`, 1800);
    await browser.page.waitFor('window.isvScene?.done === true', scene);
    await browser.page.shot(join(directory, `${name}.png`));
  }
  console.log(`Captured character turnarounds in ${directory}`);
} finally {
  browser.close();
}
