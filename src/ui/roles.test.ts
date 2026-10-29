import { describe, expect, it } from 'vitest';
import { domainText, roleSkills, roleText, workRateText } from './roles';
import { ROLE_IDS } from '../sim/roles';
import { commitHead } from '../sim/content';

describe('role and effective speed labels', () => {
  it('charts every skill on the same baseline scale, not a misleading peak', () => {
    for (const role of ROLE_IDS) {
      const skills = roleSkills(role);
      expect(skills).toHaveLength(8);
      for (const skill of skills) {
        expect(skill.percent).toBeCloseTo((skill.rate / 1.6) * 100);
        expect(skill.percent).toBeGreaterThan(0);
        expect(skill.percent).toBeLessThanOrEqual(100);
      }
    }
    expect(roleSkills('frontend')[1]).toEqual({
      label: 'Frontend code',
      rate: 1.5,
      percent: 93.75,
    });
    expect(roleSkills('qa').find((skill) => skill.label === 'Testing')?.rate).toBe(1.6);
    expect(roleSkills('generalist').every((skill) => skill.rate === 1)).toBe(true);
  });
  it('uses text alongside icons and distinguishes role, workflow and domain', () => {
    expect(roleText('generalist')).toContain('Full-stack developer');
    expect(domainText('mixed')).toContain('Cross-cutting');
    expect(domainText('frontend')).toContain('Frontend');
  });
  it('puts the ticket domain in the commit scope, keeping a hotfix breaking', () => {
    expect(commitHead('feature', 'general')).toEqual({ type: 'feat', breaking: false });
    expect(commitHead('feature', 'backend')).toEqual({
      type: 'feat',
      scope: 'api',
      breaking: false,
    });
    expect(commitHead('bug', 'frontend')).toMatchObject({ type: 'fix', scope: 'ui' });
    expect(commitHead('incident', 'infra')).toEqual({
      type: 'fix',
      scope: 'infra',
      breaking: true,
    });
    expect(commitHead('incident', 'general')).toEqual({ type: 'fix', breaking: true });
    expect(commitHead('fullstack', 'mixed').scope).toBe('app');
    expect(commitHead('frontend', 'frontend').scope).toBe('ui');
  });
  it('formats work speed, pair contribution/total, and quorum without invented review speed', () => {
    expect(workRateText({ playerId: 1, task: 'test', rate: 0.9 })).toBe('Test 0.90x');
    expect(workRateText({ playerId: 1, task: 'code', rate: 2.28, teamRate: 4.56 })).toBe(
      'Code 2.28x · pair total 4.56x',
    );
    expect(workRateText({ playerId: 1, task: 'review', rate: 1 })).toBe('Review · quorum met');
  });
});
