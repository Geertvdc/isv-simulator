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
  latheGeometry,
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
const MOUTH = 0x3e1418;
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
function lockTaper(width: number, thick: number, tip = 0.22): SweepSize {
  return (t: number) => {
    const k = t < 0.3 ? 0.8 + (t / 0.3) * 0.2 : 1 - ((t - 0.3) / 0.7) ** 2 * (1 - tip);
    return [width * k, thick * Math.max(0.45, k)] as const;
  };
}

// --- Faces -------------------------------------------------------------------

type MouthShape = 'grin' | 'smirk' | 'sleepy' | 'skeptic' | 'gritted' | 'gasp';

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
  /** Eyes popped wide: the lids may lift past the usual heavy-lidded minimum. */
  wide?: boolean;
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
    lid: [0.42, 0.22],
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

/** Knocked flying: everyone's face the same "whoa!", eyes popped and brows up. */
const SHOCKED: Expression = {
  lid: [0.12, 0.12],
  lidTilt: 0,
  brows: [
    [0.35, 0.36],
    [0.35, 0.36],
  ],
  arch: 0.07,
  mouth: 'gasp',
  squint: 0,
  wide: true,
};

const EYE_YAW = 0.36;
const EYE_PITCH = -0.01;
const LID_OPEN = 0.8;
/** The least an upper lid ever covers: a relaxed, heavy-lidded look. */
const LID_MIN = 0.28;

