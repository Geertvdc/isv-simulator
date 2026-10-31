import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { STUDY_ACTIONS, studyFrame } from '../../modelSheet/studyScenes';
import { ROLE_IDS } from '../../sim/roles';
import { applyPose, createDeveloper, disposeCharacter } from './Characters';
import { DEVELOPER_TOP, DEVELOPER_HAIRSTYLES, developerAppearance } from './DeveloperRig';
import { kitMaterials } from './kit';
import { carryGrip, carryPoint } from './layout';
import { ticketModel } from './ticketModels';
import { playerPose } from './pose';

/** Whether `mesh` cuts into `box`, which sits in `frame` (world when absent). */
function intersectsMesh(box: THREE.Box3, mesh: THREE.Object3D, frame?: THREE.Matrix4): boolean {
  if (!(mesh instanceof THREE.Mesh) || !(mesh.geometry instanceof THREE.BufferGeometry)) {
    throw new Error('Missing production mesh');
  }
  const outer = frame ? box.clone().applyMatrix4(frame) : box;
  if (!outer.intersectsBox(new THREE.Box3().setFromObject(mesh, true))) return false;
  const toBox = frame ? frame.clone().invert().multiply(mesh.matrixWorld) : mesh.matrixWorld;
  const positions: unknown = mesh.geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute)) throw new Error('Missing model vertices');
  const index = mesh.geometry.index;
  const vertex = (i: number) => (index ? index.getX(i) : i);
  const count = index ? index.count : positions.count;
  const triangle = new THREE.Triangle();
  for (let i = 0; i < count; i += 3) {
    triangle.a.fromBufferAttribute(positions, vertex(i)).applyMatrix4(toBox);
    triangle.b.fromBufferAttribute(positions, vertex(i + 1)).applyMatrix4(toBox);
    triangle.c.fromBufferAttribute(positions, vertex(i + 2)).applyMatrix4(toBox);
    if (box.intersectsTriangle(triangle)) return true;
  }
  return false;
}

