import * as THREE from 'three';
import type { RoleId } from '../../sim/roles';
import {
  FINISH,
  type Finish,
  SculptBuilder,
  type SweepSize,
  type V3,
  deform,
  facing,
  smooth,
} from './sculpt';

/**
 * The developers' heads: one sculpted skull with a cartoon face (big eyes
 * with lids and a sparkle, chunky brows, a bulb nose, ears and a mouth with
 * teeth), hair built from a scalp shell plus chunky locks, and the role's
 * head gear. Head space: the neck pivot at the origin, facing +z.
 */

export const DEVELOPER_HAIRSTYLES = ['swept', 'cropped', 'long', 'tied'] as const;
export type DeveloperHairstyle = (typeof DEVELOPER_HAIRSTYLES)[number];

/** Middle of the skull in head space. */
export const SKULL = new THREE.Vector3(0, 0.225, 0.005);
const RX = 0.245;
const RY = 0.235;
const RZ = 0.218;

const INK = 0x1a1412;
const LASH = 0x2a1c16;
const IRIS = 0x5a3a24;
const WHITE = 0xfbf8f2;
const TEETH = 0xfaf6ea;
const MOUTH = 0x4a1c20;
const TONGUE = 0xd8646a;

/** The skull's surface point in unit direction `d` (head space). */
export function skullPoint(d: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const below = Math.max(0, -d.y);
  const front = Math.max(0, d.z);
  // Narrower toward the chin, full cheeks, a rounder back of the head.
  const rx = RX * (1 - 0.2 * below ** 1.7) * (1 + 0.05 * front * (1 - Math.abs(d.y)));
  const ry = RY * (1 + 0.04 * front * below);
  const rz = RZ * (d.z < 0 ? 1.07 : 1 + 0.05 * below * front);
  return out.set(SKULL.x + d.x * rx, SKULL.y + d.y * ry, SKULL.z + d.z * rz);
}

function direction(yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  );
}

/** Outward normal of the skull in direction `d`. */
function skullNormal(d: THREE.Vector3): THREE.Vector3 {
  const p = skullPoint(d).sub(SKULL);
  return new THREE.Vector3(p.x / RX ** 2, p.y / RY ** 2, p.z / RZ ** 2).normalize();
}

/** A point `out` above the skin at `yaw`/`pitch` (radians; 0, 0 is the face's middle). */
export function onSkull(yaw: number, pitch: number, out = 0): THREE.Vector3 {
  const d = direction(yaw, pitch);
  return skullPoint(d).addScaledVector(skullNormal(d), out);
}

export function skullNormalAt(yaw: number, pitch: number): THREE.Vector3 {
  return skullNormal(direction(yaw, pitch));
}

/** Arc length on the face per radian, for decals measured in meters. */
const FACE_R = 0.235;

type Curve = (x: number) => number;

/** A patch of color hugging the skull: between `bottom(x)` and `top(x)` (meters), centered on `yaw`/`pitch`. */
function decal(
  b: SculptBuilder,
  yaw: number,
  pitch: number,
  x0: number,
  x1: number,
  bottom: Curve,
  top: Curve,
  out: number,
  color: number,
  finish: Finish,
  columns = 16,
  rows = 4,
): void {
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= columns; i++) {
    const x = x0 + ((x1 - x0) * i) / columns;
    const lo = bottom(x);
    const hi = Math.max(lo, top(x));
    for (let j = 0; j <= rows; j++) {
      const y = lo + ((hi - lo) * j) / rows;
      const p = onSkull(yaw + x / FACE_R, pitch + y / FACE_R, out);
      positions.push(p.x, p.y, p.z);
    }
  }
  const stride = rows + 1;
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * stride + j;
      index.push(a, a + stride, a + 1, a + stride, a + stride + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  b.add(g, color, finish);
}

/** A tube hugging the skull through `[yaw, pitch, out]` points, flat against it. */
function skullSweep(
  b: SculptBuilder,
  path: readonly V3[],
  size: SweepSize,
  color: number,
  finish: Finish,
  segments = 14,
  radial = 8,
  closed = false,
): void {
  const points = path.map(([yaw, pitch, out]) => onSkull(yaw, pitch, out));
  b.sweep(points, size, color, finish, {
    segments,
    radial,
    closed,
    up: (p) => skullNormal(p.clone().sub(SKULL).normalize()),
  });
}

function mix(a: number, b: number, k: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
}

/** A tapering lock: full at the root, fattest a third along, to a point. */
function lockTaper(width: number, thick: number, tip = 0.08): SweepSize {
  return (t: number) => {
    const k = t < 0.3 ? 0.8 + (t / 0.3) * 0.2 : 1 - ((t - 0.3) / 0.7) ** 1.4 * (1 - tip);
    return [width * k, thick * Math.max(0.35, k)] as const;
  };
}

