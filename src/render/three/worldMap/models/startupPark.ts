import * as THREE from 'three';
import { tint } from '../../kit';
import { COLOR } from '../../palette';
import { type CityPiece, STOREY, styleOf } from '../cityPlan';
import { C, choose, COWORK_ACCENT, frac, type Parts, windowGrid } from './shared';

/** Startup park: the warehouse, coworking blocks, the kiosk and the park. */

export function warehouse(p: CityPiece, { body: b, glow }: Parts, rng: () => number): void {
  const brick = 0xb5583f;
  const wallH = 1.0;
  b.box(p.w, wallH, p.d, brick, { at: [0, wallH / 2, 0] }, 0.04);
  // A barrel roof.
  const roof = new THREE.CylinderGeometry(
    p.d / 2 + 0.06,
    p.d / 2 + 0.06,
    p.w + 0.08,
    20,
    1,
    false,
    -Math.PI / 2,
    Math.PI,
  );
  roof.rotateZ(Math.PI / 2);
  roof.scale(1, 0.55, 1);
  b.add(roof, 0x7d8a96, { at: [0, wallH, 0] });
  // Brick courses.
  for (const y of [0.25, 0.5, 0.75])
    b.box(p.w + 0.01, 0.025, p.d + 0.01, tint(brick, -0.12), { at: [0, y, 0] }, 0);
  // The big factory window, glowing warm from the work inside.
  const winW = p.w * 0.62;
  const winH = 0.62;
  const z = p.d / 2 + 0.01;
  b.box(winW + 0.08, winH + 0.08, 0.03, C.ink, { at: [-p.w * 0.12, 0.48, z] }, 0.01);
  const cols = 6;
  const rows = 3;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -p.w * 0.12 - winW / 2 + (winW / cols) * (c + 0.5);
      const y = 0.48 - winH / 2 + (winH / rows) * (r + 0.5);
      const g = new THREE.PlaneGeometry(winW / cols - 0.035, winH / rows - 0.035);
      if (rng() < 0.6) glow.add(g, COLOR.windowGlow, { at: [x, y, z + 0.02] }, 'glow');
      else b.add(g, C.pane, { at: [x, y, z + 0.02] });
    }
  }
  // Loading door.
  b.box(0.5, 0.62, 0.03, COLOR.rollerDoor, { at: [p.w * 0.36, 0.31, z] }, 0.01);
  for (let i = 0; i < 5; i++)
    b.box(0.48, 0.015, 0.035, 0x7f93a8, { at: [p.w * 0.36, 0.08 + i * 0.12, z + 0.005] }, 0);
  // The neon sign on the roof's front: a dark board with glowing brackets.
  const signY = wallH + 0.22;
  b.box(1.2, 0.36, 0.06, C.ink, { at: [0, signY, z - 0.05] }, 0.03);
  b.box(0.05, 0.3, 0.05, C.steel, { at: [-0.4, wallH + 0.02, z - 0.1] }, 0);
  b.box(0.05, 0.3, 0.05, C.steel, { at: [0.4, wallH + 0.02, z - 0.1] }, 0);
  const neon = 0xff4fa8;
  const cyan = 0x3fe0ff;
  glow.add(
    new THREE.BoxGeometry(0.035, 0.2, 0.02),
    neon,
    { at: [-0.42, signY, z - 0.01], rot: [0, 0, -0.5] },
    'glow',
  );
  glow.add(
    new THREE.BoxGeometry(0.035, 0.2, 0.02),
    neon,
    { at: [-0.42, signY - 0.0, z - 0.01], rot: [0, 0, 0.5] },
    'glow',
  );
  for (let i = 0; i < 3; i++)
    glow.add(
      new THREE.BoxGeometry(0.16, 0.035, 0.02),
      cyan,
      { at: [-0.16 + i * 0.2, signY, z - 0.01] },
      'glow',
    );
  glow.add(
    new THREE.BoxGeometry(0.035, 0.2, 0.02),
    neon,
    { at: [0.44, signY, z - 0.01], rot: [0, 0, 0.5] },
    'glow',
  );
  glow.add(
    new THREE.BoxGeometry(0.035, 0.2, 0.02),
    neon,
    { at: [0.44, signY, z - 0.01], rot: [0, 0, -0.5] },
    'glow',
  );
  // A chimney stack.
  b.cylinder(
    0.1,
    0.12,
    0.7,
    tint(brick, -0.15),
    { at: [p.w * 0.38, wallH + 0.3, -p.d * 0.25] },
    12,
  );
}

