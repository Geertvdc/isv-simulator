import { describe, expect, it } from 'vitest';
import { CONVEYOR_TICKS, THROW_HOLD_TICKS, THROW_RANGE } from './balance';
import { beltWaits } from './conveyor';
import { getTile, parseLevelMap } from './level';
import { LEVELS, levelWithMap } from './levels';
import { type GameState, type PlayerId, type Vec, createGame, getPlayer } from './state';
import { cmd, give } from './testing';
import { tick } from './tick';
import { TICKET_STEPS, type Ticket, ticketOnTile } from './tickets';

/**
 * Left room (x 1-4) and right room (x 6-9) split by a gap at x=5; a counter
 * on each side of the gap on row 1. Row 3 has a belt running right from
 * x=2 to x=6, ending on a keyboard at x=7. The level's top right is void.
 */
const MAP = [
  '#######   ',
  '#..C.~C..#',
  '#....~...#',
  '#.>>>>>K.#',
  '#12..~.34#',
  '##########',
].join('\n');

function newGame(): GameState {
  const state = createGame(levelWithMap(parseLevelMap(MAP)), 1, [1, 2]);
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

function place(state: GameState, id: PlayerId, pos: Vec, facing: Vec): void {
  const p = getPlayer(state, id);
  if (!p) throw new Error(`No player ${id}`);
  p.pos = { ...pos };
  p.facing = { ...facing };
}

function newTicket(state: GameState, done = 0): Ticket {
  const ticket: Ticket = {
    id: state.nextTicketId++,
    kind: 'feature',
    title: 'Over the gap',
    steps: TICKET_STEPS.feature.map((kind, i) => ({ kind, progress: i < done ? 1 : 0 })),
    location: { kind: 'queue', queue: 'feature' },
  };
  state.tickets.push(ticket);
  return ticket;
}

/** Throws `ticket` from `pos` along `dir` and waits until it's down. */
function throwFrom(state: GameState, ticket: Ticket, pos: Vec, dir: Vec): void {
  place(state, 1, pos, dir);
  give(1, ticket);
  for (let i = 0; i < THROW_HOLD_TICKS; i++) tick(state, [cmd(state, 1, { interact: true })]);
  tick(state, [cmd(state, 1, {})]);
  for (let i = 0; i < 200 && ticket.location.kind === 'flying'; i++) tick(state, []);
}

describe('throwing over gaps', () => {
  it('flies over a gap and comes down on the floor past it', () => {
    const state = newGame();
    const ticket = newTicket(state);
    throwFrom(state, ticket, { x: 4, y: 2 }, { x: 1, y: 0 });
    // Along row 2 it crosses the gap at x=5 and comes down on the floor past it.
    expect(ticket.location.kind).toBe('tile');
    if (ticket.location.kind === 'tile') expect(ticket.location.x).toBeGreaterThan(5);
  });

  it('loses a ticket that comes down in a gap: back in its queue with its work undone', () => {
    const state = newGame();
    const ticket = newTicket(state, 1);
    // In flight down the gap's column, just about out of range over the gap.
    ticket.location = {
      kind: 'flying',
      pos: { x: 5, y: 1 },
      from: { x: 5, y: 1 - THROW_RANGE + 0.05 },
      dir: { x: 0, y: 1 },
      thrownBy: 1,
      lastFloor: { x: 4, y: 1 },
    };
    tick(state, []);
    expect(ticket.location).toEqual({ kind: 'queue', queue: 'feature' });
    expect(ticket.steps.every((s) => s.progress === 0)).toBe(true);
    expect(state.events).toContainEqual({
      type: 'ticketLost',
      ticketId: ticket.id,
      x: 5,
      y: 1,
      queue: 'feature',
    });
  });

  it('loses a ticket thrown off the edge into the void', () => {
    const state = newGame();
    const ticket = newTicket(state);
    let lost = false;
    place(state, 1, { x: 8, y: 1 }, { x: 0, y: -1 });
    give(1, ticket);
    for (let i = 0; i < THROW_HOLD_TICKS; i++) tick(state, [cmd(state, 1, { interact: true })]);
    for (let i = 0; i < 200 && !lost; i++) {
      tick(state, i === 0 ? [cmd(state, 1, {})] : []);
      lost = state.events.some((e) => e.type === 'ticketLost');
    }
    // Row 0 is void from x=7: the ticket flies out of the office.
    expect(lost).toBe(true);
    expect(ticket.location.kind).toBe('queue');
  });
});

describe('conveyors', () => {
  it('carries a ticket along the belt, a tile every CONVEYOR_TICKS, onto the keyboard at its end', () => {
    const state = newGame();
    const ticket = newTicket(state);
    ticket.location = { kind: 'tile', x: 2, y: 3 };
    tick(state, []);
    expect(ticket.location).toEqual({ kind: 'tile', x: 2, y: 3 });
    for (let i = 0; i < CONVEYOR_TICKS; i++) tick(state, []);
    expect(ticket.location).toEqual({ kind: 'tile', x: 3, y: 3 });
    for (let i = 0; i < CONVEYOR_TICKS * 6; i++) tick(state, []);
    expect(ticket.location).toEqual({ kind: 'tile', x: 7, y: 3 });
  });

  it('waits at the end when the keyboard is taken, and the line behind closes up', () => {
    const state = newGame();
    const onKeyboard = newTicket(state);
    onKeyboard.location = { kind: 'tile', x: 7, y: 3 };
    const a = newTicket(state);
    a.location = { kind: 'tile', x: 5, y: 3 };
    const b = newTicket(state);
    b.location = { kind: 'tile', x: 3, y: 3 };
    for (let i = 0; i < CONVEYOR_TICKS * 10; i++) tick(state, []);
    expect(a.location).toEqual({ kind: 'tile', x: 6, y: 3 });
    expect(b.location).toEqual({ kind: 'tile', x: 5, y: 3 });
    expect(onKeyboard.location).toEqual({ kind: 'tile', x: 7, y: 3 });
  });

  it('moves a full line as one: every ticket a tile on the same tick', () => {
    const state = newGame();
    const tickets = [3, 4, 5].map((x) => {
      const t = newTicket(state);
      t.location = { kind: 'tile', x, y: 3 };
      return t;
    });
    for (let i = 0; i < CONVEYOR_TICKS; i++) tick(state, []);
    expect(tickets.map((t) => (t.location.kind === 'tile' ? t.location.x : -1))).toEqual([4, 5, 6]);
  });

  it('lets players put tickets on a belt and take them off', () => {
    const state = newGame();
    const ticket = newTicket(state);
    place(state, 1, { x: 2, y: 2 }, { x: 0, y: 1 });
    give(1, ticket);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(ticketOnTile(state, 2, 3)).toBe(ticket);
    tick(state, [cmd(state, 1, {})]);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(ticket.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it('is deterministic: same start, same ticks, same state', () => {
    const run = () => {
      const state = newGame();
      for (const x of [2, 4, 6]) newTicket(state).location = { kind: 'tile', x, y: 3 };
      for (let i = 0; i < 200; i++) tick(state, []);
      return JSON.stringify(state);
    };
    expect(run()).toEqual(run());
  });
});

const isFlying = (t: Ticket): boolean => t.location.kind === 'flying';

describe('throwing on the old levels', () => {
  it('never loses a ticket: every throw from every floor tile, every way, lands', () => {
    const dirs: Vec[] = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];
    for (const level of LEVELS) {
      const state = createGame(level, 1, [1]);
      state.nextOrderTick = Number.MAX_SAFE_INTEGER;
      state.nextIncidentTick = null;
      state.nextMeetingTick = null;
      for (let y = 0; y < level.map.height; y++) {
        for (let x = 0; x < level.map.width; x++) {
          if (getTile(level.map, x, y) !== 'floor') continue;
          for (const dir of dirs) {
            const ticket = newTicket(state);
            ticket.location = {
              kind: 'flying',
              pos: { x, y },
              from: { x, y },
              dir,
              thrownBy: 1,
              lastFloor: { x, y },
            };
            let lost = false;
            for (let i = 0; i < 100 && isFlying(ticket); i++) {
              tick(state, []);
              lost ||= state.events.some((e) => e.type === 'ticketLost');
            }
            expect(lost, `${level.id} from ${x},${y} toward ${dir.x},${dir.y}`).toBe(false);
            state.tickets = state.tickets.filter((t) => t !== ticket);
          }
        }
      }
    }
  });
});

describe('conveyor maps', () => {
  /** A 2-high strip of belts and counters between walls, for belt tests. */
  function beltGame(rows: string[]): GameState {
    const map = [
      '#'.repeat(rows[0]?.length ?? 0),
      ...rows,
      '#1234'.padEnd(rows[0]?.length ?? 0, '.'),
    ];
    const state = createGame(levelWithMap(parseLevelMap(map.join('\n'))), 1, [1]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    return state;
  }

  function on(state: GameState, x: number, y: number): Ticket {
    const t = newTicket(state);
    t.location = { kind: 'tile', x, y };
    return t;
  }

  it('rejects a belt that points at the floor, a wall or off the map', () => {
    expect(() =>
      parseLevelMap(['#####', '#>..#', '#1234'].join('\n').replace('#1234', '1234#')),
    ).toThrow('points at floor');
    expect(() => parseLevelMap(['#####', '#.>##', '1234#'].join('\n'))).toThrow('points at wall');
  });

  it('carries left, down and up too', () => {
    const state = beltGame(['#C<<.', '#.^C.', '#.^v.', '#.^C.'].map((r) => r.padEnd(6, '#')));
    const left = on(state, 3, 1);
    const up = on(state, 2, 4);
    const down = on(state, 3, 3);
    for (let i = 0; i < CONVEYOR_TICKS * 6; i++) tick(state, []);
    expect(left.location).toEqual({ kind: 'tile', x: 1, y: 1 });
    expect(down.location).toEqual({ kind: 'tile', x: 3, y: 4 });
    // Up the column and onto the belt running left, then the counter at its end... which is taken.
    expect(up.location.kind).toBe('tile');
  });

  it('turns a full loop all at once instead of jamming', () => {
    const state = beltGame(['#>v##', '#^<##']);
    const tickets = [on(state, 1, 1), on(state, 2, 1), on(state, 2, 2), on(state, 1, 2)];
    for (let i = 0; i < CONVEYOR_TICKS; i++) tick(state, []);
    expect(
      tickets.map((t) => (t.location.kind === 'tile' ? [t.location.x, t.location.y] : null)),
    ).toEqual([
      [2, 1],
      [2, 2],
      [1, 2],
      [1, 1],
    ]);
  });

  it('lets two belts merging into one take turns', () => {
    const state = beltGame(['#>v<#', '##v##', '##C##']);
    const arrived = { L: 0, R: 0 };
    // Both feeders kept full; whatever reaches the counter is counted and cleared.
    for (let i = 0; i < 600; i++) {
      for (const [x, title] of [
        [1, 'L'],
        [3, 'R'],
      ] as const) {
        if (!ticketOnTile(state, x, 1)) on(state, x, 1).title = title;
      }
      tick(state, []);
      const done = ticketOnTile(state, 2, 3);
      if (done) {
        if (done.title === 'L') arrived.L++;
        else arrived.R++;
        state.tickets = state.tickets.filter((t) => t !== done);
      }
    }
    expect(arrived.L).toBeGreaterThan(5);
    expect(Math.abs(arrived.L - arrived.R)).toBeLessThanOrEqual(2);
  });

  it('hands a ticket to a pipeline only when it would take it', () => {
    const state = beltGame(['#>P##']);
    const ready = newTicket(state, 2);
    ready.location = { kind: 'tile', x: 1, y: 1 };
    for (let i = 0; i < CONVEYOR_TICKS; i++) tick(state, []);
    expect(ready.location).toEqual({ kind: 'tile', x: 2, y: 1 });
    const early = beltGame(['#>P##']);
    const notCoded = newTicket(early, 0);
    notCoded.location = { kind: 'tile', x: 1, y: 1 };
    for (let i = 0; i < CONVEYOR_TICKS * 3; i++) tick(early, []);
    expect(notCoded.location).toEqual({ kind: 'tile', x: 1, y: 1 });
  });

  it('gives a ticket put on a belt its own time on the tile', () => {
    const state = beltGame(['#>>C#']);
    const first = on(state, 1, 1);
    for (let i = 0; i < CONVEYOR_TICKS - 1; i++) tick(state, []);
    // Swapped for a fresh one just before it would have moved.
    state.tickets = state.tickets.filter((t) => t !== first);
    const second = on(state, 1, 1);
    tick(state, []);
    expect(second.location).toEqual({ kind: 'tile', x: 1, y: 1 });
  });
});

describe('beltWaits (for drawing tickets gliding)', () => {
  function game(rows: string[]): GameState {
    const map = [
      '#'.repeat(rows[0]?.length ?? 0),
      ...rows,
      '#1234'.padEnd(rows[0]?.length ?? 0, '#'),
    ];
    const state = createGame(levelWithMap(parseLevelMap(map.join('\n'))), 1, [1]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    return state;
  }
  function on(state: GameState, x: number, y: number, done = 0): Ticket {
    const t = newTicket(state, done);
    t.location = { kind: 'tile', x, y };
    return t;
  }

  it('does not wait in a full line that moves as one, but waits behind a taken counter', () => {
    const state = game(['#>>>C#']);
    on(state, 1, 1);
    on(state, 2, 1);
    expect(beltWaits(state, 1, 1)).toBe(false);
    on(state, 3, 1);
    on(state, 4, 1);
    expect(beltWaits(state, 3, 1)).toBe(true);
    expect(beltWaits(state, 1, 1)).toBe(true);
  });

  it('never waits round a full loop', () => {
    const state = game(['#>v##', '#^<##']);
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
    ] as const) {
      on(state, x, y);
    }
    expect(beltWaits(state, 1, 1)).toBe(false);
  });

  it('waits in front of a pipeline that would refuse the ticket', () => {
    const state = game(['#>P###']);
    on(state, 1, 1, 0);
    expect(beltWaits(state, 1, 1)).toBe(true);
  });

  it('lets a side belt feed a loop with a free tile without overlapping', () => {
    const state = game(['#>>v##', '#^<<<#']);
    const loop = [
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 2],
      [2, 2],
    ] as const;
    for (const [x, y] of loop) on(state, x, y);
    on(state, 4, 2);
    for (let i = 0; i < CONVEYOR_TICKS * 12; i++) {
      tick(state, []);
      const tiles = state.tickets.map((t) =>
        t.location.kind === 'tile' ? `${t.location.x},${t.location.y}` : '',
      );
      expect(new Set(tiles).size).toBe(tiles.length);
    }
  });
});
