import * as THREE from 'three';
import { type Model, ModelBuilder, tint } from '../kit';
import { framed, text } from '../roomModels/basement';
import type { BoardroomTopKind } from '../rooms/boardroomRoom';
import { TOWER_TOPS } from './towerWallTops';

/**
 * The synergy workshop's kit on the boardroom floor's wall tops (see
 * `rooms/boardroomRoom.ts` for where it goes): sticky-note pads and a cup
 * of markers, a laptop with its YOTTA sticker, a stack of MONOLITH swag
 * notebooks, a tangle of lanyards and a box of visitor badges, the DO NOT
 * DISTURB – SYNERGY IN PROGRESS tent card, a Bluetooth speaker, the
 * workshop timer counting down, a water carafe and glasses, two coffee
 * cups, a conference phone, rolls of flip-chart paper, a box of sticky
 * notes, dot-vote sticker sheets, the synergy deck printed out (v14), the
 * facilitator's clicker, a MONOLITH card holder, a succulent, a tablet on
 * its stand, a headset; the tower's desk fan, binders and turned monitor;
 * and, low for the front sill, a half-closed laptop, a marker caddy, a small
 * DO NOT DISTURB card, lanyards in a tray, a water jug and glasses, MONOLITH
 * notebooks squared up and a desk plant.
 * Each built facing the room (+z), its back to the outside (−z), standing
 * on the wall top at the origin. Office kit only: nothing to eat.
 */

const WHITE_PLASTIC = 0xe2e3df;
const GREY_PLASTIC = 0x9ea3a8;
const BLACK = 0x18191c;
const PAPER = 0xf0efe8;
const INK = 0x24272c;
const VIOLET = 0x6a4cc0;
/** The workshop's sticky notes, a touch dusty so they never shout over a station. */
export const STICKY = [0xe6d064, 0xe09ab0, 0x8ec0dc, 0xa4cc8a, 0xe6a86a] as const;
const sticky = (k: number) =>
  STICKY[((k % STICKY.length) + STICKY.length) % STICKY.length] ?? 0xe6d064;

/** The kit a little over life size, so it reads from the camera. */
const S = 1.85;

function scaled(fn: (b: ModelBuilder) => void, scale = S): Model {
  const outer = new ModelBuilder();
  fn(framed(outer, [0, 0, 0], [0, 0, 0], scale));
  return outer.build();
}

/** Pads of sticky notes in three colours, one peeled note stuck to the top one. */
function stickyPadsModel(): Model {
  return scaled((b) => {
    [
      [-0.07, 0.0, 0.03, 0.3],
      [0.06, 0.02, 0.05, -0.2],
      [-0.01, -0.06, 0.02, 0.1],
    ].forEach(([x, z, h, r], k) => {
      b.box(
        0.1,
        h ?? 0.03,
        0.1,
        sticky(k),
        { at: [x ?? 0, (h ?? 0.03) / 2, z ?? 0], rot: [0, r ?? 0, 0] },
        0,
      );
      for (let s = 1; s < 4; s++)
        b.box(
          0.101,
          0.002,
          0.101,
          tint(sticky(k), -0.18),
          { at: [x ?? 0, ((h ?? 0.03) * s) / 4, z ?? 0], rot: [0, r ?? 0, 0] },
          0,
        );
    });
    b.box(0.1, 0.002, 0.1, sticky(3), { at: [0.07, 0.054, 0.04], rot: [0.25, 0.5, 0] }, 0);
    b.box(0.05, 0.002, 0.006, INK, { at: [0.07, 0.058, 0.04], rot: [0.25, 0.5, 0] }, 0);
  });
}