export function cowork(p: CityPiece, { body: b }: Parts, rng: () => number): void {
  const style = styleOf(p);
  const wall = choose([COLOR.chalk, COLOR.sandstone, 0xd9e6ee, 0xc8d0c0], frac(p.variant * 3.7));
  const accent = choose(COWORK_ACCENT, frac(p.variant * 5.1));
  const top = p.storeys * STOREY;
  b.box(p.w, top, p.d, wall, { at: [0, top / 2, 0] }, 0.04);
  windowGrid(b, p.w, p.d, p.storeys, 0, rng, { litShare: 0.3, width: style === 2 ? 0.18 : 0.26 });
  if (style === 0) {
    // Colored floor bands and a corner stripe.
    for (let s = 1; s < p.storeys; s++)
      b.box(p.w + 0.03, 0.04, p.d + 0.03, accent, { at: [0, s * STOREY, 0] }, 0);
    b.box(0.1, top, 0.1, accent, { at: [-p.w / 2 + 0.03, top / 2, p.d / 2 - 0.03] }, 0.02);
  } else if (style === 1) {
    // Planters along every floor: a green building.
    for (let s = 1; s <= p.storeys; s++) {
      b.box(
        p.w + 0.06,
        0.07,
        0.1,
        tint(wall, -0.3),
        { at: [0, s * STOREY - 0.04, p.d / 2 + 0.04] },
        0.01,
      );
      for (let i = 0; i < Math.floor(p.w / 0.22); i++)
        b.sphere(0.07, i % 2 ? C.leaf : C.leafLight, {
          at: [-p.w / 2 + 0.12 + i * 0.22, s * STOREY + 0.02, p.d / 2 + 0.05],
        });
    }
  } else {
    // Timber slats up the front, an accent door.
    for (let i = 0; i < Math.floor(p.w / 0.12); i++)
      b.box(
        0.035,
        top - 0.05,
        0.02,
        COLOR.wood,
        { at: [-p.w / 2 + 0.06 + i * 0.12, top / 2, p.d / 2 + 0.012] },
        0,
      );
    b.box(0.3, 0.32, 0.03, accent, { at: [-p.w * 0.25, 0.16, p.d / 2 + 0.03] }, 0.01);
  }
  // A roof garden, or roof boxes.
  b.box(p.w - 0.1, 0.06, p.d - 0.1, tint(wall, -0.2), { at: [0, top + 0.03, 0] }, 0.02);
  if (rng() < 0.6) {
    b.box(p.w * 0.5, 0.08, p.d * 0.5, C.leafLight, { at: [-p.w * 0.15, top + 0.08, 0] }, 0.03);
    b.sphere(0.13, C.leaf, { at: [p.w * 0.25, top + 0.15, -p.d * 0.15] });
  } else {
    b.box(0.3, 0.14, 0.24, C.steel, { at: [p.w * 0.2, top + 0.13, -p.d * 0.1] }, 0.03);
    b.cylinder(0.08, 0.08, 0.02, C.ink, { at: [p.w * 0.2, top + 0.21, -p.d * 0.1] }, 12);
  }
  // An awning over the door.
  b.box(0.5, 0.04, 0.22, accent, { at: [p.w * 0.2, STOREY * 0.85, p.d / 2 + 0.11] }, 0.01);
}

