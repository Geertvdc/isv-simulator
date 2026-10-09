import { interact, work } from './interact';
import { stepPlayer } from './movement';
import { separatePlayers } from './push';
import type { GameState, InputCommand } from './state';
import { updateInbox } from './tickets';

const NO_MOVE = { x: 0, y: 0 };

/**
 * Advances the game by one fixed timestep. Mutates `state`. Players without an
 * input this tick stand still and do nothing; inputs for unknown players are
 * ignored. Interact acts on the press only; work acts every tick it's held.
 */
export function tick(state: GameState, inputs: readonly InputCommand[]): void {
  for (const player of state.players) {
    const input = inputs.find((i) => i.playerId === player.id);
    stepPlayer(state.level, player, input?.move ?? NO_MOVE);
  }
  separatePlayers(state.level, state.players);

  const worked = new Set<number>();
  for (const player of state.players) {
    const input = inputs.find((i) => i.playerId === player.id);
    const pressed = (input?.interact ?? false) && !player.interactHeld;
    player.interactHeld = input?.interact ?? false;
    if (pressed) interact(state, player.id);
    if (input?.work) work(state, player.id, worked);
  }

  updateInbox(state);
  state.tick++;
}
