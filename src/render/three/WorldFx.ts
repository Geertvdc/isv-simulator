import * as THREE from 'three';
import type { LevelMap } from '../../sim/level';
import { type Pipeline, pipelineWarning } from '../../sim/pipeline';
import type { GameState, Vec } from '../../sim/state';
import { pipelinePulse } from '../effects';
import { type Vec3, gridToWorld } from '../projection';
import {
  AMBIENT_KEY,
  type Atmosphere,
  DEFAULT_ATMOSPHERE,
  type MoteSeed,
  glintSpots,
  moteSeeds,
  sceneOf,
} from './atmosphere';
import { blockHeight, facingYaw, heroPlacement, stationFacing } from './layout';
import { LAMP_INDEX_KEY, LAMP_KEY } from './look';
import { loftRoom } from './rooms/loftRoom';
import { SCENES } from './scenes';
import { GROUND, type Scene, type ScenePiece } from './scenes/types';
import { coffeeVan, narrowboat, quayLamp } from './setDressing/canal';
import { trussRig } from './setDressing/demoDay';
import { PIPELINE_SERVER_AT } from './stationModels';
import { COLOR } from './palette';

const WARN_COLOR = 0xff3030;
const BROKEN_COLOR = 0x111317;
/** Dark, so it reads against light walls. */
const SMOKE_COLOR = 0x26282d;
const SPARK_COLOR = COLOR.gold;
const ALARM_COLOR = 0xff3020;
/** Height of the build server's top over the block's top (see `stationModels.ts`). */
const SERVER_TOP = 0.42;
const RUG_COLOR = 0x8e6bd8;
const RUG_OPACITY = 0.35;
const RUG_OPACITY_INVITED = 0.6;
const RUG_PULSE_MS = 300;
const PUFF_COLOR = 0xd9d4c7;
const PUFF_COUNT = 4;
const PUFF_MS = 350;
/** How far a dust mote drifts from where it hangs, in world units, and how long a sway takes. */
const MOTE_DRIFT = 0.18;
const MOTE_PERIOD_MS = 9000;
/** Mote size on screen, in world units (they shrink with distance). */
const MOTE_SIZE = 0.045;
/** Steam over the coffee van's hatch: puffs, how long one rises and how high. */
const STEAM = { color: 0xf4f0e8, count: 7, ms: 3200, rise: 0.6, opacity: 0.75 };
/** Smoke from the narrowboat's chimney: kept low (nothing tall in front of the level), drifting downwind. */
const SMOKE = { color: 0xa09c94, count: 5, ms: 4200, rise: 0.4, opacity: 0.45 };
/** Light streaks drifting slowly on the canal, world units and units per second. */
const RIPPLE = { color: 0xc4dcd8, opacity: 0.55, length: 0.4, perUnit: 1.2, speed: 0.07 };
/** A soft warm halo round a lamp head. */
const HALO = { color: 0xffb060, size: 0.7, opacity: 0.6 };
/**
 * Where on the props the motion sits, in the prop's own space; kept in step
 * with `setDressing/canal.ts`: the van's hatch, the boat's chimney, the lantern.
 */
const VAN_HATCH: Vec3 = { x: -0.15, y: 1.12, z: 0.72 };
const BOAT_CHIMNEY: Vec3 = { x: -2.6, y: 0.62, z: -0.12 };
const LAMP_HEAD: Vec3 = { x: 0, y: 2.0, z: 0 };
/**
 * The middle of the incident beacon's lens on the loft's back wall, from the
 * wall tile's middle (kept in step with `beacon` in `roomModels/loft.ts`).
 */
const BEACON_LENS: Vec3 = { x: 0, y: 1, z: 0.62 };
/** How bright the beam's core and the flare draw (over white, so they bloom), and the flare's size. */
const BEACON_BOOST = 2.6;
const BEACON_FLARE = 0.42;
/**
 * The demo-day truss rig's height and overhang, and where its hung moving
 * heads' lenses sit from its origin (kept in step with `scenes/demoDay.ts`
 * and `trussRig` in `setDressing/demoDay.ts`): the batten `bz` in front of
 * the beam, a head every fourth lamp from the third, its lens 0.4 under the
 * beam's top.
 */
const RIG = { h: 4.5, over: 0.95, bz: 0.55, lensDrop: 0.4, lensForward: 0.06 } as const;
/** A sweeping beam's far end never comes lower than this (world units): high over the back wall. */
export const SWEEP_FLOOR = 2.1;
/** Moving things keep at least this far (grid units) from the level's outline. */
const CLEAR_OF_PLAY = 1;

