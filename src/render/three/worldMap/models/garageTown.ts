import * as THREE from 'three';
import { tint } from '../../kit';
import { type CityPiece, styleOf } from '../cityPlan';
import { C, choose, DOORS, frac, HOUSE_ROOFS, HOUSE_WALLS, type Parts, prism } from './shared';

/** Garage town: houses, the founders' garage and what stands round them. */

export function house(p: CityPiece, { body: b, glow }: Parts, rng: () => number): void {
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
    // A shed roof rising to the street, a strip of high windows under its tall front edge.
    const shape = new THREE.Shape();
    shape.moveTo(-(p.d + 0.16) / 2, 0);
    shape.lineTo((p.d + 0.16) / 2, 0);
    shape.lineTo(-(p.d + 0.16) / 2, rh * 0.85);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: hw + 0.1, bevelEnabled: false });
    g.translate(0, 0, -(hw + 0.1) / 2);
    // A quarter turn takes the shape's −x (the tall edge) to +z, the front.
    g.rotateY(Math.PI / 2);
    b.add(g, wall, { at: [hx, wallH - 0.01, 0] });
    b.box(
      hw + 0.14,
      0.04,
      Math.hypot(p.d + 0.16, rh * 0.85) + 0.02,
      roof,
      {
        at: [hx, wallH + rh * 0.425, 0],
        rot: [-Math.atan2(rh * 0.85, p.d + 0.16), 0, 0],
      },
      0.01,
    );
    b.add(new THREE.PlaneGeometry(hw * 0.7, 0.12), C.pane, {
      at: [hx, wallH + rh * 0.4, (p.d + 0.16) / 2 + 0.005],
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

export function garage(p: CityPiece, { body: b, glow }: Parts): void {
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

export function fence(p: CityPiece, { body: b }: Parts): void {
  for (const y of [0.1, 0.22]) b.box(p.w, 0.035, 0.03, C.white, { at: [0, y, 0] }, 0);
  const n = Math.max(2, Math.round(p.w / 0.13));
  for (let i = 0; i <= n; i++) {
    const x = -p.w / 2 + (i * p.w) / n;
    b.box(0.045, p.h, 0.035, C.white, { at: [x, p.h / 2, 0.02] }, 0);
  }
}

export function mailbox(_p: CityPiece, { body: b }: Parts): void {
  b.box(0.05, 0.42, 0.05, 0x8a6448, { at: [0, 0.21, 0] }, 0);
  b.box(0.16, 0.14, 0.24, 0x3f7fe0, { at: [0, 0.48, 0] }, 0.05);
  b.box(0.02, 0.12, 0.04, 0xe8483f, { at: [0.09, 0.56, -0.04] }, 0);
}

export function bike(_p: CityPiece, { body: b }: Parts): void {
  for (const z of [-0.2, 0.2])
    b.torus(0.12, 0.018, C.ink, { at: [0, 0.13, z], rot: [0, Math.PI / 2, 0] });
  b.box(0.025, 0.025, 0.4, 0xe8483f, { at: [0, 0.22, 0], rot: [0.25, 0, 0] }, 0);
  b.box(0.025, 0.18, 0.025, 0xe8483f, { at: [0, 0.24, 0.08] }, 0);
  b.box(0.05, 0.025, 0.1, C.ink, { at: [0, 0.33, 0.07] }, 0);
  b.box(0.22, 0.02, 0.02, C.steel, { at: [0, 0.33, -0.17] }, 0);
}
