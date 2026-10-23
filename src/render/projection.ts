/**
 * All projection math lives here: grid coordinates to the 3D world, the
 * camera pose and fit, and screen back to the floor.
 *
 * The sim never sees any of this: it works in plain grid coordinates.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * World (grid) direction that moves along screen direction `dir` (screen +y is
 * down), normalised. Zero stays zero. Keyboard input is screen-relative, so
 * "up" always walks up on screen; the camera has no yaw, so screen-up is grid -y.
 */
export function screenDirToGrid(dir: Point): Point {
  const len = Math.hypot(dir.x, dir.y);
  // `+ 0` turns -0 into 0 so callers and tests can compare with ===.
  return len === 0 ? { x: 0, y: 0 } : { x: dir.x / len + 0, y: dir.y / len + 0 };
}

/*
 * The 3D view: one tile is one world unit, grid x runs along
 * world +x, grid y along world +z (toward the viewer) and the floor is at
 * world y = 0, up is +y. A perspective camera looks down at the level from
 * the front at `VIEW3D_PITCH` with no yaw, so screen-relative input
 * (`screenDirToGrid`) stays simple: "up" on screen is grid -y.
 *
 * This is plain math with no three.js, so it's testable in Node; the 3D
 * renderer copies the pose onto its camera.
 */

/** Camera tilt down from the horizon. */
export const VIEW3D_PITCH = (50 * Math.PI) / 180;
/** Vertical field of view: narrow, so the back of the room is only a little smaller. */
export const VIEW3D_FOV = (24 * Math.PI) / 180;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** World point of grid point (x, y) at `height` world units above the floor. */
export function gridToWorld(x: number, y: number, height = 0): Vec3 {
  return { x, y: height, z: y };
}

/**
 * Where the 3D camera is and how it maps onto the canvas. `principal` is the
 * screen point the camera looks through (the middle of the space between the
 * HUD bands, not the canvas center), `focal` the pixels per unit of
 * `x / depth`.
 */
export interface CameraPose {
  target: Vec3;
  distance: number;
  pitch: number;
  fov: number;
  viewport: Size2;
  principal: Point;
}

export interface Size2 {
  width: number;
  height: number;
}

/** Camera position in the world. */
export function cameraPosition(pose: CameraPose): Vec3 {
  const { target, distance, pitch } = pose;
  return {
    x: target.x,
    y: target.y + distance * Math.sin(pitch),
    z: target.z + distance * Math.cos(pitch),
  };
}

/** Pixels per unit of `x / depth`: from the vertical field of view over the whole canvas. */
export function focalLength(pose: Pick<CameraPose, 'fov' | 'viewport'>): number {
  return pose.viewport.height / 2 / Math.tan(pose.fov / 2);
}

export interface Projected {
  x: number;
  y: number;
  /** Distance in front of the camera; scale things drawn there by `focal / depth`. */
  depth: number;
}

/** Screen point (canvas pixels, y down) of world point `p`. */
export function projectPoint(pose: CameraPose, p: Vec3): Projected {
  const c = cameraPosition(pose);
  const sin = Math.sin(pose.pitch);
  const cos = Math.cos(pose.pitch);
  const rx = p.x - c.x;
  const ry = p.y - c.y;
  const rz = p.z - c.z;
  // Camera basis: right (1, 0, 0), up (0, cos, -sin), forward (0, -sin, -cos).
  const up = ry * cos - rz * sin;
  const depth = -ry * sin - rz * cos;
  const f = focalLength(pose);
  return {
    x: pose.principal.x + (f * rx) / depth,
    y: pose.principal.y - (f * up) / depth,
    depth,
  };
}

/** Screen pixels per world unit at world point `p`. */
export function pixelsPerUnit(pose: CameraPose, p: Vec3): number {
  return focalLength(pose) / projectPoint(pose, p).depth;
}

/** Fractional grid point under screen point (sx, sy) at `height` above the floor, or `null` above the horizon. */
export function screenToGround(pose: CameraPose, sx: number, sy: number, height = 0): Point | null {
  const c = cameraPosition(pose);
  const sin = Math.sin(pose.pitch);
  const cos = Math.cos(pose.pitch);
  const f = focalLength(pose);
  const u = (sx - pose.principal.x) / f;
  const v = -(sy - pose.principal.y) / f;
  // Ray direction: forward + u * right + v * up.
  const dir = { x: u, y: -sin + v * cos, z: -cos - v * sin };
  if (dir.y >= 0) return null;
  const t = (height - c.y) / dir.y;
  return { x: c.x + dir.x * t, y: c.z + dir.z * t };
}

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

function boxCorners(box: Box3): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) out.push({ x, y, z });
    }
  }
  return out;
}

/** Screen rectangle that `box` covers from `pose`. */
export function projectedBounds(
  pose: CameraPose,
  box: Box3,
): { left: number; right: number; top: number; bottom: number } {
  const points = boxCorners(box).map((p) => projectPoint(pose, p));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

/** Screen pixels to keep free on each side of the canvas. */
export interface Insets3 {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * The camera pose that frames `box` as large as it fits between `insets`,
 * centered in that space. The camera keeps its pitch and field of view and
 * only moves back and slides along the floor, so the angle never changes
 * with the window size.
 */
export function fitCamera3d(box: Box3, viewport: Size2, insets: Insets3): CameraPose {
  const availW = Math.max(viewport.width - insets.left - insets.right, 1);
  const availH = Math.max(viewport.height - insets.top - insets.bottom, 1);
  const principal = { x: insets.left + availW / 2, y: insets.top + availH / 2 };
  const center = {
    x: (box.min.x + box.max.x) / 2,
    y: 0,
    z: (box.min.z + box.max.z) / 2,
  };
  const size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z, 1);
  const pose = (distance: number, z: number): CameraPose => ({
    target: { x: center.x, y: 0, z },
    distance,
    pitch: VIEW3D_PITCH,
    fov: VIEW3D_FOV,
    viewport,
    principal,
  });
  // At this distance, the floor point to look at so the box sits centered vertically.
  const centeredZ = (distance: number): number => {
    let lo = box.min.z - size;
    let hi = box.max.z + size;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const b = projectedBounds(pose(distance, mid), box);
      // Looking further forward (larger z) moves the box up on screen.
      if ((b.top + b.bottom) / 2 < principal.y) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const fits = (distance: number): boolean => {
    const p = pose(distance, centeredZ(distance));
    // The camera must stay outside the box, in front of every corner.
    if (boxCorners(box).some((c) => projectPoint(p, c).depth <= 0.1)) return false;
    const b = projectedBounds(p, box);
    return b.right - b.left <= availW && b.bottom - b.top <= availH;
  };
  let near = 0;
  let far = size * 2;
  while (!fits(far)) far *= 2;
  for (let i = 0; i < 40; i++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  return pose(far, centeredZ(far));
}
