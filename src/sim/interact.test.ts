import { describe, expect, it } from 'vitest';
import { WORK_RATE } from './balance';
import { parseLevelMap } from './level';
import {
  type GameState,
  type InputCommand,
  type PlayerId,
  createGame,
  getPlayer,
  targetTile,
} from './state';
import { tick } from './tick';
import {
  STEP_ORDER,
  type StepKind,
  type Ticket,
  getStep,
  ticketCarriedBy,
  ticketOnTile,
} from './tickets';

/**
 * Row 1 holds one of everything; players stand on row 2 facing up.
 * Columns:          1=I 2=K 3=T 4=C 5=C 6=X 7=P 8=S 9=R 10=# (wall) 11=. (floor)
 */
const MAP = [
  '#############',
  '#IKTCCXPSR#.#',
  '#...........#',
  '#1234.......#',
  '#############',
].join('\n');
const COL = { inbox: 1, keyboard: 2, testBench: 3, counter: 4, counter2: 5, bin: 6 } as const;

function newGame(): GameState {
  const state = createGame(parseLevelMap(MAP), 1, [1, 2]);
  // No inbox spawns unless a test asks for them.
  state.nextInboxSpawnTick = Number.MAX_SAFE_INTEGER;
  return state;
}

/** Puts a player on row 2 under column `x`, facing up at row 1. */
function standAt(state: GameState, playerId: PlayerId, x: number): void {
  const p = getPlayer(state, playerId);
  if (!p) throw new Error(`No player ${playerId}`);
  p.pos = { x, y: 2 };
  p.facing = { x: 0, y: -1 };
}

function addTicket(
  state: GameState,
  x: number,
  progress: Partial<Record<StepKind, number>> = {},
): Ticket {
  const ticket: Ticket = {
    id: state.nextTicketId++,
    title: 'Test ticket',
    steps: STEP_ORDER.map((kind) => ({ kind, progress: progress[kind] ?? 0 })),
    location: { kind: 'tile', x, y: 1 },
  };
  state.tickets.push(ticket);
  return ticket;
}

function cmd(
  state: GameState,
  playerId: PlayerId,
  buttons: { interact?: boolean; work?: boolean },
): InputCommand {
  return {
    playerId,
    tick: state.tick,
    move: { x: 0, y: 0 },
    interact: buttons.interact ?? false,
    work: buttons.work ?? false,
  };
}

/** A full press: interact down for one tick, then released. */
function press(state: GameState, playerId: PlayerId = 1): void {
  tick(state, [cmd(state, playerId, { interact: true })]);
  tick(state, [cmd(state, playerId, {})]);
}

function holdWork(state: GameState, ticks: number, playerIds: PlayerId[] = [1]): void {
  for (let i = 0; i < ticks; i++)
    tick(
      state,
      playerIds.map((id) => cmd(state, id, { work: true })),
    );
}

