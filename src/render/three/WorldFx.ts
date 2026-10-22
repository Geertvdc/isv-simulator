import * as THREE from 'three';
import type { LevelMap } from '../../sim/level';
import { type Pipeline, pipelineWarning } from '../../sim/pipeline';
import type { GameState, Vec } from '../../sim/state';
import { pipelinePulse } from '../effects';
import { type Vec3, gridToWorld } from '../projection';
import { blockHeight } from './layout';

const WARN_COLOR = 0xff3030;
const BROKEN_COLOR = 0x111317;
/** Dark, so it reads against light walls. */
const SMOKE_COLOR = 0x3a3d44;
const SPARK_COLOR = 0xffd166;
const RUG_COLOR = 0x8e6bd8;
const RUG_OPACITY = 0.35;
const RUG_OPACITY_INVITED = 0.6;
const RUG_PULSE_MS = 300;
const PUFF_COLOR = 0xd9d4c7;
const PUFF_COUNT = 4;
const PUFF_MS = 350;
/** How far shake moves the picture at intensity 1, as a share of the canvas height. */
const SHAKE_SCALE = 1;

interface PipelineFx {
  warn: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  broken: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  smoke: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[];
  sparks: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[];
}

interface Puff {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  from: THREE.Vector3;
  to: THREE.Vector3;
  startMs: number;
  /** Radius at the start; it grows as it fades. */
  size: number;
}

/**
 * Things in the 3D world that only show state or react to events: pipeline
 * warning glow, smoke and sparks on a broken pipeline, the meeting room rug,
 * dash puffs and screen shake.
 */
export class WorldFx {
  private readonly root = new THREE.Group();
  private readonly pipelines = new Map<string, PipelineFx>();
  private readonly rug: THREE.MeshBasicMaterial;
  private readonly puffs: Puff[] = [];
  private readonly puffGeometry = new THREE.SphereGeometry(1, 10, 8);
  private shake = { untilMs: 0, intensity: 0 };
  shakeEnabled = true;

  constructor(
    world: THREE.Scene,
    private readonly map: LevelMap,
  ) {
    world.add(this.root);
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

  /** Moves puffs along; returns this frame's shake offset in canvas pixels. */
  update(timeMs: number, canvas: { width: number; height: number }): { x: number; y: number } {
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
    const top = blockHeight(this.map, pipeline.x, pipeline.y);
    fx.smoke.forEach((puff, i) => {
      puff.visible = pipeline.broken;
      if (!pipeline.broken) return;
      // Smoke puffs drift up and fade.
      const phase = (t * 0.8 + i / 3) % 1;
      putAt(
        puff,
        gridToWorld(
          pipeline.x - 0.15 + i * 0.15,
          pipeline.y - phase * 0.2,
          top + 0.15 + phase * 0.8,
        ),
      );
      puff.scale.setScalar(0.1 + phase * 0.14);
      puff.material.opacity = 0.85 * (1 - phase * 0.8);
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
    const sparkGeometry = new THREE.BoxGeometry(0.26, 0.04, 0.04);
    const sparkMaterial = new THREE.MeshBasicMaterial({ color: SPARK_COLOR });
    const sparks = Array.from({ length: 4 }, () => {
      const mesh = new THREE.Mesh(sparkGeometry, sparkMaterial);
      this.root.add(mesh);
      return mesh;
    });
    return {
      warn: plate(WARN_COLOR, 0.5, 0.012),
      broken: plate(BROKEN_COLOR, 0.88, 0.011),
      smoke,
      sparks,
    };
  }
}

function putAt(obj: THREE.Object3D, p: Vec3): void {
  obj.position.set(p.x, p.y, p.z);
}

function vector(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z);
}
