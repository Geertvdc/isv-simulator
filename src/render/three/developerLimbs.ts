import * as THREE from 'three';
import type { RoleId } from '../../sim/roles';
import { FINISH, type Finish, SculptBuilder, latheGeometry } from './sculpt';

/**
 * The developers' limbs: sleeves and trouser legs built a unit long (the rig
 * stretches them between joints), oriented hands with fingers and a thumb,
 * knees, hips and the role's shoes. Hand space: the wrist at the origin, +y
 * along the forearm, +z out of the palm, the thumb on the −sign side of x.
 */

export function mix(a: number, b: number, k: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
}

export function shade(color: number, k: number): number {
  return k >= 0 ? mix(color, 0xffffff, k) : mix(color, 0x000000, -k);
}

export interface Sleeve {
  color: number;
  finish: Finish;
  /** Radius at the shoulder, the elbow and the wrist. */
  r: [number, number, number];
}

export interface Hands {
  /** Skin, or a glove. */
  color: number;
  finish: Finish;
  /** Gloves are a little fatter. */
  puff: number;
  /** A cuff round the wrist: a sleeve end, a rib or a glove's gauntlet. */
  cuff: { color: number; finish: Finish; r: number; length: number; flare: number } | null;
  /** A wristwatch on the left wrist. */
  watch?: boolean;
}

export interface ArmLook {
  upper: Sleeve;
  /** Forearm: a sleeve, or skin for rolled sleeves. */
  lower: Sleeve;
  /** Rolled cuff at the elbow (the sleeve's color, lighter). */
  roll: number | null;
  hands: Hands;
}

/** A unit-long open tube from y −0.5 (radius `a`) to y +0.5 (radius `b`), swelling `belly` in the middle. */
function tube(a: number, b: number, belly = 0, z = 1): THREE.BufferGeometry {
  const profile: [number, number][] = [];
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    profile.push([a + (b - a) * t + belly * Math.sin(Math.PI * t), t - 0.5]);
  }
  const g = latheGeometry(profile, 20);
  g.scale(1, 1, z);
  return g;
}

export function upperArm(look: ArmLook): THREE.BufferGeometry {
  const [r0, r1] = look.upper.r;
  return new SculptBuilder().add(tube(r0, r1, 0.006), look.upper.color, look.upper.finish).build();
}

/** The elbow, built along the upper arm (+y toward the elbow). */
export function elbow(look: ArmLook): THREE.BufferGeometry {
  const b = new SculptBuilder();
  const r = look.upper.r[1];
  if (look.roll !== null) {
    b.sphere(look.lower.r[0] + 0.004, look.lower.color, look.lower.finish, {}, 16);
    // A thick rolled cuff sitting just above the joint.
    b.torus(
      r + 0.006,
      0.02,
      look.roll,
      FINISH.cloth,
      { at: [0, -0.03, 0], rot: [Math.PI / 2, 0, 0] },
      Math.PI * 2,
      [10, 24],
    );
    b.torus(
      r + 0.004,
      0.016,
      shade(look.roll, -0.08),
      FINISH.cloth,
      { at: [0, -0.058, 0], rot: [Math.PI / 2, 0, 0] },
      Math.PI * 2,
      [10, 24],
    );
  } else {
    b.sphere(r + 0.003, look.upper.color, look.upper.finish, {}, 16);
  }
  return b.build();
}

export function lowerArm(look: ArmLook): THREE.BufferGeometry {
  const [r0, r1] = [look.lower.r[1], look.lower.r[2]];
  return new SculptBuilder()
    .add(tube(r0, r1, 0.004, 0.92), look.lower.color, look.lower.finish)
    .build();
}

