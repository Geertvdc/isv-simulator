/**
 * Lift cars (local and express lifts, not the shuttle): the cabin tiles get a
 * steel car floor, a door frame on every side people step in from, two door
 * leaves per doorway that slide shut into the jambs, a light over the doors
 * and the floor's pips on the header, and a roof that closes over the car
 * once its doors are shut, so riders vanish inside until the doors open on
 * the next floor.
 *
 * The doors close with the sim (`doorShare`: shut over the chime second) and
 * open with a short visual-only slide when the lift arrives.
 *
 * A car set flush into a room's outer wall (`flushDoorway`: one tile deep,
 * its one doorway on the room, the outside behind it, as on Hot Desking)
 * is built as a person-height lift core in the wall line instead: a slim
 * brushed-steel portal flush in the wall plane rising over the partitions,
 * doors a head taller than a developer, a lit floor indicator over them (a
 * digit per floor, the lift's floor lit; up and down arrows for where it
 * goes next), a call button on the jamb, the car's warm lit back wall, and
 * the core's top in the partitions' coping. Its brushed-steel leaves go a
 * shade darker while the lift is on another floor: "lift not here".
 */

import * as THREE from 'three';
import { type GridPoint, type LevelMap, getTile, isSolid } from '../../sim/level';
import {
  type Lift,
  breakdownWarns,
  doorShare,
  hasDoors,
  liftBroken,
  liftChimes,
} from '../../sim/lifts';
import type { GameState } from '../../sim/state';
import { gridToWorld } from '../projection';
import { ModelBuilder } from './kit';
import { WALL_HEIGHT } from './layout';
import { WALL_COLORS } from './look';
import { text } from './roomModels/basement';

/** The leaves' height; the header fills the rest up to the wall tops. */
const DOOR_H = 0.92;
const LEAF_T = 0.05;
/** How far the leaves sit inside the cabin's edge (two cabins side by side don't touch). */
const INSET = 0.06;
const JAMB_W = 0.08;
/** What's left of a leaf folded into its jamb. */
const LEAF_OPEN = 0.04;
const ROOF_T = 0.05;
/** Seconds the doors take to slide open when the lift arrives (closing follows the sim). */
const OPEN_SECONDS = 0.45;

const STEEL = 0xa9b1b8;
const STEEL_DARK = 0x3a3f45;
const SEAM = 0x2a2e33;
const CAR_FLOOR = 0x6f767d;
const ROOF = 0x7f878e;
const LIGHT_OFF = 0x2a2e33;
const LIGHT_OPEN = 0x4cd964;
const LIGHT_LEAVING = 0xffa53d;
const LIGHT_BROKEN = 0xff4a3d;
const LOCAL_ACCENT = 0x5bc0eb;
const EXPRESS_ACCENT = 0xf2b134;

// The flush cars' lobby (`flushDoorway`).
/** The brushed-steel portal (jambs and header), slim in the wall plane. */
const FLUSH_FRAME = 0xc2c7cc;
const FLUSH_JAMB_W = 0.06;
/**
 * The flush doors' opening: person height with headroom (a developer stands
 * `DEVELOPER_TOP` 1.54 tall, this is 1.3 times that), and the core's top
 * over it, above the partitions' wall line, with the indicator between.
 */
export const FLUSH_DOOR_H = 2.0;
export const FLUSH_TOP = 2.4;
/** The leaves: brushed steel while the lift is away, bright steel while it's here. */
export const FLUSH_LEAF_AWAY = 0x52585f;
const FLUSH_LEAF_HERE = 0xb9c1c8;
/** Inside the car: a warm lit back wall under a strip light, light sides, a light floor. */
export const FLUSH_BACK = 0xe9dcc0;
const FLUSH_SIDE = 0xd9d2c2;
const FLUSH_FLOOR = 0xb4b2aa;
const FLUSH_STRIP = 0xfff1d6;
/** The core's coping: the partitions' cool concrete (`WALL_COLORS.upperFloors.top`), a lighter lip. */
const FLUSH_CAP = WALL_COLORS.upperFloors.top;
const FLUSH_CAP_LIP = 0xb6b8b5;
const FLUSH_CAP_T = 0.045;
/** The indicator over the doors: its size, the digits' and arrows' height. */
export const INDICATOR_W = 0.8;
const INDICATOR_H = 0.27;
export const DIGIT_H = 0.2;
const ARROW_H = 0.14;
/** Its dark glass, a digit lit amber or dim, an arrow lit green or dim. */
const INDICATOR = 0x1f2328;
export const DIGIT_ON = 0xffb020;
const DIGIT_OFF = 0x3a3128;
export const ARROW_ON = 0x5be37a;
const ARROW_OFF = 0x26332a;
const CALL_ON = 0xffb347;
const CALL_OFF = 0x4a4e54;
/** Seconds the leaves take to light up or go dark as the lift comes and goes. */
const TINT_SECONDS = 0.6;

