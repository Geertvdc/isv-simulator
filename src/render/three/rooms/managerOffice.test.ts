import { describe, expect, it } from 'vitest';
import { parseLevelMap as parseDraftMap } from '../../../sim/level';
import { BEFORE_MAPS } from '../fixtures/beforeMaps';
import draftText from '../../../../maps/level-07-middle-management.txt?raw';
import { managerOffice } from './managerOffice';

describe('managerOffice', () => {
  it('finds no office on the shipped map, where the manager starts on the open floor', () => {
    expect(managerOffice(BEFORE_MAPS['middle-management'])).toBeNull();
  });

  it("finds Derek's corner office on the redesign draft, with its one door", () => {
    const office = managerOffice(parseDraftMap(draftText));
    expect(office).not.toBeNull();
    expect(office).toMatchObject({ x0: 1, y0: 5, x1: 7, y1: 6 });
    expect(office?.doors).toEqual([{ x: 8, y: 6 }]);
    expect(office?.tiles).toContain('2,5');
  });
});
