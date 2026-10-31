import * as THREE from 'three';
import type { RoleId } from '../../sim/roles';
import { type ArmLook, type LegLook, mix, shade } from './developerLimbs';
import {
  FINISH,
  type Finish,
  SculptBuilder,
  type V3,
  deform,
  facing,
  profileRadius,
  shellGeometry,
  smooth,
  smoothProfile,
} from './sculpt';

/**
 * What each developer wears on their body: torso garments, straps, pouches
 * and the role's signature kit, plus how their sleeves, gloves, trousers and
 * shoes look. Torso space: the torso pivot at the origin (the hips are at
 * y ≈ −0.19, the neck at y ≈ 0.31), facing +z.
 */

/** Front-to-back depth of the torso against its width. */
const DEPTH = 0.78;
const SATIN: Finish = { rough: 0.55, metal: 0, glow: 0.02 };
const CREAM = 0xf2ead8;
const COAT = 0xf4f0e6;
const CHARCOAL = 0x2b2f38;
const WEBBING = 0x2a363e;

type Profile = [number, number][];

/**
 * A body profile `[radius, y]` (hem to neck), `scale`d wider: soft belly, a
 * slightly narrower waist, a barrel chest under broad shoulders. Long tops
 * `flare` at the hem to clear the thighs.
 */
function bodyProfile(scale: number, hem = -0.23, flare = 0.185): Profile {
  return smoothProfile(
    [
      [flare * scale, hem],
      [0.2 * scale, hem + 0.06],
      [0.211 * scale, -0.08],
      [0.205 * scale, 0.01],
      [0.234 * scale, 0.135],
      [0.224 * scale, 0.225],
      [0.162 * scale, 0.283],
      [0.1, 0.31],
      [0.075, 0.32],
    ],
    28,
  );
}

/** A point `out` above a profile's (depth-scaled) surface at height `y`, `phi` round from the front. */
function surf(profile: Profile, y: number, phi: number, out = 0): THREE.Vector3 {
  const r = profileRadius(profile, y);
  const n = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi) / DEPTH).normalize();
  return new THREE.Vector3(r * Math.sin(phi), y, r * Math.cos(phi) * DEPTH).addScaledVector(n, out);
}

function v3(p: THREE.Vector3): V3 {
  return [p.x, p.y, p.z];
}

/** Out from the torso's middle: the "up" of anything lying on it. */
function outward(p: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(p.x, (p.y - 0.05) * 0.35, p.z / DEPTH).normalize();
}

function body(b: SculptBuilder, profile: Profile, color: number, finish: Finish): void {
  b.lathe(profile, color, finish, { scale: [1, 1, DEPTH] }, 40);
}

/** A band round the body at `y` (`from`..`to` radians round from the front; full when closed). */
function band(
  b: SculptBuilder,
  profile: Profile,
  y: number,
  out: number,
  size: readonly [number, number],
  color: number,
  finish: Finish,
  from = 0,
  to = Math.PI * 2,
): void {
  const closed = to - from >= Math.PI * 2 - 1e-6;
  const n = 32;
  const points: THREE.Vector3[] = [];
  for (let k = 0; k < (closed ? n : n + 1); k++)
    points.push(surf(profile, y, from + ((to - from) * k) / n, out));
  b.sweep(points, () => size, color, finish, {
    closed,
    segments: closed ? 36 : 28,
    radial: 6,
    up: outward,
  });
}

/** A strip lying on the body through `[x, y]` points on the front (z > 0) or back. */
/** A knitted rib band round the profile at `y`: `h` tall, with raised ribs. */
function ribbed(
  b: SculptBuilder,
  profile: Profile,
  y: number,
  h: number,
  out: number,
  color: number,
  ribs = 56,
): void {
  const r = profileRadius(profile, y) + out;
  const ring = deform(new THREE.CylinderGeometry(1, 1, h, ribs * 3, 2), (v) => {
    const a = Math.atan2(v.z, v.x);
    const edge = 1 - 0.35 * Math.abs(v.y / (h / 2)) ** 3;
    const k = r * (1 + (0.018 * Math.cos(a * ribs) + 0.008) * edge);
    v.set(v.x * k, v.y + y, v.z * k * DEPTH);
  });
  b.add(smooth(ring), color, FINISH.knit);
}

function strip(
  b: SculptBuilder,
  profile: Profile,
  points: readonly (readonly [number, number])[],
  back: boolean,
  out: number,
  size: readonly [number, number] | ((t: number) => readonly [number, number]),
  color: number,
  finish: Finish,
): void {
  const path = points.map(([x, y]) => {
    const r = Math.max(profileRadius(profile, y), Math.abs(x) + 1e-3);
    const phi = Math.asin(Math.max(-1, Math.min(1, x / r)));
    return surf(profile, y, back ? Math.PI - phi : phi, out);
  });
  b.sweep(path, typeof size === 'function' ? size : () => size, color, finish, {
    segments: Math.max(8, points.length * 5),
    radial: 6,
    up: outward,
  });
}

/** A flat piece lying on the body at (`x`, `y`), front or back. */
function patch(
  b: SculptBuilder,
  profile: Profile,
  x: number,
  y: number,
  back: boolean,
  out: number,
  w: number,
  h: number,
  d: number,
  color: number,
  finish: Finish,
  radius = 0.01,
): void {
  const r = profileRadius(profile, y);
  const phi0 = Math.asin(Math.max(-1, Math.min(1, x / r)));
  const phi = back ? Math.PI - phi0 : phi0;
  const at = surf(profile, y, phi, out + d / 2);
  const n = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi) / DEPTH).normalize();
  b.box(w, h, d, radius, color, finish, { at: v3(at), quat: facing(n) });
}

/** A curved panel hugging the body (a partial shell): `y0`..`y1`, `phi0`..`phi1`. */
function panel(
  b: SculptBuilder,
  profile: Profile,
  y0: number,
  y1: number,
  phi0: number,
  phi1: number,
  out: number,
  thickness: number,
  color: number,
  finish: Finish,
): void {
  const section: [number, number][] = [];
  for (let k = 0; k <= 6; k++) {
    const y = y0 + ((y1 - y0) * k) / 6;
    section.push([profileRadius(profile, y) + out + thickness, y]);
  }
  b.add(shellGeometry(section, thickness, 24, phi0, phi1 - phi0), color, finish, {
    scale: [1, 1, DEPTH],
  });
}

/** Shoulder caps, in the sleeve's color. */
function shoulders(b: SculptBuilder, x: number, r: number, color: number, finish: Finish): void {
  for (const s of [-1, 1]) b.sphere(r, color, finish, { at: [s * (x - 0.035), 0.172, 0] }, 16);
}

