import { describe, expect, it } from 'vitest';
import type { DevicePress } from './controller';
import { createLevelSelect, updateLevelSelect } from './levelSelect';

const JOINED = new Set(['kb-left', 'pad-0']);

function press(deviceId: string, extra: Partial<DevicePress> = {}): DevicePress {
  return {
    deviceId,
    joinGroup: deviceId,
    join: false,
    menu: false,
    interact: false,
    dash: false,
    nav: { x: 0, y: 0 },
    ...extra,
  };
}

describe('updateLevelSelect', () => {
  it('moves with left/right and up/down, stopping at the ends', () => {
    const select = createLevelSelect();
    expect(updateLevelSelect(select, [press('pad-0', { nav: { x: -1, y: 0 } })], JOINED, 3)).toBe(
      false,
    );
    updateLevelSelect(select, [press('pad-0', { nav: { x: 1, y: 0 } })], JOINED, 3);
    updateLevelSelect(select, [press('kb-left', { nav: { x: 0, y: 1 } })], JOINED, 3);
    expect(select.index).toBe(2);
    updateLevelSelect(select, [press('kb-left', { nav: { x: 1, y: 0 } })], JOINED, 3);
    expect(select.index).toBe(2);
  });

  it('picks with interact or join', () => {
    for (const button of ['interact', 'join'] as const) {
      const select = createLevelSelect(1);
      expect(updateLevelSelect(select, [press('pad-0', { [button]: true })], JOINED, 3)).toBe(true);
      expect(select).toEqual({ index: 1, chosen: true });
    }
  });

  it('ignores devices that did not join', () => {
    const select = createLevelSelect();
    const presses = [press('pad-1', { interact: true }), press('pad-1', { nav: { x: 1, y: 0 } })];
    expect(updateLevelSelect(select, presses, JOINED, 3)).toBe(false);
    expect(select).toEqual({ index: 0, chosen: false });
  });

  it('stops listening once a level is picked', () => {
    const select = createLevelSelect();
    updateLevelSelect(select, [press('pad-0', { interact: true })], JOINED, 3);
    expect(updateLevelSelect(select, [press('pad-0', { nav: { x: 1, y: 0 } })], JOINED, 3)).toBe(
      false,
    );
    expect(select.index).toBe(0);
  });
});
