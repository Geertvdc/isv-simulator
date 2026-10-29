/** One frame of the screens around a round: presses in, a new screen and effects out. */

import type { DevicePress } from '../input/controller';
import { createLobby, updateLobby } from '../input/lobby';
import { DEMO_IDLE_MS, DEMO_KIOSK_IDLE_MS, DEMO_RESULTS_MS } from '../sim/balance';
import { rosterPresses, selection } from './roster';
import {
  type Flow,
  type FlowContext,
  type FlowUpdate,
  type Screen,
  COUNTDOWN_MS,
  changePlayers,
  goTo,
  hasAnything,
  isBack,
  isConfirm,
  quitToTitle,
  resultsReady,
} from './flow';
import { updateJoinCodeScreen } from './joinFlow';
import { back, confirm, navigate, startCountdown, startLevel } from './menuActions';

/** Screens a kiosk leaves for the demo when nobody presses anything for a while. */
const KIOSK_IDLE_SCREENS: readonly Screen[] = [
  'lobby',
  'levelSelect',
  'intro',
  'results',
  'paused',
  'credits',
];

/**
 * Applies this frame's presses. On the title and in the lobby any device
 * counts; after the lobby only devices that joined. One confirm or back
 * counts per frame, so Enter (which presses on both keyboard schemes) acts
 * once.
 */
export function updateFlow(
  flow: Flow,
  presses: readonly DevicePress[],
  ctx: FlowContext,
): FlowUpdate {
  const update: FlowUpdate = { changed: false, effects: [] };
  if (presses.some(hasAnything)) flow.lastPressMs = ctx.nowMs;
  if (flow.screen === 'demo') return updateDemo(flow, presses, ctx);
  if (isIdle(flow, ctx)) return startDemo(flow, ctx);
  if (flow.screen === 'lobby') return updateLobbyScreen(flow, presses, ctx);
  if (flow.screen === 'joinCode') return updateJoinCodeScreen(flow, presses);
  // Online, the server's flow drives the screens; this one waits for the room to end.
  if (flow.screen === 'online') return update;
  if (ctx.practice && flow.screen === 'levelSelect') {
    changePlayers(flow);
    return { changed: true, effects: [{ type: 'stopRound' }] };
  }
  // Nobody can do anything during the countdown, not even pause: it only waits.
  if (flow.screen === 'countdown') {
    if (ctx.nowMs - flow.countdownStartMs < COUNTDOWN_MS) return update;
    goTo(flow, 'playing');
    return { changed: true, effects: [] };
  }
  const joined = new Set(flow.lobby.players.map((p) => p.deviceId));
  const own = flow.lobby.started ? presses.filter((p) => joined.has(p.deviceId)) : presses;
  if (flow.screen === 'intro') {
    if (own.some(isBack)) {
      back(flow, update);
      return { ...update, changed: true };
    }
    const changed = rosterPresses(flow.lobby, 'intro', own);
    const participants = flow.lobby.players.filter((p) => ctx.participates?.(p.deviceId) ?? true);
    if (
      participants.length > 0 &&
      participants.every((p) => selection(flow.lobby, p.playerId).ready)
    ) {
      startCountdown(flow, ctx);
      return { changed: true, effects: [{ type: 'lockRoster' }] };
    }
    return { changed, effects: [] };
  }
  if (own.length === 0) return update;

  if (flow.screen === 'title' && !flow.awake) {
    if (!own.some(hasAnything)) return update;
    flow.awake = true;
    flow.menuIndex = 0;
    return { changed: true, effects: [] };
  }
  if (flow.screen === 'playing') {
    if (!own.some((p) => p.menu)) return update;
    goTo(flow, 'paused');
    return { changed: true, effects: [] };
  }
  if (flow.screen === 'results' && !resultsReady(flow, ctx.nowMs)) return update;

  for (const press of own) {
    if (navigate(flow, press, ctx, update)) update.changed = true;
  }
  const action = own.find((p) => isConfirm(p) || isBack(p));
  if (action) {
    const screen = flow.screen;
    if (isBack(action)) back(flow, update);
    else confirm(flow, ctx, update);
    if (flow.screen !== screen) update.changed = true;
  }
  return update;
}

/** Whether nobody pressed anything for long enough that the demo should start. */
function isIdle(flow: Flow, ctx: FlowContext): boolean {
  if (!ctx.demo || ctx.demo.levels.length === 0) return false;
  const idleMs = ctx.nowMs - flow.lastPressMs;
  if (flow.screen === 'title') return idleMs >= DEMO_IDLE_MS;
  return ctx.demo.kiosk && KIOSK_IDLE_SCREENS.includes(flow.screen) && idleMs >= DEMO_KIOSK_IDLE_MS;
}

/** Bots start a round of the next demo level; whoever had joined is let go. */
function startDemo(flow: Flow, ctx: FlowContext): FlowUpdate {
  const levels = ctx.demo?.levels ?? [];
  const levelIndex = levels[flow.demoRounds % levels.length];
  if (levelIndex === undefined) return { changed: false, effects: [] };
  flow.demoRounds++;
  flow.levelIndex = levelIndex;
  flow.lobby = createLobby();
  flow.demoEnd = null;
  goTo(flow, 'demo');
  return { changed: true, effects: [{ type: 'startLevel', levelIndex }] };
}

/** Any button ends the demo on the title, menu up; a finished demo round moves on to the next. */
function updateDemo(flow: Flow, presses: readonly DevicePress[], ctx: FlowContext): FlowUpdate {
  if (presses.some(hasAnything)) {
    flow.awake = true;
    quitToTitle(flow);
    return { changed: true, effects: [{ type: 'stopRound' }] };
  }
  if (flow.demoEnd && ctx.nowMs - flow.demoEnd.atMs >= DEMO_RESULTS_MS) {
    return startDemo(flow, ctx);
  }
  return { changed: false, effects: [] };
}

function updateLobbyScreen(
  flow: Flow,
  presses: readonly DevicePress[],
  ctx: FlowContext,
): FlowUpdate {
  const joined = new Set(flow.lobby.players.map((p) => p.deviceId));
  const backPress = presses.find((p) => isBack(p) && (joined.size === 0 || joined.has(p.deviceId)));
  if (backPress && !flow.online) {
    quitToTitle(flow);
    return { changed: true, effects: [] };
  }
  const changed = updateLobby(flow.lobby, presses, ctx.canStart);
  const roleChanged = rosterPresses(flow.lobby, 'lobby', presses);
  if (flow.lobby.started) {
    if (ctx.practice) {
      const update: FlowUpdate = { changed: true, effects: [] };
      startLevel(flow, 0, update);
      return update;
    }
    goTo(flow, 'levelSelect');
  }
  return { changed: changed || roleChanged, effects: [] };
}
