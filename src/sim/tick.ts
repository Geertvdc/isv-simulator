import { stepPlayer } from './movement';
import type { GameState, InputCommand } from './state';

const NO_MOVE = { x: 0, y: 0 };

/**
 * Advances the game by one fixed timestep. Mutates `state`. Players without an
 * input this tick stand still; inputs for unknown players are ignored.
 */
export function tick(state: GameState, inputs: readonly InputCommand[]): void {
  for (const player of state.players) {
    const input = inputs.find((i) => i.playerId === player.id);
    stepPlayer(state.level, player, input?.move ?? NO_MOVE);
  }
  state.tick++;
}
