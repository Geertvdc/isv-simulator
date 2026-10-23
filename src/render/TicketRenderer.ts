import Phaser from 'phaser';
import { stationWorkStep } from '../sim/interact';
import { PAIR_RATE, THROW_RANGE, WORK_RATE } from '../sim/balance';
import { pairingText } from '../sim/content';
import { getTile } from '../sim/level';
import type { GameState } from '../sim/state';
import { QUEUE_TILE, type QueueKind, type Ticket, queuedTickets } from '../sim/tickets';
import type { RoundView } from './roundView';
import {
  BAR_GAP,
  BAR_HEIGHT,
  CARD_HEIGHT,
  PAIRING_COLOR,
  drawTicketCard,
  isPaired,
} from './billboards';
import type { MapRenderer } from './MapRenderer';
import { BODY_HEIGHT, PLAYER_DEPTH_OFFSET } from './PlayerRenderer';
import { tileDepth, tileToScreen } from './projection';

/** Queued tickets stack up on their queue; past this many only the count grows. */
const QUEUE_STACK_MAX = 4;
const QUEUE_STACK_STEP = 5;

/** Card bottom above the carrier's feet. */
const CARRY_LIFT = BODY_HEIGHT + 8;
/** Extra height at the top of a throw's arc. */
const THROW_ARC = 24;
/** A card lying on the floor sits this far below the tile center (half the card shows over it). */
const FLOOR_LIFT = CARD_HEIGHT / 3;
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
  private readonly queueCounts = new Map<QueueKind, Phaser.GameObjects.Text>();
  private readonly anchors = new Map<QueueKind, { x: number; y: number; depth: number } | null>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapRenderer: MapRenderer,
  ) {}

  sync(view: RoundView): void {
    const { state } = view;
    const seen = new Set<number>();
    for (const ticket of state.tickets) {
      const placed = this.place(view, ticket);
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
      // Over a carried card its title; over a keyboard two players code at, that they're pairing.
      const paired = isPaired(state, ticket);
      sprite.title
        .setText(paired ? pairingText(PAIR_RATE / WORK_RATE) : ticket.title)
        .setColor(paired ? PAIRING_COLOR : '#ffffff')
        // A dark backing so the pairing label reads over the station.
        .setBackgroundColor(paired ? 'rgba(0, 0, 0, 0.65)' : '')
        .setPosition(
          placed.x,
          placed.y - CARD_HEIGHT - (bar === null ? 2 : BAR_HEIGHT + BAR_GAP + 4),
        )
        .setDepth(placed.depth)
        .setVisible((carried || paired) && placed.visible);
      sprite.g.setVisible(placed.visible);
      const key = `${ticket.steps.map((s) => s.progress >= 1).join()}|${bar ?? ''}`;
      if (key !== sprite.drawn) {
        sprite.drawn = key;
        drawTicketCard(sprite.g, ticket, bar);
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
    queue: QueueKind,
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
    view: RoundView,
    ticket: Ticket,
  ): { x: number; y: number; depth: number; visible: boolean } | null {
    const loc = ticket.location;
    if (loc.kind === 'queue') {
      const anchor = this.queueAnchor(view.state, loc.queue);
      if (!anchor) return null;
      const index = queuedTickets(view.state, loc.queue).indexOf(ticket);
      // The oldest ticket, the one you'd grab next, sits on top.
      const fromTop = Math.min(index, QUEUE_STACK_MAX);
      const level = Math.min(queuedTickets(view.state, loc.queue).length, QUEUE_STACK_MAX) - 1;
      const height = Math.max(0, level - fromTop);
      return {
        x: anchor.x,
        y: anchor.y - height * QUEUE_STACK_STEP,
        depth: anchor.depth + height * 0.0001,
        visible: index < QUEUE_STACK_MAX,
      };
    }
    if (loc.kind === 'tile' && getTile(view.state.level, loc.x, loc.y) === 'floor') {
      const s = tileToScreen(loc.x, loc.y);
      return {
        x: s.x,
        y: s.y + FLOOR_LIFT,
        depth: tileDepth(loc.x, loc.y) + ON_TILE_DEPTH_OFFSET,
        visible: true,
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
    if (loc.kind === 'flying') {
      const s = tileToScreen(loc.pos.x, loc.pos.y);
      const flown = Math.hypot(loc.pos.x - loc.from.x, loc.pos.y - loc.from.y);
      const arc = Math.sin(Math.PI * Math.min(1, flown / THROW_RANGE)) * THROW_ARC;
      return {
        x: s.x,
        y: s.y - CARRY_LIFT - arc,
        depth: tileDepth(loc.pos.x, loc.pos.y) + CARRIED_DEPTH_OFFSET,
        visible: true,
      };
    }
    const pos = view.renderPos(loc.playerId);
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
