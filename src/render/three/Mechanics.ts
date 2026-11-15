/**
 * Plain stand-in looks for the level-redesign mechanics (phase 23): enough to
 * see what a tile is and what state it's in. The real look comes in a later
 * art pass, so everything here is simple shapes in flat colours.
 *
 * Spills: wet tiles are blue puddles (a spill zone shows faintly while dry), a
 * leaky tap is a pipe on its counter that shows dry, about to leak or leaking
 * (its fix bar is an overlay, like a pipeline repair), and the mop robot is a squat disc with a
 * blinking light.
 *
 * Lifts: cabin floors are plates, lit (blue local, amber express) while the
 * lift stands open at that floor, orange a second before it leaves, red while
 * broken down (blinking before). Pips over a cabin count its floor. Mail
 * chute hatches carry a down arrow that blinks while a ticket slides down.
 */

import * as THREE from 'three';
import type { LevelMap } from '../../sim/level';
import { breakdownWarns, chuteShare, liftBroken, liftChimes } from '../../sim/lifts';
import { beltsStopped, travelatorDir } from '../../sim/campus';
import { meetingDoors } from '../../sim/meetings';
import { reorgTiles, reorgWarning } from '../../sim/reorgs';
import { isWet, tapWarns } from '../../sim/spills';
import type { GameState } from '../../sim/state';
import { gridToWorld } from '../projection';
import type { RoundView } from '../roundView';
import { STATION_HEIGHT, blockHeight } from './layout';
import { disposeTree } from './stage';

