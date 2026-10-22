import Phaser from 'phaser';
import type { HintId } from '../../flow/hints';
import { stationWorkStep } from '../../sim/interact';
import { HINT_TEXTS, MEETING_ROOM_TEXT, PAIRING_TEXT } from '../../sim/content';
import { type LevelMap, getTile } from '../../sim/level';
import { pipelineWarning } from '../../sim/pipeline';
import type { GameState } from '../../sim/state';
import { type QueueKind, queuedTickets } from '../../sim/tickets';
import { HINT_TILES, createHintMarker, hintLabelOrigin } from '../HintRenderer';
import { firstGroup } from '../mapShape';
import { pipelinePulse } from '../effects';
import { drawInvite } from '../MeetingRenderer';
import { drawBadge } from '../PipelineRenderer';
import { TILE_SIZE, type Vec3, gridToWorld } from '../projection';
import type { RoundView } from '../roundView';
import { PAIRING_COLOR, drawProgressBar, drawTicketCard, isPaired } from '../TicketRenderer';
import { HAT_TOP, blockHeight, placeTicket, queueAnchor } from './layout';

/** Where a world point lands on the canvas and how big things drawn there are. */
export interface ScreenPoint {
  x: number;
  y: number;
  /** Overlay scale: 1 is the size the 2D look draws them at zoom 1. */
  scale: number;
  /** Phaser depth: nearer the camera draws on top. */
  depth: number;
}

export type Project = (p: Vec3) => ScreenPoint;

/** Overlays over the 3D world are a bit bigger than in 2D: the camera is further out, and they must read from the couch. */
export const OVERLAY_SCALE = 1.5;
/** Ticket cards float this far over the ticket. */
const CARD_LIFT = 0.28;
/** Over a carrier's head, the card; the calendar invite goes over that. */
const HEAD_CARD_HEIGHT = HAT_TOP + 0.05;
/** The invite is drawn around its middle, so it sits higher to clear the head and hat. */
const HEAD_INVITE_HEIGHT = HAT_TOP + 0.4;
/** Over a carrier, the invite goes over the card and its title: this many overlay pixels up. */
const INVITE_OVER_CARD = 78;
/** Popups start over the head and its card. */
export const POPUP_HEIGHT = HAT_TOP + 0.6;
const HINT_LIFT = 0.15;
const HINT_BOB = 0.08;
const HINT_BOB_MS = 700;
const BADGE_LIFT = 0.55;
const REPAIR_BAR_LIFT = 0.5;
const POPUP_RISE = 48;
const POPUP_MS = 1000;
/** Text stays crisp when overlays scale up on big screens. */
const TEXT_RESOLUTION = 2;

const TEXT_STYLE = {
  fontFamily: 'system-ui, sans-serif',
  fontStyle: 'bold',
  color: '#ffffff',
  stroke: '#000000',
} as const;

interface CardSprite {
  g: Phaser.GameObjects.Graphics;
  title: Phaser.GameObjects.Text;
  drawn: string;
}

/**
 * Everything drawn flat over the 3D world, in Phaser on the canvas above
 * three.js: ticket checklists and progress bars, queue counts, pipeline
 * badges and repair bars, meeting invites, first-level hints, popups and
 * debug labels. Reuses the 2D drawing code, placed and scaled from the 3D
 * camera every frame. Phaser's camera stays at zoom 1, so world = canvas pixels.
 */
