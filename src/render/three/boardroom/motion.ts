/**
 * How the operable wall moves (pure, no three.js, so it can be tested):
 * every pose is worked out from the sim's tick and reorg schedule alone,
 * never from wall time or the last frame, so a screenshot scene catches
 * any moment and the walls work any number of times both ways.
 *
 * Closing (floor → wall), in the warning's last second: the pocket doors
 * swing open, the table halves roll together, then the panels leave the
 * pockets one after another as a train along the track, the farthest
 * first, each turning flat to its place as it arrives; the wall is whole
 * a few ticks before the tiles turn solid.
 *
 * Opening (wall → floor): in the warning's last half second the panels
 * unlatch (the seals lift, a shudder, a gap opens at every joint and the
 * middle seam parts); at the switch each panel's two leaves hinge into a
 * zigzag and the trains slide back into the pockets, flattening and
 * stacking side by side in about half a second; the pocket doors close
 * after them and the table halves roll apart to the sides.
 *
 * Ticks `t` count from the switch: negative during the warning, positive
 * after it.
 */

import { REORG_WARNING_TICKS } from '../../../sim/balance';
import type { GameState } from '../../../sim/state';
import { type P2, type WallRun, outerAt, pointAt, tallAt } from './track';

/** Where the walls are in the reorg schedule: from layout `from` to layout `to`, `t` ticks from the switch. */
export interface ReorgClock {
  from: number;
  to: number;
  t: number;
}

/** Far from any switch: everything at rest. */
const AT_REST = 1e9;

// ---- Timing, in ticks (60 a second) ----

/** The closing train: leaves the pockets this many ticks before the switch, whole this many before it. */
export const TRAIN_START = 54;
export const TRAIN_END = 3;
/** The pocket doors swing open just before the train (ticks before the switch). */
const DOOR_OPEN_START = 78;
const DOOR_OPEN_END = 60;
/**
 * The table halves roll together around the train (ticks before the
 * switch): just off the track before the train comes through (a ticket on a
 * half stays by its end), then home as the tiles switch.
 */
const DESK_CLEAR_START = 47;
const DESK_CLEAR_END = 40;
const DESK_CLOSE_START = 10;
const DESK_CLOSE_END = 1;
/** Unlatching before the walls open (ticks before the switch). */
export const UNLATCH = 30;
/**
 * The fold: the leaves hinge over `FOLD_IN` ticks and the trains are
 * stacked by `FOLD` (after the switch). The slide picks up over
 * `SLIDE_RAMP` ticks and then coasts into the pockets, so the far panels
 * are past the table's spots early and the stack settles softly.
 */
const FOLD_IN = 6;
const SLIDE_RAMP = 6;
export const FOLD = 32;
/** The pocket doors close after the stack (ticks after the switch). */
const DOOR_CLOSE_START = 36;
const DOOR_CLOSE_END = 52;
/**
 * The table halves roll apart behind the trains (ticks after the switch):
 * up to the track at once (`DESK_NEAR` of the way, the half's end just clear
 * of the passing panels), then home onto the track as the last panel is by,
 * so a ticket the sim puts on a half at the switch is over it within a
 * quarter second and on it soon after.
 */
const DESK_NEAR_END = 12;
const DESK_NEAR = 0.62;
export const DESK_HOME_START = 17;
export const DESK_HOME_END = 22;
/** The beacons turn from the warning until the doors are shut again. */
const BEACON_AFTER = DOOR_CLOSE_END;

// ---- Shapes ----