describe('interact: carrying', () => {
  it('picks a ticket up from the inbox, a counter, a keyboard and a test bench', () => {
    for (const x of [COL.inbox, COL.counter, COL.keyboard, COL.testBench]) {
      const state = newGame();
      const t = addTicket(state, x);
      standAt(state, 1, x);
      press(state);
      expect(t.location).toEqual({ kind: 'player', playerId: 1 });
    }
  });

  it('puts a ticket down on an empty counter, keyboard or test bench', () => {
    for (const x of [COL.counter, COL.keyboard, COL.testBench]) {
      const state = newGame();
      const t = addTicket(state, COL.counter2);
      standAt(state, 1, COL.counter2);
      press(state);
      standAt(state, 1, x);
      press(state);
      expect(t.location).toEqual({ kind: 'tile', x, y: 1 });
      expect(ticketCarriedBy(state, 1)).toBeUndefined();
    }
  });

  it('does not put a ticket back on the inbox', () => {
    const state = newGame();
    const t = addTicket(state, COL.inbox);
    standAt(state, 1, COL.inbox);
    press(state);
    press(state);
    expect(t.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it('hands a ticket over via a counter', () => {
    const state = newGame();
    const t = addTicket(state, COL.inbox);
    standAt(state, 1, COL.inbox);
    press(state, 1);
    standAt(state, 1, COL.counter);
    press(state, 1);
    standAt(state, 2, COL.counter);
    press(state, 2);
    expect(t.location).toEqual({ kind: 'player', playerId: 2 });
  });

  it('carries at most one ticket: interacting at a full counter while carrying does nothing', () => {
    const state = newGame();
    const carried = addTicket(state, COL.counter);
    const other = addTicket(state, COL.counter2);
    standAt(state, 1, COL.counter);
    press(state);
    standAt(state, 1, COL.counter2);
    const before = structuredClone(state.tickets);
    press(state);
    expect(state.tickets).toEqual(before);
    expect(carried.location).toEqual({ kind: 'player', playerId: 1 });
    expect(other.location).toEqual({ kind: 'tile', x: COL.counter2, y: 1 });
  });

  it('holds at most one ticket per counter or station', () => {
    for (const x of [COL.counter, COL.keyboard, COL.testBench]) {
      const state = newGame();
      addTicket(state, x);
      const carried = addTicket(state, COL.counter2);
      standAt(state, 1, COL.counter2);
      press(state);
      standAt(state, 1, x);
      press(state);
      expect(carried.location).toEqual({ kind: 'player', playerId: 1 });
      expect(
        state.tickets.filter((t) => t.location.kind === 'tile' && t.location.x === x),
      ).toHaveLength(1);
    }
  });

  it('destroys a carried ticket at the bin', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    press(state);
    standAt(state, 1, COL.bin);
    press(state);
    expect(state.tickets).not.toContain(t);
    expect(ticketCarriedBy(state, 1)).toBeUndefined();
  });

  it('cannot grab a ticket another player carries', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    press(state, 1);
    standAt(state, 2, COL.counter);
    press(state, 2);
    expect(t.location).toEqual({ kind: 'player', playerId: 1 });
    expect(ticketCarriedBy(state, 2)).toBeUndefined();
  });
});

describe('interact: edge-triggered', () => {
  it('holding interact picks up once and never puts down again', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    for (let i = 0; i < 30; i++) tick(state, [cmd(state, 1, { interact: true })]);
    expect(t.location).toEqual({ kind: 'player', playerId: 1 });
  });

  it('acts again after a release', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    tick(state, [cmd(state, 1, { interact: true })]);
    tick(state, [cmd(state, 1, { interact: true })]);
    tick(state, [cmd(state, 1, {})]);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(t.location).toEqual({ kind: 'tile', x: COL.counter, y: 1 });
  });

  it('treats a missing input as a release', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    tick(state, [cmd(state, 1, { interact: true })]);
    tick(state, []);
    tick(state, [cmd(state, 1, { interact: true })]);
    expect(t.location).toEqual({ kind: 'tile', x: COL.counter, y: 1 });
  });
});

describe('interact: nothing happens', () => {
  const cases: [string, number][] = [
    ['empty counter', COL.counter],
    ['empty inbox', COL.inbox],
    ['pipeline', 7],
    ['ship', 8],
    ['review', 9],
    ['wall', 10],
    ['bin', COL.bin],
  ];
  for (const [name, x] of cases) {
    it(`empty-handed at the ${name}`, () => {
      const state = newGame();
      addTicket(state, COL.counter2);
      standAt(state, 1, x);
      const before = structuredClone(state.tickets);
      press(state);
      expect(state.tickets).toEqual(before);
    });
  }

  for (const [name, x] of [
    ['pipeline', 7],
    ['ship', 8],
    ['review', 9],
    ['wall', 10],
    ['floor', 11],
  ] as const) {
    it(`carrying at the ${name}`, () => {
      const state = newGame();
      const t = addTicket(state, COL.counter2);
      standAt(state, 1, COL.counter2);
      press(state);
      if (name === 'floor') {
        const p = getPlayer(state, 1);
        if (p) p.pos = { x: 11, y: 2 };
      } else {
        standAt(state, 1, x);
      }
      press(state);
      expect(t.location).toEqual({ kind: 'player', playerId: 1 });
    });
  }
});

