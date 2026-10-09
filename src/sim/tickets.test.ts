import { describe, expect, it } from 'vitest';
import garage from '../../maps/level-01-garage.txt?raw';
import {
  INBOX_FIRST_SPAWN_TICK,
  INBOX_MAX_TICKETS,
  INBOX_SPAWN_JITTER_TICKS,
  INBOX_SPAWN_TICKS,
} from './balance';
import { TICKET_TITLES } from './content';
import { getTile, parseLevelMap } from './level';
import { type GameState, createGame } from './state';
import { tick } from './tick';
import { STEP_ORDER, inboxTiles, ticketOnTile, updateInbox } from './tickets';

function newGame(seed = 42): GameState {
  return createGame(parseLevelMap(garage), seed, [1]);
}

/** Runs `n` ticks with nobody touching anything. */
function idle(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) tick(state, []);
}

/** Ticks at which a new ticket appeared, with the inbox emptied after each spawn. */
function spawnTicks(state: GameState, ticks: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const before = state.tickets.length;
    const at = state.tick;
    tick(state, []);
    if (state.tickets.length > before) result.push(at);
    state.tickets = [];
  }
  return result;
}

describe('inbox', () => {
  it('spawns the first ticket on the first spawn tick, with every step at 0', () => {
    const state = newGame();
    idle(state, INBOX_FIRST_SPAWN_TICK + 1);
    expect(state.tickets).toHaveLength(1);
    const [t] = state.tickets;
    expect(t?.id).toBe(1);
    expect(TICKET_TITLES).toContain(t?.title);
    expect(t?.steps).toEqual(STEP_ORDER.map((kind) => ({ kind, progress: 0 })));
    expect(t?.location.kind).toBe('tile');
    if (t?.location.kind === 'tile') {
      expect(getTile(state.level, t.location.x, t.location.y)).toBe('inbox');
    }
  });

  it('spawns every INBOX_SPAWN_TICKS give or take the jitter', () => {
    const state = newGame();
    const ticks = spawnTicks(state, INBOX_SPAWN_TICKS * 20);
    expect(ticks.length).toBeGreaterThan(10);
    const gaps = ticks.slice(1).map((t, i) => t - (ticks[i] ?? 0));
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(INBOX_SPAWN_TICKS - INBOX_SPAWN_JITTER_TICKS);
      expect(gap).toBeLessThanOrEqual(INBOX_SPAWN_TICKS + INBOX_SPAWN_JITTER_TICKS);
    }
    // The jitter actually varies the gaps.
    expect(new Set(gaps).size).toBeGreaterThan(1);
  });

  it(`stops at ${INBOX_MAX_TICKETS} waiting tickets`, () => {
    const state = newGame();
    idle(state, INBOX_SPAWN_TICKS * 20);
    expect(state.tickets).toHaveLength(INBOX_MAX_TICKETS);
  });

  it('only spawns on free inbox tiles', () => {
    const state = newGame();
    const [first, second] = inboxTiles(state);
    if (!first || !second) throw new Error('garage needs two inbox tiles');
    // Something already on the first inbox tile: the next ticket must land on the second.
    state.tickets.push({
      id: 99,
      title: 'Blocker',
      steps: [],
      location: { kind: 'tile', ...first },
    });
    for (let i = 0; i < 20; i++) {
      state.tickets = state.tickets.filter((t) => t.id === 99);
      state.nextInboxSpawnTick = state.tick;
      updateInbox(state);
      expect(ticketOnTile(state, second.x, second.y)).toBeDefined();
    }
  });

  it('does not spawn when no inbox tile is free', () => {
    const state = createGame(
      parseLevelMap(['######', '#I...#', '#1234#', '######'].join('\n')),
      1,
      [1],
    );
    state.tickets.push({
      id: 99,
      title: 'Blocker',
      steps: [],
      location: { kind: 'tile', x: 1, y: 1 },
    });
    idle(state, INBOX_SPAWN_TICKS * 3);
    expect(state.tickets).toHaveLength(1);
  });

  it('is deterministic per seed', () => {
    const a = newGame(7);
    const b = newGame(7);
    const c = newGame(8);
    const ticksA = spawnTicks(a, INBOX_SPAWN_TICKS * 10);
    expect(spawnTicks(b, INBOX_SPAWN_TICKS * 10)).toEqual(ticksA);
    expect(spawnTicks(c, INBOX_SPAWN_TICKS * 10)).not.toEqual(ticksA);
    expect(a).toEqual(b);
  });
});
