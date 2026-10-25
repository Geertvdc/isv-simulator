import * as THREE from 'three';
import { ModelBuilder, tint } from '../kit';
import { type CityPiece, type PieceKind, STOREY, type TreeKind, seeded, styleOf } from './cityPlan';

/**
 * The world map's set pieces, built in code like the office kit: chunky,
 * rounded and toy-like. Each model stands on the ground at the origin,
 * facing the camera (+z), sized to its piece's footprint (`w` along x, `d`
 * along z) and height. `body` is matte, `shiny` is glass that reflects the
 * sky, `glow` is lit windows and screens, `blink` is the warning lights
 * that blink on cranes and towers.
 */

export interface PieceBuilders {
  body: ModelBuilder;
  shiny: ModelBuilder;
  blink: ModelBuilder;
}

/** The builders a model draws into, with `glow` the body builder's glowing layer. */
type Parts = PieceBuilders & { glow: ModelBuilder };

const C = {
  white: 0xf4f1ea,
  ink: 0x2b2f38,
  frame: 0xf7f4ee,
  pane: 0x6e8fae,
  paneDark: 0x4d6684,
  lit: 0xffd98a,
  trunk: 0x7a5236,
  leaf: 0x4f9d4a,
  leafLight: 0x6cbf5a,
  leafDark: 0x3f8a45,
  steel: 0x8b939e,
  concrete: 0xc9c6bd,
  roofTop: 0x8d949c,
  crane: 0xffc12e,
  warn: 0xff3b2f,
  water: 0x5fc3e4,
  glass: 0x8fd0e4,
  glassDeep: 0x5fa9c8,
  teal: 0x2fb8b0,
  purple: 0xa46ad8,
};

/** Garage-town house walls, roofs and doors. */
const HOUSE_WALLS = [
  0xf2c57c, 0x9fd0e8, 0xf4a7a0, 0xb9dc8f, 0xf3efe6, 0xe9b6d8, 0xd8c8b0, 0xc8d8e0, 0xe8d8a0,
];
const HOUSE_ROOFS = [0xc85a4a, 0x5a6f8a, 0x8a5a3a, 0x4f7f6a, 0xd9784a, 0x6a6a70, 0x9a4a4a];
const DOORS = [0x4f7f6a, 0x3f5f8a, 0xc85a4a, 0x8a5a3a, 0x2b2f38, 0xe8b84a];
const OFFICE_WALLS = [
  0xe3d3b8, 0xb8c6d2, 0xe0a87a, 0xa9c2b2, 0xd9dde0, 0xc9a98a, 0xb5684f, 0x9fb0c0, 0xd8c098,
];
const TOWER_WALLS = [
  0x6f86a6, 0x8b9bb0, 0x5d6f8a, 0xa5b0bd, 0xc9b79c, 0x7f8f9f, 0x8a7f9a, 0x6a8a8a, 0x9a8a7a,
];
const CAR_PAINT = [
  0xe8483f, 0x3f7fe0, 0xffc83d, 0xf4f1ea, 0x2fb8b0, 0x8a5ad8, 0x4a505c, 0xc8ccd2, 0x6aa84f,
];
const COWORK_ACCENT = [0xff8a5c, 0x4fbf74, 0xffc83d, 0x4fa3e0];

/** The fractional part of `v`, for picking colors from a variant independent of its style. */
function frac(v: number): number {
  return v - Math.floor(v);
}

function choose<T>(list: readonly T[], v: number): T {
  const item = list[Math.floor(v * list.length) % list.length];
  if (item === undefined) throw new Error('empty list');
  return item;
}

/** A triangular prism roof: `w` along x, `d` across, `h` high, its base at y = 0. */
function prism(w: number, d: number, h: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/**
 * Windows in rows (one per storey) on the front and both sides of a box
 * `w` × `d` whose storeys start at `base`. Some panes are lit.
 */
function windowGrid(
  b: ModelBuilder,
  w: number,
  d: number,
  storeys: number,
  base: number,
  rng: () => number,
  opts: { pane?: number; lit?: number; litShare?: number; width?: number; frame?: number } = {},
): void {
  const pane = opts.pane ?? C.pane;
  const lit = opts.lit ?? C.lit;
  const share = opts.litShare ?? 0.25;
  const size = opts.width ?? 0.2;
  const sides: {
    len: number;
    at: (u: number, y: number) => [number, number, number];
    yaw: number;
  }[] = [
    { len: w, at: (u, y) => [u, y, d / 2 + 0.006], yaw: 0 },
    { len: d, at: (u, y) => [w / 2 + 0.006, y, -u], yaw: Math.PI / 2 },
    { len: d, at: (u, y) => [-w / 2 - 0.006, y, u], yaw: -Math.PI / 2 },
  ];
  for (const side of sides) {
    const cols = Math.max(1, Math.floor((side.len - 0.15) / (size + 0.13)));
    const step = (side.len - 0.1) / cols;
    for (let s = 0; s < storeys; s++) {
      const y = base + s * STOREY + STOREY * 0.55;
      for (let c = 0; c < cols; c++) {
        const u = -side.len / 2 + 0.05 + step * (c + 0.5);
        const geometry = new THREE.PlaneGeometry(size, STOREY * 0.5);
        const place = { at: side.at(u, y), rot: [0, side.yaw, 0] as [number, number, number] };
        if (rng() < share) b.add(geometry, lit, place, 'glow');
        else b.add(geometry, pane, place);
      }
    }
  }
}

// ---- Garage town ----

function house(p: CityPiece, { body: b, glow }: Parts, rng: () => number): void {
  const style = styleOf(p);
  const wall = choose(HOUSE_WALLS, frac(p.variant * 7.3));
  const roof = choose(HOUSE_ROOFS, frac(p.variant * 13.7));
  const door = choose(DOORS, frac(p.variant * 5.9));
  const wallH = style === 3 ? 0.9 : 0.72;
  const rh = p.h - wallH;
  const z = p.d / 2;
  // Style 5 has a garage on the side: the house is the rest.
  const hw = style === 5 ? p.w * 0.66 : p.w;
  const hx = style === 5 ? -(p.w - hw) / 2 : 0;
  b.box(hw, wallH, p.d, wall, { at: [hx, wallH / 2, 0] }, 0.04);
  if (style === 0 || style === 5) {
    b.add(prism(hw + 0.1, p.d + 0.16, rh), roof, { at: [hx, wallH - 0.01, 0] });
  } else if (style === 1) {
    // Gable to the street, a porch roof on two posts over the door.
    b.add(prism(p.d + 0.12, hw + 0.1, rh), roof, {
      at: [hx, wallH - 0.01, 0],
      rot: [0, Math.PI / 2, 0],
    });
    b.box(hw * 0.6, 0.04, 0.3, roof, { at: [0, wallH - 0.1, z + 0.14], rot: [0.25, 0, 0] }, 0.01);
    for (const s of [-1, 1])
      b.box(
        0.04,
        wallH - 0.1,
        0.04,
        C.white,
        { at: [s * hw * 0.27, (wallH - 0.1) / 2, z + 0.26] },
        0,
      );
    b.box(hw * 0.62, 0.04, 0.32, 0xb5a58f, { at: [0, 0.02, z + 0.15] }, 0);
  } else if (style === 2) {
    // A hip roof: four slopes.
    const hip = new THREE.ConeGeometry(Math.SQRT1_2, rh, 4, 1).rotateY(Math.PI / 4);
    hip.scale(hw + 0.14, 1, p.d + 0.16);
    b.add(hip, roof, { at: [hx, wallH + rh / 2 - 0.01, 0] });
  } else if (style === 3) {
    // Flat and modern: a parapet, a wood-clad half, solar panels on the roof.
    b.box(hw + 0.04, 0.06, p.d + 0.04, tint(wall, -0.3), { at: [0, wallH + 0.03, 0] }, 0.01);
    b.box(hw * 0.45, wallH - 0.02, 0.02, 0xb5824f, { at: [-hw * 0.27, wallH / 2, z + 0.005] }, 0);
    for (let i = 0; i < 2; i++)
      b.box(
        hw * 0.32,
        0.03,
        p.d * 0.35,
        0x2b3a5a,
        { at: [-hw * 0.18 + i * hw * 0.36, wallH + 0.12, -p.d * 0.1], rot: [-0.35, 0, 0] },
        0,
      );
  } else {
    // A shed roof sloping to the back, a strip of high windows under its tall edge.
    const shape = new THREE.Shape();
    shape.moveTo(-(p.d + 0.16) / 2, 0);
    shape.lineTo((p.d + 0.16) / 2, 0);
    shape.lineTo((p.d + 0.16) / 2, rh * 0.85);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: hw + 0.1, bevelEnabled: false });
    g.translate(0, 0, -(hw + 0.1) / 2);
    g.rotateY(Math.PI / 2);
    b.add(g, wall, { at: [hx, wallH - 0.01, 0] });
    b.box(
      hw + 0.14,
      0.04,
      Math.hypot(p.d + 0.16, rh * 0.85) + 0.02,
      roof,
      {
        at: [hx, wallH + rh * 0.425, 0],
        rot: [Math.atan2(rh * 0.85, p.d + 0.16), 0, 0],
      },
      0.01,
    );
    b.add(new THREE.PlaneGeometry(hw * 0.7, 0.12), C.pane, {
      at: [hx, wallH + rh * 0.55, z + 0.09],
    });
  }
  if (style === 5) {
    // The garage: lower, its own flat roof, a roll-up door.
    const gw = p.w - hw;
    const gx = p.w / 2 - gw / 2;
    b.box(gw, 0.55, p.d * 0.9, tint(wall, -0.08), { at: [gx, 0.275, -p.d * 0.05] }, 0.03);
    b.box(gw + 0.04, 0.05, p.d * 0.9 + 0.04, roof, { at: [gx, 0.57, -p.d * 0.05] }, 0.01);
    b.box(gw * 0.75, 0.4, 0.02, 0xe8e4da, { at: [gx, 0.2, z - p.d * 0.05 + 0.01] }, 0);
    for (let i = 0; i < 4; i++)
      b.box(
        gw * 0.74,
        0.01,
        0.025,
        0xc0bcb0,
        { at: [gx, 0.06 + i * 0.1, z - p.d * 0.05 + 0.015] },
        0,
      );
  }
  // Door and windows with white frames; some lit from inside.
  const doorX = hx + (style === 1 ? 0 : (p.variant * 10) % 1 > 0.5 ? 1 : -1) * hw * 0.22;
  b.box(0.24, 0.42, 0.04, door, { at: [doorX, 0.21, z + 0.01] }, 0.01);
  b.box(0.28, 0.06, 0.08, C.white, { at: [doorX, 0.45, z + 0.03] }, 0.01);
  const windows = style === 1 ? [hx - hw * 0.3, hx + hw * 0.3] : [hx - (doorX - hx)];
  for (const winX of windows) {
    const wide = style === 3 ? 0.5 : 0.34;
    b.box(wide, 0.28, 0.03, style === 3 ? C.ink : C.white, { at: [winX, 0.42, z + 0.01] }, 0.01);
    const pane = new THREE.PlaneGeometry(wide - 0.08, 0.2);
    if (rng() < 0.35) glow.add(pane, 0xe8c27a, { at: [winX, 0.42, z + 0.03] }, 'glow');
    else b.add(pane, C.pane, { at: [winX, 0.42, z + 0.03] });
  }
  // A chimney, a dish on the wall, a bush by the door: each on or off.
  if (style !== 3 && style !== 4 && rng() < 0.7)
    b.box(
      0.16,
      0.38,
      0.16,
      tint(wall, -0.3),
      { at: [hx + hw * 0.28, p.h - 0.22, -p.d * 0.15] },
      0.02,
    );
  if (rng() < 0.3) {
    b.cylinder(
      0.1,
      0.03,
      0.05,
      C.white,
      { at: [hx - hw / 2 - 0.02, wallH - 0.15, 0.1], rot: [0, 0, 1.1] },
      12,
    );
  }
  if (rng() < 0.55) b.sphere(0.12, C.leafDark, { at: [doorX + 0.25, 0.09, z + 0.1] }, [1, 0.75, 1]);
}

