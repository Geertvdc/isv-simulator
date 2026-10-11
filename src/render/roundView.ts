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
import type { GameState, PlayerId, Vec } from '../sim/state';

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
