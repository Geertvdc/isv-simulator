import { describe, expect, it } from 'vitest';
import { formatClock, starText } from './format';

describe('formatClock', () => {
  it('shows m:ss, rounding up partial seconds', () => {
    expect(formatClock(180 * 60)).toBe('3:00');
    expect(formatClock(61 * 60 + 1)).toBe('1:02');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('starText', () => {
  it('fills one star per star earned', () => {
    expect(starText(0)).toBe('☆☆☆');
    expect(starText(2)).toBe('★★☆');
    expect(starText(3)).toBe('★★★');
  });
});
