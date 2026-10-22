import { describe, expect, it } from 'vitest';
import { PIPELINE_FAIL_TICKS, PIPELINE_WARN_TICKS } from '../sim/balance';
import { GARAGE } from '../sim/levels';
import { createGame } from '../sim/state';
import { SHAKE_PIPELINE_BROKE, effectsFor, pipelinePulse } from './effects';

describe('effectsFor', () => {
  const state = createGame(GARAGE, 1, [1, 2]);

  it('shakes when the pipeline breaks and pops up when it is fixed', () => {
    expect(effectsFor(state, [{ type: 'pipelineBroke', x: 1, y: 1, ticketId: 1 }])).toEqual([
      { kind: 'shake', ...SHAKE_PIPELINE_BROKE },
    ]);
    const [fixed] = effectsFor(state, [{ type: 'pipelineRepaired', x: 2, y: 3 }]);
    expect(fixed).toMatchObject({ kind: 'popup', at: { x: 2, y: 3 } });
  });

  it('puffs where a dash starts, against the way the player faces', () => {
    const player = state.players[0];
    if (!player) throw new Error('no player');
    expect(effectsFor(state, [{ type: 'dashed', playerId: 1 }])).toEqual([
      { kind: 'puff', at: player.pos, facing: player.facing },
    ]);
  });

  it('pops up on the shoved player and shakes a little', () => {
    const kinds = effectsFor(state, [{ type: 'shoved', by: 1, target: 2 }]).map((e) => e.kind);
    expect(kinds).toEqual(['popup', 'shake']);
  });

  it('ignores events with no visual reaction', () => {
    expect(effectsFor(state, [{ type: 'pickedUp', playerId: 1, ticketId: 1 }])).toEqual([]);
  });
});

describe('pipelinePulse', () => {
  it('stays between 0 and 1 and pulses faster in the last half of the warning', () => {
    const early = PIPELINE_FAIL_TICKS - PIPELINE_WARN_TICKS;
    const late = PIPELINE_FAIL_TICKS - 1;
    // 2 Hz is back at the start after 500 ms; 5 Hz isn't.
    expect(pipelinePulse(early, 500)).toBeCloseTo(pipelinePulse(early, 0));
    expect(pipelinePulse(late, 50)).not.toBeCloseTo(pipelinePulse(late, 0));
    for (let t = 0; t < 1000; t += 37) {
      const v = pipelinePulse(late, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
