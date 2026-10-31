/**
 * How a developer stands this frame, worked out from what they're doing:
 * a pure function of a few facts about the player and the time, so the
 * animation can be tested without WebGL. Positions are in the character's
 * own space: feet at the origin, facing +z, in world units.
 *
 * The production rig attaches limbs to these common hand and gait targets.
 * Background people and the manager retain their original body posing.
 */

import { carryGrip, carryPoint } from './layout';

export interface PoseInput {
  /** Speed over the floor, tiles per second. */
  speed: number;
  /** Speed at which the walk is at full swing. */
  fullSpeed: number;
  carrying: boolean;
  /** Pressing work at a station that is making progress. */
  working: boolean;
  dashing: boolean;
  /** Throw wind-up, 0 (none) to 1 (about to let go). */
  windUp: number;
  /** Milliseconds since being shoved, or `null` when not stumbling. */
  shovedMs: number | null;
  /** Milliseconds since shoving someone out of the way, or `null`/absent. */
  shovingMs?: number | null;
  /** Milliseconds since letting a thrown ticket go, or `null`/absent. */
  throwingMs?: number | null;
  /** A per-character offset so a room of idle people doesn't breathe in sync. */
  phase: number;
  /**
   * Where the walk cycle is, radians: integrated frame by frame with
   * `advanceStride`, so a change of speed changes how fast it turns, never
   * where it is.
   */
  stride: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Pose {
  walk: number;
  stride: number;
  windUp: number;
  /** Lift of the whole body (a walk bounce). */
  bob: number;
  /** Lean forward (+) or back (−) around x, radians. */
  lean: number;
  /** Tilt sideways around z, radians (stumbling, waddling). */
  roll: number;
  /** Body scale: wide and flat while dashing, a little taller breathing in. */
  squash: { x: number; y: number };
  /** Head nod around x, radians (down while working). */
  nod: number;
  leftHand: Vec3;
  rightHand: Vec3;
  /** Holding a ticket: the hands are on it (`leftHand`/`rightHand` are exact). */
  carrying: boolean;
  /** Dashing, 0 or 1. */
  dash: number;
  /** Pushing out after a shove, 0 to 1 (rises fast, settles). */
  thrust: number;
  /** Stumbling after being shoved, 1 just hit, settling to 0. */
  stumble: number;
  /** Following through after a throw, 0 to 1 (snaps out, settles). */
  release: number;
}

/** Walk cycles per second: slow when ambling, faster at full speed (each cycle is two bounces). */
const STEP_HZ_SLOW = 1.6;
const STEP_HZ_FAST = 2.2;
const BOB = 0.05;
const LEAN_WALK = 0.14;
const LEAN_DASH = 0.35;
const BREATHE_HZ = 0.5;
const STUMBLE_MS = 350;
/** A shove's push: arms out for this long, then back. */
const THRUST_MS = 420;
/** Typing: how fast hands tap and how far. */
const TYPE_HZ = 9;
/** Where idle hands hang, either side of the belly, clear of the hoodie. */
const HAND_REST = { x: 0.4, y: 0.38, z: 0.05 };

/** How far into the walk `speed` is: 0 standing, 1 at `fullSpeed` and above. */
function walkAmount(speed: number, fullSpeed: number): number {
  return Math.min(1, speed / Math.max(0.01, fullSpeed));
}

/** Walk cycles per second at `speed`. */
export function strideHz(speed: number, fullSpeed: number): number {
  return STEP_HZ_SLOW + (STEP_HZ_FAST - STEP_HZ_SLOW) * walkAmount(speed, fullSpeed);
}

/**
 * The walk cycle `dtSeconds` on from `stride` (radians) at `speed`, kept in
 * [0, 2π). The cycle has to be integrated like this: working it out as
 * `time × frequency(speed)` makes every change of speed (turning, grazing a
 * counter on a diagonal) jump the cycle by `time × Δfrequency`, which is
 * many whole steps a few minutes into a round, so the bob and the hand
 * swing flick about.
 */
export function advanceStride(
  stride: number,
  speed: number,
  fullSpeed: number,
  dtSeconds: number,
): number {
  const next = stride + Math.PI * 2 * strideHz(speed, fullSpeed) * Math.max(0, dtSeconds);
  return next % (Math.PI * 2);
}

/**
 * How long the walk takes to follow a change of speed, seconds. The sim's
 * speed changes in steps (a diagonal walk loses its push into a counter in
 * one tick); easing what the walk shows keeps the bob and swing from popping.
 */
const GAIT_EASE_S = 0.06;

/** A character's walk as drawn: visual-only memory kept between frames. */
export interface Gait {
  /** Speed the walk shows, easing toward the real one. */
  speed: number;
  /** Where the walk cycle is, radians (see `PoseInput.stride`). */
  stride: number;
}

/** Moves `gait` on by `dtSeconds` of walking at `speed`. Mutates `gait`. */
export function stepGait(gait: Gait, speed: number, fullSpeed: number, dtSeconds: number): void {
  const dt = Math.max(0, dtSeconds);
  gait.speed += (speed - gait.speed) * (1 - Math.exp(-dt / GAIT_EASE_S));
  gait.stride = advanceStride(gait.stride, gait.speed, fullSpeed, dt);
}

/** The pose for `input` at `timeMs`. */
export function playerPose(input: PoseInput, timeMs: number): Pose {
  const t = timeMs / 1000 + input.phase;
  const walk = walkAmount(input.speed, input.fullSpeed);
  const stepPhase = input.stride;

  let bob = walk > 0.05 ? Math.abs(Math.sin(stepPhase)) * BOB * walk : 0;
  let lean = LEAN_WALK * walk;
  let roll = walk > 0.05 ? Math.sin(stepPhase) * 0.09 * walk : 0;
  const breathe = Math.sin(t * Math.PI * 2 * BREATHE_HZ) * 0.015 * (1 - walk);
  let squash = { x: 1 - breathe / 2, y: 1 + breathe };
  let nod = 0;

  // Hands swing opposite each other while walking.
  const swing = Math.sin(stepPhase) * 0.12 * walk;
  let leftHand: Vec3 = { x: -HAND_REST.x, y: HAND_REST.y, z: HAND_REST.z + swing };
  let rightHand: Vec3 = { x: HAND_REST.x, y: HAND_REST.y, z: HAND_REST.z - swing };

  const windUp = Math.max(0, Math.min(1, input.windUp));
  if (input.working) {
    // Hammering away: hands tap in turn, head down.
    const tap = Math.sin(t * Math.PI * 2 * TYPE_HZ);
    leftHand = { x: -0.16, y: 0.6 + Math.max(0, tap) * 0.06, z: 0.42 };
    rightHand = { x: 0.16, y: 0.6 + Math.max(0, -tap) * 0.06, z: 0.42 };
    nod = 0.25;
    lean = Math.max(lean, 0.1);
  }

  if (windUp > 0) {
    // Leaning back, the ticket swung over the shoulder (the hands are on it).
    lean = -0.3 * windUp;
  }

  if (input.dashing) {
    squash = { x: 1.2, y: 0.85 };
    lean = LEAN_DASH;
    bob = 0;
    if (!input.carrying) {
      // Arms flung back.
      leftHand = { x: -0.34, y: 0.55, z: -0.35 };
      rightHand = { x: 0.34, y: 0.55, z: -0.35 };
    }
  }

  let stumble = 0;
  if (input.shovedMs !== null && input.shovedMs < STUMBLE_MS) {
    // A wobble that dies down.
    const k = 1 - input.shovedMs / STUMBLE_MS;
    stumble = k;
    roll += Math.sin((input.shovedMs / STUMBLE_MS) * Math.PI * 4) * 0.35 * k;
    lean -= 0.15 * k;
  }

  if (input.carrying) {
    // Keep wrists on the ticket after the final body bob is known (dash removes it).
    const hold = carryPoint(windUp);
    const left = carryGrip(hold, -1);
    const right = carryGrip(hold, 1);
    leftHand = { ...left, y: left.y - bob };
    rightHand = { ...right, y: right.y - bob };
  }

  return {
    bob,
    lean,
    roll,
    squash,
    nod,
    leftHand,
    rightHand,
    walk,
    stride: stepPhase,
    windUp,
    carrying: input.carrying,
    dash: input.dashing ? 1 : 0,
    thrust: thrustAmount(input.shovingMs ?? null),
    stumble,
    release: input.carrying ? 0 : thrustAmount(input.throwingMs ?? null),
  };
}

/** How far a shove's push is out `ms` after it landed: snaps out, holds, eases back. */
export function thrustAmount(ms: number | null): number {
  if (ms === null || ms < 0 || ms >= THRUST_MS) return 0;
  const rise = Math.min(1, ms / 70);
  const fall = ms < 200 ? 1 : 1 - (ms - 200) / (THRUST_MS - 200);
  const k = Math.min(rise, fall);
  return k * k * (3 - 2 * k);
}

/** Turns `from` toward `to` (radians) by at most `maxStep`, the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

/**
 * A character counts as standing once where they're drawn hasn't changed
 * for this long: the game is paused, on the results, a scene shot is
 * frozen, or they're pressed into a wall. Longer than a frame without a
 * sim tick on a fast screen.
 */
const STILL_MS = 120;

/** Where a character was last drawn somewhere new: visual-only memory. */
export interface Motion {
  x: number;
  y: number;
  movedAtMs: number;
}

export function createMotion(): Motion {
  return { x: Number.NaN, y: Number.NaN, movedAtMs: -Infinity };
}

/**
 * Notes where a character is drawn at `timeMs`; returns whether they're
 * moving (drawn somewhere new within `STILL_MS`). Speeds frozen in a
 * stopped game then don't keep them walking on the spot. Mutates `motion`.
 */
export function noteMotion(motion: Motion, pos: { x: number; y: number }, timeMs: number): boolean {
  if (pos.x !== motion.x || pos.y !== motion.y) {
    motion.x = pos.x;
    motion.y = pos.y;
    motion.movedAtMs = timeMs;
  }
  return timeMs - motion.movedAtMs < STILL_MS;
}

/**
 * How long after the facing turns from a diagonal to one of its two
 * straight directions a stop still keeps the diagonal. Keys of a keyboard
 * diagonal are rarely let go on the same tick: the first one up turns the
 * player straight a tick or few before they stop.
 */
const DIAGONAL_HOLD_MS = 120;
/** Below this share of full speed a character counts as stopping. */
const STOPPING_SHARE = 0.4;
/** Yaws within this of a multiple of π/2 are straight; the rest diagonal. */
const STRAIGHT_TOLERANCE = 0.2;

/** What the facing shown on screen remembers: visual-only, the sim's facing is untouched. */
export interface FacingHold {
  /** The last diagonal yaw the sim faced, or `null`. */
  diagonal: number | null;
  /** When the facing went straight from that diagonal, or `null` while still on it. */
  leftAtMs: number | null;
  /** Stopped in time: the diagonal stays shown until they move or turn again. */
  held: boolean;
}

export function createFacingHold(): FacingHold {
  return { diagonal: null, leftAtMs: null, held: false };
}

function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

function isStraight(yaw: number): boolean {
  const quarter = Math.PI / 2;
  const off = Math.abs(yaw / quarter - Math.round(yaw / quarter)) * quarter;
  return off < STRAIGHT_TOLERANCE;
}

/**
 * The yaw to draw a character turning toward, given the sim's facing `yaw`.
 * When the facing goes from a diagonal to one of its straight halves and
 * the character stops within `DIAGONAL_HOLD_MS`, they keep showing the
 * diagonal (no 45° snap as two keys come up a tick apart). Acting along
 * the facing (a dash, a throw wind-up), walking on or any other turn shows
 * the sim's facing. Mutates `hold`.
 */
export function shownYaw(
  hold: FacingHold,
  yaw: number,
  speed: number,
  fullSpeed: number,
  acting: boolean,
  timeMs: number,
): number {
  const stopping = speed < fullSpeed * STOPPING_SHARE;
  if (acting || !isStraight(yaw)) {
    // A dash or a throw goes where the sim faces, so show that.
    hold.diagonal = acting ? null : yaw;
    hold.leftAtMs = null;
    hold.held = false;
    return yaw;
  }
  const near = hold.diagonal !== null && angleBetween(yaw, hold.diagonal) < Math.PI / 4 + 0.1;
  if (near && hold.diagonal !== null) {
    hold.leftAtMs ??= timeMs;
    if (hold.held && stopping) return hold.diagonal;
    if (!hold.held && timeMs - hold.leftAtMs <= DIAGONAL_HOLD_MS) {
      if (stopping) hold.held = true;
      return hold.diagonal;
    }
  }
  hold.diagonal = null;
  hold.leftAtMs = null;
  hold.held = false;
  return yaw;
}