// --- Faces -------------------------------------------------------------------

type MouthShape = 'grin' | 'smirk' | 'sleepy' | 'skeptic' | 'gritted';

interface Expression {
  /** Upper lid closure per side [left, right], radians over the eye. */
  lid: [number, number];
  /** Lid tilt: + droops the outer corners (sleepy), − the inner ones (cross). */
  lidTilt: number;
  /** Brow heights (radians of pitch) at the inner and outer end, per side. */
  brows: [[number, number], [number, number]];
  arch: number;
  mouth: MouthShape;
  /** A happy squint pushing up the lower lids. */
  squint: number;
}

const EXPRESSIONS: Record<RoleId, Expression> = {
  generalist: {
    lid: [0.18, 0.18],
    lidTilt: 0.05,
    brows: [
      [0.27, 0.25],
      [0.27, 0.25],
    ],
    arch: 0.05,
    mouth: 'grin',
    squint: 0.35,
  },
  frontend: {
    lid: [0.42, 0.34],
    lidTilt: 0.1,
    brows: [
      [0.23, 0.24],
      [0.3, 0.33],
    ],
    arch: 0.04,
    mouth: 'smirk',
    squint: 0.2,
  },
  backend: {
    lid: [0.72, 0.72],
    lidTilt: 0.2,
    brows: [
      [0.22, 0.18],
      [0.22, 0.18],
    ],
    arch: 0.015,
    mouth: 'sleepy',
    squint: 0,
  },
  qa: {
    lid: [0.42, 0.06],
    lidTilt: -0.05,
    brows: [
      [0.19, 0.22],
      [0.33, 0.36],
    ],
    arch: 0.05,
    mouth: 'skeptic',
    squint: 0.1,
  },
  platform: {
    lid: [0.3, 0.3],
    lidTilt: -0.18,
    brows: [
      [0.17, 0.27],
      [0.17, 0.27],
    ],
    arch: 0.02,
    mouth: 'gritted',
    squint: 0.25,
  },
};

const EYE_YAW = 0.36;
const EYE_PITCH = -0.01;
const LID_OPEN = 0.8;

function eye(b: SculptBuilder, sign: number, skin: number, e: Expression): void {
  const side = sign < 0 ? 0 : 1;
  const surface = onSkull(sign * EYE_YAW, EYE_PITCH, 0);
  const n = skullNormalAt(sign * EYE_YAW, EYE_PITCH)
    .add(new THREE.Vector3(0, 0, 0.9))
    .normalize();
  const frame = facing(n);
  const center = surface.clone().addScaledVector(n, -0.012);
  const local = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z).applyQuaternion(frame).add(center);
  const at = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
  const rx = 0.056;
  const ry = 0.07;
  const rz = 0.04;
  b.ellipsoid([rx, ry, rz], WHITE, FINISH.eye, { at: at(center), quat: frame }, [20, 14]);
  // Looking a touch toward the camera's middle.
  const gx = -sign * 0.004;
  b.ellipsoid([0.037, 0.045, 0.012], IRIS, FINISH.eye, {
    at: at(local(gx, -0.004, rz - 0.004)),
    quat: frame,
  });
  b.ellipsoid([0.021, 0.026, 0.008], INK, FINISH.eye, {
    at: at(local(gx, -0.004, rz + 0.004)),
    quat: frame,
  });
  b.sphere(0.0115, 0xffffff, FINISH.sparkle, { at: at(local(gx - 0.013, 0.014, rz + 0.008)) }, 10);
  b.sphere(0.005, 0xffffff, FINISH.sparkle, { at: at(local(gx + 0.012, -0.016, rz + 0.006)) }, 8);
  // Upper lid: a skin cap closing down over the eye, rimmed with a lash line.
  // At closure 0 the lid sits folded back above the eye, leaving it wide open.
  const lid = e.lid[side] * 1.1 - LID_OPEN;
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(lid, 0, -sign * e.lidTilt));
  const lidFrame = frame.clone().multiply(tilt);
  const lr: V3 = [rx * 1.12, ry * 1.1, rz * 1.18];
  b.cap(lr, Math.PI / 2, skin, FINISH.skin, { at: at(center), quat: lidFrame }, [24, 8]);
  const lash: THREE.Vector3[] = [];
  for (let k = 0; k <= 10; k++) {
    const phi = -0.25 + (k / 10) * (Math.PI + 0.5);
    lash.push(
      new THREE.Vector3(lr[0] * Math.cos(phi) * 1.02, -0.002, lr[2] * Math.sin(phi) * 1.02)
        .applyQuaternion(lidFrame)
        .add(center),
    );
  }
  // Thicker at the outer corner, with a little flick.
  const outerFirst = sign > 0;
  b.sweep(
    lash,
    (t) => {
      const o = outerFirst ? 1 - t : t;
      const k = 0.003 + 0.0032 * o ** 2;
      return [k, k * 0.8] as const;
    },
    LASH,
    FINISH.hair,
    { segments: 16, radial: 6 },
  );
  // Lower lid and cheek: a happy squint lifts them.
  const lowerFrame = frame
    .clone()
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI - 0.5 + e.squint, 0, 0)));
  b.cap([rx * 1.08, ry * 1.06, rz * 1.12], 0.55 + e.squint * 0.35, skin, FINISH.skin, {
    at: at(center),
    quat: lowerFrame,
  });
}