describe('work', () => {
  it('advances the code step at the keyboard by WORK_RATE per tick', () => {
    const state = newGame();
    const t = addTicket(state, COL.keyboard);
    standAt(state, 1, COL.keyboard);
    holdWork(state, 10);
    expect(getStep(t, 'code')?.progress).toBeCloseTo(10 * WORK_RATE);
    expect(getStep(t, 'test')?.progress).toBe(0);
    expect(getStep(t, 'pipeline')?.progress).toBe(0);
  });

  it('finishes a step in exactly 1 / WORK_RATE ticks and caps it at 1', () => {
    const state = newGame();
    const t = addTicket(state, COL.keyboard);
    standAt(state, 1, COL.keyboard);
    const ticks = Math.ceil(1 / WORK_RATE);
    holdWork(state, ticks - 1);
    expect(getStep(t, 'code')?.progress).toBeLessThan(1);
    holdWork(state, 1);
    expect(getStep(t, 'code')?.progress).toBe(1);
    holdWork(state, 50);
    expect(getStep(t, 'code')?.progress).toBe(1);
  });

  it('keeps progress after letting go and after the ticket moves', () => {
    const state = newGame();
    const t = addTicket(state, COL.keyboard);
    standAt(state, 1, COL.keyboard);
    holdWork(state, 20);
    const progress = getStep(t, 'code')?.progress;
    tick(state, [cmd(state, 1, {})]);
    press(state);
    standAt(state, 1, COL.counter);
    press(state);
    expect(getStep(t, 'code')?.progress).toBe(progress);
    standAt(state, 1, COL.counter);
    press(state);
    standAt(state, 1, COL.keyboard);
    press(state);
    holdWork(state, 5);
    expect(getStep(t, 'code')?.progress).toBeCloseTo(25 * WORK_RATE);
  });

  it('blocks the test bench until code is done', () => {
    const state = newGame();
    const t = addTicket(state, COL.testBench, { code: 0.5 });
    standAt(state, 1, COL.testBench);
    holdWork(state, 30);
    expect(getStep(t, 'test')?.progress).toBe(0);
    const code = getStep(t, 'code');
    if (code) code.progress = 1;
    holdWork(state, 30);
    expect(getStep(t, 'test')?.progress).toBeCloseTo(30 * WORK_RATE);
    expect(getStep(t, 'code')?.progress).toBe(1);
  });

  it('does nothing at an empty station, a counter or while not holding work', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.keyboard);
    holdWork(state, 10);
    standAt(state, 1, COL.counter);
    holdWork(state, 10);
    expect(t.steps.every((s) => s.progress === 0)).toBe(true);
    const k = addTicket(state, COL.keyboard);
    standAt(state, 1, COL.keyboard);
    for (let i = 0; i < 10; i++) tick(state, [cmd(state, 1, {})]);
    expect(getStep(k, 'code')?.progress).toBe(0);
  });

  it('two players working one station do not stack', () => {
    const state = newGame();
    const t = addTicket(state, COL.keyboard);
    // Player 1 below the keyboard, player 2 diagonally next to them, both facing it.
    standAt(state, 1, COL.keyboard);
    const p2 = getPlayer(state, 2);
    if (!p2) throw new Error('No player 2');
    p2.pos = { x: COL.keyboard + 1, y: 2 };
    p2.facing = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
    expect(targetTile(state, 2)).toEqual({ x: COL.keyboard, y: 1 });
    holdWork(state, 10, [1, 2]);
    expect(targetTile(state, 2)).toEqual({ x: COL.keyboard, y: 1 });
    expect(getStep(t, 'code')?.progress).toBeCloseTo(10 * WORK_RATE);
  });

  it('works carried tickets nowhere: the ticket must be on the station', () => {
    const state = newGame();
    const t = addTicket(state, COL.counter);
    standAt(state, 1, COL.counter);
    press(state);
    standAt(state, 1, COL.keyboard);
    holdWork(state, 10);
    expect(getStep(t, 'code')?.progress).toBe(0);
    expect(ticketOnTile(state, COL.keyboard, 1)).toBeUndefined();
  });
});
