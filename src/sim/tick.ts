import { updateConveyors } from './conveyor';
import { finishCoding, finishReviews, interact, newTickWork, work } from './interact';
import { updateManagers } from './manager';
import { expireInvites, updateMeetings } from './meetings';
import { movePlayer } from './movement';
import { expireOrders, updateLevelTimer, updateOrders } from './orders';
import { updatePipelines } from './pipeline';
import { separatePlayers } from './push';
import { updateFlights, updateThrowCharge } from './throw';
import type { GameState, InputCommand } from './state';

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
    if (movePlayer(state.level, player, input?.move, input?.dash)) {
      state.events.push({ type: 'dashed', playerId: player.id });
    }
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
  finishCoding(state, tickWork);
  updateFlights(state);
  updateConveyors(state);

  updatePipelines(state);
  updateOrders(state);
  updateMeetings(state);
  state.tick++;
  expireOrders(state);
  expireInvites(state);
  updateLevelTimer(state);
}