/** A piece that swings from `pivot` (torso space); its geometry is built around the pivot. */
export interface SwingPart {
  geometry: THREE.BufferGeometry;
  pivot: V3;
  /** Which way it may swing without going through the body. */
  hang: 'front' | 'back' | 'side';
  amp: number;
}

export interface Outfit {
  torso: THREE.BufferGeometry;
  swings: SwingPart[];
  /** Shoulder pivots at ±this. */
  shoulder: number;
  arm: ArmLook;
  leg: LegLook;
  /** How hard the head nods into the work. */
  nod: number;
}

// --- Full-stack: shirt, lanyard and a stuffed backpack -------------------------

function generalist(color: number, skin: number): Outfit {
  const b = new SculptBuilder();
  const P = bodyProfile(1);
  body(b, P, color, FINISH.cloth);
  shoulders(b, 0.26, 0.09, color, FINISH.cloth);
  const dark = shade(color, -0.12);
  // Shirt collar, placket and buttons, a chest pocket.
  band(b, P, 0.3, 0.012, [0.024, 0.012], dark, FINISH.cloth);
  for (const s of [-1, 1]) {
    b.sweep(
      [
        v3(surf(P, 0.312, s * 0.2, 0.02)),
        v3(surf(P, 0.28, s * 0.35, 0.022)),
        v3(surf(P, 0.245, s * 0.5, 0.012)),
      ],
      (t) => [0.03 * (1 - t * 0.7) + 0.006, 0.007] as const,
      dark,
      FINISH.cloth,
      { segments: 10, radial: 6, up: outward },
    );
  }
  strip(
    b,
    P,
    [
      [0, 0.27],
      [0, 0.1],
      [0, -0.22],
    ],
    false,
    0.004,
    [0.017, 0.005],
    dark,
    FINISH.cloth,
  );
  for (const y of [0.2, 0.1, 0, -0.1]) {
    b.ellipsoid(
      [0.011, 0.011, 0.005],
      CREAM,
      FINISH.plastic,
      { at: v3(surf(P, y, 0, 0.011)) },
      [10, 6],
    );
  }
  patch(b, P, 0.1, 0.1, false, 0.002, 0.075, 0.075, 0.012, dark, FINISH.cloth, 0.008);
  b.cylinder(
    0.006,
    0.006,
    0.06,
    0x2a6ad8,
    FINISH.plastic,
    { at: v3(surf(P, 0.15, 0.48, 0.012)) },
    8,
  );
  // Lanyard ribbon round the neck to a badge clip.
  const lanyard = 0x1fb6a6;
  for (const s of [-1, 1]) {
    strip(
      b,
      P,
      [
        [s * 0.07, 0.3],
        [s * 0.07, 0.24],
        [s * 0.045, 0.14],
        [s * 0.012, 0.06],
      ],
      false,
      0.02,
      [0.011, 0.003],
      lanyard,
      FINISH.plastic,
    );
  }
  b.torus(
    0.105,
    0.006,
    lanyard,
    FINISH.plastic,
    { at: [0, 0.305, -0.015], rot: [Math.PI / 2 + 0.25, 0, 0], scale: [1, 1, 0.9] },
    Math.PI,
    [6, 20],
  );
  // Backpack straps with a sternum strap.
  for (const s of [-1, 1]) {
    const pts: V3[] = [
      v3(surf(P, -0.04, s * 0.62, 0.016)),
      v3(surf(P, 0.12, s * 0.62, 0.02)),
      v3(surf(P, 0.24, s * 0.72, 0.024)),
      [s * 0.15, 0.31, -0.01],
      v3(surf(P, 0.24, Math.PI - s * 0.75, 0.024)),
      [s * 0.12, 0.17, -0.2],
    ];
    b.sweep(pts, () => [0.044, 0.014] as const, WEBBING, FINISH.cloth, {
      segments: 30,
      radial: 8,
      up: outward,
    });
    b.box(0.062, 0.036, 0.016, 0.005, 0x9aa3ad, FINISH.metal, {
      at: v3(surf(P, 0.0, s * 0.62, 0.03)),
      quat: facing(new THREE.Vector3(Math.sin(s * 0.62), 0, Math.cos(s * 0.62) / DEPTH)),
    });
  }
  strip(
    b,
    P,
    [
      [-0.13, 0.14],
      [0, 0.145],
      [0.13, 0.14],
    ],
    false,
    0.022,
    [0.016, 0.007],
    WEBBING,
    FINISH.cloth,
  );
  b.box(0.035, 0.03, 0.016, 0.005, 0xff8a3d, FINISH.plastic, { at: v3(surf(P, 0.145, 0, 0.03)) });
  // The pack: a big rounded body in a plum that clashes with every player color, wider
  // than the back and riding high, a front pocket, and a sticker-covered laptop
  // sticking up out of it, tipped back so its lid shows over the head from the camera.
  const pack = 0x5b3f9e;
  b.box(0.5, 0.52, 0.22, 0.1, pack, FINISH.cloth, { at: [0, 0.19, -0.285], rot: [-0.06, 0, 0] });
  b.box(0.3, 0.2, 0.09, 0.04, shade(pack, 0.12), FINISH.cloth, {
    at: [0, 0.03, -0.398],
    rot: [-0.06, 0, 0],
  });
  b.sweep(
    [
      [-0.13, 0.12, -0.443],
      [0, 0.138, -0.448],
      [0.13, 0.12, -0.443],
    ],
    0.006,
    0xc9ccd2,
    FINISH.metal,
    { segments: 10, radial: 6 },
  );
  b.box(0.018, 0.05, 0.008, 0.003, 0xff8a3d, FINISH.plastic, {
    at: [0.11, 0.1, -0.451],
    rot: [-0.1, 0, 0],
  });
  b.torus(
    0.06,
    0.012,
    WEBBING,
    FINISH.cloth,
    { at: [0, 0.45, -0.25], rot: [0, 0, 0] },
    Math.PI,
    [8, 16],
  );
  const laptop = new SculptBuilder()
    .box(0.34, 0.27, 0.024, 0.012, 0xc5cbd3, FINISH.metal)
    .box(0.33, 0.012, 0.026, 0.005, 0x3a3f4a, FINISH.plastic, { at: [0, -0.127, 0.004] });
  const stickers: [number, number, number, number, 'disc' | 'tile'][] = [
    [-0.09, 0.03, 0.042, 0xff6b8a, 'disc'],
    [0.06, -0.035, 0.032, 0xffd23f, 'tile'],
    [0.1, 0.06, 0.026, 0x3ad0e0, 'disc'],
    [-0.01, 0.075, 0.022, 0x8bd450, 'tile'],
  ];
  for (const [x, y, r, c, kind] of stickers) {
    const at: V3 = [x, y, -0.013];
    if (kind === 'disc')
      laptop.cylinder(r, r, 0.004, c, FINISH.enamel, { at, rot: [Math.PI / 2, 0, 0] }, 20);
    else laptop.box(r * 2, r * 2, 0.004, 0.006, c, FINISH.enamel, { at, rot: [0, 0, 0.3] });
  }
  b.merge(laptop.build(), { at: [-0.21, 0.53, -0.37], rot: [0.3, 0, -0.25] });
  const packStickers: [number, number, number, number][] = [
    [-0.08, -0.05, 0.03, 0xffd23f],
    [0.07, 0.0, 0.025, 0xff6b8a],
    [0.03, -0.08, 0.022, 0x8bd450],
  ];
  for (const [x, y, r, c] of packStickers) {
    b.cylinder(
      r,
      r,
      0.004,
      c,
      FINISH.enamel,
      { at: [x, y + 0.05, -0.443 - (y + 0.02) * 0.06], rot: [Math.PI / 2 - 0.06, 0, 0] },
      20,
    );
  }
  b.box(0.05, 0.03, 0.004, 0.004, 0xfdfdf6, FINISH.enamel, {
    at: [-0.14, 0.32, -0.405],
    rot: [-0.06, 0, -0.2],
  });

  // The ID badge, swinging on its clip.
  const badge = new SculptBuilder()
    .box(0.03, 0.022, 0.012, 0.004, 0xc9ccd2, FINISH.metal, { at: [0, -0.008, 0] })
    .box(0.082, 0.11, 0.008, 0.008, 0xfdfdf6, FINISH.plastic, { at: [0, -0.072, 0.002] })
    .box(0.082, 0.026, 0.009, 0.006, lanyard, FINISH.plastic, { at: [0, -0.03, 0.0025] })
    .box(0.03, 0.036, 0.004, 0.004, skin, FINISH.skin, { at: [-0.018, -0.07, 0.007] })
    .box(0.026, 0.006, 0.004, 0.002, 0x8a929c, FINISH.plastic, { at: [0.02, -0.062, 0.007] })
    .box(0.026, 0.006, 0.004, 0.002, 0x8a929c, FINISH.plastic, { at: [0.02, -0.076, 0.007] })
    .box(0.06, 0.008, 0.004, 0.002, 0x2b2f38, FINISH.plastic, { at: [0, -0.108, 0.007] })
    .build();
  const clip = surf(P, 0.06, 0, 0.026);
  return {
    torso: b.build(),
    swings: [{ geometry: badge.scale(1.4, 1.4, 1.4), pivot: v3(clip), hang: 'front', amp: 0.25 }],
    shoulder: 0.26,
    nod: 1,
    arm: {
      upper: { color, finish: FINISH.cloth, r: [0.072, 0.064, 0.06] },
      lower: { color: skin, finish: FINISH.skin, r: [0.058, 0.056, 0.048] },
      roll: shade(color, 0.12),
      hands: { color: skin, finish: FINISH.skin, puff: 0, cuff: null, watch: true },
    },
    leg: {
      trousers: 0x3d5a80,
      finish: FINISH.denim,
      cuff: 0x5a7aa0,
      cargo: false,
      shoe: 'sneaker',
      trim: color,
    },
  };
}

