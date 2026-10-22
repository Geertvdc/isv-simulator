/**
 * How much the 3D look draws: `high` with soft shadows, ambient occlusion,
 * bloom and anti-aliasing, `low` with none of that for weak machines. The
 * game starts on high (or `?quality=`) and drops to low by itself when
 * frames stay slow; it never flips back, so it can't flicker between them.
 *
 * No three.js here, so it can be tested.
 */

export type Quality = 'high' | 'low';

/** Frames to skip before judging: the first ones include loading and shader compiles. */
const WARMUP_FRAMES = 120;
/** Frames judged at a time. */
const WINDOW_FRAMES = 90;
/** A frame slower than this counts as slow (under ~40 fps). */
const SLOW_FRAME_MS = 25;
/** Share of slow frames in a window that drops the quality. */
const SLOW_SHARE = 0.75;
/** Longer gaps are the tab being hidden or a breakpoint, not slowness. */
const IGNORE_FRAME_MS = 250;

export interface FrameWatch {
  seen: number;
  windowFrames: number;
  windowSlow: number;
  /** It already dropped the quality once (or was told not to watch). */
  done: boolean;
}

export function createFrameWatch(watch = true): FrameWatch {
  return { seen: 0, windowFrames: 0, windowSlow: 0, done: !watch };
}

/** Counts one frame of `deltaMs`; true exactly once, when the quality should drop to low. */
export function watchFrame(w: FrameWatch, deltaMs: number): boolean {
  if (w.done || deltaMs > IGNORE_FRAME_MS) return false;
  w.seen++;
  if (w.seen <= WARMUP_FRAMES) return false;
  w.windowFrames++;
  if (deltaMs > SLOW_FRAME_MS) w.windowSlow++;
  if (w.windowFrames < WINDOW_FRAMES) return false;
  const slow = w.windowSlow / w.windowFrames >= SLOW_SHARE;
  w.windowFrames = 0;
  w.windowSlow = 0;
  if (slow) w.done = true;
  return slow;
}

/** The quality `?quality=` asks for, and whether to watch frames (only when it isn't forced). */
export function initialQuality(param: string | null): { quality: Quality; watch: boolean } {
  if (param === 'low' || param === 'high') return { quality: param, watch: false };
  return { quality: 'high', watch: true };
}
