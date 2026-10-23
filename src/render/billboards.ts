import Phaser from 'phaser';
import type { HintId } from '../flow/hints';
import type { BlockTile, LevelMap, Tile } from '../sim/level';
import type { Invite } from '../sim/meetings';
import type { GameState } from '../sim/state';
import type { StepKind, Ticket, TicketKind } from '../sim/tickets';
import { tileColor } from './mapLook';
import { playerColor } from './playerColors';

/*
 * What the 3D view draws flat on the Phaser canvas over the world: ticket
 * cards, progress bars, the pipeline badge, meeting invites and hint markers.
 * Each draws around (0, 0); the 3D overlays place and scale it.
 */

/** Placeholder ticket cards until the art pass. */
const CARD_MIN_WIDTH = 34;
const CARD_HEIGHT = 24;
const CARD_COLOR: Readonly<Record<TicketKind, number>> = {
  feature: 0xf4f1e8,
  bug: 0xf6c4bd,
  incident: 0xff6b57,
  frontend: 0xcfe6ff,
  backend: 0xd3f0d0,
  fullstack: 0xe6d9ff,
};
const OUTLINE_COLOR: Readonly<Record<TicketKind, number>> = {
  feature: 0x1a1d24,
  bug: 0xb02a2a,
  incident: 0x5c0000,
  frontend: 0x2a5d9a,
  backend: 0x2f6a3a,
  fullstack: 0x5a3a9a,
};
const ICON_SPACING = 11;
const ICON_RADIUS = 4.5;
const ICON_TODO_COLOR = 0xc9c4b5;
/** Each step's icon takes the color of the station that does it. */
const STEP_STATION: Readonly<Record<StepKind, BlockTile>> = {
  design: 'whiteboard',
  code: 'keyboard',
  merge: 'merge',
  review: 'review',
  test: 'testBench',
  pipeline: 'pipeline',
};

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
  ticket: Pick<Ticket, 'kind' | 'steps'>,
  bar: number | null,
): void {
  g.clear();
  const width = Math.max(CARD_MIN_WIDTH, (ticket.steps.length + 1) * ICON_SPACING);
  const left = -width / 2;
  const top = -CARD_HEIGHT;
  const outline = OUTLINE_COLOR[ticket.kind];
  g.fillStyle(CARD_COLOR[ticket.kind]);
  g.lineStyle(2, outline);
  g.fillRoundedRect(left, top, width, CARD_HEIGHT, 3);
  g.strokeRoundedRect(left, top, width, CARD_HEIGHT, 3);
  // Two "text" lines on the card.
  g.fillStyle(ICON_TODO_COLOR);
  g.fillRect(left + 5, top + 4, width - 10, 2);
  g.fillRect(left + 5, top + 8, width - 16, 2);

  const spacing = width / (ticket.steps.length + 1);
  ticket.steps.forEach((step, i) => {
    const x = left + spacing * (i + 1);
    const y = -ICON_RADIUS - 3;
    const done = step.progress >= 1;
    g.fillStyle(done ? tileColor(STEP_STATION[step.kind]) : ICON_TODO_COLOR);
    g.fillCircle(x, y, ICON_RADIUS);
    g.lineStyle(1.5, done ? outline : tileColor(STEP_STATION[step.kind]));
    g.strokeCircle(x, y, ICON_RADIUS);
  });

  if (bar !== null) drawProgressBar(g, 0, top - BAR_GAP - BAR_HEIGHT, bar);
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
