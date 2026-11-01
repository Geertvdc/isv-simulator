import { describe, expect, it } from 'vitest';
import {
  type DraftSimRow,
  draftFailed,
  draftSimTable,
  draftVerdict,
  scoreChange,
  summarizeRuns,
} from './draftSim';

const run = (score: number, stars: number, shipped: number) => ({ score, stars, shipped });
const CURRENT = [run(200, 2, 10), run(300, 3, 14)];

function row(draft: DraftSimRow['draft']): DraftSimRow {
  return { level: '1-1 The Garage', phase: 1, bots: 2, current: CURRENT, draft };
}

describe('summarizeRuns', () => {
  it('averages scores, stars and ships and counts runs that shipped nothing', () => {
    expect(summarizeRuns([run(100, 1, 5), run(0, 0, 0), run(201, 3, 10)])).toEqual({
      averageScore: 100,
      averageStars: 4 / 3,
      averageShipped: 5,
      worstStars: 0,
      stuckRuns: 1,
    });
  });
});

describe('draftVerdict', () => {
  it('is ok when bots ship every run at half the current score or better', () => {
    expect(draftVerdict(row([run(130, 1, 6), run(130, 1, 6)]))).toBe('ok');
    expect(draftFailed(row([run(130, 1, 6)]))).toBe(false);
  });

  it('flags low scores without failing', () => {
    const low = row([run(100, 1, 5), run(100, 1, 5)]);
    expect(draftVerdict(low)).toBe('low');
    expect(draftFailed(low)).toBe(false);
  });

  it('fails runs that shipped nothing and drafts the sim threw on', () => {
    const stuck = row([run(300, 3, 12), run(0, 0, 0)]);
    expect(draftVerdict(stuck)).toBe('stuck 1/2');
    expect(draftFailed(stuck)).toBe(true);
    const broken = row({ error: 'no spawn' });
    expect(draftVerdict(broken)).toBe('error: no spawn');
    expect(draftFailed(broken)).toBe(true);
  });
});

describe('scoreChange', () => {
  it('compares with the current map', () => {
    expect(scoreChange(275, 250)).toBe('+10%');
    expect(scoreChange(250, 250)).toBe('0%');
    expect(scoreChange(125, 250)).toBe('-50%');
    expect(scoreChange(10, 0)).toBe('—');
  });
});

describe('draftSimTable', () => {
  it('prints one markdown row per draft phase and bot count', () => {
    const table = draftSimTable([
      row([run(300, 3, 12), run(200, 2, 9)]),
      { ...row({ error: 'boom' }), phase: 2 },
    ]).split('\n');
    expect(table).toHaveLength(4);
    expect(table[2]).toBe(
      '| 1-1 The Garage | 1 | 2 | 250 | 250 | 0% | 2.5 (worst 2) | 10.5 | ok |',
    );
    expect(table[3]).toBe('| 1-1 The Garage | 2 | 2 | 250 | — | — | — | — | error: boom |');
  });
});
