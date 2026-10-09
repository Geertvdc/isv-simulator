import type { Point } from './projection';

export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Screen pixels to keep free on each side of the viewport. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CameraFit {
  zoom: number;
  /** World point to put at the center of the viewport. */
  center: Point;
}

/**
 * Zoom and center that frame `bounds` inside a viewport of `viewport` screen
 * pixels, keeping `insets` free (e.g. for HUD bars). The level is centered in
 * the space between the insets, not in the whole viewport.
 */
export function fitCamera(bounds: WorldRect, viewport: Size, insets: Insets): CameraFit {
  const worldW = bounds.right - bounds.left;
  const worldH = bounds.bottom - bounds.top;
  // A viewport smaller than the insets still gets a sliver of map, never a zero zoom.
  const availW = Math.max(viewport.width - insets.left - insets.right, 1);
  const availH = Math.max(viewport.height - insets.top - insets.bottom, 1);
  const zoom = Math.min(availW / worldW, availH / worldH);
  // How far the middle of the free area sits from the viewport center, in screen pixels.
  const shiftX = (insets.left - insets.right) / 2;
  const shiftY = (insets.top - insets.bottom) / 2;
  return {
    zoom,
    center: {
      x: (bounds.left + bounds.right) / 2 - shiftX / zoom,
      y: (bounds.top + bounds.bottom) / 2 - shiftY / zoom,
    },
  };
}
