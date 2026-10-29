/** What moving through and confirming the menus does: settings, level picks, back. */

import type { DevicePress } from '../input/controller';
import { createLobby } from '../input/lobby';
import { SFX_VOLUME_MAX } from '../sim/balance';
import { GRAPHICS_LEVELS, isUnlocked } from './save';
import { mapCursor } from './worldMap';
import { resetReadiness } from './roster';
import {
  type Flow,
  type FlowContext,
  type FlowUpdate,
  changePlayers,
  clamp,
  emptyJoinCode,
  goTo,
  menuItems,
  quitToTitle,
} from './flow';

/** Moves a cursor or changes a setting. Returns whether anything changed. */
export function navigate(
  flow: Flow,
  press: DevicePress,
  ctx: FlowContext,
  update: FlowUpdate,
): boolean {
  const { x, y } = press.nav;
  if (x === 0 && y === 0) return false;
  if (flow.screen === 'levelSelect') {
    const index = mapCursor(ctx, flow.levelIndex, x, y);
    if (index === flow.levelIndex) return false;
    flow.levelIndex = index;
    return true;
  }
  const items = menuItems(flow);
  if (items.length === 0) return false;
  if (y !== 0) {
    const index = clamp(flow.menuIndex + y, 0, items.length - 1);
    if (index === flow.menuIndex) return false;
    flow.menuIndex = index;
    return true;
  }
  const item = items[flow.menuIndex];
  const settings = ctx.save.settings;
  if (item === 'volume' || item === 'music') {
    const key = item === 'volume' ? 'sfxVolume' : 'musicVolume';
    const volume = clamp(settings[key] + x, 0, SFX_VOLUME_MAX);
    if (volume === settings[key]) return false;
    settings[key] = volume;
    update.effects.push({ type: 'settingsChanged' }, { type: 'saveChanged' });
    return true;
  }
  if (item === 'shake') {
    toggleShake(ctx, update);
    return true;
  }
  if (item === 'graphics') {
    stepGraphics(ctx, update, Math.sign(x));
    return true;
  }
  return false;
}

function toggleShake(ctx: FlowContext, update: FlowUpdate): void {
  ctx.save.settings.screenShake = !ctx.save.settings.screenShake;
  update.effects.push({ type: 'settingsChanged' }, { type: 'saveChanged' });
  update.changed = true;
}

/** Moves the Graphics setting `step` along its list, wrapping round. */
function stepGraphics(ctx: FlowContext, update: FlowUpdate, step: number): void {
  const settings = ctx.save.settings;
  const n = GRAPHICS_LEVELS.length;
  const index = GRAPHICS_LEVELS.indexOf(settings.graphics);
  settings.graphics = GRAPHICS_LEVELS[(index + step + n) % n] ?? 'auto';
  update.effects.push({ type: 'settingsChanged' }, { type: 'saveChanged' });
  update.changed = true;
}

export function back(flow: Flow, update: FlowUpdate): void {
  switch (flow.screen) {
    case 'levelSelect':
      changePlayers(flow);
      return;
    case 'intro':
      update.effects.push({ type: 'stopRound' });
      goTo(flow, 'levelSelect');
      return;
    case 'paused':
      goTo(flow, 'playing');
      update.effects.push({ type: 'resumeRound' });
      return;
    case 'results':
      update.effects.push({ type: 'stopRound' });
      goTo(flow, 'levelSelect');
      return;
    case 'settings':
      closeSettings(flow);
      return;
    case 'profile':
      goTo(flow, 'settings', menuItems({ ...flow, screen: 'settings' }).indexOf('profile'));
      return;
    case 'credits':
      quitToTitle(flow, 'credits');
      return;
    default:
      return;
  }
}

function closeSettings(flow: Flow): void {
  const from = flow.settingsFrom;
  goTo(flow, from);
  flow.menuIndex = menuItems(flow).indexOf('settings');
}

/**
 * A fresh round of `levelIndex`. A level picked from the menus first shows
 * its team confirmation card, including Restart and Retry.
 */
export function startLevel(flow: Flow, levelIndex: number, update: FlowUpdate): void {
  flow.levelIndex = levelIndex;
  resetReadiness(flow.lobby);
  goTo(flow, 'intro');
  update.effects.push({ type: 'startLevel', levelIndex });
}

export function startCountdown(flow: Flow, ctx: FlowContext): void {
  goTo(flow, 'countdown');
  flow.countdownStartMs = ctx.nowMs;
}

export function confirm(flow: Flow, ctx: FlowContext, update: FlowUpdate): void {
  if (flow.screen === 'levelSelect') {
    if (isUnlocked(ctx.save, ctx.levelIds, flow.levelIndex, ctx.unlockAll, ctx.chapters)) {
      startLevel(flow, flow.levelIndex, update);
    }
    return;
  }
  const item = menuItems(flow)[flow.menuIndex];
  switch (item) {
    case 'play':
      flow.lobby = createLobby();
      goTo(flow, 'lobby');
      return;
    case 'hostOnline':
      goTo(flow, 'online');
      update.effects.push({ type: 'hostOnline' });
      return;
    case 'joinOnline':
      flow.joinCode = emptyJoinCode();
      goTo(flow, 'joinCode');
      return;
    case 'settings':
      flow.settingsFrom = flow.screen === 'paused' ? 'paused' : 'title';
      goTo(flow, 'settings');
      return;
    case 'credits':
      goTo(flow, 'credits');
      return;
    case 'resume':
      goTo(flow, 'playing');
      update.effects.push({ type: 'resumeRound' });
      return;
    case 'restart':
    case 'retry':
      startLevel(flow, flow.levelIndex, update);
      return;
    case 'next':
      startLevel(flow, flow.levelIndex + 1, update);
      return;
    case 'levelSelect':
      update.effects.push({ type: 'stopRound' });
      goTo(flow, 'levelSelect');
      return;
    case 'changePlayers':
      update.effects.push({ type: 'stopRound' });
      changePlayers(flow);
      return;
    case 'quit':
      update.effects.push({ type: 'stopRound' });
      quitToTitle(flow);
      return;
    case 'shake':
      toggleShake(ctx, update);
      return;
    case 'graphics':
      stepGraphics(ctx, update, 1);
      return;
    case 'profile':
      goTo(flow, 'profile');
      return;
    case 'copyId':
    case 'changeName':
    case 'changeId':
      update.effects.push({ type: 'profileAction', action: item });
      update.changed = true;
      return;
    case 'back':
      back(flow, update);
      return;
    case 'volume':
    case 'music':
    case undefined:
      return;
  }
}