/** A cup of markers, caps up in four colours, one lying beside it. */
function markersModel(): Model {
  return scaled((b) => {
    b.cylinder(0.05, 0.045, 0.1, 0x3a3f46, { at: [0, 0.05, 0] }, 16);
    b.cylinder(0.046, 0.046, 0.004, VIOLET, { at: [0, 0.07, 0.0] }, 16);
    const caps = [0x2a2e34, 0xc0302a, 0x2f5aa8, 0x2f8a4a, 0x2a2e34];
    caps.forEach((c, k) => {
      const a = (k / caps.length) * Math.PI * 2;
      const x = Math.cos(a) * 0.022;
      const z = Math.sin(a) * 0.022;
      b.cylinder(0.011, 0.011, 0.13, PAPER, { at: [x, 0.11, z], rot: [z * 4, 0, -x * 4] }, 8);
      b.cylinder(
        0.012,
        0.012,
        0.035,
        c,
        { at: [x * 1.5, 0.18, z * 1.5], rot: [z * 4, 0, -x * 4] },
        8,
      );
    });
    b.cylinder(
      0.011,
      0.011,
      0.12,
      PAPER,
      { at: [0.1, 0.011, 0.04], rot: [0, 0.4, Math.PI / 2] },
      8,
    );
    b.cylinder(
      0.012,
      0.012,
      0.03,
      0xc0302a,
      { at: [0.155, 0.011, 0.015], rot: [0, 0.4, Math.PI / 2] },
      8,
    );
  });
}

/** An open laptop, its screen on the synergy deck, a YOTTA sticker on the lid's back. */
function laptopModel(): Model {
  return scaled((b) => {
    b.box(0.3, 0.014, 0.2, 0xa6acb3, { at: [0, 0.007, 0.03] }, 0.006);
    b.box(0.26, 0.002, 0.11, 0x50565e, { at: [0, 0.0145, 0.0] }, 0);
    b.box(0.08, 0.002, 0.05, 0x8a9096, { at: [0, 0.0145, 0.085] }, 0);
    const s = framed(b, [0, 0.014, -0.07], [-0.3, 0, 0]);
    s.box(0.3, 0.2, 0.01, 0xa6acb3, { at: [0, 0.1, 0] }, 0.006);
    s.screen(0.27, 0.17, 0x1c2840, { at: [0, 0.105, 0.006] });
    s.screen(0.22, 0.03, VIOLET, { at: [0, 0.16, 0.007] });
    text(s, 'SYNERGY', 0, 0.16, 0.008, 0.0045, 0xffffff);
    s.screen(0.1, 0.08, 0x2a3d5e, { at: [-0.06, 0.09, 0.007] });
    s.screen(0.1, 0.08, 0x3a2a5e, { at: [0.06, 0.09, 0.007] });
    s.cylinder(
      0.03,
      0.03,
      0.002,
      VIOLET,
      { at: [0.05, 0.12, -0.006], rot: [Math.PI / 2, 0, 0] },
      14,
    );
    s.box(0.06, 0.03, 0.002, 0xe6d064, { at: [-0.07, 0.06, -0.006], rot: [0, 0, 0.2] }, 0);
  });
}

/** MONOLITH's swag: a squared-off stack of black notebooks with the white M, one open on top with a pen. */
function notebooksModel(): Model {
  return scaled((b) => {
    for (let k = 0; k < 5; k++) {
      const r = ((k * 37) % 7) * 0.03 - 0.09;
      b.box(0.16, 0.018, 0.22, BLACK, { at: [0, 0.009 + k * 0.019, 0], rot: [0, r, 0] }, 0.004);
      b.box(0.004, 0.016, 0.21, 0xd8d6cf, { at: [0.08, 0.009 + k * 0.019, 0], rot: [0, r, 0] }, 0);
    }
    b.box(0.05, 0.002, 0.05, 0xf2f2ee, { at: [0, 0.096, 0.02], rot: [0, 0.03, 0] }, 0);
    text(b, 'M', 0, 0.098, 0.02, 0.008, BLACK);
    // The free sample, open at a blank page, and the pen.
    b.box(0.3, 0.008, 0.2, PAPER, { at: [0.25, 0.004, 0.05], rot: [0, -0.3, 0] }, 0.003);
    b.box(0.004, 0.009, 0.2, 0x9a9890, { at: [0.25, 0.005, 0.05], rot: [0, -0.3, 0] }, 0);
    b.cylinder(
      0.006,
      0.006,
      0.13,
      BLACK,
      { at: [0.28, 0.014, 0.06], rot: [0, -0.3 + 0.6, Math.PI / 2] },
      8,
    );
  });
}

