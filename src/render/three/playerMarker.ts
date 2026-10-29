import * as THREE from 'three';
import type { PlayerId } from '../../sim/state';
import { playerShape, shapePoints } from '../playerColors';
import { ModelBuilder } from './kit';
import { PALETTE } from './look';

/** A camera-facing floor tab: owner shape and number still work without color. */
export function playerMarker(id: PlayerId): THREE.BufferGeometry {
  const shape = playerShape(id);
  const b = new ModelBuilder();
  const face =
    shape === 'circle'
      ? new THREE.CircleGeometry(0.13, 24)
      : new THREE.ShapeGeometry(
          new THREE.Shape(shapePoints(shape, 0.26).map((p) => new THREE.Vector2(p.x, p.y))),
        );
  b.add(face, PALETTE.ink, { at: [0, 0.008, 0.44], rot: [-Math.PI / 2, 0, 0] });
  const strokes = [
    [0, 0.07, 0.065, 0.018],
    [0.038, 0.035, 0.018, 0.065],
    [0.038, -0.035, 0.018, 0.065],
    [0, -0.07, 0.065, 0.018],
    [-0.038, -0.035, 0.018, 0.065],
    [-0.038, 0.035, 0.018, 0.065],
    [0, 0, 0.065, 0.018],
  ] as const;
  const digits = [
    '012345',
    '12',
    '01643',
    '01236',
    '1256',
    '05263',
    '054263',
    '012',
    '0123456',
    '012356',
  ];
  const number = String(id);
  for (let i = 0; i < number.length; i++) {
    const digit = number.charAt(i);
    const active = digits[Number(digit)];
    if (!active) throw new Error(`Invalid player marker id: ${id}`);
    for (const index of active) {
      const stroke = strokes[Number(index)];
      if (!stroke) throw new Error('Invalid marker stroke');
      const [x, y, w, h] = stroke;
      b.box(
        w,
        0.006,
        h,
        PALETTE.white,
        { at: [x + (i - (number.length - 1) / 2) * 0.09, 0.014, 0.44 - y] },
        0,
      );
    }
  }
  return b.build().body;
}
