/**
 * What the round renderers draw from: a game state plus where to draw each
 * moving thing right now. On the couch that's the `GameLoop` (positions
 * glide between its last two ticks); online it's the snapshot buffer's
 * interpolated frame (positions glide between two snapshots). The
 * renderers never know which one they got.
 *
 * Phaser-free, so it can be tested.
 */

import type { InterpolatedFrame } from '../net/interpolation';
import { type Prediction, predictedPlayer } from '../net/prediction';
import type { GameState, Player, PlayerId, Vec } from '../sim/state';

export interface RoundView {
  readonly state: GameState;
  /** Where to draw a player now, or `undefined` when there's no such player. */
  renderPos(id: PlayerId): Vec | undefined;
  /** Where to draw a manager now, or `undefined` when there's no such manager. */
  renderManagerPos(id: number): Vec | undefined;
}

/** An online round's interpolated frame as a view. */
export function frameView(frame: InterpolatedFrame<GameState>): RoundView {
  return {
    state: frame.state,
    renderPos: (id) => frame.players[id],
    renderManagerPos: (id) => frame.managers[id],
  };
}

/**
 * An online round's interpolated frame with this machine's players where
 * prediction has them (`alpha` of the way between their last two predicted
 * ticks). Their movement (position, velocity, facing, dash) comes from the
 * prediction, everything else about them (carrying, throw wind-up) and
 * everyone else from the frame. So the body, a carried ticket, the tile
 * highlight and the meeting icon all follow the predicted player.
 */
export function predictedView(
  frame: InterpolatedFrame<GameState>,
  prediction: Prediction,
  alpha: number,
): RoundView {
  const drawn = new Map<PlayerId, Player>();
  for (const player of frame.state.players) {
    const predicted = predictedPlayer(prediction, player.id, alpha);
    if (predicted) drawn.set(player.id, predicted);
  }
  if (drawn.size === 0) return frameView(frame);
  const players = frame.state.players.map((player): Player => {
    const p = drawn.get(player.id);
    if (!p) return player;
    const { pos, vel, facing, dashTicks, dashCooldown, sinceDiagonal } = p;
    return { ...player, pos, vel, facing, dashTicks, dashCooldown, sinceDiagonal };
  });
  return {
    state: { ...frame.state, players },
    renderPos: (id) => drawn.get(id)?.pos ?? frame.players[id],
    renderManagerPos: (id) => frame.managers[id],
  };
}
