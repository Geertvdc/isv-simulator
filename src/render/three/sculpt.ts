import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * A sculpting kit for the developers: smooth, high-segment pieces (deformed
 * spheres, lathes, thick shells, tapered sweeps) merged into one indexed
 * geometry per rigid part. Besides a vertex color every vertex carries a
 * `finish` (roughness, metalness, glow, scatter), so cloth, leather, skin, metal and
 * glass share one material (`sculptMaterial`) and still read as different stuff.
 */

export type V3 = readonly [number, number, number];

export interface Finish {
  rough: number;
  metal: number;
  /** Self-lit share of the color: 1 is a highlight that ignores the light. */
  glow: number;
  /** Fake subsurface scatter: a warm glow in the shadowed side and edges (skin). */
  scatter?: number;
}

export const FINISH = {
  cloth: { rough: 0.86, metal: 0, glow: 0 },
  knit: { rough: 1, metal: 0, glow: 0 },
  denim: { rough: 0.9, metal: 0, glow: 0 },
  skin: { rough: 0.62, metal: 0, glow: 0.03, scatter: 1 },
  hair: { rough: 0.6, metal: 0, glow: 0 },
  leather: { rough: 0.34, metal: 0, glow: 0 },
  rubber: { rough: 0.68, metal: 0, glow: 0 },
  plastic: { rough: 0.32, metal: 0, glow: 0 },
  enamel: { rough: 0.22, metal: 0, glow: 0.05 },
  metal: { rough: 0.26, metal: 1, glow: 0.04 },
  brass: { rough: 0.28, metal: 1, glow: 0.04 },
  glass: { rough: 0.06, metal: 0.4, glow: 0.12 },
  eye: { rough: 0.14, metal: 0, glow: 0.12 },
  sparkle: { rough: 0.2, metal: 0, glow: 1 },
  reflective: { rough: 0.25, metal: 0.25, glow: 0.35 },
  led: { rough: 0.3, metal: 0, glow: 1.6 },
} as const satisfies Record<string, Finish>;

export interface Placement {
  at?: V3;
  /** Euler angles (XYZ), radians. Ignored when `quat` is given. */
  rot?: V3;
  quat?: THREE.Quaternion;
  scale?: V3;
}

export function placeMatrix(place: Placement): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...(place.at ?? [0, 0, 0])),
    place.quat ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(place.rot ?? [0, 0, 0]))),
    new THREE.Vector3(...(place.scale ?? [1, 1, 1])),
  );
}

