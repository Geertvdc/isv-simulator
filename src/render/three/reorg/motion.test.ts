import { describe, expect, it } from 'vitest';
import { REORG_WARNING_TICKS, TICKS_PER_SECOND } from '../../../sim/balance';
import { THE_REORG } from '../../../sim/levels';
import { type ReorgStep, layoutOf } from '../../../sim/reorgs';
import { type ReorgClock, reorgClock } from '../boardroom/motion';
import {
  allLeaves,
  doorSpots,
  headerSigns,
  parkedStacks,
  partitionLayout,
  rollingDesks,
  transition,
} from './layouts';
import motionSource from './motion.ts?raw';
import layoutsSource from './layouts.ts?raw';
import {
  OPEN,
  TRAIN_END,
  deskPose,
  doorRise,
  flapSwing,
  gateIncoming,
  gateShowsNext,
  leafPose,
  leafWhole,
} from './motion';

const SECOND = TICKS_PER_SECOND;
const MAP = THE_REORG.map;

function clockAt(steps: readonly ReorgStep[], tick: number): ReorgClock {
  const done = steps.filter((s) => s.atTick <= tick);
  return reorgClock({
    tick,
    settings: { ...THE_REORG, reorgs: [...steps] },
    nextReorg: done.length,
    reorgPhase: done[done.length - 1]?.phase ?? 1,
  });
}

function phaseAt(steps: readonly ReorgStep[], tick: number): number {
  return steps.filter((s) => s.atTick <= tick).pop()?.phase ?? 1;
}

/** Silos → Open Plan → Matrix → Silos, a few seconds apart. */
const ROUND_TRIP: ReorgStep[] = [
  { atTick: 10 * SECOND, phase: 2 },
  { atTick: 20 * SECOND, phase: 3 },
  { atTick: 30 * SECOND, phase: 1 },
  { atTick: 40 * SECOND, phase: 3 },
  { atTick: 44 * SECOND, phase: 2 },
];

const LAYOUTS = [1, 2, 3].map((p) => partitionLayout(MAP, p));

function poses(steps: readonly ReorgStep[], tick: number, animate = true) {
  const clock = clockAt(steps, tick);
  const from = LAYOUTS[clock.from - 1];
  const to = LAYOUTS[clock.to - 1];
  if (!from || !to) throw new Error('no layout');
  const moves = transition(MAP, from, to);
  return [...allLeaves(MAP).values()].map((leaf) => {
    const move = moves.get(leaf.key);
    if (!move) throw new Error(`no move for ${leaf.key}`);
    return { leaf, pose: leafPose(leaf, move, clock, animate) };
  });
}

const TICKS = Array.from({ length: 50 * SECOND }, (_, i) => i + 5 * SECOND);