/** How far shake moves the picture at intensity 1, as a share of the canvas height. */
const SHAKE_SCALE = 1;

interface PipelineFx {
  warn: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  broken: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  smoke: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[];
  sparks: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[];
  /** A red alarm light on top of the build server, flashing while broken. */
  alarm: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  /** Grid point of the build server on the block. */
  server: { x: number; y: number };
}

interface Puff {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  from: THREE.Vector3;
  to: THREE.Vector3;
  startMs: number;
  /** Radius at the start; it grows as it fades. */
  size: number;
}

/** Where the scene's ambient motion goes (world units), from its props and ground. */
export interface AmbientAnchors {
  steam: Vec3[];
  smoke: Vec3[];
  halos: Vec3[];
  /** Stretches of canal for drifting streaks, a tile or more from the level. */
  water: { x0: number; x1: number; z0: number; z1: number }[];
}

/**
 * Finds the anchors in a hand-built scene: steam and smoke only where they
 * stay a tile clear of the level's outline, halos on every lamp head (they
 * don't move), and the canal from a tile in front of the level, a band about
 * as deep as the camera shows.
 */
export function ambientAnchors(
  scene: Scene,
  map: Pick<LevelMap, 'width' | 'height'>,
): AmbientAnchors {
  const on = (piece: ScenePiece['piece'], local: Vec3) =>
    scene.pieces.filter((p) => p.piece === piece).map((p) => placeOn(p, local));
  const clear = (p: Vec3) => outsideBy(p, map) >= CLEAR_OF_PLAY;
  const front = map.height - 0.5 + CLEAR_OF_PLAY;
  const water = scene.ground
    .filter((g) => g.kind === 'water')
    .map((g) => {
      const z0 = Math.max(g.z0, front);
      return { x0: g.x0, x1: g.x1, z0, z1: Math.min(g.z1, z0 + 1.2) };
    })
    .filter((w) => w.z1 > w.z0 && w.x1 > w.x0);
  return {
    steam: on(coffeeVan, VAN_HATCH).filter(clear),
    smoke: on(narrowboat, BOAT_CHIMNEY).filter(clear),
    halos: on(quayLamp, LAMP_HEAD),
    water,
  };
}

/** A point in a piece's own space, where the scene put it (scale, then yaw, then position). */
function placeOn(p: ScenePiece, local: Vec3): Vec3 {
  const [sx, sy, sz] = p.scale;
  const x = local.x * sx;
  const z = local.z * sz;
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return { x: p.at.x + x * c + z * s, y: p.at.y + local.y * sy, z: p.at.z - x * s + z * c };
}

/** How far a world point lies outside the level's outline, in grid units (0 inside). */
function outsideBy(p: Vec3, map: Pick<LevelMap, 'width' | 'height'>): number {
  const dx = Math.max(-0.5 - p.x, 0, p.x - (map.width - 0.5));
  const dz = Math.max(-0.5 - p.z, 0, p.z - (map.height - 0.5));
  return Math.hypot(dx, dz);
}

/** A rising puff on a loop: steam or smoke. */
interface Wisp {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  from: Vec3;
  phase: number;
  kind: typeof STEAM;
  /** Which way it drifts as it rises, world units over its life. */
  drift: { x: number; z: number };
}

/** A streak of light on the water, sliding along x and wrapping in its stretch. */
interface Ripple {
  mesh: THREE.Mesh;
  x0: number;
  span: number;
  offset: number;
  phase: number;
}

/**
 * Things in the 3D world that only show state or react to events: pipeline
 * warning glow, smoke and sparks on a broken pipeline, the meeting room rug,
 * dash puffs and screen shake; and the scene's ambient motion round the level
 * (`Atmosphere.ambient`, off on `low`).
 */
