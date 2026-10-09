import { interact, updatePipelines, work } from './interact';
import { stepPlayer } from './movement';
import { expireOrders, updateLevelTimer, updateOrders } from './orders';
import { separatePlayers } from './push';
import type { GameState, InputCommand } from './state';

const NO_MOVE = { x: 0, y: 0 };

/**
 * Advances the game by one fixed timestep. Mutates `state`. Players without an
 * input this tick stand still and do nothing; inputs for unknown players are
 * ignored. Interact acts on the press only; work acts every tick it's held.
 * `state.events` holds what happened during this tick only. Once the level
 * has ended nothing moves any more.
 */
export function tick(state: GameState, inputs: readonly InputCommand[]): void {
  state.events = [];
  if (state.result) return;

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

  updatePipelines(state);
  updateOrders(state);
  state.tick++;
  expireOrders(state);
  updateLevelTimer(state);
}