export function kiosk(p: CityPiece, { body: b, glow }: Parts): void {
  const h = 0.62;
  b.box(p.w, h, p.d - 0.2, COLOR.freshGreen, { at: [0, h / 2, -0.1] }, 0.05);
  b.box(p.w * 0.8, 0.06, 0.16, COLOR.birch, { at: [0, 0.38, p.d / 2 - 0.25] }, 0.02);
  glow.screen(p.w * 0.6, 0.18, 0xffe6a8, { at: [0, 0.52, p.d / 2 - 0.29] });
  // A striped awning.
  const n = 6;
  for (let i = 0; i < n; i++) {
    b.box(
      p.w / n,
      0.03,
      0.34,
      i % 2 ? C.white : COLOR.accentRed,
      {
        at: [-p.w / 2 + (p.w / n) * (i + 0.5), h + 0.02, p.d / 2 - 0.2],
        rot: [0.35, 0, 0],
      },
      0,
    );
  }
  // The giant cup on the roof.
  b.cylinder(0.17, 0.13, 0.26, C.white, { at: [0, h + 0.2, -0.1] }, 16);
  b.cylinder(0.16, 0.16, 0.03, COLOR.walnut, { at: [0, h + 0.33, -0.1] }, 16);
  b.torus(0.07, 0.022, C.white, { at: [0.18, h + 0.2, -0.1] });
}

export function scooter(p: CityPiece, { body: b }: Parts): void {
  const paint = choose([COLOR.freshGreen, C.teal, COLOR.salmon], p.variant);
  for (const z of [-0.2, 0.2])
    b.cylinder(0.06, 0.06, 0.04, C.ink, { at: [0, 0.06, z], rot: [0, 0, Math.PI / 2] }, 10);
  b.box(0.1, 0.03, 0.42, paint, { at: [0, 0.08, 0] }, 0);
  b.box(0.03, 0.34, 0.03, C.steel, { at: [0, 0.25, 0.2], rot: [-0.15, 0, 0] }, 0);
  b.box(0.2, 0.025, 0.025, C.ink, { at: [0, 0.42, 0.22] }, 0);
}

export function bench(p: CityPiece, { body: b }: Parts): void {
  const wood = choose(
    [COLOR.wood, COLOR.chestnut, COLOR.woodLight, COLOR.stormGrey],
    frac(p.variant * 4.3),
  );
  b.box(p.w, 0.05, 0.2, wood, { at: [0, 0.18, 0] }, 0.01);
  if (styleOf(p) === 0) {
    b.box(p.w, 0.14, 0.04, wood, { at: [0, 0.3, -0.09] }, 0.01);
    for (const x of [-p.w / 2 + 0.06, p.w / 2 - 0.06])
      b.box(0.04, 0.17, 0.18, C.ink, { at: [x, 0.085, 0] }, 0);
  } else {
    // No back: a slab on two concrete blocks.
    for (const x of [-p.w / 2 + 0.08, p.w / 2 - 0.08])
      b.box(0.1, 0.16, 0.2, C.concrete, { at: [x, 0.08, 0] }, 0.01);
  }
}

export function pingPong(_p: CityPiece, { body: b }: Parts): void {
  b.box(0.8, 0.04, 0.46, 0x3f8f5a, { at: [0, 0.3, 0] }, 0.01);
  b.box(0.8, 0.005, 0.02, C.white, { at: [0, 0.322, 0] }, 0);
  b.box(0.02, 0.08, 0.46, C.white, { at: [0, 0.36, 0] }, 0);
  for (const [x, z] of [
    [-0.34, -0.18],
    [0.34, -0.18],
    [-0.34, 0.18],
    [0.34, 0.18],
  ] as const)
    b.box(0.03, 0.28, 0.03, C.ink, { at: [x, 0.14, z] }, 0);
  b.sphere(0.025, COLOR.orange, { at: [0.18, 0.4, 0.05] });
}

export function picnic(p: CityPiece, { body: b }: Parts): void {
  const wood = COLOR.wood;
  b.box(p.w, 0.04, 0.3, wood, { at: [0, 0.3, 0] }, 0.01);
  for (const z of [-0.26, 0.26]) b.box(p.w, 0.03, 0.12, wood, { at: [0, 0.17, z] }, 0.01);
  for (const x of [-p.w / 2 + 0.08, p.w / 2 - 0.08])
    b.box(0.04, 0.3, 0.6, tint(wood, -0.25), { at: [x, 0.15, 0] }, 0);
  b.cylinder(0.04, 0.035, 0.08, C.white, { at: [0.1, 0.36, 0.05] }, 10);
  b.cylinder(0.035, 0.03, 0.07, COLOR.salmon, { at: [-0.15, 0.355, -0.04] }, 10);
}
