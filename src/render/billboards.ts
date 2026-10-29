import Phaser from 'phaser';
import type { HintId } from '../flow/hints';
import type { LevelMap, Tile } from '../sim/level';
import type { Invite } from '../sim/meetings';
import type { GameState } from '../sim/state';
import type { Ticket, TicketKind } from '../sim/tickets';
import { playerColor } from './playerColors';
import {
  CHECK_COLOR,
  GLYPHS,
  GLYPH_SIZE,
  GLYPH_STROKE,
  type GlyphId,
  LOCK_COLOR,
  PART_COLOR,
  SKIP_COLOR,
  STAMP_COLOR,
  type StepTile,
  stepColor,
  timerColor,
} from './stepLook';

/*
 * What the 3D view draws flat on the Phaser canvas over the world: ticket
 * cards, progress bars, the pipeline badge, meeting invites and hint markers.
 * Each draws around (0, 0); the 3D overlays place and scale it.
 */

/**
 * A ticket card in the world: a tiny editor window like the HUD's order
 * cards: the order's `#id` (a text the overlays put at
 * `TICKET_CARD_ID`) in its title bar, with the domain's commit scope (`api`)
 * at its right, the order's timer as a line under the
 * bar, and a tile per step with its station glyph.
 */
const CARD_MIN_WIDTH = 46;
export const TICKET_CARD_HEIGHT = 34;
const CARD_PAD = 5;
const CARD_COLOR = 0x181e2e;
const CARD_EDGE = 0x34405f;
const CARD_BAR = 9;
const BAR_COLOR = 0x222a3f;
/** A hotfix's window is an error panel. */
const INCIDENT_BAR_COLOR = 0x8a1c17;
const TIMER_HEIGHT = 2;
const TIMER_BACK = 0x2c3550;
const TILE = 12;
const TILE_GAP = 3;
/** The next step stands out: bigger, with the menus' cyan selection edge. */
const TILE_CURRENT = 15;
const TILE_TOP = 16.5;
const TILE_COLOR = 0x222a3f;
const SELECT_COLOR = 0x26375e;
const ACCENT_COLOR = 0x5fe6ff;
const GLYPH_SHARE = 0.72;
/** A ticket whose order ran out: grey all over, with the bin as its next step. */
const EXPIRED_CARD_COLOR = 0x3b3f4a;
const EXPIRED_EDGE = 0x6b707c;
const EXPIRED_GLYPH = 0x8a8f99;
/** Where the order number sits on a card: at the left of its title bar. */
export const TICKET_CARD_ID = { x: 4, y: -TICKET_CARD_HEIGHT + CARD_BAR / 2 };
/** The title bar's text size, and roughly how wide a character of it is. */
export const TICKET_CARD_BAR_FONT = 7;
const BAR_CHAR_WIDTH = 4.4;
/** Space between the `#id` and the scope when both are in the title bar. */
const BAR_TEXT_GAP = 6;

/** What a world ticket card shows. */
export interface TicketCardLook {
  kind: TicketKind;
  steps: readonly StepTile[];
  expired: boolean;
  /** Share of its order's time left, 0 to 1; `null` once the order is gone. */
  timer: number | null;
  /** Finished, but an open incident keeps it from shipping: a lock on its last step. */
  blocked: boolean;
  /** Characters of text in the title bar (`#id` and scope), so the card is wide enough for them. */
  barChars?: number;
}

/** How wide the card for `look` is. */
export function ticketCardWidth(
  look: Pick<TicketCardLook, 'steps' | 'expired' | 'barChars'>,
): number {
  const count = look.steps.length + (look.expired ? 1 : 0);
  const tiles = count * TILE + (count - 1) * TILE_GAP + (TILE_CURRENT - TILE);
  const bar = (look.barChars ?? 0) * BAR_CHAR_WIDTH + 2 * TICKET_CARD_ID.x + BAR_TEXT_GAP;
  return Math.max(CARD_MIN_WIDTH, tiles + 2 * CARD_PAD, bar);
}

const BAR_WIDTH = 44;
const BAR_HEIGHT = 7;
const BAR_GAP = 6;
const BAR_BACK_COLOR = 0x1a1d24;
const BAR_FILL_COLOR = 0x7cf07c;

