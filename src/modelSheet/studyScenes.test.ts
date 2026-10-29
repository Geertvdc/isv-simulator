import { describe, expect, it } from 'vitest';
import { studyTicketTarget } from '../render/three/CharacterStudies';
import { STUDY_ACTIONS, studyFrame } from './studyScenes';

describe('isolated study action loops', () => {
  it('exposes all seven actions and repeats deterministically', () => {
    expect(STUDY_ACTIONS).toEqual(['idle', 'walk', 'work', 'carry', 'dash', 'throw', 'shove']);
    for (const action of STUDY_ACTIONS) {
      const a = studyFrame(action, 900);
      const b = studyFrame(action, 900);
      expect(a).toEqual(b);
      expect(a.input.working).toBe(action === 'work');
      expect(a.input.dashing).toBe(action === 'dash');
      expect(a.input.speed > 0).toBe(action === 'walk' || action === 'dash');
    }
  });
  it('uses the game carry target through wind-up, then visibly releases', () => {
    for (const time of [0, 400, 800, 1200, 1599]) {
      const frame = studyFrame('throw', time);
      expect(frame.input.carrying).toBe(true);
      expect(frame.ticket).toEqual(studyTicketTarget(time / 1600));
    }
    const release = studyFrame('throw', 1600);
    expect(release.input.carrying).toBe(false);
    expect(release.ticket?.y).toBeCloseTo(1.3);
    expect(studyFrame('throw', 2300).ticket?.z).toBeGreaterThan(release.ticket?.z ?? 0);
  });
});
