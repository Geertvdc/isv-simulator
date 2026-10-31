import * as THREE from 'three';
import type { RoleId } from '../../sim/roles';
import {
  FINISH,
  type Finish,
  SculptBuilder,
  type V3,
  deform,
  latheGeometry,
  smooth,
} from './sculpt';

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

/** How deep a fold bites into a sleeve or trouser leg, as a fraction of its radius. */
const FOLD_DEPTH = 0.11;
/** Half-width of a fold along a unit-long tube. */
const FOLD_WIDTH = 0.024;

/**
 * A unit-long open tube from y −0.5 (radius `a`) to y +0.5 (radius `b`),
 * swelling `belly` (most at `peak` along it). `folds` (0 bottom to 1 top)
 * pinch in soft, wavy wrinkles where the cloth bunches at a joint.
 */
function tube(
  a: number,
  b: number,
  belly = 0,
  z = 1,
  folds: readonly number[] = [],
  peak = 0.5,
): THREE.BufferGeometry {
  const rows = new Set<number>();
  for (let k = 0; k <= 8; k++) rows.add(k / 8);
  for (const f of folds) {
    for (let k = -2; k <= 2; k++) rows.add(Math.min(1, Math.max(0, f + k * FOLD_WIDTH)));
  }
  const bend = Math.log(0.5) / Math.log(peak);
  const profile = [...rows]
    .sort((x, y) => x - y)
    .map((t): [number, number] => [
      a + (b - a) * t + belly * Math.sin(Math.PI * t ** bend),
      t - 0.5,
    ]);
  const g = latheGeometry(profile, 20);
  g.scale(1, 1, z);
  if (folds.length === 0) return g;
  deform(g, (v) => {
    const t = v.y + 0.5;
    const around = Math.atan2(v.x, v.z);
    let k = 1;
    folds.forEach((f, i) => {
      // Each wrinkle runs a little askew and fades out on one side.
      const at = f + 0.03 * Math.sin(around + i * 2.1);
      const fade = 0.55 + 0.45 * Math.sin(2 * around + i * 1.7);
      k -= FOLD_DEPTH * fade * Math.exp(-(((t - at) / FOLD_WIDTH) ** 2));
    });
    v.x *= k;
    v.z *= k;
  });
  return smooth(g);
}

/** Wrinkles where a sleeve or trouser leg bunches at its joint (skin has none). */
function foldsAt(finish: Finish, ...at: number[]): number[] {
  return finish === FINISH.skin ? [] : at;
}

