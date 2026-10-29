/// <reference types="node" />
/** Four-seat layout checks: real menu input, visible content bounds, no clipped/scrolling controls. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { launchChrome, sleep, type Browser, type Page } from './cdp';

const arg = (name: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const base = arg('base') ?? 'http://127.0.0.1:5217';
const out = resolve(arg('out') ?? '/tmp/isv-role-layout');
mkdirSync(out, { recursive: true });
const browsers: Browser[] = [];
const reports: { name: string; issues: string[] }[] = [];
async function browser(name: string): Promise<Page> {
  const made = await launchChrome(9381 + browsers.length, name, { width: 1440, height: 900 });
  browsers.push(made);
  return made.page;
}

async function capture(page: Page, selector: string, name: string): Promise<void> {
  await sleep(350);
  const issues = await page.eval<string[]>(`(() => {
    const root = document.querySelector(${JSON.stringify(selector)});
    const status = root.querySelector('.screen-hint').getBoundingClientRect();
    const problems = [];
    for (const el of root.querySelectorAll('*')) {
      if (!el.checkVisibility() || el.closest('.screen-hint')) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const style = getComputedStyle(el);
      if (['auto', 'scroll'].includes(style.overflowY) && el.scrollHeight > el.clientHeight + 1)
        problems.push(el.className + ': vertical scrolling');
      if (['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 1)
        problems.push(el.className + ': horizontal scrolling');
      if (el.children.length && !['BUTTON', 'CANVAS'].includes(el.tagName)) continue;
      if (box.left < -1 || box.right > innerWidth + 1 || box.top < -1 || box.bottom > status.top + 1)
        problems.push(el.className + ': outside available screen ' + JSON.stringify({x: box.x, y: box.y, width: box.width, height: box.height, bottomLimit: status.top}));
      const owner = el.closest('.lobby-slot, .intro-seat, .online-player, .intro-guide');
      if (owner) {
        const bounds = owner.getBoundingClientRect();
        if (box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1)
          problems.push(el.className + ': outside its card');
      }
      for (const overlay of document.querySelectorAll('.sound-toggle, .online-bar:not(.in-round), .net-hud')) {
        if (!overlay.checkVisibility()) continue;
        const bounds = overlay.getBoundingClientRect();
        if (box.left < bounds.right - 1 && box.right > bounds.left + 1 && box.top < bounds.bottom - 1 && box.bottom > bounds.top + 1)
          problems.push(el.className + ': overlaps ' + overlay.className);
      }
    }
    return problems;
  })()`);
  reports.push({ name, issues });
  console.log(
    `${issues.length ? 'FAIL' : 'PASS'} ${name}${issues.length ? ` ${issues.join('; ')}` : ''}`,
  );
  await page.shot(join(out, `${name}.png`));
}

async function sizes(page: Page, selector: string, name: string): Promise<void> {
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
    [740, 900],
    [640, 720],
  ]) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await capture(page, selector, `${name}-${width}x${height}`);
  }
  await page.send('Emulation.clearDeviceMetricsOverride');
}

async function pad(page: Page, index: number, button: number): Promise<void> {
  await page.eval(
    `window.layoutPads[${index}].buttons[${button}] = { pressed: true, touched: true, value: 1 }`,
  );
  await sleep(150);
  await page.eval(
    `window.layoutPads[${index}].buttons[${button}] = { pressed: false, touched: false, value: 0 }`,
  );
  await sleep(300);
}

try {
  const local = await browser('role-layout-local');
  await local.open(`${base}/?lab=lab-roles&quality=low`);
  await local.key('Enter');
  await local.key('Enter');
  await local.eval(`window.layoutPads = [0,1].map(index => ({
    id: 'Layout verification gamepad', index, connected: true, mapping: 'standard',
    axes: [0,0,0,0], buttons: Array.from({length: 17}, () => ({pressed:false,touched:false,value:0}))
  })); navigator.getGamepads = () => window.layoutPads`);
  await pad(local, 0, 0);
  await pad(local, 1, 0);
  await local.waitFor(
    `document.querySelectorAll('.lobby-slot.joined').length === 4`,
    'four joined seats',
  );
  await local.key('KeyD');
  await local.key('ArrowLeft');
  await sizes(local, '.lobby', 'local-four');
  await local.key('KeyE');
  await local.waitFor(`!document.querySelector('.intro-screen').hidden`, 'lab confirmation');
  await sizes(local, '.intro-screen', 'intro-four');
  await local.key('KeyW');
  await local.waitFor(`!document.querySelector('.intro-guide').hidden`, 'keyboard opens guide');
  await sizes(local, '.intro-screen', 'guide');
  await pad(local, 0, 12);
  await local.waitFor(`document.querySelector('.intro-guide').hidden`, 'controller closes guide');
  await local.key('KeyE');
  await local.key('ShiftRight', 'Shift');
  await pad(local, 0, 0);
  await pad(local, 1, 0);
  await local.waitFor(`document.querySelector('.intro-screen').hidden`, 'all four ready');

  const host = await browser('role-layout-host');
  const guest = await browser('role-layout-guest');
  await host.open(`${base}/?quality=low`);
  await host.key('Enter');
  await host.key('ArrowDown');
  await host.key('Enter');
  const code = await host.waitFor<string>(
    `document.querySelector('.online-code').textContent.length === 4 && document.querySelector('.online-code').textContent`,
    'room code',
  );
  await guest.open(`${base}/?quality=low`);
  await guest.key('Enter');
  await guest.key('ArrowDown');
  await guest.key('ArrowDown');
  await guest.key('Enter');
  for (const ch of code) await guest.key(`Key${ch}`, ch.toLowerCase(), ch.toLowerCase());
  await guest.key('Enter');
  await guest.waitFor(`document.querySelectorAll('.online-member').length === 2`, 'two machines');
  for (const page of [host, guest]) {
    await page.key('Enter');
    await page.key('Enter');
    await page.key('KeyD');
    await page.key('ArrowLeft');
  }
  await guest.waitFor(
    `document.querySelectorAll('.online-player').length === 4`,
    'four online couch slots',
  );
  await sizes(guest, '.online-lobby', 'online-four');
  await host.key('KeyE');
  await host.key('KeyE');
  await guest.waitFor(`!document.querySelector('.intro-screen').hidden`, 'online confirmation');
  await sizes(guest, '.intro-screen', 'online-intro-four');
  await guest.key('ArrowUp');
  await guest.waitFor(`!document.querySelector('.intro-guide').hidden`, 'online guest opens guide');
  await sizes(guest, '.intro-screen', 'online-guide');
  writeFileSync(join(out, 'layout-results.json'), JSON.stringify(reports, null, 2));
  if (reports.some((report) => report.issues.length)) process.exitCode = 1;
} finally {
  for (const made of browsers) made.close();
}
