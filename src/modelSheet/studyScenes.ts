import type { PoseInput } from '../render/three/pose';
import { carryPoint } from '../render/three/layout';

export const STUDY_ACTIONS = ['idle', 'walk', 'work', 'carry', 'dash', 'throw', 'shove'] as const;
export type StudyAction = (typeof STUDY_ACTIONS)[number];
export const STUDY_LOOP_MS = 2600;

/** A repeatable pose lab, not a second simulation or a new gameplay cadence. */
export function studyFrame(
  action: StudyAction,
  timeMs: number,
): {
  input: PoseInput;
  ticket: { x: number; y: number; z: number } | null;
} {
  const loop = ((timeMs % STUDY_LOOP_MS) + STUDY_LOOP_MS) % STUDY_LOOP_MS;
  const releasing = action === 'throw' && loop >= 1600;
  const windUp = action === 'throw' && !releasing ? loop / 1600 : 0;
  const input: PoseInput = {
    speed: action === 'walk' || action === 'dash' ? 5 : 0,
    fullSpeed: 5,
    carrying: action === 'carry' || (action === 'throw' && !releasing),
    working: action === 'work',
    dashing: action === 'dash',
    windUp,
    shovedMs: action === 'shove' ? loop % 800 : null,
    phase: 0,
    stride: (timeMs / 1000) * Math.PI * 4.4,
  };
  const hold = carryPoint(windUp);
  let ticket: { x: number; y: number; z: number } | null = input.carrying
    ? { x: hold.side, y: hold.height, z: hold.reach }
    : null;
  if (releasing) {
    const progress = (loop - 1600) / 1000;
    // Illustrative release only; the sim's throw timing/range is untouched.
    ticket = {
      x: 0.3 * (1 - progress),
      y: 1.3 - 0.68 * progress + Math.sin(progress * Math.PI) * 0.5,
      z: -0.3 + progress * 2.5,
    };
  }
  return { input, ticket };
}
