import { describe, expect, it } from 'vitest';
import { buildWorldMap } from '../../../flow/worldMap';
import { CHAPTERS } from '../../../sim/levels';
import { type Drive, buildRoadPath, pointAt, stepDrive, tangentAt } from './roadPath';

const MAP = buildWorldMap(
  CHAPTERS.map((c) => ({ levelIds: c.levels.map((l) => l.id), starGate: c.starGate })),
);
const PATH = buildRoadPath(MAP);
const TUNING = { topSpeed: 10, accel: 24, hurryGap: 1000, maxHurry: 3 };

/** Drives from `from` to `to` at 60 frames a second; every place along the way. */
function drive(from: number, to: number, start: Drive = { distance: from, speed: 0 }): Drive[] {
  const frames: Drive[] = [start];
  let d = start;
  for (let i = 0; i < 60 * 30 && !(d.distance === to && d.speed === 0); i++) {
    d = stepDrive(d, to, 1000 / 60, TUNING);
    frames.push(d);
  }
  return frames;
}

describe('buildRoadPath', () => {
  it('puts each node at its own distance along the road', () => {
    MAP.nodes.forEach((node, i) => {
      const p = pointAt(PATH, PATH.nodeDistances[i] ?? -1);
      expect(p.x).toBeCloseTo(node.x, 6);
      expect(p.y).toBeCloseTo(node.y, 6);
    });
  });

  it('measures distance growing along the road, nodes in level order', () => {
    for (let i = 1; i < PATH.distances.length; i++) {
      expect(PATH.distances[i]).toBeGreaterThan(PATH.distances[i - 1] ?? Infinity);
    }
    for (let i = 1; i < PATH.nodeDistances.length; i++) {
      expect(PATH.nodeDistances[i]).toBeGreaterThan(PATH.nodeDistances[i - 1] ?? Infinity);
    }
    expect(PATH.length).toBe(PATH.distances[PATH.distances.length - 1]);
  });

  it('holds positions to the road ends', () => {
    expect(pointAt(PATH, -5)).toEqual(PATH.points[0]);
    expect(pointAt(PATH, PATH.length + 5)).toEqual(PATH.points[PATH.points.length - 1]);
  });

  it('gives a unit tangent pointing the way the road goes', () => {
    for (let d = 0; d <= PATH.length; d += 0.37) {
      const t = tangentAt(PATH, d);
      expect(Math.hypot(t.x, t.y)).toBeCloseTo(1, 6);
      const a = pointAt(PATH, d);
      const b = pointAt(PATH, d + 0.05);
      // Along the road, not against it.
      expect((b.x - a.x) * t.x + (b.y - a.y) * t.y).toBeGreaterThan(0);
    }
  });
});

describe('stepDrive', () => {
  it('drives from 1-1 to 2-1 through 1-2 and 1-3, never backing up', () => {
    const [from, , , to] = PATH.nodeDistances;
    if (from === undefined || to === undefined) throw new Error('too few levels');
    const frames = drive(from, to);
    const last = frames[frames.length - 1];
    expect(last).toEqual({ distance: to, speed: 0 });
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]?.distance).toBeGreaterThanOrEqual(frames[i - 1]?.distance ?? Infinity);
    }
    // Passes through the flags of 1-2 and 1-3 on the way.
    for (const node of [1, 2]) {
      const at = MAP.nodes[node];
      if (!at) throw new Error('no node');
      const nearest = Math.min(
        ...frames.map((f) => {
          const p = pointAt(PATH, f.distance);
          return Math.hypot(p.x - at.x, p.y - at.y);
        }),
      );
      expect(nearest).toBeLessThan(0.25);
    }
  });

  it('eases in and out and keeps to the top speed', () => {
    const [from, to] = PATH.nodeDistances;
    if (from === undefined || to === undefined) throw new Error('too few levels');
    const frames = drive(from, to);
    const speeds = frames.map((f) => f.speed);
    expect(speeds[1]).toBeLessThan(1);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(TUNING.topSpeed + 1e-9);
    expect(Math.abs(speeds[speeds.length - 2] ?? Infinity)).toBeLessThan(TUNING.topSpeed / 4);
  });

  it('turns back smoothly when the target changes mid-drive', () => {
    const [a, b] = PATH.nodeDistances;
    if (a === undefined || b === undefined) throw new Error('too few levels');
    const out = drive(a, b).slice(0, 20);
    const halfway = out[out.length - 1];
    if (!halfway) throw new Error('no frames');
    expect(halfway.speed).toBeGreaterThan(0);
    const back = drive(a, a, halfway);
    expect(back[back.length - 1]).toEqual({ distance: a, speed: 0 });
    // No jump: each frame moves less than top speed allows.
    for (let i = 1; i < back.length; i++) {
      const step = Math.abs((back[i]?.distance ?? 0) - (back[i - 1]?.distance ?? 0));
      expect(step).toBeLessThanOrEqual(TUNING.topSpeed / 60 + 1e-9);
    }
  });

  it('hurries over a long way, but not more than maxHurry times', () => {
    const tuning = { ...TUNING, hurryGap: 10 };
    let calm: Drive = { distance: 0, speed: 0 };
    let rushed: Drive = { distance: 0, speed: 0 };
    for (let i = 0; i < 120; i++) {
      calm = stepDrive(calm, 60, 1000 / 60, TUNING);
      rushed = stepDrive(rushed, 60, 1000 / 60, tuning);
      expect(rushed.speed).toBeLessThanOrEqual(TUNING.topSpeed * tuning.maxHurry + 1e-9);
    }
    expect(rushed.distance).toBeGreaterThan(calm.distance * 1.5);
  });

  it('never backs up or passes the target at jittery frame times', () => {
    let seed = 12345;
    const jitter = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return 4 + (seed / 2147483648) * 30;
    };
    const tuning = { ...TUNING, hurryGap: 12 };
    const nodes = PATH.nodeDistances;
    for (const frame of [jitter, () => 1000 / 120, () => 1000 / 60, () => 1000 / 30]) {
      for (let i = 0; i + 1 < nodes.length; i++) {
        for (const [from, to] of [
          [nodes[i], nodes[i + 1]],
          [nodes[i + 1], nodes[i]],
        ]) {
          if (from === undefined || to === undefined) throw new Error('no node');
          const dir = Math.sign(to - from);
          let d: Drive = { distance: from, speed: 0 };
          for (let k = 0; k < 600 && !(d.distance === to && d.speed === 0); k++) {
            d = stepDrive(d, to, frame(), tuning);
            expect(d.speed * dir).toBeGreaterThanOrEqual(0);
            expect((to - d.distance) * dir).toBeGreaterThanOrEqual(0);
          }
          expect(d).toEqual({ distance: to, speed: 0 });
        }
      }
    }
  });

  it('stays parked when already there', () => {
    expect(stepDrive({ distance: 3, speed: 0 }, 3, 16, TUNING)).toEqual({ distance: 3, speed: 0 });
  });
});
