import { describe, expect, it } from 'vitest';
import synergyDraft from '../../../../maps/level-11-synergy.txt?raw';
import synergyPhase2 from '../../../../maps/level-11-synergy.phase2.txt?raw';
import { REORG_WARNING_TICKS, TICKS_PER_SECOND } from '../../../sim/balance';
import { type LevelMap, parseLevelMap, withPhases } from '../../../sim/level';
import { SYNERGY } from '../../../sim/levels';
import type { ReorgStep } from '../../../sim/reorgs';
import foldingWallsSource from './foldingWalls.ts?raw';
import modelsSource from './models.ts?raw';
import motionSource from './motion.ts?raw';
import trackSource from './track.ts?raw';
import {
  FOLD,
  type ReorgClock,
  TRAIN_END,
  deskRoll,
  doorOpen,
  leafPoses,
  panelPose,
  reorgClock,
  runWhole,
} from './motion';
import { type WallRun, desks, solidIn, wallRuns } from './track';

const SECOND = TICKS_PER_SECOND;
const FLIPPED: LevelMap = withPhases(parseLevelMap(synergyPhase2), [synergyDraft]);

/** The clock at `tick`, the schedule applied as the sim does (a step happens on its tick). */
function clockAt(steps: readonly ReorgStep[], tick: number): ReorgClock {
  const done = steps.filter((s) => s.atTick <= tick);
  return reorgClock({
    tick,
    settings: { ...SYNERGY, reorgs: [...steps] },
    nextReorg: done.length,
    reorgPhase: done[done.length - 1]?.phase ?? 1,
  });
}

/** The live layout's phase at `tick`. */
function phaseAt(steps: readonly ReorgStep[], tick: number): number {
  return steps.filter((s) => s.atTick <= tick).pop()?.phase ?? 1;
}

/** Every tick from before the first warning to well after the last switch. */
function ticks(steps: readonly ReorgStep[]): number[] {
  const first = (steps[0]?.atTick ?? 0) - REORG_WARNING_TICKS - 30;
  const last = (steps[steps.length - 1]?.atTick ?? 0) + 2 * SECOND;
  return Array.from({ length: last - first }, (_, i) => first + i);
}

/** Many switches both ways, the last a few seconds apart (the warning's length and a bit). */
const BACK_AND_FORTH: ReorgStep[] = [10, 20, 30, 40, 44, 48, 52].map((s, i) => ({
  atTick: s * SECOND,
  phase: i % 2 === 0 ? 2 : 1,
}));

const CASES: { name: string; map: LevelMap; steps: readonly ReorgStep[] }[] = [
  { name: 'Synergy', map: SYNERGY.map, steps: SYNERGY.reorgs ?? [] },
  { name: 'Synergy, back and forth', map: SYNERGY.map, steps: BACK_AND_FORTH },
  {
    name: 'Synergy with the open layout first',
    map: FLIPPED,
    steps: BACK_AND_FORTH.map((s) => ({ ...s, phase: s.phase === 2 ? 2 : 1 })),
  },
];

function theRun(map: LevelMap): WallRun {
  const run = wallRuns(map)[0];
  if (!run) throw new Error('no run');
  return run;
}

