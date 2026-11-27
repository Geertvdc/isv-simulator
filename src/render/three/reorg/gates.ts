import * as THREE from 'three';
import { meetingRoomName } from '../../../sim/content';
import { type GridPoint, type LevelMap, getTile } from '../../../sim/level';
import { meetingDoors } from '../../../sim/meetings';
import { gatesFor } from '../../../sim/reorgs';
import type { GameState } from '../../../sim/state';
import { gridToWorld } from '../../projection';
import { AMBIENT_KEY } from '../atmosphere';
import { reorgClock } from '../boardroom/motion';
import { type KitMaterials, type Model, kitMaterials } from '../kit';
import { WALL_HEIGHT } from '../layout';
import type { GatesLook } from '../rooms/types';
import { disposeTree } from '../stage';
import { type DoorSpot, doorSpots } from './layouts';
import {
  CAB_X,
  FLAP_X,
  GLYPH_Y,
  GLYPH_Z,
  arrowGeometry,
  crossGeometry,
  doorFrameModel,
  doorLeafModel,
  gateCabinetModel,
  gateFlapModel,
  staffDoorModel,
} from './models';
import { doorRise, flapSwing, gateIncoming, gateShowsNext } from './motion';

const GO = 0x3fe36a;
const STOP = 0xff4a3d;
/** The incoming direction through the reorg warning. */
const INCOMING = 0xffb020;
const DOOR_FREE = 0x4cd964;
const DOOR_INVITED = 0xffa53d;
const DOOR_IN_SESSION = 0xff4a3d;
const DOOR_DARK = 0x4a5568;
/** How far the glass door slides open along its line. */
const DOOR_SLIDE = 0.8;
/** The amber strip's length along a cabinet top. */
const CAB_STRIP = 0.62;

interface GateLook {
  at: GridPoint;
  index: number;
  /** The glyphs (arrows and crosses on the cabinets, the floor arrow), drawn for travel along local +z. */
  glyphs: THREE.Group;
  /** The red crosses at the exit end, swapped for the amber arrows when the way is about to flip. */
  crosses: THREE.Mesh[];
  /** The incoming way's amber arrows (cabinets and floor), in `glyphs`, pointing back along local −z. */
  incoming: THREE.Mesh[];
  /** The amber strips along the cabinets' tops. */
  strips: THREE.Mesh[];
  flaps: [THREE.Group, THREE.Group];
}

interface DoorLook {
  spot: DoorSpot;
  group: THREE.Group;
  leaf: THREE.Group;
  lamp: THREE.MeshBasicMaterial;
  halo: THREE.MeshBasicMaterial;
  slide: number;
}

/**
 * 4-3 The Reorg's badge line and meeting doors: a speed gate at each
 * turnstile (steel cabinets, glass flaps that swing the way through, a
 * green arrow on the way in and a red cross on the way out, on the
 * cabinets' tops and the floor, blinking and swapping in the reorg
 * warning), the staff door (always open, both ways) and a framed glass
 * door in the partition line at each meeting door, its lamp green, amber
 * or red. Placed from the map; posed from the sim's tick.
 */