/** A quaternion turning +z onto `dir` (rolled so +y stays as up as it can). */
export function facing(dir: THREE.Vector3, up = new THREE.Vector3(0, 1, 0)): THREE.Quaternion {
  const z = dir.clone().normalize();
  let x = up.clone().cross(z);
  if (x.lengthSq() < 1e-8) x = new THREE.Vector3(1, 0, 0);
  x.normalize();
  const y = z.clone().cross(x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Welds a geometry's seams and recomputes smooth normals (after a deform). */
export function smooth(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position') geometry.deleteAttribute(name);
  }
  const welded = mergeVertices(geometry, 1e-5);
  if (welded !== geometry) geometry.dispose();
  welded.computeVertexNormals();
  return welded;
}

/** Moves every vertex with `fn` (mutating the vector). Normals need `smooth` after. */
export function deform(
  geometry: THREE.BufferGeometry,
  fn: (v: THREE.Vector3) => void,
): THREE.BufferGeometry {
  const p = geometry.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  return geometry;
}

/** Cross-section half-sizes along a sweep: [side, up]. */
export type SweepSize = number | ((t: number) => readonly [number, number]);

export interface SweepOptions {
  /** Points along the path; smoothed with a centripetal Catmull–Rom curve. */
  closed?: boolean;
  segments?: number;
  radial?: number;
  /**
   * Which way the cross-section's "up" half-size points at a path point
   * (projected square to the path). Default: rotation-minimizing frames.
   */
  up?: (p: THREE.Vector3, t: number) => THREE.Vector3;
  /** Close open ends with flat caps (default true). */
  caps?: boolean;
}

/** A tube along `points` with an elliptical, possibly tapering cross-section. */
export function sweepGeometry(
  points: readonly (V3 | THREE.Vector3)[],
  size: SweepSize,
  options: SweepOptions = {},
): THREE.BufferGeometry {
  const closed = options.closed ?? false;
  const segments = options.segments ?? 16;
  const radial = options.radial ?? 10;
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => (p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(...p))),
    closed,
    'centripetal',
  );
  const half = typeof size === 'number' ? () => [size, size] as const : size;
  const frames = options.up ? null : curve.computeFrenetFrames(segments, closed);
  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  const rings = closed ? segments : segments + 1;
  const tangents: THREE.Vector3[] = [];
  const centers: THREE.Vector3[] = [];
  const sizes: (readonly [number, number])[] = [];
  for (let i = 0; i < rings; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    let side: THREE.Vector3;
    let up: THREE.Vector3;
    if (options.up) {
      const ref = options.up(p, t);
      side = tangent.clone().cross(ref);
      if (side.lengthSq() < 1e-10) side = new THREE.Vector3(1, 0, 0).cross(tangent);
      side.normalize();
      up = side.clone().cross(tangent).normalize();
    } else if (frames) {
      side = (frames.binormals[i] ?? new THREE.Vector3(1, 0, 0)).clone();
      up = (frames.normals[i] ?? new THREE.Vector3(0, 1, 0)).clone();
    } else {
      throw new Error('Sweep without frames');
    }
    const [w, h] = half(t);
    centers.push(p);
    tangents.push(tangent);
    sizes.push([w, h]);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      positions.push(
        p.x + side.x * c * w + up.x * s * h,
        p.y + side.y * c * w + up.y * s * h,
        p.z + side.z * c * w + up.z * s * h,
      );
      const n = side
        .clone()
        .multiplyScalar(c / Math.max(w, 1e-4))
        .addScaledVector(up, s / Math.max(h, 1e-4))
        .normalize();
      normals.push(n.x, n.y, n.z);
    }
  }
  const stride = radial + 1;
  const spans = closed ? segments : segments;
  for (let i = 0; i < spans; i++) {
    const a = i * stride;
    const b = ((i + 1) % rings) * stride;
    for (let j = 0; j < radial; j++) {
      index.push(a + j, b + j, a + j + 1, b + j, b + j + 1, a + j + 1);
    }
  }
  if (!closed && (options.caps ?? true)) {
    for (const end of [0, rings - 1]) {
      const [w, h] = sizes[end] ?? [0, 0];
      if (Math.min(w, h) < 1e-4) continue;
      const center = centers[end];
      const tangent = tangents[end];
      if (!center || !tangent) continue;
      const n = end === 0 ? tangent.clone().negate() : tangent;
      const base = positions.length / 3;
      positions.push(center.x, center.y, center.z);
      normals.push(n.x, n.y, n.z);
      for (let j = 0; j <= radial; j++) {
        const k = (end * stride + j) * 3;
        positions.push(positions[k] ?? 0, positions[k + 1] ?? 0, positions[k + 2] ?? 0);
        normals.push(n.x, n.y, n.z);
      }
      for (let j = 0; j < radial; j++) {
        if (end === 0) index.push(base, base + 2 + j, base + 1 + j);
        else index.push(base, base + 1 + j, base + 2 + j);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(index);
  return g;
}

/** Reverses a geometry's winding and normals, so its inside faces out. */
export function flip(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = geometry.index;
  if (!index) throw new Error('flip needs an indexed geometry');
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, b);
  }
  const n = geometry.getAttribute('normal');
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return geometry;
}

