import { describe, expect, it } from 'vitest';
import { draftFileName, draftLevel, draftRequest, toStandIns } from './draftMap';
import { LEVELS, levelById } from './levels';

const IDS = LEVELS.map((l) => l.id);

describe('draftRequest', () => {
  it('is null without ?draft=', () => {
    expect(draftRequest(null, '2', IDS)).toBeNull();
  });

  it('takes a campaign level, phase 1 unless asked', () => {
    expect(draftRequest('garage', null, IDS)).toEqual({ id: 'garage', phase: 1 });
    expect(draftRequest('the-reorg', '3', IDS)).toEqual({ id: 'the-reorg', phase: 3 });
  });

  it('refuses unknown levels and odd phases', () => {
    expect(draftRequest('lab-roles', null, IDS)).toHaveProperty('error');
    expect(draftRequest('garage', '0', IDS)).toHaveProperty('error');
    expect(draftRequest('garage', 'two', IDS)).toHaveProperty('error');
    expect(draftRequest('garage', '1.5', IDS)).toHaveProperty('error');
  });
});

describe('draftFileName', () => {
  it('names the main draft and later reorg phases', () => {
    expect(draftFileName('garage')).toBe('garage.txt');
    expect(draftFileName('the-reorg', 1)).toBe('the-reorg.txt');
    expect(draftFileName('the-reorg', 2)).toBe('the-reorg.phase2.txt');
  });
});

describe('draftLevel', () => {
  const garage = levelById('garage');
  if (!garage) throw new Error('no garage');
  const text = ['#I__K#', '#1D.2#', '#3=.4#', '#S##T#'].join('\n');

  it('keeps the level and its settings, with the draft as the map', () => {
    const level = draftLevel(garage, text);
    expect(level.id).toBe('garage');
    expect(level.orderSchedule).toEqual(garage.orderSchedule);
    expect(level.durationTicks).toBe(garage.durationTicks);
    expect(level.map.width).toBe(6);
    expect(level.map.height).toBe(4);
    expect(garage.map.width).not.toBe(6);
  });

  it('reads future chars as their stand-ins', () => {
    const { map } = draftLevel(garage, text);
    const at = (x: number, y: number) => map.tiles[y * map.width + x];
    expect(at(2, 0)).toBe('floor'); // wet floor
    expect(at(2, 1)).toBe('counter'); // rolling desk
    expect(at(2, 2)).toBe('wall'); // partition
    expect(toStandIns('_=D')).toBe('.#C');
  });
});

describe('every draft in maps/drafts/', () => {
  const drafts = import.meta.glob<string>('../../maps/drafts/*.txt', {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  it('loads as a playable level with its campaign level settings', () => {
    expect(Object.keys(drafts).length).toBeGreaterThan(0);
    for (const [path, text] of Object.entries(drafts)) {
      const id = /([^/]+?)(\.phase\d+)?\.txt$/.exec(path)?.[1] ?? '';
      const level = levelById(id);
      expect(level, path).toBeDefined();
      if (!level) continue;
      expect(() => draftLevel(level, text), path).not.toThrow();
    }
  });
});