function garage(p: CityPiece, { body: b, glow }: Parts): void {
  const wall = 0xf0e2c4;
  const roof = 0xc85a4a;
  const wallH = 0.98;
  const t = 0.08;
  const open = 1.08;
  const lintel = 0.1;
  const z = p.d / 2;
  // Floor, back and side walls, and the front either side of the open door.
  b.box(p.w, 0.04, p.d, 0x9a9a92, { at: [0, 0.02, 0] }, 0);
  b.box(p.w, wallH, t, wall, { at: [0, wallH / 2, -z + t / 2] }, 0.02);
  for (const s of [-1, 1])
    b.box(t, wallH, p.d, wall, { at: [s * (p.w / 2 - t / 2), wallH / 2, 0] }, 0.02);
  const doorX = p.w * 0.1;
  const leftW = p.w / 2 + doorX - open / 2;
  const rightW = p.w / 2 - doorX - open / 2;
  b.box(leftW, wallH, t, wall, { at: [-p.w / 2 + leftW / 2, wallH / 2, z - t / 2] }, 0.02);
  b.box(rightW, wallH, t, wall, { at: [p.w / 2 - rightW / 2, wallH / 2, z - t / 2] }, 0.02);
  b.box(open, lintel, t, wall, { at: [doorX, wallH - lintel / 2, z - t / 2] }, 0.02);
  // A window on the house side.
  const winX = -p.w / 2 + leftW / 2;
  b.box(0.3, 0.26, 0.03, C.white, { at: [winX, 0.55, z + 0.01] }, 0.01);
  b.add(new THREE.PlaneGeometry(0.22, 0.18), 0x9a8a60, { at: [winX, 0.55, z + 0.027] }, 'glow');
  // The roll-up door, rolled up under the lintel, and a dark inside.
  b.box(open + 0.04, 0.08, 0.1, 0x9fb3c8, { at: [doorX, wallH - lintel - 0.05, z - 0.07] }, 0.03);
  b.box(p.w - 2 * t, 0.01, p.d - 2 * t, 0x6a655d, { at: [0, 0.045, 0] }, 0);
  b.box(p.w - 2 * t, wallH - 0.05, 0.01, 0x4a4640, { at: [0, wallH / 2, -z + t + 0.01] }, 0);
  // The desk where it all began, pulled up to the open door so it shows: a glowing
  // monitor facing out, a laptop, a lamp, and the chair out on the driveway.
  const dz = z - 0.2;
  b.box(0.7, 0.04, 0.3, 0xb5824f, { at: [doorX, 0.36, dz] }, 0.01);
  for (const sx of [-0.31, 0.31])
    b.box(0.04, 0.34, 0.26, 0x8a6448, { at: [doorX + sx, 0.18, dz] }, 0.01);
  b.box(0.34, 0.24, 0.03, C.ink, { at: [doorX - 0.08, 0.55, dz - 0.08] }, 0.01);
  glow.screen(0.3, 0.2, 0x7fd8ff, { at: [doorX - 0.08, 0.55, dz - 0.063] });
  b.box(0.04, 0.06, 0.04, C.ink, { at: [doorX - 0.08, 0.41, dz - 0.08] }, 0);
  b.box(0.16, 0.012, 0.11, 0xc9ccd2, { at: [doorX + 0.2, 0.385, dz + 0.04] }, 0);
  b.box(0.16, 0.1, 0.01, 0xc9ccd2, { at: [doorX + 0.2, 0.43, dz - 0.02], rot: [-0.3, 0, 0] }, 0);
  glow.screen(0.13, 0.08, 0x9fffb0, { at: [doorX + 0.2, 0.43, dz - 0.012], rot: [-0.3, 0, 0] });
  b.cylinder(0.01, 0.01, 0.2, C.ink, { at: [doorX - 0.3, 0.48, dz - 0.05] }, 6);
  glow.led(0.045, 0xffe2a0, { at: [doorX - 0.3, 0.6, dz - 0.05] });
  b.box(0.2, 0.04, 0.2, 0xd9784a, { at: [doorX, 0.26, z + 0.16] }, 0.01);
  b.box(0.2, 0.2, 0.04, 0xd9784a, { at: [doorX, 0.37, z + 0.26] }, 0.01);
  b.box(0.03, 0.24, 0.03, C.ink, { at: [doorX, 0.12, z + 0.16] }, 0);
  // A string of fairy lights over the door.
  for (let i = 0; i < 7; i++) {
    glow.led(0.026, choose([0xffd166, 0xff7a7a, 0x7fd8ff], i / 7 + 0.01), {
      at: [
        doorX - open / 2 + 0.06 + i * ((open - 0.12) / 6),
        wallH - lintel - 0.02 - Math.sin((i / 6) * Math.PI) * 0.06,
        z + 0.03,
      ],
    });
  }
  // The roof, its gable over the door, with a round vent in the gable.
  b.add(prism(p.d + 0.16, p.w + 0.1, p.h - wallH), roof, {
    at: [0, wallH - 0.01, 0],
    rot: [0, Math.PI / 2, 0],
  });
  b.add(prism(0.02, p.w - 0.1, (p.h - wallH) * 0.8), wall, {
    at: [0, wallH, z + 0.075],
    rot: [0, Math.PI / 2, 0],
  });
  b.cylinder(
    0.07,
    0.07,
    0.02,
    C.ink,
    { at: [0, wallH + 0.14, z + 0.09], rot: [Math.PI / 2, 0, 0] },
    12,
  );
}

function fence(p: CityPiece, { body: b }: Parts): void {
  for (const y of [0.1, 0.22]) b.box(p.w, 0.035, 0.03, C.white, { at: [0, y, 0] }, 0);
  const n = Math.max(2, Math.round(p.w / 0.13));
  for (let i = 0; i <= n; i++) {
    const x = -p.w / 2 + (i * p.w) / n;
    b.box(0.045, p.h, 0.035, C.white, { at: [x, p.h / 2, 0.02] }, 0);
  }
}

function mailbox(_p: CityPiece, { body: b }: Parts): void {
  b.box(0.05, 0.42, 0.05, 0x8a6448, { at: [0, 0.21, 0] }, 0);
  b.box(0.16, 0.14, 0.24, 0x3f7fe0, { at: [0, 0.48, 0] }, 0.05);
  b.box(0.02, 0.12, 0.04, 0xe8483f, { at: [0.09, 0.56, -0.04] }, 0);
}

