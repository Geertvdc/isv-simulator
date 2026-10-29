import { tint } from '../../kit';
import { COLOR } from '../../palette';
import { type CityPiece, styleOf } from '../cityPlan';
import { C, choose, frac, type Parts, prism } from './shared';

/** Street furniture: sheds, bins, hydrants, bus stops, bike racks and food trucks. */

/** A garden shed: plank walls, a shed or a gable roof. */
export function shed(p: CityPiece, { body: b }: Parts): void {
  const wall = choose([COLOR.mushroom, COLOR.greyTeal, 0xb59a6a, 0x8a6a6a], frac(p.variant * 3.3));
  const wallH = p.h * 0.65;
  b.box(p.w, wallH, p.d, wall, { at: [0, wallH / 2, 0] }, 0.02);
  for (let i = 1; i < 5; i++)
    b.box(
      0.008,
      wallH - 0.02,
      0.006,
      tint(wall, -0.25),
      { at: [-p.w / 2 + (p.w / 5) * i, wallH / 2, p.d / 2 + 0.003] },
      0,
    );
  if (styleOf(p) === 0) {
    b.add(prism(p.w + 0.08, p.d + 0.1, p.h - wallH), COLOR.umber, { at: [0, wallH - 0.01, 0] });
  } else {
    b.box(
      p.w + 0.08,
      0.04,
      p.d + 0.12,
      COLOR.roofSlate,
      { at: [0, wallH + 0.08, 0], rot: [0.3, 0, 0] },
      0.01,
    );
  }
  b.box(
    p.w * 0.35,
    wallH * 0.8,
    0.02,
    tint(wall, -0.3),
    { at: [-p.w * 0.15, wallH * 0.4, p.d / 2 + 0.008] },
    0,
  );
}

/** A street bin: a round one, a square one with a lid, or a pair for recycling. */
export function bin(p: CityPiece, { body: b }: Parts): void {
  const style = styleOf(p);
  const c = choose([0x4a5a4a, COLOR.asphalt, COLOR.umber], frac(p.variant * 5.1));
  if (style === 0) {
    b.cylinder(p.w / 2, p.w / 2 - 0.02, p.h, c, { at: [0, p.h / 2, 0] }, 12);
    b.cylinder(p.w / 2 + 0.01, p.w / 2 + 0.01, 0.03, tint(c, 0.25), { at: [0, p.h, 0] }, 12);
  } else if (style === 1) {
    b.box(p.w, p.h, p.w, c, { at: [0, p.h / 2, 0] }, 0.02);
    b.box(p.w + 0.02, 0.04, p.w + 0.02, tint(c, 0.25), { at: [0, p.h + 0.01, 0] }, 0.01);
  } else {
    for (const [x, col] of [
      [-0.06, COLOR.brightBlue],
      [0.06, COLOR.freshGreen],
    ] as const) {
      b.box(0.11, p.h, 0.16, tint(col, -0.35), { at: [x, p.h / 2, 0] }, 0.02);
    }
  }
}

export function hydrant(_p: CityPiece, { body: b }: Parts): void {
  const red = 0xd9483f;
  b.cylinder(0.06, 0.07, 0.22, red, { at: [0, 0.11, 0] }, 10);
  b.sphere(0.06, red, { at: [0, 0.23, 0] }, [1, 0.7, 1]);
  for (const s of [-1, 1])
    b.cylinder(0.025, 0.025, 0.05, red, { at: [s * 0.07, 0.15, 0], rot: [0, 0, Math.PI / 2] }, 8);
  b.cylinder(0.08, 0.08, 0.03, tint(red, -0.3), { at: [0, 0.015, 0] }, 10);
}

/** A bus shelter: glass back, a bench, a roof, a timetable screen. */
export function busStop(p: CityPiece, { body: b, shiny, glow }: Parts): void {
  const roof = choose([C.ink, COLOR.forestGreen, COLOR.steelBlue], frac(p.variant * 3.9));
  b.box(p.w, 0.04, p.d, roof, { at: [0, p.h, 0] }, 0.01);
  for (const x of [-p.w / 2 + 0.03, p.w / 2 - 0.03])
    b.box(0.03, p.h, 0.03, C.ink, { at: [x, p.h / 2, -p.d / 2 + 0.04] }, 0);
  shiny.box(p.w - 0.08, p.h * 0.75, 0.015, C.glass, { at: [0, p.h * 0.45, -p.d / 2 + 0.04] }, 0);
  b.box(p.w * 0.6, 0.03, 0.12, COLOR.wood, { at: [-p.w * 0.1, 0.16, -p.d / 2 + 0.12] }, 0);
  if (styleOf(p) === 0) {
    b.box(0.18, 0.3, 0.03, C.ink, { at: [p.w / 2 - 0.15, 0.3, -p.d / 2 + 0.06] }, 0);
    glow.screen(0.15, 0.26, COLOR.ledCyan, { at: [p.w / 2 - 0.15, 0.3, -p.d / 2 + 0.077] });
  } else {
    // A route sign on a pole.
    b.cylinder(
      0.012,
      0.012,
      p.h + 0.1,
      C.steel,
      { at: [p.w / 2 + 0.05, (p.h + 0.1) / 2, p.d / 2] },
      6,
    );
    b.cylinder(
      0.07,
      0.07,
      0.015,
      COLOR.brightBlue,
      { at: [p.w / 2 + 0.05, p.h + 0.05, p.d / 2], rot: [Math.PI / 2, 0, 0] },
      14,
    );
  }
}

