import { finishReviews, interact, newTickWork, work } from './interact';
import { updateManagers } from './manager';
import { startDash, stepPlayer } from './movement';
import { expireOrders, updateLevelTimer, updateOrders } from './orders';
import { updatePipelines } from './pipeline';
import { separatePlayers } from './push';
import { updateFlights, updateThrowCharge } from './throw';
import type { GameState, InputCommand } from './state';

const NO_MOVE = { x: 0, y: 0 };

/**
 * Advances the game by one fixed timestep. Mutates `state`. Players without an
 * input this tick stand still and do nothing; inputs for unknown players are
 * ignored. Interact and dash act on the press only; work acts every tick it's held.
 * `state.events` holds what happened during this tick only. Once the level
 * has ended nothing moves any more.
 */
export function tick(state: GameState, inputs: readonly InputCommand[]): void {
  state.events = [];
  if (state.result) return;

  for (const player of state.players) {
    const input = inputs.find((i) => i.playerId === player.id);
    const move = input?.move ?? NO_MOVE;
    const dashPressed = (input?.dash ?? false) && !player.dashHeld;
    player.dashHeld = input?.dash ?? false;
    if (dashPressed && startDash(player, move)) {
      state.events.push({ type: 'dashed', playerId: player.id });
    }
    stepPlayer(state.level, player, move);
  }
  for (const shove of separatePlayers(state.level, state.players)) {
    state.events.push({ type: 'shoved', ...shove });
  }
  updateManagers(state);

  const tickWork = newTickWork();
  for (const player of state.players) {
    const input = inputs.find((i) => i.playerId === player.id);
    const held = input?.interact ?? false;
    const pressed = held && !player.interactHeld;
    player.interactHeld = held;
    const pressedIdle = pressed && !interact(state, player.id);
    updateThrowCharge(state, player, held, pressedIdle);
    if (input?.work) work(state, player.id, tickWork);
  }
  finishReviews(state, tickWork);
  updateFlights(state);

  updatePipelines(state);
  updateOrders(state);
  state.tick++;
  expireOrders(state);
  updateLevelTimer(state);
}
