import * as THREE from 'three';
import { ModelBuilder, tint } from '../../kit';
import { COLOR } from '../../palette';
import { type CityPiece, STOREY, styleOf } from '../cityPlan';
import {
  C,
  CAR_PAINT,
  choose,
  frac,
  OFFICE_WALLS,
  type Parts,
  type PieceBuilders,
  windowGrid,
} from './shared';

/** Scale-up downtown: office blocks, the crane, lamps and cars. */

export function office(p: CityPiece, { body: b, glow, blink }: Parts, rng: () => number): void {
  const style = styleOf(p);
  const wall = choose(OFFICE_WALLS, frac(p.variant * 7.7));
  const top = p.storeys * STOREY;
  // Style 3 steps back for its top two storeys.
  const step = style === 3 && p.storeys > 3 ? p.storeys - 2 : p.storeys;
  const low = step * STOREY;
  b.box(p.w, low, p.d, wall, { at: [0, low / 2, 0] }, 0.03);
  // A darker ground floor with a glass entrance (shops with awnings on style 4).
  b.box(p.w + 0.02, STOREY, p.d + 0.02, tint(wall, -0.25), { at: [0, STOREY / 2, 0] }, 0.02);
  b.add(new THREE.PlaneGeometry(0.36, 0.28), C.paneDark, { at: [0, 0.15, p.d / 2 + 0.017] });
  if (style === 1) {
    // Ribbon windows: a band of glass round every floor.
    for (let s = 1; s < step; s++) {
      const y = s * STOREY + STOREY * 0.55;
      for (const [w, at, yaw] of [
        [p.w - 0.06, [0, y, p.d / 2 + 0.006], 0],
        [p.d - 0.06, [p.w / 2 + 0.006, y, 0], Math.PI / 2],
        [p.d - 0.06, [-p.w / 2 - 0.006, y, 0], -Math.PI / 2],
      ] as const) {
        const g = new THREE.PlaneGeometry(w, STOREY * 0.42);
        if (rng() < 0.25) glow.add(g, C.lit, { at: [...at], rot: [0, yaw, 0] }, 'glow');
        else b.add(g, C.paneDark, { at: [...at], rot: [0, yaw, 0] });
      }
    }
  } else {
    windowGrid(b, p.w, p.d, step - 1, STOREY, rng, {
      litShare: 0.25,
      width: style === 4 ? 0.16 : 0.2,
      pane: style === 4 ? C.paneDark : C.pane,
    });
  }
  if (style === 2) {
    // Vertical fins up the front.
    for (let x = -p.w / 2 + 0.12; x < p.w / 2 - 0.05; x += 0.24)
      b.box(
        0.04,
        low - STOREY,
        0.07,
        tint(wall, 0.25),
        { at: [x, STOREY + (low - STOREY) / 2, p.d / 2 + 0.03] },
        0,
      );
  }
  if (style === 4) {
    // Shop awnings along the street.
    const n = Math.max(1, Math.floor(p.w / 0.55));
    for (let i = 0; i < n; i++) {
      const c = choose(
        [COLOR.forestGreen, COLOR.brickRed, COLOR.steelBlue, COLOR.burntOrange],
        frac(p.variant * 3 + i * 0.37),
      );
      b.box(
        p.w / n - 0.08,
        0.035,
        0.18,
        c,
        {
          at: [-p.w / 2 + (p.w / n) * (i + 0.5), STOREY * 0.88, p.d / 2 + 0.09],
          rot: [0.3, 0, 0],
        },
        0,
      );
    }
  }
  if (step < p.storeys) {
    const w2 = p.w * 0.72;
    const d2 = p.d * 0.75;
    b.box(p.w + 0.03, 0.06, p.d + 0.03, tint(wall, -0.15), { at: [0, low + 0.03, 0] }, 0.02);
    b.box(
      w2,
      top - low,
      d2,
      tint(wall, 0.12),
      { at: [0, low + (top - low) / 2, -p.d * 0.05] },
      0.03,
    );
    windowGrid(b, w2, d2, p.storeys - step, low, rng, { litShare: 0.3 });
  }
  const tw = step < p.storeys ? p.w * 0.72 : p.w;
  const td = step < p.storeys ? p.d * 0.75 : p.d;
  const tz = step < p.storeys ? -p.d * 0.05 : 0;
  // Parapet, then what stands on the roof.
  b.box(tw, 0.08, td, tint(wall, -0.15), { at: [0, top + 0.04, tz] }, 0.02);
  b.box(tw - 0.12, 0.02, td - 0.12, C.roofTop, { at: [0, top + 0.08, tz] }, 0);
  const roof = Math.floor(rng() * 5);
  if (roof === 0) {
    // Air-conditioning units with fans.
    for (let i = 0; i < 1 + Math.floor(rng() * 3); i++) {
      const x = -tw * 0.28 + i * 0.26;
      b.box(0.22, 0.14, 0.2, C.steel, { at: [x, top + 0.16, tz - td * 0.15] }, 0.02);
      b.cylinder(0.07, 0.07, 0.02, C.ink, { at: [x, top + 0.24, tz - td * 0.15] }, 10);
    }
  } else if (roof === 1) {
    // A water tower on legs.
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      b.box(0.025, 0.2, 0.025, C.ink, { at: [tw * 0.2 + x * 0.08, top + 0.18, tz + z * 0.08] }, 0);
    b.cylinder(0.13, 0.13, 0.22, 0x9a6a4a, { at: [tw * 0.2, top + 0.38, tz] }, 12);
    b.cone(0.15, 0.1, COLOR.cocoa, { at: [tw * 0.2, top + 0.54, tz] }, 12);
  } else if (roof === 2) {
    // A mast with a blinking light.
    b.cylinder(0.015, 0.02, 0.6, C.steel, { at: [-tw * 0.25, top + 0.38, tz - td * 0.2] }, 6);
    blink.led(0.03, C.warn, { at: [-tw * 0.25, top + 0.7, tz - td * 0.2] });
    b.box(0.3, 0.16, 0.24, C.steel, { at: [tw * 0.15, top + 0.16, tz] }, 0.03);
  } else if (roof === 3) {
    // Solar panels in rows.
    for (let i = 0; i < 3; i++)
      b.box(
        tw * 0.7,
        0.025,
        0.14,
        COLOR.solarPanel,
        { at: [0, top + 0.14, tz - td * 0.3 + i * td * 0.25], rot: [-0.4, 0, 0] },
        0,
      );
  } else {
    // A glowing sign on the front edge: a logo dot and a bar.
    b.box(tw * 0.6, 0.22, 0.04, C.ink, { at: [0, top + 0.2, tz + td / 2 - 0.05] }, 0.02);
    const c = choose(
      [COLOR.ledCyan, COLOR.neonLime, 0xff9fd0, COLOR.windowLit],
      frac(p.variant * 11.3),
    );
    glow.add(
      new THREE.CircleGeometry(0.06, 16),
      c,
      { at: [-tw * 0.2, top + 0.2, tz + td / 2 - 0.025] },
      'glow',
    );
    glow.add(
      new THREE.PlaneGeometry(tw * 0.3, 0.06),
      c,
      { at: [tw * 0.06, top + 0.2, tz + td / 2 - 0.025] },
      'glow',
    );
  }
}

