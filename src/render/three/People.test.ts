import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DEVELOPER_TOP } from './DeveloperRig';
import { HEAD_TOP, carryPoint, placeTicket } from './layout';
import { People, createWorkMemory, noteWork, workSample } from './People';
import { kitMaterials } from './kit';
import { ROLE_IDS } from '../../sim/roles';
import { levelById } from '../../sim/levels';
import { createGame } from '../../sim/state';
import { frameView } from '../roundView';
import { runScene, sceneById } from '../../sim/scenes';
import { THROW_HOLD_TICKS } from '../../sim/balance';

describe('noteWork', () => {
  it('animates only actual paired/test/repair contributors, not nearby contenders', () => {
    const fixture = sceneById('roles-work');
    if (!fixture) throw new Error('Missing work fixture');
    const state = runScene(fixture).state;
    expect(state.workFeedback).toHaveLength(4);
    for (const id of [1, 2, 3, 4]) {
      expect(workSample(state, id)?.progress).toBe(state.tick);
    }
    state.workFeedback = state.workFeedback.filter((work) => work.playerId !== 3);
    expect(workSample(state, 3)).toBeNull();
    expect(workSample(state, 4)).toEqual({ ticketId: -1, progress: state.tick });
  });

  it('shows working while the step in front moves, a moment longer, then stops', () => {
    const m = createWorkMemory();
    expect(noteWork(m, { ticketId: 1, progress: 0.1 }, 0, 0)).toBe(false);
    expect(noteWork(m, { ticketId: 1, progress: 0.2 }, 0, 16)).toBe(true);
    // No progress this frame: still working for a moment.
    expect(noteWork(m, { ticketId: 1, progress: 0.2 }, 0, 100)).toBe(true);
    expect(noteWork(m, { ticketId: 1, progress: 0.2 }, 0, 400)).toBe(false);
  });

  it('does not count turning to another ticket with more progress', () => {
    const m = createWorkMemory();
    noteWork(m, { ticketId: 1, progress: 0.1 }, 0, 0);
    expect(noteWork(m, { ticketId: 2, progress: 0.8 }, 0, 16)).toBe(false);
  });

  it('does not count walking past a station someone else works', () => {
    const m = createWorkMemory();
    noteWork(m, { ticketId: 1, progress: 0.1 }, 4, 0);
    expect(noteWork(m, { ticketId: 1, progress: 0.2 }, 4, 16)).toBe(false);
  });

  it('forgets the ticket when nothing is in front', () => {
    const m = createWorkMemory();
    noteWork(m, { ticketId: 1, progress: 0.1 }, 0, 0);
    noteWork(m, null, 0, 16);
    expect(noteWork(m, { ticketId: 1, progress: 0.3 }, 0, 32)).toBe(false);
  });
});

describe('character heights', () => {
  it('keeps the overlay head envelope in step with the production rig', () => {
    expect(HEAD_TOP).toBe(DEVELOPER_TOP);
  });

  it('syncs snapshot roles, replaces only owned models, removes spectators and disposes resources once', () => {
    const level = levelById('garage');
    if (!level) throw new Error('Missing garage');
    const materials = kitMaterials();
    const shared = vi.spyOn(materials.body, 'dispose');
    const scene = new THREE.Scene();
    const people = new People(scene, materials);
    const geometrySpies: ReturnType<typeof vi.spyOn>[] = [];
    for (const [i, role] of ROLE_IDS.entries()) {
      const state = createGame(level, 1, [1], { 1: role });
      const player = state.players[0];
      if (!player) throw new Error('Missing player');
      const before = JSON.stringify(state);
      const view = frameView({
        state,
        serverTick: state.tick,
        alpha: 0,
        status: 'interpolating',
        players: { 1: player.pos },
        managers: {},
      });
      people.sync(view, [], i * 100);
      const model = scene.getObjectByName(`developer-${role}`);
      expect(model).toBeDefined();
      expect(scene.children).toHaveLength(2);
      const geoms = new Set<{ dispose(): void }>();
      model?.traverse((part) => {
        if (part instanceof THREE.Mesh && part.geometry instanceof THREE.BufferGeometry)
          geoms.add(part.geometry);
      });
      geometrySpies.forEach((spy) => {
        expect(spy).toHaveBeenCalledOnce();
      });
      geometrySpies.push(...[...geoms].map((g) => vi.spyOn(g, 'dispose')));
      // Same role: no allocation/replacement on the next snapshot.
      people.sync(view, [], i * 100 + 16);
      expect(scene.getObjectByName(`developer-${role}`)).toBe(model);
      expect(JSON.stringify(state)).toBe(before);
    }
    const state = createGame(level, 1, [1]);
    // Spectator/interpolation view has no rendered position for this player.
    people.sync(
      frameView({
        state,
        serverTick: state.tick,
        alpha: 0,
        status: 'interpolating',
        players: {},
        managers: {},
      }),
      [],
      1000,
    );
    expect(scene.children).toHaveLength(0);
    geometrySpies.forEach((spy) => {
      expect(spy).toHaveBeenCalledOnce();
    });
    expect(shared).not.toHaveBeenCalled();
    people.destroy();
    for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
  });

  it('keeps the ticket and both wrists on the smoothed facing during a turning wind-up', () => {
    const fixture = sceneById('cast-mixed');
    if (!fixture) throw new Error('Missing cast fixture');
    const state = runScene(fixture).state;
    const p = state.players[0];
    if (!p) throw new Error('Missing player');
    const ticket = state.tickets.find(
      (t) => t.location.kind === 'player' && t.location.playerId === p.id,
    );
    if (!ticket) throw new Error('Missing ticket');
    const scene = new THREE.Scene();
    const materials = kitMaterials();
    const people = new People(scene, materials);
    const view = {
      state,
      renderPos: (id: number) => state.players.find((p) => p.id === id)?.pos,
      renderManagerPos: () => undefined,
    };
    people.sync(view, [], 0);
    const root = scene.getObjectByName('developer-generalist');
    if (!root) throw new Error('Missing developer');
    const hands = root.children.filter(
      (part) => part instanceof THREE.Mesh && part.geometry instanceof THREE.BufferGeometry,
    );
    // Root children are waist, then upper/lower/elbow/hand for each arm.
    const left = hands[4];
    const right = hands[8];
    if (!left || !right) throw new Error('Missing wrists');
    p.facing = { x: 1, y: 0 };
    for (let charge = 0; charge <= THROW_HOLD_TICKS; charge++) {
      p.throwCharge = charge;
      people.sync(view, [], 16 + charge * 16);
      root.updateMatrixWorld(true);
      const placed = placeTicket(view, ticket, (id) => people.yawOf(id));
      if (!placed) throw new Error('Missing carried ticket');
      const yaw = people.yawOf(p.id);
      if (yaw === undefined) throw new Error('Missing displayed facing');
      const hold = carryPoint(charge / THROW_HOLD_TICKS);
      expect(placed.yaw).toBe(yaw);
      const midpoint = left
        .getWorldPosition(new THREE.Vector3())
        .add(right.getWorldPosition(new THREE.Vector3()))
        .multiplyScalar(0.5);
      expect(midpoint.x).toBeCloseTo(placed.pos.x);
      expect(midpoint.z).toBeCloseTo(placed.pos.z);
      expect(midpoint.y).toBeCloseTo(hold.height + 0.03);
    }
    people.destroy();
    for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
  });
});