export function hand(look: ArmLook, sign: number): THREE.BufferGeometry {
  const b = new SculptBuilder();
  const h = look.hands;
  const p = h.puff;
  const thumb = -sign;
  // Palm and the back of the hand.
  b.ellipsoid([0.057 + p, 0.06 + p, 0.036 + p], h.color, h.finish, { at: [0, 0.058, 0] }, [20, 14]);
  b.ellipsoid(
    [0.05 + p, 0.032, 0.034 + p],
    h.color,
    h.finish,
    { at: [0, 0.012, -0.002] },
    [16, 10],
  );
  // Four curled fingers, the middle one longest.
  const fingers = [
    { x: 0.036, length: 0.066 },
    { x: 0.012, length: 0.072 },
    { x: -0.012, length: 0.068 },
    { x: -0.035, length: 0.056 },
  ];
  for (const f of fingers) {
    const x = thumb * f.x;
    const L = f.length;
    const r = 0.0195 + p * 0.8;
    b.sweep(
      [
        [x, 0.088, 0.003],
        [x * 1.04, 0.088 + L * 0.5, 0.012],
        [x * 1.06, 0.088 + L * 0.85, 0.034],
        [x * 1.04, 0.088 + L * 0.92, 0.058],
      ],
      (t) => {
        const k =
          t < 0.82 ? 1 - 0.12 * t : 0.9 * Math.sqrt(Math.max(0.05, 1 - ((t - 0.82) / 0.18) ** 2));
        return [r * k, r * k * 0.92] as const;
      },
      h.color,
      h.finish,
      { segments: 10, radial: 8 },
    );
  }
  // The thumb, out to the side and curling in over the palm.
  const tr = 0.022 + p * 0.8;
  b.sweep(
    [
      [thumb * 0.04, 0.03, 0.008],
      [thumb * 0.066, 0.058, 0.026],
      [thumb * 0.07, 0.086, 0.042],
      [thumb * 0.056, 0.102, 0.054],
    ],
    (t) => {
      const k =
        t < 0.8 ? 1 - 0.1 * t : 0.92 * Math.sqrt(Math.max(0.05, 1 - ((t - 0.8) / 0.2) ** 2));
      return [tr * k, tr * k] as const;
    },
    h.color,
    h.finish,
    { segments: 10, radial: 8 },
  );
  if (h.cuff) {
    const c = h.cuff;
    b.add(
      latheGeometry(
        [
          [c.r - 0.008, -c.length],
          [c.r, -c.length + 0.006],
          [c.r + c.flare * 0.6, -c.length * 0.4],
          [c.r + c.flare, -0.004],
          [c.r + c.flare - 0.01, 0.004],
        ],
        24,
      ),
      c.color,
      c.finish,
    );
  }
  if (h.watch && sign < 0) {
    b.torus(
      0.052,
      0.009,
      0x2b2f38,
      FINISH.leather,
      { at: [0, -0.03, 0], rot: [Math.PI / 2, 0, 0] },
      Math.PI * 2,
      [8, 24],
    );
    b.cylinder(
      0.026,
      0.026,
      0.014,
      0xc9ccd2,
      FINISH.metal,
      { at: [0, -0.03, -0.055], rot: [Math.PI / 2, 0, 0] },
      16,
    );
    b.cylinder(
      0.02,
      0.02,
      0.004,
      0x2a3a4a,
      FINISH.glass,
      { at: [0, -0.03, -0.0625], rot: [Math.PI / 2, 0, 0] },
      16,
    );
  }
  return b.build();
}

// --- Legs --------------------------------------------------------------------------

export interface LegLook {
  trousers: number;
  finish: Finish;
  /** A turned-up cuff at the hem. */
  cuff: number | null;
  /** Big cargo pockets on the thighs. */
  cargo: boolean;
  shoe: ShoeStyle;
  /** Trim color on the shoes (the player's color on some). */
  trim: number;
}

export type ShoeStyle = 'sneaker' | 'hightop' | 'canvas' | 'oxford' | 'boot';

/** Hips and seat, from the hip line (origin) down to the crotch and up under the shirt. */
export function pelvis(look: LegLook): THREE.BufferGeometry {
  const g = latheGeometry(
    [
      [0.001, -0.135],
      [0.07, -0.128],
      [0.15, -0.09],
      [0.18, -0.04],
      [0.178, 0.0],
      [0.16, 0.04],
    ],
    32,
  );
  g.scale(1, 1, 0.8);
  const b = new SculptBuilder().add(g, look.trousers, look.finish);
  // Back pockets.
  for (const s of [-1, 1]) {
    b.box(0.09, 0.08, 0.016, 0.01, shade(look.trousers, -0.07), look.finish, {
      at: [s * 0.08, -0.065, -0.128],
      rot: [0.25, s * 0.35, 0],
    });
  }
  return b.build();
}

export function thigh(look: LegLook, sign: number): THREE.BufferGeometry {
  const b = new SculptBuilder().add(tube(0.088, 0.079, 0.008), look.trousers, look.finish);
  if (look.cargo) {
    b.box(0.05, 0.42, 0.09, 0.012, shade(look.trousers, -0.08), look.finish, {
      at: [sign * 0.082, 0.02, 0],
    });
    b.box(0.054, 0.1, 0.094, 0.01, shade(look.trousers, 0.04), look.finish, {
      at: [sign * 0.085, 0.2, 0],
    });
  }
  return b.build();
}

export function knee(look: LegLook): THREE.BufferGeometry {
  // A little inside the thigh and shin, so the surfaces never fight.
  return new SculptBuilder().sphere(0.0755, look.trousers, look.finish, {}, 16).build();
}

