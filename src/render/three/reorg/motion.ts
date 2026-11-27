/**
 * How the consultants' kit moves (pure, no three.js, so it can be tested):
 * every pose comes from the sim's tick and reorg schedule alone (the clock
 * from 4-2's `boardroom/motion.ts`), never wall time or the last frame, so
 * a still from a screenshot scene catches any moment, both ways, any number
 * of times.
 *
 * Closing (floor → wall), in the warning's last second: the new leaves
 * roll out of their line's free ends as a train, the farthest first, each
 * a hair behind the one in front; the wall is whole `TRAIN_END` ticks
 * before the tiles turn solid. Boxed-in leaves rise from the floor instead.
 *
 * Opening (wall → floor): the leaves that go unclip in the warning's last
 * half second (a shudder); at the switch they tip back and roll off into
 * their line's free ends, the nearest first, gone by `OPEN` ticks (under
 * 0.6 s). Boxed-in ones sink.
 *
 * Desks roll to their partner spot (the k-th desk to the k-th, as the sim
 * pairs them) round the switch; a long roll fades out near the old spot
 * and in near the new one. A desk whose old spot turns to wall clears it
 * before the train; one whose new spot is still wall comes in after the
 * walls have gone.
 *
 * Ticks `t` count from the switch: negative during the warning.
 */

import { REORG_WARNING_TICKS } from '../../../sim/balance';
import type { GridPoint } from '../../../sim/level';
import type { ReorgClock } from '../boardroom/motion';
import type { Leaf, LeafMove } from './layouts';

// ---- Timing, in ticks (60 a second) ----

/** The closing trains leave the ends this many ticks before the switch and are home this many before it. */
export const TRAIN_START = 56;
export const TRAIN_END = 4;
/** Boxed-in leaves rise over this window (ticks before the switch). */
const RISE_START = 40;
/** The leaving leaves unclip this long before the switch. */
export const UNLATCH = 30;
/** The opening trains are gone this long after the switch (under 0.6 s). */
export const OPEN = 32;
/** Boxed-in leaves sink over this long after the switch. */
const SINK = 22;
/** The tip back as an opening panel sets off. */
const TIP_IN = 6;

/** The train's pitch: a leaf's length and a hair, so they never touch on the move. */
const PITCH = 0.52;
const LEAF = 0.5;
const TIP = 0.1;
const SHUDDER = 0.018;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => {
  const u = clamp01(v);
  return u * u * (3 - 2 * u);
};
/** `v` from `a` to `b`, smoothed. */
export const ramp = (v: number, a: number, b: number): number => smooth((v - a) / (b - a));

/** One leaf's pose along its line. */
export interface LeafPose {
  visible: boolean;
  /** The middle of its visible part along the line. */
  c: number;
  /** Its visible length along the line (0.5 whole; less while it slides out of an end). */
  len: number;
  /** Its height, 0 to 1 (a boxed-in leaf rising or sinking). */
  rise: number;
  /** A lean back off the line (radians, the outer face up), while rolling. */
  tip: number;
  /** A small turn (the unclip shudder). */
  wobble: number;
}

const HIDDEN: LeafPose = { visible: false, c: 0, len: 0, rise: 1, tip: 0, wobble: 0 };

function standing(leaf: Leaf): LeafPose {
  return { visible: true, c: (leaf.a + leaf.b) / 2, len: LEAF, rise: 1, tip: 0, wobble: 0 };
}

/** The pose of a leaf whose far end (counted from the line's end into it) is at `far`. */
function onTrain(move: LeafMove, far: number, tip: number): LeafPose {
  if (far <= 0.005) return HIDDEN;
  const near = Math.max(0, far - LEAF);
  const mid = (far + near) / 2;
  return {
    visible: true,
    c: move.end + move.sign * mid,
    len: far - near,
    rise: 1,
    tip,
    wobble: 0,
  };
}

/**
 * Leaf `leaf` moving by `move` at `clock`. `animate` false (low quality)
 * snaps: the layout before the switch until it, the one after from it on.
 */
export function leafPose(leaf: Leaf, move: LeafMove, clock: ReorgClock, animate = true): LeafPose {
  const { change } = move;
  const { t } = clock;
  if (change === 'none') return HIDDEN;
  if (change === 'stay') return standing(leaf);
  const before = change === 'open';
  const standsNow = clock.from === clock.to ? !before || t < 0 : t < 0 ? before : !before;
  if (clock.from === clock.to || !animate) return standsNow ? standing(leaf) : HIDDEN;
  const { i, n } = move;
  if (change === 'close') {
    if (t >= -TRAIN_END) return standing(leaf);
    if (move.mode === 'rise') {
      if (t < -RISE_START) return HIDDEN;
      const r = ramp(t, -RISE_START + i * 2, -TRAIN_END - 2);
      return r <= 0.01 ? HIDDEN : { ...standing(leaf), rise: r };
    }
    if (t < -TRAIN_START) return HIDDEN;
    const hEnd = LEAF + (n - 1) * PITCH + 0.001;
    const h = hEnd * smooth((t + TRAIN_START) / (TRAIN_START - TRAIN_END));
    const target = (i + 1) * LEAF;
    const far = Math.min(target, h - (n - 1 - i) * PITCH);
    // Rolling with a little lean that settles as it arrives.
    const tip = TIP * 0.6 * clamp01((target - far) / 0.3);
    return far >= target - 1e-6 ? standing(leaf) : onTrain(move, far, tip);
  }
  // Opening.
  if (t < 0) {
    if (-t > UNLATCH) return standing(leaf);
    const g = ramp(t, -UNLATCH, -UNLATCH * 0.4);
    return { ...standing(leaf), wobble: SHUDDER * g * Math.sin(t * 1.7 + i * 2.1 + leaf.line) };
  }
  if (move.mode === 'rise') {
    if (t >= SINK) return HIDDEN;
    return { ...standing(leaf), rise: 1 - ramp(t, 0, SINK) };
  }
  if (t >= OPEN) return HIDDEN;
  // Slide toward the end, the nearest first; gaps open as they go.
  const travel = n * LEAF + 0.02;
  const d = travel * slide(t / OPEN);
  const far = (i + 1) * LEAF + i * 0.02 * ramp(t, 0, 6) - d;
  return onTrain(move, far, TIP * ramp(t, 0, TIP_IN));
}