/** A tangle of lanyards in YOTTA violet and MONOLITH black, badges on the end, one hanging over the edge. */
function lanyardsModel(): Model {
  return scaled((b) => {
    for (let k = 0; k < 4; k++) {
      const c = k % 2 ? BLACK : VIOLET;
      b.torus(
        0.07 + k * 0.008,
        0.005,
        c,
        { at: [-0.02 + k * 0.03, 0.006, k * 0.015], rot: [Math.PI / 2, 0, k] },
        Math.PI * 1.7,
      );
      b.box(
        0.06,
        0.004,
        0.085,
        0xf2f2ee,
        { at: [0.05 + k * 0.02, 0.004 + k * 0.004, 0.08 - k * 0.03], rot: [0, k * 0.5, 0] },
        0,
      );
      b.box(
        0.05,
        0.002,
        0.014,
        k % 2 ? BLACK : VIOLET,
        { at: [0.05 + k * 0.02, 0.0065 + k * 0.004, 0.1 - k * 0.03], rot: [0, k * 0.5, 0] },
        0,
      );
    }
    // One hanging down the face, its badge swinging under the edge.
    b.box(0.012, 0.18, 0.004, VIOLET, { at: [-0.12, -0.09, 0.39 / S], rot: [0, 0, 0.1] }, 0);
    b.box(0.07, 0.09, 0.004, 0xf2f2ee, { at: [-0.13, -0.2, 0.39 / S + 0.003] }, 0);
    b.box(0.07, 0.02, 0.004, VIOLET, { at: [-0.13, -0.165, 0.39 / S + 0.005] }, 0);
  });
}

/** The workshop timer: a cube with red digits counting down, 04:59. */
function timerModel(): Model {
  return scaled((b) => {
    b.box(0.13, 0.11, 0.1, WHITE_PLASTIC, { at: [0, 0.055, 0] }, 0.02);
    b.screen(0.1, 0.05, 0x2a0e0c, { at: [0, 0.06, 0.051] });
    text(b, '04:59', 0, 0.06, 0.052, 0.0062, 0xff5a3a);
    b.cylinder(0.014, 0.014, 0.012, 0xc0302a, { at: [0.03, 0.115, 0] }, 12);
    b.cylinder(0.014, 0.014, 0.012, GREY_PLASTIC, { at: [-0.03, 0.115, 0] }, 12);
  });
}

/** A Bluetooth speaker, its fabric grille and a blue LED: the workshop's music. */
function speakerModel(): Model {
  return scaled((b) => {
    b.capsule(0.05, 0.14, 0x3a3f58, { at: [0, 0.05, 0], rot: [0, 0, Math.PI / 2] });
    for (let k = -3; k <= 3; k++)
      b.box(0.004, 0.08, 0.004, tint(0x3a3f58, -0.3), { at: [k * 0.02, 0.05, 0.05] }, 0);
    b.box(0.03, 0.012, 0.03, 0x22252c, { at: [0, 0.006, 0] }, 0);
    b.led(0.006, 0x5ab8ff, { at: [0.08, 0.06, 0.04] });
  });
}

/** The DO NOT DISTURB – SYNERGY IN PROGRESS tent card. */
function dndTentModel(): Model {
  return scaled((b) => {
    for (const s of [1, -1]) {
      const g = framed(b, [0, 0, s * 0.02], [s * 0.3, s > 0 ? 0 : Math.PI, 0]);
      g.box(0.34, 0.15, 0.004, 0xf2f2ee, { at: [0, 0.075, 0] }, 0);
      g.box(0.34, 0.035, 0.005, 0xc0302a, { at: [0, 0.125, 0] }, 0);
      text(g, 'DO NOT DISTURB', 0, 0.125, 0.003, 0.0052, 0xffffff);
      text(g, 'SYNERGY', 0, 0.08, 0.003, 0.0068, INK);
      text(g, 'IN PROGRESS', 0, 0.045, 0.003, 0.0052, VIOLET);
    }
  }, 1.9);
}

