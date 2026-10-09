import { describe, expect, it } from 'vitest';
import { createGame } from '../sim/state';
import { GARAGE } from '../sim/levels';
import { addTicket, newTestGame } from '../sim/testing';
import { handWork, soundFor, soundsFor } from './sounds';

describe('sounds', () => {
  it('maps the events the spec asks for to a sound', () => {
    expect(soundFor({ type: 'pickedUp', playerId: 1, ticketId: 1 })).toBe('pick-up');
    expect(soundFor({ type: 'putDown', playerId: 1, ticketId: 1 })).toBe('put-down');
    expect(soundFor({ type: 'dashed', playerId: 1 })).toBe('dash');
    expect(soundFor({ type: 'levelEnded', result: { score: 0, stars: 0 } })).toBe('level-end');
    expect(soundFor({ type: 'pipelineRepaired', x: 0, y: 0 })).toBeNull();
  });

  it('plays each sound once per frame', () => {
    const shove = { type: 'shoved', by: 1, target: 2 } as const;
    const dash = { type: 'dashed', playerId: 1 } as const;
    expect(soundsFor([shove, dash, shove, { ...dash, playerId: 2 }])).toEqual(['shove', 'dash']);
  });

  it('measures work done by hand, not pipeline builds', () => {
    const state = newTestGame();
    expect(handWork(state)).toBe(0);
    addTicket(state, 2, { done: 1, progress: 0.5 });
    expect(handWork(state)).toBeCloseTo(1.5);
    addTicket(state, 7, { done: 2, progress: 0.5 });
    expect(handWork(state)).toBeCloseTo(3.5);
    expect(handWork(createGame(GARAGE, 1, [1]))).toBe(0);
  });
});
