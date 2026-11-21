import * as THREE from 'three';
import { type Model, ModelBuilder, tint } from '../kit';
import { framed, text } from '../roomModels/basement';
import type { TowerTopKind } from '../rooms/towerRoom';

/**
 * The heatwave kit on YOTTA Tower's wall tops (see `rooms/towerRoom.ts`
 * for where it goes): desk fans (their blades a blur), a portable air
 * conditioner with its exhaust hose stuck out over the wall, binders, a
 * monitor turned from the sun under a paper sun hood, and the note asking
 * WHO TURNED THE AC OFF?. Each built facing the room (+z), its back to the
 * outside (−z), standing on the wall top at the origin. Office kit only: no
 * lockers, no desk boxes, no food.
 */

const WHITE_PLASTIC = 0xe2e3df;
const GREY_PLASTIC = 0x9ea3a8;
const DARK = 0x2a2e34;
const PAPER = 0xf0efe8;
const INK = 0x24272c;
/** The binders' muted spines: navy, slate, a dusty violet, off-white. */
export const BINDER_COLORS = [0x3c4a6a, 0x6a7380, 0x6e6290, 0xd6d4cc] as const;

/** The kit a little over life size, so it reads from the camera. */
const PROP_SCALE = 1.25;

/** A desk fan, its head tilted and turned a little, the blades a pale blur in the cage. */
function deskFanModel(): Model {
  const outer = new ModelBuilder();
  const b = framed(outer, [0, 0, 0], [0, 0, 0], 1.6);
  b.cylinder(0.075, 0.085, 0.025, WHITE_PLASTIC, { at: [0, 0.0125, 0] }, 20);
  b.box(0.03, 0.03, 0.012, 0x7a8086, { at: [0.03, 0.026, 0.05] }, 0.004);
  b.cylinder(0.014, 0.014, 0.13, GREY_PLASTIC, { at: [0, 0.09, 0] }, 10);
  const h = framed(b, [0, 0.17, 0], [-0.18, 0.25, 0]);
  h.sphere(0.04, WHITE_PLASTIC, { at: [0, 0, -0.04] }, [1, 1, 1.3]);
  h.torus(0.1, 0.008, WHITE_PLASTIC, { at: [0, 0, 0.02] });
  h.torus(0.06, 0.004, GREY_PLASTIC, { at: [0, 0, 0.034] });
  for (let k = 0; k < 6; k++)
    h.box(
      0.004,
      0.2,
      0.004,
      GREY_PLASTIC,
      { at: [0, 0, 0.036], rot: [0, 0, (k * Math.PI) / 6] },
      0,
    );
  h.add(
    new THREE.CylinderGeometry(0.094, 0.094, 0.01, 24),
    0xf4f6f8,
    { at: [0, 0, 0.018], rot: [Math.PI / 2, 0, 0] },
    'glass',
  );
  h.cylinder(0.022, 0.022, 0.012, 0x6e62a8, { at: [0, 0, 0.042], rot: [Math.PI / 2, 0, 0] }, 14);
  return outer.build();
}

/**
 * A portable air conditioner: a white tower with its grille and a small
 * display, its corrugated exhaust hose out of the back and over the wall's
 * outer edge, flattened into a nozzle there.
 */
function portableAcModel(): Model {
  const outer = new ModelBuilder();
  const b = framed(outer, [0, 0, 0], [0, 0, 0], PROP_SCALE);
  const w = 0.26;
  const h = 0.42;
  const d = 0.2;
  b.box(w, h, d, WHITE_PLASTIC, { at: [0, h / 2, 0.04] }, 0.03);
  b.box(w - 0.04, 0.012, d - 0.02, tint(WHITE_PLASTIC, -0.12), { at: [0, h + 0.002, 0.04] }, 0);
  for (let k = 0; k < 6; k++)
    b.box(w - 0.06, 0.008, 0.004, 0x8a9096, { at: [0, h - 0.07 - k * 0.022, 0.141] }, 0);
  b.box(0.08, 0.035, 0.004, DARK, { at: [0, h - 0.24, 0.142] }, 0);
  b.screen(0.06, 0.022, 0x5ab8ff, { at: [0, h - 0.24, 0.145] });
  b.box(w - 0.08, 0.1, 0.004, tint(WHITE_PLASTIC, -0.08), { at: [0, 0.08, 0.141] }, 0);
  for (const s of [-1, 1])
    b.cylinder(
      0.018,
      0.018,
      0.016,
      DARK,
      { at: [s * 0.09, 0.008, 0.12], rot: [0, 0, Math.PI / 2] },
      10,
    );
  // The hose: rings along a bend back and over the edge, then down outside.
  const hose = 0xc4c7c9;
  const pts: [number, number, number][] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const a = t * Math.PI * 0.75;
    pts.push([
      0.02,
      0.3 + Math.sin(a) * 0.12 - t * t * 0.38,
      -0.06 - Math.sin(t * Math.PI * 0.5) * 0.44,
    ]);
  }
  for (let k = 0; k + 1 < pts.length; k++) {
    const p = pts[k] ?? [0, 0, 0];
    const q = pts[k + 1] ?? p;
    const dir = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(0.042, 0.042, len + 0.01, 12);
    geo.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
    );
    b.add(geo, k % 2 ? hose : tint(hose, -0.1), {
      at: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2],
    });
  }
  const end = pts[pts.length - 1] ?? [0, 0, 0];
  b.box(0.16, 0.05, 0.05, GREY_PLASTIC, { at: [end[0], end[1] - 0.02, end[2] - 0.02] }, 0.01);
  return outer.build();
}