export class WorldFx {
  private readonly root = new THREE.Group();
  private readonly pipelines = new Map<string, PipelineFx>();
  private readonly rug: THREE.MeshBasicMaterial;
  private readonly puffs: Puff[] = [];
  private readonly puffGeometry = new THREE.SphereGeometry(1, 10, 8);
  /** Dust drifting in the room's light, if the atmosphere has it. */
  private readonly motes: { points: THREE.Points; seeds: MoteSeed[] } | null = null;
  /** The scene's ambient motion, under one group that `Stage` hides on `low`. */
  private readonly ambient = new THREE.Group();
  private readonly wisps: Wisp[] = [];
  private readonly ripples: Ripple[] = [];
  private readonly lamps: { light: THREE.PointLight; base: number }[] = [];
  private flicker = 0;
  /** The incident beacon's beam and its flare, if the atmosphere has one. */
  private beacon: {
    beam: THREE.Mesh;
    flare: THREE.Sprite;
    turns: number;
    group: THREE.Group;
  } | null = null;
  /**
   * The lamps' slow chase (`Atmosphere.lamps.chase`): each lamp with its base
   * brightness and its halo, if it has one.
   */
  private chase: {
    depth: number;
    seconds: number;
    haloOpacity: number;
    lamps: { light: THREE.PointLight; base: number; halo: THREE.Sprite | null }[];
    group: THREE.Group;
  } | null = null;
  /** The moving heads' beams (`Atmosphere.sweep`), each turned on its own pivot. */
  private sweep: {
    beams: THREE.Object3D[];
    degrees: number;
    seconds: number;
    group: THREE.Group;
  } | null = null;
  private shake = { untilMs: 0, intensity: 0 };
  shakeEnabled = true;

