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
 * A ticket: a folder with a tab and a sheet peeking out, lying flat, its bottom at y = 0.
 * An expired one is a dull grey folder.
 */
export function ticketModel(kind: TicketKind, expired = false): Model {
  const { width: w, depth: d, thickness: t } = CARD_SIZE;
  const color = expired ? EXPIRED_FOLDER_COLOR : FOLDER_COLORS[kind];
  const b = new ModelBuilder();
  b.box(w, t * 0.45, d, tint(color, -0.12), { at: [0, t * 0.22, 0] }, 0.01);
  b.box(w * 0.92, t * 0.3, d * 0.9, COLOR.paper, { at: [0.01, t * 0.55, -0.015] }, 0.004);
  b.box(w * 0.4, t * 0.2, d * 0.12, PALETTE.ink, { at: [-w * 0.12, t * 0.72, -d * 0.2] }, 0.002);
  b.box(w * 0.55, t * 0.2, d * 0.08, 0x9aa3b5, { at: [-w * 0.05, t * 0.72, 0] }, 0.002);
  b.box(w, t * 0.3, d, color, { at: [0, t * 0.85, 0.02], rot: [-0.06, 0, 0] }, 0.01);
  b.box(w * 0.35, t * 0.3, d * 0.16, color, { at: [-w * 0.28, t * 0.6, -d * 0.55] }, 0.01);
  if (kind === 'incident' && !expired) {
    // A flame-red warning stripe, so production fires can't be missed.
    b.box(
      w * 0.9,
      t * 0.12,
      d * 0.18,
      COLOR.gold,
      { at: [0, t * 1.02, 0.03], rot: [-0.06, 0, 0] },
      0.002,
    );
  }
  return b.build();
}
