import { describe, expect, it } from 'vitest';
import { LEVELS } from './levels';
import { SCENES, sceneById } from './sceneCatalog';
import { type Scene, runScene } from './scenes';

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

  it('cast evidence uses explicit roles, four separated floor positions, and actual throw states', () => {
    const mixed = runScene(scene('cast-mixed')).state;
    expect(mixed.players.map((p) => p.roleId)).toEqual(['generalist', 'frontend', 'backend', 'qa']);
    const duplicates = runScene(scene('cast-duplicates')).state;
    expect(duplicates.players.map((p) => p.roleId)).toEqual(Array<string>(4).fill('generalist'));
    expect(new Set(duplicates.players.map((p) => `${p.pos.x},${p.pos.y}`)).size).toBe(4);
    // Review fixtures keep all four bodies forward of the conveyor rather than behind it.
    expect(duplicates.players.every((p) => p.pos.y >= 4)).toBe(true);
    expect(runScene(scene('cast-windup')).state.players.some((p) => p.throwCharge > 0)).toBe(true);
    expect(
      runScene(scene('cast-release')).state.tickets.some((t) => t.location.kind === 'flying'),
    ).toBe(true);
  });
});