describe.each(
  ROLE_IDS.flatMap((role) => DEVELOPER_HAIRSTYLES.map((hairstyle) => [role, hairstyle] as const)),
)('%s %s production rig', (role, hairstyle) => {
  it('attaches shoulders, elbows and wrists; grounds split legs and bounds every accessory', () => {
    const materials = kitMaterials();
    const c = createDeveloper(1, materials, role, { ...developerAppearance(1), hairstyle });
    const rig = c.rig;
    if (!rig) throw new Error('Missing production rig');
    c.root.position.set(4, 0, 7);
    c.root.rotation.y = Math.PI * 0.6;
    for (const action of STUDY_ACTIONS) {
      for (let time = 0; time < 2600; time += 53) {
        applyPose(c, playerPose(studyFrame(action, time).input, time));
        c.root.updateMatrixWorld(true);
        for (const arm of rig.arms) {
          expect(
            arm.upper
              .localToWorld(new THREE.Vector3(0, -0.5, 0))
              .distanceTo(arm.shoulder.getWorldPosition(new THREE.Vector3())),
          ).toBeLessThan(1e-6);
          expect(
            arm.upper
              .localToWorld(new THREE.Vector3(0, 0.5, 0))
              .distanceTo(arm.elbow.getWorldPosition(new THREE.Vector3())),
          ).toBeLessThan(1e-6);
          expect(
            arm.lower
              .localToWorld(new THREE.Vector3(0, -0.5, 0))
              .distanceTo(arm.elbow.getWorldPosition(new THREE.Vector3())),
          ).toBeLessThan(1e-6);
          expect(
            arm.lower
              .localToWorld(new THREE.Vector3(0, 0.5, 0))
              .distanceTo(arm.hand.getWorldPosition(new THREE.Vector3())),
          ).toBeLessThan(1e-6);
          expect(arm.upper.scale.y).toBeLessThanOrEqual(0.56);
          expect(arm.lower.scale.y).toBeCloseTo(arm.upper.scale.y);
        }
        expect(new THREE.Box3().setFromObject(c.head, true).max.y, action).toBeLessThan(
          DEVELOPER_TOP,
        );
        for (const leg of rig.legs) {
          expect(new THREE.Box3().setFromObject(leg.shoe, true).min.y).toBeGreaterThanOrEqual(
            -1e-6,
          );
          expect(leg.lower.localToWorld(new THREE.Vector3(0, 0.5, 0)).y).toBeCloseTo(
            leg.shoe.getWorldPosition(new THREE.Vector3()).y + 0.1,
          );
        }
      }
    }
    disposeCharacter(c);
    for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
  });

  it('clears the real folder envelope and hands through the complete wind-up, including moving/shoved carriers', () => {
    const materials = kitMaterials();
    const c = createDeveloper(2, materials, role, { ...developerAppearance(2), hairstyle });
    const folder = ticketModel('feature');
    folder.body.computeBoundingBox();
    const bounds = folder.body.boundingBox;
    if (!bounds) throw new Error('Missing folder envelope');
    for (const motion of ['still', 'walking', 'dash', 'shove'] as const) {
      for (let sample = 0; sample <= 100; sample++) {
        const wind = sample / 100;
        const { input } = studyFrame('carry', 900);
        input.windUp = wind;
        input.speed = motion === 'walking' || motion === 'dash' ? 5 : 0;
        input.stride = sample * 0.15;
        input.dashing = motion === 'dash';
        input.shovedMs = motion === 'shove' ? sample * 3.5 : null;
        applyPose(c, playerPose(input, 900));
        c.root.updateMatrixWorld(true);
        const hold = carryPoint(wind);
        const frame = new THREE.Matrix4()
          .makeRotationY(hold.yaw)
          .setPosition(hold.side, hold.height, hold.reach);
        c.body.traverse((part) => {
          if (!(part instanceof THREE.Mesh)) return;
          expect(intersectsMesh(bounds, part, frame), `${motion} folder at ${wind}`).toBe(false);
          if (part.parent === c.head) {
            for (const hand of [c.leftHand, c.rightHand]) {
              expect(
                intersectsMesh(new THREE.Box3().setFromObject(hand, true), part),
                `${motion} wrist/head at ${wind}`,
              ).toBe(false);
            }
          }
        });
        const left = carryGrip(hold, -1);
        const right = carryGrip(hold, 1);
        expect(c.leftHand.position.x).toBeCloseTo(left.x);
        expect(c.rightHand.position.x).toBeCloseTo(right.x);
        expect(c.leftHand.position.y).toBeCloseTo(left.y);
        expect(c.leftHand.position.z).toBeCloseTo(left.z);
        expect(c.rightHand.position.z).toBeCloseTo(right.z);
      }
    }
    disposeCharacter(c);
    for (const g of [folder.body, folder.glow, folder.glass]) g?.dispose();
    for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
  });

  it('owns all geometry but never the shared material', () => {
    const materials = kitMaterials();
    const c = createDeveloper(3, materials, role, { ...developerAppearance(3), hairstyle });
    const parent = new THREE.Group();
    parent.add(c.root);
    const shared = vi.spyOn(materials.body, 'dispose');
    const spies = c.geometries.map((g) => vi.spyOn(g, 'dispose'));
    expect(new Set(c.geometries).size).toBe(c.geometries.length);
    disposeCharacter(c);
    expect(parent.children).toHaveLength(0);
    spies.forEach((spy) => {
      expect(spy).toHaveBeenCalledOnce();
    });
    expect(shared).not.toHaveBeenCalled();
    for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
  });
});

it('keeps role geometry independent of owner color and skin/hair cosmetics', () => {
  const materials = kitMaterials();
  const appearance = { skin: 0xc68b59, hair: 0x302728, hairstyle: 'swept' as const };
  const silhouettes = new Set<string>();
  for (const role of ROLE_IDS) {
    const crew = [1, 2, 3, 4].map((id) => createDeveloper(id, materials, role, appearance));
    const positions = crew.map((c) =>
      c.geometries.map((g) => Array.from(g.getAttribute('position').array)),
    );
    positions.slice(1).forEach((p) => {
      expect(p).toEqual(positions[0]);
    });

    const colors = crew.map((c) => {
      const geometry = c.geometries[0];
      if (!geometry) throw new Error('Missing garment geometry');
      return Array.from(geometry.getAttribute('color').array);
    });
    expect(new Set(colors.map((c) => JSON.stringify(c))).size).toBe(4);
    silhouettes.add(JSON.stringify(positions[0]));
    crew.forEach(disposeCharacter);
  }
  expect(silhouettes.size).toBe(5);
  for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
});

