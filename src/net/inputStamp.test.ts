import { describe, expect, it } from 'vitest';
import type { InputCommand } from '../sim/state';
import { createInputStamper, resetInputStamper, stampInputs } from './inputStamp';

function input(playerId: number, extra: Partial<InputCommand> = {}): InputCommand {
  return {
    playerId,
    tick: 0,
    move: { x: 1, y: 0 },
    interact: false,
    work: false,
    dash: false,
    ...extra,
  };
}

describe('input stamping', () => {
  it('stamps every local player with the target tick', () => {
    const stamper = createInputStamper();
    const out = stampInputs(stamper, [input(1), input(3, { work: true })], 120);
    expect(out).toEqual([
      { ...input(1), tick: 120 },
      { ...input(3, { work: true }), tick: 120 },
    ]);
  });

  it('sends one batch per tick, however fast the frames come', () => {
    const stamper = createInputStamper();
    expect(stampInputs(stamper, [input(1)], 120)).toHaveLength(1);
    expect(stampInputs(stamper, [input(1)], 120)).toEqual([]);
    expect(stampInputs(stamper, [input(1)], 119)).toEqual([]);
    expect(stampInputs(stamper, [input(1)], 121)[0]?.tick).toBe(121);
    // A slow frame skips ticks: the server repeats the last input meanwhile.
    expect(stampInputs(stamper, [input(1)], 125)[0]?.tick).toBe(125);
  });

  it('keeps a tap that happened on a frame that sent nothing', () => {
    const stamper = createInputStamper();
    stampInputs(stamper, [input(1), input(2)], 120);
    expect(
      stampInputs(stamper, [input(1, { interact: true }), input(2, { dash: true })], 120),
    ).toEqual([]);
    const next = stampInputs(stamper, [input(1), input(2)], 121);
    expect(next.map((c) => [c.interact, c.dash])).toEqual([
      [true, false],
      [false, true],
    ]);
    // Only once.
    expect(stampInputs(stamper, [input(1)], 122)[0]?.interact).toBe(false);
  });

  it('starts over when the clock jumps back', () => {
    const stamper = createInputStamper();
    stampInputs(stamper, [input(1)], 500);
    expect(stampInputs(stamper, [input(1)], 100)[0]?.tick).toBe(100);
    resetInputStamper(stamper);
    expect(stampInputs(stamper, [input(1)], 50)[0]?.tick).toBe(50);
  });

  it('does not change the commands it was given', () => {
    const stamper = createInputStamper();
    const given = [input(1)];
    const out = stampInputs(stamper, given, 7);
    const first = out[0];
    if (first) first.move.x = 0;
    expect(given[0]).toEqual(input(1));
  });
});
