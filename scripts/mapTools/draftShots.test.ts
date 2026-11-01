import { describe, expect, it } from 'vitest';
import { draftPlayUrl, draftQuery, levelShotName, renderFileName, shotIds } from './draftShots';
import { levelMapFile } from './mapFiles';

describe('levelMapFile', () => {
  const files = ['level-01-garage.txt', 'level-03-scale-up.txt', 'lab-dev.txt', 'drafts'];

  it('finds a level map by its campaign number', () => {
    expect(levelMapFile('garage', files)).toBe('level-01-garage.txt');
    expect(levelMapFile('scale-up', files)).toBe('level-03-scale-up.txt');
  });

  it('is null for unknown ids and missing files', () => {
    expect(levelMapFile('nope', files)).toBeNull();
    expect(levelMapFile('open-plan', files)).toBeNull();
  });
});

describe('shotIds', () => {
  const drafts = ['garage', 'open-plan'];

  it('takes every draft with --drafts', () => {
    expect(shotIds(['--', '--drafts'], drafts)).toEqual({ ids: drafts });
    const none = shotIds(['--drafts'], []);
    expect('error' in none && none.error).toMatch(/No drafts/);
  });

  it('takes listed ids once each', () => {
    expect(shotIds(['open-plan', 'garage', 'open-plan'], drafts)).toEqual({
      ids: ['open-plan', 'garage'],
    });
  });

  it('refuses no ids, unknown ids and ids without a draft', () => {
    expect(shotIds([], drafts)).toHaveProperty('error');
    expect(shotIds(['nope'], drafts)).toEqual({ error: 'Unknown level id: nope' });
    expect(shotIds(['scale-up'], drafts)).toEqual({ error: 'No draft for: scale-up' });
  });
});

describe('names', () => {
  it('match the screenshot and the sketch folder', () => {
    expect(levelShotName('garage')).toBe('levels/garage');
    expect(renderFileName('garage')).toBe('garage-3d.webp');
    expect(renderFileName('the-reorg', 1)).toBe('the-reorg-3d.webp');
    expect(renderFileName('the-reorg', 3)).toBe('the-reorg-phase3-3d.webp');
  });
});

describe('draft URLs', () => {
  it('load a draft and its later reorg phases', () => {
    expect(draftQuery('garage')).toBe('draft=garage');
    expect(draftQuery('the-reorg', 1)).toBe('draft=the-reorg');
    expect(draftQuery('the-reorg', 3)).toBe('draft=the-reorg&phase=3');
    expect(draftPlayUrl('http://localhost:5173/', 'synergy', 2)).toBe(
      'http://localhost:5173/?draft=synergy&phase=2',
    );
  });
});