function eye(b: SculptBuilder, sign: number, skin: number, e: Expression): void {
  const side = sign < 0 ? 0 : 1;
  const surface = onSkull(sign * EYE_YAW, EYE_PITCH, 0);
  const n = skullNormalAt(sign * EYE_YAW, EYE_PITCH)
    .add(new THREE.Vector3(0, 0, 0.9))
    .normalize();
  const frame = facing(n);
  // Sunk into the socket: the skull hides the eyeball's rim, only the front shows.
  const center = surface.clone().addScaledVector(n, -0.027);
  const local = (x: number, y: number, z: number) =>
    new THREE.Vector3(x, y, z).applyQuaternion(frame).add(center);
  const at = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
  const rx = 0.05;
  const ry = 0.062;
  const rz = 0.04;
  // A soft shadow under the brow ridge.
  b.ellipsoid(
    [rx * 1.25, ry * 0.5, 0.01],
    mix(skin, 0x5a2a1a, 0.14),
    FINISH.skin,
    { at: at(local(0, ry * 0.85, 0.022)), quat: frame },
    [12, 8],
  );
  b.ellipsoid([rx, ry, rz], WHITE, FINISH.eye, { at: at(center), quat: frame }, [20, 14]);
  // Looking a touch toward the camera's middle.
  const gx = -sign * 0.004;
  b.ellipsoid(
    [0.036, 0.043, 0.012],
    IRIS,
    FINISH.eye,
    { at: at(local(gx, -0.006, rz - 0.004)), quat: frame },
    [16, 10],
  );
  b.ellipsoid(
    [0.02, 0.025, 0.008],
    INK,
    FINISH.eye,
    { at: at(local(gx, -0.006, rz + 0.004)), quat: frame },
    [14, 8],
  );
  b.sphere(0.0115, 0xffffff, FINISH.sparkle, { at: at(local(gx - 0.013, 0.01, rz + 0.008)) }, 10);
  b.sphere(0.005, 0xffffff, FINISH.sparkle, { at: at(local(gx + 0.012, -0.018, rz + 0.006)) }, 8);
  // Upper lid: a skin cap closing down over the eye, rimmed with a heavy lash line.
  // Every face keeps the top of the eye covered (no white above the iris).
  const lid = Math.max(e.wide ? 0 : LID_MIN, e.lid[side]) * 1.1 - LID_OPEN;
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(lid, 0, -sign * e.lidTilt));
  const lidFrame = frame.clone().multiply(tilt);
  const lr: V3 = [rx * 1.14, ry * 1.1, rz * 1.2];
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
      const k = 0.0042 + 0.0036 * o ** 2;
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
  /** A closed, calm smirk: lips pressed together, no teeth. */
  closed?: boolean;
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
      const w = 0.08;
      const top: Curve = (x) => {
        const u = (2 * x) / w;
        return -0.011 * u + 0.006 * u * u;
      };
      return {
        w,
        top,
        bottom: top,
        upperTeeth: 0,
        lowerTeeth: 0,
        tongue: 0,
        offset: -0.008,
        closed: true,
      };
    }
    case 'gasp': {
      const w = 0.06;
      const ring = round(w, 1);
      return {
        w,
        top: (x) => 0.006 + 0.016 * ring(x),
        bottom: (x) => 0.006 - 0.036 * ring(x),
        upperTeeth: 0,
        lowerTeeth: 0,
        tongue: 0.01,
        offset: 0,
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
  const lip = mix(skin, 0x8a3a30, 0.4);
  const along = (curve: Curve, dy: number, out: number, n = 14): V3[] =>
    Array.from({ length: n + 1 }, (_, k) => {
      const x = x0 + ((x1 - x0) * k) / n;
      return [yaw + x / FACE_R, MOUTH_PITCH + (curve(x) + dy) / FACE_R, out] as V3;
    });
  if (m.closed) {
    // Lips pressed together: a dark crease, a full lower lip and a dimple.
    skullSweep(
      b,
      along(m.top, 0, 0.002),
      (t) => [0.0028 + 0.0012 * Math.sin(Math.PI * t), 0.0022] as const,
      mix(skin, MOUTH, 0.65),
      FINISH.skin,
      18,
      6,
    );
    skullSweep(
      b,
      along(m.top, -0.0075, 0.0015, 10).slice(2, -2),
      (t) => [0.0065 * Math.sin(Math.PI * t) + 0.002, 0.0045] as const,
      lip,
      FINISH.skin,
      12,
      8,
    );
    const corner = onSkull(yaw + x0 / FACE_R, MOUTH_PITCH + (m.top(x0) + 0.002) / FACE_R, 0.001);
    b.sphere(
      0.0055,
      mix(skin, MOUTH, 0.35),
      FINISH.skin,
      { at: [corner.x, corner.y, corner.z] },
      8,
    );
    return;
  }
  // The open mouth: a dark cavity, deepest under the teeth.
  decal(b, yaw, MOUTH_PITCH, x0, x1, m.bottom, m.top, 0.0015, MOUTH, FINISH.skin, 20, 4);
  decal(
    b,
    yaw,
    MOUTH_PITCH,
    x0 * 0.8,
    x1 * 0.8,
    (x) => m.top(x) - (m.top(x) - m.bottom(x)) * 0.55,
    m.top,
    0.0019,
    mix(MOUTH, 0x000000, 0.45),
    FINISH.skin,
    16,
    3,
  );
  // Teeth: one bar per row, split by faint lines rather than a grid of tiles.
  const inset = (x: number) => Math.max(0, 1 - Math.abs((2 * x) / m.w) ** 6);
  const teeth = (height: number, upper: boolean) => {
    const edge = (x: number) =>
      upper
        ? Math.max(m.bottom(x), m.top(x) - height * inset(x))
        : Math.min(m.top(x), m.bottom(x) + height * inset(x));
    const [lo, hi] = upper ? [edge, m.top] : [m.bottom, edge];
    decal(
      b,
      yaw,
      MOUTH_PITCH,
      x0,
      x1,
      lo,
      hi,
      0.003,
      upper ? TEETH : mix(TEETH, 0xa89a88, 0.35),
      FINISH.enamel,
      24,
      2,
    );
    if (!upper) return;
    for (const f of [-0.5, -0.17, 0.17, 0.5]) {
      const x = f * m.w * 0.5;
      const half = 0.0007;
      decal(
        b,
        yaw,
        MOUTH_PITCH,
        x - half,
        x + half,
        (u) => edge(u),
        (u) => edge(u) + (m.top(u) - edge(u)) * 0.6,
        0.0033,
        mix(TEETH, 0x9a8a78, 0.45),
        FINISH.enamel,
        1,
        1,
      );
    }
  };
  if (m.upperTeeth > 0) teeth(m.upperTeeth, true);
  if (m.lowerTeeth > 0) teeth(m.lowerTeeth, false);
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
  // Lips: a soft rim, thin on top and fuller below.
  const rim: V3[] = [];
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n;
    rim.push([yaw + x / FACE_R, MOUTH_PITCH + m.top(x) / FACE_R, 0.002]);
  }
  for (let k = n - 1; k > 0; k--) {
    const x = x0 + ((x1 - x0) * k) / n;
    rim.push([yaw + x / FACE_R, MOUTH_PITCH + (m.bottom(x) - 0.002) / FACE_R, 0.002]);
  }
  skullSweep(
    b,
    rim,
    (t) => {
      const lower = Math.max(0, -Math.sin(2 * Math.PI * t));
      const r = 0.004 + 0.0045 * lower;
      return [r, r * 0.85] as const;
    },
    lip,
    FINISH.skin,
    40,
    6,
    true,
  );
}