/** The construction site: a fenced lot, a half-built frame and the crane's mast (the jib turns, see `craneJib`). */
export function crane(p: CityPiece, { body: b, blink }: Parts): void {
  // Hoarding round the lot.
  const z = p.d / 2;
  for (const s of [-1, 1])
    b.box(0.05, 0.28, p.d, COLOR.chalk, { at: [s * (p.w / 2 - 0.03), 0.14, 0] }, 0);
  b.box(p.w, 0.28, 0.05, COLOR.chalk, { at: [0, 0.14, -z + 0.03] }, 0);
  for (const s of [-1, 1])
    b.box(p.w * 0.32, 0.28, 0.05, COLOR.chalk, { at: [s * p.w * 0.34, 0.14, z - 0.03] }, 0);
  for (let i = 0; i < 4; i++)
    b.box(
      0.12,
      0.06,
      0.06,
      COLOR.accentRed,
      { at: [-p.w * 0.45 + i * 0.12, 0.2, z], rot: [0, 0, 0.6] },
      0,
    );
  // The building going up: slabs on columns, the top storey still bare.
  const frameW = p.w * 0.6;
  const frameD = p.d * 0.55;
  const fx = -p.w * 0.12;
  const fz = -p.d * 0.12;
  for (let s = 0; s <= p.storeys; s++) {
    b.box(frameW, 0.06, frameD, C.concrete, { at: [fx, s * STOREY + 0.03, fz] }, 0);
    if (s < p.storeys - 1)
      windowGrid(b, frameW - 0.02, frameD - 0.02, 1, s * STOREY + 0.05, () => 1, { width: 0.18 });
  }
  for (const cx of [-1, 0, 1]) {
    for (const cz of [-1, 1]) {
      b.box(
        0.06,
        p.storeys * STOREY,
        0.06,
        C.concrete,
        {
          at: [
            fx + cx * (frameW / 2 - 0.04),
            (p.storeys * STOREY) / 2,
            fz + cz * (frameD / 2 - 0.04),
          ],
        },
        0,
      );
    }
  }
  // Pallets and a cement mixer by the gate.
  b.box(0.28, 0.12, 0.28, COLOR.cardboard, { at: [p.w * 0.32, 0.06, p.d * 0.25] }, 0.01);
  b.cylinder(
    0.11,
    0.15,
    0.28,
    COLOR.orange,
    { at: [p.w * 0.33, 0.24, -p.d * 0.15], rot: [0.5, 0, 0] },
    12,
  );
  // The crane's lattice mast.
  const mast = CRANE.mastHeight(p);
  const mx = CRANE.mastX(p);
  const mz = CRANE.mastZ(p);
  b.box(0.3, 0.12, 0.3, C.concrete, { at: [mx, 0.06, mz] }, 0.02);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    b.box(0.03, mast, 0.03, C.crane, { at: [mx + sx * 0.09, mast / 2, mz + sz * 0.09] }, 0);
  }
  for (let y = 0.25; y < mast; y += 0.3) {
    b.box(0.2, 0.025, 0.025, C.crane, { at: [mx, y, mz + 0.09], rot: [0, 0, 0.9] }, 0);
    b.box(0.2, 0.025, 0.025, C.crane, { at: [mx, y, mz - 0.09], rot: [0, 0, -0.9] }, 0);
    b.box(0.025, 0.025, 0.2, C.crane, { at: [mx + 0.09, y, mz], rot: [0.9, 0, 0] }, 0);
    b.box(0.025, 0.025, 0.2, C.crane, { at: [mx - 0.09, y, mz], rot: [-0.9, 0, 0] }, 0);
  }
  blink.led(0.05, C.warn, { at: [mx, mast + 0.55, mz] });
}

