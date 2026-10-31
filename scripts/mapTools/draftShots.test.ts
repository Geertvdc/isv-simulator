import { describe, expect, it } from 'vitest';
import { levelShotName, phasePasses, renderFileName, shotIds } from './draftShots';
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

describe('phasePasses', () => {
  it('renders phase N of every level in pass N', () => {
    const phases = new Map([
      ['garage', [{ phase: 1 }]],
      ['the-reorg', [{ phase: 1 }, { phase: 2 }, { phase: 3 }]],
      ['synergy', [{ phase: 1 }, { phase: 2 }]],
    ]);
    const passes = phasePasses(phases).map((pass) =>
      pass.map(({ id, draft }) => `${id}:${draft.phase}`),
    );
    expect(passes).toEqual([
      ['garage:1', 'the-reorg:1', 'synergy:1'],
      ['the-reorg:2', 'synergy:2'],
      ['the-reorg:3'],
    ]);
  });
});