export class Overlays {
  private readonly cards = new Map<number, CardSprite>();
  private readonly queueCounts = new Map<QueueKind, Phaser.GameObjects.Text>();
  private readonly invites = new Map<number, Phaser.GameObjects.Graphics>();
  private readonly pipelines = new Map<string, Phaser.GameObjects.Graphics>();
  private readonly hints = new Map<HintId, Phaser.GameObjects.Container>();
  private readonly debugLabels: { text: Phaser.GameObjects.Text; at: Vec3 }[] = [];
  private readonly meetingLabel: { text: Phaser.GameObjects.Text; at: Vec3 } | null = null;
  private readonly popups: { label: Phaser.GameObjects.Text; at: Vec3; startMs: number }[] = [];
  /** Where each hint points, worked out once. */
  private readonly hintAnchors = new Map<HintId, { at: Vec3; tileX: number } | null>();
  private debug = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: LevelMap,
  ) {
    const tiles = map.meetingTiles;
    if (tiles.length > 0) {
      const cx = tiles.reduce((sum, t) => sum + t.x, 0) / tiles.length;
      const top = Math.min(...tiles.map((t) => t.y));
      const text = this.text(MEETING_ROOM_TEXT, 13, '#e6dcff').setOrigin(0.5, 0);
      this.meetingLabel = { text, at: gridToWorld(cx, top - 0.45) };
    }
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = getTile(map, x, y);
        if (!tile) continue;
        const spawn = map.spawns.findIndex((s) => s.x === x && s.y === y);
        const text = this.text(spawn >= 0 ? `P${spawn + 1}` : `${x},${y}`, 10, '#ffffff')
          .setFontFamily('monospace')
          .setColor(spawn >= 0 ? '#ffd166' : '#ffffff')
          .setVisible(false);
        this.debugLabels.push({ text, at: gridToWorld(x, y, blockHeight(map, x, y)) });
      }
    }
  }

  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  /** Places every overlay from `view` with the camera as `project` has it now. */
  sync(
    view: RoundView,
    hints: readonly HintId[],
    hintsVisible: boolean,
    timeMs: number,
    project: Project,
  ): void {
    const { state } = view;
    this.syncCards(view, project);
    this.syncQueueCounts(state, project);
    this.syncInvites(view, project);
    this.syncPipelines(state, timeMs, project);
    this.syncHints(hints, hintsVisible, timeMs, project);
  }

  /** The overlays that show outside rounds too (labels on the map), and popups. */
  place(project: Project, timeMs: number): void {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const popup = this.popups[i];
      if (!popup) continue;
      const t = (timeMs - popup.startMs) / POPUP_MS;
      if (t >= 1) {
        popup.label.destroy();
        this.popups.splice(i, 1);
        continue;
      }
      // Re-projected every frame, so it shakes and resizes along with the world.
      const p = project(popup.at);
      place(popup.label, { ...p, y: p.y - POPUP_RISE * p.scale * t }, 1e6);
      popup.label.setAlpha(1 - t * t * t);
    }
    if (this.meetingLabel) place(this.meetingLabel.text, project(this.meetingLabel.at));
    for (const { text, at } of this.debugLabels) {
      text.setVisible(this.debug);
      if (this.debug) place(text, project(at), 1e6);
    }
  }

  /** Text that floats up from world point `at` and fades out. */
  popup(at: Vec3, text: string, color: string, timeMs: number): void {
    const label = this.text(text, 20, color).setOrigin(0.5, 1).setStroke('#000000', 4);
    this.popups.push({ label, at, startMs: timeMs });
  }

  private syncCards(view: RoundView, project: Project): void {
    const { state } = view;
    const seen = new Set<number>();
    // Only a queue's top card shows its checklist; the rest is a stack.
    const queueTops = new Set([queuedTickets(state, 'feature')[0], queuedTickets(state, 'bug')[0]]);
    for (const ticket of state.tickets) {
      const loc = ticket.location;
      if (loc.kind === 'queue' && !queueTops.has(ticket)) continue;
      const placed = placeTicket(view, ticket);
      if (!placed?.visible) continue;
      seen.add(ticket.id);
      let card = this.cards.get(ticket.id);
      if (!card) {
        card = {
          g: this.scene.add.graphics(),
          title: this.text(ticket.title, 11, '#ffffff')
            .setOrigin(0.5, 1)
            .setWordWrapWidth(90)
            .setAlign('center'),
          drawn: '',
        };
        this.cards.set(ticket.id, card);
      }
      const tile = loc.kind === 'tile' ? getTile(state.level, loc.x, loc.y) : null;
      const progress = stationWorkStep(ticket, tile)?.progress ?? 0;
      const bar = progress > 0 && progress < 1 ? progress : null;
      const key = `${ticket.steps.map((s) => s.progress >= 1).join()}|${bar ?? ''}`;
      if (key !== card.drawn) {
        card.drawn = key;
        drawTicketCard(card.g, ticket, bar);
      }

      const carrier = loc.kind === 'player' ? view.renderPos(loc.playerId) : undefined;
      const at = carrier
        ? gridToWorld(carrier.x, carrier.y, HEAD_CARD_HEIGHT)
        : { ...placed.pos, y: placed.pos.y + CARD_LIFT };
      const p = project(at);
      place(card.g, p);
      // Over a carried card its title; over a keyboard two players code at, that they're pairing.
      const paired = isPaired(state, ticket);
      card.title
        .setText(paired ? PAIRING_TEXT : ticket.title)
        .setColor(paired ? PAIRING_COLOR : '#ffffff')
        .setVisible(placed.carried || paired);
      const lift = (bar === null ? 26 : 40) * p.scale * OVERLAY_SCALE;
      if (placed.carried || paired) place(card.title, { ...p, y: p.y - lift });
    }
    for (const [id, card] of this.cards) {
      if (seen.has(id)) continue;
      card.g.destroy();
      card.title.destroy();
      this.cards.delete(id);
    }
  }

  /** A "x5" label over each queue holding more than one ticket. */
  private syncQueueCounts(state: GameState, project: Project): void {
    for (const queue of ['feature', 'bug'] as const) {
      const anchor = queueAnchor(this.map, queue);
      if (!anchor) continue;
      let label = this.queueCounts.get(queue);
      if (!label) {
        label = this.text('', 14, '#ffffff').setOrigin(0.5, 1);
        this.queueCounts.set(queue, label);
      }
      const count = queuedTickets(state, queue).length;
      label.setText(`x${count}`).setVisible(count > 1);
      const p = project({ ...anchor, y: anchor.y + CARD_LIFT });
      place(label, { ...p, y: p.y - 36 * p.scale });
    }
  }

  private syncInvites(view: RoundView, project: Project): void {
    const { state } = view;
    const seen = new Set<number>();
    for (const invite of state.invites) {
      const pos = view.renderPos(invite.playerId);
      if (!pos) continue;
      seen.add(invite.id);
      let g = this.invites.get(invite.id);
      if (!g) {
        g = this.scene.add.graphics();
        this.invites.set(invite.id, g);
      }
      drawInvite(g, state, invite);
      const carrying = state.tickets.some(
        (t) => t.location.kind === 'player' && t.location.playerId === invite.playerId,
      );
      if (carrying) {
        // Stacked over the carried card and its title, in screen space so they never overlap.
        const card = project(gridToWorld(pos.x, pos.y, HEAD_CARD_HEIGHT));
        const lift = INVITE_OVER_CARD * card.scale * OVERLAY_SCALE;
        place(g, { ...card, y: card.y - lift });
      } else {
        place(g, project(gridToWorld(pos.x, pos.y, HEAD_INVITE_HEIGHT)));
      }
    }
    for (const [id, g] of this.invites) {
      if (seen.has(id)) continue;
      g.destroy();
      this.invites.delete(id);
    }
  }

  private syncPipelines(state: GameState, timeMs: number, project: Project): void {
    for (const pipeline of state.pipelines) {
      const key = `${pipeline.x},${pipeline.y}`;
      let g = this.pipelines.get(key);
      if (!g) {
        g = this.scene.add.graphics();
        this.pipelines.set(key, g);
      }
      g.clear();
      const top = blockHeight(this.map, pipeline.x, pipeline.y);
      if (pipelineWarning(pipeline)) {
        const pulse = pipelinePulse(pipeline.doneTicks, timeMs);
        drawBadge(g, 0, 0, 0.4 + 0.6 * pulse);
        place(g, project(gridToWorld(pipeline.x + 0.3, pipeline.y, top + BADGE_LIFT)), 1e6);
      } else if (pipeline.broken && pipeline.repair > 0) {
        drawProgressBar(g, 0, 0, pipeline.repair);
        place(g, project(gridToWorld(pipeline.x, pipeline.y, top + REPAIR_BAR_LIFT)), 1e6);
      }
    }
  }

  private syncHints(
    open: readonly HintId[],
    visible: boolean,
    timeMs: number,
    project: Project,
  ): void {
    for (const [id, marker] of this.hints) {
      if (open.includes(id)) continue;
      marker.destroy();
      this.hints.delete(id);
    }
    const bob = Math.sin((timeMs / HINT_BOB_MS) * Math.PI) * HINT_BOB;
    for (const id of open) {
      const anchor = this.hintAnchor(id);
      if (!anchor) continue;
      let marker = this.hints.get(id);
      if (!marker) {
        const origin = hintLabelOrigin(anchor.tileX, this.map);
        marker = createHintMarker(this.scene, HINT_TEXTS[id], origin);
        this.hints.set(id, marker);
      }
      marker.setVisible(visible);
      place(marker, project({ ...anchor.at, y: anchor.at.y + bob }), 1e6 + 1);
    }
    unstackHintLabels([...this.hints.values()]);
  }

  /** Over the middle of the first group of the hint's blocks. */
  private hintAnchor(id: HintId): { at: Vec3; tileX: number } | null {
    const known = this.hintAnchors.get(id);
    if (known !== undefined) return known;
    const group = firstGroup(this.map, HINT_TILES[id]);
    const first = group[0];
    let anchor: { at: Vec3; tileX: number } | null = null;
    if (first) {
      const x = group.reduce((sum, t) => sum + t.x, 0) / group.length;
      const y = group.reduce((sum, t) => sum + t.y, 0) / group.length;
      const top = blockHeight(this.map, first.x, first.y);
      anchor = { at: gridToWorld(x, y, top + HINT_LIFT), tileX: first.x };
    }
    this.hintAnchors.set(id, anchor);
    return anchor;
  }

  private text(text: string, size: number, color: string): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, text, { ...TEXT_STYLE, fontSize: `${size}px`, color, strokeThickness: 3 })
      .setResolution(TEXT_RESOLUTION);
  }
}