/** Where the crane's mast stands on its lot, and how tall it is. */
export const CRANE = {
  mastX: (p: Pick<CityPiece, 'w'>) => p.w * 0.32,
  mastZ: (p: Pick<CityPiece, 'd'>) => -p.d * 0.3,
  mastHeight: (p: Pick<CityPiece, 'h'>) => p.h - 0.5,
};

/** The crane's turning top: cab, jib with its hook, counter-jib with the weights; the mast top at the origin. */
export function craneJib(): PieceBuilders {
  const b = new ModelBuilder();
  const blink = new ModelBuilder();
  b.box(0.26, 0.2, 0.26, C.crane, { at: [0, 0.1, 0] }, 0.03);
  b.add(new THREE.PlaneGeometry(0.16, 0.1), C.pane, { at: [0, 0.12, 0.131] });
  b.box(0.05, 0.45, 0.05, C.crane, { at: [0, 0.42, 0] }, 0);
  // Jib to the front-right, counter-jib behind.
  const jib = 2.1;
  b.box(jib, 0.08, 0.1, C.crane, { at: [jib / 2, 0.24, 0] }, 0);
  for (let x = 0.2; x < jib; x += 0.2)
    b.box(0.025, 0.08, 0.1, tint(C.crane, -0.2), { at: [x, 0.24, 0] }, 0);
  b.box(0.7, 0.07, 0.1, C.crane, { at: [-0.35, 0.24, 0] }, 0);
  b.box(0.24, 0.2, 0.18, C.concrete, { at: [-0.58, 0.16, 0] }, 0.02);
  // Ties from the peak to the tips.
  for (const [x, len, angle] of [
    [jib * 0.5, Math.hypot(jib, 0.4), Math.atan2(-0.4, jib)],
    [-0.35, Math.hypot(0.7, 0.4), Math.atan2(0.4, 0.7)],
  ] as const) {
    b.box(len, 0.012, 0.012, C.ink, { at: [x, 0.47, 0], rot: [0, 0, angle] }, 0);
  }
  // Trolley, cable and hook carrying a beam.
  const hookX = jib * 0.72;
  b.box(0.12, 0.05, 0.12, C.ink, { at: [hookX, 0.18, 0] }, 0);
  b.box(0.012, 1.1, 0.012, C.ink, { at: [hookX, -0.4, 0] }, 0);
  b.box(0.5, 0.06, 0.08, COLOR.accentRed, { at: [hookX, -0.98, 0] }, 0);
  blink.led(0.05, C.warn, { at: [jib, 0.32, 0] });
  return { body: b, shiny: new ModelBuilder(), blink };
}

