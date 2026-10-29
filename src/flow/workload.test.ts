import { describe, expect, it } from 'vitest';
import { levelById } from '../sim/levels';
import { coverageHint, workloadForecast } from './workload';

describe('authored workload, not adapted to the roster', () => {
  it('uses the actual classic and lab settings, counts both full-stack parts and incidents', () => {
    const garage = levelById('garage');
    const roles = levelById('lab-roles');
    if (!garage || !roles) throw new Error('Missing forecast levels');
    const classic = workloadForecast(garage, 1);
    expect(classic.codingDomains).toEqual(['general']);
    const lab = workloadForecast(roles, 4);
    const text = lab.lines.join(' ');
    expect(text).toContain('Frontend 2');
    expect(text).toContain('25%');
    expect(text).toContain('two coding parts');
    expect(text).toContain('Incidents: Infrastructure');
    expect(text).toContain('30s');
    expect(coverageHint(lab, ['qa'])).toContain('slower coding');
    expect(coverageHint(lab, ['generalist'])).toContain('specialisation is optional');
  });
});