  constructor(
    world: THREE.Scene,
    private readonly map: LevelMap,
    atmosphere: Atmosphere = DEFAULT_ATMOSPHERE,
  ) {
    world.add(this.root);
    const seeds = moteSeeds(atmosphere, map);
    if (atmosphere.motes && seeds.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(seeds.length * 3), 3),
      );
      // Additive and faint: it adds a glint over the floor but stays under bloom.
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: atmosphere.motes.color,
          size: MOTE_SIZE,
          transparent: true,
          opacity: atmosphere.motes.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      );
      points.frustumCulled = false;
      this.root.add(points);
      this.motes = { points, seeds };
      this.driftMotes(0);
    }
    this.buildAmbient(world, atmosphere);
    this.buildFixtures(atmosphere);
    this.buildLampGlow(world, atmosphere);
    this.buildSweep(atmosphere);
    this.rug = new THREE.MeshBasicMaterial({
      color: RUG_COLOR,
      transparent: true,
      opacity: RUG_OPACITY,
      depthWrite: false,
    });
    const tile = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (const t of map.meetingTiles) {
      const mesh = new THREE.Mesh(tile, this.rug);
      putAt(mesh, gridToWorld(t.x, t.y, 0.004));
      this.root.add(mesh);
    }
  }

  sync(state: GameState, timeMs: number): void {
    for (const pipeline of state.pipelines) this.syncPipeline(pipeline, timeMs);
    const invited = state.invites.length > 0;
    const pulse = invited ? 0.5 + 0.5 * Math.sin(timeMs / RUG_PULSE_MS) : 0;
    this.rug.opacity = RUG_OPACITY + (RUG_OPACITY_INVITED - RUG_OPACITY) * pulse;
  }

  /** Little clouds where a dash starts, drifting backwards. */
  puff(at: Vec, facing: Vec, timeMs: number): void {
    for (let i = 0; i < PUFF_COUNT; i++) {
      const spread = (i - (PUFF_COUNT - 1) / 2) * 0.25;
      const sx = at.x - facing.y * spread;
      const sy = at.y + facing.x * spread;
      const from = vector(gridToWorld(sx, sy, 0.1));
      const to = vector(gridToWorld(sx - facing.x * 0.6, sy - facing.y * 0.6, 0.25));
      const mesh = new THREE.Mesh(
        this.puffGeometry,
        new THREE.MeshStandardMaterial({ color: PUFF_COLOR, transparent: true, roughness: 1 }),
      );
      const size = 0.08 + 0.025 * (i % 2);
      mesh.scale.setScalar(size);
      this.root.add(mesh);
      this.puffs.push({ mesh, from, to, startMs: timeMs, size });
    }
  }

  startShake(ms: number, intensity: number, timeMs: number): void {
    if (!this.shakeEnabled) return;
    if (timeMs + ms < this.shake.untilMs && intensity <= this.shake.intensity) return;
    this.shake = { untilMs: timeMs + ms, intensity };
  }

  /** Moves puffs and dust along; returns this frame's shake offset in canvas pixels. */
  update(timeMs: number, canvas: { width: number; height: number }): { x: number; y: number } {
    this.driftMotes(timeMs);
    this.moveAmbient(timeMs);
    this.turnBeacon(timeMs);
    this.runChase(timeMs);
    this.runSweep(timeMs);
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      if (!puff) continue;
      const t = (timeMs - puff.startMs) / PUFF_MS;
      if (t >= 1) {
        this.root.remove(puff.mesh);
        puff.mesh.material.dispose();
        this.puffs.splice(i, 1);
        continue;
      }
      puff.mesh.position.lerpVectors(puff.from, puff.to, t);
      puff.mesh.scale.setScalar(puff.size * (1 + 0.8 * t));
      puff.mesh.material.opacity = 0.8 * (1 - t);
    }
    if (timeMs >= this.shake.untilMs) return { x: 0, y: 0 };
    // Like Phaser's shake: a share of the canvas on each axis.
    const k = this.shake.intensity * SHAKE_SCALE;
    return {
      x: (Math.random() * 2 - 1) * k * canvas.width,
      y: (Math.random() * 2 - 1) * k * canvas.height,
    };
  }

  /** Steam, smoke, ripples and halos from the scene's props, and the lamps to flicker. */
  private buildAmbient(world: THREE.Scene, atmosphere: Atmosphere): void {
    const spec = atmosphere.ambient;
    if (!spec) return;
    this.ambient.userData[AMBIENT_KEY] = true;
    this.root.add(this.ambient);
    this.flicker = spec.flicker;
    if (spec.flicker > 0) {
      world.traverse((obj) => {
        if (obj instanceof THREE.PointLight && obj.userData[LAMP_KEY] === true)
          this.lamps.push({ light: obj, base: obj.intensity });
      });
    }
    const id = sceneOf(atmosphere);
    const build = id === undefined ? undefined : SCENES[id];
    if (!build) return;
    const anchors = ambientAnchors(build(this.map), this.map);
    const wisps = (at: Vec3[], kind: typeof STEAM, drift: { x: number; z: number }) => {
      at.forEach((from, k) => {
        for (let i = 0; i < kind.count; i++) {
          const mesh = new THREE.Mesh(
            this.puffGeometry,
            new THREE.MeshBasicMaterial({
              color: kind.color,
              transparent: true,
              depthWrite: false,
            }),
          );
          this.ambient.add(mesh);
          this.wisps.push({ mesh, from, phase: i / kind.count + k * 0.37, kind, drift });
        }
      });
    };
    if (spec.steam) wisps(anchors.steam, STEAM, { x: 0.18, z: -0.1 });
    if (spec.smoke) wisps(anchors.smoke, SMOKE, { x: -0.45, z: -0.08 });
    if (spec.ripples && anchors.water.length > 0) {
      const geometry = new THREE.PlaneGeometry(RIPPLE.length, 0.016).rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        color: RIPPLE.color,
        transparent: true,
        opacity: RIPPLE.opacity,
        depthWrite: false,
      });
      let n = 0;
      for (const w of anchors.water) {
        const span = w.x1 - w.x0;
        const count = Math.round(span * (w.z1 - w.z0) * RIPPLE.perUnit);
        for (let i = 0; i < count; i++, n++) {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(0, GROUND + 0.012, w.z0 + unitOf(n, 2) * (w.z1 - w.z0));
          this.ambient.add(mesh);
          this.ripples.push({
            mesh,
            x0: w.x0,
            span,
            offset: unitOf(n, 1) * span,
            phase: unitOf(n, 3),
          });
        }
      }
    }
    if (spec.halos && anchors.halos.length > 0) {
      const material = new THREE.SpriteMaterial({
        map: haloTexture(),
        color: HALO.color,
        transparent: true,
        opacity: HALO.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // It sits inside the lantern; nothing stands in front of a lamp head 2 up.
        depthTest: false,
        fog: false,
      });
      for (const at of anchors.halos) {
        const sprite = new THREE.Sprite(material);
        putAt(sprite, at);
        sprite.scale.setScalar(HALO.size);
        this.ambient.add(sprite);
      }
    }
  }

  /**
   * The light fixtures' extras, each under its own group that `Stage` hides
   * on `low`: the incident beacon's sweeping beam, and the lamps' glints on
   * the floor.
   */
  private buildFixtures(atmosphere: Atmosphere): void {
    const spec = atmosphere.beacon;
    const lens = spec ? beaconSpot(this.map) : null;
    if (spec && lens) {
      const group = new THREE.Group();
      group.userData[AMBIENT_KEY] = true;
      putAt(group, lens);
      this.root.add(group);
      const color = new THREE.Color(spec.color).multiplyScalar(BEACON_BOOST);
      const beam = new THREE.Mesh(
        beamGeometry(spec.reach),
        new THREE.MeshBasicMaterial({
          color,
          vertexColors: true,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
          fog: false,
        }),
      );
      group.add(beam);
      const flare = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haloTexture(),
          color,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          fog: false,
        }),
      );
      // Just in front of the dome, so the dome's own glow never hides it.
      flare.position.set(0, 0.02, 0.06);
      flare.scale.setScalar(BEACON_FLARE);
      group.add(flare);
      this.beacon = { beam, flare, turns: spec.turns, group };
      this.turnBeacon(0);
    }
    const glints = atmosphere.glints;
    const spots = glintSpots(atmosphere, this.map);
    if (glints && spots.length > 0) {
      const group = new THREE.Group();
      group.userData[AMBIENT_KEY] = true;
      this.root.add(group);
      const geometry = new THREE.PlaneGeometry(glints.size, glints.size).rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        map: haloTexture(),
        color: glints.color,
        transparent: true,
        opacity: glints.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      for (const at of spots) {
        const mesh = new THREE.Mesh(geometry, material);
        // Just over the floor and the rug, under everything standing on it.
        mesh.position.set(at.x, 0.006, at.z);
        mesh.renderOrder = -1;
        group.add(mesh);
      }
    }
  }

  /**
   * A soft glow round each lamp's lens in its own color, and the lamps'
   * slow chase (`Atmosphere.lamps`), under one group that `Stage` hides on `low`.
   */
  private buildLampGlow(world: THREE.Scene, atmosphere: Atmosphere): void {
    const spec = atmosphere.lamps;
    if (!spec || (!spec.halo && !spec.chase)) return;
    const lights: THREE.PointLight[] = [];
    world.traverse((obj) => {
      if (obj instanceof THREE.PointLight && typeof obj.userData[LAMP_INDEX_KEY] === 'number')
        lights.push(obj);
    });
    if (lights.length === 0) return;
    const group = new THREE.Group();
    group.userData[AMBIENT_KEY] = true;
    this.root.add(group);
    const texture = spec.halo ? haloTexture() : null;
    const lamps = lights.map((light) => {
      let halo: THREE.Sprite | null = null;
      if (spec.halo && texture) {
        halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: texture,
            color: light.color,
            transparent: true,
            opacity: spec.halo.opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
          }),
        );
        halo.position.copy(light.position);
        halo.scale.setScalar(spec.halo.size);
        group.add(halo);
      }
      return { light, base: light.intensity, halo };
    });
    this.chase = {
      depth: spec.chase?.depth ?? 0,
      seconds: spec.chase?.seconds ?? 1,
      haloOpacity: spec.halo?.opacity ?? 0,
      lamps,
      group,
    };
    this.runChase(0);
  }

  /**
   * The moving heads' beams (`Atmosphere.sweep`): faint additive cones from
   * the truss rig's hung heads, under one group that `Stage` hides on `low`.
   * No light and no shadows: they only show in the haze.
   */
  private buildSweep(atmosphere: Atmosphere): void {
    const spec = atmosphere.sweep;
    const id = sceneOf(atmosphere);
    const build = id === undefined ? undefined : SCENES[id];
    if (!spec || !build) return;
    const lenses = movingHeadLenses(build(this.map), spec.heads);
    if (lenses.length === 0) return;
    const group = new THREE.Group();
    group.userData[AMBIENT_KEY] = true;
    this.root.add(group);
    const geometry = sweepBeamGeometry(spec.length, spec.radius);
    const material = new THREE.MeshBasicMaterial({
      color: spec.color,
      vertexColors: true,
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beams = lenses.map((at) => {
      // The pivot swings side to side; the cone inside it leans toward the camera.
      const pivot = new THREE.Group();
      putAt(pivot, at);
      const beam = new THREE.Mesh(geometry, material);
      beam.rotation.x = -spec.lean;
      pivot.add(beam);
      group.add(pivot);
      return pivot;
    });
    this.sweep = { beams, degrees: spec.degrees, seconds: spec.seconds, group };
    this.runSweep(0);
  }

  /** The beams swing side to side, neighbours in mirror. */
  private runSweep(timeMs: number): void {
    const s = this.sweep;
    if (!s?.group.visible) return;
    s.beams.forEach((pivot, i) => {
      pivot.rotation.z = sweepAngle(timeMs, s.seconds, s.degrees, i);
    });
  }

  /** The lamps swell and dim in a slow wave along the row, their halos with them. */
  private runChase(timeMs: number): void {
    const c = this.chase;
    if (!c || c.depth === 0 || !c.group.visible) return;
    const n = c.lamps.length;
    c.lamps.forEach(({ light, base, halo }, i) => {
      const k = chaseLevel(timeMs, c.seconds, i, n);
      light.intensity = base * (1 - c.depth + c.depth * k);
      if (halo) halo.material.opacity = c.haloOpacity * (0.55 + 0.45 * k);
    });
  }

  /** The beacon's beam sweeps round; its flare peaks each time the beam faces the camera. */
  private turnBeacon(timeMs: number): void {
    const b = this.beacon;
    if (!b?.group.visible) return;
    const angle = beaconAngle(timeMs, b.turns);
    b.beam.rotation.y = angle;
    const flare = beaconFlare(angle);
    b.flare.material.opacity = 0.15 + 0.85 * flare;
    b.flare.scale.setScalar(BEACON_FLARE * (0.7 + 0.6 * flare));
  }

  /** Puffs rise and fade on their loops, streaks slide on the water, lamps flicker. */
  private moveAmbient(timeMs: number): void {
    const t = timeMs / 1000;
    this.lamps.forEach(({ light, base }, i) => {
      // Two out-of-step wobbles: an uneven, never-repeating-looking flicker within ±flicker.
      const w = 0.6 * Math.sin(t * 7.3 + i * 1.7) + 0.4 * Math.sin(t * 17.9 + i * 4.1);
      light.intensity = base * (1 + this.flicker * w);
    });
    if (!this.ambient.visible) return;
    for (const wisp of this.wisps) {
      const k = (timeMs / wisp.kind.ms + wisp.phase) % 1;
      const { from, drift, kind } = wisp;
      wisp.mesh.position.set(
        from.x + drift.x * k + Math.sin(k * 6 + wisp.phase * 9) * 0.03,
        from.y + kind.rise * k,
        from.z + drift.z * k,
      );
      wisp.mesh.scale.setScalar(0.05 + 0.12 * k);
      // Fades in over the first tenth, then out.
      wisp.mesh.material.opacity = kind.opacity * Math.min(1, k * 10) * (1 - k);
    }
    for (const r of this.ripples) {
      const x = (r.offset + t * RIPPLE.speed) % r.span;
      r.mesh.position.x = r.x0 + x;
      // Each streak swells and thins on its own slow beat, so they glint rather than march.
      r.mesh.scale.x = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.6 + r.phase * Math.PI * 2));
    }
  }

  /** Each mote sways slowly on its own loop, a little up and down. */
  private driftMotes(timeMs: number): void {
    if (!this.motes) return;
    const position = this.motes.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const t = timeMs / MOTE_PERIOD_MS;
    this.motes.seeds.forEach(({ at, phase }, i) => {
      const a = (t + phase) * Math.PI * 2;
      position.setXYZ(
        i,
        at.x + Math.sin(a) * MOTE_DRIFT,
        at.y + Math.sin(a * 2 + phase * 5) * MOTE_DRIFT * 0.5,
        at.z + Math.cos(a * 0.7) * MOTE_DRIFT,
      );
    });
    position.needsUpdate = true;
  }

  private syncPipeline(pipeline: Pipeline, timeMs: number): void {
    const key = `${pipeline.x},${pipeline.y}`;
    let fx = this.pipelines.get(key);
    if (!fx) {
      fx = this.createPipelineFx(pipeline);
      this.pipelines.set(key, fx);
    }
    const warning = pipelineWarning(pipeline);
    fx.warn.visible = warning;
    if (warning) fx.warn.material.opacity = 0.25 + 0.5 * pipelinePulse(pipeline.doneTicks, timeMs);
    fx.broken.visible = pipeline.broken;
    const t = timeMs / 1000;
    fx.alarm.visible = pipeline.broken;
    // Flashes twice a second, bright enough to bloom.
    fx.alarm.material.color
      .setHex(ALARM_COLOR)
      .multiplyScalar(Math.sin(t * Math.PI * 4) > 0 ? 3 : 0.6);
    const top = blockHeight(this.map, pipeline.x, pipeline.y);
    fx.smoke.forEach((puff, i) => {
      puff.visible = pipeline.broken;
      if (!pipeline.broken) return;
      // Smoke puffs drift up and fade.
      const phase = (t * 0.8 + i / 3) % 1;
      // Pouring out of the build server, drifting back, clear of a ticket card on the block.
      putAt(
        puff,
        gridToWorld(
          fx.server.x + (i - 1) * 0.08,
          fx.server.y - phase * 0.3,
          top + SERVER_TOP + 0.15 + phase * 0.9,
        ),
      );
      puff.scale.setScalar(0.18 + phase * 0.22);
      puff.material.opacity = 0.95 * (1 - phase * 0.7);
    });
    // Sparks blink in a fixed pattern.
    const spark = Math.floor(t * 12);
    fx.sparks.forEach((s, i) => {
      // Two of the four always show; they jump around in a fixed pattern.
      s.visible = pipeline.broken && (spark + i) % 4 < 2;
      if (!s.visible) return;
      const angle = ((spark * 7 + i * 13) % 16) * (Math.PI / 8);
      putAt(
        s,
        gridToWorld(
          pipeline.x + Math.cos(angle) * 0.22,
          pipeline.y + Math.sin(angle) * 0.22,
          top + 0.12 + Math.abs(Math.sin(angle)) * 0.18,
        ),
      );
      s.rotation.set(0, angle, angle);
    });
  }

  private createPipelineFx(pipeline: Pipeline): PipelineFx {
    const top = blockHeight(this.map, pipeline.x, pipeline.y);
    const plate = (color: number, opacity: number, lift: number) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
      );
      putAt(mesh, gridToWorld(pipeline.x, pipeline.y, top + lift));
      mesh.visible = false;
      this.root.add(mesh);
      return mesh;
    };
    const smoke = Array.from({ length: 3 }, () => {
      const mesh = new THREE.Mesh(
        this.puffGeometry,
        new THREE.MeshStandardMaterial({ color: SMOKE_COLOR, transparent: true, roughness: 1 }),
      );
      this.root.add(mesh);
      return mesh;
    });
    const sparkGeometry = new THREE.BoxGeometry(0.4, 0.045, 0.045);
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: SPARK_COLOR });
    const sparks = Array.from({ length: 4 }, () => {
      const mesh = new THREE.Mesh(sparkGeometry, sparkMaterial);
      this.root.add(mesh);
      return mesh;
    });
    const h = heroPlacement(
      facingYaw(stationFacing(this.map, pipeline.x, pipeline.y)),
      PIPELINE_SERVER_AT,
    );
    const server = { x: pipeline.x + h.dx, y: pipeline.y + h.dz };
    const alarm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.1, 0.16, 16),
      new THREE.MeshBasicMaterial({ color: ALARM_COLOR, toneMapped: false }),
    );
    // On a short pole over the server, high enough to clear a ticket's checklist on the block.
    putAt(alarm, gridToWorld(server.x, server.y, top + SERVER_TOP + 0.38));
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8),
      new THREE.MeshBasicMaterial({ color: COLOR.charcoal }),
    );
    pole.position.y = -0.23;
    alarm.add(pole);
    alarm.visible = false;
    this.root.add(alarm);
    return {
      warn: plate(WARN_COLOR, 0.5, 0.012),
      // Over the conveyor and the server's foot: the whole top goes dark.
      broken: plate(BROKEN_COLOR, 0.88, 0.08),
      smoke,
      sparks,
      alarm,
      server,
    };
  }
}

