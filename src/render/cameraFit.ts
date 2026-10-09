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

export interface CameraFit {
  zoom: number;
  center: Point;
}

/**
 * Zoom and center that frame `bounds` inside a viewport of `viewport` screen
 * pixels, leaving at least `padding` screen pixels on every side.
 */
export function fitCamera(bounds: WorldRect, viewport: Size, padding: number): CameraFit {
  const worldW = bounds.right - bounds.left;
  const worldH = bounds.bottom - bounds.top;
  // A viewport smaller than the padding still gets a sliver of map, never a zero zoom.
  const availW = Math.max(viewport.width - 2 * padding, 1);
  const availH = Math.max(viewport.height - 2 * padding, 1);
  return {
    zoom: Math.min(availW / worldW, availH / worldH),
    center: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
  };
}