/** How far the trains' panels stand apart while closing (a touch over one, so they never touch). */
const TRAIN_GAP = 1.04;
/** A travelling panel's leaves ride a little folded and turn flat as they arrive. */
const CARRY_FOLD = 0.24;
/** The zigzag when the walls open. */
export const FOLD_ANGLE = 0.62;
const FOLD_SPACING = Math.cos(FOLD_ANGLE) + 0.035;
/** Unlatching: each joint opens this much (so the middle seam parts by about twice the run's half). */
const UNLATCH_GAP = 0.014;
/** The floor seals lift the panels this much while they're free to move. */
const SEAL_LIFT = 0.008;
const WOBBLE = 0.012;
/** The stack's pitch in a pocket: a panel's thickness and a hair. */
const STACK_PITCH = 0.15;
/** The blink while warned: its period at the start of the warning and at the switch. */
const BLINK_SLOW = 32;
const BLINK_FAST = 8;

/** One panel (two leaves hinged in the middle). */
export interface PanelPose {
  /** Its middle along the track. */
  s: number;
  /** Each leaf's turn off the track, radians (0 flat). */
  fold: number;
  /** Which side the hinge goes when folded on a straight bit of track: +1 outer. */
  foldSign: number;
  /** How far it stands off the track to the outer side (its slot in a pocket's stack). */
  lateral: number;
  /** Raised off the floor (the seals lifted). */
  lift: number;
  /** A small turn (the unlatching shudder). */
  wobble: number;
}

