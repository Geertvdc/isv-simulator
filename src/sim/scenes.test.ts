import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { SCENES, type Scene, runScene, sceneById } from './scenes';

function scene(id: string): Scene {
  const found = sceneById(id);
  if (!found) throw new Error(`No scene ${id}`);
  return found;
}

describe('scenes', () => {
  it('have unique ids', () => {
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
  });

  it('include every level', () => {
    for (const level of LEVELS) expect(sceneById(`level-${level.id}`)).toBeDefined();
  });

  it.each(SCENES.map((s) => [s.id, s] as const))('%s reaches its moment', (_, s) => {
    expect(runScene(s).reached).toBe(true);
  });

  it('ship and yolo score, and only yolo ships untested', () => {
    for (const id of ['ship', 'yolo']) {
      const shipped = runScene(scene(id)).state.events.find((e) => e.type === 'orderShipped');
      if (shipped?.type !== 'orderShipped') throw new Error(`${id} shipped nothing`);
      expect(shipped.points).toBeGreaterThan(20);
      expect(shipped.untested).toBe(id === 'yolo');
    }
  });

  it('work scenes make progress at their station', () => {
    for (const id of ['work-code', 'work-test', 'review', 'bug-reproduce', 'hotfix']) {
      const before = JSON.stringify(runScene({ ...scene(id), ticks: 0 }).state.tickets);
      const after = JSON.stringify(runScene(scene(id)).state.tickets);
      expect(after, id).not.toBe(before);
    }
  });

  it('the results scene ends the round', () => {
    expect(runScene(scene('results')).state.result).not.toBeNull();
  });
});