/** Puts an overlay at `p`, scaled for its distance; `depth` overrides the nearer-on-top order. */
function place(
  obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Depth,
  p: ScreenPoint,
  depth?: number,
): void {
  const scale = p.scale * OVERLAY_SCALE;
  obj.setPosition(p.x, p.y);
  obj.setScale(scale);
  obj.setDepth(depth ?? p.depth);
}

/** Overlay scale for `pixelsPerUnit` world-unit pixels: the 2D look has `TILE_SIZE` per tile at zoom 1. */
export function overlayScale(pixelsPerUnit: number): number {
  return pixelsPerUnit / TILE_SIZE;
}

/** Gap kept between hint labels that would overlap, in canvas pixels. */
const HINT_LABEL_GAP = 4;
const HINT_LABEL_BASE_Y = 'baseY';

/**
 * Lifts hint labels that would cover each other (stations next to each
 * other in depth project close together): the lower one stays, the one
 * above moves up. Only the label moves; each arrow keeps pointing at its
 * station.
 */
function unstackHintLabels(markers: readonly Phaser.GameObjects.Container[]): void {
  const labels: { label: Phaser.GameObjects.Text; marker: Phaser.GameObjects.Container }[] = [];
  for (const marker of markers) {
    const label = marker.list[1];
    if (!(label instanceof Phaser.GameObjects.Text) || !marker.visible) continue;
    const base: unknown = label.getData(HINT_LABEL_BASE_Y);
    if (typeof base === 'number') label.y = base;
    else label.setData(HINT_LABEL_BASE_Y, label.y);
    labels.push({ label, marker });
  }
  // Bottom of the screen first: those keep their place.
  const bounds = (l: Phaser.GameObjects.Text) => l.getBounds();
  labels.sort((a, b) => bounds(b.label).bottom - bounds(a.label).bottom);
  const kept: Phaser.Geom.Rectangle[] = [];
  for (const { label, marker } of labels) {
    let r = bounds(label);
    for (const other of kept) {
      if (!Phaser.Geom.Rectangle.Overlaps(r, other)) continue;
      const lift = r.bottom - other.top + HINT_LABEL_GAP;
      label.y -= lift / marker.scaleY;
      r = bounds(label);
    }
    kept.push(r);
  }
}
