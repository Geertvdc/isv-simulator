/// <reference types="node" />
/** Real device/menu and authoritative room checks, plus scoped UI evidence (not the docs catalog). */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchChrome, sleep, type Browser, type Page } from './cdp';

const arg = (name: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const output = arg('out');
if (!output) throw new Error('Pass --out=<absolute evidence directory>');
const out = resolve(output);
mkdirSync(out, { recursive: true });
const base = arg('base') ?? 'http://127.0.0.1:5217';
const port = Number(arg('cdp-port') ?? 9371);
const browsers: Browser[] = [];

async function browser(name: string): Promise<Page> {
  const made = await launchChrome(port + browsers.length, name, { width: 1440, height: 900 });
  browsers.push(made);
  return made.page;
}
async function check(page: Page, expression: string, label: string): Promise<void> {
  await page.waitFor(expression, label);
  console.log(`PASS ${label}`);
}
async function shot(page: Page, name: string): Promise<void> {
  await sleep(350);
  await page.shot(join(out, `${name}.png`));
}
async function joinCode(page: Page, code: string): Promise<void> {
  await page.open(base);
  await page.key('Enter');
  await page.key('ArrowDown');
  await page.key('ArrowDown');
  await page.key('Enter');
  for (const letter of code)
    await page.key(`Key${letter}`, letter.toLowerCase(), letter.toLowerCase());
  await page.key('Enter');
  await check(
    page,
    'window.isvNet?.state || (!document.querySelector(".online-lobby").hidden && document.querySelector(".online-code").textContent.length === 4)',
    'guest joins real room',
  );
}

try {
  const local = await browser('role-local');
  await local.open(`${base}/?lab=lab-roles&quality=low`);
  await local.key('Enter');
  await local.key('Enter');
  await local.key('KeyD');
  await local.key('ArrowLeft');
  await check(
    local,
    'document.querySelectorAll(".lobby-slot.joined").length === 2 && document.querySelector(".lobby-slot .role-name").textContent.includes("Frontend")',
    'local devices select their own roles without starting',
  );
  await shot(local, 'local-lobby');
  await local.key('KeyE');
  await check(
    local,
    '!document.querySelector(".intro-screen").hidden && document.querySelector(".intro-forecast").textContent.includes("two coding parts")',
    'authored lab forecast before countdown',
  );
  await local.key('Enter');
  await check(
    local,
    '!document.querySelector(".intro-screen").hidden && document.querySelectorAll(".intro-seat .is-ready").length === 0',
    'shared keyboard join-only Enter cannot ready either slot',
  );
  await local.key('KeyE');
  await check(
    local,
    'document.querySelectorAll(".intro-seat .is-ready").length === 1',
    'one ready does not start two-player round',
  );
  await shot(local, 'local-intro');
  await local.key('KeyD');
  await check(
    local,
    'document.querySelectorAll(".intro-seat .is-ready").length === 0',
    'changing own role invalidates ready',
  );
  await local.send('Emulation.setDeviceMetricsOverride', {
    width: 740,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await shot(local, 'local-intro-narrow');
  await local.eval('document.querySelector(".intro-body").scrollTop = 500');
  await shot(local, 'local-intro-narrow-team');
  await local.send('Emulation.clearDeviceMetricsOverride');
  await local.key('KeyE');
  await local.key('ShiftRight', 'Shift');
  await check(
    local,
    '[...document.querySelectorAll(".hud-role")].map(e=>e.textContent).join(" ").includes("Backend")',
    'selected local roles reach actual GameState',
  );
  await sleep(3300);
  await shot(local, 'local-playing');
  await local.open(`${base}/?scene=roles-work&quality=low`);
  await check(
    local,
    'window.isvScene?.done === true',
    'real sim-driven role work fixture completes',
  );
  await check(
    local,
    'document.querySelector(".hud-roster").textContent.includes("pair total 4.56x") && document.querySelector(".hud-roster").textContent.includes("Test 1.60x") && document.querySelector(".hud-roster").textContent.includes("Repair 1.25x")',
    'actual designed pair, testing and repair feedback',
  );
  await shot(local, 'roles-work');
  await local.send('Emulation.setDeviceMetricsOverride', {
    width: 740,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await shot(local, 'roles-work-narrow');

  const host = await browser('role-host');
  const guest = await browser('role-guest');
  await host.open(base);
  await host.key('Enter');
  await host.key('ArrowDown');
  await host.key('Enter');
  await check(
    host,
    'document.querySelector(".online-code").textContent.length === 4',
    'host starts real authoritative room',
  );
  const code = await host.eval<string>('document.querySelector(".online-code").textContent');
  await joinCode(guest, code);
  await host.key('Enter');
  await guest.key('Enter');
  await host.key('KeyD');
  await guest.key('KeyA');
  await check(
    guest,
    '[...document.querySelectorAll(".online-player .role-name")].map(e=>e.textContent).join(" ").includes("Frontend") && [...document.querySelectorAll(".online-player .role-name")].map(e=>e.textContent).join(" ").includes("Platform")',
    'two clients see owned role requests',
  );
  await shot(guest, 'online-lobby');
  await host.key('KeyE');
  await host.key('KeyE');
  await check(
    guest,
    '!document.querySelector(".intro-screen").hidden',
    'guest gets team confirmation rather than host-only wait',
  );
  await host.key('KeyE');
  await check(
    guest,
    'document.querySelectorAll(".intro-seat .is-ready").length === 1 && !document.querySelector(".intro-screen").hidden',
    'host cannot ready the guest slot',
  );
  await shot(guest, 'online-intro');
  await guest.key('KeyE');
  await check(
    guest,
    'window.isvNet?.screen === "playing"',
    'all owned players ready starts countdown then actual round',
  );
  await check(
    guest,
    'window.isvNet?.state?.players.map(p=>p.roleId).join() === "frontend,platform"',
    'authoritative snapshots/prediction keep selected roles',
  );
  await shot(guest, 'online-playing');
  const before = await guest.eval<{ x: number; y: number }>('window.isvNet.state.players[0].pos');
  await host.hold('KeyD', 500);
  await sleep(800);
  const moved = await guest.eval<{ x: number; y: number }>('window.isvNet.state.players[0].pos');
  if (Math.hypot(moved.x - before.x, moved.y - before.y) < 0.3)
    throw new Error('Host movement not visible to guest');
  console.log('PASS real input moves authoritative selected-role player');
  await guest.open(base);
  await check(
    guest,
    'window.isvNet?.screen === "playing" && window.isvNet?.state?.players[1]?.roleId === "platform"',
    'page reconnect preserves role and active round',
  );
  const spectator = await browser('role-spectator');
  await joinCode(spectator, code);
  await spectator.key('Enter');
  await check(
    spectator,
    'window.isvNet?.screen === "playing" && window.isvNet?.state?.players.length === 2 && window.isvNet?.predict?.local.length === 0',
    'late spectator cannot change active roster',
  );
  await shot(spectator, 'online-spectator');
  console.log(`Role selection evidence: ${out}`);
} finally {
  for (const made of browsers) made.close();
}
