import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { STUDY_ACTIONS, studyFrame } from '../../modelSheet/studyScenes';
import {
  STUDY_HEAD_TOP,
  STUDY_STYLES,
  createStudy,
  disposeStudy,
  poseStudy,
  studyTicketTarget,
} from './CharacterStudies';
import { kitMaterials } from './kit';
import { ticketModel } from './ticketModels';

function intersectsMesh(box: THREE.Box3, mesh: THREE.Object3D): boolean {
  if (!(mesh instanceof THREE.Mesh) || !(mesh.geometry instanceof THREE.BufferGeometry)) {
    throw new Error('Expected study mesh geometry');
  }
  if (!box.intersectsBox(new THREE.Box3().setFromObject(mesh, true))) return false;
  const positions: unknown = mesh.geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute)) throw new Error('Missing study vertices');
  const triangle = new THREE.Triangle();
  for (let i = 0; i < positions.count; i += 3) {
    triangle.a.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    triangle.b.fromBufferAttribute(positions, i + 1).applyMatrix4(mesh.matrixWorld);
    triangle.c.fromBufferAttribute(positions, i + 2).applyMatrix4(mesh.matrixWorld);
    if (box.intersectsTriangle(triangle)) return true;
  }
  return false;
}

describe.each(STUDY_STYLES)('%s study rig', (style) => {
  it('connects each arm continuously to its shoulder and the unchanged hand target', () => {
    const materials = kitMaterials();
    const c = createStudy(style, 1, materials);
    c.root.position.set(4, 0, 7);
    c.root.rotation.y = Math.PI * 0.6;
    for (const action of STUDY_ACTIONS) {
      for (let time = 0; time < 2600; time += 37) {
        const { input } = studyFrame(action, time);
        poseStudy(c, input, time);
        c.root.updateMatrixWorld(true);
        for (const arm of c.arms) {
          const top = arm.upper.localToWorld(new THREE.Vector3(0, -0.5, 0));
          const elbow = arm.upper.localToWorld(new THREE.Vector3(0, 0.5, 0));
          const wrist = arm.lower.localToWorld(new THREE.Vector3(0, 0.5, 0));
          expect(top.distanceTo(arm.shoulder.getWorldPosition(new THREE.Vector3()))).toBeLessThan(
            1e-6,
          );
          expect(elbow.distanceTo(arm.elbow.getWorldPosition(new THREE.Vector3()))).toBeLessThan(
            1e-6,
          );
          expect(wrist.distanceTo(arm.hand.getWorldPosition(new THREE.Vector3()))).toBeLessThan(
            1e-6,
          );
          expect(arm.upper.scale.y).toBeLessThanOrEqual(0.56);
          expect(arm.lower.scale.y).toBeCloseTo(arm.upper.scale.y);
        }
      }
    }
    disposeStudy(c);
    for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
  });

  it('keeps the entire carry/wind-up arc clear of head and jacket', () => {
    const materials = kitMaterials();
    const c = createStudy(style, 2, materials);
    const ticket = ticketModel('feature');
    ticket.body.computeBoundingBox();
    const ticketBounds = ticket.body.boundingBox;
    if (!ticketBounds) throw new Error('Missing ticket bounds');
    for (let sample = 0; sample <= 100; sample++) {
      const wind = sample / 100;
      const { input } = studyFrame('carry', 900);
      input.windUp = wind;
      poseStudy(c, input, 900);
      c.root.updateMatrixWorld(true);
      const target = studyTicketTarget(wind);
      const card = ticketBounds.clone().translate(target);
      c.head.traverse((part) => {
        if (part instanceof THREE.Mesh) {
          expect(intersectsMesh(card, part), `head at wind-up ${wind}`).toBe(false);
          for (const arm of c.arms) {
            const hand = new THREE.Box3().setFromObject(arm.hand, true);
            expect(intersectsMesh(hand, part), `hand/head at wind-up ${wind}`).toBe(false);
          }
        }
        ticket.body.dispose();
      });
      const jacket = c.torso.children.find((child) => child instanceof THREE.Mesh);
      if (!jacket) throw new Error('Missing study jacket');
      expect(intersectsMesh(card, jacket), `jacket at ${wind}`).toBe(false);
      expect(intersectsMesh(card, c.waist), `waist at ${wind}`).toBe(false);
      const left = c.arms[0].hand.position;
      const right = c.arms[1].hand.position;
      expect(left.x).toBeCloseTo(target.x - 0.22);
      expect(right.x).toBeCloseTo(target.x + 0.22);
      expect(left.y).toBeCloseTo(target.y + 0.03);
      expect(right.z).toBeCloseTo(target.z);
    }
    disposeStudy(c);
    for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
  });

  it('has grounded shoes, split legs, and bounded head geometry in every action', () => {
    const materials = kitMaterials();
    const c = createStudy(style, 3, materials);
    const envelopes = new THREE.Box3();
    for (const action of STUDY_ACTIONS) {
      for (let time = 0; time < 2600; time += 83) {
        poseStudy(c, studyFrame(action, time).input, time);
        c.root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(c.head, true);
        envelopes.union(bounds);
        for (const leg of c.legs) {
          const shoe = new THREE.Box3().setFromObject(leg.shoe, true);
          expect(shoe.min.y).toBeGreaterThanOrEqual(-1e-6);
          const ankle = leg.lower.localToWorld(new THREE.Vector3(0, 0.5, 0));
          expect(ankle.y).toBeCloseTo(leg.shoe.position.y + 0.1);
        }
      }
    }
    expect(envelopes.max.y).toBeLessThan(STUDY_HEAD_TOP);
    expect(c.legs[0].shoe.position.x).toBeLessThan(c.legs[1].shoe.position.x);
    disposeStudy(c);
    for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
  });

  it('frees every owned geometry without disposing shared materials on replacement', () => {
    const materials = kitMaterials();
    const materialDispose = vi.spyOn(materials.body, 'dispose');
    const parent = new THREE.Group();
    const c = createStudy(style, 4, materials);
    parent.add(c.root);
    const disposals = c.geometries.map((g) => vi.spyOn(g, 'dispose'));
    disposeStudy(c);
    expect(parent.children).toHaveLength(0);
    disposals.forEach((spy) => {
      expect(spy).toHaveBeenCalledOnce();
    });
    expect(materialDispose).not.toHaveBeenCalled();
    const replacement = createStudy(style, 4, materials);
    poseStudy(replacement, studyFrame('carry', 0).input, 0);
    disposeStudy(replacement);
    for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
  });
});
