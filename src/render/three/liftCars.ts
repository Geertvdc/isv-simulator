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
import { WALL_HEIGHT } from './layout';

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

interface CarLook {
  doors: DoorLook[];
  roof: THREE.Mesh;
  light: THREE.MeshBasicMaterial;
  /** How far the doors show open, 0 to 1 (eases open, follows the sim shut). */
  shown: number;
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
    return { doors, roof, light, shown: 1 };
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
        leaf.position.set(at.x, DOOR_H / 2, at.z);
        const alongX = Math.abs(door.along.x) > 0.5;
        leaf.scale.set(alongX ? width : LEAF_T, DOOR_H, alongX ? LEAF_T : width);
      });
    }
    car.roof.visible = open < 0.02;
  }
}
