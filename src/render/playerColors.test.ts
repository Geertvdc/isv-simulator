import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '../sim/level';
import { playerColor, playerShape } from './playerColors';

describe('player looks', () => {
  it('gives every player a color and a hat shape of their own', () => {
    const ids = Array.from({ length: MAX_PLAYERS }, (_, i) => i + 1);
    expect(new Set(ids.map(playerColor)).size).toBe(MAX_PLAYERS);
    expect(new Set(ids.map(playerShape)).size).toBe(MAX_PLAYERS);
  });
});