/** A profile `[radius, y][]` (bottom to top) turned around y. */
export function latheGeometry(
  profile: readonly (readonly [number, number])[],
  segments = 40,
  phiStart = 0,
  phiLength = Math.PI * 2,
): THREE.BufferGeometry {
  const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  // Bottom-to-top profiles face outward.
  return new THREE.LatheGeometry(points, segments, phiStart, phiLength);
}

/** A profile sampled smoothly through `keys` (`[radius, y]`, bottom to top). */
export function smoothProfile(
  keys: readonly (readonly [number, number])[],
  samples = 24,
): [number, number][] {
  const curve = new THREE.SplineCurve(keys.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getPoints(samples).map((p) => [p.x, p.y]);
}

/** Radius of a profile at height `y` (linear between samples, clamped at the ends). */
export function profileRadius(profile: readonly (readonly [number, number])[], y: number): number {
  const first = profile[0];
  const last = profile[profile.length - 1];
  if (!first || !last) return 0;
  if (y <= first[1]) return first[0];
  if (y >= last[1]) return last[0];
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (!a || !b) continue;
    if (y <= b[1]) {
      const k = b[1] === a[1] ? 0 : (y - a[1]) / (b[1] - a[1]);
      return a[0] + (b[0] - a[0]) * k;
    }
  }
  return last[0];
}

