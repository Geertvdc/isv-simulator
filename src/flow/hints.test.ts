import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../sim/orders';
import { COL, holdWork, newTestGame, press, standAt } from '../sim/testing';
import { enqueueTicket } from '../sim/tickets';
import { HINT_IDS, type HintId, TUTORIAL_LEVEL_ID, startHints, updateHints } from './hints';
import { createSave } from './save';

const shipped: GameEvent = {
  type: 'orderShipped',
  order: null,
  points: 20,
  playerId: 1,
  untested: false,
};

describe('first-level hints', () => {
  it('show on the first Garage round only', () => {
    const save = createSave();
    expect(startHints(TUTORIAL_LEVEL_ID, save)).toEqual(['inbox', 'keyboard', 'ship']);
    for (const id of ['open-plan', 'scale-up', 'seed-round', 'the-reorg', 'custom']) {
      expect(startHints(id, save)).toEqual([]);
    }
    save.tutorialDone = true;
    expect(startHints(TUTORIAL_LEVEL_ID, save)).toEqual([]);
  });

  it('stay until each is used, driven by the sim', () => {
    const state = newTestGame();
    let open: HintId[] = [...HINT_IDS];
    // Nothing happened yet.
    expect(updateHints(open, [], state)).toEqual({ open: HINT_IDS, finished: false });

    // Grab a ticket from the inbox.
    enqueueTicket(state, 'feature', 'Hint me');
    standAt(state, 1, COL.inbox);
    press(state);
    const pickUp = updateHints(open, [{ type: 'pickedUp', playerId: 1, ticketId: 0 }], state);
    expect(pickUp.open).toEqual(['keyboard', 'ship']);
    open = pickUp.open;

    // Carrying it around or putting it on the keyboard is not coding yet.
    standAt(state, 1, COL.keyboard);
    press(state);
    expect(updateHints(open, state.events, state).open).toEqual(['keyboard', 'ship']);
    holdWork(state, 2);
    open = updateHints(open, state.events, state).open;
    expect(open).toEqual(['ship']);

    const done = updateHints(open, [shipped], state);
    expect(done).toEqual({ open: [], finished: true });
    // Nothing left: nothing more to finish.
    expect(updateHints(done.open, [shipped], state)).toEqual({ open: [], finished: false });
  });

  it('can be used out of order', () => {
    const state = newTestGame();
    const update = updateHints(HINT_IDS, [shipped], state);
    expect(update.open).toEqual(['inbox', 'keyboard']);
  });
});
