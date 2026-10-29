/**
 * How tickets show their steps, shared by the HUD order cards, the intro
 * recipes and the ticket cards in the world: each step's station color and
 * glyph, the kind and timer colors, and the display state of every step,
 * read like CI checks (queued, running, passed, skipped). Pure: the HUD
 * draws the glyphs as SVG, the billboards with Phaser Graphics.
 */

import type { BlockTile } from '../sim/level';
import type { Order } from '../sim/orders';
import {
  PART_KINDS,
  type StepKind,
  type Ticket,
  type TicketKind,
  workableSteps,
} from '../sim/tickets';
import { tileColor } from './mapLook';

/** What a step tile shows: queued, next up (running once worked on), passed, skipped, or dead. */
export type StepState = 'todo' | 'current' | 'done' | 'skipped' | 'expired';

export interface StepTile {
  kind: StepKind;
  state: StepState;
  /** 0 to 1. */
  progress: number;
  /** On a full-stack order, which part a `code` tile stands for. */
  part: TicketKind | null;
}

/** The station that does each step. */
export const STEP_STATION: Readonly<Record<StepKind, BlockTile>> = {
  design: 'whiteboard',
  code: 'keyboard',
  merge: 'merge',
  review: 'review',
  test: 'testBench',
  pipeline: 'pipeline',
};

/** A step's color: its station's. */
export function stepColor(kind: StepKind): number {
  return tileColor(STEP_STATION[kind]);
}

/**
 * Each kind of ticket in a syntax color: the commit type on the HUD card and
 * the order number on the world card.
 */
export const KIND_COLOR: Readonly<Record<TicketKind, number>> = {
  feature: 0xd68cff,
  bug: 0xffad66,
  incident: 0xff5a4f,
  frontend: 0x7fb4ff,
  backend: 0x9ee37d,
  fullstack: 0x5fe6ff,
};

/** The two marks a full-stack recipe's code tiles carry. */
export const PART_COLOR: Readonly<Partial<Record<TicketKind, number>>> = {
  frontend: 0x7ab8f0,
  backend: 0x6cbf7a,
};

export const CHECK_COLOR = 0x9ee37d;
export const SKIP_COLOR = 0xffad66;
export const STAMP_COLOR = 0xff5a4f;
export const LOCK_COLOR = 0xffd166;

/** Timer bar colors: green with time to spare, yellow from half time, red in the last quarter. */
const TIMER_COLORS = { ok: 0x9ee37d, warn: 0xffd166, danger: 0xff5a4f } as const;
const TIMER_WARN_SHARE = 0.5;
const TIMER_DANGER_SHARE = 0.25;

export function timerColor(share: number): number {
  if (share > TIMER_WARN_SHARE) return TIMER_COLORS.ok;
  if (share > TIMER_DANGER_SHARE) return TIMER_COLORS.warn;
  return TIMER_COLORS.danger;
}

/** Share of an order's time still left at `tick`, 0 to 1. */
export function orderTimeShare(
  order: Pick<Order, 'createdTick' | 'expiresTick'>,
  tick: number,
): number {
  const limit = order.expiresTick - order.createdTick;
  if (limit <= 0) return 0;
  return Math.min(1, Math.max(0, order.expiresTick - tick) / limit);
}

export function cssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Each step of `ticket` as a tile: done steps passed, the first workable one
 * current, unfinished steps work has moved past skipped (only tests can be),
 * the rest queued. On an expired ticket every unfinished step is dead.
 */
export function ticketStepTiles(ticket: Pick<Ticket, 'steps' | 'expired'>): StepTile[] {
  const current = workableSteps(ticket)[0];
  let lastWorked = -1;
  ticket.steps.forEach((s, i) => {
    if (s.progress > 0) lastWorked = i;
  });
  return ticket.steps.map((step, i) => ({
    kind: step.kind,
    progress: step.progress,
    part: null,
    state:
      step.progress >= 1
        ? 'done'
        : ticket.expired
          ? 'expired'
          : step === current
            ? 'current'
            : i < lastWorked
              ? 'skipped'
              : 'todo',
  }));
}

/** A recipe's steps as queued tiles; a full-stack one codes twice, front end and back end. */
export function recipeStepTiles(steps: readonly StepKind[], kind?: TicketKind): StepTile[] {
  const tiles = steps.map((k): StepTile => ({ kind: k, state: 'todo', progress: 0, part: null }));
  return kind === 'fullstack' ? splitCode(tiles) : tiles;
}

/**
 * The tiles of an order card, live from the order's ticket(s) in `tickets`.
 * A full-stack order shows two code tiles: each part's own until they're
 * merged, then the merged ticket's.
 */
export function orderStepTiles(
  order: Pick<Order, 'id' | 'kind' | 'steps'>,
  tickets: readonly Ticket[],
): StepTile[] {
  const own = tickets.filter((t) => t.orderId === order.id);
  if (order.kind !== 'fullstack') {
    const ticket = own[0];
    return ticket ? ticketStepTiles(ticket) : recipeStepTiles(order.steps);
  }
  const merged = own.find((t) => t.kind === 'fullstack');
  if (merged) return splitCode(ticketStepTiles(merged));

  const parts = PART_KINDS.map((part) => own.find((t) => t.kind === part));
  const expired = parts.some((t) => t?.expired);
  const coded = parts.every((t) => t && t.steps.every((s) => s.progress >= 1));
  const tiles: StepTile[] = [];
  for (const step of order.steps) {
    if (step === 'code') {
      PART_KINDS.forEach((part, i) => {
        const ticket = parts[i];
        const tile = ticket ? ticketStepTiles(ticket)[0] : undefined;
        tiles.push(tile ? { ...tile, part } : { ...queued(step, expired), part });
      });
    } else if (step === 'merge' && coded && !expired) {
      tiles.push({ kind: step, state: 'current', progress: 0, part: null });
    } else {
      tiles.push(queued(step, expired));
    }
  }
  return tiles;
}

