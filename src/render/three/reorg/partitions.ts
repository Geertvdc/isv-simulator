import * as THREE from 'three';
import type { LevelMap } from '../../../sim/level';
import { reorgTiles, reorgWarning } from '../../../sim/reorgs';
import type { GameState } from '../../../sim/state';
import { gridToWorld } from '../../projection';
import { STATION_HEIGHT } from '../layout';
import type { MovingTilesLook } from '../rooms/types';
import { disposeTree } from '../stage';

const PANEL_HEIGHT = 1.1;
const PANEL_COLOR = 0xb8c0cc;
const TABLE_COLOR = 0x9b6b43;
const WARN_COLOR = 0xffa53d;

/**
 * 4-3 The Reorg's moving tiles: the consultants' partitions and the rolling
 * desks (the level's reorg tiles). Stub: the same plain
 * boxes as `Mechanics`' stand-in, until the environment pass builds the real
 * partitions (see `docs/plan/the-reorg-environment.md`).
 */
export class Partitions implements MovingTilesLook {
  private readonly group = new THREE.Group();
  private readonly tiles = new Map<
    number,
    { wall: THREE.Mesh; desk: THREE.Mesh; warn: THREE.Mesh }
  >();

  constructor(root: THREE.Group, map: LevelMap) {
    root.add(this.group);
    const wallMat = new THREE.MeshLambertMaterial({ color: PANEL_COLOR });
    const deskMat = new THREE.MeshLambertMaterial({ color: TABLE_COLOR });
    const warnMat = new THREE.MeshBasicMaterial({
      color: WARN_COLOR,
      transparent: true,
      opacity: 0.55,
    });
    const plate = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
    for (const i of reorgTiles(map)) {
      const at = gridToWorld(i % map.width, Math.floor(i / map.width));
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.96, PANEL_HEIGHT, 0.96), wallMat);
      wall.position.set(at.x, PANEL_HEIGHT / 2, at.z);
      const desk = new THREE.Mesh(new THREE.BoxGeometry(0.9, STATION_HEIGHT, 0.9), deskMat);
      desk.position.set(at.x, STATION_HEIGHT / 2, at.z);
      const warn = new THREE.Mesh(plate, warnMat);
      warn.position.set(at.x, 0.036, at.z);
      this.group.add(wall, desk, warn);
      this.tiles.set(i, { wall, desk, warn });
    }
  }

  sync(state: GameState, timeMs: number): void {
    const warning = reorgWarning(state);
    const warned = new Set(warning?.tiles ?? []);
    const period = warning ? 120 + warning.inTicks * 2 : 1;
    const on = Math.floor(timeMs / period) % 2 === 0;
    for (const [i, look] of this.tiles) {
      const tile = state.level.tiles[i];
      look.wall.visible = tile === 'wall';
      look.desk.visible = tile === 'counter';
      look.warn.visible = warned.has(i) && on;
    }
  }

  destroy(): void {
    this.group.removeFromParent();
    disposeTree(this.group);
  }
}