/** Shin: from the knee (y −0.5) to the ankle (y +0.5), with the hem over the shoe. */
export function shin(look: LegLook): THREE.BufferGeometry {
  const b = new SculptBuilder().add(tube(0.078, 0.074, 0.004), look.trousers, look.finish);
  if (look.cuff !== null) {
    b.add(
      latheGeometry(
        [
          [0.07, 0.05],
          [0.088, 0.08],
          [0.09, 0.4],
          [0.082, 0.5],
        ],
        24,
      ),
      look.cuff,
      look.finish,
    );
  } else {
    b.add(
      latheGeometry(
        [
          [0.07, 0.2],
          [0.082, 0.3],
          [0.084, 0.5],
          [0.074, 0.56],
        ],
        24,
      ),
      look.trousers,
      look.finish,
    );
  }
  return b.build();
}

/** Half-width of the shoe's upper along its length (`n` from −1 heel to 1 toe). */
function shoeWidth(n: number): number {
  return 0.074 + 0.014 * smoothstep(-0.6, 0.5, n);
}

/** Height of the upper's crown above its base along its length. */
function shoeCrown(n: number): number {
  const heel = 0.074 + 0.012 * smoothstep(-1, -0.4, n);
  return heel - 0.036 * smoothstep(-0.2, 0.9, n);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const SHOE_LENGTH = 0.16;
const SHOE_SHIFT = 0.04;

/** The top of the upper above its base at length `z` and side offset `x`. */
function shoeTop(z: number, x = 0): number {
  const n = Math.min(0.999, Math.max(-0.999, (z - SHOE_SHIFT) / SHOE_LENGTH));
  const ring = Math.sqrt(1 - n * n);
  const w = shoeWidth(n) * ring;
  const k = Math.min(1, Math.abs(x) / w);
  return shoeCrown(n) * ring * Math.sqrt(1 - k * k);
}

/** One smooth upper: a stretched egg, wide at the toe, tall at the heel, flat underneath. */
function shoeUpper(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 26, 18);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const n = p.getZ(i);
    const y = p.getY(i);
    p.setXYZ(
      i,
      p.getX(i) * shoeWidth(n),
      y > 0 ? y * shoeCrown(n) : y * 0.014,
      n * SHOE_LENGTH + SHOE_SHIFT,
    );
  }
  g.computeVertexNormals();
  return g;
}