/**
 * Where the incident beacon's lens is, in world units: on the loft's own
 * beacon (`loftRoom`'s back-wall art, right beside the dashboard), or none
 * when the room has no place for it.
 */
export function beaconSpot(map: LevelMap): Vec3 | null {
  const spot = loftRoom(map).wallArt.find((a) => a.art === 'beacon');
  if (!spot) return null;
  const at = gridToWorld(spot.x, spot.y);
  return { x: at.x + BEACON_LENS.x, y: at.y + BEACON_LENS.y, z: at.z + BEACON_LENS.z };
}

/**
 * Where the truss rig's hung moving heads have their lenses (world units),
 * `count` of them spread along the batten from the outermost in; none for a
 * scene without the rig.
 */
export function movingHeadLenses(scene: Scene, count: number): Vec3[] {
  const rig = scene.pieces.find(
    (p) =>
      p.piece.size[1] === 0.6 &&
      p.piece === trussRig(p.piece.size[0] - RIG.over * 2, RIG.h, RIG.over),
  );
  if (!rig || count <= 0) return [];
  const span = rig.piece.size[0] - RIG.over * 2;
  const half = span / 2;
  const xs: number[] = [];
  for (let x = -half + 0.55, k = 0; x < half - 0.4; x += 0.6, k++) if (k % 4 === 2) xs.push(x);
  if (xs.length === 0) return [];
  const picked =
    count === 1
      ? [xs[Math.floor(xs.length / 2)] ?? 0]
      : Array.from(
          { length: Math.min(count, xs.length) },
          (_, i) =>
            xs[Math.round((i * (xs.length - 1)) / Math.max(1, Math.min(count, xs.length) - 1))] ??
            0,
        );
  return picked.map((x) =>
    placeOn(rig, { x, y: RIG.h - RIG.lensDrop, z: RIG.bz + RIG.lensForward }),
  );
}