/** A carafe of water with glasses on a walnut coaster tray. */
function carafeModel(): Model {
  return scaled((b) => {
    b.box(0.26, 0.012, 0.16, 0x4a3426, { at: [0, 0.006, 0] }, 0.004);
    b.cylinder(0.035, 0.04, 0.06, 0x9fcbe2, { at: [-0.07, 0.042, 0] }, 16);
    b.add(
      new THREE.CylinderGeometry(0.03, 0.045, 0.17, 16),
      0xe8f4fa,
      { at: [-0.07, 0.097, 0] },
      'glass',
    );
    for (const [x, z] of [
      [0.03, -0.04],
      [0.08, 0.03],
    ] as const) {
      b.cylinder(0.02, 0.02, 0.025, 0xa9d2e6, { at: [x, 0.024, z] }, 12);
      b.add(
        new THREE.CylinderGeometry(0.024, 0.022, 0.075, 12),
        0xeef7fb,
        { at: [x, 0.05, z] },
        'glass',
      );
    }
  });
}

/** Two takeaway coffee cups, lids on, one with a violet sleeve. */
function coffeeCupsModel(): Model {
  return scaled((b) => {
    for (const [x, z, c] of [
      [-0.04, 0, VIOLET],
      [0.05, 0.04, 0xb08a5a],
    ] as const) {
      b.cylinder(0.034, 0.026, 0.11, 0xf2efe7, { at: [x, 0.055, z] }, 14);
      b.cylinder(0.036, 0.032, 0.04, c, { at: [x, 0.06, z] }, 14);
      b.cylinder(0.037, 0.037, 0.012, 0xe6e4de, { at: [x, 0.116, z] }, 14);
    }
  });
}

/** A conference phone, three-armed, its green ring lit. */
function confPhoneModel(): Model {
  return scaled((b) => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      b.box(
        0.06,
        0.02,
        0.13,
        0x2e3238,
        { at: [Math.sin(a) * 0.05, 0.01, Math.cos(a) * 0.05], rot: [0, a, 0] },
        0.008,
      );
    }
    b.cylinder(0.05, 0.055, 0.03, 0x2e3238, { at: [0, 0.015, 0] }, 20);
    b.screen(0.04, 0.02, 0x9ad87a, { at: [0, 0.031, 0.02], rot: [-Math.PI / 2, 0, 0] });
    b.torus(0.04, 0.003, 0x3ee06a, { at: [0, 0.031, 0], rot: [Math.PI / 2, 0, 0] });
  });
}

/** Rolls of flip-chart paper lying in a heap, one with its end curling. */
function paperRollsModel(): Model {
  return scaled((b) => {
    [
      [0, 0.03, 0, 0.1],
      [0, 0.03, 0.07, -0.05],
      [0, 0.085, 0.035, 0.02],
    ].forEach(([x, y, z, r]) => {
      b.cylinder(
        0.03,
        0.03,
        0.42,
        PAPER,
        { at: [x ?? 0, y ?? 0, z ?? 0], rot: [0, r ?? 0, Math.PI / 2] },
        14,
      );
      b.cylinder(
        0.012,
        0.012,
        0.422,
        0xb8a888,
        { at: [x ?? 0, y ?? 0, z ?? 0], rot: [0, r ?? 0, Math.PI / 2] },
        8,
      );
    });
    b.box(0.003, 0.1, 0.06, PAPER, { at: [0.21, 0.08, 0.05], rot: [0, 0, 0.3] }, 0);
  });
}

/** A succulent in a white pot on a saucer. */
function succulentModel(): Model {
  return scaled((b) => {
    b.cylinder(0.06, 0.06, 0.008, 0xd8d6cf, { at: [0, 0.004, 0] }, 16);
    b.cylinder(0.05, 0.04, 0.07, 0xe8e6e0, { at: [0, 0.043, 0] }, 16);
    b.cylinder(0.046, 0.046, 0.004, 0x5a4636, { at: [0, 0.078, 0] }, 16);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      b.sphere(
        0.022,
        k % 2 ? 0x6e9a6a : 0x86a888,
        {
          at: [Math.sin(a) * 0.025, 0.095, Math.cos(a) * 0.025],
          rot: [Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6],
        },
        [0.6, 1.3, 0.6],
      );
    }
    b.sphere(0.02, 0x7aa47a, { at: [0, 0.105, 0] }, [0.8, 1.2, 0.8]);
  });
}

