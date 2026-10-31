import { describe, expect, it } from 'vitest';
import { draftIdsIn, draftPhasesIn } from './mapFiles';
import { phaseProblems } from './phases';

describe('draft phase files', () => {
  const files = [
    'the-reorg.phase3.txt',
    'garage.txt',
    'the-reorg.txt',
    'the-reorg.phase2.txt',
    'synergy.phase2.txt',
    'README.md',
  ];

  it('are not drafts of their own', () => {
    expect(draftIdsIn(files)).toEqual(['garage', 'the-reorg']);
  });

  it('follow the main draft in phase order', () => {
    expect(draftPhasesIn('the-reorg', files)).toEqual([
      { phase: 1, file: 'the-reorg.txt' },
      { phase: 2, file: 'the-reorg.phase2.txt' },
      { phase: 3, file: 'the-reorg.phase3.txt' },
    ]);
    expect(draftPhasesIn('garage', files)).toEqual([{ phase: 1, file: 'garage.txt' }]);
  });

  it('need a main draft', () => {
    expect(draftPhasesIn('synergy', files)).toEqual([]);
  });
});

describe('phaseProblems', () => {
  const first = ['#I#K#', '#1=D#', '#2.3#', '#4.C#', '#SPT#'].join('\n');

  it('lets partitions and rolling desks move onto and off floor', () => {
    const later = ['#I#K#', '#1.=#', '#2D3#', '#4.C#', '#SPT#'].join('\n');
    expect(phaseProblems(first, later)).toEqual([]);
  });

  it('flags moved walls, stations and spawns', () => {
    const later = ['#I#K#', '#.=D#', '#21.#', '#4.C#', '#SP.#'].join('\n');
    expect(phaseProblems(first, later)).toEqual([
      "1,1 '1' -> '.'",
      "2,2 '.' -> '1'",
      "3,2 '3' -> '.'",
      "3,4 'T' -> '.'",
    ]);
  });

  it('flags a different size or number of desks', () => {
    expect(phaseProblems(first, '#I#K#')).toEqual(['size 5×1 is not 5×5']);
    const lostDesk = ['#I#K#', '#1=.#', '#2.3#', '#4.C#', '#SPT#'].join('\n');
    expect(phaseProblems(first, lostDesk)).toEqual(['0 rolling desks, not 1']);
  });
});
