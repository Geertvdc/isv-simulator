import type { PoseInput } from '../render/three/pose';
import { carryPoint } from '../render/three/layout';

export const STUDY_ACTIONS = ['idle', 'walk', 'work', 'carry', 'dash', 'throw', 'shove'] as const;
export type StudyAction = (typeof STUDY_ACTIONS)[number];
export const STUDY_LOOP_MS = 2600;
/** In the shove loop: when the dash lands the push, and when a push comes back. */
const SHOVE_AT_MS = 150;
const STUMBLE_AT_MS = 1300;

/** A repeatable pose lab, not a second simulation or a new gameplay cadence. */
export function studyFrame(
  action: StudyAction,
  timeMs: number,
): {
  input: PoseInput;
  ticket: { x: number; y: number; z: number } | null;
  /** How the ticket is turned (radians about the vertical). */
  ticketYaw: number;
} {
  const loop = ((timeMs % STUDY_LOOP_MS) + STUDY_LOOP_MS) % STUDY_LOOP_MS;
  const releasing = action === 'throw' && loop >= 1600;
  const windUp = action === 'throw' && !releasing ? loop / 1600 : 0;
  // A shove: dash in, push out, then take one back and stumble.
  const shove = action === 'shove';
  const charging = shove && loop < SHOVE_AT_MS;
  const pushing = shove && loop >= SHOVE_AT_MS && loop < STUMBLE_AT_MS;
  const input: PoseInput = {
    speed: action === 'walk' || action === 'dash' || charging ? 5 : 0,
    fullSpeed: 5,
    carrying: action === 'carry' || (action === 'throw' && !releasing),
    working: action === 'work',
    dashing: action === 'dash' || charging,
    windUp,
    shovedMs: shove && loop >= STUMBLE_AT_MS ? loop - STUMBLE_AT_MS : null,
    shovingMs: pushing ? loop - SHOVE_AT_MS : null,
    throwingMs: releasing ? loop - 1600 : null,
    phase: 0,
    stride: (timeMs / 1000) * Math.PI * 4.4,
  };
  const hold = carryPoint(windUp);
  let ticket: { x: number; y: number; z: number } | null = input.carrying
    ? { x: hold.side, y: hold.height, z: hold.reach }
    : null;
  let ticketYaw = input.carrying ? hold.yaw : 0;
  if (releasing) {
    const progress = (loop - 1600) / 1000;
    const from = carryPoint(1);
    // Illustrative release only; the sim's throw timing/range is untouched.
    // It is swung round in front at chest height first, past the flung hands, then sails off.
    const out = Math.min(1, progress * 5);
    const ease = out * out * (3 - 2 * out);
    const flight = Math.max(0, progress - 0.2) / 0.8;
    ticket = {
      x: from.side + (-0.05 - from.side) * ease,
      y: from.height + (0.7 - from.height) * ease + Math.sin(flight * Math.PI) * 0.5,
      z: from.reach + (0.8 - from.reach) * ease + flight * 2,
    };
    ticketYaw = from.yaw * (1 - progress) + progress * 4;
  }
  return { input, ticket, ticketYaw };
}