/** One leaf: where its middle stands, its turn (yaw, local +x along it, +z its outer face), and how far it's extended. */
export interface LeafPose {
  x: number;
  z: number;
  yaw: number;
  y: number;
  /** 1 full height, 0 cut down. */
  ext: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => {
  const u = clamp01(v);
  return u * u * (3 - 2 * u);
};
/** `v` from `a` to `b` (either way round), smoothed. */
const ramp = (v: number, a: number, b: number): number => smooth((v - a) / (b - a));

/** How far the opening trains have slid, 0 to 1 over `FOLD` ticks: speed rising over `SLIDE_RAMP`, then easing out. */
function slide(t: number): number {
  const u = Math.min(FOLD, Math.max(0, t));
  if (u < SLIDE_RAMP) return (u * u) / (SLIDE_RAMP * FOLD);
  return 1 - ((FOLD - u) * (FOLD - u)) / ((FOLD - SLIDE_RAMP) * FOLD);
}

/** Where the walls are in the schedule, from the live state. */
export function reorgClock(
  state: Pick<GameState, 'tick' | 'settings' | 'nextReorg' | 'reorgPhase'>,
): ReorgClock {
  const steps = state.settings.reorgs ?? [];
  const next = steps[state.nextReorg];
  if (next && next.atTick - state.tick <= REORG_WARNING_TICKS && next.atTick >= state.tick) {
    return { from: state.reorgPhase, to: next.phase, t: state.tick - next.atTick };
  }
  const last = steps[state.nextReorg - 1];
  if (last) {
    const before = steps[state.nextReorg - 2]?.phase ?? 1;
    return { from: before, to: state.reorgPhase, t: state.tick - last.atTick };
  }
  return { from: state.reorgPhase, to: state.reorgPhase, t: AT_REST };
}

type Change = 'rest' | 'closing' | 'opening';

function changeOf(run: WallRun, clock: ReorgClock): { change: Change; closedNow: boolean } {
  const from = run.closed[clock.from - 1] ?? true;
  const to = run.closed[clock.to - 1] ?? from;
  if (from === to) return { change: 'rest', closedNow: to };
  return { change: to ? 'closing' : 'opening', closedNow: clock.t < 0 ? from : to };
}

/** Panel `k`'s pocket (0 or 1), its place counted from that pocket and how many share it. */
export function panelGroup(run: WallRun, k: number): { pocket: 0 | 1; i: number; n: number } {
  return k < run.split
    ? { pocket: 0, i: k, n: run.split }
    : { pocket: 1, i: run.length - 1 - k, n: run.length - run.split };
}

/** Where the `i`-th panel of `n` stands in its pocket's stack, off the track (the first in on the outer side). */
function slot(i: number, n: number): number {
  const pitch = Math.min(STACK_PITCH, 0.9 / Math.max(1, n));
  return ((n - 1) / 2 - i) * pitch;
}

/**
 * Panel `k` at `clock`. `animate` false (low quality) snaps: the layout
 * before the switch until it, the one after from it on.
 */
export function panelPose(run: WallRun, k: number, clock: ReorgClock, animate = true): PanelPose {
  const { pocket, i, n } = panelGroup(run, k);
  const foldSign = k % 2 === 0 ? 1 : -1;
  // `u` counts from this panel's own pocket's mouth.
  const toS = (u: number): number => (pocket === 0 ? u : run.length - u);
  const standing: PanelPose = {
    s: toS(i + 0.5),
    fold: 0,
    foldSign,
    lateral: 0,
    lift: 0,
    wobble: 0,
  };
  const stacked: PanelPose = { ...standing, s: toS(-0.5), lateral: slot(i, n) };
  const { change, closedNow } = changeOf(run, clock);
  const { t } = clock;
  if (change === 'rest' || !animate) return closedNow ? standing : stacked;
  if (change === 'closing') {
    if (t >= 0) return standing;
    if (-t > TRAIN_START) return stacked;
    // The train: the farthest panel leaves first, the others follow a panel's length behind.
    const hEnd = 1 + (n - 1) * TRAIN_GAP + 0.001;
    const h = hEnd * smooth((t + TRAIN_START) / (TRAIN_START - TRAIN_END));
    const a = Math.min(i, -1 + Math.max(0, h - (n - 1 - i) * TRAIN_GAP));
    const out = clamp01(a + 1);
    return {
      ...standing,
      s: toS(a + 0.5),
      fold: CARRY_FOLD * clamp01(out / 0.6) * clamp01((i - a) / 0.45),
      lateral: slot(i, n) * (1 - smooth(out)),
    };
  }
  // Opening.
  if (t < 0) {
    if (-t > UNLATCH) return standing;
    const g = ramp(t, -UNLATCH, -UNLATCH * 0.4);
    return {
      ...standing,
      s: toS(i + 0.5 - UNLATCH_GAP * (i + 1) * g),
      lift: SEAL_LIFT * g,
      wobble: WOBBLE * g * Math.sin(t * 1.9 + k * 2.3) * (t > -10 ? 1 : 0.5),
    };
  }
  if (t >= FOLD) return stacked;
  const f = smooth(t / FOLD_IN);
  const spacing = 1 + (FOLD_SPACING - 1) * f;
  const fEnd = (n - 0.5) * FOLD_SPACING - UNLATCH_GAP * n + 0.5 + 0.01;
  const c = Math.max(-0.5, (i + 0.5) * spacing - UNLATCH_GAP * (i + 1) - fEnd * slide(t));
  const out = clamp01(c - 0.5 + 1);
  return {
    ...standing,
    s: toS(c),
    fold: FOLD_ANGLE * f * out,
    lateral: slot(i, n) * (1 - smooth(out)),
    lift: SEAL_LIFT,
  };
}

/** The two leaves of panel `pose` (the first toward the track's start). */
export function leafPoses(run: WallRun, pose: PanelPose): [LeafPose, LeafPose] {
  const half = 0.5 * Math.cos(pose.fold);
  const a = pointAt(run, pose.s - half).p;
  const b = pointAt(run, pose.s + half).p;
  const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const chord = Math.hypot(b.x - a.x, b.z - a.z);
  const rise = Math.sqrt(Math.max(0, 0.25 - (chord * chord) / 4));
  // The hinge goes the way the track bends; on a straight bit, the way the panel folds.
  const onTrack = pointAt(run, pose.s).p;
  const bulge = { x: onTrack.x - mid.x, z: onTrack.z - mid.z };
  const bulgeLen = Math.hypot(bulge.x, bulge.z);
  const outer = outerAt(run, pose.s);
  const dir: P2 =
    bulgeLen > 0.02
      ? { x: bulge.x / bulgeLen, z: bulge.z / bulgeLen }
      : { x: outer.x * pose.foldSign, z: outer.z * pose.foldSign };
  const hinge = { x: mid.x + dir.x * rise, z: mid.z + dir.z * rise };
  const shift = { x: outer.x * pose.lateral, z: outer.z * pose.lateral };
  const leaf = (p: P2, q: P2, s: number): LeafPose => ({
    x: (p.x + q.x) / 2 + shift.x,
    z: (p.z + q.z) / 2 + shift.z,
    yaw: Math.atan2(-(q.z - p.z), q.x - p.x) + pose.wobble,
    y: pose.lift,
    ext: tallAt(run, s),
  });
  return [leaf(a, hinge, pose.s - 0.25), leaf(hinge, b, pose.s + 0.25)];
}

/** How far the pocket doors stand open, 0 shut to 1 (swung out flat against the track). */
export function doorOpen(run: WallRun, clock: ReorgClock, animate = true): number {
  const { change, closedNow } = changeOf(run, clock);
  const rest = closedNow ? 1 : 0;
  if (change === 'rest' || !animate) return rest;
  const { t } = clock;
  if (change === 'closing') return t >= 0 ? 1 : ramp(t, -DOOR_OPEN_START, -DOOR_OPEN_END);
  return t < 0 ? 1 : 1 - ramp(t, DOOR_CLOSE_START, DOOR_CLOSE_END);
}

/** How far the table halves have rolled from layout `from`'s spots to layout `to`'s, 0 to 1. */
export function deskRoll(run: WallRun | undefined, clock: ReorgClock, animate = true): number {
  if (clock.from === clock.to) return 1;
  const { t } = clock;
  if (!animate) return t < 0 ? 0 : 1;
  const closing = run ? changeOf(run, clock).change === 'closing' : false;
  if (t >= 0 && closing) return 1;
  if (closing)
    return t < -DESK_CLOSE_START
      ? (1 - DESK_NEAR) * ramp(t, -DESK_CLEAR_START, -DESK_CLEAR_END)
      : 1 - DESK_NEAR + DESK_NEAR * ramp(t, -DESK_CLOSE_START, -DESK_CLOSE_END);
  if (t < 0) return 0;
  return t < DESK_HOME_START
    ? DESK_NEAR * ramp(t, 0, DESK_NEAR_END)
    : DESK_NEAR + (1 - DESK_NEAR) * ramp(t, DESK_HOME_START, DESK_HOME_END);
}

/**
 * Whether every panel of the run stands in its place, so the head rail
 * over it is drawn: closed and at rest, the train home, or not yet unlatched.
 */
export function runWhole(run: WallRun, clock: ReorgClock, animate = true): boolean {
  const { change, closedNow } = changeOf(run, clock);
  if (change === 'rest' || !animate) return closedNow;
  if (change === 'closing') return clock.t >= -TRAIN_END;
  return clock.t < -UNLATCH;
}

/** Whether the pocket beacons turn, and their turn. */
export function beacon(clock: ReorgClock): { on: boolean; angle: number } {
  const on = clock.from !== clock.to && clock.t >= -REORG_WARNING_TICKS && clock.t <= BEACON_AFTER;
  return { on, angle: on ? clock.t * 0.21 : 0 };
}

/** Whether the warned track is lit at `inTicks` before the switch: a blink that quickens as it nears. */
export function blinkOn(inTicks: number): boolean {
  const span = REORG_WARNING_TICKS;
  const r = Math.min(span, Math.max(0, inTicks));
  // The blinks so far: the period runs from slow to fast as `r` falls, so integrate 1 / period.
  const k = (BLINK_SLOW - BLINK_FAST) / span;
  const blinks = (Math.log(BLINK_SLOW) - Math.log(BLINK_FAST + k * r)) / k;
  return blinks % 1 < 0.62;
}
