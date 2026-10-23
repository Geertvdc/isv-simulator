import * as THREE from 'three';
import type { WorldMap } from '../../../flow/worldMap';
import { BACKLOT } from './cityPlan';
import type { Cityscape } from './cityscape';
import { type Diorama, FLAG, ROAD_SURFACE } from './diorama';
import {
  LOCK_COLORS,
  type CloudBank,
  type GateModel,
  buildCloudBank,
  buildGate,
  padlockGeometry,
  starGeometry,
} from './lockModels';
import { CLOUDS, type LockState, type Opened, cloudPuffs, distanceAlong } from './locks';
import { type RoadPath, pointAt, tangentAt } from './roadPath';
import type { KitMaterials } from '../kit';

/**
 * The world map's locks on screen: clouds over locked chapters, a barrier
 * at each closed gate, grey flags with a padlock for locked levels and
 * stars over played ones, and the unlock moment (the clouds roll away, the
 * barrier lifts, the new flags pop up). Visual state only; what is open
 * comes from the menu view.
 */

/** The barrier stands this far before the border on the road; the van waits this far before it. */
const GATE = { back: 0.75, vanGap: 0.95 };
/** The unlock moment, in ms. */
const UNVEIL = { clouds: 1500, liftFrom: 250, lift: 800, signFrom: 500, sign: 450 };
const POP = { ms: 700, delay: 150, afterClouds: 900 };
/** A locked level's flag hangs down; open ones flutter. */
const FLAG_MOTION = { droop: -1.25, flutter: 0.18, flutterMs: 1400 };
/** The stars over a played flag: a little row above the pole, tipped to face the camera. */
const STARS = { radius: 0.2, gap: 0.4, over: 0.5, shift: 0.2, tilt: -(56 * Math.PI) / 180 };
const PADLOCK = { height: 0.72, ahead: 0.08, size: 2.7 };
const MAX_STARS_SHOWN = 3;

export class MapLocks {
  readonly root = new THREE.Group();
  /** Where the van waits in front of each gate (road distance), and the gate's chapter. */
  readonly gateStops: number[] = [];
  readonly gateChapters: number[] = [];
  private readonly clouds: (CloudBank | null)[];
  private readonly gates = new Map<number, GateModel>();
  private readonly padlocks: THREE.InstancedMesh;
  private readonly stars: THREE.InstancedMesh;
  private shown: LockState | null = null;
  private starCounts: (number | null)[] = [];
  /** Per chapter: ms into its unveiling, or null. */
  private readonly unveil: (number | null)[];
  /** Per node: ms into its pop (negative while it waits), or null. */
  private readonly pop: (number | null)[];
  private readonly grey = new THREE.Color(LOCK_COLORS.lockedCloth);
  private readonly paint = new THREE.Color();
  private readonly m = new THREE.Matrix4();