/** One doorway of a cabin: a run of tile edges on one side. */
export interface Doorway {
  /** Its two ends, in grid units, on the cabin's edge line. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** The way out of the cabin through it. */
  out: GridPoint;
}

const SIDES: readonly GridPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * A cabin's doorways: its tile edges onto open floor that isn't the same
 * cabin, joined into runs along each side.
 */
export function doorways(map: LevelMap, cabin: readonly GridPoint[]): Doorway[] {
  const inCabin = (x: number, y: number) => cabin.some((t) => t.x === x && t.y === y);
  const out: Doorway[] = [];
  for (const d of SIDES) {
    const edges = cabin
      .filter((t) => !inCabin(t.x + d.x, t.y + d.y))
      .filter((t) => !isSolid(getTile(map, t.x + d.x, t.y + d.y)))
      // Along the side: x for up and down, y for left and right.
      .sort((a, b) => (d.x === 0 ? a.x - b.x : a.y - b.y) || a.x - b.x || a.y - b.y);
    let run: GridPoint[] = [];
    const flush = () => {
      const first = run[0];
      const last = run[run.length - 1];
      if (!first || !last) return;
      const ax = d.x === 0 ? 0.5 : 0;
      const ay = d.x === 0 ? 0 : 0.5;
      out.push({
        from: { x: first.x + d.x / 2 - ax, y: first.y + d.y / 2 - ay },
        to: { x: last.x + d.x / 2 + ax, y: last.y + d.y / 2 + ay },
        out: d,
      });
      run = [];
    };
    for (const t of edges) {
      const prev = run[run.length - 1];
      const line = d.x === 0 ? t.y : t.x;
      const prevLine = prev ? (d.x === 0 ? prev.y : prev.x) : line;
      const step = prev ? (d.x === 0 ? t.x - prev.x : t.y - prev.y) : 1;
      if (prev && (line !== prevLine || step !== 1)) flush();
      run.push(t);
    }
    flush();
  }
  return out;
}

interface DoorLook {
  /** The two leaves, scaled along the doorway as they slide. */
  leaves: [THREE.Mesh, THREE.Mesh];
  /** Where each leaf's outer end is, and the way along the doorway toward the middle. */
  ends: [THREE.Vector3, THREE.Vector3];
  along: THREE.Vector3;
  half: number;
}

/** A flush car's lobby: what lights up as the lift comes and goes. */
interface LobbyLook {
  /** The leaves' own material, tinted from away (0) to here (1). */
  leaf: THREE.MeshStandardMaterial;
  here: number;
  /** A digit per building floor, ground first. */
  digits: THREE.MeshBasicMaterial[];
  up: THREE.MeshBasicMaterial;
  down: THREE.MeshBasicMaterial;
  call: THREE.MeshBasicMaterial;
}

interface CarLook {
  doors: DoorLook[];
  roof: THREE.Mesh;
  light: THREE.MeshBasicMaterial;
  /** How far the doors show open, 0 to 1 (eases open, follows the sim shut). */
  shown: number;
  /** The leaves' height (the flush cars' are taller). */
  doorH: number;
  /** The roof stays shown with the doors open (a flush car's core top). */
  roofAlways?: boolean;
  lobby?: LobbyLook;
}

/**
 * The doorway of a car set flush into a room's outer wall: a cabin one tile
 * deep with a single doorway, and the outside (off the map or void) behind
 * every one of its tiles. Null for any other car.
 */
