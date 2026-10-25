import * as THREE from 'three';
import { ModelBuilder, tint } from '../../kit';
import { type CityPiece, STOREY, styleOf } from '../cityPlan';
import { C, choose, frac, type Parts } from './shared';

/** Big Tech campus: glass towers, the ring HQ, the skyscraper and the helipad. */

export function glassTower(
  p: CityPiece,
  { body: b, shiny, glow, blink }: Parts,
  rng: () => number,
): void {
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
export function campus(p: CityPiece, { body: b, shiny, glow }: Parts): void {
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

export function skyscraper(
  p: CityPiece,
  { body: b, shiny, glow, blink }: Parts,
  rng: () => number,
): void {
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

export function helipad(p: CityPiece, { body: b, glow }: Parts): void {
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

export function hedge(p: CityPiece, { body: b }: Parts): void {
  b.box(p.w, p.h, p.d, C.leafDark, { at: [0, p.h / 2, 0] }, 0.1);
}