function brow(b: SculptBuilder, sign: number, hair: number, e: Expression): void {
  const [inner, outer] = e.brows[sign < 0 ? 0 : 1];
  const path: V3[] = [];
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    const yaw = sign * (0.13 + 0.42 * t);
    path.push([yaw, inner + (outer - inner) * t + e.arch * Math.sin(Math.PI * t), 0.01]);
  }
  skullSweep(
    b,
    path,
    (t) => [0.021 * (1 - 0.45 * t) + 0.005, 0.012] as const,
    mix(hair, INK, 0.25),
    FINISH.hair,
    14,
    8,
  );
}

interface Mouth {
  w: number;
  top: Curve;
  bottom: Curve;
  upperTeeth: number;
  lowerTeeth: number;
  tongue: number;
  offset: number;
}

function mouthShape(shape: MouthShape): Mouth {
  const round =
    (w: number, depth: number, p = 2) =>
    (x: number) =>
      depth * Math.max(0, 1 - Math.abs((2 * x) / w) ** p) ** 0.5;
  switch (shape) {
    case 'grin': {
      const w = 0.13;
      const top: Curve = (x) => 0.006 + 0.016 * ((2 * x) / w) ** 2;
      const d = round(w, 0.056);
      return {
        w,
        top,
        bottom: (x) => top(x) - d(x),
        upperTeeth: 0.017,
        lowerTeeth: 0,
        tongue: 0.02,
        offset: 0,
      };
    }
    case 'smirk': {
      const w = 0.11;
      const top: Curve = (x) => {
        const u = (2 * x) / w;
        return 0.004 + 0.012 * u + 0.012 * u * u;
      };
      const d = round(w, 0.03);
      return {
        w,
        top,
        bottom: (x) => top(x) - d(x),
        upperTeeth: 0.012,
        lowerTeeth: 0,
        tongue: 0,
        offset: 0.012,
      };
    }
    case 'sleepy': {
      const w = 0.06;
      const top: Curve = (x) => 0.002 - 0.004 * ((2 * x) / w) ** 2;
      const d = round(w, 0.022);
      return {
        w,
        top,
        bottom: (x) => top(x) - d(x),
        upperTeeth: 0,
        lowerTeeth: 0,
        tongue: 0.008,
        offset: 0,
      };
    }
    case 'skeptic': {
      const w = 0.085;
      const top: Curve = (x) => {
        const u = (2 * x) / w;
        return -0.012 * u + 0.004 * Math.sin(u * Math.PI);
      };
      const d = round(w, 0.012);
      return {
        w,
        top,
        bottom: (x) => top(x) - d(x),
        upperTeeth: 0.007,
        lowerTeeth: 0,
        tongue: 0,
        offset: -0.008,
      };
    }
    case 'gritted': {
      const w = 0.12;
      const top: Curve = (x) => 0.008 + 0.012 * ((2 * x) / w) ** 2;
      const d = round(w, 0.04, 4);
      return {
        w,
        top,
        bottom: (x) => top(x) - d(x),
        upperTeeth: 0.019,
        lowerTeeth: 0.016,
        tongue: 0,
        offset: 0,
      };
    }
  }
}

const MOUTH_PITCH = -0.43;