export function flushDoorway(map: LevelMap, cabin: readonly GridPoint[]): Doorway | null {
  const ways = doorways(map, cabin);
  const [way] = ways;
  if (!way || ways.length !== 1) return null;
  const { x: dx, y: dy } = way.out;
  const inCabin = (x: number, y: number) => cabin.some((t) => t.x === x && t.y === y);
  for (const t of cabin) {
    if (inCabin(t.x + dx, t.y + dy) || inCabin(t.x - dx, t.y - dy)) return null;
    const behind = getTile(map, t.x - dx, t.y - dy);
    if (behind !== null && behind !== 'void') return null;
  }
  return way;
}

/** A building floor's digit, as a flat glyph geometry facing +z at the origin. */
function digitGeometry(n: number, px: number): THREE.BufferGeometry {
  const b = new ModelBuilder();
  text(b, String(n), 0, 0, 0, px, 0xffffff, 0.002);
  return b.build().body;
}

function lit(color: number, roughness = 0.45, metalness = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export class LiftCars {
  private readonly root = new THREE.Group();
  private readonly cars = new Map<string, CarLook>();
  private readonly unit = new THREE.BoxGeometry(1, 1, 1);
  private readonly steel = lit(STEEL);
  private readonly steelDark = lit(STEEL_DARK, 0.6, 0.3);
  private readonly seam = lit(SEAM, 0.7, 0.2);
  private readonly floor = lit(CAR_FLOOR, 0.55, 0.4);
  private readonly roofMaterial = lit(ROOF, 0.6, 0.3);
  private lastMs: number | null = null;

  constructor(
    parent: THREE.Object3D,
    private readonly map: LevelMap,
  ) {
    parent.add(this.root);
  }

  private box(
    material: THREE.Material,
    size: [number, number, number],
    at: [number, number, number],
    shadow = false,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.unit, material);
    mesh.scale.set(...size);
    mesh.position.set(...at);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private build(lift: Lift, floor: number): CarLook {
    const cabin = lift.stops[floor] ?? [];
    const flush = flushDoorway(this.map, cabin);
    if (flush) return this.buildFlush(lift, cabin, flush);
    const accent = lit(lift.kind === 'express' ? EXPRESS_ACCENT : LOCAL_ACCENT, 0.5, 0.2);
    // The car floor: steel plate with a ridge pattern, a sill at every doorway.
    for (const t of cabin) {
      const at = gridToWorld(t.x, t.y, 0.006);
      this.box(this.floor, [0.98, 0.012, 0.98], [at.x, at.y, at.z]);
      for (const k of [-0.3, 0, 0.3])
        this.box(this.seam, [0.9, 0.003, 0.02], [at.x, 0.0135, at.z + k]);
    }
    const doors: DoorLook[] = [];
    const light = new THREE.MeshBasicMaterial({ color: LIGHT_OFF, toneMapped: false });
    let first = true;
    for (const w of doorways(this.map, cabin)) {
      const along = new THREE.Vector3(w.to.x - w.from.x, 0, w.to.y - w.from.y);
      const length = along.length();
      along.normalize();
      const across = new THREE.Vector3(w.out.x, 0, w.out.y);
      const mid = new THREE.Vector3((w.from.x + w.to.x) / 2, 0, (w.from.y + w.to.y) / 2);
      const line = mid.clone().addScaledVector(across, -INSET);
      const alongX = Math.abs(along.x) > 0.5;
      const sized = (l: number, h: number, t: number): [number, number, number] =>
        alongX ? [l, h, t] : [t, h, l];
      // The sill, in the lift's colour.
      this.box(accent, sized(length, 0.014, 0.1), [line.x, 0.007, line.z]);
      // The jambs and the header over the doors.
      const inner = length - 2 * JAMB_W;
      for (const s of [-1, 1]) {
        const at = line.clone().addScaledVector(along, (s * (length - JAMB_W)) / 2);
        this.box(
          this.steelDark,
          sized(JAMB_W, WALL_HEIGHT, 0.12),
          [at.x, WALL_HEIGHT / 2, at.z],
          true,
        );
      }
      const headH = WALL_HEIGHT - DOOR_H;
      this.box(
        this.steelDark,
        sized(length, headH, 0.12),
        [line.x, DOOR_H + headH / 2, line.z],
        true,
      );
      // The light over the doors, on the header's outer face and its top.
      const face = line.clone().addScaledVector(across, 0.065);
      const strip = new THREE.Mesh(this.unit, light);
      strip.scale.set(...sized(Math.min(0.5, inner * 0.6), 0.07, 0.012));
      strip.position.set(face.x, DOOR_H + headH * 0.55, face.z);
      this.root.add(strip);
      const top = new THREE.Mesh(this.unit, light);
      top.scale.set(...sized(Math.min(0.5, inner * 0.6), 0.012, 0.05));
      top.position.set(line.x, WALL_HEIGHT + 0.006, line.z);
      this.root.add(top);
      // The floor's number on the first doorway's header: a pip per floor from the top.
      if (first) {
        const pips = lift.stops.length - floor;
        for (let i = 0; i < pips; i++) {
          const at = line
            .clone()
            .addScaledVector(
              along,
              (i - (pips - 1) / 2) * 0.12 + Math.min(0.5, inner * 0.6) / 2 + 0.1,
            )
            .addScaledVector(across, 0.01);
          this.box(accent, [0.07, 0.03, 0.07], [at.x, WALL_HEIGHT + 0.015, at.z]);
        }
        first = false;
      }
      // The leaves: one from each jamb, meeting in the middle.
      const half = inner / 2;
      const ends: [THREE.Vector3, THREE.Vector3] = [
        line.clone().addScaledVector(along, -inner / 2),
        line.clone().addScaledVector(along, inner / 2),
      ];
      const leaf = (): THREE.Mesh => {
        const mesh = new THREE.Mesh(this.unit, this.steel);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.root.add(mesh);
        return mesh;
      };
      const leaves: [THREE.Mesh, THREE.Mesh] = [leaf(), leaf()];
      // A dark seam down each leaf's meeting edge, a kick plate along the bottom: children, so they slide too.
      for (const leaf of leaves) {
        const kick = new THREE.Mesh(this.unit, this.seam);
        kick.scale.set(1, 0.1, 1.04);
        kick.position.set(0, -0.42, 0);
        leaf.add(kick);
      }
      doors.push({ leaves, ends, along, half });
    }
    // The roof: over the whole car, shown while its doors are shut.
    const xs = cabin.map((t) => t.x);
    const ys = cabin.map((t) => t.y);
    const x0 = Math.min(...xs) - 0.5;
    const x1 = Math.max(...xs) + 0.5;
    const y0 = Math.min(...ys) - 0.5;
    const y1 = Math.max(...ys) + 0.5;
    const roof = this.box(
      this.roofMaterial,
      [x1 - x0 - 0.02, ROOF_T, y1 - y0 - 0.02],
      [(x0 + x1) / 2, WALL_HEIGHT + ROOF_T / 2, (y0 + y1) / 2],
      true,
    );
    // A service hatch and a rail on the roof, so it reads as the top of a car.
    const hatch = new THREE.Mesh(this.unit, this.steelDark);
    hatch.scale.set(0.35 / (x1 - x0), 0.6, 0.35 / (y1 - y0));
    hatch.position.set(0, 0.6, 0);
    roof.add(hatch);
    return { doors, roof, light, shown: 1, doorH: DOOR_H };
  }

  /**
   * A car flush in the wall line (see `flushDoorway`), a person-height lift
   * core set into the partition: the car floor, its lit back wall and sides
   * up to the portal top, the brushed-steel portal in the wall plane (slim
   * jambs, a header with the indicator and the light over the doors, the
   * call button on the right jamb), two leaves, and the core's coping on top.
   */
  private buildFlush(lift: Lift, cabin: readonly GridPoint[], w: Doorway): CarLook {
    const frame = lit(FLUSH_FRAME, 0.4, 0.15);
    // The back wall glows a little of its own under the strip light, so an open car pops.
    const back = new THREE.MeshStandardMaterial({
      color: FLUSH_BACK,
      roughness: 0.75,
      metalness: 0.05,
      emissive: FLUSH_BACK,
      emissiveIntensity: 0.35,
    });
    const sides = lit(FLUSH_SIDE, 0.75, 0.05);
    const carFloor = lit(FLUSH_FLOOR, 0.6, 0.3);
    // Little metalness: on `low` (no environment map) a metallic leaf would go black.
    const leafMaterial = lit(FLUSH_LEAF_AWAY, 0.5, 0.12);
    const seam = lit(SEAM, 0.7, 0.2);
    const accent = lit(lift.kind === 'express' ? EXPRESS_ACCENT : LOCAL_ACCENT, 0.5, 0.2);
    for (const t of cabin) {
      const at = gridToWorld(t.x, t.y, 0.006);
      this.box(carFloor, [0.98, 0.012, 0.98], [at.x, at.y, at.z]);
      for (const k of [-0.3, 0, 0.3])
        this.box(this.seam, [0.9, 0.003, 0.02], [at.x, 0.0135, at.z + k]);
    }
    const along = new THREE.Vector3(w.to.x - w.from.x, 0, w.to.y - w.from.y);
    const length = along.length();
    along.normalize();
    const across = new THREE.Vector3(w.out.x, 0, w.out.y);
    const alongX = Math.abs(along.x) > 0.5;
    const sized = (l: number, h: number, t: number): [number, number, number] =>
      alongX ? [l, h, t] : [t, h, l];
    const mid = new THREE.Vector3((w.from.x + w.to.x) / 2, 0, (w.from.y + w.to.y) / 2);
    const line = mid.clone().addScaledVector(across, -INSET);
    const wallTop = FLUSH_TOP - FLUSH_CAP_T;
    // The car's back wall, a tile behind the doors: warm and lit, a handrail, a mirror band,
    // and the strip light along its top, so an open car pops.
    const rear = mid.clone().addScaledVector(across, -1 + 0.04);
    this.box(back, sized(length, wallTop, 0.08), [rear.x, wallTop / 2, rear.z]);
    const railAt = rear.clone().addScaledVector(across, 0.06);
    this.box(this.steelDark, sized(length - 0.2, 0.035, 0.035), [railAt.x, 0.62, railAt.z]);
    const mirror = rear.clone().addScaledVector(across, 0.042);
    this.box(lit(0xc9ccc8, 0.15, 0.5), sized(length - 0.6, 0.6, 0.004), [mirror.x, 1.15, mirror.z]);
    const glowAt = rear.clone().addScaledVector(across, 0.05);
    const glow = new THREE.Mesh(
      this.unit,
      new THREE.MeshBasicMaterial({ color: FLUSH_STRIP, toneMapped: false }),
    );
    glow.scale.set(...sized(length - 0.3, 0.06, 0.02));
    glow.position.set(glowAt.x, wallTop - 0.12, glowAt.z);
    this.root.add(glow);
    // The core's sides, from the floor up to the portal top (over the partitions either side).
    for (const s of [-1, 1]) {
      const at = mid
        .clone()
        .addScaledVector(along, s * (length / 2 - 0.025))
        .addScaledVector(across, -0.5);
      this.box(sides, sized(0.05, wallTop, 0.92), [at.x, wallTop / 2, at.z]);
    }
    // The sill, in the lift's colour.
    this.box(accent, sized(length, 0.014, 0.1), [line.x, 0.007, line.z]);
    // The portal in the wall plane: slim jambs and the header, up to the core's top.
    const inner = length - 2 * FLUSH_JAMB_W;
    for (const s of [-1, 1]) {
      const at = line.clone().addScaledVector(along, (s * (length - FLUSH_JAMB_W)) / 2);
      this.box(frame, sized(FLUSH_JAMB_W, wallTop, 0.14), [at.x, wallTop / 2, at.z], true);
    }
    const headH = wallTop - FLUSH_DOOR_H;
    this.box(frame, sized(length, headH, 0.14), [line.x, FLUSH_DOOR_H + headH / 2, line.z], true);
    const face = line.clone().addScaledVector(across, 0.071);
    // The light over the doors: a slim strip along the header's foot.
    const light = new THREE.MeshBasicMaterial({ color: LIGHT_OFF, toneMapped: false });
    const strip = new THREE.Mesh(this.unit, light);
    strip.scale.set(...sized(inner * 0.8, 0.03, 0.008));
    strip.position.set(face.x, FLUSH_DOOR_H + 0.035, face.z);
    this.root.add(strip);
    // The indicator: a dark glass panel, a digit per floor (ground first), the arrows beside.
    const floors = lift.stops.length;
    const panelY = FLUSH_DOOR_H + 0.06 + INDICATOR_H / 2;
    this.box(lit(INDICATOR, 0.25, 0.2), sized(INDICATOR_W, INDICATOR_H, 0.008), [
      face.x,
      panelY,
      face.z,
    ]);
    const glass = face.clone().addScaledVector(across, 0.004);
    const yaw = Math.atan2(across.x, across.z);
    const digits: THREE.MeshBasicMaterial[] = [];
    const pitch = Math.min(0.15, 0.48 / floors);
    for (let n = 0; n < floors; n++) {
      const material = new THREE.MeshBasicMaterial({ color: DIGIT_OFF, toneMapped: false });
      const mesh = new THREE.Mesh(digitGeometry(n, DIGIT_H / 5), material);
      const at = glass.clone().addScaledVector(along, -INDICATOR_W / 2 + 0.1 + n * pitch);
      mesh.position.set(at.x, panelY, at.z);
      mesh.rotation.y = yaw;
      this.root.add(mesh);
      digits.push(material);
    }
    const arrow = (up: boolean): THREE.MeshBasicMaterial => {
      const material = new THREE.MeshBasicMaterial({ color: ARROW_OFF, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.07, ARROW_H, 3), material);
      const at = glass
        .clone()
        .addScaledVector(along, INDICATOR_W / 2 - (up ? 0.23 : 0.09))
        .addScaledVector(across, 0.004);
      mesh.position.set(at.x, panelY, at.z);
      mesh.rotation.set(0, yaw, up ? 0 : Math.PI);
      mesh.scale.set(1, 1, 0.08);
      this.root.add(mesh);
      return material;
    };
    const up = arrow(true);
    const down = arrow(false);
    // The call button on the right jamb's face: a steel plate, the button.
    const jamb = face.clone().addScaledVector(along, (length - FLUSH_JAMB_W) / 2);
    this.box(lit(0x6c747b, 0.35, 0.55), sized(0.045, 0.14, 0.006), [jamb.x, 0.62, jamb.z]);
    const call = new THREE.MeshBasicMaterial({ color: CALL_OFF, toneMapped: false });
    const button = new THREE.Mesh(this.unit, call);
    const press = jamb.clone().addScaledVector(across, 0.005);
    button.scale.set(...sized(0.026, 0.026, 0.006));
    button.position.set(press.x, 0.62, press.z);
    this.root.add(button);
    // The leaves: brushed steel, one from each jamb, a dark seam where they meet.
    const half = inner / 2;
    const ends: [THREE.Vector3, THREE.Vector3] = [
      line.clone().addScaledVector(along, -inner / 2),
      line.clone().addScaledVector(along, inner / 2),
    ];
    const leaf = (side: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(this.unit, leafMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      const kick = new THREE.Mesh(this.unit, this.seam);
      kick.scale.set(1, 0.05, 1.04);
      kick.position.set(0, -0.47, 0);
      mesh.add(kick);
      // The meeting edge: 0.01 of each leaf, so shut doors show one 0.02 seam down the middle.
      const edge = new THREE.Mesh(this.unit, seam);
      const share = 0.01 / half;
      if (alongX) edge.scale.set(share, 1, 1.1);
      else edge.scale.set(1.1, 1, share);
      if (alongX) edge.position.set(side * (0.5 - share / 2), 0, 0);
      else edge.position.set(0, 0, side * (0.5 - share / 2));
      mesh.add(edge);
      return mesh;
    };
    const doors: DoorLook[] = [{ leaves: [leaf(1), leaf(-1)], ends, along, half }];
    // The core's coping, over the whole car, always there: the partitions' cool concrete, a lighter lip.
    const xs = cabin.map((t) => t.x);
    const ys = cabin.map((t) => t.y);
    const x0 = Math.min(...xs) - 0.5;
    const x1 = Math.max(...xs) + 0.5;
    const y0 = Math.min(...ys) - 0.5;
    const y1 = Math.max(...ys) + 0.5;
    const roof = this.box(
      lit(FLUSH_CAP, 0.85, 0.02),
      [x1 - x0, FLUSH_CAP_T, y1 - y0],
      [(x0 + x1) / 2, FLUSH_TOP - FLUSH_CAP_T / 2, (y0 + y1) / 2],
    );
    const lipAt = mid.clone().addScaledVector(across, -0.02);
    this.box(lit(FLUSH_CAP_LIP, 0.8, 0.02), sized(length, 0.012, 0.06), [
      lipAt.x,
      FLUSH_TOP - 0.006,
      lipAt.z,
    ]);
    return {
      doors,
      roof,
      roofAlways: true,
      light,
      shown: 1,
      doorH: FLUSH_DOOR_H,
      lobby: { leaf: leafMaterial, here: 0, digits, up, down, call },
    };
  }

  /** Lights a flush car's lobby: the leaves, the indicator, the call button. */
  private lightLobby(car: CarLook, lift: Lift, floor: number, dt: number): void {
    const lobby = car.lobby;
    if (!lobby) return;
    const here = lift.at === floor && lift.phase === 'open' ? 1 : 0;
    const step = dt / TINT_SECONDS;
    lobby.here =
      here > lobby.here ? Math.min(1, lobby.here + step) : Math.max(0, lobby.here - step);
    lobby.leaf.color.setHex(FLUSH_LEAF_AWAY).lerp(new THREE.Color(FLUSH_LEAF_HERE), lobby.here);
    const floors = lift.stops.length;
    // Stops run top first; the digits ground first.
    const shown = floors - 1 - lift.at;
    lobby.digits.forEach((d, n) => d.color.setHex(n === shown ? DIGIT_ON : DIGIT_OFF));
    lobby.up.color.setHex(lift.dir === -1 ? ARROW_ON : ARROW_OFF);
    lobby.down.color.setHex(lift.dir === 1 ? ARROW_ON : ARROW_OFF);
    lobby.call.color.setHex(here ? CALL_OFF : CALL_ON);
  }

  sync(state: GameState, timeMs: number): void {
    const dt = this.lastMs === null ? 0 : Math.max(0, (timeMs - this.lastMs) / 1000);
    this.lastMs = timeMs;
    const blink = Math.floor(timeMs / 200) % 2 === 0;
    state.lifts.forEach((lift, li) => {
      if (!hasDoors(lift)) return;
      lift.stops.forEach((_, floor) => {
        const key = `${li}:${floor}`;
        let car = this.cars.get(key);
        if (!car) {
          car = this.build(lift, floor);
          car.shown = doorShare(state, lift, floor);
          this.cars.set(key, car);
        }
        const target = doorShare(state, lift, floor);
        car.shown = target < car.shown ? target : Math.min(target, car.shown + dt / OPEN_SECONDS);
        this.pose(car, car.shown);
        const here = lift.at === floor && lift.phase === 'open';
        let color = LIGHT_OFF;
        if (liftBroken(state, lift) || (breakdownWarns(state, lift) && blink)) color = LIGHT_BROKEN;
        else if (here) color = liftChimes(state, lift) ? LIGHT_LEAVING : LIGHT_OPEN;
        car.light.color.setHex(color);
        this.lightLobby(car, lift, floor, dt);
      });
    });
  }

  /** Slides the leaves to `open` (0 shut, 1 open) and shows the roof once they're shut. */
  private pose(car: CarLook, open: number): void {
    const eased = open * open * (3 - 2 * open);
    for (const door of car.doors) {
      const width = LEAF_OPEN + (door.half - LEAF_OPEN) * (1 - eased);
      door.leaves.forEach((leaf, i) => {
        const end = door.ends[i];
        if (!end) return;
        const toward = i === 0 ? 1 : -1;
        const at = end.clone().addScaledVector(door.along, (toward * width) / 2);
        leaf.position.set(at.x, car.doorH / 2, at.z);
        const alongX = Math.abs(door.along.x) > 0.5;
        leaf.scale.set(alongX ? width : LEAF_T, car.doorH, alongX ? LEAF_T : width);
      });
    }
    car.roof.visible = car.roofAlways === true || open < 0.02;
  }
}
