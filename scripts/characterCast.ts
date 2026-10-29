/// <reference types="node" />
/** Reproducible production cast evidence; never overwrites the approved docs catalog. */
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
const browser = await launchChrome(Number(arg('cdp-port') ?? 9361), 'production-cast', {
  width: 1440,
  height: 900,
});
try {
  const models: [string, string][] = [
    ['cast-lineup', 'action=idle'],
    ['cast-carry', 'action=carry'],
    ['cast-rear-gray', 'action=idle&rear&gray'],
    ...['walk', 'work', 'dash', 'throw', 'shove'].map((action): [string, string] => [
      `cast-${action}`,
      `action=${action}`,
    ]),
    ...['generalist', 'frontend', 'backend', 'qa', 'platform'].map((role): [string, string] => [
      `role-${role}`,
      `role=${role}&action=carry`,
    ]),
  ];
  for (const [name, query] of models) {
    await browser.page.open(`${base}/models.html?cast&still&time=900&${query}`, 1000);
    await browser.page.waitFor('document.body.dataset.castReady === "true"', name);
    await browser.page.shot(join(directory, `${name}.png`));
  }
  for (const scene of [
    'cast-mixed',
    'cast-platform',
    'cast-duplicates',
    'cast-windup',
    'cast-release',
    'work-code',
  ]) {
    await browser.page.open(`${base}/?scene=${scene}&quality=low`, 1800);
    await browser.page.waitFor('window.isvScene?.done === true', scene);
    await browser.page.shot(join(directory, `gameplay-${scene}.png`));
  }
  await browser.page.send('Emulation.setDeviceMetricsOverride', {
    width: 740,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.page.open(`${base}/models.html?cast&still&action=idle`, 1000);
  await browser.page.waitFor('document.body.dataset.castReady === "true"', 'narrow cast');
  await browser.page.shot(join(directory, 'cast-narrow.png'));
  console.log(`Captured production cast evidence in ${directory}`);
} finally {
  browser.close();
}