function ringStrip(
  outer: THREE.Vector3[],
  inner: THREE.Vector3[],
  closed: boolean,
): THREE.BufferGeometry[] {
  const positions: number[] = [];
  for (const p of [...outer, ...inner]) positions.push(p.x, p.y, p.z);
  const n = outer.length;
  const spans = closed ? n : n - 1;
  // Both windings, on separate vertices: the strip shows (and shades) from either side.
  return [false, true].map((back) => {
    const index: number[] = [];
    for (let i = 0; i < spans; i++) {
      const a = i;
      const b = (i + 1) % n;
      if (back) index.push(a, b, n + a, b, n + b, n + a);
      else index.push(a, n + a, b, b, n + a, n + b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * A garment: a lathe with real thickness (outer and inner skins, closed
 * hems and, when it doesn't go all the way round, closed front edges).
 */
export function shellGeometry(
  profile: readonly (readonly [number, number])[],
  thickness: number,
  segments = 40,
  phiStart = 0,
  phiLength = Math.PI * 2,
): THREE.BufferGeometry {
  const full = phiLength >= Math.PI * 2 - 1e-6;
  const outer = latheGeometry(profile, segments, phiStart, phiLength);
  const innerProfile = profile.map(([r, y]) => [Math.max(1e-4, r - thickness), y] as const);
  const inner = flip(latheGeometry(innerProfile, segments, phiStart, phiLength));
  const at = (r: number, y: number, phi: number) =>
    new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi));
  const parts = [outer, inner];
  const steps = full ? segments : segments + 1;
  for (const k of [0, profile.length - 1]) {
    const point = profile[k];
    if (!point) continue;
    const [r, y] = point;
    const o: THREE.Vector3[] = [];
    const i: THREE.Vector3[] = [];
    for (let s = 0; s < steps; s++) {
      const phi = phiStart + (s / segments) * phiLength;
      o.push(at(r, y, phi));
      i.push(at(Math.max(1e-4, r - thickness), y, phi));
    }
    parts.push(...ringStrip(o, i, full));
  }
  if (!full) {
    for (const phi of [phiStart, phiStart + phiLength]) {
      const o = profile.map(([r, y]) => at(r, y, phi));
      const i = profile.map(([r, y]) => at(Math.max(1e-4, r - thickness), y, phi));
      parts.push(...ringStrip(o, i, false));
    }
  }
  const merged = mergeGeometries(parts.map(indexed), false);
  for (const part of parts) part.dispose();
  return merged;
}

function indexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.index) {
    const count = g.getAttribute('position').count;
    g.setIndex(Array.from({ length: count }, (_, i) => i));
  }
  if (!g.hasAttribute('normal')) g.computeVertexNormals();
  return g;
}

/** Collects colored, finished pieces into one indexed geometry. */
export class SculptBuilder {
  private readonly parts: THREE.BufferGeometry[] = [];

  /** Any geometry, colored and placed. */
  add(geometry: THREE.BufferGeometry, color: number, finish: Finish, place: Placement = {}): this {
    const g = indexed(geometry);
    g.applyMatrix4(placeMatrix(place));
    const count = g.getAttribute('position').count;
    const c = new THREE.Color(color);
    const colors = new Float32Array(count * 3);
    const finishes = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      colors.set([c.r, c.g, c.b], i * 3);
      finishes.set([finish.rough, finish.metal, finish.glow, finish.scatter ?? 0], i * 4);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('finish', new THREE.BufferAttribute(finishes, 4));
    this.parts.push(g);
    return this;
  }

  ellipsoid(
    radii: V3,
    color: number,
    finish: Finish,
    place: Placement = {},
    detail: readonly [number, number] = [18, 12],
  ): this {
    const g = new THREE.SphereGeometry(1, detail[0], detail[1]);
    g.scale(...radii);
    return this.add(g, color, finish, place);
  }

  sphere(r: number, color: number, finish: Finish, place: Placement = {}, detail = 16): this {
    return this.ellipsoid([r, r, r], color, finish, place, [detail, Math.ceil(detail * 0.7)]);
  }

  /** Part of a sphere: `theta` is the polar extent from its top (+y). */
  cap(
    radii: V3,
    theta: number,
    color: number,
    finish: Finish,
    place: Placement = {},
    detail: readonly [number, number] = [24, 10],
  ): this {
    const g = new THREE.SphereGeometry(1, detail[0], detail[1], 0, Math.PI * 2, 0, theta);
    g.scale(...radii);
    return this.add(g, color, finish, place);
  }

  lathe(
    profile: readonly (readonly [number, number])[],
    color: number,
    finish: Finish,
    place: Placement = {},
    segments = 40,
    phiStart = 0,
    phiLength = Math.PI * 2,
  ): this {
    return this.add(latheGeometry(profile, segments, phiStart, phiLength), color, finish, place);
  }

  shell(
    profile: readonly (readonly [number, number])[],
    thickness: number,
    color: number,
    finish: Finish,
    place: Placement = {},
    segments = 40,
    phiStart = 0,
    phiLength = Math.PI * 2,
  ): this {
    return this.add(
      shellGeometry(profile, thickness, segments, phiStart, phiLength),
      color,
      finish,
      place,
    );
  }

  sweep(
    points: readonly (V3 | THREE.Vector3)[],
    size: SweepSize,
    color: number,
    finish: Finish,
    options: SweepOptions = {},
    place: Placement = {},
  ): this {
    return this.add(sweepGeometry(points, size, options), color, finish, place);
  }

  box(
    w: number,
    h: number,
    d: number,
    radius: number,
    color: number,
    finish: Finish,
    place: Placement = {},
  ): this {
    const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const g = r > 2e-3 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    return this.add(g, color, finish, place);
  }

  cylinder(
    rTop: number,
    rBottom: number,
    h: number,
    color: number,
    finish: Finish,
    place: Placement = {},
    radial = 20,
    open = false,
  ): this {
    return this.add(
      new THREE.CylinderGeometry(rTop, rBottom, h, radial, 1, open),
      color,
      finish,
      place,
    );
  }

  torus(
    r: number,
    tube: number,
    color: number,
    finish: Finish,
    place: Placement = {},
    arc = Math.PI * 2,
    detail: readonly [number, number] = [10, 28],
  ): this {
    return this.add(
      new THREE.TorusGeometry(r, tube, detail[0], detail[1], arc),
      color,
      finish,
      place,
    );
  }

  capsule(
    r: number,
    length: number,
    color: number,
    finish: Finish,
    place: Placement = {},
    radial = 12,
  ): this {
    return this.add(new THREE.CapsuleGeometry(r, length, 4, radial), color, finish, place);
  }

  /** A geometry another builder already colored, placed. */
  merge(geometry: THREE.BufferGeometry, place: Placement = {}): this {
    geometry.applyMatrix4(placeMatrix(place));
    this.parts.push(geometry);
    return this;
  }

  /** Pieces so far, for builders that compose. */
  get size(): number {
    return this.parts.length;
  }

  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) return new THREE.BufferGeometry();
    const merged = mergeGeometries(this.parts, false);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    return merged;
  }
}

