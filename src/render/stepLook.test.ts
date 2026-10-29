import { describe, expect, it } from 'vitest';
import type { StepKind, Ticket, TicketKind } from '../sim/tickets';
import {
  GLYPHS,
  orderStepTiles,
  orderTimeShare,
  recipeStepTiles,
  ticketStepTiles,
  timerColor,
} from './stepLook';

function ticket(
  kind: TicketKind,
  steps: [StepKind, number][],
  { orderId = 1, expired = false, id = 1 } = {},
): Ticket {
  return {
    id,
    kind,
    domain: 'general',
    title: 'Dark mode',
    steps: steps.map(([k, progress]) => ({ kind: k, progress })),
    location: { kind: 'queue', queue: 'feature' },
    orderId,
    expired,
  };
}

const states = (t: Pick<Ticket, 'steps' | 'expired'>) => ticketStepTiles(t).map((s) => s.state);

describe('ticketStepTiles', () => {
  it('makes the first step current and queues the rest on a new ticket', () => {
    expect(
      states(
        ticket('feature', [
          ['code', 0],
          ['test', 0],
          ['pipeline', 0],
        ]),
      ),
    ).toEqual(['current', 'todo', 'todo']);
  });

  it('passes finished steps and moves on to the next', () => {
    const t = ticket('feature', [
      ['code', 1],
      ['test', 0.4],
      ['pipeline', 0],
    ]);
    expect(states(t)).toEqual(['done', 'current', 'todo']);
    expect(ticketStepTiles(t)[1]?.progress).toBe(0.4);
  });

  it('marks a test work has moved past as skipped', () => {
    expect(
      states(
        ticket('feature', [
          ['code', 1],
          ['test', 0],
          ['pipeline', 0.2],
        ]),
      ),
    ).toEqual(['done', 'skipped', 'current']);
  });

  it("skips a bug's reproduce test once coding starts", () => {
    const t = ticket('bug', [
      ['test', 0],
      ['code', 0.5],
      ['test', 0],
      ['pipeline', 0],
    ]);
    expect(states(t)).toEqual(['skipped', 'current', 'todo', 'todo']);
  });

  it('kills every unfinished step of an expired ticket', () => {
    const t = ticket(
      'feature',
      [
        ['code', 1],
        ['test', 0],
        ['pipeline', 0],
      ],
      { expired: true },
    );
    expect(states(t)).toEqual(['done', 'expired', 'expired']);
  });

  it('shows every step done on a finished ticket', () => {
    expect(
      states(
        ticket('incident', [
          ['code', 1],
          ['pipeline', 1],
        ]),
      ),
    ).toEqual(['done', 'done']);
  });
});

describe('recipeStepTiles', () => {
  it('queues every step and codes a full-stack recipe twice', () => {
    const tiles = recipeStepTiles(['code', 'merge', 'test', 'pipeline'], 'fullstack');
    expect(tiles.map((t) => [t.kind, t.part])).toEqual([
      ['code', 'frontend'],
      ['code', 'backend'],
      ['merge', null],
      ['test', null],
      ['pipeline', null],
    ]);
    expect(tiles.every((t) => t.state === 'todo')).toBe(true);
  });
});

describe('orderStepTiles', () => {
  const order = {
    id: 7,
    kind: 'feature' as const,
    steps: ['code', 'test', 'pipeline'] as StepKind[],
  };

  it("follows the order's own ticket, not another order's", () => {
    const other = ticket(
      'feature',
      [
        ['code', 1],
        ['test', 1],
        ['pipeline', 0],
      ],
      { orderId: 3 },
    );
    const own = ticket(
      'feature',
      [
        ['code', 1],
        ['test', 0],
        ['pipeline', 0],
      ],
      { orderId: 7, id: 2 },
    );
    expect(orderStepTiles(order, [other, own]).map((t) => t.state)).toEqual([
      'done',
      'current',
      'todo',
    ]);
  });

  it('queues every step without a ticket', () => {
    expect(orderStepTiles(order, []).map((t) => t.state)).toEqual(['todo', 'todo', 'todo']);
  });

  const fullstack = {
    id: 4,
    kind: 'fullstack' as const,
    steps: ['code', 'merge', 'test', 'pipeline'] as StepKind[],
  };

  it('shows each full-stack part on its own code tile', () => {
    const front = ticket('frontend', [['code', 1]], { orderId: 4, id: 1 });
    const back = ticket('backend', [['code', 0.5]], { orderId: 4, id: 2 });
    const tiles = orderStepTiles(fullstack, [front, back]);
    expect(tiles.map((t) => [t.kind, t.part, t.state])).toEqual([
      ['code', 'frontend', 'done'],
      ['code', 'backend', 'current'],
      ['merge', null, 'todo'],
      ['test', null, 'todo'],
      ['pipeline', null, 'todo'],
    ]);
  });

  it('makes the merge current once both parts are coded', () => {
    const front = ticket('frontend', [['code', 1]], { orderId: 4, id: 1 });
    const back = ticket('backend', [['code', 1]], { orderId: 4, id: 2 });
    expect(orderStepTiles(fullstack, [front, back]).map((t) => t.state)).toEqual([
      'done',
      'done',
      'current',
      'todo',
      'todo',
    ]);
  });

  it('follows the merged ticket, both code tiles done', () => {
    const merged = ticket(
      'fullstack',
      [
        ['code', 1],
        ['merge', 1],
        ['test', 0],
        ['pipeline', 0],
      ],
      { orderId: 4 },
    );
    expect(orderStepTiles(fullstack, [merged]).map((t) => t.state)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'todo',
    ]);
  });

  it('kills the steps of expired parts', () => {
    const front = ticket('frontend', [['code', 1]], { orderId: 4, id: 1, expired: true });
    const back = ticket('backend', [['code', 0]], { orderId: 4, id: 2, expired: true });
    expect(orderStepTiles(fullstack, [front, back]).map((t) => t.state)).toEqual([
      'done',
      'expired',
      'expired',
      'expired',
      'expired',
    ]);
  });
});

describe('order timer', () => {
  it('runs from 1 down to 0 and goes green, yellow, red', () => {
    const order = { createdTick: 100, expiresTick: 200 };
    expect(orderTimeShare(order, 100)).toBe(1);
    expect(orderTimeShare(order, 175)).toBe(0.25);
    expect(orderTimeShare(order, 300)).toBe(0);
    expect(timerColor(0.9)).not.toBe(timerColor(0.4));
    expect(timerColor(0.4)).not.toBe(timerColor(0.1));
  });
});

describe('GLYPHS', () => {
  it('keeps every glyph in its 24 x 24 box', () => {
    for (const [id, shapes] of Object.entries(GLYPHS)) {
      for (const shape of shapes) {
        const xs =
          shape.type === 'rect'
            ? [shape.x, shape.x + shape.w, shape.y, shape.y + shape.h]
            : shape.type === 'circle'
              ? [shape.cx - shape.r, shape.cx + shape.r, shape.cy - shape.r, shape.cy + shape.r]
              : shape.points;
        for (const v of xs) {
          expect(v, id).toBeGreaterThanOrEqual(0);
          expect(v, id).toBeLessThanOrEqual(24);
        }
      }
    }
  });
});