/** The label over a ticket being pair-programmed, and its color. */
export const PAIRING_COLOR = '#ffd166';

/** Whether two players are coding `ticket` together right now (pair programming). */
export function isPaired(state: GameState, ticket: Ticket): boolean {
  const loc = ticket.location;
  return loc.kind === 'tile' && state.pairing.some((p) => p.x === loc.x && p.y === loc.y);
}

/** Draws the card with its bottom center at (0, 0), and the progress bar above it if any. */
export function drawTicketCard(
  g: Phaser.GameObjects.Graphics,
  look: TicketCardLook,
  bar: number | null,
): void {
  g.clear();
  const { expired } = look;
  const width = ticketCardWidth(look);
  const left = -width / 2;
  const top = -TICKET_CARD_HEIGHT;
  g.fillStyle(expired ? EXPIRED_CARD_COLOR : CARD_COLOR);
  g.lineStyle(1, expired ? EXPIRED_EDGE : CARD_EDGE);
  g.fillRoundedRect(left, top, width, TICKET_CARD_HEIGHT, 3);
  // The title bar, where the overlays put the order number.
  const incident = look.kind === 'incident' && !expired;
  g.fillStyle(expired ? EXPIRED_EDGE : incident ? INCIDENT_BAR_COLOR : BAR_COLOR);
  g.fillRoundedRect(left, top, width, CARD_BAR, { tl: 3, tr: 3, bl: 0, br: 0 });
  if (look.timer !== null && !expired) {
    g.fillStyle(TIMER_BACK);
    g.fillRect(left, top + CARD_BAR, width, TIMER_HEIGHT);
    g.fillStyle(timerColor(look.timer));
    g.fillRect(left, top + CARD_BAR, width * look.timer, TIMER_HEIGHT);
  }
  g.lineStyle(1, expired ? EXPIRED_EDGE : incident ? STAMP_COLOR : CARD_EDGE);
  g.strokeRoundedRect(left, top, width, TICKET_CARD_HEIGHT, 3);

  const count = look.steps.length + (expired ? 1 : 0);
  const row = count * TILE + (count - 1) * TILE_GAP;
  const cy = top + TILE_TOP + TILE / 2;
  const centerOf = (i: number) => left + (width - row) / 2 + i * (TILE + TILE_GAP) + TILE / 2;
  look.steps.forEach((tile, i) => {
    drawStepTile(g, tile, centerOf(i), cy, expired);
  });
  if (expired) {
    // Its order ran out: the only step left is the bin.
    drawTileBox(g, centerOf(look.steps.length), cy, TILE_CURRENT, CARD_COLOR, STAMP_COLOR);
    drawGlyph(g, 'bin', centerOf(look.steps.length), cy, TILE_CURRENT * GLYPH_SHARE, STAMP_COLOR);
  }
  if (look.blocked && look.steps.length > 0) {
    // Done, but the hotfix ships first: a lock on the last step.
    const x = centerOf(look.steps.length - 1) + TILE / 2;
    const y = cy - TILE / 2;
    g.fillStyle(CARD_COLOR);
    g.fillCircle(x, y, 5);
    drawGlyph(g, 'lock', x, y, 8, LOCK_COLOR);
  }

  if (bar !== null) drawProgressBar(g, 0, top - BAR_GAP - BAR_HEIGHT, bar);
}

/** How far over the card's bottom its top is, with the progress bar if it has one. */
export function ticketCardTop(bar: boolean): number {
  return TICKET_CARD_HEIGHT + (bar ? BAR_GAP + BAR_HEIGHT : 0);
}

