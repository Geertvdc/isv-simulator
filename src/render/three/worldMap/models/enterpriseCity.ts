import * as THREE from 'three';
import { tint } from '../../kit';
import { COLOR } from '../../palette';
import { type CityPiece, STOREY, styleOf } from '../cityPlan';
import { C, choose, frac, type Parts, TOWER_WALLS, windowGrid } from './shared';

/** Enterprise city: towers, the HQ and its plaza. */

export function tower(p: CityPiece, { body: b, glow, blink }: Parts, rng: () => number): void {
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
        COLOR.windowDim,
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

export function hq(p: CityPiece, { body: b, glow, blink }: Parts, rng: () => number): void {
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

export function fountain(p: CityPiece, { body: b }: Parts): void {
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

export function planter(p: CityPiece, { body: b }: Parts): void {
  b.box(p.w, 0.26, p.d, C.concrete, { at: [0, 0.13, 0] }, 0.03);
  b.box(p.w - 0.06, 0.02, p.d - 0.06, COLOR.woodDark, { at: [0, 0.26, 0] }, 0);
  b.sphere(0.2, C.leaf, { at: [0, 0.38, 0] }, [1, 0.9, 1]);
  b.sphere(0.06, COLOR.pink, { at: [0.1, 0.5, 0.1] });
}