export function upperArm(look: ArmLook): THREE.BufferGeometry {
  const [r0, r1] = look.upper.r;
  return new SculptBuilder()
    .add(
      tube(r0, r1, 0.006, 1, foldsAt(look.upper.finish, 0.8, 0.9)),
      look.upper.color,
      look.upper.finish,
    )
    .build();
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

/** The forearm, swelling just below the elbow and tapering to the wrist. */
export function lowerArm(look: ArmLook): THREE.BufferGeometry {
  const [r0, r1] = [look.lower.r[1], look.lower.r[2]];
  return new SculptBuilder()
    .add(
      tube(r0, r1, 0.006, 0.92, foldsAt(look.lower.finish, 0.12), 0.3),
      look.lower.color,
      look.lower.finish,
    )
    .build();
}

/** Hands are drawn big and chunky, cartoon style. */
const HAND_SCALE = 1.2;

/** The hand's shapes: hanging relaxed, clamped round a carried folder, or flat on a keyboard. */
export type HandShape = 'relaxed' | 'grip' | 'type';

/**
 * A hand: relaxed, (`grip`) clamped round the edge of a held folder, the palm
 * against the edge (~0.04 out from the wrist, see `CARRY_HALF_GAP`), fingers
 * under it and the thumb on top (the folder's middle at x 0 in hand space),
 * or (`type`) fingers out flat over the keys.
 */
export function hand(
  look: ArmLook,
  sign: number,
  shape: HandShape = 'relaxed',
): THREE.BufferGeometry {
  const b = new SculptBuilder();
  const h = look.hands;
  const thumb = -sign;
  const f =
    shape === 'grip'
      ? grippingHand(h, thumb)
      : openHand(h, thumb, shape === 'type' ? TYPING_CURL : RELAXED_CURL);
  b.merge(f.build(), { scale: [HAND_SCALE, HAND_SCALE, HAND_SCALE] });
  cuffAndWatch(b, h, sign);
  return b.build();
}

/** How far each finger curls in (index to pinky), hanging relaxed and resting on the keys. */
const RELAXED_CURL = [0.15, 0.4, 0.62, 0.85];
const TYPING_CURL = [0.05, 0.12, 0.18, 0.26];

function openHand(h: Hands, thumb: number, curl: number[]): SculptBuilder {
  const f = new SculptBuilder();
  const p = h.puff;
  // A thick palm and the back of the hand.
  f.ellipsoid(
    [0.058 + p, 0.06 + p, 0.042 + p],
    h.color,
    h.finish,
    { at: [0, 0.058, 0.002] },
    [16, 12],
  );
  f.ellipsoid([0.051 + p, 0.034, 0.038 + p], h.color, h.finish, { at: [0, 0.012, 0] }, [12, 8]);
  // The ball of the thumb, bulging out of the palm.
  f.ellipsoid(
    [0.027 + p, 0.042 + p, 0.028 + p],
    h.color,
    h.finish,
    { at: [thumb * 0.033, 0.04, 0.02], rot: [0, 0, thumb * 0.4] },
    [12, 8],
  );
  // Four thick fingers, the middle one longest: the index nearly straight, each next one curled in more.
  const fingers = [
    { x: 0.036, length: 0.068 },
    { x: 0.012, length: 0.074 },
    { x: -0.012, length: 0.07 },
    { x: -0.035, length: 0.058 },
  ];
  fingers.forEach((g, k) => {
    const x = thumb * g.x;
    const L = g.length;
    const c = curl[k] ?? 0;
    const bends = [0.12 + 0.35 * c, 0.2 + 0.55 * c, 0.2 + 0.6 * c];
    const lengths = [0.45, 0.33, 0.22];
    const path: V3[] = [[x, 0.086, 0.004]];
    let angle = 0;
    let [y, z] = [0.086, 0.004];
    bends.forEach((bend, j) => {
      angle += bend;
      y += Math.cos(angle) * L * (lengths[j] ?? 0);
      z += Math.sin(angle) * L * (lengths[j] ?? 0);
      path.push([x * (1 + 0.03 * (j + 1)), y, z]);
    });
    f.sweep(path, digit(0.0225 + p * 0.8, 0.82), h.color, h.finish, { segments: 8, radial: 7 });
  });
  // The thumb: lying forward along the index finger, just in front of it.
  f.sweep(
    [
      [thumb * 0.044, 0.034, 0.018],
      [thumb * 0.062, 0.058, 0.034],
      [thumb * 0.066, 0.086, 0.044],
      [thumb * 0.058, 0.106, 0.05],
    ],
    digit(0.025 + p * 0.8, 0.8),
    h.color,
    h.finish,
    { segments: 8, radial: 7 },
  );
  return f;
}

/** Fingertip-rounded thickness along a finger or thumb of radius `r`. */
function digit(r: number, knuckle: number): (t: number) => readonly [number, number] {
  return (t) => {
    const k =
      t < knuckle
        ? 1 - 0.1 * t
        : 0.9 * Math.sqrt(Math.max(0.05, 1 - ((t - knuckle) / (1 - knuckle)) ** 2));
    return [r * k, r * k * 0.94] as const;
  };
}

function grippingHand(h: Hands, thumb: number): SculptBuilder {
  const f = new SculptBuilder();
  const p = h.puff;
  const down = -thumb;
  // The palm, flat against the folder's edge.
  f.ellipsoid(
    [0.06 + p, 0.058 + p, 0.034 + p],
    h.color,
    h.finish,
    { at: [0, 0.06, -0.002] },
    [16, 12],
  );
  f.ellipsoid([0.05 + p, 0.03, 0.032 + p], h.color, h.finish, { at: [0, 0.014, -0.004] }, [12, 8]);
  // Four fingers hooked under the folder, side by side along it.
  const fingers = [
    { y: 0.026, reach: 0.092 },
    { y: 0.052, reach: 0.104 },
    { y: 0.078, reach: 0.1 },
    { y: 0.102, reach: 0.086 },
  ];
  for (const g of fingers) {
    const L = g.reach;
    f.sweep(
      [
        [down * 0.046, g.y, 0.004],
        [down * 0.058, g.y + 0.004, 0.032],
        [down * 0.058, g.y + 0.006, L * 0.7],
        [down * 0.053, g.y + 0.006, L],
      ],
      digit(0.0215 + p * 0.8, 0.82),
      h.color,
      h.finish,
      { segments: 8, radial: 7 },
    );
  }
  // The thumb over the top, pressing the folder down: one smooth digit growing out of the palm.
  f.ellipsoid(
    [0.024 + p, 0.036 + p, 0.022 + p],
    h.color,
    h.finish,
    { at: [thumb * 0.03, 0.04, 0.004], rot: [0.5, 0, 0] },
    [12, 8],
  );
  f.sweep(
    [
      [thumb * 0.04, 0.036, 0.004],
      [thumb * 0.054, 0.054, 0.034],
      [thumb * 0.058, 0.064, 0.066],
      [thumb * 0.055, 0.068, 0.09],
    ],
    digit(0.025 + p * 0.8, 0.8),
    h.color,
    h.finish,
    { segments: 8, radial: 7 },
  );
  return f;
}

function cuffAndWatch(b: SculptBuilder, h: Hands, sign: number): void {
  if (h.cuff) {
    const c = h.cuff;
    const knit = c.finish === FINISH.knit;
    const cuff = latheGeometry(
      [
        [c.r - 0.008, -c.length],
        [c.r, -c.length + 0.006],
        [c.r + c.flare * 0.6, -c.length * 0.4],
        [c.r + c.flare, -0.004],
        [c.r + c.flare - 0.01, 0.004],
      ],
      knit ? 48 : 24,
    );
    // Knitted cuffs get raised ribs running along the arm.
    if (knit) {
      deform(cuff, (v) => {
        const rib = 1 + 0.025 * (1 + Math.cos(Math.atan2(v.z, v.x) * 16));
        v.set(v.x * rib, v.y, v.z * rib);
      });
    }
    b.add(knit ? smooth(cuff) : cuff, c.color, c.finish);
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
  const b = new SculptBuilder().add(
    tube(0.088, 0.079, 0.008, 1, [0.84, 0.93]),
    look.trousers,
    look.finish,
  );
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
  const b = new SculptBuilder().add(
    tube(0.078, 0.074, 0.004, 1, [0.1]),
    look.trousers,
    look.finish,
  );
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
  const soleH = s === 'boot' ? 0.06 : s === 'oxford' ? 0.04 : 0.052;
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
      { closed: true, segments: 44, radial: 4, up: () => new THREE.Vector3(0, 1, 0) },
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
    const shaft = boot ? 0.2 : 0.12;
    const r = boot ? 0.09 : 0.07;
    // A high-top's shaft is centred under the shin so its trim hides in the hem.
    const z = boot ? heelZ : -0.012;
    const base = top(z) - 0.03;
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
      { at: [0, 0, z] },
    );
    b.torus(
      r + 0.004,
      boot ? 0.012 : 0.01,
      s === 'boot' ? 0x6a4630 : look.trim,
      finish,
      { at: [0, shaft, z], rot: [Math.PI / 2, 0, 0] },
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
  return heroic(b.build());
}

/** Shoes are drawn big, cartoon style: scaled up, the toe springing up off the floor. */
const SHOE_SCALE: V3 = [1.16, 1.12, 1.2];
const TOE_SPRING = 0.035;

function heroic(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const start = 0.08;
  const span = SHOE_SHIFT + SHOE_LENGTH + 0.012 - start;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, (p.getZ(i) - start) / span);
    p.setY(i, p.getY(i) + TOE_SPRING * t * t);
    // Bend the normal with the surface (inverse transpose of the shear).
    v.fromBufferAttribute(n, i);
    v.z -= ((2 * TOE_SPRING * t) / span) * v.y;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  // The foot grows; the ankle shaft above it stays slim enough to sit under the trousers.
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = Math.min(1, Math.max(0, (y - 0.07) / 0.05));
    const sx = SHOE_SCALE[0] + (1 - SHOE_SCALE[0]) * k;
    const sz = SHOE_SCALE[2] + (1.06 - SHOE_SCALE[2]) * k;
    p.setXYZ(i, p.getX(i) * sx, y * SHOE_SCALE[1], p.getZ(i) * sz);
    v.fromBufferAttribute(n, i);
    v.set(v.x / sx, v.y / SHOE_SCALE[1], v.z / sz).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingBox();
  return g;
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