/** One step: queued dim, next up bigger and outlined, passed filled with a check, skipped struck. */
function drawStepTile(
  g: Phaser.GameObjects.Graphics,
  tile: StepTile,
  cx: number,
  cy: number,
  expired: boolean,
): void {
  const color = expired ? EXPIRED_GLYPH : stepColor(tile.kind);
  const glyph = TILE * GLYPH_SHARE;
  switch (tile.state) {
    case 'done':
      drawTileBox(g, cx, cy, TILE, color, color);
      drawGlyph(g, 'check', cx, cy, glyph, expired ? EXPIRED_CARD_COLOR : CARD_COLOR);
      break;
    case 'current':
      drawTileBox(g, cx, cy, TILE_CURRENT, SELECT_COLOR, ACCENT_COLOR, 1.5);
      drawGlyph(g, tile.kind, cx, cy, TILE_CURRENT * GLYPH_SHARE, color);
      break;
    case 'skipped':
      drawTileBox(g, cx, cy, TILE, TILE_COLOR, CARD_EDGE);
      drawGlyph(g, tile.kind, cx, cy, glyph, color, 0.35);
      g.lineStyle(1.5, SKIP_COLOR);
      g.lineBetween(cx - TILE / 2, cy + TILE / 2, cx + TILE / 2, cy - TILE / 2);
      break;
    case 'expired':
      drawTileBox(g, cx, cy, TILE, EXPIRED_CARD_COLOR, EXPIRED_EDGE);
      drawGlyph(g, tile.kind, cx, cy, glyph, EXPIRED_GLYPH, 0.6);
      break;
    case 'todo':
      drawTileBox(g, cx, cy, TILE, TILE_COLOR, CARD_EDGE);
      drawGlyph(g, tile.kind, cx, cy, glyph, color, 0.5);
      break;
  }
  const part = tile.part ? PART_COLOR[tile.part] : undefined;
  if (part !== undefined) {
    g.fillStyle(part);
    g.fillRect(cx - TILE / 2 + 1, cy + TILE / 2 - 2, TILE - 2, 2);
  }
  if (tile.state === 'done' && !expired) {
    g.lineStyle(1, CHECK_COLOR);
    g.strokeRoundedRect(cx - TILE / 2, cy - TILE / 2, TILE, TILE, 2);
  }
}

function drawTileBox(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  size: number,
  fill: number,
  edge: number,
  lineWidth = 1,
): void {
  g.fillStyle(fill);
  g.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 2);
  g.lineStyle(lineWidth, edge);
  g.strokeRoundedRect(cx - size / 2, cy - size / 2, size, size, 2);
}

/** A glyph from `./stepLook`, `size` pixels square, centered on (cx, cy). */
export function drawGlyph(
  g: Phaser.GameObjects.Graphics,
  id: GlyphId,
  cx: number,
  cy: number,
  size: number,
  color: number,
  alpha = 1,
): void {
  const k = size / GLYPH_SIZE;
  const ox = cx - size / 2;
  const oy = cy - size / 2;
  g.lineStyle(Math.max(1, GLYPH_STROKE * k), color, alpha);
  g.fillStyle(color, alpha);
  for (const shape of GLYPHS[id]) {
    if (shape.type === 'rect') {
      const [x, y, w, h] = [ox + shape.x * k, oy + shape.y * k, shape.w * k, shape.h * k];
      if (shape.fill) g.fillRect(x, y, w, h);
      else g.strokeRect(x, y, w, h);
    } else if (shape.type === 'circle') {
      const [x, y, r] = [ox + shape.cx * k, oy + shape.cy * k, shape.r * k];
      if (shape.fill) g.fillCircle(x, y, r);
      else g.strokeCircle(x, y, r);
    } else {
      const points: Phaser.Math.Vector2[] = [];
      for (let i = 0; i + 1 < shape.points.length; i += 2) {
        points.push(
          new Phaser.Math.Vector2(
            ox + (shape.points[i] ?? 0) * k,
            oy + (shape.points[i + 1] ?? 0) * k,
          ),
        );
      }
      if (shape.type === 'line') g.strokePoints(points, false);
      else if (shape.fill) g.fillPoints(points, true);
      else g.strokePoints(points, true);
    }
  }
}

/** A work progress bar centered on `x` with its top at `top`; `share` is 0 to 1. */
export function drawProgressBar(
  g: Phaser.GameObjects.Graphics,
  x: number,
  top: number,
  share: number,
): void {
  const left = x - BAR_WIDTH / 2;
  g.fillStyle(BAR_BACK_COLOR);
  g.fillRect(left - 1, top - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2);
  g.fillStyle(BAR_FILL_COLOR);
  g.fillRect(left, top, BAR_WIDTH * share, BAR_HEIGHT);
}

