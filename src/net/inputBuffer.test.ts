import { describe, expect, it } from 'vitest';
import {
  NET_INPUT_REPEAT_TICKS,
  NET_MAX_INPUT_AHEAD_TICKS,
  NET_MAX_INPUT_LATE_TICKS,
} from '../sim/balance';
import type { InputCommand } from '../sim/state';
import { createInputBuffer, isAccepted, pushInput, takeInput } from './inputBuffer';

function input(tick: number, extra: Partial<InputCommand> = {}): InputCommand {
  return {
    playerId: 1,
    tick,
    move: { x: 0, y: 0 },
    interact: false,
    work: false,
    dash: false,
    ...extra,
  };
}

/** Distinguishes inputs by their move, so tests can see which one was applied. */
const marked = (tick: number, extra: Partial<InputCommand> = {}): InputCommand =>
  input(tick, { move: { x: tick / 1000, y: 0 }, ...extra });

describe('input buffer', () => {
  it('applies on-time inputs at their own tick', () => {
    const buffer = createInputBuffer(1);
    expect(pushInput(buffer, marked(10), 10)).toBe('queued');
    expect(pushInput(buffer, marked(11), 10)).toBe('queued');
    expect(takeInput(buffer, 10)).toEqual(marked(10));
    expect(takeInput(buffer, 11)).toEqual(marked(11));
  });

  it('applies inputs that arrive out of order each at its own tick', () => {
    const buffer = createInputBuffer(1);
    for (const t of [13, 11, 12, 10]) expect(pushInput(buffer, marked(t), 10)).toBe('queued');
    for (const t of [10, 11, 12, 13]) expect(takeInput(buffer, t)).toEqual(marked(t));
  });

  it('ignores a duplicate of a waiting input, keeping the first', () => {
    const buffer = createInputBuffer(1);
    pushInput(buffer, marked(10, { work: true }), 10);
    expect(pushInput(buffer, marked(10), 10)).toBe('duplicate');
    expect(takeInput(buffer, 10)).toEqual(marked(10, { work: true }));
  });

  it('drops inputs for a tick already applied, or older', () => {
    const buffer = createInputBuffer(1);
    pushInput(buffer, marked(10), 10);
    takeInput(buffer, 10);
    expect(pushInput(buffer, marked(10), 11)).toBe('stale');
    expect(pushInput(buffer, marked(9), 11)).toBe('stale');
  });

  it('applies a late input at the next tick that has not run', () => {
    const buffer = createInputBuffer(1);
    expect(pushInput(buffer, marked(8, { work: true }), 10)).toBe('late');
    expect(takeInput(buffer, 10)).toEqual({ ...marked(8, { work: true }), tick: 10 });
  });

  it('drops an input more than NET_MAX_INPUT_LATE_TICKS late', () => {
    const buffer = createInputBuffer(1);
    expect(pushInput(buffer, input(100 - NET_MAX_INPUT_LATE_TICKS), 100)).toBe('late');
    expect(pushInput(buffer, input(100 - NET_MAX_INPUT_LATE_TICKS - 1), 100)).toBe('tooLate');
  });

  it('drops an input more than NET_MAX_INPUT_AHEAD_TICKS ahead', () => {
    const buffer = createInputBuffer(1);
    expect(pushInput(buffer, input(100 + NET_MAX_INPUT_AHEAD_TICKS), 100)).toBe('queued');
    expect(pushInput(buffer, input(101 + NET_MAX_INPUT_AHEAD_TICKS), 100)).toBe('tooEarly');
  });

  it("refuses another player's input", () => {
    const buffer = createInputBuffer(1);
    expect(pushInput(buffer, { ...input(10), playerId: 2 }, 10)).toBe('wrongPlayer');
  });

  it('says which outcomes were kept', () => {
    expect(isAccepted('queued')).toBe(true);
    expect(isAccepted('late')).toBe(true);
    for (const o of ['duplicate', 'stale', 'tooLate', 'tooEarly', 'wrongPlayer'] as const) {
      expect(isAccepted(o)).toBe(false);
    }
  });

  it('merges several late inputs: newest move and work, any press counts', () => {
    const buffer = createInputBuffer(1);
    // A quick tap at tick 6, released at 7, both arriving late together with 8.
    pushInput(buffer, marked(6, { interact: true }), 10);
    pushInput(buffer, marked(8, { work: true }), 10);
    pushInput(buffer, marked(7, { dash: true }), 10);
    expect(takeInput(buffer, 10)).toEqual({
      ...marked(8, { work: true }),
      tick: 10,
      interact: true,
      dash: true,
    });
    // The tap is released again on the next tick: the newest input had it up.
    expect(takeInput(buffer, 11)).toEqual({ ...marked(8, { work: true }), tick: 11 });
  });

  it('drops a late input older than one already applied (out of order)', () => {
    const buffer = createInputBuffer(1);
    pushInput(buffer, marked(9), 10);
    takeInput(buffer, 10);
    expect(pushInput(buffer, marked(8), 11)).toBe('stale');
  });

  it('repeats the last input when none came, keeping held buttons held', () => {
    const buffer = createInputBuffer(1);
    const holding = marked(10, { interact: true, work: true, move: { x: 1, y: 0 } });
    pushInput(buffer, holding, 10);
    takeInput(buffer, 10);
    expect(takeInput(buffer, 11)).toEqual({ ...holding, tick: 11 });
  });

  it('never makes up a new press while repeating', () => {
    // A tap: down at 10, up at 11, then nothing. The sim acts on up-to-down only,
    // so every tick after 10 must keep interact up.
    const buffer = createInputBuffer(1);
    pushInput(buffer, input(10, { interact: true, dash: true }), 10);
    pushInput(buffer, input(11), 10);
    const applied = Array.from({ length: 30 }, (_, i) => takeInput(buffer, 10 + i));
    expect(applied.map((a) => a.interact)).toEqual([true, ...Array<boolean>(29).fill(false)]);
    expect(applied.map((a) => a.dash)).toEqual([true, ...Array<boolean>(29).fill(false)]);
  });

  it('lets go and stands still after NET_INPUT_REPEAT_TICKS without input', () => {
    const buffer = createInputBuffer(1);
    pushInput(buffer, input(10, { interact: true, work: true, move: { x: 0, y: 1 } }), 10);
    takeInput(buffer, 10);
    for (let i = 1; i <= NET_INPUT_REPEAT_TICKS; i++) {
      expect(takeInput(buffer, 10 + i).move).toEqual({ x: 0, y: 1 });
    }
    expect(takeInput(buffer, 11 + NET_INPUT_REPEAT_TICKS)).toEqual(
      input(11 + NET_INPUT_REPEAT_TICKS),
    );
    // Picks up again as soon as inputs come back.
    const back = 12 + NET_INPUT_REPEAT_TICKS;
    pushInput(buffer, marked(back), back);
    expect(takeInput(buffer, back)).toEqual(marked(back));
  });

  it('stands still before the first input', () => {
    const buffer = createInputBuffer(3);
    expect(takeInput(buffer, 0)).toEqual({ ...input(0), playerId: 3 });
  });

  it('keeps its own copy of each input', () => {
    const buffer = createInputBuffer(1);
    const sent = input(10, { move: { x: 1, y: 0 } });
    pushInput(buffer, sent, 10);
    sent.move.x = -1;
    expect(takeInput(buffer, 10).move).toEqual({ x: 1, y: 0 });
  });
});
