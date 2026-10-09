import Phaser from 'phaser';
import { stationStep } from '../sim/interact';
import { type Tile, getTile } from '../sim/level';
import { type StepKind, type Ticket, getStep } from '../sim/tickets';
import type { GameLoop } from './GameLoop';
import { type MapRenderer, tileColor } from './MapRenderer';
import { BODY_HEIGHT, PLAYER_DEPTH_OFFSET } from './PlayerRenderer';
import { tileDepth, tileToScreen } from './projection';

/** Placeholder ticket cards until the art pass. */
const CARD_WIDTH = 34;
const CARD_HEIGHT = 24;
const CARD_COLOR = 0xf4f1e8;
const OUTLINE_COLOR = 0x1a1d24;
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
      const kind = stationStep(tile);
      const progress = kind ? (getStep(ticket, kind)?.progress ?? 0) : 0;
      const bar = progress > 0 && progress < 1 ? progress : null;

      sprite.g.setPosition(placed.x, placed.y).setDepth(placed.depth);
      sprite.title
        .setPosition(placed.x, placed.y - CARD_HEIGHT - 2)
        .setDepth(placed.depth)
        .setVisible(carried);
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
  }

  /** Screen point of the card's bottom center, and its depth. */
  private place(loop: GameLoop, ticket: Ticket): { x: number; y: number; depth: number } | null {
    const loc = ticket.location;
    if (loc.kind === 'tile') {
      const top = this.mapRenderer.blockTopCenter(loc.x, loc.y);
      if (!top) return null;
      return {
        x: top.x,
        y: top.y + CARD_HEIGHT / 3,
        depth: tileDepth(loc.x, loc.y) + ON_TILE_DEPTH_OFFSET,
      };
    }
    const pos = loop.renderPos(loc.playerId);
    if (!pos) return null;
    const s = tileToScreen(pos.x, pos.y);
    return { x: s.x, y: s.y - CARRY_LIFT, depth: tileDepth(pos.x, pos.y) + CARRIED_DEPTH_OFFSET };
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
  const left = -CARD_WIDTH / 2;
  const top = -CARD_HEIGHT;
  g.fillStyle(CARD_COLOR);
  g.lineStyle(2, OUTLINE_COLOR);
  g.fillRoundedRect(left, top, CARD_WIDTH, CARD_HEIGHT, 3);
  g.strokeRoundedRect(left, top, CARD_WIDTH, CARD_HEIGHT, 3);
  // Two "text" lines on the card.
  g.fillStyle(ICON_TODO_COLOR);
  g.fillRect(left + 5, top + 4, CARD_WIDTH - 10, 2);
  g.fillRect(left + 5, top + 8, CARD_WIDTH - 16, 2);

  const spacing = CARD_WIDTH / (ticket.steps.length + 1);
  ticket.steps.forEach((step, i) => {
    const x = left + spacing * (i + 1);
    const y = -ICON_RADIUS - 3;
    const done = step.progress >= 1;
    g.fillStyle(done ? tileColor(STEP_STATION[step.kind]) : ICON_TODO_COLOR);
    g.fillCircle(x, y, ICON_RADIUS);
    g.lineStyle(1.5, done ? OUTLINE_COLOR : tileColor(STEP_STATION[step.kind]));
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
