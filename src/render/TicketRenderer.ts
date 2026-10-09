import Phaser from 'phaser';
import { stationWorkStep } from '../sim/interact';
import { type Tile, getTile } from '../sim/level';
import type { GameState } from '../sim/state';
import {
  QUEUE_TILE,
  type StepKind,
  type Ticket,
  type TicketKind,
  queuedTickets,
} from '../sim/tickets';
import type { GameLoop } from './GameLoop';
import { type MapRenderer, tileColor } from './MapRenderer';
import { BODY_HEIGHT, PLAYER_DEPTH_OFFSET } from './PlayerRenderer';
import { tileDepth, tileToScreen } from './projection';

/** Placeholder ticket cards until the art pass. */
const CARD_MIN_WIDTH = 34;
const CARD_HEIGHT = 24;
const CARD_COLOR: Readonly<Record<TicketKind, number>> = { feature: 0xf4f1e8, bug: 0xf6c4bd };
const OUTLINE_COLOR: Readonly<Record<TicketKind, number>> = { feature: 0x1a1d24, bug: 0xb02a2a };
const ICON_SPACING = 11;
const ICON_RADIUS = 4.5;
const ICON_TODO_COLOR = 0xc9c4b5;
/** Each step's icon takes the color of the station that does it. */
const STEP_STATION: Readonly<Record<StepKind, Exclude<Tile, 'floor'>>> = {
  code: 'keyboard',
  test: 'testBench',
  pipeline: 'pipeline',
};

const BAR_WIDTH = 44;
const BAR_HEIGHT = 7;
const BAR_GAP = 6;
const BAR_BACK_COLOR = 0x1a1d24;
const BAR_FILL_COLOR = 0x7cf07c;

/** Queued tickets stack up on their queue; past this many only the count grows. */
const QUEUE_STACK_MAX = 4;
const QUEUE_STACK_STEP = 5;

/** Card bottom above the carrier's feet. */
const CARRY_LIFT = BODY_HEIGHT + 8;
/** Over the block's label, under the block in front. */
const ON_TILE_DEPTH_OFFSET = 0.015;
/** Over the carrier. */
const CARRIED_DEPTH_OFFSET = PLAYER_DEPTH_OFFSET + 0.005;

interface TicketSprite {
  g: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  /** What the card was last drawn with; redraw only when it changes. */
  drawn: string;
}

/**
 * Syncs one card per ticket, keyed by ticket id: on its tile, or above the
 * head of the player carrying it. Cards show a checklist icon per step, and
 * a progress bar while the station under them is part way through its step.
 */
