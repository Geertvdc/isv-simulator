import { describe, expect, it } from 'vitest';
import {
  ESTABLISHING,
  SWOOP_MS,
  type Framing,
  blendFraming,
  establishingFraming,
  shotFor,
  startRig,
  stepRig,
  swoopEase,
} from './mapShots';

const CLOSE: Framing = {
  look: { x: 20, y: 7 },
  distance: 26.5,
  pitch: 1,
  fov: 0.5,
  principalY: 0.7,
};
const WIDE: Framing = {
  look: { x: 10, y: 4 },
  distance: 40,
  pitch: 0.7,
  fov: 0.5,
  principalY: 0.66,
};

describe('shotFor', () => {
  it('drifts behind the title and its menus, rises for the lobby, follows on the level select', () => {
    expect(shotFor('title')).toBe('establishing');
    expect(shotFor('settings')).toBe('establishing');
    expect(shotFor('credits')).toBe('establishing');
    expect(shotFor(null)).toBe('establishing');
    expect(shotFor('lobby')).toBe('lobby');
    expect(shotFor('online')).toBe('lobby');
    expect(shotFor('levelSelect')).toBe('follow');
  });
});

describe('establishingFraming', () => {
  it('drifts from the garage toward the end of the open land and back', () => {
    const half = ESTABLISHING.periodMs / 2;
    const start = establishingFraming(48, 0).look.x;
    const far = establishingFraming(48, half).look.x;
    const back = establishingFraming(48, ESTABLISHING.periodMs).look.x;
    expect(start).toBe(ESTABLISHING.start);
    expect(far).toBeCloseTo(48 - ESTABLISHING.endInset);
    expect(back).toBeCloseTo(start);
    const quarter = establishingFraming(48, half / 2).look.x;
    expect(quarter).toBeGreaterThan(start);
    expect(quarter).toBeLessThan(far);
  });

  it('keeps a little sway on a small island', () => {
    const near = establishingFraming(12, 0).look.x;
    const far = establishingFraming(12, ESTABLISHING.periodMs / 2).look.x;
    expect(far - near).toBeCloseTo(ESTABLISHING.minSpan);
  });

  it('is higher and wider than the level select', () => {
    const shot = establishingFraming(48, 0);
    expect(shot.distance).toBeGreaterThan(CLOSE.distance);
  });
});

describe('swoopEase', () => {
  it('starts and ends slow, clamped to 0..1', () => {
    expect(swoopEase(0)).toBe(0);
    expect(swoopEase(1)).toBe(1);
    expect(swoopEase(0.5)).toBeCloseTo(0.5);
    expect(swoopEase(0.1)).toBeLessThan(0.1);
    expect(swoopEase(0.9)).toBeGreaterThan(0.9);
    expect(swoopEase(-1)).toBe(0);
    expect(swoopEase(2)).toBe(1);
  });
});

describe('blendFraming', () => {
  it('mixes every part of the camera', () => {
    const mid = blendFraming(WIDE, CLOSE, 0.5);
    expect(mid.look).toEqual({ x: 15, y: 5.5 });
    expect(mid.distance).toBeCloseTo(33.25);
    expect(mid.pitch).toBeCloseTo(0.85);
    expect(blendFraming(WIDE, CLOSE, 0)).toEqual(WIDE);
    expect(blendFraming(WIDE, CLOSE, 1)).toEqual(CLOSE);
  });
});

describe('stepRig', () => {
  it('holds a shot without gliding', () => {
    const rig = stepRig(startRig('follow', CLOSE), 'follow', CLOSE, 16);
    expect(rig.shown).toEqual(CLOSE);
    expect(rig.from).toBeNull();
  });

  it('swoops smoothly to a new shot instead of cutting', () => {
    let rig = startRig('establishing', WIDE);
    rig = stepRig(rig, 'follow', CLOSE, 16);
    expect(rig.shown).toEqual(WIDE);
    let last = rig.shown.distance;
    for (let t = 0; t < SWOOP_MS; t += 100) {
      rig = stepRig(rig, 'follow', CLOSE, 100);
      expect(rig.shown.distance).toBeLessThanOrEqual(last);
      // No frame jumps more than a fifth of the way.
      expect(last - rig.shown.distance).toBeLessThan((WIDE.distance - CLOSE.distance) / 5);
      last = rig.shown.distance;
    }
    expect(rig.shown).toEqual(CLOSE);
    expect(rig.from).toBeNull();
  });

  it('turns mid-swoop from wherever the camera is', () => {
    let rig = startRig('establishing', WIDE);
    rig = stepRig(rig, 'follow', CLOSE, 16);
    rig = stepRig(rig, 'follow', CLOSE, SWOOP_MS / 2);
    const midway = rig.shown;
    rig = stepRig(rig, 'establishing', WIDE, 16);
    expect(rig.shown).toEqual(midway);
    expect(rig.from).toEqual(midway);
  });
});