describe('the reorg partitions', () => {
  it('span every partition tile of every layout, edge to edge', () => {
    [1, 2, 3].forEach((phase) => {
      const layout = LAYOUTS[phase - 1];
      const tiles = layoutOf(MAP, phase)?.tiles ?? MAP.tiles;
      for (const i of MOVING) {
        if (tiles[i] !== 'wall') continue;
        const x = i % MAP.width;
        const y = Math.floor(i / MAP.width);
        const mine = [...(layout?.leaves.values() ?? [])].filter((l) => l.x === x && l.y === y);
        expect(mine.length, `${x},${y} in phase ${phase}`).toBeGreaterThanOrEqual(2);
      }
    });
  });

  it('draw a two-deep block as two walls with end caps, not a lattice', () => {
    const silos = LAYOUTS[0];
    const cross = [...(silos?.leaves.values() ?? [])].filter(
      (l) => l.axis === 'y' && l.y <= 2 && l.x > 8 && l.x < 13,
    );
    expect(cross).toEqual([]);
  });

  it('park stacks over the deep block so no floor shows between its fences', () => {
    const silos = LAYOUTS[0];
    if (!silos) throw new Error('no layout');
    const stacks = parkedStacks(MAP, silos, 1);
    // Rows 1 and 2, columns 8 to 13: every tile's half toward the other run, and row 1's toward the wall.
    for (let x = 8; x <= 13; x++) {
      const at = (y: number, dz: number) =>
        stacks.some((s) => s.x === x && s.y === y && Math.abs(s.cz - (y + dz)) < 1e-6);
      expect(at(1, 0.25), `${x},1 down`).toBe(true);
      expect(at(2, -0.25), `${x},2 up`).toBe(true);
      expect(at(1, -0.25), `${x},1 up`).toBe(true);
    }
    // Every stack sits on a partition tile of that layout, never over walkable floor.
    [1, 2, 3].forEach((phase) => {
      const layout = LAYOUTS[phase - 1];
      if (!layout) return;
      const tiles = layoutOf(MAP, phase)?.tiles ?? MAP.tiles;
      for (const s of parkedStacks(MAP, layout, phase))
        expect(tiles[s.y * MAP.width + s.x], `${s.x},${s.y} in ${phase}`).toBe('wall');
    });
    // The Matrix's single runs and corners stay thin.
    const matrix = LAYOUTS[2];
    if (matrix) expect(parkedStacks(MAP, matrix, 3).filter((s) => s.y > 1)).toEqual([]);
  });

  it('give each run one header board, the deep block one in front', () => {
    const names = ['A', 'B', 'C'];
    const silos = [...headerSigns(LAYOUTS[0] ?? partitionLayout(MAP, 1), names).keys()];
    const rows = silos.map((k) => Number(k.split(',')[1]));
    expect(rows.sort()).toEqual([2, 6]);
    expect(headerSigns(LAYOUTS[1] ?? partitionLayout(MAP, 2), names).size).toBe(0);
  });

  it('stand whole exactly on the tiles that are walls, at rest in every layout', () => {
    for (const steps of [ROUND_TRIP]) {
      for (const tick of [9 * SECOND - 200, 15 * SECOND, 25 * SECOND, 35 * SECOND, 47 * SECOND]) {
        const phase = phaseAt(steps, tick);
        const tiles = layoutOf(MAP, phase)?.tiles ?? MAP.tiles;
        for (const { leaf, pose } of poses(steps, tick)) {
          const wall = tiles[leaf.y * MAP.width + leaf.x] === 'wall';
          const mine = LAYOUTS[phase - 1]?.leaves.has(leaf.key) ?? false;
          expect(pose.visible && leafWhole(pose), `${leaf.key} at ${tick}`).toBe(mine);
          if (mine) expect(wall).toBe(true);
        }
      }
    }
  });

  it('close in time: every leaf of a tile that turns solid is whole by the switch', () => {
    for (const step of ROUND_TRIP) {
      const tiles = layoutOf(MAP, step.phase)?.tiles ?? MAP.tiles;
      for (const tick of [step.atTick - TRAIN_END, step.atTick, step.atTick + 1]) {
        for (const { leaf, pose } of poses(ROUND_TRIP, tick)) {
          if (tiles[leaf.y * MAP.width + leaf.x] !== 'wall') continue;
          if (!LAYOUTS[step.phase - 1]?.leaves.has(leaf.key)) continue;
          expect(leafWhole(pose), `${leaf.key} at ${tick - step.atTick}`).toBe(true);
        }
      }
    }
  });

  it('open in time: no whole leaf stands on a walkable tile 0.6 s after the switch', () => {
    for (const tick of TICKS) {
      const tiles = layoutOf(MAP, phaseAt(ROUND_TRIP, tick))?.tiles ?? MAP.tiles;
      const clock = clockAt(ROUND_TRIP, tick);
      if (clock.from !== clock.to && clock.t < 0.6 * SECOND) continue;
      for (const { leaf, pose } of poses(ROUND_TRIP, tick)) {
        if (tiles[leaf.y * MAP.width + leaf.x] === 'wall') continue;
        expect(pose.visible, `${leaf.key} at ${clock.t}`).toBe(false);
      }
    }
    expect(OPEN).toBeLessThanOrEqual(0.6 * SECOND);
  });

  it('roll in from the ends as a train during the warning, not before', () => {
    const switchTick = 20 * SECOND; // Open Plan → Matrix: every partition comes in.
    const early = poses(ROUND_TRIP, switchTick - REORG_WARNING_TICKS + 10);
    expect(early.filter((p) => p.pose.visible)).toEqual([]);
    const mid = poses(ROUND_TRIP, switchTick - 25);
    const moving = mid.filter((p) => p.pose.visible && !leafWhole(p.pose));
    const whole = mid.filter((p) => leafWhole(p.pose));
    expect(moving.length).toBeGreaterThan(0);
    expect(whole.length).toBeGreaterThan(0);
  });

  it('snap on low quality', () => {
    for (const step of ROUND_TRIP) {
      const before = poses(ROUND_TRIP, step.atTick - 20, false);
      const after = poses(ROUND_TRIP, step.atTick, false);
      for (const list of [before, after])
        for (const { pose } of list) if (pose.visible) expect(leafWhole(pose)).toBe(true);
    }
  });

  it('are deterministic: the same tick gives the same poses', () => {
    for (const tick of [10 * SECOND - 30, 20 * SECOND + 10, 30 * SECOND - 5]) {
      expect(poses(ROUND_TRIP, tick)).toEqual(poses(ROUND_TRIP, tick));
    }
  });
});