function mouth(b: SculptBuilder, skin: number, shape: MouthShape): void {
  const m = mouthShape(shape);
  const yaw = m.offset / FACE_R;
  const x0 = -m.w / 2;
  const x1 = m.w / 2;
  decal(b, yaw, MOUTH_PITCH, x0, x1, m.bottom, m.top, 0.0015, MOUTH, FINISH.skin, 20, 4);
  const teeth = (count: number, height: number, upper: boolean) => {
    const tw = (x1 - x0) / count;
    for (let k = 0; k < count; k++) {
      const a = x0 + k * tw + 0.0018;
      const c = x0 + (k + 1) * tw - 0.0018;
      const inset = (x: number) => Math.max(0, 1 - Math.abs((2 * x) / m.w) ** 6);
      if (upper) {
        decal(
          b,
          yaw,
          MOUTH_PITCH,
          a,
          c,
          (x) => Math.max(m.bottom(x), m.top(x) - height * inset(x)),
          m.top,
          0.003,
          TEETH,
          FINISH.enamel,
          3,
          2,
        );
      } else {
        decal(
          b,
          yaw,
          MOUTH_PITCH,
          a,
          c,
          m.bottom,
          (x) => Math.min(m.top(x), m.bottom(x) + height * inset(x)),
          0.003,
          TEETH,
          FINISH.enamel,
          3,
          2,
        );
      }
    }
  };
  if (m.upperTeeth > 0) teeth(6, m.upperTeeth, true);
  if (m.lowerTeeth > 0) teeth(6, m.lowerTeeth, false);
  if (m.tongue > 0) {
    const tw = m.w * 0.28;
    decal(
      b,
      yaw,
      MOUTH_PITCH,
      -tw,
      tw,
      m.bottom,
      (x) =>
        Math.min(
          m.top(x) - m.upperTeeth - 0.003,
          m.bottom(x) + m.tongue * Math.sqrt(Math.max(0, 1 - (x / tw) ** 2)),
        ),
      0.0026,
      TONGUE,
      FINISH.skin,
      10,
      3,
    );
  }
  // Lips: a soft rim all round.
  const rim: V3[] = [];
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    rim.push([yaw + x / FACE_R, MOUTH_PITCH + m.top(x) / FACE_R, 0.002]);
  }
  for (let k = n - 1; k > 0; k--) {
    const x = x0 + ((x1 - x0) * k) / n;
    rim.push([yaw + x / FACE_R, MOUTH_PITCH + m.bottom(x) / FACE_R, 0.002]);
  }
  skullSweep(b, rim, 0.0055, mix(skin, 0x6a2a24, 0.45), FINISH.skin, 40, 6, true);
}

function face(b: SculptBuilder, role: RoleId, skin: number, hair: number): void {
  const e = EXPRESSIONS[role];
  for (const sign of [-1, 1]) {
    eye(b, sign, skin, e);
    brow(b, sign, hair, e);
    // Ears, with a darker dish inside.
    const ear = onSkull(sign * 1.52, -0.06, -0.01);
    b.ellipsoid([0.032, 0.062, 0.048], skin, FINISH.skin, {
      at: [ear.x, ear.y, ear.z],
      rot: [0, sign * 0.4, sign * -0.12],
    });
    b.ellipsoid([0.016, 0.04, 0.028], mix(skin, 0x6a3020, 0.3), FINISH.skin, {
      at: [ear.x + sign * 0.019, ear.y - 0.002, ear.z + 0.006],
      rot: [0, sign * 0.4, sign * -0.12],
    });
    // Rosy cheeks.
    decal(
      b,
      sign * 0.62,
      -0.3,
      -0.04,
      0.04,
      (x) => -0.024 * Math.sqrt(Math.max(0, 1 - (x / 0.04) ** 2)),
      (x) => 0.024 * Math.sqrt(Math.max(0, 1 - (x / 0.04) ** 2)),
      0.0012,
      mix(skin, 0xf06a5a, 0.28),
      FINISH.skin,
      10,
      4,
    );
  }
  // A bulb nose.
  const nose = onSkull(0, -0.2, 0.014);
  b.ellipsoid([0.042, 0.034, 0.036], mix(skin, 0xf07a6a, 0.08), FINISH.skin, {
    at: [nose.x, nose.y, nose.z],
    rot: [0.25, 0, 0],
  });
  mouth(b, skin, e.mouth);
}

// --- Hair --------------------------------------------------------------------

interface HairCut {
  /** Hairline pitch at the front, the sides and the back (radians). */
  line: [number, number, number];
  /** Shell thickness on top and where it meets the hairline. */
  crown: number;
  edge: number;
  /** Side part: lifts the hairline on one side (+ = viewer's left). */
  part: number;
  locks: Lock[];
}

interface Lock {
  /** Skull points `[yaw, pitch, out]`, or head-space points for free tips. */
  path: (V3 | { at: V3 })[];
  width: number;
  thick: number;
}

/** Locks fanning over the crown: `count` from `yaw0` to `yaw1`, each made by `make`. */
function fan(count: number, make: (k: number, t: number) => Lock): Lock[] {
  return Array.from({ length: count }, (_, k) => make(k, count === 1 ? 0.5 : k / (count - 1)));
}