/** Round the waist from the front: where the swatch fan and the thermos hang, clear of hands and legs. */
const FAN_PHI = 2.05;
const THERMOS_PHI = -1.85;

// --- Frontend: color-block bomber, scarf, beret (on the head), swatch fan --------

function frontend(color: number, skin: number): Outfit {
  const b = new SculptBuilder();
  const P = bodyProfile(1.05, -0.22);
  body(b, P, color, SATIN);
  shoulders(b, 0.27, 0.092, CREAM, FINISH.cloth);
  // Ribbed knit hem and collar with a stripe, and a zip with a chunky pull.
  const rib = CHARCOAL;
  ribbed(b, P, -0.198, 0.05, 0.006, rib);
  band(b, P, -0.163, 0.006, [0.007, 0.012], shade(color, 0.35), FINISH.knit);
  band(b, P, -0.148, 0.004, [0.006, 0.01], rib, FINISH.knit);
  ribbed(b, P, 0.272, 0.05, 0.03, rib, 48);
  strip(
    b,
    P,
    [
      [0, 0.25],
      [0, 0.05],
      [0, -0.17],
    ],
    false,
    0.004,
    [0.012, 0.006],
    0xb8bec8,
    FINISH.metal,
  );
  const pull = surf(P, 0.17, 0, 0.012);
  b.box(0.02, 0.022, 0.01, 0.004, 0xb8bec8, FINISH.metal, { at: v3(pull) });
  b.torus(
    0.012,
    0.004,
    0xb8bec8,
    FINISH.metal,
    { at: [pull.x, pull.y - 0.02, pull.z + 0.006], rot: [0, 0, 0] },
    Math.PI * 2,
    [6, 12],
  );
  b.box(0.026, 0.05, 0.01, 0.006, 0xe84393, FINISH.rubber, {
    at: [pull.x, pull.y - 0.055, pull.z + 0.012],
    rot: [-0.18, 0, 0],
  });
  // Color-block: a cream yoke over the shoulders, front and back.
  for (const back of [false, true]) {
    panel(
      b,
      P,
      0.17,
      0.27,
      back ? Math.PI - 1.15 : -1.15,
      back ? Math.PI + 1.15 : 1.15,
      0.002,
      0.008,
      CREAM,
      FINISH.cloth,
    );
  }
  // A paint-drop patch on the chest.
  patch(b, P, -0.1, 0.06, false, 0.002, 0.07, 0.07, 0.008, CREAM, FINISH.cloth, 0.03);
  const drop = surf(P, 0.06, Math.asin(-0.1 / profileRadius(P, 0.06)), 0.014);
  b.sphere(
    0.02,
    0xe84393,
    FINISH.enamel,
    { at: [drop.x, drop.y - 0.006, drop.z], scale: [1, 1, 0.45] },
    14,
  );
  b.cylinder(
    0.0,
    0.02,
    0.03,
    0xe84393,
    FINISH.enamel,
    { at: [drop.x, drop.y + 0.016, drop.z], scale: [1, 1, 0.45] },
    14,
  );
  // The scarf: two thick knitted loops round the neck and a knot.
  const scarf = 0x7b4bd1;
  const loop = (y: number, rx: number, rz: number, tilt: number) => {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.sin(a) * rx, y + Math.cos(a) * tilt, Math.cos(a) * rz));
    }
    b.sweep(pts, () => [0.04, 0.034] as const, scarf, FINISH.knit, {
      closed: true,
      segments: 40,
      radial: 12,
      up: (p) => new THREE.Vector3(p.x, 0, p.z).normalize(),
    });
  };
  loop(0.318, 0.13, 0.12, -0.03);
  b.ellipsoid(
    [0.05, 0.045, 0.04],
    shade(scarf, 0.06),
    FINISH.knit,
    { at: [-0.06, 0.275, 0.135] },
    [16, 12],
  );
  const tail = new SculptBuilder();
  tail.sweep(
    [
      [0, 0, 0],
      [0.005, -0.08, 0.004],
      [-0.004, -0.17, 0.004],
      [0.004, -0.235, 0.0],
    ],
    (t) => [0.04 - t * 0.006, 0.014] as const,
    scarf,
    FINISH.knit,
    { segments: 16, radial: 10, up: () => new THREE.Vector3(0, 0, 1) },
  );
  for (let k = 0; k < 5; k++) {
    tail.cylinder(
      0.006,
      0.006,
      0.04,
      shade(scarf, 0.1),
      FINISH.knit,
      { at: [-0.028 + k * 0.014, -0.26, 0.0] },
      6,
    );
  }
  // A big swatch fan clipped to the belt behind the left hip: cards fanned back round a brass pin,
  // so the hand and the striding leg pass in front of it.
  const fan = new SculptBuilder();
  const swatches = [0xe84393, 0xff9f43, 0xfeca57, 0x1dd1a1, 0x54a0ff, 0x8e6cf0];
  swatches.forEach((c, k) => {
    const a = -0.15 + k * 0.22;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(a, 0, 0));
    const at = new THREE.Vector3(0, -0.07, 0).applyQuaternion(q);
    fan.box(0.005, 0.14, 0.042, 0.004, c, FINISH.enamel, {
      at: [0.004 + k * 0.0055, at.y, at.z],
      quat: q,
    });
    const tab = new THREE.Vector3(0, -0.125, 0).applyQuaternion(q);
    fan.box(0.002, 0.03, 0.03, 0.002, 0xfdfdf6, FINISH.enamel, {
      at: [0.0075 + k * 0.0055, tab.y, tab.z],
      quat: q,
    });
  });
  fan.cylinder(
    0.01,
    0.01,
    0.05,
    0xc8a050,
    FINISH.brass,
    { at: [0.015, 0, 0], rot: [0, 0, Math.PI / 2] },
    10,
  );
  fan.torus(
    0.022,
    0.005,
    0xc8a050,
    FINISH.brass,
    { at: [0, 0.02, 0], rot: [0, Math.PI / 2, 0] },
    Math.PI * 2,
    [6, 16],
  );
  return {
    torso: b.build(),
    swings: [
      { geometry: tail.build(), pivot: [-0.07, 0.27, 0.17], hang: 'front', amp: 0.04 },
      {
        geometry: fan
          .build()
          .scale(2, 2, 2)
          .rotateY(FAN_PHI - Math.PI / 2),
        pivot: v3(surf(P, -0.15, FAN_PHI, 0.012)),
        hang: 'side',
        amp: 0.12,
      },
    ],
    shoulder: 0.27,
    nod: 1.15,
    arm: {
      upper: { color: CREAM, finish: FINISH.cloth, r: [0.07, 0.061, 0.058] },
      lower: { color: CREAM, finish: FINISH.cloth, r: [0.062, 0.061, 0.052] },
      roll: null,
      hands: {
        color: skin,
        finish: FINISH.skin,
        puff: 0,
        cuff: { color: CHARCOAL, finish: FINISH.knit, r: 0.054, length: 0.05, flare: 0.006 },
      },
    },
    leg: {
      trousers: 0x262833,
      finish: FINISH.denim,
      cuff: 0x262833,
      cargo: false,
      shoe: 'canvas',
      trim: 0x8e6cf0,
    },
  };
}