function bike(_p: CityPiece, { body: b }: Parts): void {
  for (const z of [-0.2, 0.2])
    b.torus(0.12, 0.018, C.ink, { at: [0, 0.13, z], rot: [0, Math.PI / 2, 0] });
  b.box(0.025, 0.025, 0.4, 0xe8483f, { at: [0, 0.22, 0], rot: [0.25, 0, 0] }, 0);
  b.box(0.025, 0.18, 0.025, 0xe8483f, { at: [0, 0.24, 0.08] }, 0);
  b.box(0.05, 0.025, 0.1, C.ink, { at: [0, 0.33, 0.07] }, 0);
  b.box(0.22, 0.02, 0.02, C.steel, { at: [0, 0.33, -0.17] }, 0);
}

// ---- Startup park ----

function warehouse(p: CityPiece, { body: b, glow }: Parts, rng: () => number): void {
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
      if (rng() < 0.6) glow.add(g, 0xe8c27a, { at: [x, y, z + 0.02] }, 'glow');
      else b.add(g, C.pane, { at: [x, y, z + 0.02] });
    }
  }
  // Loading door.
  b.box(0.5, 0.62, 0.03, 0x9fb3c8, { at: [p.w * 0.36, 0.31, z] }, 0.01);
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

function cowork(p: CityPiece, { body: b }: Parts, rng: () => number): void {
  const style = styleOf(p);
  const wall = choose([0xf3efe6, 0xe3d3b8, 0xd9e6ee, 0xc8d0c0], frac(p.variant * 3.7));
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
        0xb5824f,
        { at: [-p.w / 2 + 0.06 + i * 0.12, top / 2, p.d / 2 + 0.012] },
        0,
      );
    b.box(0.3, 0.32, 0.03, accent, { at: [-p.w * 0.25, 0.16, p.d / 2 + 0.03] }, 0.01);
  }
  // A roof garden, or roof boxes.
  b.box(p.w - 0.1, 0.06, p.d - 0.1, tint(wall, -0.2), { at: [0, top + 0.03, 0] }, 0.02);
  if (rng() < 0.6) {
    b.box(p.w * 0.5, 0.08, p.d * 0.5, 0x6cbf5a, { at: [-p.w * 0.15, top + 0.08, 0] }, 0.03);
    b.sphere(0.13, C.leaf, { at: [p.w * 0.25, top + 0.15, -p.d * 0.15] });
  } else {
    b.box(0.3, 0.14, 0.24, C.steel, { at: [p.w * 0.2, top + 0.13, -p.d * 0.1] }, 0.03);
    b.cylinder(0.08, 0.08, 0.02, C.ink, { at: [p.w * 0.2, top + 0.21, -p.d * 0.1] }, 12);
  }
  // An awning over the door.
  b.box(0.5, 0.04, 0.22, accent, { at: [p.w * 0.2, STOREY * 0.85, p.d / 2 + 0.11] }, 0.01);
}

function kiosk(p: CityPiece, { body: b, glow }: Parts): void {
  const h = 0.62;
  b.box(p.w, h, p.d - 0.2, 0x4fbf74, { at: [0, h / 2, -0.1] }, 0.05);
  b.box(p.w * 0.8, 0.06, 0.16, 0xe8dcc4, { at: [0, 0.38, p.d / 2 - 0.25] }, 0.02);
  glow.screen(p.w * 0.6, 0.18, 0xffe6a8, { at: [0, 0.52, p.d / 2 - 0.29] });
  // A striped awning.
  const n = 6;
  for (let i = 0; i < n; i++) {
    b.box(
      p.w / n,
      0.03,
      0.34,
      i % 2 ? C.white : 0xe8483f,
      {
        at: [-p.w / 2 + (p.w / n) * (i + 0.5), h + 0.02, p.d / 2 - 0.2],
        rot: [0.35, 0, 0],
      },
      0,
    );
  }
  // The giant cup on the roof.
  b.cylinder(0.17, 0.13, 0.26, C.white, { at: [0, h + 0.2, -0.1] }, 16);
  b.cylinder(0.16, 0.16, 0.03, 0x7a5236, { at: [0, h + 0.33, -0.1] }, 16);
  b.torus(0.07, 0.022, C.white, { at: [0.18, h + 0.2, -0.1] });
}

function scooter(p: CityPiece, { body: b }: Parts): void {
  const paint = choose([0x4fbf74, 0x2fb8b0, 0xff8a5c], p.variant);
  for (const z of [-0.2, 0.2])
    b.cylinder(0.06, 0.06, 0.04, C.ink, { at: [0, 0.06, z], rot: [0, 0, Math.PI / 2] }, 10);
  b.box(0.1, 0.03, 0.42, paint, { at: [0, 0.08, 0] }, 0);
  b.box(0.03, 0.34, 0.03, C.steel, { at: [0, 0.25, 0.2], rot: [-0.15, 0, 0] }, 0);
  b.box(0.2, 0.025, 0.025, C.ink, { at: [0, 0.42, 0.22] }, 0);
}

