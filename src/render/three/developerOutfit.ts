import * as THREE from 'three';
import type { RoleId } from '../../sim/roles';
import { type ArmLook, type LegLook, mix, shade } from './developerLimbs';
import {
  FINISH,
  type Finish,
  SculptBuilder,
  type V3,
  facing,
  profileRadius,
  shellGeometry,
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

/** A body profile `[radius, y]` (hem to neck), `scale`d wider. */
function bodyProfile(scale: number, hem = -0.23): Profile {
  return smoothProfile(
    [
      [0.185 * scale, hem],
      [0.2 * scale, hem + 0.06],
      [0.206 * scale, -0.06],
      [0.214 * scale, 0.05],
      [0.224 * scale, 0.15],
      [0.206 * scale, 0.235],
      [0.15 * scale, 0.287],
      [0.098, 0.312],
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
    radial: 8,
    up: outward,
  });
}

/** A strip lying on the body through `[x, y]` points on the front (z > 0) or back. */
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
    segments: Math.max(8, points.length * 6),
    radial: 8,
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
  for (const s of [-1, 1]) b.sphere(r, color, finish, { at: [s * (x - 0.035), 0.165, 0] }, 20);
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
  shoulders(b, 0.24, 0.088, color, FINISH.cloth);
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
    b.sweep(pts, () => [0.03, 0.008] as const, WEBBING, FINISH.cloth, {
      segments: 30,
      radial: 8,
      up: outward,
    });
    b.box(0.05, 0.03, 0.014, 0.004, 0x9aa3ad, FINISH.metal, {
      at: v3(surf(P, 0.0, s * 0.62, 0.024)),
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
    [0.012, 0.005],
    WEBBING,
    FINISH.cloth,
  );
  b.box(0.035, 0.03, 0.016, 0.005, 0xff8a3d, FINISH.plastic, { at: v3(surf(P, 0.145, 0, 0.03)) });
  // The pack: a big rounded body, a front pocket, a laptop poking out and stickers.
  const pack = 0x35525e;
  b.box(0.36, 0.42, 0.2, 0.085, pack, FINISH.cloth, { at: [0, 0.07, -0.27], rot: [-0.06, 0, 0] });
  b.box(0.28, 0.2, 0.09, 0.04, shade(pack, 0.12), FINISH.cloth, {
    at: [0, -0.02, -0.375],
    rot: [-0.06, 0, 0],
  });
  b.sweep(
    [
      [-0.12, 0.07, -0.42],
      [0, 0.088, -0.425],
      [0.12, 0.07, -0.42],
    ],
    0.006,
    0xc9ccd2,
    FINISH.metal,
    { segments: 10, radial: 6 },
  );
  b.box(0.018, 0.05, 0.008, 0.003, 0xff8a3d, FINISH.plastic, {
    at: [0.1, 0.05, -0.428],
    rot: [-0.1, 0, 0],
  });
  b.torus(
    0.06,
    0.012,
    WEBBING,
    FINISH.cloth,
    { at: [0, 0.29, -0.23], rot: [0, 0, 0] },
    Math.PI,
    [8, 16],
  );
  b.box(0.3, 0.21, 0.022, 0.012, 0xc5cbd3, FINISH.metal, {
    at: [0.015, 0.275, -0.31],
    rot: [-0.2, 0, 0.05],
  });
  b.box(0.29, 0.012, 0.024, 0.005, 0x3a3f4a, FINISH.plastic, {
    at: [0.015, 0.383, -0.287],
    rot: [-0.2, 0, 0.05],
  });
  const stickers: [number, number, number, number, 'disc' | 'tile'][] = [
    [-0.08, 0.3, 0.035, 0xff6b8a, 'disc'],
    [0.07, 0.25, 0.028, 0xffd23f, 'tile'],
    [0.09, 0.32, 0.02, 0x3ad0e0, 'disc'],
  ];
  for (const [x, y, r, c, kind] of stickers) {
    const at: V3 = [x + 0.015, y, -0.321 - (y - 0.275) * 0.2];
    if (kind === 'disc')
      b.cylinder(r, r, 0.004, c, FINISH.enamel, { at, rot: [Math.PI / 2 - 0.2, 0, 0] }, 20);
    else b.box(r * 2, r * 2, 0.004, 0.006, c, FINISH.enamel, { at, rot: [-0.2, 0, 0.3] });
  }
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
      { at: [x, y, -0.42 - (y + 0.02) * 0.06], rot: [Math.PI / 2 - 0.06, 0, 0] },
      20,
    );
  }
  b.box(0.05, 0.03, 0.004, 0.004, 0xfdfdf6, FINISH.enamel, {
    at: [-0.1, 0.2, -0.373],
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
    swings: [{ geometry: badge, pivot: v3(clip), hang: 'front', amp: 0.25 }],
    shoulder: 0.24,
    nod: 1,
    arm: {
      upper: { color, finish: FINISH.cloth, r: [0.074, 0.068, 0.06] },
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

// --- Frontend: color-block bomber, scarf, beret (on the head), swatch fan --------

function frontend(color: number, skin: number): Outfit {
  const b = new SculptBuilder();
  const P = bodyProfile(1.05, -0.22);
  body(b, P, color, SATIN);
  shoulders(b, 0.25, 0.09, CREAM, FINISH.cloth);
  // Ribbed hem and collar with a stripe, a zip and a raglan seam.
  const rib = CHARCOAL;
  for (const [y, size] of [
    [-0.205, [0.026, 0.016]],
    [-0.168, [0.007, 0.017]],
  ] as const) {
    band(b, P, y, 0.004, size, y < -0.19 ? rib : shade(color, 0.35), FINISH.knit);
  }
  band(b, P, -0.15, 0.004, [0.008, 0.012], rib, FINISH.knit);
  band(b, P, 0.3, 0.012, [0.026, 0.016], rib, FINISH.knit);
  strip(
    b,
    P,
    [
      [0, 0.29],
      [0, 0.05],
      [0, -0.21],
    ],
    false,
    0.004,
    [0.006, 0.005],
    0xb8bec8,
    FINISH.metal,
  );
  b.box(0.014, 0.03, 0.006, 0.003, 0xb8bec8, FINISH.metal, { at: v3(surf(P, 0.17, 0.03, 0.012)) });
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
  loop(0.322, 0.125, 0.115, -0.02);
  loop(0.285, 0.15, 0.14, -0.035);
  b.ellipsoid(
    [0.05, 0.045, 0.04],
    shade(scarf, 0.06),
    FINISH.knit,
    { at: [-0.06, 0.255, 0.15] },
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
  // Swatch fan on the right hip: cards fanned round a brass pin.
  const fan = new SculptBuilder();
  const swatches = [0xe84393, 0xff9f43, 0xfeca57, 0x1dd1a1, 0x54a0ff, 0x8e6cf0];
  swatches.forEach((c, k) => {
    const a = -0.65 + k * 0.24;
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
      { geometry: tail.build(), pivot: [-0.07, 0.25, 0.19], hang: 'front', amp: 0.04 },
      { geometry: fan.build(), pivot: [0.248, -0.16, 0.05], hang: 'side', amp: 0.3 },
    ],
    shoulder: 0.25,
    nod: 1.15,
    arm: {
      upper: { color: CREAM, finish: FINISH.cloth, r: [0.076, 0.068, 0.062] },
      lower: { color: CREAM, finish: FINISH.cloth, r: [0.068, 0.064, 0.058] },
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
  const P = bodyProfile(1.09, -0.27);
  const knit = FINISH.knit;
  body(b, P, color, knit);
  shoulders(b, 0.26, 0.098, color, knit);
  const rib = shade(color, -0.14);
  band(b, P, -0.25, 0.006, [0.03, 0.02], rib, knit);
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
  b.sweep(roll, (t) => [0.05 + Math.sin(Math.PI * t) * 0.02, 0.04] as const, color, knit, {
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
  // The thermos in a strap holster on the back-right hip.
  const steel = 0xb9c1cb;
  const tx = -0.24;
  const tz = -0.12;
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
    { at: [tx, 0, tz] },
    24,
  );
  b.cylinder(0.046, 0.046, 0.06, 0x2a3a4a, FINISH.plastic, { at: [tx, 0.09, tz] }, 24);
  b.cylinder(0.05, 0.05, 0.012, 0x1c2630, FINISH.plastic, { at: [tx, 0.125, tz] }, 24);
  b.torus(
    0.03,
    0.008,
    0x1c2630,
    FINISH.plastic,
    { at: [tx, 0.135, tz], rot: [0, Math.PI / 2, 0] },
    Math.PI,
    [6, 12],
  );
  b.cylinder(0.06, 0.06, 0.03, 0xff8a3d, FINISH.rubber, { at: [tx, -0.06, tz] }, 24);
  b.box(0.04, 0.05, 0.004, 0.006, 0xfdfdf6, FINISH.enamel, {
    at: [tx - 0.04, -0.12, tz + 0.03],
    rot: [0, -0.9, 0],
  });
  b.torus(
    0.062,
    0.008,
    CHARCOAL,
    FINISH.cloth,
    { at: [tx, -0.02, tz], rot: [Math.PI / 2, 0, 0] },
    Math.PI * 2,
    [6, 24],
  );
  b.torus(
    0.062,
    0.008,
    CHARCOAL,
    FINISH.cloth,
    { at: [tx, -0.14, tz], rot: [Math.PI / 2, 0, 0] },
    Math.PI * 2,
    [6, 24],
  );
  return {
    torso: b.build(),
    swings: [],
    shoulder: 0.26,
    nod: 0.8,
    arm: {
      upper: { color, finish: knit, r: [0.086, 0.078, 0.07] },
      lower: { color, finish: knit, r: [0.078, 0.074, 0.07] },
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
      [0.26, -0.4],
      [0.235, -0.26],
      [0.215, -0.1],
      [0.222, 0.05],
      [0.232, 0.15],
      [0.215, 0.235],
      [0.16, 0.29],
      [0.11, 0.315],
    ],
    24,
  );
  const gap = 0.3;
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
  shoulders(b, 0.235, 0.092, COAT, FINISH.cloth);
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
  // The back belt tab in the player's color, with two buttons; a center vent.
  strip(
    b,
    coat,
    [
      [-0.13, -0.08],
      [0, -0.08],
      [0.13, -0.08],
    ],
    true,
    0.014,
    [0.03, 0.007],
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
    shoulder: 0.235,
    nod: 1.3,
    arm: {
      upper: { color: COAT, finish: FINISH.cloth, r: [0.075, 0.066, 0.06] },
      lower: { color: COAT, finish: FINISH.cloth, r: [0.066, 0.064, 0.064] },
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

function platform(color: number): Outfit {
  const b = new SculptBuilder();
  const navy = 0x2c3a4f;
  const P = bodyProfile(1.02, -0.23);
  body(b, P, navy, FINISH.cloth);
  shoulders(b, 0.25, 0.092, navy, FINISH.cloth);
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
  const vest = smoothProfile(
    [
      [0.218, -0.2],
      [0.222, -0.06],
      [0.23, 0.05],
      [0.238, 0.15],
      [0.218, 0.235],
      [0.17, 0.28],
    ],
    20,
  );
  const gap = 0.32;
  b.shell(
    vest,
    0.016,
    color,
    FINISH.cloth,
    { scale: [1, 1, DEPTH] },
    36,
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
  // The orange cable coil hanging from the left hip.
  const coil = new SculptBuilder();
  coil.box(0.016, 0.03, 0.03, 0.004, CHARCOAL, FINISH.plastic, { at: [0, -0.01, 0] });
  for (let k = 0; k < 4; k++) {
    coil.torus(
      0.06 - k * 0.002,
      0.011,
      k % 2 ? 0xff8a1f : 0xf07a12,
      FINISH.rubber,
      { at: [0.004 * (k - 1.5) * 2, -0.08, 0.003 * k], rot: [0, Math.PI / 2, 0.15 * (k - 1.5)] },
      Math.PI * 2,
      [6, 20],
    );
  }
  coil.sweep(
    [
      [0, -0.14, 0.03],
      [0.005, -0.18, 0.05],
      [0, -0.2, 0.04],
    ],
    0.009,
    0xff8a1f,
    FINISH.rubber,
    { segments: 8, radial: 6 },
  );
  coil.box(0.02, 0.03, 0.016, 0.004, 0x2a6ad8, FINISH.plastic, { at: [0, -0.215, 0.04] });

  const hipR = surf(P, -0.2, -1.55, 0.06);
  const hipL = surf(P, -0.2, 1.75, 0.06);
  return {
    torso: b.build(),
    swings: [
      { geometry: wrench.build(), pivot: v3(hipR), hang: 'side', amp: 0.35 },
      { geometry: coil.build(), pivot: v3(hipL), hang: 'side', amp: 0.25 },
    ],
    shoulder: 0.25,
    nod: 0.9,
    arm: {
      upper: { color: navy, finish: FINISH.cloth, r: [0.078, 0.07, 0.064] },
      lower: { color: navy, finish: FINISH.cloth, r: [0.07, 0.066, 0.062] },
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