// --- Backend: a chunky hoodie, headphones (on the head), a giant thermos -------

function backend(color: number, skin: number): Outfit {
  const b = new SculptBuilder();
  const P = bodyProfile(1.09, -0.27, 0.215);
  const knit = FINISH.knit;
  body(b, P, color, knit);
  shoulders(b, 0.28, 0.1, color, knit);
  const rib = shade(color, -0.14);
  ribbed(b, P, -0.235, 0.055, 0.008, rib);
  // Kangaroo pocket: a raised panel with darker openings at the sides.
  panel(b, P, -0.2, -0.03, -0.62, 0.62, 0.002, 0.012, shade(color, 0.04), knit);
  band(b, P, -0.03, 0.014, [0.008, 0.008], rib, knit, -0.6, 0.6);
  for (const s of [-1, 1]) {
    strip(
      b,
      P,
      [
        [s * 0.11, -0.03],
        [s * 0.135, -0.11],
        [s * 0.14, -0.19],
      ],
      false,
      0.015,
      [0.012, 0.004],
      shade(color, -0.3),
      knit,
    );
  }
  // The hood: a thick roll round the neck and the bag of it down the back.
  const roll: THREE.Vector3[] = [];
  for (let k = 0; k <= 20; k++) {
    const a = 0.5 + ((Math.PI * 2 - 1) * k) / 20;
    const front = Math.cos(a);
    roll.push(
      new THREE.Vector3(Math.sin(a) * 0.15, 0.3 - Math.max(0, front) * 0.05, front * 0.13 - 0.01),
    );
  }
  b.sweep(roll, (t) => [0.062 + Math.sin(Math.PI * t) * 0.026, 0.05] as const, color, knit, {
    segments: 36,
    radial: 12,
    up: (p) => new THREE.Vector3(p.x, 0, p.z).normalize(),
  });
  b.ellipsoid(
    [0.17, 0.15, 0.06],
    color,
    knit,
    { at: [0, 0.215, -0.19], rot: [0.35, 0, 0] },
    [24, 16],
  );
  b.ellipsoid(
    [0.14, 0.11, 0.03],
    shade(color, -0.25),
    knit,
    { at: [0, 0.235, -0.155], rot: [0.35, 0, 0] },
    [20, 12],
  );
  // Drawstrings with metal aglets and eyelets.
  for (const s of [-1, 1]) {
    const top = surf(P, 0.27, s * 0.3, 0.012);
    b.torus(
      0.009,
      0.003,
      0xc9ccd2,
      FINISH.metal,
      { at: v3(top), quat: facing(outward(top)) },
      Math.PI * 2,
      [6, 12],
    );
    const pts: V3[] = [
      v3(top),
      v3(surf(P, 0.2, s * 0.3, 0.014)),
      v3(surf(P, 0.12, s * (0.32 - 0.04 * s), 0.014)),
    ];
    b.sweep(pts, 0.0075, CREAM, FINISH.cloth, { segments: 12, radial: 6 });
    const end = surf(P, 0.105, s * (0.32 - 0.04 * s), 0.014);
    b.cylinder(0.0085, 0.0085, 0.03, 0xc9ccd2, FINISH.metal, { at: v3(end) }, 8);
  }
  // A logo patch: curly braces.
  patch(b, P, 0, 0.11, false, 0.002, 0.11, 0.07, 0.006, shade(color, 0.5), FINISH.cloth, 0.02);
  for (const s of [-1, 1]) {
    b.sweep(
      [
        [s * 0.022, 0.135, 0],
        [s * 0.012, 0.125, 0],
        [s * 0.014, 0.112, 0],
        [s * 0.004, 0.11, 0],
        [s * 0.014, 0.108, 0],
        [s * 0.012, 0.095, 0],
        [s * 0.022, 0.085, 0],
      ],
      0.0045,
      CHARCOAL,
      FINISH.plastic,
      { segments: 14, radial: 6 },
      { at: [0, 0, surf(P, 0.11, 0, 0.01).z] },
    );
  }
  // The thermos in a strap holster on the right hip, just behind the hand line.
  const steel = 0xb9c1cb;
  const hip = surf(P, -0.12, THERMOS_PHI, 0.066);
  const tx = hip.x;
  const tz = hip.z;
  const ty = -0.13;
  b.lathe(
    [
      [0.001, -0.2],
      [0.052, -0.2],
      [0.058, -0.185],
      [0.058, 0.03],
      [0.05, 0.05],
      [0.042, 0.06],
    ],
    steel,
    FINISH.metal,
    { at: [tx, ty, tz] },
    24,
  );
  b.cylinder(0.046, 0.046, 0.06, 0x2a3a4a, FINISH.plastic, { at: [tx, ty + 0.09, tz] }, 24);
  b.cylinder(0.05, 0.05, 0.012, 0x1c2630, FINISH.plastic, { at: [tx, ty + 0.125, tz] }, 24);
  b.torus(
    0.03,
    0.008,
    0x1c2630,
    FINISH.plastic,
    { at: [tx, ty + 0.135, tz], rot: [0, Math.PI / 2, 0] },
    Math.PI,
    [6, 12],
  );
  b.cylinder(0.06, 0.06, 0.03, 0xff8a3d, FINISH.rubber, { at: [tx, ty - 0.06, tz] }, 24);
  b.box(0.04, 0.05, 0.004, 0.006, 0xfdfdf6, FINISH.enamel, {
    at: [tx + Math.sin(THERMOS_PHI) * 0.05, ty - 0.12, tz + Math.cos(THERMOS_PHI) * 0.05],
    rot: [0, THERMOS_PHI, 0],
  });
  b.torus(
    0.062,
    0.008,
    CHARCOAL,
    FINISH.cloth,
    { at: [tx, ty - 0.02, tz], rot: [Math.PI / 2, 0, 0] },
    Math.PI * 2,
    [6, 24],
  );
  b.torus(
    0.062,
    0.008,
    CHARCOAL,
    FINISH.cloth,
    { at: [tx, ty - 0.14, tz], rot: [Math.PI / 2, 0, 0] },
    Math.PI * 2,
    [6, 24],
  );
  return {
    torso: b.build(),
    swings: [],
    shoulder: 0.28,
    nod: 0.8,
    arm: {
      upper: { color, finish: knit, r: [0.078, 0.068, 0.064] },
      lower: { color, finish: knit, r: [0.07, 0.068, 0.06] },
      roll: null,
      hands: {
        color: skin,
        finish: FINISH.skin,
        puff: 0,
        cuff: { color: rib, finish: knit, r: 0.062, length: 0.06, flare: 0.01 },
      },
    },
    leg: {
      trousers: 0x4f5562,
      finish: FINISH.knit,
      cuff: shade(0x4f5562, -0.15),
      cargo: false,
      shoe: 'hightop',
      trim: color,
    },
  };
}