describe('the operable wall in motion', () => {
  for (const { name, map, steps } of CASES) {
    const run = theRun(map);
    it(`stands whole on every tile by the tick it is solid (${name})`, () => {
      for (const tick of ticks(steps)) {
        const clock = clockAt(steps, tick);
        const phase = phaseAt(steps, tick);
        run.tiles.forEach((t, k) => {
          if (
            !solidIn(map, phase, t.x, t.y) ||
            map.phases?.[phase - 1]?.tiles[t.y * map.width + t.x] !== 'wall'
          )
            return;
          const pose = panelPose(run, k, clock);
          expect({ tick, k, at: Math.abs(pose.s - (k + 0.5)) < 0.1 }).toEqual({
            tick,
            k,
            at: true,
          });
          expect(pose.fold).toBeLessThan(0.01);
          expect(pose.lateral).toBe(0);
        });
      }
    });

    it(`never leaves a whole panel standing on walkable floor for more than ~0.6 s (${name})`, () => {
      const standing = new Map<number, number>();
      let longest = 0;
      for (const tick of ticks(steps)) {
        const clock = clockAt(steps, tick);
        const phase = phaseAt(steps, tick);
        for (let k = 0; k < run.length; k++) {
          const pose = panelPose(run, k, clock);
          const tile = run.tiles[Math.floor(pose.s)];
          const onFloor =
            pose.s > 0 &&
            pose.s < run.length &&
            tile !== undefined &&
            !solidIn(map, phase, tile.x, tile.y);
          const flat = pose.fold < 0.1 && Math.abs(pose.lateral) < 0.05;
          const run_ = onFloor && flat ? (standing.get(k) ?? 0) + 1 : 0;
          standing.set(k, run_);
          longest = Math.max(longest, run_);
        }
      }
      expect(longest).toBeLessThanOrEqual(0.6 * SECOND);
    });

    it(`comes to rest in the pockets when open and on the track when closed, every time (${name})`, () => {
      for (const step of steps) {
        const settled = clockAt(steps, step.atTick + FOLD + 20);
        const closed = run.closed[step.phase - 1];
        for (let k = 0; k < run.length; k++) {
          const pose = panelPose(run, k, settled);
          if (closed) expect(pose.s).toBeCloseTo(k + 0.5);
          else expect(pose.s < 0 || pose.s > run.length).toBe(true);
        }
        expect(doorOpen(run, settled)).toBe(closed ? 1 : 0);
        expect(deskRoll(run, settled)).toBe(1);
      }
    });

    it(`keeps the table halves clear of the panels while both move (${name})`, () => {
      const halves = desks(map);
      for (const tick of ticks(steps)) {
        const clock = clockAt(steps, tick);
        const roll = deskRoll(run, clock);
        const tables = halves.map((d) => {
          const from = d.spots[clock.from - 1] ?? d.spots[0];
          const to = d.spots[clock.to - 1] ?? from;
          if (!from || !to) throw new Error('no spot');
          return { x: from.x + (to.x - from.x) * roll, z: from.y + (to.y - from.y) * roll };
        });
        for (let k = 0; k < run.length; k++) {
          for (const leaf of leafPoses(run, panelPose(run, k, clock))) {
            for (const table of tables) {
              // The top is about 0.97 by 0.76; a leaf is 0.2 thick: its middle must stay out of that.
              const inside =
                Math.abs(leaf.x - table.x) < 0.48 + 0.1 && Math.abs(leaf.z - table.z) < 0.38 + 0.1;
              expect({ tick, k, inside }).toEqual({ tick, k, inside: false });
            }
          }
        }
      }
    });
  }

  it('draws the head rail only while every panel stands in its place', () => {
    for (const { map, steps } of CASES) {
      const run = theRun(map);
      for (const tick of ticks(steps)) {
        const clock = clockAt(steps, tick);
        if (!runWhole(run, clock)) continue;
        for (let k = 0; k < run.length; k++) {
          const pose = panelPose(run, k, clock);
          expect({ tick, k, s: pose.s }).toEqual({ tick, k, s: k + 0.5 });
          expect(pose.fold + Math.abs(pose.lateral) + pose.lift).toBe(0);
        }
      }
    }
  });

  it('gets a table half under its ticket soon after the walls open', () => {
    // The sim puts a ticket on a half's new spot at the switch; count the ticks the half is off it.
    const run = theRun(SYNERGY.map);
    const [desk] = desks(SYNERGY.map);
    if (!desk) throw new Error('no desk');
    const [a, b] = desk.spots;
    if (!a || !b) throw new Error('no spots');
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    let off = 0;
    for (let t = 0; t < 60; t++) {
      const roll = deskRoll(run, { from: 1, to: 2, t });
      if ((1 - roll) * span > 0.25) off++;
    }
    expect(off).toBeLessThanOrEqual(22);
  });

  it('is whole a few ticks before the switch and opens only after it', () => {
    const run = theRun(SYNERGY.map);
    const closing = { from: 2, to: 1, t: -TRAIN_END };
    for (let k = 0; k < run.length; k++) expect(panelPose(run, k, closing).s).toBeCloseTo(k + 0.5);
    const unlatching = { from: 1, to: 2, t: -1 };
    for (let k = 0; k < run.length; k++)
      expect(Math.abs(panelPose(run, k, unlatching).s - (k + 0.5))).toBeLessThan(0.1);
  });

  it('snaps on low quality: the old layout until the switch, the new one from it', () => {
    const run = theRun(SYNERGY.map);
    for (let k = 0; k < run.length; k++) {
      expect(panelPose(run, k, { from: 2, to: 1, t: -20 }, false).s).toBe(
        panelPose(run, k, { from: 2, to: 2, t: 1e9 }).s,
      );
      expect(panelPose(run, k, { from: 1, to: 2, t: 2 }, false).s).toBe(
        panelPose(run, k, { from: 2, to: 2, t: 1e9 }).s,
      );
    }
  });

  it('works out every pose from the tick alone, the same each time', () => {
    const run = theRun(SYNERGY.map);
    const steps = SYNERGY.reorgs ?? [];
    for (const tick of [44.7, 45.2, 89.5, 89.8].map((s) => Math.round(s * SECOND))) {
      const a = run.tiles.map((_, k) => leafPoses(run, panelPose(run, k, clockAt(steps, tick))));
      const b = run.tiles.map((_, k) => leafPoses(run, panelPose(run, k, clockAt(steps, tick))));
      expect(a).toEqual(b);
    }
    for (const source of [foldingWallsSource, modelsSource, motionSource, trackSource]) {
      expect(source).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
});
