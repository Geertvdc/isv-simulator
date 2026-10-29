import { describe, expect, it } from 'vitest';
import { domainText, roleText, workRateText } from './roles';

describe('role and effective speed labels', () => {
  it('uses text alongside icons and distinguishes role, workflow and domain', () => {
    expect(roleText('generalist')).toContain('Full-stack developer');
    expect(domainText('mixed')).toContain('Cross-cutting');
    expect(domainText('frontend')).toContain('Frontend');
  });
  it('formats work speed, pair contribution/total, and quorum without invented review speed', () => {
    expect(workRateText({ playerId: 1, task: 'test', rate: 0.9 })).toBe('Test 0.90x');
    expect(workRateText({ playerId: 1, task: 'code', rate: 2.28, teamRate: 4.56 })).toBe(
      'Code 2.28x · pair total 4.56x',
    );
    expect(workRateText({ playerId: 1, task: 'review', rate: 1 })).toBe('Review · quorum met');
  });
});