/** A rounded sole slab following the upper's outline, `grow` wider all round. */
function soleSlab(height: number, grow: number): THREE.BufferGeometry {
  const bevel = Math.min(0.014, height * 0.4);
  const outline: THREE.Vector2[] = [];
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const n = Math.cos(a);
    const x = Math.sin(a) * (shoeWidth(n) + grow - bevel);
    const z = n * (SHOE_LENGTH + grow - bevel) + SHOE_SHIFT;
    outline.push(new THREE.Vector2(x, -z));
  }
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(outline), {
    depth: height - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

/** A shoe standing on the ground at its origin, toe to +z; the ankle opening is near y 0.1. */
export function shoe(look: LegLook, role: RoleId, sign: number): THREE.BufferGeometry {
  const b = new SculptBuilder();
  const s = look.shoe;
  const sole = s === 'boot' ? 0x2b2622 : s === 'oxford' ? 0x3a2a20 : 0xf4f1ea;
  const upper = {
    sneaker: 0xf6f3ec,
    hightop: 0x2f333d,
    canvas: 0xf2efe6,
    oxford: 0x6a4630,
    boot: 0xb07a3e,
  }[s];
  const finish = s === 'oxford' || s === 'boot' ? FINISH.leather : FINISH.cloth;
  const soleH = s === 'boot' ? 0.05 : s === 'oxford' ? 0.03 : 0.04;
  b.add(soleSlab(soleH, 0.01), sole, FINISH.rubber);
  if (s === 'sneaker' || s === 'hightop' || s === 'canvas') {
    // A colored stripe running round the sole.
    const stripe: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const n = Math.cos(a);
      stripe.push(
        new THREE.Vector3(
          Math.sin(a) * (shoeWidth(n) + 0.0105),
          soleH * 0.5,
          n * (SHOE_LENGTH + 0.0105) + SHOE_SHIFT,
        ),
      );
    }
    b.sweep(
      stripe.map((v) => [v.x, v.y, v.z] as const),
      () => [0.0045, 0.0075] as const,
      s === 'canvas' ? shade(look.trim, -0.1) : look.trim,
      FINISH.rubber,
      { closed: true, segments: 64, radial: 4, up: () => new THREE.Vector3(0, 1, 0) },
    );
  }
  const y0 = soleH - 0.004;
  b.add(shoeUpper(), upper, finish, { at: [0, y0, 0] });
  const top = (z: number, x = 0) => y0 + shoeTop(z, x);
  if (s === 'canvas') {
    // A rubber toe cap.
    b.cap(
      [0.082, 0.05, 0.06],
      1.25,
      sole,
      FINISH.rubber,
      { at: [0, y0 + 0.004, 0.152], rot: [Math.PI / 2, 0, 0] },
      [24, 8],
    );
  }
  if (s === 'sneaker' || s === 'hightop') {
    // A swoosh along the outer side, from the toe up to the heel.
    const path: (readonly [number, number, number])[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const z = 0.12 - t * 0.2;
      const lift = 0.012 + t * 0.042;
      const n = (z - SHOE_SHIFT) / SHOE_LENGTH;
      const w = shoeWidth(n) * Math.sqrt(1 - n * n);
      const h = shoeCrown(n) * Math.sqrt(1 - n * n);
      const x = w * Math.sqrt(Math.max(0, 1 - (lift / h) ** 2));
      path.push([sign * (x + 0.002), y0 + lift, z]);
    }
    b.sweep(
      path,
      (t) => [0.006 + 0.008 * Math.sin(Math.PI * Math.min(1, t * 1.3)), 0.004] as const,
      look.trim,
      FINISH.plastic,
      {
        segments: 14,
        radial: 6,
        up: () => new THREE.Vector3(sign, 0, 0),
      },
    );
  }
  const heelZ = -0.05;
  if (s === 'hightop' || s === 'boot') {
    // A shaft up over the ankle, wide enough to tuck the trousers into.
    // Boots take the trousers tucked in; a high-top hides under a turned-up hem.
    const boot = s === 'boot' || look.cuff === null;
    const shaft = boot ? 0.2 : 0.13;
    const r = boot ? 0.09 : 0.076;
    const base = top(heelZ) - 0.03;
    b.add(
      latheGeometry(
        [
          [0.07, base],
          [r - 0.002, base + 0.03],
          [r, shaft - 0.02],
          [r + 0.005, shaft],
        ],
        24,
      ),
      upper,
      finish,
      { at: [0, 0, heelZ] },
    );
    b.torus(
      r + 0.004,
      0.012,
      s === 'boot' ? 0x6a4630 : look.trim,
      finish,
      { at: [0, shaft, heelZ], rot: [Math.PI / 2, 0, 0] },
      Math.PI * 2,
      [8, 24],
    );
    if (s === 'boot')
      b.box(0.03, 0.05, 0.012, 0.004, 0x6a4630, FINISH.leather, {
        at: [0, shaft + 0.01, heelZ - 0.08],
      });
  } else {
    // A padded ankle collar round the opening.
    b.torus(
      0.056,
      0.014,
      s === 'oxford' ? shade(upper, -0.15) : shade(upper, -0.05),
      finish,
      { at: [0, top(heelZ) - 0.008, heelZ], rot: [Math.PI / 2 + 0.12, 0, 0] },
      Math.PI * 2,
      [8, 24],
    );
  }
  // Tongue and laces over the instep.
  const lace =
    s === 'boot' ? 0x5a3a22 : s === 'oxford' ? 0x2a1c14 : role === 'frontend' ? 0x8e6cf0 : 0xfdfdf6;
  b.ellipsoid(
    [0.038, 0.012, 0.055],
    s === 'hightop' ? look.trim : shade(upper, -0.03),
    finish,
    { at: [0, top(0.03) - 0.002, 0.03], rot: [-0.35, 0, 0] },
    [14, 8],
  );
  for (let k = 0; k < (s === 'boot' ? 4 : 3); k++) {
    const z = 0.085 - k * 0.03;
    const y = top(z);
    b.sweep(
      [
        [-0.04, top(z, 0.04) + 0.002, z - 0.004],
        [0, y + 0.006, z + 0.002],
        [0.04, top(z, 0.04) + 0.002, z - 0.004],
      ],
      0.0062,
      lace,
      FINISH.cloth,
      { segments: 6, radial: 6 },
    );
  }
  return b.build();
}

/** The lower convex hull of a shoe's side view (`[y, z]`), to keep a pitched shoe on the floor. */
export function soleHull(geometry: THREE.BufferGeometry): [number, number][] {
  const p = geometry.getAttribute('position');
  const points: [number, number][] = [];
  for (let i = 0; i < p.count; i++) points.push([p.getZ(i), p.getY(i)]);
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], c: [number, number]) =>
    (a[0] - o[0]) * (c[1] - o[1]) - (a[1] - o[1]) * (c[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of points) {
    while (lower.length >= 2) {
      const a = lower[lower.length - 2];
      const c = lower[lower.length - 1];
      if (a && c && cross(a, c, q) <= 0) lower.pop();
      else break;
    }
    lower.push(q);
  }
  return lower.map(([z, y]) => [y, z]);
}

/** How far a shoe pitched by `a` (around x) has to rise to stay on the floor. */
export function soleRise(hull: readonly [number, number][], a: number): number {
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let low = Infinity;
  for (const [y, z] of hull) low = Math.min(low, y * cos - z * sin);
  return Math.max(0, -low);
}