function bench(p: CityPiece, { body: b }: Parts): void {
  const wood = choose([0xb5824f, 0x8a6448, 0xc8a070, 0x6a7a8a], frac(p.variant * 4.3));
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

function pingPong(_p: CityPiece, { body: b }: Parts): void {
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
  b.sphere(0.025, 0xff8a3d, { at: [0.18, 0.4, 0.05] });
}

function picnic(p: CityPiece, { body: b }: Parts): void {
  const wood = 0xb5824f;
  b.box(p.w, 0.04, 0.3, wood, { at: [0, 0.3, 0] }, 0.01);
  for (const z of [-0.26, 0.26]) b.box(p.w, 0.03, 0.12, wood, { at: [0, 0.17, z] }, 0.01);
  for (const x of [-p.w / 2 + 0.08, p.w / 2 - 0.08])
    b.box(0.04, 0.3, 0.6, tint(wood, -0.25), { at: [x, 0.15, 0] }, 0);
  b.cylinder(0.04, 0.035, 0.08, C.white, { at: [0.1, 0.36, 0.05] }, 10);
  b.cylinder(0.035, 0.03, 0.07, 0xff8a5c, { at: [-0.15, 0.355, -0.04] }, 10);
}

// ---- Scale-up downtown ----

function office(p: CityPiece, { body: b, glow, blink }: Parts, rng: () => number): void {
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
      const c = choose([0x4f7f6a, 0xc85a4a, 0x3f5f8a, 0xd9784a], frac(p.variant * 3 + i * 0.37));
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
    b.cone(0.15, 0.1, 0x6a4a3a, { at: [tw * 0.2, top + 0.54, tz] }, 12);
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
        0x2b3a5a,
        { at: [0, top + 0.14, tz - td * 0.3 + i * td * 0.25], rot: [-0.4, 0, 0] },
        0,
      );
  } else {
    // A glowing sign on the front edge: a logo dot and a bar.
    b.box(tw * 0.6, 0.22, 0.04, C.ink, { at: [0, top + 0.2, tz + td / 2 - 0.05] }, 0.02);
    const c = choose([0x7fd8ff, 0x9fff8a, 0xff9fd0, 0xffd98a], frac(p.variant * 11.3));
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
function crane(p: CityPiece, { body: b, blink }: Parts): void {
  // Hoarding round the lot.
  const z = p.d / 2;
  for (const s of [-1, 1])
    b.box(0.05, 0.28, p.d, 0xf3efe6, { at: [s * (p.w / 2 - 0.03), 0.14, 0] }, 0);
  b.box(p.w, 0.28, 0.05, 0xf3efe6, { at: [0, 0.14, -z + 0.03] }, 0);
  for (const s of [-1, 1])
    b.box(p.w * 0.32, 0.28, 0.05, 0xf3efe6, { at: [s * p.w * 0.34, 0.14, z - 0.03] }, 0);
  for (let i = 0; i < 4; i++)
    b.box(
      0.12,
      0.06,
      0.06,
      0xe8483f,
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
  b.box(0.28, 0.12, 0.28, 0xc8955a, { at: [p.w * 0.32, 0.06, p.d * 0.25] }, 0.01);
  b.cylinder(
    0.11,
    0.15,
    0.28,
    0xff8a3d,
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
  b.box(0.5, 0.06, 0.08, 0xe8483f, { at: [hookX, -0.98, 0] }, 0);
  blink.led(0.05, C.warn, { at: [jib, 0.32, 0] });
  return { body: b, shiny: new ModelBuilder(), blink };
}

function lamp(p: CityPiece, { body: b, glow }: Parts): void {
  b.cylinder(0.06, 0.08, 0.06, C.ink, { at: [0, 0.03, 0] }, 10);
  b.cylinder(0.025, 0.03, 1.0, C.ink, { at: [0, 0.5, 0] }, 8);
  if (styleOf(p) === 1) {
    // A globe on top.
    glow.led(0.08, 0xfff0c0, { at: [0, 1.06, 0] });
    return;
  }
  b.box(0.04, 0.03, 0.22, C.ink, { at: [0, 1.0, 0.09] }, 0);
  b.box(0.12, 0.05, 0.14, C.ink, { at: [0, 0.99, 0.2] }, 0.01);
  glow.add(
    new THREE.PlaneGeometry(0.09, 0.1).rotateX(Math.PI / 2),
    0xfff0c0,
    { at: [0, 0.96, 0.2] },
    'glow',
  );
}

function car(p: CityPiece, { body: b, glow }: Parts): void {
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
    b.box(w * 0.4, 0.08, l * 0.2, 0xc8955a, { at: [0, 0.27, -l * 0.28] }, 0.01);
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
  glow.led(0.03, 0xfff4c0, { at: [-w * 0.3, 0.16, l / 2] });
  glow.led(0.03, 0xfff4c0, { at: [w * 0.3, 0.16, l / 2] });
  glow.led(0.025, 0xff5040, { at: [-w * 0.32, 0.17, -l / 2] });
  glow.led(0.025, 0xff5040, { at: [w * 0.32, 0.17, -l / 2] });
}

// ---- Enterprise city ----

function tower(p: CityPiece, { body: b, glow, blink }: Parts, rng: () => number): void {
  const style = styleOf(p);
  const wall = choose(TOWER_WALLS, frac(p.variant * 7.9));
  const top = p.storeys * STOREY;
  b.box(p.w, top, p.d, wall, { at: [0, top / 2, 0] }, 0.03);
  windowGrid(b, p.w, p.d, p.storeys - 1, STOREY, rng, {
    pane: tint(wall, -0.35),
    litShare: style === 3 ? 0.1 : 0.2,
    width: style === 1 ? 0.12 : 0.16,
  });
  // Lobby and crown.
  b.box(p.w + 0.03, STOREY, p.d + 0.03, tint(wall, -0.3), { at: [0, STOREY / 2, 0] }, 0.02);
  if (style === 0) {
    for (let s = 4; s < p.storeys; s += 4)
      b.box(p.w + 0.02, 0.05, p.d + 0.02, tint(wall, 0.35), { at: [0, s * STOREY, 0] }, 0);
  } else if (style === 1) {
    // Pinstripes: light piers up the front and sides.
    for (let x = -p.w / 2 + 0.05; x <= p.w / 2 - 0.04; x += 0.29)
      b.box(
        0.05,
        top - STOREY,
        0.03,
        tint(wall, 0.4),
        { at: [x, STOREY + (top - STOREY) / 2, p.d / 2 + 0.012] },
        0,
      );
    for (const s of [-1, 1])
      b.box(
        0.03,
        top - STOREY,
        0.05,
        tint(wall, 0.4),
        { at: [s * (p.w / 2 + 0.012), STOREY + (top - STOREY) / 2, 0] },
        0,
      );
  } else if (style === 2) {
    // A round corner of glass up the front right.
    b.cylinder(
      0.22,
      0.22,
      top - STOREY,
      0x5d7a96,
      { at: [p.w / 2 - 0.15, STOREY + (top - STOREY) / 2, p.d / 2 - 0.15] },
      16,
    );
  } else {
    // Dark glass, lit floors near the top.
    for (let s = p.storeys - 3; s < p.storeys; s++)
      glow.add(
        new THREE.PlaneGeometry(p.w * 0.9, STOREY * 0.35),
        0x9a8a60,
        {
          at: [0, s * STOREY + STOREY * 0.55, p.d / 2 + 0.008],
        },
        'glow',
      );
  }
  b.box(p.w + 0.04, 0.1, p.d + 0.04, tint(wall, 0.3), { at: [0, top + 0.05, 0] }, 0.02);
  const crown = style === 2 ? 2 : Math.floor(frac(p.variant * 17.3) * 3);
  if (crown === 0) {
    // A setback top storey with an antenna.
    b.box(p.w * 0.6, 0.3, p.d * 0.6, tint(wall, -0.1), { at: [0, top + 0.25, 0] }, 0.02);
    b.cylinder(0.015, 0.02, 0.5, C.steel, { at: [0, top + 0.6, 0] }, 6);
    blink.led(0.035, C.warn, { at: [0, top + 0.86, 0] });
  } else if (crown === 1) {
    b.box(0.3, 0.14, 0.3, C.steel, { at: [p.w * 0.2, top + 0.17, -p.d * 0.2] }, 0.02);
    b.box(0.22, 0.1, 0.22, C.steel, { at: [-p.w * 0.2, top + 0.15, p.d * 0.1] }, 0.02);
  } else {
    // A stepped crown: two tiers, a light on top.
    b.box(p.w * 0.75, 0.2, p.d * 0.75, tint(wall, 0.15), { at: [0, top + 0.2, 0] }, 0.02);
    b.box(p.w * 0.45, 0.2, p.d * 0.45, tint(wall, 0.25), { at: [0, top + 0.4, 0] }, 0.02);
    blink.led(0.035, C.warn, { at: [0, top + 0.54, 0] });
  }
}

function hq(p: CityPiece, { body: b, glow, blink }: Parts, rng: () => number): void {
  const wall = 0xe9e4f2;
  const top = p.storeys * STOREY;
  b.box(p.w, top, p.d, wall, { at: [0, top / 2, 0] }, 0.04);
  windowGrid(b, p.w, p.d, p.storeys - 1, STOREY, rng, {
    pane: 0x5d5f8a,
    litShare: 0.3,
    width: 0.2,
  });
  // Purple corner columns and a grand entrance.
  for (const s of [-1, 1])
    b.box(
      0.14,
      top + 0.1,
      0.14,
      C.purple,
      { at: [s * (p.w / 2 - 0.04), top / 2 + 0.05, p.d / 2 - 0.04] },
      0.03,
    );
  b.box(p.w * 0.5, STOREY * 1.2, 0.2, C.purple, { at: [0, STOREY * 0.6, p.d / 2 + 0.06] }, 0.03);
  b.add(new THREE.PlaneGeometry(p.w * 0.36, STOREY * 0.8), C.paneDark, {
    at: [0, STOREY * 0.45, p.d / 2 + 0.17],
  });
  b.box(p.w + 0.06, 0.12, p.d + 0.06, C.purple, { at: [0, top + 0.06, 0] }, 0.03);
  // The logo board on the roof: a white panel with a glowing purple ring and bar.
  const boardY = top + 0.12 + 0.36;
  b.box(0.06, 0.36, 0.06, C.steel, { at: [-0.45, top + 0.3, 0.1] }, 0);
  b.box(0.06, 0.36, 0.06, C.steel, { at: [0.45, top + 0.3, 0.1] }, 0);
  b.box(1.5, 0.66, 0.08, C.white, { at: [0, boardY + 0.12, 0.16] }, 0.04);
  glow.add(
    new THREE.TorusGeometry(0.18, 0.055, 8, 24),
    C.purple,
    { at: [-0.42, boardY + 0.12, 0.21] },
    'glow',
  );
  glow.add(
    new THREE.BoxGeometry(0.66, 0.12, 0.02),
    C.purple,
    { at: [0.18, boardY + 0.2, 0.21] },
    'glow',
  );
  glow.add(
    new THREE.BoxGeometry(0.44, 0.08, 0.02),
    0xc8a0ee,
    { at: [0.07, boardY + 0.02, 0.21] },
    'glow',
  );
  blink.led(0.04, C.warn, { at: [p.w * 0.4, top + 0.2, -p.d * 0.35] });
}

function fountain(p: CityPiece, { body: b }: Parts): void {
  const r = p.w / 2;
  b.cylinder(r, r + 0.04, 0.22, 0xe0d6c2, { at: [0, 0.11, 0] }, 28);
  b.cylinder(r - 0.1, r - 0.1, 0.02, C.water, { at: [0, 0.2, 0] }, 28);
  b.cylinder(0.12, 0.16, 0.42, 0xe0d6c2, { at: [0, 0.35, 0] }, 14);
  b.cylinder(0.3, 0.22, 0.08, 0xe0d6c2, { at: [0, 0.54, 0] }, 20);
  b.cylinder(0.25, 0.25, 0.02, C.water, { at: [0, 0.58, 0] }, 20);
  b.sphere(0.09, 0xbfe8f6, { at: [0, 0.68, 0] }, [1, 1.4, 1]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.sphere(0.05, 0xbfe8f6, { at: [Math.cos(a) * 0.36, 0.4, Math.sin(a) * 0.36] }, [1, 1.6, 1]);
  }
}

function planter(p: CityPiece, { body: b }: Parts): void {
  b.box(p.w, 0.26, p.d, 0xc9c6bd, { at: [0, 0.13, 0] }, 0.03);
  b.box(p.w - 0.06, 0.02, p.d - 0.06, 0x6a4a32, { at: [0, 0.26, 0] }, 0);
  b.sphere(0.2, C.leaf, { at: [0, 0.38, 0] }, [1, 0.9, 1]);
  b.sphere(0.06, 0xff6b8a, { at: [0.1, 0.5, 0.1] });
}

// ---- Big Tech campus ----

function glassTower(p: CityPiece, { body: b, shiny, glow, blink }: Parts, rng: () => number): void {
  const style = styleOf(p);
  const top = p.storeys * STOREY;
  const glass = choose([C.glass, C.glassDeep, 0x9fdcd8, 0x8fb8e0], frac(p.variant * 5.3));
  const stripe = choose([C.teal, 0x8fd0ff, 0xb8a0e8], frac(p.variant * 3.1));
  if (style === 1) {
    // Twin slabs, one taller.
    const w1 = p.w * 0.56;
    const w2 = p.w * 0.5;
    const h2 = top * 0.78;
    shiny.box(w1, top, p.d, glass, { at: [-p.w / 2 + w1 / 2, top / 2, 0] }, 0.05);
    shiny.box(
      w2,
      h2,
      p.d * 0.85,
      tint(glass, -0.1),
      { at: [p.w / 2 - w2 / 2, h2 / 2, -p.d * 0.05] },
      0.05,
    );
    curtainWall(b, glow, w1, p.d, 0, top, rng, -p.w / 2 + w1 / 2);
    b.box(w1 + 0.04, 0.08, p.d + 0.04, C.white, { at: [-p.w / 2 + w1 / 2, top + 0.04, 0] }, 0.03);
    b.box(
      w2 + 0.04,
      0.08,
      p.d * 0.85 + 0.04,
      C.white,
      { at: [p.w / 2 - w2 / 2, h2 + 0.04, -p.d * 0.05] },
      0.03,
    );
    b.sphere(0.12, C.leaf, { at: [p.w / 2 - w2 / 2, h2 + 0.14, 0] });
    if (p.storeys > 8) blink.led(0.035, C.warn, { at: [-p.w / 2 + w1 / 2, top + 0.15, 0] });
    return;
  }
  if (style === 3) {
    // A round tower with white rings.
    const g = new THREE.CylinderGeometry(0.5, 0.5, top, 28);
    g.scale(p.w, 1, p.d);
    shiny.add(g, glass, { at: [0, top / 2, 0] });
    for (let y = STOREY * 2; y < top; y += STOREY * 2) {
      const ring = new THREE.CylinderGeometry(0.505, 0.505, 0.03, 28, 1, true);
      ring.scale(p.w, 1, p.d);
      b.add(ring, C.white, { at: [0, y, 0] });
    }
    const cap = new THREE.CylinderGeometry(0.42, 0.5, 0.14, 28);
    cap.scale(p.w, 1, p.d);
    b.add(cap, C.white, { at: [0, top + 0.07, 0] });
    if (p.storeys > 8) blink.led(0.035, C.warn, { at: [0, top + 0.2, 0] });
    return;
  }
  shiny.box(p.w, top, p.d, glass, { at: [0, top / 2, 0] }, 0.06);
  curtainWall(b, glow, p.w, p.d, 0, top, rng);
  b.box(p.w + 0.04, 0.08, p.d + 0.04, C.white, { at: [0, top + 0.04, 0] }, 0.03);
  if (style === 0) {
    // A white roof deck, a stripe up one corner.
    b.box(p.w * 0.5, 0.16, p.d * 0.5, C.white, { at: [0, top + 0.16, 0] }, 0.03);
    b.box(0.08, top, 0.08, stripe, { at: [p.w / 2 - 0.02, top / 2, p.d / 2 - 0.02] }, 0.02);
  } else {
    // A roof garden with trees and a glowing band under it.
    b.box(p.w - 0.1, 0.06, p.d - 0.1, 0x7cc653, { at: [0, top + 0.1, 0] }, 0.02);
    for (const [x, z] of [
      [-0.25, -0.2],
      [0.2, 0.1],
      [-0.05, 0.25],
    ] as const)
      b.sphere(0.1, C.leaf, { at: [x * p.w, top + 0.2, z * p.d] });
    glow.add(
      new THREE.PlaneGeometry(p.w * 0.95, 0.06),
      stripe,
      { at: [0, top - 0.1, p.d / 2 + 0.012] },
      'glow',
    );
  }
  if (p.storeys > 8) blink.led(0.035, C.warn, { at: [0, top + 0.28, 0] });
}

/**
 * White mullions up a glass box's front and sides, a floor line every few
 * storeys, and here and there a lit floor glowing through the glass.
 */
function curtainWall(
  b: ModelBuilder,
  glow: ModelBuilder,
  w: number,
  d: number,
  y0: number,
  y1: number,
  rng: () => number,
  cx = 0,
): void {
  const h = y1 - y0;
  const faces: { len: number; at: (u: number) => [number, number]; yaw: number }[] = [
    { len: w, at: (u) => [cx + u, d / 2 + 0.008], yaw: 0 },
    { len: d, at: (u) => [cx + w / 2 + 0.008, -u], yaw: Math.PI / 2 },
    { len: d, at: (u) => [cx - w / 2 - 0.008, u], yaw: -Math.PI / 2 },
  ];
  for (const face of faces) {
    const n = Math.max(2, Math.round(face.len / 0.32));
    for (let i = 1; i < n; i++) {
      const [x, z] = face.at(-face.len / 2 + (face.len * i) / n);
      b.box(0.025, h, 0.025, C.white, { at: [x, y0 + h / 2, z], rot: [0, face.yaw, 0] }, 0);
    }
    for (let y = y0 + STOREY * 3; y < y1 - 0.1; y += STOREY * 3) {
      const [x, z] = face.at(0);
      b.box(face.len, 0.03, 0.025, C.white, { at: [x, y, z], rot: [0, face.yaw, 0] }, 0);
    }
    for (let y = y0 + STOREY * 0.5; y < y1 - STOREY; y += STOREY) {
      if (rng() > 0.18) continue;
      const [x, z] = face.at((rng() - 0.5) * face.len * 0.4);
      glow.add(
        new THREE.PlaneGeometry(face.len * 0.45, STOREY * 0.45),
        0x9a8a60,
        {
          at: [
            x - (face.yaw === 0 ? 0 : Math.sign(x - cx) * 0.004),
            y,
            z + (face.yaw === 0 ? 0.004 : 0),
          ],
          rot: [0, face.yaw, 0],
        },
        'glow',
      );
    }
  }
}

/** The ring-shaped HQ: a glass doughnut round a lawn courtyard with a tree. */
function campus(p: CityPiece, { body: b, shiny, glow }: Parts): void {
  const h = p.storeys * STOREY;
  const outer = 0.5;
  const inner = 0.3;
  const ring = new THREE.LatheGeometry(
    [
      new THREE.Vector2(inner, 0),
      new THREE.Vector2(outer, 0),
      new THREE.Vector2(outer, h),
      new THREE.Vector2(inner, h),
      new THREE.Vector2(inner, 0),
    ],
    48,
  );
  ring.scale(p.w, 1, p.d);
  shiny.add(ring, C.glass, {});
  // Roof: a white rim, a green roof ring.
  const roof = new THREE.RingGeometry(inner * 0.98, outer * 1.02, 48).rotateX(-Math.PI / 2);
  roof.scale(p.w, 1, p.d);
  b.add(roof, C.white, { at: [0, h + 0.01, 0] });
  const garden = new THREE.RingGeometry(inner * 1.12, outer * 0.9, 48).rotateX(-Math.PI / 2);
  garden.scale(p.w, 1, p.d);
  b.add(garden, 0x7cc653, { at: [0, h + 0.02, 0] });
  for (let s = 1; s < p.storeys; s++) {
    const band = new THREE.CylinderGeometry(outer + 0.004, outer + 0.004, 0.03, 48, 1, true);
    band.scale(p.w, 1, p.d);
    b.add(band, C.white, { at: [0, s * STOREY, 0] });
  }
  // The courtyard lawn and its tree.
  const lawn = new THREE.CircleGeometry(inner, 40).rotateX(-Math.PI / 2);
  lawn.scale(p.w, 1, p.d);
  b.add(lawn, 0x86d05a, { at: [0, 0.02, 0] });
  b.cylinder(0.05, 0.07, 0.4, C.trunk, { at: [0, 0.2, 0] }, 8);
  b.sphere(0.3, C.leaf, { at: [0, 0.6, 0] });
  // A glowing teal logo dot on the front.
  glow.add(
    new THREE.CircleGeometry(0.16, 24),
    C.teal,
    { at: [0, h * 0.62, p.d * outer + 0.02] },
    'glow',
  );
}

const SPIRE = 0.9;

function skyscraper(p: CityPiece, { body: b, shiny, glow, blink }: Parts, rng: () => number): void {
  // Three tiers stepping in, glass with white fins, a teal crown and a spire.
  const total = p.storeys * STOREY;
  const tiers = [
    { share: 0.45, scale: 1 },
    { share: 0.33, scale: 0.8 },
    { share: 0.22, scale: 0.6 },
  ];
  let y = 0;
  for (const tier of tiers) {
    const h = total * tier.share;
    const w = p.w * tier.scale;
    const d = p.d * tier.scale;
    shiny.box(w, h, d, C.glass, { at: [0, y + h / 2, 0] }, 0.12 * tier.scale);
    curtainWall(b, glow, w, d, y, y + h, rng);
    b.box(w + 0.06, 0.08, d + 0.06, C.teal, { at: [0, y + h, 0] }, 0.03);
    y += h;
  }
  // The crown: a glowing teal band and the spire.
  glow.add(
    new THREE.CylinderGeometry(p.w * 0.25, p.w * 0.25, 0.14, 24, 1, true),
    C.teal,
    { at: [0, y + 0.18, 0] },
    'glow',
  );
  b.cylinder(p.w * 0.22, p.w * 0.27, 0.3, C.white, { at: [0, y + 0.15, 0] }, 24);
  b.cone(0.1, SPIRE, C.white, { at: [0, y + 0.3 + SPIRE / 2, 0] }, 12);
  blink.led(0.07, C.warn, { at: [0, y + 0.3 + SPIRE + 0.04, 0] });
  // A big lit logo dot near the top.
  glow.add(
    new THREE.CircleGeometry(0.22, 28),
    C.teal,
    { at: [0, y - 0.5, (p.d * 0.6) / 2 + 0.02] },
    'glow',
  );
}

function helipad(p: CityPiece, { body: b, glow }: Parts): void {
  const r = p.w / 2;
  b.cylinder(r, r, 0.06, 0x4a505c, { at: [0, 0.03, 0] }, 32);
  b.add(new THREE.RingGeometry(r * 0.72, r * 0.8, 32).rotateX(-Math.PI / 2), 0xffc83d, {
    at: [0, 0.065, 0],
  });
  // The H.
  for (const x of [-0.14, 0.14]) b.box(0.07, 0.01, 0.4, C.white, { at: [x, 0.065, 0] }, 0);
  b.box(0.28, 0.01, 0.07, C.white, { at: [0, 0.065, 0] }, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    glow.led(0.03, 0x9fff8a, { at: [Math.cos(a) * (r - 0.06), 0.08, Math.sin(a) * (r - 0.06)] });
  }
  // The founders' helicopter, parked across the H.
  const yaw = 0.7;
  const turn = (x: number, z: number): [number, number] => [
    x * Math.cos(yaw) + z * Math.sin(yaw),
    -x * Math.sin(yaw) + z * Math.cos(yaw),
  ];
  const put = (x: number, y: number, z: number): [number, number, number] => {
    const [tx, tz] = turn(x, z);
    return [tx, y, tz];
  };
  const rot: [number, number, number] = [0, yaw, 0];
  for (const x of [-0.13, 0.13]) {
    b.box(0.03, 0.03, 0.5, C.ink, { at: put(x, 0.09, 0), rot }, 0);
    for (const z of [-0.12, 0.12]) b.box(0.02, 0.1, 0.02, C.ink, { at: put(x, 0.14, z), rot }, 0);
  }
  b.sphere(0.2, C.teal, { at: put(0, 0.3, 0.02), rot }, [0.9, 0.85, 1.25]);
  b.sphere(0.13, C.paneDark, { at: put(0, 0.33, 0.13), rot }, [1.05, 0.8, 1]);
  b.box(0.07, 0.07, 0.55, C.teal, { at: put(0, 0.34, -0.42), rot }, 0.02);
  b.box(0.03, 0.18, 0.1, C.teal, { at: put(0, 0.44, -0.66), rot }, 0.01);
  b.box(0.12, 0.012, 0.03, C.ink, { at: put(0.04, 0.44, -0.66), rot }, 0);
  b.cylinder(0.025, 0.025, 0.1, C.ink, { at: put(0, 0.52, 0) }, 8);
  for (const a of [0.3, 0.3 + Math.PI / 2]) {
    b.box(1.1, 0.012, 0.06, C.ink, { at: put(0, 0.57, 0), rot: [0, yaw + a, 0] }, 0);
  }
}

function hedge(p: CityPiece, { body: b }: Parts): void {
  b.box(p.w, p.h, p.d, C.leafDark, { at: [0, p.h / 2, 0] }, 0.1);
}

// ---- Trees (instanced and swaying, see `treeModel`) ----

/** How tall each tree kind's model stands, so the cityscape scales it to the piece. */
export const TREE_HEIGHT: Readonly<Record<TreeKind, number>> = {
  tree: 1.75,
  roundTree: 1.35,
  pine: 1.9,
  birch: 1.75,
  palm: 1.9,
  bush: 0.45,
};

/** A tree's geometry, built once and instanced per kind. */
export function treeModel(kind: TreeKind): ModelBuilder {
  const b = new ModelBuilder();
  // Low-poly leaves: there are a lot of trees, and the facets suit the toy look.
  const leaves = (r: number, color: number, at: [number, number, number], sy = 1): void => {
    b.add(new THREE.SphereGeometry(r, 9, 7).scale(1, sy, 1), color, { at });
  };
  if (kind === 'tree') {
    b.cylinder(0.08, 0.11, 0.8, C.trunk, { at: [0, 0.4, 0] }, 7);
    leaves(0.42, C.leaf, [0, 1.05, 0], 0.9);
    leaves(0.3, C.leafLight, [0.2, 1.33, 0.12]);
    leaves(0.28, C.leaf, [-0.22, 1.28, -0.1]);
  } else if (kind === 'roundTree') {
    b.cylinder(0.05, 0.07, 0.7, C.trunk, { at: [0, 0.35, 0] }, 7);
    leaves(0.32, C.leafLight, [0, 1.0, 0]);
  } else if (kind === 'pine') {
    b.cylinder(0.05, 0.08, 0.5, C.trunk, { at: [0, 0.25, 0] }, 6);
    for (const [y, r] of [
      [0.65, 0.4],
      [1.05, 0.32],
      [1.45, 0.22],
    ] as const)
      b.cone(r, 0.6, C.leafDark, { at: [0, y, 0] }, 8);
  } else if (kind === 'birch') {
    b.cylinder(0.035, 0.05, 1.2, 0xece6da, { at: [0, 0.6, 0] }, 7);
    for (const y of [0.3, 0.55, 0.8]) b.box(0.06, 0.02, 0.1, C.ink, { at: [0, y, 0.02] }, 0);
    leaves(0.26, 0x8cc65a, [0, 1.4, 0], 1.35);
    leaves(0.18, 0x9ad06a, [0.14, 1.2, 0.06]);
  } else if (kind === 'palm') {
    // A gently curving trunk and a crown of drooping fronds.
    for (let i = 0; i < 5; i++)
      b.cylinder(
        0.045 - i * 0.004,
        0.055 - i * 0.004,
        0.34,
        0x9a7a52,
        { at: [i * i * 0.012, 0.17 + i * 0.32, 0], rot: [0, 0, -i * 0.05] },
        7,
      );
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      b.box(
        0.5,
        0.02,
        0.12,
        k % 2 ? C.leaf : C.leafDark,
        {
          at: [0.2 + Math.cos(a) * 0.22, 1.66, Math.sin(a) * 0.22],
          rot: [0, -a, -0.45],
        },
        0,
      );
    }
  } else {
    leaves(0.22, C.leaf, [-0.08, 0.17, 0], 0.8);
    leaves(0.18, C.leafLight, [0.14, 0.15, 0.07], 0.8);
    leaves(0.045, 0xff6b8a, [0.07, 0.31, 0.14]);
    leaves(0.045, 0xffd166, [-0.14, 0.33, 0.07]);
  }
  return b;
}

// ---- Engineering ----

/** Status LEDs on a server: mostly green, some blue, now and then an amber one. */
const LED_COLORS = [0x5fe08a, 0x5fe08a, 0x5fe08a, 0x7fd8ff, 0xffc23d];

/** An outdoor server cabinet: dark, with vents, a row of servers and their LEDs behind the door glass. */
function serverRack(p: CityPiece, { body: b, glow, blink }: Parts, rng: () => number): void {
  const style = styleOf(p);
  const h = p.h;
  const z = p.d / 2;
  const shell = choose([0x2c3340, 0x3a3a44, 0x2c3a3a, 0x3d4250], frac(p.variant * 6.1));
  b.box(p.w, h, p.d, shell, { at: [0, h / 2, 0] }, 0.03);
  b.box(p.w + 0.03, 0.04, p.d + 0.03, 0x4a5262, { at: [0, h + 0.02, 0] }, 0.01);
  b.box(p.w + 0.02, 0.06, p.d + 0.02, 0x1d222b, { at: [0, 0.03, 0] }, 0);
  // Servers behind the door, each with a little row of LEDs.
  const units = Math.max(3, Math.round((h - 0.2) / 0.13));
  for (let u = 0; u < units; u++) {
    const y = 0.16 + u * ((h - 0.28) / (units - 1));
    b.box(p.w - 0.1, 0.07, 0.01, 0x3d4657, { at: [0, y, z + 0.006] }, 0);
    for (let k = 0; k < 3; k++) {
      glow.led(0.016, choose(LED_COLORS, rng()), {
        at: [-p.w / 2 + 0.1 + k * 0.05, y, z + 0.014],
      });
    }
  }
  // Vent slats on the side.
  for (let k = 0; k < 4; k++)
    b.box(0.01, 0.03, p.d * 0.6, 0x1d222b, { at: [p.w / 2 + 0.004, h * 0.55 + k * 0.06, 0] }, 0);
  if (style === 1) {
    // A fan on top, and cable trunking down into the ground.
    b.cylinder(0.12, 0.12, 0.05, C.steel, { at: [0, h + 0.06, 0] }, 14);
    b.cylinder(0.09, 0.09, 0.01, C.ink, { at: [0, h + 0.09, 0] }, 14);
    b.box(0.06, h * 0.7, 0.06, 0x4a5262, { at: [-p.w / 2 - 0.04, h * 0.35, -p.d * 0.2] }, 0);
  } else if (style === 2) {
    // A little antenna whip and a solar panel.
    b.cylinder(0.006, 0.008, 0.35, C.steel, { at: [-p.w * 0.3, h + 0.2, 0] }, 5);
    b.box(p.w * 0.8, 0.02, p.d * 0.7, 0x2b3a5a, { at: [0.02, h + 0.08, 0], rot: [-0.35, 0, 0] }, 0);
  }
  // The light on top that blinks with the cranes'.
  blink.led(0.03, 0x5fe08a, { at: [p.w * 0.3, h + 0.07, 0] });
}

/** A satellite dish on a short post (or on an equipment hut), its bowl turned up toward the sky and the camera. */
function dish(p: CityPiece, { body: b, glow }: Parts): void {
  const hut = styleOf(p) === 1;
  if (hut) {
    b.box(0.42, 0.3, 0.36, 0xc9c6bd, { at: [0, 0.15, 0] }, 0.02);
    b.box(0.12, 0.2, 0.02, C.ink, { at: [0.1, 0.1, 0.19] }, 0);
    glow.led(0.02, 0x5fe08a, { at: [-0.12, 0.24, 0.185] });
  } else b.box(0.22, 0.06, 0.22, C.concrete, { at: [0, 0.03, 0] }, 0.01);
  const base = hut ? 0.3 : 0;
  b.cylinder(0.025, 0.03, hut ? 0.2 : 0.4, C.steel, { at: [0, base + (hut ? 0.1 : 0.26), 0] }, 8);
  // Which way the bowl faces: up and toward the camera, a little more or less per dish.
  const tilt = 0.75 + frac(p.variant * 7) * 0.35;
  const size = hut ? 0.75 : 1;
  const y0 = hut ? base + 0.26 : 0.5;
  const face = (k: number): [number, number, number] => [
    0,
    y0 + Math.cos(tilt) * k,
    Math.sin(tilt) * k,
  ];
  const rot: [number, number, number] = [tilt, 0, 0];
  b.cylinder(0.3 * size, 0.07 * size, 0.12 * size, C.white, { at: face(0), rot }, 20);
  b.cylinder(0.25 * size, 0.25 * size, 0.01, 0xc9d0da, { at: face(0.062 * size), rot }, 20);
  // The feed on its arm, out in front of the bowl.
  b.cylinder(0.012, 0.012, 0.24 * size, C.steel, { at: face(0.18 * size), rot }, 6);
  glow.led(0.03, 0x7fd8ff, { at: face(0.3 * size) });
}

/** A radio mast: a tapering steel tower with antenna panels and a blinking light on top. */
function antenna(p: CityPiece, { body: b, blink }: Parts): void {
  const h = p.h;
  b.box(0.36, 0.08, 0.36, C.concrete, { at: [0, 0.04, 0] }, 0.01);
  if (styleOf(p) === 1) {
    // A monopole: one tapering mast with two rings of panels and a dish.
    b.cylinder(0.025, 0.05, h, 0xb8bec6, { at: [0, h / 2, 0] }, 10);
    for (const y of [h - 0.25, h - 0.6]) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + y;
        b.box(
          0.06,
          0.2,
          0.025,
          C.white,
          { at: [Math.sin(a) * 0.07, y, Math.cos(a) * 0.07], rot: [0, a, 0] },
          0.01,
        );
      }
    }
    b.cylinder(0.08, 0.02, 0.04, C.white, { at: [0, h * 0.5, 0.06], rot: [Math.PI / 2, 0, 0] }, 12);
    blink.led(0.04, C.warn, { at: [0, h + 0.04, 0] });
    return;
  }
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    // Each leg leans in toward the top.
    b.cylinder(
      0.012,
      0.02,
      h,
      C.steel,
      {
        at: [x * 0.07, h / 2, z * 0.07],
        rot: [z * 0.05, 0, -x * 0.05],
      },
      6,
    );
  }
  for (let y = 0.3; y < h - 0.2; y += 0.28) {
    const s = 0.2 - (y / h) * 0.12;
    b.box(s, 0.015, 0.015, C.steel, { at: [0, y, s / 2] }, 0);
    b.box(0.015, 0.015, s, C.steel, { at: [s / 2, y, 0] }, 0);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    b.box(
      0.07,
      0.22,
      0.03,
      C.white,
      {
        at: [Math.sin(a) * 0.09, h - 0.3, Math.cos(a) * 0.09],
        rot: [0, a, 0],
      },
      0.01,
    );
  }
  b.cylinder(0.008, 0.01, 0.25, C.steel, { at: [0, h + 0.1, 0] }, 6);
  blink.led(0.04, C.warn, { at: [0, h + 0.24, 0] });
}

