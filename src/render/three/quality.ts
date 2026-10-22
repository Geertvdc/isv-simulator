/**
 * How much the 3D look draws:
 * - `high`: soft shadows, ambient occlusion, bloom and anti-aliasing at up to 1.5× pixel ratio
 * - `medium`: the same at 1× pixel ratio
 * - `low`: no post-processing, small shadow map, 1× pixel ratio
 *
 * The game starts on high (or `?quality=`) and steps down one level each
 * time frames stay slow; it never steps back up, so it can't flicker
 * between levels. No three.js here, so it can be tested.
 */

export const QUALITIES = ['high', 'medium', 'low'] as const;
export type Quality = (typeof QUALITIES)[number];

/** Frames to skip before judging: the first ones include loading and shader compiles. */
const WARMUP_FRAMES = 120;
/** Frames judged at a time. */
const WINDOW_FRAMES = 90;
/** A frame slower than this counts as slow (under ~40 fps). */
const SLOW_FRAME_MS = 25;
/** Share of slow frames in a window that steps the quality down. */
const SLOW_SHARE = 0.75;
/** Longer gaps are the tab being hidden or a breakpoint, not slowness. */
const IGNORE_FRAME_MS = 250;

export interface FrameWatch {
  seen: number;
  windowFrames: number;
  windowSlow: number;
  /** Not watching: told a quality, or already at the bottom. */
  done: boolean;
}

export function createFrameWatch(watch = true): FrameWatch {
  return { seen: 0, windowFrames: 0, windowSlow: 0, done: !watch };
}

/** Starts the warm-up again: something new has to compile (a level, a quality step). */
export function rewarm(w: FrameWatch): void {
  w.seen = 0;
  w.windowFrames = 0;
  w.windowSlow = 0;
}

/** Counts one frame of `frameMs` (wall time); true when the quality should step down. */
export function watchFrame(w: FrameWatch, frameMs: number): boolean {
  if (w.done || frameMs > IGNORE_FRAME_MS) return false;
  w.seen++;
  if (w.seen <= WARMUP_FRAMES) return false;
  w.windowFrames++;
  if (frameMs > SLOW_FRAME_MS) w.windowSlow++;
  if (w.windowFrames < WINDOW_FRAMES) return false;
  const slow = w.windowSlow / w.windowFrames >= SLOW_SHARE;
  w.windowFrames = 0;
  w.windowSlow = 0;
  return slow;
}

/** The next quality down, or `null` at the bottom. */
export function stepDown(q: Quality): Quality | null {
  return QUALITIES[QUALITIES.indexOf(q) + 1] ?? null;
}

/** The quality `?quality=` asks for, and whether to watch frames (only when it isn't forced). */
export function initialQuality(param: string | null): { quality: Quality; watch: boolean } {
  const asked = QUALITIES.find((q) => q === param);
  if (asked) return { quality: asked, watch: false };
  return { quality: 'high', watch: true };
}

/** Most drawing-buffer pixels we render the post chain at (about 2560 × 1220). */
export const MAX_BUFFER_PIXELS = 3.1e6;

/** Pixel ratio for a quality, a CSS size and the screen's ratio: capped so big screens stay fast. */
export function pixelRatioFor(
  q: Quality,
  devicePixelRatio: number,
  width: number,
  height: number,
): number {
  if (q !== 'high') return 1;
  const cap = Math.sqrt(MAX_BUFFER_PIXELS / Math.max(1, width * height));
  return Math.max(1, Math.min(devicePixelRatio, 1.5, cap));
}