/**
 * A moving head's swing at `timeMs` (radians, as the pivot's `rotation.z`):
 * up to `degrees` either side, once every `seconds`, beam `index` in mirror
 * of its neighbour.
 */
export function sweepAngle(
  timeMs: number,
  seconds: number,
  degrees: number,
  index: number,
): number {
  const phase = (timeMs / 1000 / seconds) * Math.PI * 2 + (index % 2) * Math.PI;
  return ((degrees * Math.PI) / 180) * Math.sin(phase);
}

/**
 * Where a sweeping beam ends (world units) from its lens at `at`, leaning
 * `lean` toward the camera and swung by `angle`: the lowest point it lights.
 */
export function sweepEnd(at: Vec3, length: number, lean: number, angle: number): Vec3 {
  // Down the cone's axis, tipped toward +z by `lean`, then swung about z by `angle`.
  const y = -Math.cos(lean) * length;
  const z = Math.sin(lean) * length;
  return {
    x: at.x - Math.sin(angle) * y,
    y: at.y + Math.cos(angle) * y,
    z: at.z + z,
  };
}

/**
 * How far up its slow chase the lamp `index` of `count` is at `timeMs`, in
 * [0, 1]: one smooth wave along the row every `seconds`.
 */
export function chaseLevel(timeMs: number, seconds: number, index: number, count: number): number {
  const phase = timeMs / 1000 / seconds - index / Math.max(1, count);
  return 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
}