// ---- More engineering and street furniture ----

/** Solar panels tilted to the sky on a low frame, two or three across. */
function solar(p: CityPiece, { body: b }: Parts): void {
  const n = styleOf(p) === 0 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    const x = -p.w / 2 + (p.w / n) * (i + 0.5);
    b.box(p.w / n - 0.04, 0.025, p.d * 0.8, 0x2b3a5a, { at: [x, 0.22, 0], rot: [-0.5, 0, 0] }, 0);
    b.box(p.w / n - 0.04, 0.03, 0.01, 0x8aa0c0, { at: [x, 0.22, 0], rot: [-0.5, 0, 0] }, 0);
  }
  for (const x of [-p.w / 2 + 0.05, p.w / 2 - 0.05]) {
    b.box(0.03, 0.3, 0.03, C.steel, { at: [x, 0.15, -p.d * 0.25] }, 0);
    b.box(0.03, 0.12, 0.03, C.steel, { at: [x, 0.06, p.d * 0.25] }, 0);
  }
}

/** A cooling unit: a box with a big fan on top, or two fans side by side. */
function cooling(p: CityPiece, { body: b, glow }: Parts): void {
  const twin = styleOf(p) === 1;
  b.box(p.w, p.h - 0.05, p.d, 0xc9ccd2, { at: [0, (p.h - 0.05) / 2, 0] }, 0.03);
  for (let i = 0; i < 6; i++)
    b.box(p.w - 0.08, 0.012, 0.01, 0x8b939e, { at: [0, 0.08 + i * 0.05, p.d / 2 + 0.004] }, 0);
  const fans = twin ? [-p.w * 0.24, p.w * 0.24] : [0];
  for (const x of fans) {
    b.cylinder(twin ? 0.12 : 0.18, twin ? 0.12 : 0.18, 0.04, C.ink, { at: [x, p.h - 0.04, 0] }, 16);
    b.box(twin ? 0.2 : 0.3, 0.01, 0.03, C.steel, { at: [x, p.h - 0.015, 0] }, 0);
  }
  glow.led(0.018, 0x5fe08a, { at: [p.w / 2 - 0.06, p.h - 0.12, p.d / 2 + 0.006] });
}