/** Hemisphere directions (+z up), cosine-weighted, for the crease bake. */
const CREASE_RAYS = Array.from({ length: 14 }, (_, i) => {
  const u = (i + 0.5) / 14;
  const a = i * 2.39996;
  const r = Math.sqrt(u);
  return new THREE.Vector3(r * Math.cos(a), r * Math.sin(a), Math.sqrt(1 - u));
});
/** Voxels along the longest side of a part for the crease bake. */
const CREASE_GRID = 56;
/** How far (in voxels) a crease looks for a neighbour, and how dark it gets. */
const CREASE_REACH = 5;
const CREASE_DARK = 0.42;
/** Smoothing passes over the baked shade. */
const CREASE_BLUR = 2;

/**
 * Bakes a cheap ambient occlusion into the vertex colors: points with other
 * surfaces close above them (under a strap, round a collar, between locks of
 * hair) get darker, which breaks up the flat fills. Self-lit pieces stay lit.
 */
export function bakeCreases(geometry: THREE.BufferGeometry): void {
  if (!['position', 'normal', 'color', 'finish'].every((name) => geometry.hasAttribute(name)))
    return;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color');
  const finish = geometry.getAttribute('finish');
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return;
  const size = box.getSize(new THREE.Vector3());
  const cell = Math.max(size.x, size.y, size.z, 1e-3) / CREASE_GRID;
  const pad = CREASE_REACH + 2;
  const nx = Math.ceil(size.x / cell) + pad * 2;
  const ny = Math.ceil(size.y / cell) + pad * 2;
  const nz = Math.ceil(size.z / cell) + pad * 2;
  const grid = new Uint8Array(nx * ny * nz);
  const ox = box.min.x - pad * cell;
  const oy = box.min.y - pad * cell;
  const oz = box.min.z - pad * cell;
  const voxel = (x: number, y: number, z: number): number => {
    const i = Math.floor((x - ox) / cell);
    const j = Math.floor((y - oy) / cell);
    const k = Math.floor((z - oz) / cell);
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
    return (k * ny + j) * nx + i;
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  const index = geometry.index;
  const triangles = (index?.count ?? position.count) / 3;
  for (let t = 0; t < triangles; t++) {
    const at = (k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);
    a.fromBufferAttribute(position, at(0));
    b.fromBufferAttribute(position, at(1));
    c.fromBufferAttribute(position, at(2));
    const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const n = Math.max(1, Math.min(24, Math.ceil(edge / cell)));
    for (let u = 0; u <= n; u++) {
      for (let v = 0; v <= n - u; v++) {
        p.copy(a)
          .multiplyScalar((n - u - v) / n)
          .addScaledVector(b, u / n)
          .addScaledVector(c, v / n);
        const g = voxel(p.x, p.y, p.z);
        if (g >= 0) grid[g] = 1;
      }
    }
  }
  const nrm = new THREE.Vector3();
  const tx = new THREE.Vector3();
  const ty = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const tint = new THREE.Color();
  const shade = new Float32Array(position.count).fill(1);
  for (let i = 0; i < position.count; i++) {
    if (finish.getZ(i) > 0.5) continue;
    p.fromBufferAttribute(position, i);
    nrm.fromBufferAttribute(normal, i).normalize();
    tx.set(Math.abs(nrm.x) < 0.9 ? 1 : 0, Math.abs(nrm.x) < 0.9 ? 0 : 1, 0)
      .cross(nrm)
      .normalize();
    ty.copy(nrm).cross(tx);
    let blocked = 0;
    for (const r of CREASE_RAYS) {
      dir.copy(tx).multiplyScalar(r.x).addScaledVector(ty, r.y).addScaledVector(nrm, r.z);
      for (let step = 1.6; step <= CREASE_REACH; step += 0.9) {
        const g = voxel(
          p.x + (dir.x * step + nrm.x * 1.1) * cell,
          p.y + (dir.y * step + nrm.y * 1.1) * cell,
          p.z + (dir.z * step + nrm.z * 1.1) * cell,
        );
        if (g >= 0 && grid[g]) {
          blocked += 1 - ((step - 1.6) / (CREASE_REACH - 1.6)) * 0.6;
          break;
        }
      }
    }
    shade[i] = 1 - CREASE_DARK * Math.min(1, blocked / CREASE_RAYS.length) ** 0.8;
  }
  // Blur the shade along the mesh's edges so the voxel steps don't speckle.
  if (index) {
    for (let pass = 0; pass < CREASE_BLUR; pass++) {
      const sum = Float32Array.from(shade);
      const count = new Float32Array(position.count).fill(1);
      for (let k = 0; k < index.count; k += 3) {
        for (let e = 0; e < 3; e++) {
          const i = index.getX(k + e);
          const j = index.getX(k + ((e + 1) % 3));
          sum[i] = (sum[i] ?? 0) + (shade[j] ?? 1);
          sum[j] = (sum[j] ?? 0) + (shade[i] ?? 1);
          count[i] = (count[i] ?? 0) + 1;
          count[j] = (count[j] ?? 0) + 1;
        }
      }
      for (let i = 0; i < position.count; i++) {
        if (finish.getZ(i) <= 0.5) shade[i] = (sum[i] ?? 0) / (count[i] ?? 1);
      }
    }
  }
  for (let i = 0; i < position.count; i++) {
    tint.fromBufferAttribute(color, i).multiplyScalar(shade[i] ?? 1);
    color.setXYZ(i, tint.r, tint.g, tint.b);
  }
  color.needsUpdate = true;
}

/** Triangles drawn for a geometry. */
export function triangleCount(geometry: THREE.BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
}

/** How strongly edges facing away from the camera catch a soft studio rim. */
const RIM = 0.32;
/** Warm fake-subsurface light on skin: in its shadowed side, and at its edges. */
const SCATTER = 0.22;
const SCATTER_RIM = 0.35;

/**
 * The one material every developer draws with: vertex colors, per-vertex
 * roughness/metalness/glow (`finish`) and a soft rim light that rounds the
 * sculpted forms. Shared by every character, never disposed by one.
 */
export function sculptMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 finish;\nvarying vec4 vFinish;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinish = finish;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec4 vFinish;\nconst vec3 SCATTER_TINT = vec3(1.0, 0.42, 0.3);',
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vFinish.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vFinish.y;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vFinish.z;',
      )
      .replace(
        '#include <opaque_fragment>',
        `float sculptRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
outgoingLight += diffuseColor.rgb * sculptRim * ${RIM.toFixed(3)} * (1.0 - vFinish.y);
// Skin: light bleeding warm through the turned-away side and the edges.
float sculptLit = saturate(dot(outgoingLight, vec3(0.333)) / max(dot(diffuseColor.rgb, vec3(0.333)), 1e-3));
outgoingLight += diffuseColor.rgb * SCATTER_TINT * vFinish.w * (${SCATTER.toFixed(3)} * (1.0 - sculptLit) + ${SCATTER_RIM.toFixed(3)} * sculptRim);
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'sculpt-finish-v2';
  return material;
}