function face(b: SculptBuilder, e: Expression, skin: number, hair: number): void {
  for (const sign of [-1, 1]) {
    eye(b, sign, skin, e);
    brow(b, sign, hair, e);
    // Ears, with a darker dish inside.
    const ear = onSkull(sign * 1.52, -0.06, -0.01);
    b.ellipsoid(
      [0.032, 0.062, 0.048],
      skin,
      FINISH.skin,
      { at: [ear.x, ear.y, ear.z], rot: [0, sign * 0.4, sign * -0.12] },
      [16, 10],
    );
    b.ellipsoid(
      [0.016, 0.04, 0.028],
      mix(skin, 0x6a3020, 0.3),
      FINISH.skin,
      {
        at: [ear.x + sign * 0.019, ear.y - 0.002, ear.z + 0.006],
        rot: [0, sign * 0.4, sign * -0.12],
      },
      [12, 8],
    );
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
  /** The whorl `[yaw, pitch]` the big locks flow out from. */
  whorl: [number, number];
  /** How many big locks fan out of the whorl, and how far they curl (radians per radian out). */
  count: number;
  twist: number;
  /** Depth of the grooves between locks, as a fraction of the shell. */
  groove: number;
  /** How far lock ends dip below the hairline (radians), by heading round the head (0 = face). */
  tips: (heading: number) => number;
  /** Extra volume swelling the shell: `height` at `[yaw, pitch]`, falling off over `radius` radians. */
  quiff?: { at: [number, number]; height: number; radius: number };
  /** Separate locks on top of the shell: a swoop, curtains, a ponytail. */
  locks: Lock[];
}

interface Lock {
  /** Skull points `[yaw, pitch, out]`, or head-space points for free tips. */
  path: (V3 | { at: V3 })[];
  width: number;
  thick: number;
  /** Tip width as a fraction of the lock's (rounder tips are chunkier). */
  tip?: number;
}

/** Locks fanning over the crown: `count` from `yaw0` to `yaw1`, each made by `make`. */
function fan(count: number, make: (k: number, t: number) => Lock): Lock[] {
  return Array.from({ length: count }, (_, k) => make(k, count === 1 ? 0.5 : k / (count - 1)));
}

/** A bump of `height` centred on `heading` (radians round the head), `width` wide. */
function around(heading: number, width: number, height: number): (h: number) => number {
  return (h) => {
    const d = Math.atan2(Math.sin(h - heading), Math.cos(h - heading));
    return height * Math.exp(-((d / width) ** 2));
  };
}

function cut(style: DeveloperHairstyle): HairCut {
  switch (style) {
    case 'swept':
      // A side-swept quiff: big smooth locks curling out of a whorl at the back
      // left, over the crown and down to a few tucked points at the nape, with
      // broad swoops from the part across the forehead.
      return {
        line: [0.42, 0.02, -0.72],
        crown: 0.052,
        edge: 0.03,
        part: 0.06,
        whorl: [-2.5, 1.0],
        count: 7,
        twist: 0.3,
        groove: 1,
        tips: around(Math.PI, 0.9, 0.17),
        quiff: { at: [0.2, 0.78], height: 0.055, radius: 0.5 },
        locks: [
          {
            path: [
              [-0.35, 0.98, 0.05],
              [0.1, 0.8, 0.085],
              [0.45, 0.55, 0.06],
              [0.68, 0.36, 0.028],
              [0.76, 0.26, 0.006],
            ],
            width: 0.09,
            thick: 0.055,
            tip: 0.2,
          },
        ],
      };
    case 'cropped':
      // Short and textured: a fade at the sides, small locks off the crown and a
      // little pointed fringe.
      return {
        line: [0.45, 0.12, -0.55],
        crown: 0.042,
        edge: 0.01,
        part: 0,
        whorl: [Math.PI, 1.15],
        count: 11,
        twist: 0.35,
        groove: 0.65,
        tips: around(0, 0.7, 0.09),
        locks: fan(2, (_, t) => ({
          path: [
            [-0.4 + t * 0.55, 1.0, 0.03],
            [-0.22 + t * 0.5, 0.75, 0.06],
            [-0.05 + t * 0.45, 0.55, 0.045],
            [0.05 + t * 0.45, 0.5, 0.012],
          ],
          width: 0.13,
          thick: 0.038,
          tip: 0.2,
        })),
      };
    case 'long':
      // A middle part, curtains framing the face, and length down to the shoulders.
      return {
        line: [0.4, -0.25, -1.4],
        crown: 0.042,
        edge: 0.03,
        part: 0,
        whorl: [0, 1.4],
        count: 12,
        twist: 0,
        groove: 0.4,
        tips: around(Math.PI, 0.9, 0.12),
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
      // Combed back into a high ponytail: fine ridges all running into the tie.
      return {
        line: [0.4, 0.05, -0.75],
        crown: 0.03,
        edge: 0.016,
        part: 0,
        whorl: [Math.PI, 0.6],
        count: 16,
        twist: 0,
        groove: 0.45,
        tips: () => 0,
        locks: fan(3, (k, t) => ({
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

/**
 * How far `d` sits from the middle of a big lock: 1 on a lock's spine, 0 in
 * the groove between two, with the locks curling out of the whorl.
 */
function lockRidge(cutting: HairCut, d: THREE.Vector3): { ridge: number; out: number } {
  const w = direction(...cutting.whorl);
  const u = new THREE.Vector3(0, 1, 0).cross(w);
  if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
  u.normalize();
  const v = w.clone().cross(u);
  const out = Math.acos(Math.max(-1, Math.min(1, d.dot(w))));
  const spin = Math.atan2(d.dot(v), d.dot(u)) + cutting.twist * out;
  return { ridge: Math.abs(Math.cos((cutting.count * spin) / 2)), out };
}

/**
 * One soft glossy band round the hair (the studio key's reflection), lighter
 * where the surface faces up and out, and a little darker down in the grooves.
 */
function shine(geometry: THREE.BufferGeometry, base: number): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const color = geometry.getAttribute('color');
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  const bright = new THREE.Color(mix(base, 0xfff4e0, 0.22));
  const deep = new THREE.Color(mix(base, 0x000000, 0.3));
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).sub(SKULL);
    n.fromBufferAttribute(normal, i);
    const d = p.clone().normalize();
    const pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
    const facingOut = Math.max(0, n.dot(d));
    const band = Math.exp(-(((pitch - 0.7) / 0.22) ** 2)) * facingOut ** 2;
    c.fromBufferAttribute(color, i);
    c.lerp(deep, smoothstep(0.02, 0.25, 1 - facingOut) * 0.6).lerp(bright, band * 0.5);
    color.setXYZ(i, c.r, c.g, c.b);
  }
  return geometry;
}

/** Columns round the head and rows from the hairline up to the crown of the hair shell. */
const SHELL_COLUMNS = 72;
const SHELL_ROWS = 26;

/**
 * The scalp shell, gridded from the hairline up so its edge follows the line
 * cleanly: a rolled edge tucked under the skin, big locks bulging between
 * grooves that curl out of the whorl, and lock ends dipping below the line as
 * points. Under a hat it lies flat on the crown.
 */
function hairShell(cutting: HairCut, hat: Hat | null): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  const p = new THREE.Vector3();
  for (let c = 0; c <= SHELL_COLUMNS; c++) {
    const heading = (c / SHELL_COLUMNS) * Math.PI * 2;
    const base = hairline(cutting, direction(heading, 0));
    const line =
      base - cutting.tips(heading) * lockRidge(cutting, direction(heading, base)).ridge ** 6;
    for (let k = 0; k <= SHELL_ROWS; k++) {
      const u = Math.max(0, (k - 1) / (SHELL_ROWS - 1));
      const pitch = k === 0 ? line - 0.05 : line + (Math.PI / 2 - line) * u ** 1.25;
      const d = direction(heading, Math.min(pitch, Math.PI / 2 - 1e-4));
      let t = -0.01;
      if (k > 0) {
        const { ridge, out } = lockRidge(cutting, d);
        const roll = Math.sin(Math.min(1, (pitch - line) / 0.12) * (Math.PI / 2));
        const top = smoothstep(-0.4, 0.9, pitch);
        const flat =
          hat === null ? 1 : 1 - 0.8 * smoothstep(hat.band + 0.03, hat.band + 0.13, d.dot(hat.up));
        const swell = cutting.quiff
          ? cutting.quiff.height *
            Math.exp(-((d.angleTo(direction(...cutting.quiff.at)) / cutting.quiff.radius) ** 2))
          : 0;
        const grooved = 1 - cutting.groove * smoothstep(0.1, 0.55, out) * (1 - Math.sqrt(ridge));
        t =
          (cutting.edge + (cutting.crown - cutting.edge) * top + swell) *
          (0.3 + 0.7 * roll) *
          grooved *
          flat;
      }
      skullPoint(d, p).addScaledVector(skullNormal(d), t);
      positions.push(p.x, p.y, p.z);
    }
  }
  const stride = SHELL_ROWS + 1;
  for (let c = 0; c < SHELL_COLUMNS; c++) {
    for (let k = 0; k < SHELL_ROWS; k++) {
      const a = c * stride + k;
      index.push(a, a + stride, a + 1, a + stride, a + stride + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  return smooth(g);
}

/**
 * Hair: a scalp shell sculpted into a few big smooth locks (grooves curling
 * out of a whorl, the lock ends dipping below the hairline as tucked points),
 * sinking under the skin past the hairline; plus a few swept locks on top.
 * Under a hat the shell lies flat on the crown and its locks are left off.
 */
function hair(b: SculptBuilder, style: DeveloperHairstyle, color: number, hat: Hat | null): void {
  const cutting = cut(style);
  const shell = hairShell(cutting, hat);
  const h = new SculptBuilder();
  h.add(shell, color, FINISH.hair);
  for (const lock of cutting.locks) {
    // A lock running out from under a hat would be cut to a stub: leave it off.
    const hidden = lock.path.some(
      (p) => hat !== null && isSkullPoint(p) && direction(p[0], p[1]).dot(hat.up) > hat.band,
    );
    if (hidden) continue;
    const points = lock.path.map((p) =>
      isSkullPoint(p) ? onSkull(p[0], p[1], p[2]) : new THREE.Vector3(...p.at),
    );
    h.sweep(points, lockTaper(lock.width, lock.thick, lock.tip), color, FINISH.hair, {
      segments: 14,
      radial: 10,
      up: (p) => p.clone().sub(SKULL).normalize(),
    });
  }
  b.merge(shine(h.build(), color));
  if (style === 'tied') {
    b.torus(0.032, 0.013, 0xff7a6a, FINISH.plastic, { at: [0, 0.395, -0.28], rot: [0.5, 0, 0] });
  }
}

// --- Head gear -----------------------------------------------------------------

/** A hat over the hair: directions from the skull center past `band` along `up` are under it. */
interface Hat {
  up: THREE.Vector3;
  band: number;
}

/** The beret's slouch: tipped back a little and down over the right ear. */
const BERET_TILT = new THREE.Euler(-0.12, 0, 0.27);
const BERET: Hat = { up: new THREE.Vector3(0, 1, 0).applyEuler(BERET_TILT), band: 0.2 };

/** Head gear for a role; `hair` is how thick the hair lies on the crown. */
function gear(b: SculptBuilder, role: RoleId, color: number, hair: number): void {
  switch (role) {
    case 'frontend': {
      // A puffy beret pulled on over the crown, slouched down to the right,
      // its soft crown overhanging the band; a pencil behind the ear.
      const beret = 0x3a3352;
      const crown = latheGeometry(
        [
          [0.262, -0.026],
          [0.272, -0.004],
          [0.29, 0.024],
          [0.308, 0.056],
          [0.304, 0.086],
          [0.272, 0.118],
          [0.208, 0.15],
          [0.118, 0.172],
          [0.001, 0.18],
        ],
        40,
      );
      // Puffed out over the right, dented in a little on the left.
      deform(crown, (v) => {
        const k = 1 + 0.07 * Math.cos(Math.atan2(v.z, -v.x));
        v.set(v.x * k, v.y * (1 + 0.1 * Math.max(0, -v.x / 0.3)), v.z * 0.95 * k);
      });
      // Tilted about the middle of the skull, so the band stays seated all round.
      const tilt = BERET_TILT;
      const seat = (x: number, y: number, z: number): V3 =>
        new THREE.Vector3(x, y, z).applyEuler(tilt).add(SKULL).toArray();
      const hatRot: V3 = [tilt.x, tilt.y, tilt.z];
      b.add(smooth(crown), beret, FINISH.knit, { at: seat(0, 0.072, -0.012), rot: hatRot });
      b.cylinder(0.009, 0.014, 0.036, beret, FINISH.knit, {
        at: seat(0.02, 0.27, -0.012),
        rot: hatRot,
      });
      // Resting on top of the left ear, tucked against the hair and running
      // front to back along the side of the head: the point forward, the
      // eraser behind.
      const rest = onSkull(1.52, 0.14, 0.045);
      const back = new THREE.Vector3(0.06, 0.2, -1).normalize();
      const along = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), back);
      const on = (k: number): V3 => rest.clone().addScaledVector(back, k).toArray();
      b.cylinder(0.021, 0.021, 0.17, 0xf2c12e, FINISH.plastic, { at: on(0), quat: along }, 6);
      b.cylinder(0.021, 0.003, 0.045, 0xe8c9a0, FINISH.cloth, { at: on(-0.1), quat: along }, 6);
      b.cylinder(0.022, 0.022, 0.03, 0xff8aa8, FINISH.rubber, { at: on(0.095), quat: along }, 8);
      break;
    }
    case 'backend': {
      // Big chunky over-ear headphones: a thick padded band pressed onto the
      // hair and fat cups with glowing rings.
      const dark = 0x2b2f38;
      const arc: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const a = -Math.PI / 2 + (k / 12) * Math.PI;
        const d = new THREE.Vector3(Math.sin(a), Math.cos(a), -0.08).normalize();
        arc.push(skullPoint(d).addScaledVector(skullNormal(d), hair + 0.024));
      }
      b.sweep(arc, () => [0.04, 0.022] as const, dark, FINISH.plastic, {
        segments: 20,
        radial: 10,
        up: (p) => p.clone().sub(SKULL).normalize(),
      });
      b.sweep(
        arc
          .slice(2, 11)
          .map((p) => p.clone().addScaledVector(p.clone().sub(SKULL).normalize(), -0.012)),
        () => [0.034, 0.018] as const,
        mix(dark, 0x000000, 0.3),
        FINISH.leather,
        { segments: 14, radial: 8, up: (p) => p.clone().sub(SKULL).normalize() },
      );
      for (const s of [-1, 1]) {
        const at = new THREE.Vector3(s * 0.31, 0.2, -0.01);
        const rot: V3 = [0, 0, (s * Math.PI) / 2];
        b.cylinder(0.135, 0.13, 0.1, dark, FINISH.plastic, { at: [at.x, at.y, at.z], rot }, 24);
        b.torus(0.115, 0.036, mix(dark, 0x000000, 0.3), FINISH.leather, {
          at: [at.x - s * 0.055, at.y, at.z],
          rot: [0, (s * Math.PI) / 2, 0],
        });
        b.torus(0.1, 0.009, 0x35e0ff, FINISH.led, {
          at: [at.x + s * 0.052, at.y, at.z],
          rot: [0, (s * Math.PI) / 2, 0],
        });
        b.cylinder(
          0.07,
          0.085,
          0.024,
          mix(color, 0x000000, 0.1),
          FINISH.plastic,
          {
            at: [at.x + s * 0.058, at.y, at.z],
            rot,
          },
          24,
        );
        // The yoke from the cup up into the band.
        b.cylinder(0.024, 0.03, 0.09, dark, FINISH.metal, {
          at: [s * 0.325, 0.34, -0.01],
        });
      }
      break;
    }
    case 'qa': {
      // Safety goggles pushed up on the forehead, a thick strap hugging the hair round the back.
      const strap: THREE.Vector3[] = [];
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        const front = ((1 + Math.cos(a)) / 2) ** 2;
        const d = new THREE.Vector3(
          Math.sin(a),
          0.66 - 0.36 * (1 - front),
          Math.cos(a),
        ).normalize();
        strap.push(skullPoint(d).addScaledVector(skullNormal(d), 0.03 + 0.072 * front));
      }
      b.sweep(strap, () => [0.034, 0.014] as const, 0x3a2f2a, FINISH.leather, {
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
      const cup = new THREE.Vector3(-0.28, 0.21, 0.01);
      b.cylinder(
        0.088,
        0.092,
        0.07,
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
      // Single-ear: just a small temple pad on the far side.
      b.cylinder(
        0.04,
        0.04,
        0.018,
        dark,
        FINISH.rubber,
        {
          at: [0.245, 0.21, 0.01],
          rot: [0, 0, Math.PI / 2],
        },
        16,
      );
      // A long boom swinging round to sit right in front of the mouth.
      const mouthAt = onSkull(0.02, -0.47, 0.085);
      b.sweep(
        [
          [cup.x - 0.02, cup.y - 0.02, cup.z + 0.05],
          [-0.29, 0.08, 0.16],
          [-0.22, 0.02, 0.26],
          [-0.1, 0.0, mouthAt.z + 0.01],
          [mouthAt.x - 0.03, mouthAt.y, mouthAt.z],
        ],
        0.011,
        dark,
        FINISH.plastic,
        { segments: 20, radial: 6 },
      );
      b.ellipsoid([0.038, 0.03, 0.03], 0x1a1c22, FINISH.knit, {
        at: [mouthAt.x, mouthAt.y, mouthAt.z + 0.005],
      });
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

/**
 * The whole head: skull and neck, face, hair and the role's head gear.
 * `shocked` swaps the role's face for the stumble's "whoa!".
 */
export function buildHead(
  role: RoleId,
  look: HeadLook,
  color: number,
  shocked = false,
): THREE.BufferGeometry {
  const b = new SculptBuilder();
  const skull = smooth(
    deform(new THREE.SphereGeometry(1, 36, 24), (v) => {
      skullPoint(v.clone().normalize(), v);
    }),
  );
  b.add(skull, look.skin, FINISH.skin);
  b.cylinder(0.078, 0.088, 0.16, look.skin, FINISH.skin, { at: [0, -0.04, -0.02] }, 20, true);
  face(b, shocked ? SHOCKED : EXPRESSIONS[role], look.skin, look.hair);
  hair(b, look.hairstyle, look.hair, role === 'frontend' ? BERET : null);
  gear(b, role, color, cut(look.hairstyle).crown);
  return b.build();
}