function cut(style: DeveloperHairstyle): HairCut {
  switch (style) {
    case 'swept':
      // A big side-swept quiff: locks from a left part over the crown to the right.
      return {
        line: [0.42, 0.02, -0.8],
        crown: 0.055,
        edge: 0.022,
        part: 0.06,
        locks: [
          ...fan(5, (k, t) => ({
            path: [
              [-0.55 + t * 0.15, 1.1 - t * 0.12, 0.03],
              [-0.1 + t * 0.2, 0.95 - t * 0.2, 0.06 + 0.01 * k],
              [0.4 + t * 0.3, 0.62 - t * 0.28, 0.06],
              [0.75 + t * 0.35, 0.32 - t * 0.2, 0.03],
            ],
            width: 0.06,
            thick: 0.03,
          })),
          // The swoop over the forehead.
          {
            path: [
              [-0.3, 0.85, 0.05],
              [0.05, 0.72, 0.09],
              [0.38, 0.5, 0.075],
              [0.6, 0.38, 0.035],
            ],
            width: 0.075,
            thick: 0.045,
          },
          {
            path: [
              [-0.6, 0.8, 0.04],
              [-0.45, 0.6, 0.065],
              [-0.25, 0.47, 0.045],
            ],
            width: 0.05,
            thick: 0.03,
          },
          ...fan(5, (_, t) => ({
            path: [
              [Math.PI - 1.1 + t * 2.2, 0.75, 0.03],
              [Math.PI - 1.05 + t * 2.1, 0.25, 0.045],
              [Math.PI - 1.0 + t * 2.0, -0.35, 0.03],
            ],
            width: 0.065,
            thick: 0.025,
          })),
          ...[-1, 1].map((s) => ({
            path: [
              [s * 1.2, 0.6, 0.03] as V3,
              [s * 1.35, 0.25, 0.04] as V3,
              [s * 1.4, 0.0, 0.02] as V3,
            ],
            width: 0.055,
            thick: 0.022,
          })),
        ],
      };
    case 'cropped':
      // Short and textured: a fade at the sides, tufts on top.
      return {
        line: [0.45, 0.12, -0.55],
        crown: 0.03,
        edge: 0.008,
        part: 0,
        locks: [
          ...fan(5, (k, t) => ({
            path: [
              [-0.6 + t * 1.2, 1.15, 0.02],
              [-0.5 + t * 1.0, 0.85, 0.045 + (k % 2) * 0.008],
              [-0.42 + t * 0.84, 0.55, 0.03],
            ],
            width: 0.055,
            thick: 0.024,
          })),
          ...fan(4, (k, t) => ({
            path: [
              [Math.PI * 0.55 + t * Math.PI * 0.9, 1.25, 0.02],
              [Math.PI * 0.6 + t * Math.PI * 0.8, 0.95, 0.04 + (k % 2) * 0.006],
              [Math.PI * 0.62 + t * Math.PI * 0.76, 0.7, 0.025],
            ],
            width: 0.06,
            thick: 0.02,
          })),
        ],
      };
    case 'long':
      // A middle part, curtains framing the face, and length down to the shoulders.
      return {
        line: [0.4, -0.25, -1.4],
        crown: 0.042,
        edge: 0.03,
        part: 0,
        locks: [
          ...[-1, 1].flatMap((s) => [
            {
              path: [
                [s * 0.05, 1.05, 0.03] as V3,
                [s * 0.35, 0.62, 0.06] as V3,
                [s * 0.72, 0.15, 0.06] as V3,
                { at: [s * 0.24, -0.02, 0.1] as V3 },
                { at: [s * 0.22, -0.13, 0.06] as V3 },
              ],
              width: 0.07,
              thick: 0.04,
            },
            ...fan(3, (_, t) => ({
              path: [
                [s * (0.4 + t * 0.6), 1.0, 0.03] as V3,
                [s * (0.9 + t * 0.5), 0.45, 0.06] as V3,
                { at: [s * (0.27 - t * 0.01), 0.02, 0.02 - t * 0.12] as V3 },
                { at: [s * (0.24 - t * 0.02), -0.14, -0.01 - t * 0.12] as V3 },
              ],
              width: 0.07,
              thick: 0.035,
            })),
          ]),
          ...fan(5, (_, t) => ({
            path: [
              [Math.PI - 0.95 + t * 1.9, 0.9, 0.03],
              [Math.PI - 0.9 + t * 1.8, 0.2, 0.06],
              {
                at: [
                  Math.sin(Math.PI - 0.85 + t * 1.7) * 0.21,
                  0.0,
                  Math.cos(Math.PI - 0.85 + t * 1.7) * 0.21 - 0.03,
                ],
              },
              {
                at: [
                  Math.sin(Math.PI - 0.8 + t * 1.6) * 0.2,
                  -0.13,
                  Math.cos(Math.PI - 0.8 + t * 1.6) * 0.18 - 0.03,
                ],
              },
            ],
            width: 0.075,
            thick: 0.035,
          })),
        ],
      };
    case 'tied':
      // Pulled back into a high ponytail: combed ridges and the tail itself.
      return {
        line: [0.4, 0.05, -0.75],
        crown: 0.03,
        edge: 0.016,
        part: 0,
        locks: [
          ...fan(5, (_, t) => ({
            path: [
              [-0.55 + t * 1.1, 0.45, 0.012],
              [-0.45 + t * 0.9, 0.95, 0.032],
              [Math.PI - 0.6 + (1 - t) * 1.2, 1.15, 0.035],
              [Math.PI - 0.15 + (1 - t) * 0.3, 0.72, 0.03],
            ],
            width: 0.05,
            thick: 0.018,
          })),
          ...[-1, 1].map((s) => ({
            path: [
              [s * 1.05, 0.15, 0.012] as V3,
              [s * 1.5, 0.55, 0.03] as V3,
              [s * 2.4, 0.75, 0.03] as V3,
              [s * 2.95, 0.72, 0.03] as V3,
            ],
            width: 0.05,
            thick: 0.018,
          })),
          // The ponytail.
          ...fan(3, (k, t) => ({
            path: [
              { at: [0, 0.4, -0.25] as V3 },
              { at: [(t - 0.5) * 0.06, 0.36, -0.3] as V3 },
              { at: [(t - 0.5) * 0.1, 0.24, -0.305 + (k % 2) * 0.01] as V3 },
              { at: [(t - 0.5) * 0.12, 0.09, -0.335] as V3 },
              { at: [(t - 0.5) * 0.07 + 0.02, -0.04, -0.29] as V3 },
            ],
            width: 0.06,
            thick: 0.036,
          })),
        ],
      };
  }
}