/** Binders standing on the wall top, one leaning, with spine labels; a sticky note on one. */
function bindersModel(): Model {
  const outer = new ModelBuilder();
  const b = framed(outer, [0, 0, 0], [0, 0, 0], PROP_SCALE);
  BINDER_COLORS.forEach((c, k) => {
    const lean = k === 3 ? -0.32 : 0;
    const x = -0.12 + k * 0.064 + (k === 3 ? 0.03 : 0);
    const g = framed(b, [x, 0, 0], [0, 0, lean]);
    g.box(0.056, 0.26, 0.2, c, { at: [0, 0.13, 0] }, 0.008);
    g.box(0.036, 0.06, 0.004, PAPER, { at: [0, 0.17, 0.101] }, 0);
    g.box(0.014, 0.014, 0.004, 0x2a2d33, { at: [0, 0.07, 0.101] }, 0);
  });
  b.box(0.05, 0.05, 0.003, 0xf2e27a, { at: [-0.12, 0.2, 0.103], rot: [0, 0, 0.1] }, 0);
  return outer.build();
}

/**
 * A monitor turned from the sun: on its stand, swung away from the
 * window, a paper sun hood taped over its top.
 */
function monitorTurnedModel(): Model {
  const outer = new ModelBuilder();
  const b = framed(outer, [0, 0, 0], [0, 0, 0], PROP_SCALE);
  const g = framed(b, [0, 0, 0.02], [0, 0.7, 0]);
  g.box(0.16, 0.012, 0.11, DARK, { at: [0, 0.006, 0] }, 0.004);
  g.box(0.03, 0.14, 0.02, DARK, { at: [0, 0.08, -0.02] }, 0.006);
  g.box(0.36, 0.22, 0.025, 0x202328, { at: [0, 0.22, 0] }, 0.01);
  g.screen(0.33, 0.19, 0x1d3a5a, { at: [0, 0.22, 0.0135] });
  for (let k = 0; k < 4; k++)
    g.box(0.2 - k * 0.03, 0.01, 0.002, 0x8fb4d8, { at: [-0.04, 0.27 - k * 0.03, 0.015] }, 0);
  // The sun hood: a folded sheet taped on top, overhanging the screen.
  g.box(0.38, 0.004, 0.14, PAPER, { at: [0, 0.335, 0.05], rot: [0.12, 0, 0] }, 0);
  g.box(0.004, 0.12, 0.12, PAPER, { at: [-0.185, 0.28, 0.05] }, 0);
  g.box(0.004, 0.12, 0.12, PAPER, { at: [0.185, 0.28, 0.05] }, 0);
  g.box(0.05, 0.004, 0.02, 0xd9cf9a, { at: [0, 0.338, -0.005] }, 0);
  return outer.build();
}

/** WHO TURNED THE AC OFF?, printed and propped in an acrylic stand, underlined in red marker. */
function acNoteModel(): Model {
  const outer = new ModelBuilder();
  const b = framed(outer, [0, 0, 0], [0, 0, 0], PROP_SCALE);
  const g = framed(b, [0, 0, 0.05], [-0.2, 0.1, 0]);
  g.box(0.42, 0.012, 0.08, 0xdfe6ea, { at: [0, 0.006, -0.02] }, 0);
  g.box(0.4, 0.27, 0.004, PAPER, { at: [0, 0.15, 0] }, 0);
  g.pane(0.42, 0.29, 0.008, 0xeef6fa, { at: [0, 0.15, 0.008] });
  text(g, 'WHO TURNED', 0, 0.23, 0.003, 0.0088, INK);
  text(g, 'THE AC', 0, 0.165, 0.003, 0.0088, INK);
  text(g, 'OFF?', 0, 0.1, 0.003, 0.0088, 0xc0201a);
  g.box(0.24, 0.01, 0.003, 0xc0201a, { at: [0, 0.055, 0.003], rot: [0, 0, 0.04] }, 0);
  return outer.build();
}

/** Every wall-top kind, by name. */
export const TOWER_TOPS: Readonly<Record<TowerTopKind, () => Model>> = {
  deskFan: deskFanModel,
  portableAc: portableAcModel,
  binders: bindersModel,
  monitorTurned: monitorTurnedModel,
  acNote: acNoteModel,
};

/** How tall the kit stands at most over its wall top. */
export const TOWER_TOP_MAX_HEIGHT = 0.56;