/** A bike rack with two or three bikes in it. */
export function bikeRack(p: CityPiece, { body: b }: Parts): void {
  b.box(p.w, 0.02, 0.03, C.steel, { at: [0, 0.18, -p.d * 0.3] }, 0);
  const n = 2 + Math.floor(frac(p.variant * 5) * 2);
  for (let i = 0; i < n; i++) {
    const x = -p.w / 2 + 0.12 + i * ((p.w - 0.24) / Math.max(1, n - 1));
    const frame = choose(
      [COLOR.accentRed, COLOR.brightBlue, COLOR.freshGreen, C.white, COLOR.violet],
      frac(p.variant * 7 + i * 0.29),
    );
    for (const z of [-0.12, 0.12])
      b.torus(0.08, 0.012, C.ink, { at: [x, 0.09, z], rot: [0, Math.PI / 2, 0] });
    b.box(0.018, 0.018, 0.24, frame, { at: [x, 0.15, 0], rot: [0.25, 0, 0] }, 0);
    b.box(0.018, 0.1, 0.018, frame, { at: [x, 0.17, 0.05] }, 0);
  }
}

/** A food truck: coffee, ice cream or tacos, with its hatch open. */
export function foodTruck(p: CityPiece, { body: b, glow }: Parts): void {
  const style = styleOf(p);
  const body = choose([C.white, COLOR.sunYellow, COLOR.powderBlue], style / 3 + 0.01);
  const trim = choose([COLOR.accentRed, COLOR.forestGreen, COLOR.violet], frac(p.variant * 3.3));
  b.box(p.w * 0.72, p.h * 0.75, p.d, body, { at: [-p.w * 0.14, 0.1 + p.h * 0.375, 0] }, 0.04);
  b.box(p.w * 0.26, p.h * 0.5, p.d * 0.95, body, { at: [p.w * 0.36, 0.1 + p.h * 0.25, 0] }, 0.04);
  b.box(0.02, p.h * 0.2, p.d * 0.7, C.paneDark, { at: [p.w * 0.49, 0.1 + p.h * 0.35, 0] }, 0);
  b.box(p.w * 0.73, 0.05, p.d + 0.01, trim, { at: [-p.w * 0.14, 0.14, 0] }, 0);
  glow.screen(p.w * 0.4, p.h * 0.25, COLOR.warmLight, {
    at: [-p.w * 0.14, 0.1 + p.h * 0.45, p.d / 2 + 0.005],
  });
  b.box(
    p.w * 0.46,
    0.02,
    0.12,
    trim,
    { at: [-p.w * 0.14, 0.1 + p.h * 0.65, p.d / 2 + 0.06], rot: [0.35, 0, 0] },
    0,
  );
  const roofY = 0.1 + p.h * 0.75;
  if (style === 0) {
    b.cylinder(0.08, 0.06, 0.13, C.white, { at: [-p.w * 0.2, roofY + 0.07, 0] }, 12);
    b.cylinder(0.075, 0.075, 0.015, COLOR.walnut, { at: [-p.w * 0.2, roofY + 0.14, 0] }, 12);
  } else if (style === 1) {
    b.cone(
      0.07,
      0.16,
      COLOR.honey,
      { at: [-p.w * 0.2, roofY + 0.08, 0], rot: [Math.PI, 0, 0] },
      10,
    );
    b.sphere(0.07, 0xf4a7c0, { at: [-p.w * 0.2, roofY + 0.18, 0] });
  } else {
    b.box(0.2, 0.08, 0.1, COLOR.ochre, { at: [-p.w * 0.2, roofY + 0.05, 0] }, 0.04);
  }
  for (const x of [-p.w * 0.36, p.w * 0.3])
    for (const z of [-1, 1])
      b.cylinder(
        0.06,
        0.06,
        0.04,
        C.ink,
        { at: [x, 0.06, z * (p.d / 2 - 0.02)], rot: [Math.PI / 2, 0, 0] },
        10,
      );
}
