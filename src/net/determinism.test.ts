/**
 * The server runs the same sim as couch play, fed through the network path.
 * Given the same inputs, it must end in exactly the same state.
 */

import { describe, expect, it } from 'vitest';
import { botInput, createBot } from '../sim/bot';
import { MIDDLE_MANAGEMENT } from '../sim/levels';
import { Rng } from '../sim/rng';
import { type GameState, type InputCommand, createGame } from '../sim/state';
import { tick } from '../sim/tick';
import { createInputBuffer, pushInput, takeInput } from './inputBuffer';
import { type InputsMessage, parseClientMessage } from './protocol';
import {
  type Snapshot,
  createSnapshotLog,
  decodeSnapshot,
  isSnapshotTick,
  recordTick,
  takeSnapshot,
} from './snapshot';

const SEED = 42;

/** A function, so TypeScript doesn't assume `tick` left `result` alone. */
const hasEnded = (state: GameState): boolean => state.result !== null;
const PLAYERS = [1, 2, 3];

/** Plays the whole level with bots, the couch way, and keeps every tick's inputs. */
function playDirect(): { state: GameState; inputs: InputCommand[][] } {
  const state = createGame(MIDDLE_MANAGEMENT, SEED, PLAYERS);
  const bots = PLAYERS.map((id) => createBot(id));
  const inputs: InputCommand[][] = [];
  while (!state.result) {
    const now = bots.map((b) => botInput(state, b, bots));
    inputs.push(structuredClone(now));
    tick(state, now);
  }
  return { state, inputs };
}

/**
 * Every tick's inputs as JSON text, sent 1 to 7 ticks early, in messages
 * that mix ticks and players, shuffled, and each sent twice.
 */
function schedule(inputs: readonly InputCommand[][]): Map<number, string[]> {
  const rng = new Rng(SEED);
  const byArrival = new Map<number, InputCommand[]>();
  inputs.forEach((tickInputs, t) => {
    const arrives = Math.max(0, t - 1 - rng.int(0, 6));
    byArrival.set(arrives, [...(byArrival.get(arrives) ?? []), ...tickInputs]);
  });
  const messages = new Map<number, string[]>();
  for (const [arrives, list] of byArrival) {
    const shuffled = [...list].sort(() => rng.next() - 0.5);
    const text = JSON.stringify({ type: 'inputs', inputs: shuffled } satisfies InputsMessage);
    messages.set(arrives, [text, text]);
  }
  return messages;
}

describe('determinism over the network path', () => {
  it('ends in the same state as playing directly', () => {
    const direct = playDirect();
    expect(direct.state.score).toBeGreaterThan(0);

    const messages = schedule(direct.inputs);
    let server = createGame(MIDDLE_MANAGEMENT, SEED, PLAYERS);
    const level = server.level;
    const buffers = PLAYERS.map((id) => createInputBuffer(id));
    const log = createSnapshotLog();
    let client: GameState | null = null;
    const outcomes = new Map<string, number>();

    for (let serverTick = 0; !server.result;) {
      for (const text of messages.get(serverTick) ?? []) {
        const parsed = parseClientMessage(JSON.parse(text));
        if (!parsed.ok || parsed.value.type !== 'inputs') throw new Error('bad message');
        for (const input of parsed.value.inputs) {
          const buffer = buffers.find((b) => b.playerId === input.playerId);
          if (!buffer) throw new Error(`no buffer for ${input.playerId}`);
          const outcome = pushInput(buffer, input, server.tick);
          outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
        }
      }
      tick(
        server,
        buffers.map((b) => takeInput(b, server.tick)),
      );
      recordTick(log, server);
      serverTick++;

      if (isSnapshotTick(serverTick) || hasEnded(server)) {
        const wire = JSON.parse(JSON.stringify(takeSnapshot(log, server, serverTick))) as Snapshot;
        client = decodeSnapshot(wire, level);
        expect(client).toEqual(server);
        // Carry on from the decoded copy: the snapshot must hold everything the sim needs.
        server = decodeSnapshot(wire, level);
      }
    }

    // Every input arrived early and was used once; every copy was spotted.
    const sent = direct.inputs.flat().length;
    expect(Object.fromEntries(outcomes)).toEqual({ queued: sent, duplicate: sent });
    expect(server).toEqual(direct.state);
    expect(client).toEqual(direct.state);
  });
});