describe('the rolling desks', () => {
  const desks = rollingDesks(MAP);
  it('pair up in reading order, four of them', () => {
    expect(desks).toHaveLength(4);
    expect(desks[0]?.spots[0]).toEqual({ x: 3, y: 5 });
  });

  it('stand on their sim spot at rest and after every switch, faded only mid-move', () => {
    for (const tick of TICKS) {
      const clock = clockAt(ROUND_TRIP, tick);
      const phase = phaseAt(ROUND_TRIP, tick);
      desks.forEach((desk) => {
        const from = desk.spots[clock.from - 1] ?? { x: 0, y: 0 };
        const to = desk.spots[clock.to - 1] ?? from;
        const wallIn = (p: number, s: { x: number; y: number }): boolean =>
          (layoutOf(MAP, p)?.tiles ?? MAP.tiles)[s.y * MAP.width + s.x] === 'wall';
        const pose = deskPose(from, to, clock, wallIn(clock.to, from), wallIn(clock.from, to));
        if (clock.t > 0.7 * SECOND || clock.from === clock.to) {
          const here = desk.spots[phase - 1];
          expect({ x: pose.x, z: pose.z, opacity: pose.opacity }).toEqual({
            x: here?.x,
            z: here?.y,
            opacity: 1,
          });
        }
      });
    }
  });
});

describe('doors and gates', () => {
  it('find the meeting doors of Silos and Matrix in the partition line', () => {
    const doors = doorSpots(MAP);
    expect(doors.map((d) => `${d.x},${d.y},${d.axis}`).sort()).toEqual(
      ['13,3,y', '13,4,y', '8,3,y', '8,4,y'].sort(),
    );
  });

  it('raise a door with its wall and drop it as the wall goes', () => {
    const at = (t: number): ReorgClock => ({ from: 1, to: 2, t });
    expect(doorRise(true, false, at(-100))).toBe(1);
    expect(doorRise(true, false, at(30))).toBe(0);
    expect(doorRise(false, true, { from: 2, to: 3, t: 0 })).toBe(1);
  });

  it('keep the live way green through the warning, flash the coming one amber, swap at the switch', () => {
    const warning = Array.from({ length: REORG_WARNING_TICKS }, (_, i) => ({
      from: 1,
      to: 2,
      t: -REORG_WARNING_TICKS + i,
    }));
    expect(warning.every((c) => !gateShowsNext(c))).toBe(true);
    const amber = warning.map((c) => gateIncoming(c));
    expect(amber.every((a) => a > 0)).toBe(true);
    expect(amber.some((a) => a === 1)).toBe(true);
    expect(amber.some((a) => a < 1)).toBe(true);
    expect(gateShowsNext({ from: 1, to: 2, t: 0 })).toBe(true);
    expect(gateIncoming({ from: 1, to: 2, t: 0 })).toBe(0);
    expect(gateIncoming({ from: 1, to: 2, t: -REORG_WARNING_TICKS - 1 })).toBe(0);
    expect(gateIncoming({ from: 2, to: 2, t: -5 })).toBe(0);
    expect(flapSwing({ from: 1, to: 2, t: 30 })).toBe(1);
    // Low quality: a steady amber, no blink.
    expect(warning.every((c) => gateIncoming(c, false) === 1)).toBe(true);
  });
});

it('keeps the pose code pure: no wall time or randomness', () => {
  for (const src of [motionSource, layoutsSource]) {
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|from 'three'/);
  }
});

const MOVING = new Set(
  MAP.tiles.flatMap((_, i) => {
    const phases = MAP.phases ?? [];
    return phases.some((p) => p.tiles[i] !== MAP.tiles[i]) ? [i] : [];
  }),
);
