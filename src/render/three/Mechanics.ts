/**
 * Plain stand-in looks for the level-redesign mechanics (phase 23): enough to
 * see what a tile is and what state it's in. The real look comes in a later
 * art pass, so everything here is simple shapes in flat colours.
 *
 * Spills: wet tiles are blue puddles (a spill zone shows faintly while dry), a
 * leaky tap is a pipe on its counter that shows dry, about to leak or leaking
 * (its fix bar is an overlay, like a pipeline repair), and the mop robot is a squat disc with a
 * blinking light.
 */

import * as THREE from 'three';
import type { LevelMap } from '../../sim/level';
import { isWet, tapWarns } from '../../sim/spills';
import type { GameState } from '../../sim/state';
import { gridToWorld } from '../projection';
import type { RoundView } from '../roundView';
import { blockHeight } from './layout';
import { disposeTree } from './stage';

const WET_COLOR = 0x3d8bff;
const ZONE_COLOR = 0x9cc7ff;
const TAP_DRY = 0x8a9bb0;
const TAP_WARN = 0xffa53d;
const TAP_LEAK = 0xff4a3d;
const ROBOT_COLOR = 0xe8e8e8;
const ROBOT_LIGHT = 0xff8a00;
/** Just over the floor, so puddles don't flicker with it. */
const PUDDLE_LIFT = 0.012;

/** Kinds of floor marks that can get wet. */
const WET_KINDS = new Set(['wet', 'spillZone', 'mopRoute']);

function flat(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
}

interface TapLook {
  group: THREE.Group;
  pipe: THREE.MeshBasicMaterial;
}

interface RobotLook {
  group: THREE.Group;
  light: THREE.MeshBasicMaterial;
}

export class Mechanics {
  private readonly root = new THREE.Group();
  private readonly puddle = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
  private readonly wetMaterial = flat(WET_COLOR, 0.5);
  private readonly zoneMaterial = flat(ZONE_COLOR, 0.18);
  /** One puddle per tile that can get wet, by tile index. */
  private readonly puddles = new Map<number, THREE.Mesh>();
  private readonly taps = new Map<string, TapLook>();
  private readonly robots = new Map<number, RobotLook>();

  constructor(
    private readonly world: THREE.Scene,
    private readonly map: LevelMap,
  ) {
    world.add(this.root);
    for (const mark of map.marks) {
      if (!WET_KINDS.has(mark.kind)) continue;
      const mesh = new THREE.Mesh(this.puddle, this.zoneMaterial);
      const at = gridToWorld(mark.x, mark.y, PUDDLE_LIFT);
      mesh.position.set(at.x, at.y, at.z);
      mesh.visible = mark.kind === 'spillZone';
      this.root.add(mesh);
      this.puddles.set(mark.y * map.width + mark.x, mesh);
    }
  }

  sync(view: RoundView, timeMs: number): void {
    const { state } = view;
    this.syncPuddles(state);
    this.syncTaps(state, timeMs);
    this.syncRobots(view, timeMs);
  }

  private syncPuddles(state: GameState): void {
    for (const [index, mesh] of this.puddles) {
      const x = index % this.map.width;
      const y = Math.floor(index / this.map.width);
      const wet = isWet(state.level, state.wet, state.tick, x, y);
      const zone = this.map.marks.some((m) => m.x === x && m.y === y && m.kind === 'spillZone');
      mesh.visible = wet || zone;
      mesh.material = wet ? this.wetMaterial : this.zoneMaterial;
    }
  }

  private syncTaps(state: GameState, timeMs: number): void {
    for (const tap of state.taps) {
      const key = `${tap.x},${tap.y}`;
      let look = this.taps.get(key);
      if (!look) {
        look = this.createTap(tap.x, tap.y);
        this.taps.set(key, look);
      }
      const blink = Math.floor(timeMs / 250) % 2 === 0;
      const color =
        tap.phase === 'leaking'
          ? TAP_LEAK
          : tapWarns(tap, state.tick) && blink
            ? TAP_WARN
            : TAP_DRY;
      look.pipe.color.setHex(color);
    }
  }

  private createTap(x: number, y: number): TapLook {
    const group = new THREE.Group();
    const top = blockHeight(this.map, x, y);
    const at = gridToWorld(x, y, top);
    group.position.set(at.x, at.y, at.z);
    const pipe = flat(TAP_DRY);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 10), pipe);
    post.position.y = 0.175;
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.08), pipe);
    spout.position.set(0.12, 0.33, 0);
    group.add(post, spout);
    this.root.add(group);
    return { group, pipe };
  }

  private syncRobots(view: RoundView, timeMs: number): void {
    const seen = new Set<number>();
    for (const robot of view.state.managers) {
      if (robot.kind !== 'mopRobot') continue;
      const pos = view.renderManagerPos(robot.id);
      if (!pos) continue;
      seen.add(robot.id);
      let look = this.robots.get(robot.id);
      if (!look) {
        look = this.createRobot();
        this.robots.set(robot.id, look);
      }
      const at = gridToWorld(pos.x, pos.y);
      look.group.position.set(at.x, at.y, at.z);
      look.group.rotation.y = Math.atan2(robot.facing.x, robot.facing.y);
      look.light.color.setHex(Math.floor(timeMs / 300) % 2 === 0 ? ROBOT_LIGHT : 0x442200);
    }
    for (const [id, look] of this.robots) {
      if (seen.has(id)) continue;
      this.root.remove(look.group);
      this.robots.delete(id);
    }
  }

  private createRobot(): RobotLook {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.38, 0.22, 20),
      flat(ROBOT_COLOR),
    );
    body.position.y = 0.13;
    const light = flat(ROBOT_LIGHT);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), light);
    lamp.position.set(0, 0.28, 0.2);
    const mop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.12), flat(WET_COLOR));
    mop.position.set(0, 0.03, -0.3);
    group.add(body, lamp, mop);
    this.root.add(group);
    return { group, light };
  }

  destroy(): void {
    this.world.remove(this.root);
    disposeTree(this.root);
    this.puddle.dispose();
    this.wetMaterial.dispose();
    this.zoneMaterial.dispose();
  }
}