function isSkullPoint(p: V3 | { at: V3 }): p is V3 {
  return Array.isArray(p);
}

function hairline(cutting: HairCut, d: THREE.Vector3): number {
  const theta = Math.atan2(d.x, d.z);
  const [front, side, back] = cutting.line;
  const a1 = (front - back) / 2;
  const a0 = ((front + back) / 2 + side) / 2;
  const a2 = (front + back) / 2 - a0;
  return (
    a0 + a1 * Math.cos(theta) + a2 * Math.cos(2 * theta) + cutting.part * Math.sin(theta) * 1.5
  );
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Hair: a scalp shell that sinks under the skin past the hairline, plus locks. */
function hair(
  b: SculptBuilder,
  style: DeveloperHairstyle,
  color: number,
  cap: number | null,
): void {
  const cutting = cut(style);
  const shell = smooth(
    deform(new THREE.SphereGeometry(1, 40, 28), (v) => {
      const d = v.clone().normalize();
      const pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
      const line = hairline(cutting, d);
      const h = smoothstep(line - 0.04, line + 0.1, pitch);
      const top = smoothstep(0.2, 1.2, pitch);
      const t = h * (cutting.edge + (cutting.crown - cutting.edge) * top) - 0.012 * (1 - h);
      skullPoint(d, v).addScaledVector(skullNormal(d), t);
    }),
  );
  b.add(shell, color, FINISH.hair);
  // Locks are a shade lighter on top, catching the light like sculpted hair.
  const light = mix(color, 0xffffff, 0.035);
  for (const lock of cutting.locks) {
    const points = lock.path.flatMap((p) => {
      if (!isSkullPoint(p)) return [new THREE.Vector3(...p.at)];
      const [yaw, pitch, out] = p;
      if (cap !== null && pitch > cap) return [];
      return [onSkull(yaw, pitch, out)];
    });
    if (points.length < 2) continue;
    b.sweep(points, lockTaper(lock.width, lock.thick), light, FINISH.hair, {
      segments: 11,
      radial: 8,
      up: (p) => p.clone().sub(SKULL).normalize(),
    });
  }
  if (style === 'tied') {
    b.torus(0.032, 0.013, 0xff7a6a, FINISH.plastic, { at: [0, 0.395, -0.28], rot: [0.5, 0, 0] });
  }
}

// --- Head gear -----------------------------------------------------------------

/** Pitch above which a hat hides the hair (locks there are left off). */
const BERET_CAP = 0.62;

function gear(b: SculptBuilder, role: RoleId, color: number): void {
  switch (role) {
    case 'frontend': {
      // A slouchy beret, tipped to the right, and a pencil behind the ear.
      const beret = 0x2c2a3a;
      const tilt: V3 = [-0.12, 0, -0.22];
      b.torus(0.205, 0.022, mix(beret, 0x000000, 0.25), FINISH.knit, {
        at: [0.01, 0.39, -0.01],
        rot: [Math.PI / 2 + tilt[0], 0, tilt[2]],
      });
      b.ellipsoid([0.255, 0.075, 0.245], beret, FINISH.knit, {
        at: [0.04, 0.45, -0.015],
        rot: tilt,
      });
      b.cylinder(0.008, 0.014, 0.04, beret, FINISH.knit, {
        at: [0.055, 0.525, -0.01],
        rot: tilt,
      });
      const ear = onSkull(1.5, 0.12, 0.05);
      const pencil = new THREE.Euler(0.15, 0, 1.35);
      b.cylinder(
        0.011,
        0.011,
        0.15,
        0xf2c12e,
        FINISH.plastic,
        {
          at: [ear.x, ear.y, ear.z],
          rot: [pencil.x, pencil.y, pencil.z],
        },
        6,
      );
      const along = new THREE.Vector3(0, 1, 0).applyEuler(pencil);
      const tipAt = new THREE.Vector3(ear.x, ear.y, ear.z).addScaledVector(along, -0.09);
      b.cylinder(
        0.011,
        0.001,
        0.03,
        0xe8c9a0,
        FINISH.cloth,
        {
          at: [tipAt.x, tipAt.y, tipAt.z],
          rot: [pencil.x + Math.PI, pencil.y, pencil.z],
        },
        6,
      );
      const end = new THREE.Vector3(ear.x, ear.y, ear.z).addScaledVector(along, 0.085);
      b.cylinder(
        0.0115,
        0.0115,
        0.02,
        0xff8aa8,
        FINISH.rubber,
        {
          at: [end.x, end.y, end.z],
          rot: [pencil.x, pencil.y, pencil.z],
        },
        8,
      );
      break;
    }
    case 'backend': {
      // Big over-ear headphones with glowing rings.
      const dark = 0x2b2f38;
      const arc: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const a = -Math.PI / 2 + (k / 12) * Math.PI;
        const d = new THREE.Vector3(Math.sin(a), Math.cos(a), -0.08).normalize();
        arc.push(skullPoint(d).addScaledVector(skullNormal(d), 0.075));
      }
      b.sweep(arc, () => [0.032, 0.014] as const, dark, FINISH.plastic, {
        segments: 24,
        radial: 10,
        up: (p) => p.clone().sub(SKULL).normalize(),
      });
      b.sweep(
        arc
          .slice(3, 10)
          .map((p) => p.clone().addScaledVector(p.clone().sub(SKULL).normalize(), -0.012)),
        0.022,
        0x5a3a2a,
        FINISH.leather,
        { segments: 14, radial: 8 },
      );
      for (const s of [-1, 1]) {
        const at = new THREE.Vector3(s * 0.285, 0.2, -0.01);
        const rot: V3 = [0, 0, (s * Math.PI) / 2];
        b.cylinder(0.1, 0.1, 0.07, dark, FINISH.plastic, { at: [at.x, at.y, at.z], rot }, 28);
        b.torus(0.088, 0.024, mix(dark, 0x000000, 0.3), FINISH.leather, {
          at: [at.x - s * 0.04, at.y, at.z],
          rot: [0, (s * Math.PI) / 2, 0],
        });
        b.torus(0.072, 0.007, 0x35e0ff, FINISH.led, {
          at: [at.x + s * 0.037, at.y, at.z],
          rot: [0, (s * Math.PI) / 2, 0],
        });
        b.cylinder(
          0.05,
          0.06,
          0.02,
          mix(color, 0x000000, 0.1),
          FINISH.plastic,
          {
            at: [at.x + s * 0.042, at.y, at.z],
            rot,
          },
          24,
        );
        b.cylinder(0.02, 0.026, 0.07, dark, FINISH.plastic, {
          at: [s * 0.29, 0.31, -0.01],
        });
      }
      break;
    }
    case 'qa': {
      // Safety goggles pushed up on the forehead.
      const strap: THREE.Vector3[] = [];
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const d = new THREE.Vector3(
          Math.sin(a),
          0.62 - (0.45 * (1 - Math.cos(a))) / 2,
          Math.cos(a),
        ).normalize();
        strap.push(
          skullPoint(d).addScaledVector(skullNormal(d), 0.05 + 0.05 * ((1 + Math.cos(a)) / 2) ** 2),
        );
      }
      b.sweep(strap, () => [0.024, 0.008] as const, 0x3a2f2a, FINISH.leather, {
        closed: true,
        segments: 48,
        radial: 6,
        up: (p) => p.clone().sub(SKULL).normalize(),
      });
      for (const s of [-1, 1]) {
        const yaw = s * 0.3;
        const pitch = 0.66;
        // Out past the fringe, so the goggles sit on top of the hair.
        const at = onSkull(yaw, pitch, 0.125);
        const n = skullNormalAt(yaw, pitch)
          .add(new THREE.Vector3(0, 0.1, 0.7))
          .normalize();
        const q = facing(n);
        const lens = (z: number) => {
          const p = new THREE.Vector3(0, 0, z).applyQuaternion(q).add(at);
          return [p.x, p.y, p.z] as V3;
        };
        const tube = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        b.cylinder(0.068, 0.075, 0.06, 0x8a6a4a, FINISH.leather, { at: lens(0), quat: tube }, 28);
        b.torus(
          0.066,
          0.014,
          0xc8a050,
          FINISH.brass,
          { at: lens(0.032), quat: q },
          Math.PI * 2,
          [10, 32],
        );
        b.ellipsoid(
          [0.058, 0.058, 0.016],
          0x79d4e8,
          FINISH.glass,
          { at: lens(0.03), quat: q },
          [24, 12],
        );
        b.sphere(
          0.012,
          0xffffff,
          FINISH.sparkle,
          {
            at: (() => {
              const p = new THREE.Vector3(-0.022, 0.022, 0.044).applyQuaternion(q).add(at);
              return [p.x, p.y, p.z] as V3;
            })(),
          },
          8,
        );
      }
      const bridge = [onSkull(-0.2, 0.68, 0.15), onSkull(0, 0.72, 0.16), onSkull(0.2, 0.68, 0.15)];
      b.sweep(bridge, 0.012, 0xc8a050, FINISH.brass, { segments: 8, radial: 8 });
      break;
    }
    case 'platform': {
      // A headset: band, one ear cup and a boom mic to the mouth.
      const dark = 0x2b2f38;
      const arc: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const a = -Math.PI / 2 + (k / 12) * Math.PI;
        const d = new THREE.Vector3(Math.sin(a), Math.cos(a), 0.05).normalize();
        arc.push(skullPoint(d).addScaledVector(skullNormal(d), 0.06));
      }
      b.sweep(arc, () => [0.022, 0.011] as const, dark, FINISH.plastic, {
        segments: 24,
        radial: 8,
        up: (p) => p.clone().sub(SKULL).normalize(),
      });
      const cup = new THREE.Vector3(-0.275, 0.21, 0.01);
      b.cylinder(
        0.075,
        0.08,
        0.06,
        dark,
        FINISH.plastic,
        {
          at: [cup.x, cup.y, cup.z],
          rot: [0, 0, Math.PI / 2],
        },
        24,
      );
      b.cylinder(
        0.05,
        0.05,
        0.02,
        color,
        FINISH.plastic,
        {
          at: [cup.x - 0.035, cup.y, cup.z],
          rot: [0, 0, Math.PI / 2],
        },
        20,
      );
      b.cylinder(
        0.045,
        0.045,
        0.06,
        dark,
        FINISH.plastic,
        {
          at: [0.255, 0.21, 0.01],
          rot: [0, 0, Math.PI / 2],
        },
        16,
      );
      const mouthAt = onSkull(-0.2, -0.43, 0.05);
      b.sweep(
        [
          [cup.x - 0.01, cup.y - 0.03, cup.z + 0.05],
          [-0.25, 0.08, 0.15],
          [-0.17, 0.05, 0.22],
          [mouthAt.x, mouthAt.y, mouthAt.z],
        ],
        0.009,
        dark,
        FINISH.plastic,
        { segments: 16, radial: 6 },
      );
      b.sphere(0.024, 0x1a1c22, FINISH.knit, { at: [mouthAt.x, mouthAt.y, mouthAt.z + 0.008] }, 12);
      b.sphere(0.008, 0xff4a3a, FINISH.led, { at: [cup.x - 0.047, cup.y + 0.03, cup.z] }, 8);
      break;
    }
    case 'generalist':
      break;
  }
}

export interface HeadLook {
  skin: number;
  hair: number;
  hairstyle: DeveloperHairstyle;
}

/** The whole head: skull and neck, face, hair and the role's head gear. */
export function buildHead(role: RoleId, look: HeadLook, color: number): THREE.BufferGeometry {
  const b = new SculptBuilder();
  const skull = smooth(
    deform(new THREE.SphereGeometry(1, 40, 28), (v) => {
      skullPoint(v.clone().normalize(), v);
    }),
  );
  b.add(skull, look.skin, FINISH.skin);
  b.cylinder(0.078, 0.088, 0.16, look.skin, FINISH.skin, { at: [0, -0.04, -0.02] }, 20, true);
  face(b, role, look.skin, look.hair);
  hair(b, look.hairstyle, look.hair, role === 'frontend' ? BERET_CAP : null);
  gear(b, role, color);
  return b.build();
}