/** Sheets of dot-vote stickers fanned out, some dots already peeled. */
function dotStickersModel(): Model {
  return scaled((b) => {
    const dots = [0xd8453a, 0x3a7ad8, 0x3aa85a];
    dots.forEach((c, k) => {
      const r = (k - 1) * 0.25;
      const g = framed(b, [k * 0.04 - 0.04, 0.002 + k * 0.002, k * 0.02], [0, r, 0]);
      g.box(0.12, 0.002, 0.16, 0xf6f6f2, { at: [0, 0, 0] }, 0);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 5; j++)
          if ((i + j + k) % 5 !== 0)
            g.cylinder(
              0.01,
              0.01,
              0.002,
              c,
              { at: [-0.04 + i * 0.027, 0.002, -0.06 + j * 0.03] },
              10,
            );
    });
  });
}

/** A MONOLITH business card holder, black, a fan of cards in it. */
function cardHolderModel(): Model {
  return scaled((b) => {
    b.box(0.12, 0.04, 0.06, BLACK, { at: [0, 0.02, 0] }, 0.006);
    for (let k = 0; k < 4; k++)
      b.box(
        0.1,
        0.06,
        0.002,
        k === 3 ? 0xf2f2ee : 0x2a2b2e,
        { at: [0, 0.055, -0.012 + k * 0.006], rot: [-0.15, 0, 0] },
        0,
      );
    text(b, 'MONOLITH', 0, 0.07, 0.008, 0.0032, BLACK);
  });
}

/** The synergy deck, printed out: a fat stack, the top page's title, a bulldog clip. */
function deckPrintoutModel(): Model {
  return scaled((b) => {
    b.box(0.22, 0.05, 0.3, PAPER, { at: [0, 0.025, 0], rot: [0, 0.1, 0] }, 0.004);
    for (let k = 1; k < 6; k++)
      b.box(0.222, 0.002, 0.302, tint(PAPER, -0.1), { at: [0, k * 0.008, 0], rot: [0, 0.1, 0] }, 0);
    const g = framed(b, [0, 0.051, 0], [0, 0.1, 0]);
    g.box(0.18, 0.002, 0.05, VIOLET, { at: [0, 0, -0.09] }, 0);
    text(g, 'DECK V14', 0, 0.002, -0.09, 0.006, 0xffffff);
    g.box(0.14, 0.002, 0.006, INK, { at: [0, 0, -0.02] }, 0);
    g.box(0.1, 0.002, 0.006, INK, { at: [-0.02, 0, 0.01] }, 0);
    g.box(0.08, 0.002, 0.06, 0xd8d6cf, { at: [0.02, 0, 0.08] }, 0);
    b.box(0.06, 0.03, 0.03, BLACK, { at: [0.01, 0.055, -0.15], rot: [0, 0.1, 0] }, 0.004);
  });
}

/** The facilitator's clicker beside its USB dongle and a spare battery. */
function clickerModel(): Model {
  return scaled((b) => {
    b.capsule(0.018, 0.09, 0x2e3238, { at: [0, 0.018, 0], rot: [Math.PI / 2, 0.4, 0] });
    b.cylinder(0.008, 0.008, 0.003, 0xc0302a, { at: [-0.01, 0.036, 0.02] }, 10);
    b.led(0.004, 0x3ee06a, { at: [0.012, 0.036, -0.03] });
    b.box(0.03, 0.008, 0.016, 0x5f676f, { at: [0.08, 0.004, 0.03] }, 0);
    b.cylinder(
      0.008,
      0.008,
      0.045,
      0x5a5f66,
      { at: [0.08, 0.008, -0.04], rot: [0, 0, Math.PI / 2] },
      10,
    );
  }, 2.2);
}

