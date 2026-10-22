import { describe, expect, it } from 'vitest';
import { CARRY_HEIGHT } from './layout';
import { type PoseInput, playerPose, turnToward } from './pose';

const still: PoseInput = {
  speed: 0,
  fullSpeed: 5,
  carrying: false,
  working: false,
  dashing: false,
  windUp: 0,
  shovedMs: null,
  phase: 0,
};

describe('playerPose', () => {
  it('stands still and upright when idle, only breathing', () => {
    for (const t of [0, 250, 900]) {
      const p = playerPose(still, t);
      expect(p.bob).toBe(0);
      expect(p.lean).toBe(0);
      expect(Math.abs(p.squash.y - 1)).toBeLessThan(0.02);
    }
  });

  it('bobs and leans forward while walking, more at full speed', () => {
    const slow = { ...still, speed: 1.5 };
    const fast = { ...still, speed: 5 };
    const bobs = (input: PoseInput) =>
      Math.max(...Array.from({ length: 40 }, (_, i) => playerPose(input, i * 25).bob));
    expect(bobs(fast)).toBeGreaterThan(bobs(slow));
    expect(bobs(slow)).toBeGreaterThan(0);
    expect(playerPose(fast, 100).lean).toBeGreaterThan(playerPose(slow, 100).lean);
  });

  it('holds a carried ticket out front at carry height', () => {
    const p = playerPose({ ...still, carrying: true }, 0);
    expect(p.leftHand.y).toBeCloseTo(CARRY_HEIGHT + 0.03);
    expect(p.leftHand.z).toBeGreaterThan(0.3);
    expect(p.leftHand.x).toBeLessThan(0);
    expect(p.rightHand.x).toBeGreaterThan(0);
  });

  it('taps both hands in turn and nods while working', () => {
    const a = playerPose({ ...still, working: true }, 10);
    const b = playerPose({ ...still, working: true }, 65);
    expect(a.nod).toBeGreaterThan(0);
    expect(a.leftHand.y - a.rightHand.y).not.toBeCloseTo(b.leftHand.y - b.rightHand.y);
  });

  it('squashes wide and flat while dashing', () => {
    const p = playerPose({ ...still, speed: 14, dashing: true }, 0);
    expect(p.squash.x).toBeGreaterThan(1);
    expect(p.squash.y).toBeLessThan(1);
    expect(p.lean).toBeGreaterThan(0.2);
  });

  it('leans back with hands up while winding up a throw', () => {
    const p = playerPose({ ...still, carrying: true, windUp: 1 }, 0);
    expect(p.lean).toBeLessThan(0);
    expect(p.leftHand.y).toBeGreaterThan(0.9);
  });

  it('wobbles after a shove and settles', () => {
    const rolls = Array.from({ length: 10 }, (_, i) =>
      Math.abs(playerPose({ ...still, shovedMs: i * 30 }, 0).roll),
    );
    expect(Math.max(...rolls)).toBeGreaterThan(0.1);
    expect(playerPose({ ...still, shovedMs: 1000 }, 0).roll).toBe(0);
  });
});

describe('turnToward', () => {
  it('turns the short way round and stops on target', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(0.9, 1, 0.25)).toBe(1);
    expect(turnToward(3, -3, 0.25)).toBeCloseTo(3.25);
  });
});
