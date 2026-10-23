import { describe, expect, it } from 'vitest';
import { archOf, logoWords } from './logo';

describe('logoWords', () => {
  it('splits a joined name at its capitals', () => {
    expect(logoWords('OverEngineered')).toEqual(['Over', 'Engineered']);
  });

  it('splits on spaces and keeps a single word whole', () => {
    expect(logoWords('ISV Simulator')).toEqual(['ISV', 'Simulator']);
    expect(logoWords('Game')).toEqual(['Game']);
  });
});

describe('archOf', () => {
  it('lifts the middle letter most and leans the ends out', () => {
    const first = archOf(0, 9);
    const middle = archOf(4, 9);
    const last = archOf(8, 9);
    expect(middle.lift).toBeGreaterThan(first.lift);
    expect(first.lift).toBeCloseTo(last.lift);
    expect(first.tiltDeg).toBeLessThan(0);
    expect(last.tiltDeg).toBeGreaterThan(0);
    expect(middle.tiltDeg).toBeCloseTo(0);
  });

  it('leaves a single letter flat', () => {
    expect(archOf(0, 1)).toEqual({ lift: 0, tiltDeg: 0 });
  });
});
