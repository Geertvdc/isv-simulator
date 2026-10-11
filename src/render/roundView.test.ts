import { describe, expect, it } from 'vitest';
import { createSnapshotBuffer, pushSnapshot, sampleAt } from '../net/interpolation';
import { GARAGE } from '../sim/levels';
import { type GameState, createGame } from '../sim/state';
import { GameLoop } from './GameLoop';
import { type RoundView, frameView } from './roundView';

function at(state: GameState, tick: number, x: number): GameState {
  const copy = structuredClone(state);
  copy.tick = tick;
  const player = copy.players[0];
  if (player) player.pos = { x, y: player.pos.y };
  return copy;
}

describe('frameView', () => {
  it('draws the interpolated positions over the older snapshot', () => {
    const start = createGame(GARAGE, 1, [1]);
    const y = start.players[0]?.pos.y ?? 0;
    const buffer = createSnapshotBuffer<GameState>();
    pushSnapshot(buffer, 30, at(start, 10, 2));
    pushSnapshot(buffer, 33, at(start, 13, 3));
    const frame = sampleAt(buffer, 31.5);
    if (!frame) throw new Error('no frame');
    const view: RoundView = frameView(frame);
    expect(view.state.tick).toBe(10);
    expect(view.renderPos(1)).toEqual({ x: 2.5, y });
    expect(view.renderPos(2)).toBeUndefined();
    const manager = view.state.managers[0];
    if (manager) expect(view.renderManagerPos(manager.id)).toEqual(manager.pos);
  });

  it('is what the couch GameLoop already is', () => {
    const view: RoundView = new GameLoop(createGame(GARAGE, 1, [1]));
    expect(view.renderPos(1)).toEqual(view.state.players[0]?.pos);
  });
});
