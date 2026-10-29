/** Shared helpers for the flow tests: a context, presses and the walk to a running round. */

import { expect } from 'vitest';
import type { DevicePress } from '../input/controller';
import {
  type Flow,
  type FlowContext,
  type MenuItem,
  COUNTDOWN_MS,
  createFlow,
  menuItems,
} from './flow';
import { createSave } from './save';
import { updateFlow } from './updateFlow';

export const IDS = ['garage', 'open-plan', 'scale-up'];
/** One level per chapter, all open: left and right walk the levels like a plain list. */
export const FLAT = IDS.map((id) => ({ levelIds: [id], starGate: 0 }));

export function ctx(extra: Partial<FlowContext> = {}): FlowContext {
  return {
    save: createSave(),
    levelIds: IDS,
    chapters: FLAT,
    unlockAll: false,
    nowMs: 0,
    ...extra,
  };
}

export function press(deviceId: string, extra: Partial<DevicePress> = {}): DevicePress {
  return {
    deviceId,
    joinGroup: deviceId.startsWith('kb') ? 'keyboard' : deviceId,
    join: false,
    interact: false,
    dash: false,
    menu: false,
    nav: { x: 0, y: 0 },
    ...extra,
  };
}

export const confirm = (id = 'pad-0'): DevicePress[] => [press(id, { interact: true, join: true })];
export const back = (id = 'pad-0'): DevicePress[] => [press(id, { dash: true })];
export const menu = (id = 'pad-0'): DevicePress[] => [press(id, { menu: true })];
export const down = (id = 'pad-0'): DevicePress[] => [press(id, { nav: { x: 0, y: 1 } })];
export const right = (id = 'pad-0'): DevicePress[] => [press(id, { nav: { x: 1, y: 0 } })];
export const left = (id = 'pad-0'): DevicePress[] => [press(id, { nav: { x: -1, y: 0 } })];
/** Enter: a join press on both keyboard schemes at once. */
export const enter = (): DevicePress[] => [
  press('kb-left', { join: true }),
  press('kb-right', { join: true }),
];

/** Highlights `item` in the current menu and confirms it. */
export function pick(flow: Flow, item: MenuItem, c: FlowContext, id = 'pad-0') {
  const index = menuItems(flow).indexOf(item);
  expect(index).toBeGreaterThanOrEqual(0);
  flow.menuIndex = index;
  return updateFlow(flow, confirm(id), c);
}

/** Title → lobby with pad-0 (player 1) and kb-left joined → level select. */
export function atLevelSelect(c = ctx()): Flow {
  const flow = createFlow();
  updateFlow(flow, confirm(), c);
  pick(flow, 'play', c);
  updateFlow(flow, confirm(), c);
  updateFlow(flow, enter(), c);
  updateFlow(flow, confirm(), c);
  expect(flow.screen).toBe('levelSelect');
  return flow;
}

/** From the level select: picks the highlighted level, skips its intro and waits out the countdown. */
export function play(flow: Flow, c: FlowContext): void {
  updateFlow(flow, confirm(), c);
  expect(flow.screen).toBe('intro');
  updateFlow(flow, confirm(), c);
  updateFlow(flow, confirm('kb-left'), c);
  expect(flow.screen).toBe('countdown');
  updateFlow(flow, [], { ...c, nowMs: c.nowMs + COUNTDOWN_MS });
  expect(flow.screen).toBe('playing');
}

export function playing(c = ctx()): Flow {
  const flow = atLevelSelect(c);
  play(flow, c);
  return flow;
}