/** A cardboard box of sticky notes, its lid off, the pads standing in colour rows. */
function stickyBoxModel(): Model {
  return scaled((b) => {
    b.box(0.22, 0.08, 0.16, 0xb89a6e, { at: [0, 0.04, 0] }, 0.006);
    b.box(0.2, 0.002, 0.14, tint(0xb89a6e, -0.3), { at: [0, 0.075, 0] }, 0);
    for (let k = 0; k < 5; k++)
      b.box(0.034, 0.09, 0.12, sticky(k), { at: [-0.08 + k * 0.04, 0.05, 0] }, 0);
    b.box(0.23, 0.01, 0.17, 0xb89a6e, { at: [0.0, 0.02, 0.17], rot: [0.1, 0.2, 0] }, 0.003);
    text(b, 'POST-ITS', 0, 0.04, 0.081, 0.0045, 0x4a3a26);
  });
}

/** A box of visitor badges, alphabetical, most of them MONOLITH. */
function badgeBoxModel(): Model {
  return scaled((b) => {
    b.box(0.24, 0.06, 0.14, 0x2e3238, { at: [0, 0.03, 0] }, 0.006);
    for (let k = 0; k < 9; k++)
      b.box(
        0.02,
        0.07,
        0.1,
        k % 3 === 1 ? VIOLET : BLACK,
        { at: [-0.1 + k * 0.025, 0.05, 0], rot: [0, 0, -0.15] },
        0,
      );
    b.box(0.2, 0.025, 0.004, 0xf2f2ee, { at: [0, 0.03, 0.071] }, 0);
    text(b, 'VISITORS', 0, 0.03, 0.073, 0.0036, INK);
  });
}

/** A tablet on a stand, a sign-in page on it (WELCOME MONOLITH). */
function tabletModel(): Model {
  return scaled((b) => {
    b.box(0.08, 0.01, 0.08, 0x8a9096, { at: [0, 0.005, 0] }, 0);
    b.box(0.015, 0.08, 0.015, 0x8a9096, { at: [0, 0.045, -0.01], rot: [-0.3, 0, 0] }, 0);
    const g = framed(b, [0, 0.07, 0.0], [-0.35, 0, 0]);
    g.box(0.2, 0.14, 0.01, 0x2e3238, { at: [0, 0.05, 0] }, 0.008);
    g.screen(0.18, 0.12, 0xf2f2ee, { at: [0, 0.05, 0.006] });
    g.screen(0.18, 0.03, BLACK, { at: [0, 0.095, 0.007] });
    text(g, 'WELCOME', 0, 0.095, 0.008, 0.0042, 0xffffff);
    g.screen(0.1, 0.022, VIOLET, { at: [0, 0.02, 0.007] });
  });
}

/** A headset lying on its band, the mic arm out. */
function headsetModel(): Model {
  return scaled((b) => {
    b.torus(0.07, 0.008, 0x3a3f46, { at: [0, 0.01, 0], rot: [Math.PI / 2, 0, 0.3] }, Math.PI);
    for (const s of [-1, 1])
      b.cylinder(
        0.035,
        0.035,
        0.022,
        0x2e3238,
        { at: [s * 0.068, 0.018, -0.02 * s], rot: [0, 0, Math.PI / 2] },
        14,
      );
    b.cylinder(
      0.004,
      0.004,
      0.09,
      0x2e3238,
      { at: [0.1, 0.012, 0.04], rot: [Math.PI / 2, 0, 0.6] },
      6,
    );
  });
}

// ---- The front sill's kit: all of it low (at most `FRONT_TOP_MAX` once scaled) ----

/** The front sill's kit a little smaller than the wall tops' (it is nearer the camera). */
const FRONT_S = 1.75;

/** A laptop left half closed, the synergy deck's glow on the keys, a YOTTA sticker on the lid. */
function laptopHalfModel(): Model {
  return scaled((b) => {
    b.box(0.26, 0.012, 0.18, 0xa6acb3, { at: [0, 0.006, 0.02] }, 0.006);
    b.box(0.22, 0.002, 0.09, 0x50565e, { at: [0, 0.0125, 0.0] }, 0);
    b.screen(0.2, 0.02, 0x3a4a7a, { at: [0, 0.013, -0.04], rot: [-Math.PI / 2, 0, 0] });
    const s = framed(b, [0, 0.012, -0.07], [-1.15, 0, 0]);
    s.box(0.26, 0.17, 0.01, 0xa6acb3, { at: [0, 0.085, 0] }, 0.006);
    s.cylinder(
      0.026,
      0.026,
      0.002,
      VIOLET,
      { at: [0.04, 0.1, -0.006], rot: [Math.PI / 2, 0, 0] },
      14,
    );
    s.box(0.05, 0.026, 0.002, 0xe6d064, { at: [-0.06, 0.06, -0.006], rot: [0, 0, 0.2] }, 0);
  }, FRONT_S);
}

