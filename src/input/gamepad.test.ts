import { describe, expect, it } from 'vitest';
import { GAMEPAD_DEAD_ZONE } from '../sim/balance';
import {
  type GamepadLike,
  GamepadController,
  PAD_BUTTON,
  applyDeadZone,
  readGamepad,
} from './gamepad';

function pad(axes: number[] = [0, 0], pressed: number[] = [], connected = true): GamepadLike {
  return {
    connected,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
  };
}

describe('applyDeadZone', () => {
  it('centers small stick drift', () => {
    expect(applyDeadZone(GAMEPAD_DEAD_ZONE * 0.9, 0)).toEqual({ x: 0, y: 0 });
    expect(applyDeadZone(0.1, -0.1)).toEqual({ x: 0, y: 0 });
  });

  it('rescales past the dead zone to the full 0 to 1 range', () => {
    expect(applyDeadZone(1, 0).x).toBeCloseTo(1);
    const half = GAMEPAD_DEAD_ZONE + (1 - GAMEPAD_DEAD_ZONE) / 2;
    expect(applyDeadZone(0, half).y).toBeCloseTo(0.5);
    const just = applyDeadZone(GAMEPAD_DEAD_ZONE + 0.01, 0).x;
    expect(just).toBeGreaterThan(0);
    expect(just).toBeLessThan(0.05);
  });

  it('keeps the direction and caps the length at 1', () => {
    const v = applyDeadZone(1, 1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(v.y);
  });
});

describe('readGamepad', () => {
  it('returns null for a missing or disconnected pad', () => {
    expect(readGamepad(null)).toBeNull();
    expect(readGamepad(undefined)).toBeNull();
    expect(readGamepad(pad([1, 0], [], false))).toBeNull();
  });

  it('moves with the left stick, screen-relative (down is +y)', () => {
    expect(readGamepad(pad([0, 1]))?.move.y).toBeCloseTo(1);
    expect(readGamepad(pad([-1, 0]))?.move.x).toBeCloseTo(-1);
    expect(readGamepad(pad([0.05, 0.05]))?.move).toEqual({ x: 0, y: 0 });
  });

  it.each([
    [PAD_BUTTON.dpadUp, { x: 0, y: -1 }],
    [PAD_BUTTON.dpadDown, { x: 0, y: 1 }],
    [PAD_BUTTON.dpadLeft, { x: -1, y: 0 }],
    [PAD_BUTTON.dpadRight, { x: 1, y: 0 }],
  ])('moves with the D-pad (button %i)', (button, move) => {
    expect(readGamepad(pad([0, 0], [button]))?.move).toEqual(move);
  });

  it('lets the D-pad win over the stick', () => {
    expect(readGamepad(pad([0, 1], [PAD_BUTTON.dpadLeft]))?.move).toEqual({ x: -1, y: 0 });
  });

  it('maps A to interact and join, X to work', () => {
    expect(readGamepad(pad([0, 0], [PAD_BUTTON.a]))).toMatchObject({
      interact: true,
      join: true,
      work: false,
    });
    expect(readGamepad(pad([0, 0], [PAD_BUTTON.x]))).toMatchObject({
      interact: false,
      join: false,
      work: true,
    });
  });

  it('survives pads with fewer axes and buttons', () => {
    expect(readGamepad({ connected: true, axes: [], buttons: [] })).toEqual({
      move: { x: 0, y: 0 },
      interact: false,
      work: false,
      dash: false,
      join: false,
    });
  });

  it('maps B to dash', () => {
    expect(readGamepad(pad([0, 0], [PAD_BUTTON.b]))).toMatchObject({ dash: true, interact: false });
  });
});

describe('GamepadController', () => {
  it('reads its own slot and follows connects and disconnects', () => {
    let pads: (GamepadLike | null)[] = [null, pad([1, 0])];
    const second = new GamepadController(1, () => pads);
    expect(second.deviceId).toBe('pad-1');
    expect(second.read()?.move.x).toBeCloseTo(1);
    pads = [null, null];
    expect(second.read()).toBeNull();
    pads = [null, pad([0, 0], [PAD_BUTTON.a])];
    expect(second.read()?.interact).toBe(true);
  });
});