/** Eased slide, 0 to 1: speed builds quickly, then coasts into the end. */
function slide(u: number): number {
  const v = clamp01(u);
  const k = 0.2;
  if (v < k) return (v * v) / (2 * k * (1 - k / 2));
  return (v - k / 2) / (1 - k / 2);
}

/** Whether a leaf stands whole in its place (for tests: a tile reads solid). */
export function leafWhole(pose: LeafPose): boolean {
  return pose.visible && pose.len >= LEAF - 1e-6 && pose.rise >= 1 - 1e-6;
}

// ---- Desks ----

/** A desk's pose: where it is and how solid it shows. */
export interface DeskPose {
  x: number;
  z: number;
  /** 1 solid, 0 gone (faded). */
  opacity: number;
}

/** A roll longer than this fades out and in instead of rolling the whole way. */
export const LONG_ROLL = 1.5;
/** How far a fading desk rolls while it fades. */
const FADE_ROLL = 0.4;

/** When the desk moves, ticks from the switch: [start, end] of its roll (or fade out), and of its fade in. */
export function deskWindows(
  from: GridPoint,
  to: GridPoint,
  early: boolean,
  late: boolean,
): { out: [number, number]; in: [number, number]; long: boolean } {
  const long = Math.hypot(to.x - from.x, to.y - from.y) > LONG_ROLL || (early && late);
  if (!long) {
    const w: [number, number] = early ? [-76, -TRAIN_START - 2] : late ? [16, 36] : [-12, 12];
    return { out: w, in: w, long };
  }
  return {
    out: early ? [-76, -TRAIN_START - 4] : [-16, 0],
    in: late ? [18, 36] : early ? [-TRAIN_START - 4, -40] : [0, 16],
    long,
  };
}

/**
 * Rolling desk from `from` to `to` at `clock` (`from` = `to` at rest).
 * `early`: its old spot turns to wall (it must clear before the train);
 * `late`: its new spot is wall until the switch (it comes after the walls go).
 */
export function deskPose(
  from: GridPoint,
  to: GridPoint,
  clock: ReorgClock,
  early: boolean,
  late: boolean,
  animate = true,
): DeskPose {
  const at = (p: GridPoint, opacity = 1): DeskPose => ({ x: p.x, z: p.y, opacity });
  if ((from.x === to.x && from.y === to.y) || clock.from === clock.to) return at(to);
  const { t } = clock;
  if (!animate) return at(t < 0 ? from : to);
  const w = deskWindows(from, to, early, late);
  const dx = to.x - from.x;
  const dz = to.y - from.y;
  if (!w.long) {
    const u = ramp(t, w.out[0], w.out[1]);
    return { x: from.x + dx * u, z: from.y + dz * u, opacity: 1 };
  }
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  if (t < w.in[0]) {
    const u = ramp(t, w.out[0], w.out[1]);
    return { x: from.x + ux * FADE_ROLL * u, z: from.y + uz * FADE_ROLL * u, opacity: 1 - u };
  }
  const u = ramp(t, w.in[0], w.in[1]);
  return {
    x: to.x - ux * FADE_ROLL * (1 - u),
    z: to.y - uz * FADE_ROLL * (1 - u),
    opacity: u,
  };
}

// ---- Doors and gates ----

/** How far a meeting door stands up, 0 to 1: rising with the wall that brings it, sinking as the wall goes. */
export function doorRise(
  inFrom: boolean,
  inTo: boolean,
  clock: ReorgClock,
  animate = true,
): number {
  const { t } = clock;
  if (clock.from === clock.to || inFrom === inTo) return inTo ? 1 : 0;
  if (!animate) return (t < 0 ? inFrom : inTo) ? 1 : 0;
  if (inTo) return t >= 0 ? 1 : ramp(t, -TRAIN_START + 10, -TRAIN_END - 4);
  return t < 0 ? 1 : 1 - ramp(t, 0, 18);
}

/** The gate glyphs' blink in the warning: which of the two directions shows (true: the coming one). */
export function gateShowsNext(clock: ReorgClock, animate = true): boolean {
  const { t } = clock;
  if (clock.from === clock.to) return true;
  if (t >= 0) return true;
  if (t < -REORG_WARNING_TICKS) return false;
  if (!animate) return false;
  return !swapBlink(-t);
}

/** True for the current direction's half of the blink; the period quickens as the switch nears. */
export function swapBlink(inTicks: number): boolean {
  const span = REORG_WARNING_TICKS;
  const r = Math.min(span, Math.max(0, inTicks));
  const slow = 40;
  const fast = 10;
  const k = (slow - fast) / span;
  const blinks = (Math.log(slow) - Math.log(fast + k * r)) / k;
  return blinks % 1 < 0.5;
}

/** The flaps swing from the old way to the new over this long after the switch. */
const FLAP_SWING = 14;

/** How far the flaps have swung from the old direction to the new one, 0 to 1. */
export function flapSwing(clock: ReorgClock, animate = true): number {
  if (clock.from === clock.to) return 1;
  if (clock.t < 0) return 0;
  return animate ? ramp(clock.t, 0, FLAP_SWING) : 1;
}