// --- QA: goggles (on the head), a lab coat over a sweater, a magnifier --------

function qa(color: number): Outfit {
  const b = new SculptBuilder();
  const P = bodyProfile(0.96, -0.22);
  body(b, P, color, FINISH.knit);
  // The sweater's crew neck, peeking out of the coat.
  band(b, P, 0.3, 0.008, [0.022, 0.016], shade(color, -0.12), FINISH.knit, -0.9, 0.9);
  // The lab coat: open at the front, flaring past the hips.
  const coat = smoothProfile(
    [
      [0.345, -0.4],
      [0.272, -0.27],
      [0.224, -0.1],
      [0.22, 0.01],
      [0.244, 0.135],
      [0.234, 0.225],
      [0.172, 0.285],
      [0.115, 0.312],
    ],
    16,
  );
  const gap = 0.36;
  b.shell(
    coat,
    0.014,
    COAT,
    FINISH.cloth,
    { scale: [1, 1, DEPTH] },
    36,
    gap,
    Math.PI * 2 - gap * 2,
  );
  shoulders(b, 0.255, 0.094, COAT, FINISH.cloth);
  // Collar standing up at the back, lapels folded down the front.
  b.shell(
    [
      [0.125, 0.305],
      [0.13, 0.34],
      [0.14, 0.36],
    ],
    0.01,
    COAT,
    FINISH.cloth,
    { scale: [1, 1, DEPTH] },
    24,
    gap + 0.4,
    Math.PI * 2 - (gap + 0.4) * 2,
  );
  for (const s of [-1, 1]) {
    const lapel: V3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      const y = 0.31 - t * 0.27;
      const phi = s * (gap + 0.05 + Math.sin(Math.PI * t) * 0.32 + t * 0.05);
      lapel.push(v3(surf(coat, y, phi, 0.006 + Math.sin(Math.PI * t) * 0.004)));
    }
    b.sweep(
      lapel,
      (t) => [0.055 * Math.sin(Math.PI * Math.min(1, 0.15 + t)) + 0.012, 0.007] as const,
      shade(COAT, -0.05),
      FINISH.cloth,
      {
        segments: 18,
        radial: 8,
        up: outward,
      },
    );
  }
  // Buttons down the coat edge, hip pockets and a breast pocket with pens.
  for (const y of [0.12, 0.0, -0.12, -0.24]) {
    b.cylinder(
      0.011,
      0.011,
      0.006,
      0xd8d2c2,
      FINISH.plastic,
      {
        at: v3(surf(coat, y, -(gap + 0.08), 0.004)),
        quat: facing(outward(surf(coat, y, -(gap + 0.08), 0))).multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
        ),
      },
      12,
    );
  }
  for (const s of [-1, 1]) {
    patch(
      b,
      coat,
      s * 0.16,
      -0.25,
      false,
      0.0,
      0.11,
      0.1,
      0.01,
      shade(COAT, -0.03),
      FINISH.cloth,
      0.01,
    );
    band(
      b,
      coat,
      -0.2,
      0.012,
      [0.006, 0.005],
      shade(COAT, -0.12),
      FINISH.cloth,
      s * 0.55 - 0.22,
      s * 0.55 + 0.22,
    );
  }
  patch(b, coat, 0.13, 0.1, false, 0.0, 0.07, 0.07, 0.01, shade(COAT, -0.03), FINISH.cloth, 0.008);
  const pens: [number, number][] = [
    [0.115, 0x2a6ad8],
    [0.135, 0xe84343],
    [0.152, 0x2b2f38],
  ];
  for (const [x, c] of pens) {
    const at = surf(coat, 0.15, Math.asin(x / profileRadius(coat, 0.15)), 0.014);
    b.cylinder(0.007, 0.007, 0.07, c, FINISH.plastic, { at: v3(at) }, 8);
    b.box(0.003, 0.03, 0.006, 0.001, 0xc9ccd2, FINISH.metal, {
      at: [at.x, at.y + 0.01, at.z + 0.008],
    });
  }
  // The bug badge on the other breast: a red ladybug-ish bug in a ring.
  const badgeAt = surf(coat, 0.11, Math.asin(-0.13 / profileRadius(coat, 0.11)), 0.012);
  const q = facing(outward(badgeAt));
  const badge = new SculptBuilder()
    .cylinder(0.04, 0.04, 0.008, 0xfdfdf6, FINISH.enamel, { rot: [Math.PI / 2, 0, 0] }, 24)
    .torus(0.04, 0.006, 0xc8a050, FINISH.brass, {}, Math.PI * 2, [6, 24])
    .ellipsoid([0.018, 0.022, 0.01], 0xe23b3b, FINISH.enamel, { at: [0, -0.004, 0.006] }, [12, 10])
    .ellipsoid([0.01, 0.009, 0.008], CHARCOAL, FINISH.enamel, { at: [0, 0.018, 0.006] }, [10, 8])
    .box(0.002, 0.04, 0.006, 0.001, CHARCOAL, FINISH.enamel, { at: [0, -0.004, 0.012] })
    .sphere(0.004, CHARCOAL, FINISH.enamel, { at: [-0.008, -0.008, 0.015] }, 6)
    .sphere(0.004, CHARCOAL, FINISH.enamel, { at: [0.008, 0.002, 0.015] }, 6)
    .build();
  for (const s of [-1, 1]) {
    for (const k of [-1, 0, 1]) {
      b.sweep(
        [
          [s * 0.015, -0.004 + k * 0.01, 0.006],
          [s * 0.028, -0.002 + k * 0.012, 0.008],
        ],
        0.0018,
        CHARCOAL,
        FINISH.enamel,
        { segments: 2, radial: 4 },
        { at: v3(badgeAt), quat: q },
      );
    }
  }
  b.merge(badge, { at: v3(badgeAt), quat: q });
  // A back yoke and a wide belt tab in the player's color, with two buttons; a center vent.
  panel(b, coat, 0.12, 0.272, Math.PI - 1.0, Math.PI + 1.0, 0.012, 0.008, color, FINISH.cloth);
  band(
    b,
    coat,
    0.12,
    0.022,
    [0.006, 0.008],
    shade(color, -0.25),
    FINISH.cloth,
    Math.PI - 1.0,
    Math.PI + 1.0,
  );
  strip(
    b,
    coat,
    [
      [-0.15, -0.08],
      [0, -0.08],
      [0.15, -0.08],
    ],
    true,
    0.014,
    [0.05, 0.008],
    color,
    FINISH.cloth,
  );
  for (const s of [-1, 1]) {
    const at = surf(coat, -0.08, Math.PI - s * Math.asin(0.11 / profileRadius(coat, -0.08)), 0.024);
    b.cylinder(
      0.011,
      0.011,
      0.006,
      0xd8d2c2,
      FINISH.plastic,
      {
        at: v3(at),
        quat: facing(outward(at)).multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
        ),
      },
      12,
    );
  }
  strip(
    b,
    coat,
    [
      [0, -0.18],
      [0, -0.39],
    ],
    true,
    0.012,
    [0.004, 0.004],
    shade(COAT, -0.15),
    FINISH.cloth,
  );
  // The magnifier hanging from the coat on a cord.
  const mag = new SculptBuilder();
  mag.sweep(
    [
      [0, 0, 0],
      [0.01, -0.05, 0.01],
      [0, -0.09, 0.012],
    ],
    0.004,
    CHARCOAL,
    FINISH.cloth,
    { segments: 8, radial: 6 },
  );
  mag.capsule(0.013, 0.06, 0x7a4a2a, FINISH.leather, { at: [0, -0.13, 0.012] }, 10);
  mag.cylinder(0.016, 0.016, 0.014, 0xc8a050, FINISH.brass, { at: [0, -0.175, 0.012] }, 12);
  mag.torus(
    0.045,
    0.009,
    0xc8a050,
    FINISH.brass,
    { at: [0, -0.228, 0.012], rot: [0, Math.PI / 2, 0] },
    Math.PI * 2,
    [6, 20],
  );
  mag.cylinder(
    0.042,
    0.042,
    0.006,
    0xbfe6ff,
    FINISH.glass,
    { at: [0, -0.228, 0.012], rot: [0, 0, Math.PI / 2] },
    28,
  );
  mag.sphere(0.008, 0xffffff, FINISH.sparkle, { at: [0.006, -0.215, 0.025] }, 6);
  return {
    torso: b.build(),
    swings: [{ geometry: mag.build(), pivot: [0.255, -0.18, 0.02], hang: 'side', amp: 0.35 }],
    shoulder: 0.255,
    nod: 1.3,
    arm: {
      upper: { color: COAT, finish: FINISH.cloth, r: [0.069, 0.06, 0.057] },
      lower: { color: COAT, finish: FINISH.cloth, r: [0.06, 0.06, 0.06] },
      roll: null,
      hands: {
        color,
        finish: FINISH.rubber,
        puff: 0.004,
        cuff: { color, finish: FINISH.rubber, r: 0.05, length: 0.07, flare: 0.022 },
      },
    },
    leg: {
      trousers: 0x5a4636,
      finish: FINISH.cloth,
      cuff: null,
      cargo: false,
      shoe: 'oxford',
      trim: 0x6a4630,
    },
  };
}

