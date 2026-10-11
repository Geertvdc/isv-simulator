import { describe, expect, it } from 'vitest';
import { createSnapshotBuffer, pushSnapshot, sampleAt } from '../net/interpolation';
import {
  advancePrediction,
  createPrediction,
  recordInputs,
  reconcile,
  resetPrediction,
} from '../net/prediction';
import { GARAGE } from '../sim/levels';
import { type GameState, createGame } from '../sim/state';
import { GameLoop } from './GameLoop';
import { type RoundView, frameView, predictedView } from './roundView';

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

describe('predictedView', () => {
  function setup(enabled: boolean) {
    const start = createGame(GARAGE, 1, [1, 2]);
    const buffer = createSnapshotBuffer<GameState>();
    pushSnapshot(buffer, 30, at(start, 10, 2));
    pushSnapshot(buffer, 33, at(start, 13, 3));
    const frame = sampleAt(buffer, 31.5);
    if (!frame) throw new Error('no frame');
    const prediction = createPrediction(enabled);
    resetPrediction(prediction, start.level);
    reconcile(
      prediction,
      { serverTick: 40, players: start.players, managers: [], events: [], running: true },
      [2],
    );
    recordInputs(prediction, [
      { playerId: 2, tick: 40, move: { x: 1, y: 0 }, interact: false, work: false, dash: false },
    ]);
    advancePrediction(prediction, 40);
    return { start, frame, prediction };
  }

  it("draws this machine's players where prediction has them, the others interpolated", () => {
    const { start, frame, prediction } = setup(true);
    const view = predictedView(frame, prediction, 1);
    const predicted = prediction.current[0];
    expect(view.renderPos(2)).toEqual(predicted?.pos);
    expect(view.renderPos(1)).toEqual(frame.players[1]);
    const two = view.state.players.find((p) => p.id === 2);
    expect(two?.pos).toEqual(predicted?.pos);
    expect(two?.facing).toEqual({ x: 1, y: 0 });
    // The frame's state is not touched: only a copy swaps the local player.
    expect(frame.state.players.find((p) => p.id === 2)?.pos).toEqual(start.players[1]?.pos);
    expect(view.state.tick).toBe(frame.state.tick);
  });

  it('is the plain interpolated view without prediction', () => {
    const { frame, prediction } = setup(false);
    const view = predictedView(frame, prediction, 1);
    expect(view.state).toBe(frame.state);
    expect(view.renderPos(2)).toEqual(frame.players[2]);
  });
});