function queued(kind: StepKind, expired: boolean): StepTile {
  return { kind, state: expired ? 'expired' : 'todo', progress: 0, part: null };
}

function splitCode(tiles: readonly StepTile[]): StepTile[] {
  return tiles.flatMap((t) =>
    t.kind === 'code' ? PART_KINDS.map((part) => ({ ...t, part })) : [t],
  );
}

/*
 * Glyphs: tiny line drawings in a 24 x 24 box, drawn with a round stroke of
 * GLYPH_STROKE in a single color. `poly` is a closed shape, `line` an open
 * one; `fill` fills instead of stroking.
 */
export type GlyphShape =
  | { type: 'rect'; x: number; y: number; w: number; h: number; fill?: boolean }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: boolean }
  | { type: 'poly'; points: readonly number[]; fill?: boolean }
  | { type: 'line'; points: readonly number[] };

export type GlyphId = StepKind | 'check' | 'bin' | 'lock' | 'bug';

export const GLYPH_SIZE = 24;
export const GLYPH_STROKE = 2.5;

export const GLYPHS: Readonly<Record<GlyphId, readonly GlyphShape[]>> = {
  // A keyboard.
  code: [
    { type: 'rect', x: 2, y: 6, w: 20, h: 13 },
    { type: 'rect', x: 5, y: 9, w: 3, h: 2.5, fill: true },
    { type: 'rect', x: 10.5, y: 9, w: 3, h: 2.5, fill: true },
    { type: 'rect', x: 16, y: 9, w: 3, h: 2.5, fill: true },
    { type: 'line', points: [7, 15.5, 17, 15.5] },
  ],
  // A flask from the test bench.
  test: [
    { type: 'line', points: [8, 3, 16, 3] },
    { type: 'poly', points: [10, 3, 10, 10, 4, 21, 20, 21, 14, 10, 14, 3] },
    { type: 'poly', points: [6.2, 17, 17.8, 17, 20, 21, 4, 21], fill: true },
  ],
  // Two heads over one diff.
  review: [
    { type: 'circle', cx: 8, cy: 7, r: 3.5, fill: true },
    { type: 'circle', cx: 16.5, cy: 9, r: 3.5, fill: true },
    { type: 'poly', points: [2, 20, 3.5, 13, 12.5, 13, 14, 20], fill: true },
    { type: 'poly', points: [11, 22, 12.5, 15, 20.5, 15, 22, 22], fill: true },
  ],
  // A whiteboard on its stand, with a sketch on it.
  design: [
    { type: 'rect', x: 3, y: 3, w: 18, h: 13 },
    { type: 'line', points: [6, 12, 10, 7, 13, 10, 18, 6] },
    { type: 'line', points: [12, 16, 8, 21] },
    { type: 'line', points: [12, 16, 16, 21] },
  ],
  // Two branches coming together.
  merge: [
    { type: 'circle', cx: 7, cy: 4.5, r: 2.5 },
    { type: 'circle', cx: 17, cy: 4.5, r: 2.5 },
    { type: 'circle', cx: 12, cy: 19.5, r: 2.5 },
    { type: 'line', points: [7, 7, 7, 10, 12, 14, 12, 17] },
    { type: 'line', points: [17, 7, 17, 10, 12, 14] },
  ],
  // A rocket: to production.
  pipeline: [
    { type: 'poly', points: [12, 2, 16, 7, 16, 16, 8, 16, 8, 7], fill: true },
    { type: 'poly', points: [8, 10, 4, 17, 8, 16], fill: true },
    { type: 'poly', points: [16, 10, 20, 17, 16, 16], fill: true },
    { type: 'poly', points: [10, 17.5, 12, 22, 14, 17.5], fill: true },
  ],
  check: [{ type: 'line', points: [5, 12.5, 10, 17.5, 19, 7] }],
  bin: [
    { type: 'line', points: [4, 6, 20, 6] },
    { type: 'line', points: [10, 6, 10, 3, 14, 3, 14, 6] },
    { type: 'poly', points: [6, 6, 7.5, 21, 16.5, 21, 18, 6] },
    { type: 'line', points: [10, 10, 10, 17] },
    { type: 'line', points: [14, 10, 14, 17] },
  ],
  lock: [
    { type: 'rect', x: 5, y: 11, w: 14, h: 10, fill: true },
    { type: 'line', points: [8, 11, 8, 8, 9.5, 5, 12, 4, 14.5, 5, 16, 8, 16, 11] },
  ],
  bug: [
    {
      type: 'poly',
      points: [12, 7, 16, 9, 17, 14, 15, 19, 12, 20, 9, 19, 7, 14, 8, 9],
      fill: true,
    },
    { type: 'circle', cx: 12, cy: 5, r: 2.5, fill: true },
    { type: 'line', points: [7.5, 11, 3, 9] },
    { type: 'line', points: [16.5, 11, 21, 9] },
    { type: 'line', points: [7, 15, 3, 16.5] },
    { type: 'line', points: [17, 15, 21, 16.5] },
  ],
};