/** A cable spool on its side, wound in network cable. */
function spool(p: CityPiece, { body: b }: Parts): void {
  const cable = choose([0x3f7fe0, 0xffc83d, 0x8a5ad8, 0x2fb8b0], frac(p.variant * 4.7));
  for (const z of [-0.1, 0.1])
    b.cylinder(0.16, 0.16, 0.03, 0xb5824f, { at: [0, 0.16, z], rot: [Math.PI / 2, 0, 0] }, 16);
  b.cylinder(0.12, 0.12, 0.18, cable, { at: [0, 0.16, 0], rot: [Math.PI / 2, 0, 0] }, 16);
  b.box(0.012, 0.012, 0.3, cable, { at: [0.08, 0.02, 0.2], rot: [0, 0.4, 0] }, 0);
}

/** A landing pad with a delivery drone sitting on it, a parcel underneath. */
function dronePad(p: CityPiece, { body: b, glow }: Parts): void {
  const r = p.w / 2;
  b.cylinder(r, r, 0.03, 0x4a505c, { at: [0, 0.015, 0] }, 20);
  b.add(new THREE.RingGeometry(r * 0.7, r * 0.8, 20).rotateX(-Math.PI / 2), 0xffc83d, {
    at: [0, 0.032, 0],
  });
  b.box(0.1, 0.07, 0.1, 0xc8955a, { at: [0, 0.07, 0] }, 0.01);
  b.box(0.14, 0.05, 0.14, C.white, { at: [0, 0.13, 0] }, 0.02);
  for (const a of [0.785, 2.356, 3.927, 5.498]) {
    b.box(
      0.14,
      0.012,
      0.02,
      C.ink,
      { at: [Math.cos(a) * 0.08, 0.15, Math.sin(a) * 0.08], rot: [0, -a, 0] },
      0,
    );
    b.cylinder(
      0.05,
      0.05,
      0.008,
      0xc9ccd2,
      { at: [Math.cos(a) * 0.15, 0.165, Math.sin(a) * 0.15] },
      12,
    );
  }
  glow.led(0.015, 0x7fd8ff, { at: [0, 0.16, 0.07] });
}

