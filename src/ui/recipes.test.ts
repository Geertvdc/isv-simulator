import { describe, expect, it } from 'vitest';
import { DOWN_THE_HALL, GARAGE, SEED_ROUND, THE_REORG, levelById } from '../sim/levels';
import { levelRecipes } from './recipes';

const names = (recipes: ReturnType<typeof levelRecipes>): string[] => recipes.map((r) => r.name);

describe('levelRecipes', () => {
  it('shows authored design and two-part full-stack workflows without disguising code-only parts', () => {
    const lab = levelById('lab-roles');
    if (!lab) throw new Error('Missing role lab');
    const recipes = levelRecipes(lab, 4);
    expect(recipes).toContainEqual({
      name: 'Feature with design',
      steps: ['design', 'code', 'test', 'pipeline'],
    });
    expect(recipes).toContainEqual({
      name: 'Full-stack (two parts)',
      steps: ['code', 'merge', 'test', 'pipeline'],
      kind: 'fullstack',
    });
  });

  it('shows features and bug fixes on the Garage', () => {
    expect(levelRecipes(GARAGE, 2)).toEqual([
      { name: 'Feature', steps: ['code', 'test', 'pipeline'] },
      { name: 'Bug fix', steps: ['test', 'code', 'test', 'pipeline'] },
    ]);
  });

  it('adds reviewed features only when there are enough players for a review', () => {
    expect(names(levelRecipes(DOWN_THE_HALL, 1))).toEqual(['Feature', 'Bug fix']);
    expect(names(levelRecipes(DOWN_THE_HALL, 2))).toEqual([
      'Feature',
      'Feature with review',
      'Bug fix',
    ]);
  });

  it('adds hotfixes on levels with incidents', () => {
    expect(names(levelRecipes(SEED_ROUND, 1))).toEqual(['Feature', 'Bug fix', 'Hotfix']);
    expect(levelRecipes(THE_REORG, 3).at(-1)).toEqual({
      name: 'Hotfix',
      steps: ['code', 'pipeline'],
    });
  });
});