export class ReorgGates implements GatesLook {
  private readonly group = new THREE.Group();
  private readonly materials: KitMaterials = kitMaterials();
  private readonly gates: GateLook[] = [];
  private readonly doors: DoorLook[] = [];
  private doorsBuilt = false;
  private lastMs = 0;
  private readonly go = new THREE.MeshBasicMaterial({
    color: GO,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  private readonly stop = new THREE.MeshBasicMaterial({
    color: STOP,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  private readonly floorGo = new THREE.MeshBasicMaterial({
    color: GO,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly floorBoth = new THREE.MeshBasicMaterial({
    color: 0xe2e6ea,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly amber = new THREE.MeshBasicMaterial({
    color: INCOMING,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly floorAmber = new THREE.MeshBasicMaterial({
    color: INCOMING,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly motionProbe = new THREE.Object3D();

  constructor(
    root: THREE.Group,
    private readonly map: LevelMap,
  ) {
    root.add(this.group);
    this.motionProbe.userData[AMBIENT_KEY] = true;
    this.group.add(this.motionProbe);
    map.marks
      .filter((m) => m.kind === 'turnstile')
      .forEach((m, index) => this.gates.push(this.buildGate(m, index)));
    for (const at of this.staffDoors()) this.buildStaffDoor(at);
  }

  private mesh(model: Model, shadow = true): THREE.Group {
    const g = new THREE.Group();
    const layers: [THREE.BufferGeometry | null, THREE.Material, boolean][] = [
      [model.body, this.materials.body, true],
      [model.glow, this.materials.glow, false],
      [model.glass, this.materials.glass, false],
    ];
    for (const [geometry, material, lit] of layers) {
      if (!geometry?.getAttribute('position')) continue;
      const m = new THREE.Mesh(geometry, material);
      m.castShadow = shadow && lit;
      m.receiveShadow = lit;
      g.add(m);
    }
    return g;
  }

  private buildGate(at: GridPoint, index: number): GateLook {
    const gate = new THREE.Group();
    const w = gridToWorld(at.x, at.y);
    gate.position.set(w.x, 0, w.z);
    // The passage runs across the wall: along z in a row of wall, along x in a column.
    const inRow =
      getTile(this.map, at.x - 1, at.y) === 'wall' && getTile(this.map, at.x + 1, at.y) === 'wall';
    gate.rotation.y = inRow ? 0 : Math.PI / 2;
    for (const side of [-1, 1] as const) {
      const cab = this.mesh(gateCabinetModel(side));
      cab.position.x = side * CAB_X;
      gate.add(cab);
    }
    const flaps = ([-1, 1] as const).map((side) => {
      const pivot = new THREE.Group();
      pivot.position.x = side * FLAP_X;
      pivot.add(this.mesh(gateFlapModel(), false));
      gate.add(pivot);
      return pivot;
    }) as [THREE.Group, THREE.Group];
    const glyphs = new THREE.Group();
    const arrow = arrowGeometry(0.13, 0.2);
    const cross = crossGeometry(0.16, 0.045);
    const crosses: THREE.Mesh[] = [];
    const incoming: THREE.Mesh[] = [];
    const strips: THREE.Mesh[] = [];
    const strip = new THREE.PlaneGeometry(0.035, CAB_STRIP).rotateX(-Math.PI / 2);
    for (const side of [-1, 1]) {
      const a = new THREE.Mesh(arrow, this.go);
      a.position.set(side * CAB_X, GLYPH_Y + 0.01, -GLYPH_Z);
      const c = new THREE.Mesh(cross, this.stop);
      c.position.set(side * CAB_X, GLYPH_Y + 0.01, GLYPH_Z);
      const back = new THREE.Mesh(arrow, this.amber);
      back.position.copy(c.position);
      back.rotation.y = Math.PI;
      back.visible = false;
      glyphs.add(a, c, back);
      crosses.push(c);
      incoming.push(back);
      // Along the cabinet top's outer edge.
      const s = new THREE.Mesh(strip, this.amber);
      s.position.set(side * (CAB_X + 0.055), GLYPH_Y + 0.006, 0);
      s.visible = false;
      gate.add(s);
      strips.push(s);
    }
    const floor = new THREE.Mesh(arrowGeometry(0.42, 0.62), this.floorGo);
    floor.position.y = 0.03;
    floor.renderOrder = 2;
    glyphs.add(floor);
    // The incoming way on the floor: a slim amber arrow beside the green one, pointing back.
    for (const side of [-1, 1]) {
      const back = new THREE.Mesh(arrowGeometry(0.14, 0.4), this.floorAmber);
      back.rotation.y = Math.PI;
      back.position.set(side * 0.2, 0.032, 0.02);
      back.renderOrder = 3;
      back.visible = false;
      glyphs.add(back);
      incoming.push(back);
    }
    gate.add(glyphs);
    this.group.add(gate);
    return { at, index, glyphs, crosses, incoming, strips, flaps };
  }

  /** Open doorways in the badge line: floor between two walls in a turnstile's row, not a turnstile. */
  private staffDoors(): GridPoint[] {
    const rows = new Set(this.map.marks.filter((m) => m.kind === 'turnstile').map((m) => m.y));
    const out: GridPoint[] = [];
    for (const y of rows)
      for (let x = 1; x < this.map.width - 1; x++) {
        if (getTile(this.map, x, y) !== 'floor') continue;
        if (this.map.marks.some((m) => m.x === x && m.y === y)) continue;
        const walls =
          getTile(this.map, x - 1, y) === 'wall' && getTile(this.map, x + 1, y) === 'wall';
        const open =
          getTile(this.map, x, y - 1) === 'floor' && getTile(this.map, x, y + 1) === 'floor';
        if (walls && open) out.push({ x, y });
      }
    return out;
  }

  private buildStaffDoor(at: GridPoint): void {
    const door = this.mesh(staffDoorModel());
    const w = gridToWorld(at.x, at.y);
    door.position.set(w.x, 0, w.z);
    this.group.add(door);
    // Both ways: a pale double arrow on the threshold.
    const both = new THREE.Group();
    for (const turn of [0, Math.PI]) {
      const a = new THREE.Mesh(arrowGeometry(0.26, 0.34), this.floorBoth);
      a.rotation.y = turn;
      a.position.z = turn === 0 ? 0.19 : -0.19;
      both.add(a);
    }
    both.position.set(w.x, 0.03, w.z);
    both.renderOrder = 2;
    this.group.add(both);
  }

  private buildDoors(state: GameState): void {
    this.doorsBuilt = true;
    for (const spot of doorSpots(this.map)) {
      const room = meetingDoors(state).find((d) => d.x === spot.x && d.y === spot.y)?.room ?? 0;
      const name = meetingRoomName(state.levelId, Math.max(0, room)).toUpperCase();
      const group = new THREE.Group();
      const w = gridToWorld(spot.x, spot.y);
      group.position.set(w.x, 0, w.z);
      group.rotation.y = spot.axis === 'x' ? 0 : -Math.PI / 2;
      group.add(this.mesh(doorFrameModel(name)));
      const leaf = this.mesh(doorLeafModel(), false);
      leaf.position.z = 0.09;
      group.add(leaf);
      const lamp = new THREE.MeshBasicMaterial({ color: DOOR_FREE, toneMapped: false });
      const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.13), lamp);
      bulb.position.y = WALL_HEIGHT + 0.09;
      const halo = new THREE.MeshBasicMaterial({
        color: DOOR_FREE,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10), halo);
      glow.scale.set(1.5, 0.6, 1);
      glow.position.y = WALL_HEIGHT + 0.1;
      group.add(bulb, glow);
      this.group.add(group);
      this.doors.push({ spot, group, leaf, lamp, halo, slide: DOOR_SLIDE });
    }
  }

  sync(state: GameState, timeMs: number): void {
    const animate = this.motionProbe.visible;
    const clock = reorgClock(state);
    const turnstiles = state.settings.turnstiles;
    const before = gatesFor(this.map, turnstiles, clock.from);
    const after = gatesFor(this.map, turnstiles, clock.to);
    const showNext = gateShowsNext(clock);
    const amber = gateIncoming(clock, animate);
    this.amber.opacity = amber;
    this.floorAmber.opacity = 0.9 * amber;
    const swing = flapSwing(clock, animate);
    for (const look of this.gates) {
      const from = before[look.index]?.dir ?? { x: 0, y: 1 };
      const to = after[look.index]?.dir ?? from;
      const shown = showNext ? to : from;
      // Along the passage: +1 the gate's local +z.
      const way = (d: GridPoint): number => (d.y !== 0 ? Math.sign(d.y) : Math.sign(d.x));
      look.glyphs.rotation.y = way(shown) > 0 ? 0 : Math.PI;
      // Through the warning the live way stays green; the coming way flashes amber.
      const flips = amber > 0 && way(from) !== way(to);
      for (const m of look.incoming) m.visible = flips;
      for (const m of look.strips) m.visible = flips;
      for (const m of look.crosses) m.visible = !flips;
      // The flaps swing open the way through, through shut, as the way flips.
      const s = way(from) + (way(to) - way(from)) * swing;
      look.flaps[0].rotation.y = (-Math.PI / 2) * s;
      look.flaps[1].rotation.y = Math.PI + (Math.PI / 2) * s;
    }
    if (!this.doorsBuilt) this.buildDoors(state);
    const dt = this.lastMs === 0 ? 0 : Math.min(100, timeMs - this.lastMs);
    this.lastMs = timeMs;
    const live = meetingDoors(state);
    for (const look of this.doors) {
      const rise = doorRise(
        look.spot.in[clock.from - 1] ?? false,
        look.spot.in[clock.to - 1] ?? false,
        clock,
        animate,
      );
      look.group.visible = rise > 0.01;
      look.group.scale.y = Math.max(0.01, rise);
      const door = live.find((d) => d.x === look.spot.x && d.y === look.spot.y);
      const color = !door
        ? DOOR_DARK
        : door.light === 'inSession'
          ? DOOR_IN_SESSION
          : door.light === 'invited'
            ? DOOR_INVITED
            : DOOR_FREE;
      look.lamp.color.setHex(color);
      look.halo.color.setHex(color);
      look.halo.opacity = door ? 0.25 : 0;
      // Slid shut while a meeting is in session, open otherwise.
      const target = door?.light === 'inSession' ? 0 : DOOR_SLIDE;
      look.slide = animate ? look.slide + (target - look.slide) * Math.min(1, dt / 120) : target;
      look.leaf.position.x = look.slide;
    }
  }

  destroy(): void {
    this.group.removeFromParent();
    disposeTree(this.group);
  }
}