const WET_COLOR = 0x3d8bff;
const ZONE_COLOR = 0x9cc7ff;
const TAP_DRY = 0x8a9bb0;
const TAP_WARN = 0xffa53d;
const TAP_LEAK = 0xff4a3d;
const ROBOT_COLOR = 0xe8e8e8;
/** A lift cabin's floor while the lift is elsewhere or riding. */
const LIFT_IDLE = 0x4a5568;
/** A local lift cabin with its doors open here. */
const LIFT_COLOR = 0x5bc0eb;
/** An express cabin with its doors open here. */
const EXPRESS_COLOR = 0xf2b134;
const CHUTE_COLOR = 0x8e7dbe;
const SHUTTLE_COLOR = 0xffd23f;
const STRIP_COLOR = 0x6b7280;
const GLASS_COLOR = 0xbfe6ff;
const PARTITION_COLOR = 0xb8c0cc;
const DESK_COLOR = 0x9b6b43;
const GATE_COLOR = 0x4cd964;
const PARTITION_HEIGHT = 1.1;
const DESK_HEIGHT = STATION_HEIGHT;
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
    this.syncLifts(state, timeMs);
    this.syncChutes(state, timeMs);
    this.syncReorg(state, timeMs);
    this.syncGates(state);
    this.syncDoors(state);
    this.syncCampus(state, timeMs);
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

  /** One floor plate per lift cabin tile, by lift index and floor; its colour is the lift's state there. */
  private readonly cabinPlates = new Map<string, THREE.MeshBasicMaterial>();
  private readonly hatches = new Map<string, THREE.MeshBasicMaterial>();

  private syncLifts(state: GameState, timeMs: number): void {
    state.lifts.forEach((lift, li) => {
      const blink = Math.floor(timeMs / 200) % 2 === 0;
      lift.stops.forEach((cabin, floor) => {
        const key = `${li}:${floor}`;
        let material = this.cabinPlates.get(key);
        if (!material) {
          material = flat(LIFT_IDLE, 0.85);
          this.cabinPlates.set(key, material);
          for (const tile of cabin) {
            const plate = new THREE.Mesh(this.puddle, material);
            const at = gridToWorld(tile.x, tile.y, PUDDLE_LIFT * 2);
            plate.position.set(at.x, at.y, at.z);
            this.root.add(plate);
          }
          // The floor number over the cabin: one small block per floor (top floor first).
          const first = cabin[0];
          if (first) {
            for (let i = 0; i < lift.stops.length - floor; i++) {
              const pip = new THREE.Mesh(
                new THREE.BoxGeometry(0.1, 0.1, 0.1),
                flat(
                  lift.kind === 'express'
                    ? EXPRESS_COLOR
                    : lift.kind === 'shuttle'
                      ? SHUTTLE_COLOR
                      : LIFT_COLOR,
                ),
              );
              const at = gridToWorld(first.x - 0.3 + i * 0.15, first.y - 0.45, 1.2);
              pip.position.set(at.x, at.y, at.z);
              this.root.add(pip);
            }
          }
        }
        const here = lift.at === floor;
        const base =
          lift.kind === 'express'
            ? EXPRESS_COLOR
            : lift.kind === 'shuttle'
              ? SHUTTLE_COLOR
              : LIFT_COLOR;
        let color = LIFT_IDLE;
        if (liftBroken(state, lift) || (breakdownWarns(state, lift) && blink)) color = TAP_LEAK;
        else if (here && lift.phase === 'open') color = liftChimes(state, lift) ? TAP_WARN : base;
        material.color.setHex(color);
      });
    });
  }

  private syncChutes(state: GameState, timeMs: number): void {
    for (const chute of state.chutes) {
      for (const [end, hatch] of [
        ['from', chute.from],
        ['to', chute.to],
      ] as const) {
        const key = `${hatch.x},${hatch.y}`;
        let material = this.hatches.get(key);
        if (!material) {
          material = flat(CHUTE_COLOR);
          this.hatches.set(key, material);
          // A down arrow on the hatch: the way tickets go.
          const arrow = new THREE.Mesh(
            new THREE.ConeGeometry(0.16, 0.3, 12).rotateX(Math.PI),
            material,
          );
          const at = gridToWorld(hatch.x, hatch.y, blockHeight(this.map, hatch.x, hatch.y) + 0.35);
          arrow.position.set(at.x, at.y, at.z);
          this.root.add(arrow);
        }
        // A ticket on its way down: both hatches blink.
        const travelling = chuteShare(state, chute) > 0 && Math.floor(timeMs / 150) % 2 === 0;
        material.color.setHex(travelling ? TAP_WARN : end === 'from' ? CHUTE_COLOR : LIFT_COLOR);
      }
    }
  }

  /** Moving tiles (reorgs): a block per tile, shown as a partition, a desk or nothing. */
  private readonly moving = new Map<
    number,
    { wall: THREE.Mesh; desk: THREE.Mesh; warn: THREE.Mesh }
  >();
  private readonly partitionMaterial = flat(PARTITION_COLOR);
  private readonly deskMaterial = flat(DESK_COLOR);
  private readonly warnMaterial = flat(TAP_WARN, 0.55);
  private readonly gateArrows = new Map<string, THREE.Mesh>();

  private syncReorg(state: GameState, timeMs: number): void {
    if (this.moving.size === 0) {
      for (const i of reorgTiles(this.map)) {
        const x = i % this.map.width;
        const y = Math.floor(i / this.map.width);
        const at = gridToWorld(x, y);
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(0.96, PARTITION_HEIGHT, 0.96),
          this.partitionMaterial,
        );
        wall.position.set(at.x, PARTITION_HEIGHT / 2, at.z);
        const desk = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, DESK_HEIGHT, 0.9),
          this.deskMaterial,
        );
        desk.position.set(at.x, DESK_HEIGHT / 2, at.z);
        const warn = new THREE.Mesh(this.puddle, this.warnMaterial);
        warn.position.set(at.x, PUDDLE_LIFT * 3, at.z);
        this.root.add(wall, desk, warn);
        this.moving.set(i, { wall, desk, warn });
      }
    }
    const warning = reorgWarning(state);
    const warned = new Set(warning?.tiles ?? []);
    // Blinks faster as the reorg comes closer.
    const period = warning ? 120 + warning.inTicks * 2 : 1;
    const on = Math.floor(timeMs / period) % 2 === 0;
    for (const [i, look] of this.moving) {
      const tile = state.level.tiles[i];
      look.wall.visible = tile === 'wall';
      look.desk.visible = tile === 'counter';
      look.warn.visible = warned.has(i) && on;
      if (look.warn.visible)
        look.warn.position.y =
          tile === 'wall'
            ? PARTITION_HEIGHT + 0.02
            : tile === 'counter'
              ? DESK_HEIGHT + 0.02
              : PUDDLE_LIFT * 3;
    }
  }

  private syncGates(state: GameState): void {
    for (const gate of state.gates) {
      const key = `${gate.x},${gate.y}`;
      let arrow = this.gateArrows.get(key);
      if (!arrow) {
        // A flat green arrow on the floor pointing the way through.
        arrow = new THREE.Mesh(
          new THREE.ConeGeometry(0.28, 0.6, 3).rotateX(Math.PI / 2),
          flat(GATE_COLOR),
        );
        this.root.add(arrow);
        this.gateArrows.set(key, arrow);
      }
      const at = gridToWorld(gate.x, gate.y, 0.05);
      arrow.position.set(at.x, at.y, at.z);
      arrow.rotation.y = Math.atan2(gate.dir.x, gate.dir.y);
    }
  }

  private readonly doorLights = new Map<string, THREE.MeshBasicMaterial>();

  /** Meeting doors: a light over each, green (free), amber (invite open), red (in session). */
  private syncDoors(state: GameState): void {
    const seen = new Set<string>();
    for (const door of meetingDoors(state)) {
      const key = `${door.x},${door.y}`;
      seen.add(key);
      let light = this.doorLights.get(key);
      if (!light) {
        light = flat(GATE_COLOR);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), light);
        lamp.name = key;
        const at = gridToWorld(door.x, door.y, 1.25);
        lamp.position.set(at.x, at.y, at.z);
        this.root.add(lamp);
        this.doorLights.set(key, light);
      }
      light.color.setHex(
        door.light === 'inSession' ? TAP_LEAK : door.light === 'invited' ? TAP_WARN : GATE_COLOR,
      );
    }
    // Doors that left the layout in a reorg: their lamps go dark.
    for (const [key, light] of this.doorLights) {
      if (!seen.has(key)) light.color.setHex(LIFT_IDLE);
    }
  }

  private campusBuilt = false;
  private readonly stripMaterial = flat(STRIP_COLOR);
  private readonly arrowMaterial = flat(GATE_COLOR);
  private readonly outageMaterial = flat(TAP_LEAK, 0.6);
  private readonly outage: THREE.Mesh[] = [];
  private readonly arrows: { mesh: THREE.Mesh; base: number; dir: { x: number; y: number } }[] = [];

  /** Travelators (grey strips with arrows that scroll), revolving doors (a glass drum), stopped belts (red). */
  private syncCampus(state: GameState, timeMs: number): void {
    if (!this.campusBuilt) {
      this.campusBuilt = true;
      const dirs = state.settings.travelators;
      for (const mark of this.map.marks) {
        const at = gridToWorld(mark.x, mark.y, PUDDLE_LIFT * 2);
        if (mark.kind === 'travelator') {
          const strip = new THREE.Mesh(this.puddle, this.stripMaterial);
          strip.position.set(at.x, at.y, at.z);
          this.root.add(strip);
          const dir = travelatorDir(this.map, dirs, mark.x, mark.y);
          if (dir) {
            const arrow = new THREE.Mesh(
              new THREE.ConeGeometry(0.16, 0.34, 3).rotateX(Math.PI / 2),
              this.arrowMaterial,
            );
            arrow.rotation.y = Math.atan2(dir.x, dir.y);
            arrow.position.set(at.x, 0.03, at.z);
            this.root.add(arrow);
            this.arrows.push({ mesh: arrow, base: dir.x !== 0 ? at.x : at.z, dir });
          }
        } else if (mark.kind === 'revolvingDoor') {
          const drum = new THREE.Mesh(
            new THREE.CylinderGeometry(0.46, 0.46, 1.2, 16, 1, true),
            flat(GLASS_COLOR, 0.35),
          );
          drum.position.set(at.x, 0.6, at.z);
          const wings = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 1.1, 0.04),
            flat(GLASS_COLOR, 0.6),
          );
          wings.name = 'wings';
          wings.position.set(at.x, 0.55, at.z);
          this.root.add(drum, wings);
        }
      }
      for (const belt of this.map.conveyors) {
        const plate = new THREE.Mesh(this.puddle, this.outageMaterial);
        const at = gridToWorld(belt.x, belt.y, blockHeight(this.map, belt.x, belt.y) + 0.03);
        plate.position.set(at.x, at.y, at.z);
        plate.visible = false;
        this.root.add(plate);
        this.outage.push(plate);
      }
    }
    // Arrows slide a little along the way the strip runs.
    const shift = ((timeMs / 1000) % 1) * 0.5 - 0.25;
    for (const { mesh, base, dir } of this.arrows) {
      if (dir.x !== 0) mesh.position.x = base + shift * dir.x;
      else mesh.position.z = base + shift * dir.y;
    }
    const stopped = beltsStopped(state);
    const blink = Math.floor(timeMs / 300) % 2 === 0;
    for (const plate of this.outage) plate.visible = stopped && blink;
    this.root.traverse((o) => {
      if (o.name === 'wings') o.rotation.y = timeMs / 600;
    });
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
