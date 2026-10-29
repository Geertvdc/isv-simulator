/// <reference types="node" />
/**
 * Capture the isolated 21a studies, without replacing approved game docs images.
 * Start Vite, then: npx vite-node scripts/characterStudies.ts --out=/absolute/path
 * Optional --base=http://localhost:5173. Chrome uses its own temporary profile.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChrome } from './cdp';

const arg = (name: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = arg('out');
if (!out) throw new Error('Pass --out=<directory>; studies must not replace approved game images');
const directory = resolve(out);
mkdirSync(directory, { recursive: true });
const base = arg('base') ?? 'http://localhost:5173';
const browser = await launchChrome(9351, 'character-studies', { width: 1440, height: 900 });
try {
  const shots: [string, string][] = [
    ['models-carry', ''],
    ...['idle', 'walk', 'work', 'dash', 'throw', 'shove'].map((action): [string, string] => [
      `models-${action}`,
      `&action=${action}`,
    ]),
    ['models-throw-late', '&action=throw&time=1450'],
    ['models-release', '&action=throw&time=2000'],
    ...['angular', 'clay', 'cartoon'].flatMap((style): [string, string][] => [
      [`office-${style}`, `&view=office&style=${style}`],
      [`office-${style}-rear-gray`, `&view=office&style=${style}&rear&gray`],
    ]),
    ['office-mixed', '&view=office'],
    ['office-throw', '&view=office&action=throw&time=850'],
  ];
  for (const [name, query] of shots) {
    const url = new URL('/models.html?studies&still&time=900', base);
    for (const [key, value] of new URLSearchParams(query)) url.searchParams.set(key, value);
    await browser.page.open(url.href, 1500);
    await browser.page.waitFor('document.body.dataset.studyReady === "true"', name);
    await browser.page.shot(join(directory, `${name}.png`));
    console.log(join(directory, `${name}.png`));
  }
  await browser.page.open(`${base}/?scene=level-monorepo&quality=low`, 3000);
  await browser.page.waitFor('document.querySelectorAll("canvas").length >= 2', 'unchanged game');
  await browser.page.shot(join(directory, 'gameplay-incumbent.png'));
  // Narrow-window coverage of the controls, not evidence of couch readability.
  await browser.page.send('Emulation.setDeviceMetricsOverride', {
    width: 740,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.page.open(`${base}/models.html?studies&still`, 1500);
  await browser.page.waitFor('document.body.dataset.studyReady === "true"', 'narrow study');
  await browser.page.shot(join(directory, 'models-narrow.png'));
} finally {
  browser.close();
}
