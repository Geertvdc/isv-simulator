import { describe, expect, it } from 'vitest';
import { logoWords } from './logo';

describe('logoWords', () => {
  it('splits a joined name at its capitals', () => {
    expect(logoWords('OverEngineered')).toEqual(['Over', 'Engineered']);
  });

  it('splits on spaces and keeps a single word whole', () => {
    expect(logoWords('ISV Simulator')).toEqual(['ISV', 'Simulator']);
    expect(logoWords('Game')).toEqual(['Game']);
  });
});