export const WARN_COLOR = 0xff3030;
const BADGE_RADIUS = 9;

/** A red "!" in a circle centered on (x, y). */
export function drawBadge(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  alpha: number,
): void {
  g.fillStyle(WARN_COLOR, alpha);
  g.fillCircle(x, y, BADGE_RADIUS);
  g.lineStyle(2, 0xffffff, alpha);
  g.strokeCircle(x, y, BADGE_RADIUS);
  g.fillStyle(0xffffff, alpha);
  g.fillRect(x - 1.5, y - 6, 3, 7);
  g.fillRect(x - 1.5, y + 3, 3, 3);
}

/** Calendar icon over an invited player's head. */
const INVITE_SIZE = 22;
const INVITE_RING_RADIUS = 17;

/** A little calendar page in the player's color, with a ring that runs down with the time left. */
export function drawInvite(g: Phaser.GameObjects.Graphics, state: GameState, invite: Invite): void {
  g.clear();
  const color = playerColor(invite.playerId);
  const total = Math.max(1, invite.expiresTick - invite.createdTick);
  const left = Math.max(0, invite.expiresTick - state.tick) / total;
  const done = invite.attendedTicks / Math.max(1, invite.attendTicks);

  g.fillStyle(0x000000, 0.55);
  g.fillCircle(0, 0, INVITE_RING_RADIUS + 3);
  g.lineStyle(4, left < 0.3 ? 0xff5a4f : color);
  g.beginPath();
  g.arc(0, 0, INVITE_RING_RADIUS, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
  g.strokePath();

  const half = INVITE_SIZE / 2;
  g.fillStyle(0xffffff);
  g.fillRect(-half, -half, INVITE_SIZE, INVITE_SIZE);
  g.fillStyle(0xd2322d);
  g.fillRect(-half, -half, INVITE_SIZE, INVITE_SIZE * 0.3);
  // Time sat so far fills the page from the bottom.
  g.fillStyle(0x7cf07c);
  const filled = (INVITE_SIZE * 0.7 - 2) * done;
  g.fillRect(-half + 2, half - 1 - filled, INVITE_SIZE - 4, filled);
  g.lineStyle(2, 0x1a1d24);
  g.strokeRect(-half, -half, INVITE_SIZE, INVITE_SIZE);
}

/** The tile each first-level hint points at. */
export const HINT_TILES: Readonly<Record<HintId, Tile>> = {
  inbox: 'inbox',
  keyboard: 'keyboard',
  ship: 'ship',
};

const HINT_ARROW_SIZE = 12;
const HINT_COLOR = 0xffd166;

/** Labels by the side walls hang inwards, so they stay on screen. */
export function hintLabelOrigin(tileX: number, map: LevelMap): number {
  const side = tileX / Math.max(1, map.width - 1);
  return side < 0.25 ? 0.15 : side > 0.75 ? 0.85 : 0.5;
}

/** An arrow pointing down at (0, 0) with `text` on a label over it. */
export function createHintMarker(
  scene: Phaser.Scene,
  text: string,
  originX: number,
): Phaser.GameObjects.Container {
  const arrow = scene.add.graphics();
  arrow.fillStyle(HINT_COLOR);
  arrow.lineStyle(3, 0x1a1d24);
  const tri = [
    new Phaser.Math.Vector2(0, 0),
    new Phaser.Math.Vector2(-HINT_ARROW_SIZE, -HINT_ARROW_SIZE * 1.3),
    new Phaser.Math.Vector2(HINT_ARROW_SIZE, -HINT_ARROW_SIZE * 1.3),
  ];
  arrow.strokePoints(tri, true);
  arrow.fillPoints(tri, true);
  const label = scene.add
    .text(0, -HINT_ARROW_SIZE * 1.3 - 4, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#1a1d24',
      backgroundColor: '#ffd166',
      padding: { x: 8, y: 4 },
    })
    .setOrigin(originX, 1);
  return scene.add.container(0, 0, [arrow, label]);
}
