import { describe, expect, it } from 'vitest';
import hackathonDraft from '../../maps/level-16-hackathon.txt?raw';
import hackathonPhase2 from '../../maps/level-16-hackathon.phase2.txt?raw';
import synergyDraft from '../../maps/level-11-synergy.txt?raw';
import synergyPhase2 from '../../maps/level-11-synergy.phase2.txt?raw';
import reorgDraft from '../../maps/level-12-the-reorg.txt?raw';
import reorgPhase2 from '../../maps/level-12-the-reorg.phase2.txt?raw';
import reorgPhase3 from '../../maps/level-12-the-reorg.phase3.txt?raw';
import { REORG_WARNING_TICKS, TICKS_PER_SECOND } from './balance';
import { botInput, createBot } from './bot';
import { getTile, parseLevelMap, withPhases } from './level';
import { HACKATHON, SYNERGY, THE_REORG, levelWithMap } from './levels';
import { pathTo } from './path';
import { currentMarks, reorgWarning } from './reorgs';
import { type GameState, createGame } from './state';
import { addTicket, cmd, idle } from './testing';
import { tick } from './tick';

const SECOND = TICKS_PER_SECOND;

const PHASE_1 = ['#######', '#1.=.D#', '#2.=..#', '#3....#', '#4....#', '#######'].join('\n');
const PHASE_2 = ['#######', '#1....#', '#2D...#', '#3....#', '#4....#', '#######'].join('\n');

function reorgGame(): GameState {
  const map = withPhases(parseLevelMap(PHASE_1), [PHASE_2]);
  const state = createGame(
    levelWithMap(map, { reorgs: [{ atTick: 10 * SECOND, phase: 2 }] }),
    7,
    [1, 2],
  );
  state.nextOrderTick = Number.MAX_SAFE_INTEGER;
  return state;
}

describe('reorg phases', () => {
  it('refuses a phase of another size or one that moves a station', () => {
    const map = parseLevelMap(PHASE_1);
    expect(() => withPhases(map, ['#1234#'])).toThrow(/size|×/);
    expect(() => withPhases(map, [PHASE_2.replace('#4....#', '#4...K#')])).toThrow(/changes/);
  });

  it('warns 3 s ahead with the tiles that change, then puts the next layout on the live map', () => {
    const state = reorgGame();
    idle(state, 10 * SECOND - REORG_WARNING_TICKS);
    const warning = reorgWarning(state);
    expect(warning?.inTicks).toBe(REORG_WARNING_TICKS);
    expect(warning?.tiles.sort((a, b) => a - b)).toEqual([10, 12, 16, 17]);
    idle(state, REORG_WARNING_TICKS + 1);
    expect(state.reorgPhase).toBe(2);
    expect(getTile(state.level, 3, 1)).toBe('floor');
    expect(getTile(state.level, 2, 2)).toBe('counter');
    expect(currentMarks(state).filter((m) => m.kind === 'rollingDesk')).toEqual([
      { x: 2, y: 2, kind: 'rollingDesk' },
    ]);
    expect(reorgWarning(state)).toBeNull();
  });

  it('rolls a ticket along with its desk', () => {
    const state = reorgGame();
    const ticket = addTicket(state, 5);
    idle(state, 10 * SECOND + 1);
    expect(ticket.location).toEqual({ kind: 'tile', x: 2, y: 2 });
  });

  it('moves someone standing where a desk rolls in to the nearest open floor', () => {
    const state = reorgGame();
    const p = state.players[0];
    if (!p) throw new Error('no player');
    idle(state, 10 * SECOND - 1);
    p.pos = { x: 2, y: 2 };
    idle(state, 2);
    expect(getTile(state.level, Math.round(p.pos.x), Math.round(p.pos.y))).toBe('floor');
    expect(Math.hypot(p.pos.x - 2, p.pos.y - 2)).toBeLessThanOrEqual(1);
  });

  it('opens the way where a partition folds away', () => {
    const state = reorgGame();
    expect(pathTo(state.level, { x: 2, y: 1 }, { x: 4, y: 1 })?.length).toBe(6);
    idle(state, 10 * SECOND + 1);
    expect(pathTo(state.level, { x: 2, y: 1 }, { x: 4, y: 1 })?.length).toBe(2);
  });
});

describe('badge turnstiles', () => {
  const GATED = parseLevelMap(['#######', '#1234.#', '###+###', '#.....#', '#######'].join('\n'));
  const game = (): GameState => {
    const state = createGame(levelWithMap(GATED, { turnstiles: [[{ x: 0, y: 1 }]] }), 7, [1]);
    state.nextOrderTick = Number.MAX_SAFE_INTEGER;
    return state;
  };
  const walk = (state: GameState, from: { x: number; y: number }, dy: number): number => {
    const p = state.players[0];
    if (!p) throw new Error('no player');
    p.pos = { ...from };
    for (let i = 0; i < SECOND; i++) tick(state, [cmd(state, 1, { move: { x: 0, y: dy } })]);
    return p.pos.y;
  };

  it('lets people through the way it goes', () => {
    expect(walk(game(), { x: 3, y: 1 }, 1)).toBeGreaterThan(2.5);
  });

  it('stops them the other way', () => {
    expect(walk(game(), { x: 3, y: 3 }, -1)).toBeGreaterThan(2.5);
  });

  it('turns bot paths one way', () => {
    const state = game();
    expect(pathTo(state.level, { x: 3, y: 1 }, { x: 3, y: 3 }, [], state.gates)).not.toBeNull();
    expect(pathTo(state.level, { x: 3, y: 3 }, { x: 3, y: 1 }, [], state.gates)).toBeNull();
  });
});

describe('the reorg drafts with bots', () => {
  const cases = [
    ['Synergy', SYNERGY, synergyDraft, [synergyPhase2]],
    ['The Reorg', THE_REORG, reorgDraft, [reorgPhase2, reorgPhase3]],
    ['Hackathon', HACKATHON, hackathonDraft, [hackathonPhase2]],
  ] as const;
  for (const [name, level, text, phases] of cases) {
    it(`goes through every phase on ${name} and the bots keep shipping`, () => {
      for (const players of [[1], [1, 2, 3, 4]]) {
        const map = withPhases(parseLevelMap(text), phases);
        const state = createGame({ ...level, map }, 3, players);
        const bots = players.map((id) => createBot(id));
        let shipped = 0;
        const seen = new Set<number>();
        for (let i = 0; i < level.durationTicks && !state.result; i++) {
          tick(
            state,
            bots.map((b) => botInput(state, b, bots)),
          );
          seen.add(state.reorgPhase);
          shipped += state.events.filter((e) => e.type === 'orderShipped').length;
        }
        expect(seen.size, name).toBe(phases.length + 1);
        expect(shipped, `${name} with ${players.length}`).toBeGreaterThan(1);
      }
    });
  }

  it('plays the same twice', () => {
    const play = (): GameState => {
      const map = withPhases(parseLevelMap(reorgDraft), [reorgPhase2, reorgPhase3]);
      const state = createGame({ ...THE_REORG, map }, 4, [1, 2, 3]);
      const bots = [1, 2, 3].map((id) => createBot(id));
      for (let i = 0; i < 130 * SECOND; i++) {
        tick(
          state,
          bots.map((b) => botInput(state, b, bots)),
        );
      }
      return state;
    };
    expect(play()).toEqual(play());
  });
});
