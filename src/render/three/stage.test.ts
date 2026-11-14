import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { type Box3, type Vec3, fitCamera3d, projectPoint } from '../projection';
import { ATMOSPHERES } from './atmosphere';
import { applyPose, gradeFilter, vignetteCss } from './stage';

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

describe('vignetteCss', () => {
  it('draws the other levels exactly as before: corner edges, a glow only where set', () => {
    expect(vignetteCss({ color: 0x2a2238, opacity: 0.35, inner: 0.7 })).toBe(
      'radial-gradient(ellipse farthest-corner at 50% 48%, transparent 70%, rgba(42, 34, 56, 0.12249999999999998) 85%, rgba(42, 34, 56, 0.35) 100%)',
    );
    for (const id of ['garage', 'open-plan', 'scale-up']) {
      const v = ATMOSPHERES[id]?.vignette;
      expect(v?.band, id).toBeUndefined();
      if (v) expect(vignetteCss(v)).not.toContain('linear-gradient');
    }
  });

  it('tints the top, right and bottom edges with a band, under the glow', () => {
    const css = vignetteCss({
      color: 0x1a2a78,
      opacity: 0.38,
      inner: 0.7,
      glow: { color: 0xff8a72, opacity: 0.35, x: 0, y: 0.45, reach: 0.38 },
      band: { opacity: 0.3, depth: 0.1 },
    });
    for (const side of ['to bottom', 'to top', 'to left'])
      expect(css).toContain(`linear-gradient(${side}, rgba(26, 42, 120, 0.3), transparent 10%)`);
    expect(css).not.toContain('to right');
    // The glow comes first, so it draws over the band.
    expect(css.startsWith('radial-gradient(38% 53% at 0% 45%')).toBe(true);
  });

  it('draws extra glows over the first one, the last on top', () => {
    const css = vignetteCss({
      color: 0x120e2c,
      opacity: 0.38,
      inner: 0.7,
      glow: { color: 0x3a6cff, opacity: 0.3, x: 0, y: 0.5, reach: 0.3 },
      glows: [
        { color: 0x7a4cff, opacity: 0.28, x: 1, y: 0.5, reach: 0.3 },
        { color: 0xb8a8ff, opacity: 0.18, x: 0.5, y: 0.02, reach: 0.55 },
      ],
    });
    const top = css.indexOf('at 50% 2%');
    const right = css.indexOf('at 100% 50%');
    const left = css.indexOf('at 0% 50%');
    expect(top).toBe(css.indexOf('radial-gradient(55% 77%') + 'radial-gradient(55% 77% '.length);
    expect(top).toBeLessThan(right);
    expect(right).toBeLessThan(left);
    expect(left).toBeLessThan(css.indexOf('farthest-corner'));
  });
});

describe('gradeFilter', () => {
  it('grades only a preset that asks for it', () => {
    expect(gradeFilter(undefined)).toBe('');
    expect(gradeFilter({ color: 0, opacity: 0.3, inner: 0.7 })).toBe('');
    expect(gradeFilter({ color: 0, opacity: 0.3, inner: 0.7, saturate: 1 })).toBe('');
    expect(gradeFilter({ color: 0, opacity: 0.3, inner: 0.7, saturate: 1.4 })).toBe(
      'saturate(1.4)',
    );
    for (const id of ['garage', 'open-plan', 'scale-up', 'seed-round', 'demo-day', 'on-call'])
      expect(gradeFilter(ATMOSPHERES[id]?.vignette), id).toBe('');
  });
});