export function lamp(p: CityPiece, { body: b, glow }: Parts): void {
  b.cylinder(0.06, 0.08, 0.06, C.ink, { at: [0, 0.03, 0] }, 10);
  b.cylinder(0.025, 0.03, 1.0, C.ink, { at: [0, 0.5, 0] }, 8);
  if (styleOf(p) === 1) {
    // A globe on top.
    glow.led(0.08, COLOR.lampLight, { at: [0, 1.06, 0] });
    return;
  }
  b.box(0.04, 0.03, 0.22, C.ink, { at: [0, 1.0, 0.09] }, 0);
  b.box(0.12, 0.05, 0.14, C.ink, { at: [0, 0.99, 0.2] }, 0.01);
  glow.add(
    new THREE.PlaneGeometry(0.09, 0.1).rotateX(Math.PI / 2),
    COLOR.lampLight,
    { at: [0, 0.96, 0.2] },
    'glow',
  );
}

export function car(p: CityPiece, { body: b, glow }: Parts): void {
  carModel(b, glow, choose(CAR_PAINT, frac(p.variant * 9.1)), p.w, p.d, styleOf(p));
}

/** A little car `w` wide and `l` long, facing +z: 0 a sedan, 1 a hatchback, 2 a van, 3 a pickup. */
export function carModel(
  b: ModelBuilder,
  glow: ModelBuilder,
  paint: number,
  w: number,
  l: number,
  style = 0,
): void {
  b.box(w, 0.16, l, paint, { at: [0, 0.14, 0] }, 0.06);
  if (style === 0) {
    b.box(w * 0.86, 0.14, l * 0.5, paint, { at: [0, 0.28, -l * 0.06] }, 0.05);
    b.box(w * 0.88, 0.1, l * 0.44, C.paneDark, { at: [0, 0.28, -l * 0.06] }, 0.03);
  } else if (style === 1) {
    b.box(w * 0.86, 0.15, l * 0.58, paint, { at: [0, 0.29, -l * 0.18] }, 0.05);
    b.box(w * 0.88, 0.1, l * 0.52, C.paneDark, { at: [0, 0.29, -l * 0.16] }, 0.03);
  } else if (style === 2) {
    b.box(w * 0.94, 0.3, l * 0.8, tint(paint, 0.15), { at: [0, 0.36, -l * 0.08] }, 0.05);
    b.box(w * 0.96, 0.1, l * 0.12, C.paneDark, { at: [0, 0.38, l * 0.28] }, 0.02);
  } else {
    b.box(w * 0.88, 0.16, l * 0.36, paint, { at: [0, 0.29, l * 0.12] }, 0.05);
    b.box(w * 0.9, 0.1, l * 0.3, C.paneDark, { at: [0, 0.29, l * 0.12] }, 0.03);
    b.box(w * 0.8, 0.04, l * 0.4, C.ink, { at: [0, 0.22, -l * 0.26] }, 0);
    b.box(w * 0.4, 0.08, l * 0.2, COLOR.cardboard, { at: [0, 0.27, -l * 0.28] }, 0.01);
  }
  for (const [x, z] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ] as const) {
    b.cylinder(
      0.075,
      0.075,
      0.06,
      C.ink,
      { at: [x * (w / 2 - 0.02), 0.075, z * l * 0.3], rot: [0, 0, Math.PI / 2] },
      10,
    );
  }
  glow.led(0.03, COLOR.headlight, { at: [-w * 0.3, 0.16, l / 2] });
  glow.led(0.03, COLOR.headlight, { at: [w * 0.3, 0.16, l / 2] });
  glow.led(0.025, COLOR.tailLight, { at: [-w * 0.32, 0.17, -l / 2] });
  glow.led(0.025, COLOR.tailLight, { at: [w * 0.32, 0.17, -l / 2] });
}
