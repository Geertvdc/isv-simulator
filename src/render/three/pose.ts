/**
 * How a developer stands this frame, worked out from what they're doing:
 * a pure function of a few facts about the player and the time, so the
 * animation can be tested without WebGL. Positions are in the character's
 * own space: feet at the origin, facing +z, in world units.
 *
 * Overcooked-style characters have no legs or arms to rig: a bean body,
 * a head and two floating hands. Everything here moves those.
 */

import { CARRY_HEIGHT, CARRY_REACH } from './layout';

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
  /** A per-character offset so a room of idle people doesn't breathe in sync. */
  phase: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Pose {
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
}

/** Walk steps per second at full speed. */
const STEP_HZ = 3.2;
const BOB = 0.05;
const LEAN_WALK = 0.14;
const LEAN_DASH = 0.35;
const BREATHE_HZ = 0.5;
const STUMBLE_MS = 350;
/** Typing: how fast hands tap and how far. */
const TYPE_HZ = 9;
/** Where idle hands hang, either side of the belly. */
const HAND_REST = { x: 0.3, y: 0.38, z: 0.08 };

/** The pose for `input` at `timeMs`. */
export function playerPose(input: PoseInput, timeMs: number): Pose {
  const t = timeMs / 1000 + input.phase;
  const walk = Math.min(1, input.speed / Math.max(0.01, input.fullSpeed));
  const stepPhase = t * Math.PI * 2 * STEP_HZ;

  let bob = walk > 0.05 ? Math.abs(Math.sin(stepPhase)) * BOB * walk : 0;
  let lean = LEAN_WALK * walk;
  let roll = walk > 0.05 ? Math.sin(stepPhase) * 0.06 * walk : 0;
  const breathe = Math.sin(t * Math.PI * 2 * BREATHE_HZ) * 0.015 * (1 - walk);
  let squash = { x: 1 - breathe / 2, y: 1 + breathe };
  let nod = 0;

  // Hands swing opposite each other while walking.
  const swing = Math.sin(stepPhase) * 0.12 * walk;
  let leftHand: Vec3 = { x: -HAND_REST.x, y: HAND_REST.y, z: HAND_REST.z + swing };
  let rightHand: Vec3 = { x: HAND_REST.x, y: HAND_REST.y, z: HAND_REST.z - swing };

  if (input.carrying) {
    // Holding the ticket out front by its sides, bouncing with the walk.
    const y = CARRY_HEIGHT + 0.03 + bob * 0.5;
    leftHand = { x: -0.2, y, z: CARRY_REACH };
    rightHand = { x: 0.2, y, z: CARRY_REACH };
  }

  if (input.working) {
    // Hammering away: hands tap in turn, head down.
    const tap = Math.sin(t * Math.PI * 2 * TYPE_HZ);
    leftHand = { x: -0.16, y: 0.6 + Math.max(0, tap) * 0.06, z: 0.42 };
    rightHand = { x: 0.16, y: 0.6 + Math.max(0, -tap) * 0.06, z: 0.42 };
    nod = 0.25;
    lean = Math.max(lean, 0.1);
  }

  if (input.windUp > 0) {
    // Leaning back with the ticket over the shoulder.
    const w = Math.min(1, input.windUp);
    lean = -0.3 * w;
    leftHand = mix(leftHand, { x: -0.15, y: 0.95, z: -0.15 }, w);
    rightHand = mix(rightHand, { x: 0.15, y: 0.95, z: -0.15 }, w);
  }

  if (input.dashing) {
    squash = { x: 1.2, y: 0.85 };
    lean = LEAN_DASH;
    bob = 0;
    if (!input.carrying) {
      // Arms flung back.
      leftHand = { x: -0.32, y: 0.45, z: -0.25 };
      rightHand = { x: 0.32, y: 0.45, z: -0.25 };
    }
  }

  if (input.shovedMs !== null && input.shovedMs < STUMBLE_MS) {
    // A wobble that dies down.
    const k = 1 - input.shovedMs / STUMBLE_MS;
    roll += Math.sin((input.shovedMs / STUMBLE_MS) * Math.PI * 4) * 0.35 * k;
    lean -= 0.15 * k;
  }

  return { bob, lean, roll, squash, nod, leftHand, rightHand };
}

function mix(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}

/** Turns `from` toward `to` (radians) by at most `maxStep`, the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}