/** A tray of whiteboard markers lying in a row, caps in four colours, an eraser at the end. */
function markerCaddyModel(): Model {
  return scaled((b) => {
    b.box(0.17, 0.024, 0.09, 0x3a3f46, { at: [0, 0.012, 0] }, 0.006);
    [0x2a2e34, 0xc0302a, 0x2f5aa8, 0x2f8a4a].forEach((c, k) => {
      const z = -0.03 + k * 0.02;
      b.cylinder(0.009, 0.009, 0.12, PAPER, { at: [-0.01, 0.03, z], rot: [0, 0, Math.PI / 2] }, 8);
      b.cylinder(0.01, 0.01, 0.03, c, { at: [0.065, 0.03, z], rot: [0, 0, Math.PI / 2] }, 8);
    });
    b.box(0.07, 0.03, 0.035, 0x2e3238, { at: [0.0, 0.015, 0.075], rot: [0, 0.3, 0] }, 0.006);
    b.box(0.07, 0.008, 0.035, 0xd8d6cf, { at: [0.0, 0.004, 0.075], rot: [0, 0.3, 0] }, 0);
  }, FRONT_S);
}

/** DO NOT DISTURB – SYNERGY IN PROGRESS on a low tent card, turned to the passage. */
function dndCardModel(): Model {
  return scaled((b) => {
    for (const s of [1, -1]) {
      const g = framed(b, [0, 0, s * 0.03], [s * 0.45, s > 0 ? 0 : Math.PI, 0]);
      g.box(0.2, 0.1, 0.004, 0xf2f2ee, { at: [0, 0.05, 0] }, 0);
      g.box(0.2, 0.026, 0.005, 0xc0302a, { at: [0, 0.084, 0] }, 0);
      text(g, 'DO NOT DISTURB', 0, 0.084, 0.003, 0.0031, 0xffffff);
      text(g, 'SYNERGY', 0, 0.052, 0.003, 0.0055, INK);
      text(g, 'IN PROGRESS', 0, 0.024, 0.003, 0.0036, VIOLET);
    }
  }, FRONT_S);
}

/** Lanyards coiled in a shallow tray, their badges fanned at the front. */
function lanyardTrayModel(): Model {
  return scaled((b) => {
    b.box(0.18, 0.02, 0.13, 0x4a3a2e, { at: [0, 0.01, 0] }, 0.005);
    b.box(0.16, 0.006, 0.11, tint(0x4a3a2e, -0.3), { at: [0, 0.018, 0] }, 0);
    for (let k = 0; k < 4; k++)
      b.torus(0.04 - k * 0.004, 0.005, k % 2 ? BLACK : VIOLET, {
        at: [-0.03 + k * 0.02, 0.024 + k * 0.004, -0.02 + (k % 2) * 0.02],
        rot: [Math.PI / 2, 0, k],
      });
    for (let k = 0; k < 3; k++) {
      const g = framed(b, [-0.05 + k * 0.05, 0.02, 0.05], [-0.4, (k - 1) * 0.25, 0]);
      g.box(0.045, 0.06, 0.003, 0xf2f2ee, { at: [0, 0.03, 0] }, 0);
      g.box(0.045, 0.014, 0.004, k % 2 ? BLACK : VIOLET, { at: [0, 0.052, 0] }, 0);
    }
  }, FRONT_S);
}

