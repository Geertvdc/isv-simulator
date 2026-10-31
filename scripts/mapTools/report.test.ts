import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/sim/levels';
import { parseDraftMap } from './mapChars';
import {
  REPORT_TABLE_HEADER,
  analyzeMap,
  formatChokepoint,
  formatReport,
  reportTableRow,
  stationSummary,
} from './report';

/** Two rooms joined by one door at 4,2. */
const TWO_ROOMS = ['##########', '#I.1#...K#', '#2.......T', '#S..#.34P#', '##########'].join('\n');

/** A ring round a block: the short way back to the inbox is the left side. */
const RING = ['#I####K##', '#..1....#', '#.#####.T', '#.#####.P', '#...2.3.#', '#S#4#####'].join(
  '\n',
);

/** A gap splits players 1 and 2 from 3 and 4; the test bench is over the gap. */
const SPLIT = ['#IKTPS#', '#12~34#', '#######'].join('\n');

describe('analyzeMap', () => {
  it('counts size, floor, stations and spawns', () => {
    const report = analyzeMap(parseDraftMap(TWO_ROOMS));
    expect(report.width).toBe(10);
    expect(report.height).toBe(5);
    expect(report.floorTiles).toBe(18);
    expect(stationSummary(report)).toBe('I1 K1 T1 P1 S1');
    expect(report.spawns[0]).toEqual({ x: 3, y: 1 });
  });

  it('walks the solo run from spawn 1 and the shortest loop back to the inbox', () => {
    const report = analyzeMap(parseDraftMap(TWO_ROOMS));
    expect(report.soloRun).toBe(15);
    expect(report.loop).toBe(14);
  });

  it('finds a door that splits two rooms', () => {
    const report = analyzeMap(parseDraftMap(TWO_ROOMS));
    expect(report.chokepoints).toEqual([{ kind: 'cut', tiles: [{ x: 4, y: 2 }] }]);
    expect(report.unreachable).toEqual([]);
  });

  it('finds 1-wide stretches that make the loop much longer when blocked', () => {
    const report = analyzeMap(parseDraftMap(RING));
    expect(report.loop).toBe(18);
    expect(report.soloRun).toBe(17);
    expect(report.chokepoints).toEqual([
      {
        kind: 'detour',
        tiles: [
          { x: 2, y: 1 },
          { x: 3, y: 1 },
          { x: 4, y: 1 },
          { x: 5, y: 1 },
        ],
        extraSteps: 8,
      },
      {
        kind: 'detour',
        tiles: [
          { x: 1, y: 2 },
          { x: 1, y: 3 },
        ],
        extraSteps: 12,
      },
    ]);
  });

  it('lists stations a player cannot walk to, and has no loop then', () => {
    const report = analyzeMap(parseDraftMap(SPLIT));
    const missing = (player: number): string[] =>
      report.unreachable.filter((u) => u.player === player).map((u) => u.tile);
    expect(missing(1)).toEqual(['testBench', 'pipeline', 'ship']);
    expect(missing(4)).toEqual(['inbox', 'keyboard', 'testBench']);
    expect(report.loop).toBeNull();
    expect(report.soloRun).toBeNull();
  });

  it('treats touching tiles of one kind as one station', () => {
    const report = analyzeMap(parseDraftMap(['#II#K#', '#.C12#', '#3..4#', '#TPS##'].join('\n')));
    expect(report.tiles.inbox).toBe(2);
    expect(report.unreachable).toEqual([]);
  });

  it('reads future chars through their stand-ins', () => {
    const wet = analyzeMap(parseDraftMap(TWO_ROOMS.replace('#2......', '#2__....')));
    expect(wet.loop).toBe(14);
    const walled = analyzeMap(parseDraftMap(TWO_ROOMS.replace('#2.......T', '#2..=....T')));
    expect(walled.unreachable.length).toBeGreaterThan(0);
  });

  it('reports every campaign level with a loop and every station in reach', () => {
    for (const level of LEVELS) {
      const report = analyzeMap(level.map);
      expect(report.loop, level.id).not.toBeNull();
      expect(report.unreachable, level.id).toEqual([]);
    }
  });
});

describe('formatting', () => {
  it('writes chokepoints short', () => {
    expect(formatChokepoint({ kind: 'cut', tiles: [{ x: 4, y: 2 }] })).toBe('cut 4,2');
    expect(
      formatChokepoint({
        kind: 'detour',
        tiles: [
          { x: 1, y: 2 },
          { x: 1, y: 3 },
        ],
        extraSteps: 12,
      }),
    ).toBe('detour 1,2–1,3 (2) +12');
  });

  it('writes a markdown row matching the header', () => {
    const row = reportTableRow('Two rooms', analyzeMap(parseDraftMap(TWO_ROOMS)));
    const columns = (line: string): number => line.split('|').length;
    expect(row).toBe('| Two rooms | 10×5 | 18 | I1 K1 T1 P1 S1 | 15 | 14 | cut 4,2 | all |');
    expect(columns(row)).toBe(columns(REPORT_TABLE_HEADER.split('\n')[0] ?? ''));
  });

  it('summarises unreachable stations per station', () => {
    const row = reportTableRow('Split', analyzeMap(parseDraftMap(SPLIT)));
    expect(row).toContain('not T 3,0, P 4,0 (P1 P2), S 5,0 (P1 P2), I 1,0 (P3 P4), K 2,0 (P3 P4)');
  });

  it('writes a readable report', () => {
    const text = formatReport('Two rooms', analyzeMap(parseDraftMap(TWO_ROOMS)));
    expect(text).toContain('10×5, 18 floor tiles');
    expect(text).toContain('cut 4,2');
    expect(text).toContain('every station from every spawn');
  });
});
