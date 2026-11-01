import { describe, expect, it } from 'vitest';
import { parseLevelMap } from '../../../sim/level';
import { counterRun, counterRunKey } from './counterRun';

describe('counterRun', () => {
  const map = parseLevelMap(['#######', '#CCCC.#', '#1.3.C#', '#2.4.C#', '#######'].join('\n'));

  it('runs along a row, with legs at the ends and the knob at the far end', () => {
    expect(counterRun(map, 1, 1)).toMatchObject({ minusEnd: true, plusEnd: false, legs: true });
    expect(counterRun(map, 2, 1)).toMatchObject({ legs: false, knob: false, yaw: 0 });
    expect(counterRun(map, 4, 1)).toMatchObject({ plusEnd: true, legs: true, knob: true });
  });

  it('runs down a column turned a quarter', () => {
    expect(counterRun(map, 5, 2).yaw).toBe(Math.PI / 2);
  });

  it('names runs that share a model alike', () => {
    expect(counterRunKey(counterRun(map, 1, 1))).not.toBe(counterRunKey(counterRun(map, 2, 1)));
  });
});