/** A six-wheeled delivery robot with a flag on a whip. */
function robot(p: CityPiece, { body: b, glow }: Parts): void {
  b.box(p.w, 0.12, p.d, C.white, { at: [0, 0.1, 0] }, 0.03);
  b.box(p.w * 0.9, 0.03, p.d * 0.9, 0x4a505c, { at: [0, 0.17, 0] }, 0.01);
  for (const x of [-1, 1])
    for (const z of [-1, 0, 1])
      b.cylinder(
        0.03,
        0.03,
        0.02,
        C.ink,
        { at: [x * p.w * 0.5, 0.035, z * p.d * 0.35], rot: [0, 0, Math.PI / 2] },
        8,
      );
  glow.led(0.012, 0x7fd8ff, { at: [0, 0.12, p.d / 2 + 0.003] });
  b.cylinder(0.004, 0.004, 0.25, C.ink, { at: [-p.w * 0.3, 0.3, -p.d * 0.35] }, 4);
  b.box(0.06, 0.04, 0.004, 0xff8a3d, { at: [-p.w * 0.3 + 0.03, 0.41, -p.d * 0.35] }, 0);
}

/** An EV charger post with its cable and a glowing ring. */
function evCharger(p: CityPiece, { body: b, glow }: Parts): void {
  b.box(p.w, p.h, p.d * 0.7, 0xe8e4da, { at: [0, p.h / 2, 0] }, 0.03);
  b.box(p.w * 0.7, 0.12, 0.01, C.ink, { at: [0, p.h * 0.7, p.d * 0.35 + 0.005] }, 0);
  glow.add(
    new THREE.RingGeometry(0.035, 0.05, 16),
    0x5fe08a,
    { at: [0, p.h * 0.45, p.d * 0.35 + 0.008] },
    'glow',
  );
  b.torus(0.06, 0.012, C.ink, { at: [p.w / 2 + 0.02, p.h * 0.35, 0], rot: [0, Math.PI / 2, 0] });
}

