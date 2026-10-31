import type { TicketKind } from '../../sim/tickets';
import { type Model, ModelBuilder, tint } from './kit';
import { CARD_SIZE } from './layout';
import { PALETTE } from './look';
import { COLOR } from './palette';

/**
 * Folder colors: a feature is a manila folder, a bug pink, an incident red;
 * a front end sky blue, a back end green, and the two merged purple.
 */
const FOLDER_COLORS: Readonly<Record<TicketKind, number>> = {
  feature: 0xe8c77a,
  bug: 0xf29aa0,
  incident: 0xe8402f,
  frontend: 0x7ab8f0,
  backend: 0x6cbf7a,
  fullstack: 0x9a7ae0,
};

/** An expired ticket's folder: dull grey, its order ran out. */
const EXPIRED_FOLDER_COLOR = 0x8a8880;

/**
 * A ticket: a fat folder lying flat, its bottom at y = 0: a stack of papers
 * between two covers joined at the back, the front cover sagging open a
 * little, a tab sticking up behind. An expired one is a dull grey folder.
 */
export function ticketModel(kind: TicketKind, expired = false): Model {
  const { width: w, depth: d, thickness: t } = CARD_SIZE;
  const color = expired ? EXPIRED_FOLDER_COLOR : FOLDER_COLORS[kind];
  const cover = t * 0.16;
  const b = new ModelBuilder();
  b.box(w, cover, d, tint(color, -0.12), { at: [0, cover / 2, 0] }, 0.008);
  // The papers, a little out of line.
  const sheets = [
    { x: 0.012, z: -0.012, turn: 0.03, color: COLOR.paper },
    { x: -0.01, z: 0.008, turn: -0.045, color: tint(COLOR.paper, -0.08) },
    { x: 0.016, z: -0.002, turn: 0.02, color: COLOR.paper },
  ];
  sheets.forEach((sheet, k) => {
    b.box(
      w * 0.93,
      t * 0.17,
      d * 0.9,
      sheet.color,
      { at: [sheet.x, cover + t * (0.085 + k * 0.17), sheet.z], rot: [0, sheet.turn, 0] },
      0.004,
    );
  });
  b.box(w * 0.4, t * 0.08, d * 0.1, PALETTE.ink, { at: [-w * 0.1, t * 0.68, -d * 0.2] }, 0.002);
  // The spine, and the front cover resting on the papers, lifting at its loose edge.
  b.box(w, t * 0.74, cover, tint(color, -0.12), { at: [0, t * 0.37, -d / 2 + cover / 2] }, 0.006);
  b.box(w, cover, d, color, { at: [0, t * 0.8, 0.004], rot: [-0.05, 0, 0] }, 0.008);
  b.box(w * 0.34, cover, d * 0.16, color, { at: [-w * 0.26, t * 0.62, -d * 0.56] }, 0.006);
  if (kind === 'incident' && !expired) {
    // A flame-red warning stripe, so production fires can't be missed.
    b.box(
      w * 0.9,
      t * 0.1,
      d * 0.18,
      COLOR.gold,
      { at: [0, t * 0.9, 0.03], rot: [-0.05, 0, 0] },
      0.002,
    );
  }
  return b.build();
}