/**
 * The beam's turn about the vertical at `timeMs` (radians, as `rotation.y`
 * of a beam along +x): `turns` whole turns a second, one way round.
 */
export function beaconAngle(timeMs: number, turns: number): number {
  return (((timeMs / 1000) * turns) % 1) * Math.PI * 2;
}

/** How squarely a beam at `angle` faces the camera (toward +z): 1 head on, 0 side-on and away. */
export function beaconFlare(angle: number): number {
  // Turned by `angle`, the beam points along (cos, 0, -sin).
  return Math.max(0, -Math.sin(angle)) ** 6;
}

/**
 * The beacon's beam: a flattened open cone from its tip at the lens out
 * along +x, bright at the tip and gone by its far end.
 */
function beamGeometry(reach: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.13, reach, 16, 4, true);
  // Tip at the origin, opening along +x, flatter than tall.
  g.translate(0, -reach / 2, 0)
    .rotateZ(Math.PI / 2)
    .scale(1, 0.55, 1);
  const position = g.getAttribute('position');
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const k = (1 - Math.min(1, Math.max(0, position.getX(i) / reach))) ** 2;
    colors.push(k, k, k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

/**
 * A moving head's beam: an open cone from its tip at the lens down along
 * −y, `radius` wide at its far end, brightest at the lens and gone by its end.
 */
function sweepBeamGeometry(length: number, radius: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(radius, length, 20, 6, true);
  // The cone's tip is at +length/2: put it at the origin, opening downward.
  g.translate(0, -length / 2, 0);
  const position = g.getAttribute('position');
  const colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const k = (1 - Math.min(1, Math.max(0, -position.getY(i) / length))) ** 1.5;
    colors.push(k, k, k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

/** A number in [0, 1) from an index and a salt. */
function unitOf(i: number, salt: number): number {
  const hash = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b);
  return ((Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d) >>> 0) % 10007) / 10007;
}

/** A soft round glow, white in the middle and gone at the edge, for halo sprites. */
function haloTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function putAt(obj: THREE.Object3D, p: Vec3): void {
  obj.position.set(p.x, p.y, p.z);
}

function vector(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z);
}