export class TicketRenderer {
  private readonly sprites = new Map<number, TicketSprite>();
  private readonly queueCounts = new Map<TicketKind, Phaser.GameObjects.Text>();
  private readonly anchors = new Map<TicketKind, { x: number; y: number; depth: number } | null>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapRenderer: MapRenderer,
  ) {}

  sync(loop: GameLoop): void {
    const { state } = loop;
    const seen = new Set<number>();
    for (const ticket of state.tickets) {
      const placed = this.place(loop, ticket);
      if (!placed) continue;
      seen.add(ticket.id);
      let sprite = this.sprites.get(ticket.id);
      if (!sprite) {
        sprite = { g: this.scene.add.graphics(), title: this.createTitle(ticket), drawn: '' };
        this.sprites.set(ticket.id, sprite);
      }

      const carried = ticket.location.kind === 'player';
      const tile =
        ticket.location.kind === 'tile'
          ? getTile(state.level, ticket.location.x, ticket.location.y)
          : null;
      const progress = stationWorkStep(ticket, tile)?.progress ?? 0;
      const bar = progress > 0 && progress < 1 ? progress : null;

      sprite.g.setPosition(placed.x, placed.y).setDepth(placed.depth);
      sprite.title
        .setPosition(placed.x, placed.y - CARD_HEIGHT - 2)
        .setDepth(placed.depth)
        .setVisible(carried && placed.visible);
      sprite.g.setVisible(placed.visible);
      const key = `${ticket.steps.map((s) => s.progress >= 1).join()}|${bar ?? ''}`;
      if (key !== sprite.drawn) {
        sprite.drawn = key;
        draw(sprite.g, ticket, bar);
      }
    }

    for (const [id, sprite] of this.sprites) {
      if (seen.has(id)) continue;
      sprite.g.destroy();
      sprite.title.destroy();
      this.sprites.delete(id);
    }
    this.syncQueueCounts(state);
  }

  /** A "x5" label over each queue holding more tickets than its stack shows. */
  private syncQueueCounts(state: GameState): void {
    for (const queue of ['feature', 'bug'] as const) {
      const count = queuedTickets(state, queue).length;
      const anchor = this.queueAnchor(state, queue);
      let label = this.queueCounts.get(queue);
      if (!label && anchor) {
        label = this.scene.add
          .text(0, 0, '', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
          })
          .setOrigin(0.5, 1);
        this.queueCounts.set(queue, label);
      }
      if (!label || !anchor) continue;
      const shown = Math.min(count, QUEUE_STACK_MAX);
      label
        .setText(`x${count}`)
        .setVisible(count > 1)
        .setPosition(anchor.x, anchor.y - CARD_HEIGHT - shown * QUEUE_STACK_STEP - 2)
        .setDepth(anchor.depth + 0.001);
    }
  }

  /** Bottom center of a queue's stack: the middle of its queue tiles. */
  private queueAnchor(
    state: GameState,
    queue: TicketKind,
  ): { x: number; y: number; depth: number } | null {
    const cached = this.anchors.get(queue);
    if (cached !== undefined) return cached;
    const tiles: { x: number; y: number }[] = [];
    for (let y = 0; y < state.level.height; y++) {
      for (let x = 0; x < state.level.width; x++) {
        if (getTile(state.level, x, y) === QUEUE_TILE[queue]) tiles.push({ x, y });
      }
    }
    const tops = tiles.flatMap((t) => this.mapRenderer.blockTopCenter(t.x, t.y) ?? []);
    if (tops.length === 0) {
      this.anchors.set(queue, null);
      return null;
    }
    const depth = Math.max(...tiles.map((t) => tileDepth(t.x, t.y))) + ON_TILE_DEPTH_OFFSET;
    const x = tops.reduce((sum, p) => sum + p.x, 0) / tops.length;
    const y = tops.reduce((sum, p) => sum + p.y, 0) / tops.length;
    const anchor = { x, y: y + CARD_HEIGHT / 3, depth };
    this.anchors.set(queue, anchor);
    return anchor;
  }

  /** Screen point of the card's bottom center, its depth, and whether it shows. */
  private place(
    loop: GameLoop,
    ticket: Ticket,
  ): { x: number; y: number; depth: number; visible: boolean } | null {
    const loc = ticket.location;
    if (loc.kind === 'queue') {
      const anchor = this.queueAnchor(loop.state, loc.queue);
      if (!anchor) return null;
      const index = queuedTickets(loop.state, loc.queue).indexOf(ticket);
      // The oldest ticket, the one you'd grab next, sits on top.
      const fromTop = Math.min(index, QUEUE_STACK_MAX);
      const level = Math.min(queuedTickets(loop.state, loc.queue).length, QUEUE_STACK_MAX) - 1;
      const height = Math.max(0, level - fromTop);
      return {
        x: anchor.x,
        y: anchor.y - height * QUEUE_STACK_STEP,
        depth: anchor.depth + height * 0.0001,
        visible: index < QUEUE_STACK_MAX,
      };
    }
    if (loc.kind === 'tile') {
      const top = this.mapRenderer.blockTopCenter(loc.x, loc.y);
      if (!top) return null;
      return {
        x: top.x,
        y: top.y + CARD_HEIGHT / 3,
        depth: tileDepth(loc.x, loc.y) + ON_TILE_DEPTH_OFFSET,
        visible: true,
      };
    }
    const pos = loop.renderPos(loc.playerId);
    if (!pos) return null;
    const s = tileToScreen(pos.x, pos.y);
    return {
      x: s.x,
      y: s.y - CARRY_LIFT,
      depth: tileDepth(pos.x, pos.y) + CARRIED_DEPTH_OFFSET,
      visible: true,
    };
  }

  private createTitle(ticket: Ticket): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, ticket.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
        wordWrap: { width: 90 },
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
  }
}

/** Draws the card with its bottom center at (0, 0), and the progress bar above it if any. */
function draw(g: Phaser.GameObjects.Graphics, ticket: Ticket, bar: number | null): void {
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

  if (bar !== null) {
    const barTop = top - BAR_GAP - BAR_HEIGHT;
    g.fillStyle(BAR_BACK_COLOR);
    g.fillRect(-BAR_WIDTH / 2 - 1, barTop - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2);
    g.fillStyle(BAR_FILL_COLOR);
    g.fillRect(-BAR_WIDTH / 2, barTop, BAR_WIDTH * bar, BAR_HEIGHT);
  }
}
