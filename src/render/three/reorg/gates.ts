import * as THREE from 'three';
import { meetingDoors } from '../../../sim/meetings';
import type { GameState } from '../../../sim/state';
import { gridToWorld } from '../../projection';
import type { GatesLook } from '../rooms/types';
import { disposeTree } from '../stage';

const GATE_COLOR = 0x4cd964;
const DOOR_INVITED = 0xffa53d;
const DOOR_IN_SESSION = 0xff4a3d;
const DOOR_DARK = 0x4a5568;

/**
 * 4-3 The Reorg's badge turnstiles into the shipping lobby and its meeting
 * doors. Stub: the same floor arrows and door lamps as `Mechanics`, until
 * the environment pass builds real speed gates, the staff door and door
 * lights (see `docs/plan/the-reorg-environment.md`).
 */
export class ReorgGates implements GatesLook {
  private readonly group = new THREE.Group();
  private readonly arrows = new Map<string, THREE.Mesh>();
  private readonly doorLights = new Map<string, THREE.MeshBasicMaterial>();

  constructor(root: THREE.Group) {
    root.add(this.group);
  }

  sync(state: GameState): void {
    for (const gate of state.gates) {
      const key = `${gate.x},${gate.y}`;
      let arrow = this.arrows.get(key);
      if (!arrow) {
        arrow = new THREE.Mesh(
          new THREE.ConeGeometry(0.28, 0.6, 3).rotateX(Math.PI / 2),
          new THREE.MeshBasicMaterial({ color: GATE_COLOR }),
        );
        this.group.add(arrow);
        this.arrows.set(key, arrow);
      }
      const at = gridToWorld(gate.x, gate.y, 0.05);
      arrow.position.set(at.x, at.y, at.z);
      arrow.rotation.y = Math.atan2(gate.dir.x, gate.dir.y);
    }
    const seen = new Set<string>();
    for (const door of meetingDoors(state)) {
      const key = `${door.x},${door.y}`;
      seen.add(key);
      let light = this.doorLights.get(key);
      if (!light) {
        light = new THREE.MeshBasicMaterial({ color: GATE_COLOR });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), light);
        const at = gridToWorld(door.x, door.y, 1.25);
        lamp.position.set(at.x, at.y, at.z);
        this.group.add(lamp);
        this.doorLights.set(key, light);
      }
      light.color.setHex(
        door.light === 'inSession'
          ? DOOR_IN_SESSION
          : door.light === 'invited'
            ? DOOR_INVITED
            : GATE_COLOR,
      );
    }
    for (const [key, light] of this.doorLights) {
      if (!seen.has(key)) light.color.setHex(DOOR_DARK);
    }
  }

  destroy(): void {
    this.group.removeFromParent();
    disposeTree(this.group);
  }
}