it('provides every hairstyle for every role with a shared face, outfit, ownership and rig targets', () => {
  const materials = kitMaterials();
  for (const role of ROLE_IDS) {
    const crew = DEVELOPER_HAIRSTYLES.map((hairstyle) =>
      createDeveloper(1, materials, role, { ...developerAppearance(1), hairstyle }),
    );
    const first = crew[0];
    if (!first) throw new Error('Missing hairstyle comparison');
    const heads = new Set<string>();
    const faces: number[][] = [];
    for (const [i, c] of crew.entries()) {
      expect(c.rig?.hairstyle).toBe(DEVELOPER_HAIRSTYLES[i]);
      expect(c.geometries[0]?.getAttribute('position').array).toEqual(
        first.geometries[0]?.getAttribute('position').array,
      );
      expect(c.geometries[0]?.getAttribute('color').array).toEqual(
        first.geometries[0]?.getAttribute('color').array,
      );
      const positions = c.geometries[1]?.getAttribute('position');
      const finishes = c.geometries[1]?.getAttribute('finish');
      if (!positions || !finishes) throw new Error('Missing head geometry');
      heads.add(JSON.stringify(Array.from(positions.array)));
      // Skin is the only finish that scatters light; the baked creases tint it per hairstyle.
      const face: number[] = [];
      for (let vertex = 0; vertex < positions.count; vertex++) {
        if (finishes.getW(vertex) > 0.5) {
          face.push(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex));
        }
      }
      expect(face.length).toBeGreaterThan(0);
      faces.push(face);
      applyPose(c, playerPose(studyFrame('carry', 900).input, 900));
      expect(c.leftHand.position).toEqual(first.leftHand.position);
      expect(c.rightHand.position).toEqual(first.rightHand.position);
    }
    expect(heads.size).toBe(DEVELOPER_HAIRSTYLES.length);
    faces.forEach((face) => {
      expect(face).toEqual(faces[0]);
    });
    crew.forEach(disposeCharacter);
  }
  for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
});

it('gasps while knocked flying and gets its own face back after', () => {
  const materials = kitMaterials();
  for (const role of ROLE_IDS) {
    const c = createDeveloper(2, materials, role, developerAppearance(2));
    const rig = c.rig;
    if (!rig) throw new Error('Missing production rig');
    const input = studyFrame('idle', 900).input;
    applyPose(c, playerPose({ ...input, shovedMs: 60 }, 900));
    expect(rig.face.mesh.geometry).toBe(rig.face.shocked);
    expect(c.geometries).toContain(rig.face.shocked);
    applyPose(c, playerPose({ ...input, shovedMs: null }, 900));
    expect(rig.face.mesh.geometry).toBe(rig.face.calm);
    disposeCharacter(c);
  }
  for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
});

it('types with flat hands apart, tapping in turn', () => {
  const materials = kitMaterials();
  const c = createDeveloper(1, materials, 'backend', developerAppearance(1));
  const rig = c.rig;
  if (!rig) throw new Error('Missing production rig');
  const heights = [10, 65].map((time) => {
    applyPose(c, playerPose(studyFrame('work', time).input, time));
    const [left, right] = rig.arms;
    expect(right.hand.position.x - left.hand.position.x).toBeGreaterThan(0.35);
    for (const arm of rig.arms) expect(arm.hand.geometry).toBe(arm.type);
    return left.hand.position.y - right.hand.position.y;
  });
  expect(heights[0]).not.toBeCloseTo(heights[1] ?? 0);
  disposeCharacter(c);
  for (const m of [materials.body, materials.glow, materials.glass]) m.dispose();
});

it('defaults to a varied crew without a gender field', () => {
  expect([1, 2, 3, 4].map((id) => developerAppearance(id).hairstyle)).toEqual(DEVELOPER_HAIRSTYLES);
  expect(Object.keys(developerAppearance(1)).sort()).toEqual(['hair', 'hairstyle', 'skin']);
});