/** A water jug and two glasses on a small walnut tray. */
function jugGlassesModel(): Model {
  return scaled((b) => {
    b.box(0.2, 0.01, 0.12, 0x4a3a2e, { at: [0, 0.005, 0] }, 0.004);
    b.cylinder(0.03, 0.036, 0.05, 0x9fcbe2, { at: [-0.05, 0.035, 0] }, 16);
    b.add(
      new THREE.CylinderGeometry(0.028, 0.04, 0.13, 16),
      0xe8f4fa,
      { at: [-0.05, 0.075, 0] },
      'glass',
    );
    b.torus(0.025, 0.005, 0xdfe8ee, { at: [-0.09, 0.08, 0], rot: [0, 0, Math.PI / 2] }, Math.PI);
    for (const [x, z] of [
      [0.03, -0.025],
      [0.07, 0.025],
    ] as const) {
      b.cylinder(0.017, 0.017, 0.02, 0xa9d2e6, { at: [x, 0.02, z] }, 12);
      b.add(
        new THREE.CylinderGeometry(0.02, 0.018, 0.06, 12),
        0xeef7fb,
        { at: [x, 0.04, z] },
        'glass',
      );
    }
  }, FRONT_S);
}

/** MONOLITH's swag notebooks, squared up, the white M on the top one, a pen across it. */
function notebookStackModel(): Model {
  return scaled((b) => {
    for (let k = 0; k < 4; k++) {
      const r = ((k * 37) % 7) * 0.025 - 0.07;
      b.box(0.14, 0.018, 0.19, BLACK, { at: [0, 0.009 + k * 0.019, 0], rot: [0, r, 0] }, 0.004);
      b.box(0.004, 0.016, 0.18, 0xd8d6cf, { at: [0.07, 0.009 + k * 0.019, 0], rot: [0, r, 0] }, 0);
    }
    b.box(0.05, 0.002, 0.05, 0xf2f2ee, { at: [0, 0.077, 0.02] }, 0);
    text(b, 'M', 0, 0.079, 0.02, 0.008, BLACK);
    b.cylinder(
      0.006,
      0.006,
      0.13,
      VIOLET,
      { at: [0.0, 0.082, -0.04], rot: [0, 0.4, Math.PI / 2] },
      8,
    );
  }, FRONT_S);
}

/** A low desk plant in a white pot: a few broad leaves. */
function deskPlantModel(): Model {
  return scaled((b) => {
    b.cylinder(0.05, 0.04, 0.06, 0xe8e6e0, { at: [0, 0.03, 0] }, 16);
    b.cylinder(0.046, 0.046, 0.004, 0x5a4636, { at: [0, 0.06, 0] }, 16);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      b.sphere(
        0.04,
        k % 2 ? 0x5f8a5a : 0x76a070,
        {
          at: [Math.sin(a) * 0.045, 0.09, Math.cos(a) * 0.045],
          rot: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9],
        },
        [0.5, 1.2, 0.18],
      );
    }
  }, FRONT_S);
}

/** Every wall-top prop, by kind. */
export const BOARDROOM_TOPS: Readonly<Record<BoardroomTopKind, () => Model>> = {
  stickyPads: stickyPadsModel,
  markers: markersModel,
  laptop: laptopModel,
  notebooks: notebooksModel,
  lanyards: lanyardsModel,
  timer: timerModel,
  speaker: speakerModel,
  deskFan: TOWER_TOPS.deskFan,
  binders: TOWER_TOPS.binders,
  dndTent: dndTentModel,
  carafe: carafeModel,
  coffeeCups: coffeeCupsModel,
  clicker: clickerModel,
  confPhone: confPhoneModel,
  paperRolls: paperRollsModel,
  succulent: succulentModel,
  dotStickers: dotStickersModel,
  cardHolder: cardHolderModel,
  deckPrintout: deckPrintoutModel,
  stickyBox: stickyBoxModel,
  badgeBox: badgeBoxModel,
  tablet: tabletModel,
  headset: headsetModel,
  monitorTurned: TOWER_TOPS.monitorTurned,
  laptopHalf: laptopHalfModel,
  markerCaddy: markerCaddyModel,
  dndCard: dndCardModel,
  lanyardTray: lanyardTrayModel,
  jugGlasses: jugGlassesModel,
  notebookStack: notebookStackModel,
  deskPlant: deskPlantModel,
};