// --- Platform: headset (on the head), hi-vis vest, a loaded tool belt ----------

/** The platform engineer's shirt and the hi-vis vest over it (its outer surface). */
const platformBody = (): Profile => bodyProfile(1.02, -0.23);
const platformVest = (): Profile =>
  smoothProfile(
    [
      [0.218, -0.2],
      [0.226, -0.08],
      [0.224, 0.01],
      [0.252, 0.135],
      [0.242, 0.225],
      [0.18, 0.28],
    ],
    14,
  );

/**
 * The platform engineer's orange cable coil, in torso space: its loops slung
 * over the left shoulder along the strap line, flat across the chest and the
 * back, tucked under the belt by the buckle, with the blue plug clipped on the
 * front. It stays inside the shoulders and in from the sides, out of every arm's way.
 */
export function platformCable(): THREE.BufferGeometry {
  const b = new SculptBuilder();
  const P = platformBody();
  const vest = platformVest();
  const orange = 0xff8a1f;
  const tube = 0.014;
  // The sash's centre line on the front (and, mirrored, the back): belt by the buckle to the shoulder.
  const line: [number, number][] = [
    [-0.075, -0.14],
    [-0.02, -0.04],
    [0.045, 0.07],
    [0.095, 0.17],
    [0.12, 0.235],
  ];
  const onBody = (x: number, y: number, back: boolean, out: number): THREE.Vector3 => {
    const r = Math.max(profileRadius(P, y), profileRadius(vest, y));
    const phi = Math.asin(Math.max(-1, Math.min(1, x / r)));
    return surf(r === profileRadius(vest, y) ? vest : P, y, back ? Math.PI - phi : phi, out);
  };
  for (let k = 0; k < 3; k++) {
    const d = (k - 1) * 0.03;
    const out = tube + 0.001 + 0.003 * (k % 2);
    // Each strand dives under the belt's top edge, so no cut end shows.
    const side = (back: boolean) => [
      onBody(-0.085 + d * 0.86, -0.198, back, 0.004),
      ...line.map(([x, y]) => onBody(x + d * 0.86, y - d * 0.5, back, out)),
    ];
    const top = new THREE.Vector3(0.135 + d * 0.95, 0.318 + tube + 0.004 * (k % 2), 0);
    const path = [...side(false), top, ...side(true).reverse()];
    b.sweep(path, tube, k === 1 ? 0xf07a12 : orange, FINISH.rubber, {
      segments: 40,
      radial: 6,
    });
  }
  // The plug end, lying along the strands on the chest.
  const plug = onBody(0.01, 0.0, false, 2 * tube + 0.014);
  const n = new THREE.Vector3(plug.x, 0, plug.z / DEPTH).normalize();
  b.box(0.05, 0.034, 0.024, 0.006, 0x2a6ad8, FINISH.plastic, {
    at: v3(plug),
    quat: facing(n).multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.06),
    ),
  });
  return b.build();
}

