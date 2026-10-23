/**
 * The world map camera's shots, one per kind of menu, as plain math
 * (testable in Node): a wide establishing drift behind the title and its
 * menus, a higher look at the van in the lobby, and the close follow of the
 * level select. Switching shots glides every part of the camera (where it
 * looks, how far, how steep) over a second and a half, eased in and out:
 * never a cut.
 */

import type { Screen } from '../../../flow/flow';
import type { MapPoint, MapRegion } from '../../../flow/worldMap';

export type MapShot = 'establishing' | 'lobby' | 'follow';

/** Everything about the camera that changes between shots. */
export interface Framing {
  /** The map point the camera looks at. */
  look: MapPoint;
  /** World units from the look point. */
  distance: number;
  /** Radians down from level. */
  pitch: number;
  /** Vertical field of view, radians. */
  fov: number;
  /** Where the look point sits on screen, as a share of the canvas height. */
  principalY: number;
}

const DEG = Math.PI / 180;

/**
 * The establishing shot: lower and further out than the level select, so
 * the buildings stand up against the sky and the town reads as a skyline.
 * It looks at the back street (the island's back rows hold the skyline),
 * drifting along the island from the garage to the end of the open land.
 */
export const ESTABLISHING = {
  distance: 40,
  pitch: 40 * DEG,
  fov: 30 * DEG,
  principalY: 0.66,
  /** The map row it looks at: toward the back, where the tall buildings stand. */
  row: 4.5,
  /**
   * The drift's left end (or, with little land open, this far short of its
   * end, so the cloud bank sits on the right), and how far short of the open
   * land's right end it turns.
   */
  start: 14,
  startInset: 4,
  endInset: 10,
  /** Always drifts at least this far, so even a fresh save's view breathes. */
  minSpan: 4,
  /** One way along the island takes half of this. */
  periodMs: 90_000,
};

/** The lobby: higher than the level select, over the van, so the lobby panel has room. */
export const LOBBY = {
  distance: 34,
  pitch: 60 * DEG,
  fov: 30 * DEG,
  principalY: 0.58,
};

/** How long a switch between shots takes. */
export const SWOOP_MS = 1600;

/** Which shot shows behind `screen` (`null`: no screen yet, as the title). */
export function shotFor(screen: Screen | null): MapShot {
  if (screen === 'levelSelect') return 'follow';
  if (screen === 'lobby' || screen === 'online') return 'lobby';
  return 'establishing';
}

/** Where the open land ends on the right: the right edge of the last open chapter. */
export function openEnd(regions: readonly MapRegion[], chapterOpen: readonly boolean[]): number {
  let end = regions[0] ? regions[0].x + regions[0].width : 0;
  for (const r of regions) {
    if (chapterOpen[r.chapter] !== false) end = Math.max(end, r.x + r.width);
  }
  return end;
}

/**
 * The establishing shot at `timeMs`: a slow ping-pong along the island,
 * easing at both ends, from the garage to `end` (where the open land stops).
 */
export function establishingFraming(end: number, timeMs: number): Framing {
  const { start, startInset, endInset, minSpan, periodMs, row } = ESTABLISHING;
  const left = Math.min(start, end - startInset);
  const span = Math.max(minSpan, end - endInset - left);
  const phase = (timeMs / periodMs) * Math.PI * 2;
  const x = left + span * (0.5 - 0.5 * Math.cos(phase));
  return {
    look: { x, y: row },
    distance: ESTABLISHING.distance,
    pitch: ESTABLISHING.pitch,
    fov: ESTABLISHING.fov,
    principalY: ESTABLISHING.principalY,
  };
}

/** Eases in and out: slow off the mark, slow into place. */
export function swoopEase(t: number): number {
  const k = Math.min(Math.max(t, 0), 1);
  return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
}

/** The framing `t` (0 to 1) of the way from `a` to `b`. */
export function blendFraming(a: Framing, b: Framing, t: number): Framing {
  const mix = (p: number, q: number): number => p + (q - p) * t;
  return {
    look: { x: mix(a.look.x, b.look.x), y: mix(a.look.y, b.look.y) },
    distance: mix(a.distance, b.distance),
    pitch: mix(a.pitch, b.pitch),
    fov: mix(a.fov, b.fov),
    principalY: mix(a.principalY, b.principalY),
  };
}

/** The camera between shots: which shot it is on, and the swoop into it. */
export interface ShotRig {
  shot: MapShot;
  /** The framing the swoop started from; `null` once it has arrived. */
  from: Framing | null;
  elapsedMs: number;
  /** What it showed last frame, where a new swoop starts from. */
  shown: Framing;
}

/** A rig that starts on `shot`, already there. */
export function startRig(shot: MapShot, framing: Framing): ShotRig {
  return { shot, from: null, elapsedMs: 0, shown: framing };
}

/**
 * One frame: `shot` is the shot the screen wants, `target` its framing now.
 * A new shot starts a swoop from wherever the camera is (even mid-swoop).
 */
export function stepRig(rig: ShotRig, shot: MapShot, target: Framing, deltaMs: number): ShotRig {
  const switched = shot !== rig.shot;
  const from = switched ? rig.shown : rig.from;
  const elapsedMs = switched ? 0 : rig.elapsedMs + Math.max(0, deltaMs);
  if (!from || elapsedMs >= SWOOP_MS) {
    return { shot, from: null, elapsedMs, shown: target };
  }
  const shown = blendFraming(from, target, swoopEase(elapsedMs / SWOOP_MS));
  return { shot, from, elapsedMs, shown };
}