  constructor(
    private readonly map: WorldMap,
    road: RoadPath,
    private readonly diorama: Diorama,
    private readonly city: Cityscape,
    chapterGates: readonly number[],
    materials: KitMaterials,
  ) {
    this.clouds = map.regions.map((region) => {
      if (region.chapter === 0) return null;
      const bank = buildCloudBank(cloudPuffs(region, BACKLOT), CLOUDS.drift);
      this.root.add(bank.mesh);
      return bank;
    });
    for (const gate of map.gates) {
      const at = distanceAlong(road.points, gate.at) - GATE.back;
      const model = buildGate(
        pointAt(road, at),
        tangentAt(road, at),
        chapterGates[gate.chapter] ?? 0,
        ROAD_SURFACE,
        materials,
      );
      this.root.add(model.root);
      this.gates.set(gate.chapter, model);
      this.gateStops.push(at - GATE.vanGap);
      this.gateChapters.push(gate.chapter);
    }
    const count = diorama.flags.length;
    this.padlocks = new THREE.InstancedMesh(padlockGeometry(), materials.body, Math.max(1, count));
    this.padlocks.castShadow = true;
    const starMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.15 });
    this.stars = new THREE.InstancedMesh(
      starGeometry(STARS.radius),
      starMaterial,
      Math.max(1, count * MAX_STARS_SHOWN),
    );
    for (let i = 0; i < count * MAX_STARS_SHOWN; i++) {
      this.stars.setColorAt(i, this.paint.setHex(LOCK_COLORS.starMissing));
    }
    this.root.add(this.padlocks, this.stars);
    this.unveil = map.regions.map(() => null);
    this.pop = diorama.flags.map(() => null);
  }

  /** Whether chapter `chapter` shows as locked (under its clouds). */
  isLocked(chapter: number): boolean {
    return this.shown?.chapters[chapter] === false;
  }

  /** What is open, per chapter (as shown). */
  get chapterOpen(): readonly boolean[] {
    return this.shown?.chapters ?? [];
  }

  /**
   * Shows `state`, with each node's best stars (`null`: never played).
   * What `opened` names animates open; everything else just shows as it is.
   */
  show(state: LockState, stars: readonly (number | null)[], opened: Opened): void {
    for (const c of opened.chapters) this.unveil[c] = 0;
    for (const i of opened.levels) {
      const chapter = this.diorama.flags[i]?.chapter ?? -1;
      const delay = opened.chapters.includes(chapter) ? POP.afterClouds : POP.delay;
      this.pop[i] = -delay;
    }
    this.shown = state;
    this.starCounts = [...stars];
    this.applyChapters();
    this.placeBadges();
  }

  update(timeMs: number, deltaMs: number): void {
    const dt = Math.max(0, deltaMs);
    const state = this.shown;
    // Clouds and gates.
    this.clouds.forEach((bank, c) => {
      if (!bank) return;
      const t = this.unveil[c];
      const open = state?.chapters[c] ?? false;
      if (t !== null && t !== undefined) {
        const next = t + dt;
        this.unveil[c] = next >= UNVEIL.clouds + UNVEIL.sign ? null : next;
        bank.update(timeMs, smooth(next / UNVEIL.clouds));
        const gate = this.gates.get(c);
        if (gate) {
          gate.setRaised(backOut(clamp01((next - UNVEIL.liftFrom) / UNVEIL.lift)));
          const sign = 1 - clamp01((next - UNVEIL.signFrom) / UNVEIL.sign);
          gate.sign.scale.setScalar(Math.max(0.001, sign));
          gate.sign.visible = sign > 0;
        }
      } else if (!open) {
        bank.update(timeMs, 0);
      }
    });
    // Flags: open ones flutter, locked ones droop; a popping one swings up.
    this.diorama.flags.forEach((flag, i) => {
      const open = state?.levels[i] ?? true;
      let openness = open ? 1 : 0;
      let swell = 1;
      const t = this.pop[i];
      if (t !== null && t !== undefined) {
        const next = t + dt;
        this.pop[i] = next >= POP.ms ? null : next;
        const share = clamp01(next / POP.ms);
        openness = backOut(share);
        swell = 1 + Math.sin(share * Math.PI) * 0.35;
        this.setPadlock(i, share < 0.3 ? 1 - share / 0.3 : 0);
      }
      const wave = Math.sin((timeMs / FLAG_MOTION.flutterMs) * Math.PI * 2 + i * 1.7);
      flag.cloth.rotation.y = wave * FLAG_MOTION.flutter * Math.max(0, openness);
      flag.cloth.rotation.z = FLAG_MOTION.droop * (1 - openness);
      flag.cloth.scale.setScalar(swell);
      if (t !== null && t !== undefined) {
        flag.cloth.material.color
          .copy(this.grey)
          .lerp(this.paint.setHex(flag.color), clamp01(openness));
      }
    });
  }

  /** Clouds, gates, buildings and flags per chapter, and each flag's color, as shown now. */
  private applyChapters(): void {
    const state = this.shown;
    if (!state) return;
    this.map.regions.forEach((region) => {
      const c = region.chapter;
      const open = state.chapters[c] ?? true;
      const unveiling = this.unveil[c] !== null && this.unveil[c] !== undefined;
      const bank = this.clouds[c];
      if (bank && open && !unveiling) bank.mesh.visible = false;
      if (bank && !open) {
        this.unveil[c] = null;
        bank.update(0, 0);
      }
      const gate = this.gates.get(c);
      if (gate && !unveiling) {
        gate.setRaised(open ? 1 : 0);
        gate.sign.visible = !open;
        gate.sign.scale.setScalar(1);
      }
      // A gate stands just before its chapter, on the land of the one before: under that one's clouds while it is locked.
      if (gate) gate.root.visible = state.chapters[c - 1] ?? true;
      const group = this.city.chapters[c];
      if (group) group.visible = open;
      const stand = this.diorama.stands[c];
      if (stand) stand.visible = open;
    });
    this.diorama.flags.forEach((flag, i) => {
      const visible = state.chapters[flag.chapter] ?? true;
      flag.cloth.visible = visible;
      flag.label.visible = visible;
      if (this.pop[i] === null || this.pop[i] === undefined) {
        flag.cloth.material.color.setHex(state.levels[i] ? flag.color : LOCK_COLORS.lockedCloth);
      } else {
        flag.cloth.material.color.copy(this.grey);
      }
    });
  }

  /** The padlocks on locked flags and the stars over played ones. */
  private placeBadges(): void {
    const state = this.shown;
    if (!state) return;
    this.diorama.flags.forEach((flag, i) => {
      const shown = state.chapters[flag.chapter] ?? true;
      const popping = this.pop[i] !== null && this.pop[i] !== undefined;
      this.setPadlock(i, shown && (!state.levels[i] || popping) ? 1 : 0);
      const stars = shown && state.levels[i] ? (this.starCounts[i] ?? null) : null;
      for (let k = 0; k < MAX_STARS_SHOWN; k++) {
        const at = new THREE.Vector3(
          flag.foot.x + STARS.shift + (k - 1) * STARS.gap,
          flag.foot.y + FLAG.pole + STARS.over + (k === 1 ? 0.05 : 0),
          flag.foot.z,
        );
        const scale = stars === null ? 0 : k === 1 ? 1.15 : 1;
        this.m.compose(
          at,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(STARS.tilt, 0, 0)),
          new THREE.Vector3(scale, scale, scale),
        );
        this.stars.setMatrixAt(i * MAX_STARS_SHOWN + k, this.m);
        const earned = stars !== null && k < stars;
        this.stars.setColorAt(
          i * MAX_STARS_SHOWN + k,
          this.paint.setHex(earned ? LOCK_COLORS.starEarned : LOCK_COLORS.starMissing),
        );
      }
    });
    this.stars.instanceMatrix.needsUpdate = true;
    if (this.stars.instanceColor) this.stars.instanceColor.needsUpdate = true;
    this.stars.computeBoundingSphere();
    this.padlocks.computeBoundingSphere();
  }

  /** Hangs node `i`'s padlock on its pole at `scale` (0 hides it). */
  private setPadlock(i: number, scale: number): void {
    const flag = this.diorama.flags[i];
    if (!flag) return;
    const s = Math.max(scale * PADLOCK.size, 1e-4);
    this.m
      .makeScale(s, s, s)
      .setPosition(flag.foot.x, flag.foot.y + PADLOCK.height, flag.foot.z + PADLOCK.ahead);
    this.padlocks.setMatrixAt(i, this.m);
    this.padlocks.instanceMatrix.needsUpdate = true;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Eases in and out, 0 to 1. */
function smooth(v: number): number {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}

/** Eases out past the end and settles back: a little overshoot. */
function backOut(v: number): number {
  const t = clamp01(v) - 1;
  const s = 1.7;
  return 1 + t * t * ((s + 1) * t + s);
}