function platform(color: number): Outfit {
  const b = new SculptBuilder();
  const navy = 0x2c3a4f;
  const P = platformBody();
  body(b, P, navy, FINISH.cloth);
  shoulders(b, 0.27, 0.094, navy, FINISH.cloth);
  // Shirt collar and button placket.
  for (const s of [-1, 1]) {
    b.sweep(
      [
        v3(surf(P, 0.318, s * 0.25, 0.02)),
        v3(surf(P, 0.29, s * 0.4, 0.024)),
        v3(surf(P, 0.255, s * 0.55, 0.014)),
      ],
      (t) => [0.032 * (1 - t * 0.6) + 0.006, 0.007] as const,
      shade(navy, 0.08),
      FINISH.cloth,
      { segments: 10, radial: 6, up: outward },
    );
  }
  band(b, P, 0.305, 0.01, [0.02, 0.012], shade(navy, 0.08), FINISH.cloth);
  // The vest: open at the front, deep armholes, reflective strips round it and over the shoulders.
  const vest = platformVest();
  const gap = 0.32;
  b.shell(
    vest,
    0.016,
    color,
    FINISH.cloth,
    { scale: [1, 1, DEPTH] },
    32,
    gap,
    Math.PI * 2 - gap * 2,
  );
  const silver = 0xdfe3e8;
  for (const y of [-0.12, 0.02]) {
    band(
      b,
      vest,
      y,
      0.004,
      [0.024, 0.006],
      silver,
      FINISH.reflective,
      gap + 0.04,
      Math.PI * 2 - gap - 0.04,
    );
  }
  for (const s of [-1, 1]) {
    strip(
      b,
      vest,
      [
        [s * 0.11, 0.02],
        [s * 0.12, 0.2],
        [s * 0.13, 0.27],
      ],
      false,
      0.004,
      [0.022, 0.006],
      silver,
      FINISH.reflective,
    );
    strip(
      b,
      vest,
      [
        [s * 0.13, 0.27],
        [s * 0.12, 0.2],
        [s * 0.1, 0.02],
      ],
      true,
      0.004,
      [0.022, 0.006],
      silver,
      FINISH.reflective,
    );
    b.sweep(
      [
        v3(surf(vest, 0.255, s * 0.62, 0.012)),
        [s * 0.15, 0.302, 0],
        v3(surf(vest, 0.255, Math.PI - s * 0.62, 0.012)),
      ],
      () => [0.024, 0.007] as const,
      silver,
      FINISH.reflective,
      {
        segments: 14,
        radial: 8,
        up: (p) => new THREE.Vector3(p.x * 0.3, 1, p.z * 0.3).normalize(),
      },
    );
  }
  // Vest edge piping and a chest radio pocket.
  for (const s of [-1, 1]) {
    strip(
      b,
      vest,
      [
        [s * 0.072, 0.24],
        [s * 0.068, 0.0],
        [s * 0.066, -0.19],
      ],
      false,
      0.012,
      [0.006, 0.006],
      shade(color, -0.25),
      FINISH.cloth,
    );
  }
  patch(
    b,
    vest,
    0.13,
    0.13,
    false,
    0.012,
    0.06,
    0.07,
    0.022,
    shade(color, -0.1),
    FINISH.cloth,
    0.008,
  );
  b.box(0.022, 0.05, 0.016, 0.005, CHARCOAL, FINISH.plastic, {
    at: v3(surf(vest, 0.19, Math.asin(0.13 / profileRadius(vest, 0.19)), 0.035)),
  });
  b.cylinder(
    0.004,
    0.004,
    0.05,
    CHARCOAL,
    FINISH.rubber,
    { at: v3(surf(vest, 0.24, Math.asin(0.136 / profileRadius(vest, 0.24)), 0.035)) },
    6,
  );
  // The tool belt: leather, a big buckle, pouches, a tape measure, a carabiner.
  const leather = 0x7a4a2a;
  band(b, P, -0.19, 0.03, [0.034, 0.016], leather, FINISH.leather);
  b.box(0.06, 0.05, 0.016, 0.006, 0xc8a050, FINISH.brass, { at: v3(surf(P, -0.19, 0, 0.052)) });
  b.box(0.034, 0.024, 0.018, 0.004, leather, FINISH.leather, { at: v3(surf(P, -0.19, 0, 0.055)) });
  for (const s of [-1, 1]) {
    const phi = s * 1.2;
    const at = surf(P, -0.23, phi, 0.07);
    const n = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).normalize();
    b.box(0.1, 0.11, 0.06, 0.016, shade(leather, 0.08), FINISH.leather, {
      at: v3(at),
      quat: facing(n),
    });
    b.box(0.104, 0.035, 0.064, 0.012, shade(leather, -0.1), FINISH.leather, {
      at: [at.x, at.y + 0.04, at.z],
      quat: facing(n),
    });
    b.sphere(
      0.008,
      0xc8a050,
      FINISH.brass,
      {
        at: v3(
          at
            .clone()
            .addScaledVector(n, 0.033)
            .add(new THREE.Vector3(0, 0.03, 0)),
        ),
      },
      8,
    );
  }
  // Pencil and screwdriver poking out of the left pouch.
  const lp = surf(P, -0.17, 1.2, 0.07);
  b.cylinder(
    0.008,
    0.008,
    0.1,
    0xffc53d,
    FINISH.plastic,
    { at: [lp.x - 0.012, lp.y + 0.03, lp.z], rot: [0, 0, 0.12] },
    6,
  );
  b.cylinder(
    0.011,
    0.011,
    0.05,
    0xe23b3b,
    FINISH.plastic,
    { at: [lp.x + 0.018, lp.y + 0.02, lp.z - 0.005] },
    10,
  );
  b.cylinder(
    0.004,
    0.004,
    0.06,
    0xc9ccd2,
    FINISH.metal,
    { at: [lp.x + 0.018, lp.y + 0.07, lp.z - 0.005] },
    6,
  );
  // Tape measure on the back-left.
  const tp = surf(P, -0.2, 2.1, 0.08);
  const tn = new THREE.Vector3(Math.sin(2.1), 0, Math.cos(2.1)).normalize();
  b.cylinder(
    0.048,
    0.048,
    0.04,
    0xffc53d,
    FINISH.plastic,
    {
      at: v3(tp),
      quat: facing(tn).multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      ),
    },
    20,
  );
  b.cylinder(
    0.022,
    0.022,
    0.044,
    CHARCOAL,
    FINISH.plastic,
    {
      at: v3(tp),
      quat: facing(tn).multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      ),
    },
    12,
  );
  // Two-way radio clipped to the right side of the belt's back.
  const rp = surf(P, -0.15, -2.2, 0.065);
  b.box(0.06, 0.1, 0.035, 0.012, CHARCOAL, FINISH.plastic, {
    at: v3(rp),
    quat: facing(new THREE.Vector3(Math.sin(-2.2), 0, Math.cos(-2.2))),
  });
  b.cylinder(0.008, 0.006, 0.08, 0x1a1c22, FINISH.rubber, { at: [rp.x, rp.y + 0.09, rp.z] }, 8);
  b.sphere(0.008, 0x3ef08a, FINISH.led, { at: [rp.x + 0.015, rp.y + 0.05, rp.z] }, 6);

  // The wrench swinging from a loop on the right hip.
  const wrench = new SculptBuilder();
  wrench.torus(
    0.016,
    0.005,
    0x9aa3ad,
    FINISH.metal,
    { rot: [0, Math.PI / 2, 0] },
    Math.PI * 2,
    [6, 14],
  );
  wrench.box(0.012, 0.15, 0.026, 0.005, 0x9aa3ad, FINISH.metal, { at: [0, -0.1, 0] });
  wrench.torus(
    0.024,
    0.009,
    0x9aa3ad,
    FINISH.metal,
    { at: [0, -0.19, 0], rot: [0, Math.PI / 2, 0] },
    Math.PI * 1.55,
    [8, 18],
  );
  wrench.box(0.018, 0.055, 0.032, 0.006, 0xe23b3b, FINISH.rubber, { at: [0, -0.06, 0] });
  b.merge(platformCable());

  const hipR = surf(P, -0.2, -1.55, 0.06);
  return {
    torso: b.build(),
    swings: [{ geometry: wrench.build(), pivot: v3(hipR), hang: 'side', amp: 0.35 }],
    shoulder: 0.27,
    nod: 0.9,
    arm: {
      upper: { color: navy, finish: FINISH.cloth, r: [0.072, 0.064, 0.06] },
      lower: { color: navy, finish: FINISH.cloth, r: [0.066, 0.063, 0.056] },
      roll: shade(navy, 0.1),
      hands: {
        color: 0xc9a46a,
        finish: FINISH.leather,
        puff: 0.005,
        cuff: {
          color: shade(0xc9a46a, -0.15),
          finish: FINISH.leather,
          r: 0.054,
          length: 0.06,
          flare: 0.016,
        },
      },
    },
    leg: {
      trousers: 0x6f6a48,
      finish: FINISH.denim,
      cuff: null,
      cargo: true,
      shoe: 'boot',
      trim: 0xb07a3e,
    },
  };
}

const OUTFITS: Record<RoleId, (color: number, skin: number) => Outfit> = {
  generalist,
  frontend,
  backend,
  qa,
  platform,
};

/** The role's clothes and kit, in the player's `color`. */
export function buildOutfit(role: RoleId, color: number, skin: number): Outfit {
  return OUTFITS[role](color, skin);
}

export { mix };