/** A garden shed: plank walls, a shed or a gable roof. */
function shed(p: CityPiece, { body: b }: Parts): void {
  const wall = choose([0x8a7a6a, 0x6a8a8a, 0xb59a6a, 0x8a6a6a], frac(p.variant * 3.3));
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
    b.add(prism(p.w + 0.08, p.d + 0.1, p.h - wallH), 0x5a4a48, { at: [0, wallH - 0.01, 0] });
  } else {
    b.box(
      p.w + 0.08,
      0.04,
      p.d + 0.12,
      0x4a5a5a,
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
function bin(p: CityPiece, { body: b }: Parts): void {
  const style = styleOf(p);
  const c = choose([0x4a5a4a, 0x4a505c, 0x5a4a48], frac(p.variant * 5.1));
  if (style === 0) {
    b.cylinder(p.w / 2, p.w / 2 - 0.02, p.h, c, { at: [0, p.h / 2, 0] }, 12);
    b.cylinder(p.w / 2 + 0.01, p.w / 2 + 0.01, 0.03, tint(c, 0.25), { at: [0, p.h, 0] }, 12);
  } else if (style === 1) {
    b.box(p.w, p.h, p.w, c, { at: [0, p.h / 2, 0] }, 0.02);
    b.box(p.w + 0.02, 0.04, p.w + 0.02, tint(c, 0.25), { at: [0, p.h + 0.01, 0] }, 0.01);
  } else {
    for (const [x, col] of [
      [-0.06, 0x3f7fe0],
      [0.06, 0x4fbf74],
    ] as const) {
      b.box(0.11, p.h, 0.16, tint(col, -0.35), { at: [x, p.h / 2, 0] }, 0.02);
    }
  }
}

function hydrant(_p: CityPiece, { body: b }: Parts): void {
  const red = 0xd9483f;
  b.cylinder(0.06, 0.07, 0.22, red, { at: [0, 0.11, 0] }, 10);
  b.sphere(0.06, red, { at: [0, 0.23, 0] }, [1, 0.7, 1]);
  for (const s of [-1, 1])
    b.cylinder(0.025, 0.025, 0.05, red, { at: [s * 0.07, 0.15, 0], rot: [0, 0, Math.PI / 2] }, 8);
  b.cylinder(0.08, 0.08, 0.03, tint(red, -0.3), { at: [0, 0.015, 0] }, 10);
}

/** A bus shelter: glass back, a bench, a roof, a timetable screen. */
function busStop(p: CityPiece, { body: b, shiny, glow }: Parts): void {
  const roof = choose([0x2b2f38, 0x4f7f6a, 0x3f5f8a], frac(p.variant * 3.9));
  b.box(p.w, 0.04, p.d, roof, { at: [0, p.h, 0] }, 0.01);
  for (const x of [-p.w / 2 + 0.03, p.w / 2 - 0.03])
    b.box(0.03, p.h, 0.03, C.ink, { at: [x, p.h / 2, -p.d / 2 + 0.04] }, 0);
  shiny.box(p.w - 0.08, p.h * 0.75, 0.015, C.glass, { at: [0, p.h * 0.45, -p.d / 2 + 0.04] }, 0);
  b.box(p.w * 0.6, 0.03, 0.12, 0xb5824f, { at: [-p.w * 0.1, 0.16, -p.d / 2 + 0.12] }, 0);
  if (styleOf(p) === 0) {
    b.box(0.18, 0.3, 0.03, C.ink, { at: [p.w / 2 - 0.15, 0.3, -p.d / 2 + 0.06] }, 0);
    glow.screen(0.15, 0.26, 0x7fd8ff, { at: [p.w / 2 - 0.15, 0.3, -p.d / 2 + 0.077] });
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
      0x3f7fe0,
      { at: [p.w / 2 + 0.05, p.h + 0.05, p.d / 2], rot: [Math.PI / 2, 0, 0] },
      14,
    );
  }
}

/** A bike rack with two or three bikes in it. */
function bikeRack(p: CityPiece, { body: b }: Parts): void {
  b.box(p.w, 0.02, 0.03, C.steel, { at: [0, 0.18, -p.d * 0.3] }, 0);
  const n = 2 + Math.floor(frac(p.variant * 5) * 2);
  for (let i = 0; i < n; i++) {
    const x = -p.w / 2 + 0.12 + i * ((p.w - 0.24) / Math.max(1, n - 1));
    const frame = choose(
      [0xe8483f, 0x3f7fe0, 0x4fbf74, 0xf4f1ea, 0x8a5ad8],
      frac(p.variant * 7 + i * 0.29),
    );
    for (const z of [-0.12, 0.12])
      b.torus(0.08, 0.012, C.ink, { at: [x, 0.09, z], rot: [0, Math.PI / 2, 0] });
    b.box(0.018, 0.018, 0.24, frame, { at: [x, 0.15, 0], rot: [0.25, 0, 0] }, 0);
    b.box(0.018, 0.1, 0.018, frame, { at: [x, 0.17, 0.05] }, 0);
  }
}

/** A food truck: coffee, ice cream or tacos, with its hatch open. */
function foodTruck(p: CityPiece, { body: b, glow }: Parts): void {
  const style = styleOf(p);
  const body = choose([0xf4f1ea, 0xffc83d, 0x9fd0e8], style / 3 + 0.01);
  const trim = choose([0xe8483f, 0x4f7f6a, 0x8a5ad8], frac(p.variant * 3.3));
  b.box(p.w * 0.72, p.h * 0.75, p.d, body, { at: [-p.w * 0.14, 0.1 + p.h * 0.375, 0] }, 0.04);
  b.box(p.w * 0.26, p.h * 0.5, p.d * 0.95, body, { at: [p.w * 0.36, 0.1 + p.h * 0.25, 0] }, 0.04);
  b.box(0.02, p.h * 0.2, p.d * 0.7, C.paneDark, { at: [p.w * 0.49, 0.1 + p.h * 0.35, 0] }, 0);
  b.box(p.w * 0.73, 0.05, p.d + 0.01, trim, { at: [-p.w * 0.14, 0.14, 0] }, 0);
  glow.screen(p.w * 0.4, p.h * 0.25, 0xffe2a8, {
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
    b.cylinder(0.075, 0.075, 0.015, 0x7a5236, { at: [-p.w * 0.2, roofY + 0.14, 0] }, 12);
  } else if (style === 1) {
    b.cone(0.07, 0.16, 0xe8c070, { at: [-p.w * 0.2, roofY + 0.08, 0], rot: [Math.PI, 0, 0] }, 10);
    b.sphere(0.07, 0xf4a7c0, { at: [-p.w * 0.2, roofY + 0.18, 0] });
  } else {
    b.box(0.2, 0.08, 0.1, 0xd8a050, { at: [-p.w * 0.2, roofY + 0.05, 0] }, 0.04);
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

/** Each kind's model; trees are instanced instead (see `treeModel`). */
const MODELS: Record<PieceKind, ((p: CityPiece, parts: Parts, rng: () => number) => void) | null> =
  {
    house: house,
    garage: garage,
    fence: fence,
    mailbox: mailbox,
    bike: bike,
    warehouse: warehouse,
    cowork: cowork,
    kiosk: kiosk,
    scooter: scooter,
    bench: bench,
    pingPong: pingPong,
    picnic: picnic,
    office: office,
    crane: crane,
    lamp: lamp,
    car: car,
    tower: tower,
    hq: hq,
    fountain: fountain,
    planter: planter,
    glassTower: glassTower,
    campus: campus,
    skyscraper: skyscraper,
    helipad: helipad,
    hedge: hedge,
    serverRack: serverRack,
    dish: dish,
    antenna: antenna,
    solar: solar,
    cooling: cooling,
    spool: spool,
    dronePad: dronePad,
    robot: robot,
    evCharger: evCharger,
    shed: shed,
    bin: bin,
    hydrant: hydrant,
    busStop: busStop,
    bikeRack: bikeRack,
    foodTruck: foodTruck,
    tree: null,
    roundTree: null,
    pine: null,
    birch: null,
    palm: null,
    bush: null,
  };

/** Builds piece `p`'s model into `builders`, in the piece's own frame. */
export function buildPiece(p: CityPiece, builders: PieceBuilders): void {
  const rng = seeded(Math.floor(p.variant * 1e9));
  const parts: Parts = { ...builders, glow: builders.body };
  MODELS[p.kind]?.(p, parts, rng);
}
