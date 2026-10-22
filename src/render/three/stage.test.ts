import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type Box3, type Vec3, fitCamera3d, projectPoint } from '../projection';
import { applyPose } from './stage';

describe('applyPose', () => {
  const box: Box3 = { min: { x: -0.5, y: -0.45, z: -0.5 }, max: { x: 13.5, y: 1.4, z: 9.5 } };
  // Uneven insets put the principal point well off the canvas center.
  const viewport = { width: 1440, height: 810 };
  const pose = fitCamera3d(box, viewport, { top: 150, right: 32, bottom: 60, left: 200 });

  /** Canvas pixels of `p` as three.js draws it. */
  function threeProject(cam: THREE.PerspectiveCamera, p: Vec3): { x: number; y: number } {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(cam);
    return {
      x: ((v.x + 1) / 2) * viewport.width,
      y: ((1 - v.y) / 2) * viewport.height,
    };
  }

  it('makes the three.js camera draw where projectPoint says', () => {
    const cam = new THREE.PerspectiveCamera();
    applyPose(cam, pose);
    for (const p of [
      { x: 0, y: 0, z: 0 },
      { x: 13, y: 1.15, z: 0 },
      { x: 6.5, y: 0.55, z: 9 },
      { x: -0.5, y: -0.45, z: 9.5 },
    ]) {
      const ours = projectPoint(pose, p);
      const theirs = threeProject(cam, p);
      expect(theirs.x).toBeCloseTo(ours.x, 3);
      expect(theirs.y).toBeCloseTo(ours.y, 3);
    }
  });

  it('follows a shaken principal point', () => {
    const cam = new THREE.PerspectiveCamera();
    const shaken = { ...pose, principal: { x: pose.principal.x + 7, y: pose.principal.y - 4 } };
    applyPose(cam, shaken);
    const p = { x: 3, y: 0, z: 4 };
    expect(threeProject(cam, p).x).toBeCloseTo(projectPoint(pose, p).x + 7, 3);
    expect(threeProject(cam, p).y).toBeCloseTo(projectPoint(pose, p).y - 4, 3);
  });
});
