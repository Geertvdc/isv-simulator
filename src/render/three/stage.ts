import { N8AOPostPass } from 'n8ao';
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import * as THREE from 'three';
import type { Graphics } from '../../flow/save';
import { type CameraPose, cameraPosition } from '../projection';
import { GLOW_BOOST_KEY } from './kit';
import {
  type FrameWatch,
  type Quality,
  createFrameWatch,
  startQuality,
  pixelRatioFor,
  rewarm,
  stepDown,
  watchFrame,
} from './quality';

/** Behind the diorama: the same dark blue as the menus. */
export const BACKGROUND = 0x14161c;
const EXPOSURE = 0.95;

/** Ambient occlusion: soft dark in corners, under counters and around feet, in world units. */
const AO = { radius: 0.8, falloff: 0.5, intensity: 3.5 };
/**
 * Bloom only catches what is brighter than white: screens and LEDs, drawn
 * unlit at 2–3× their color (see `GLOW_BOOST`). Lit white surfaces stay under it.
 */
const BLOOM = { threshold: 1.05, smoothing: 0.1, intensity: 0.5 };
/** Sun shadow map size per quality. */
const SHADOW_MAP = { high: 2048, medium: 2048, low: 1024 } as const;

/** `?quality=`, which overrides the Graphics setting. */
function qualityParam(): string | null {
  return new URLSearchParams(window.location.search).get('quality');
}

/**
 * The one WebGL canvas for the whole game, under Phaser's (transparent)
 * canvas. Kept across scene restarts: browsers allow only a few WebGL
 * contexts, so levels swap their `THREE.Scene` and keep this. On `high`
 * and `medium` quality it draws through a post-processing chain (ambient
 * occlusion, bloom, tone mapping, then SMAA); on `low` straight to the
 * canvas with MSAA.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera();
  private size = { width: 0, height: 0 };
  private quality: Quality;
  private frames: FrameWatch;
  /** The Graphics setting last applied; `null` until `setGraphics` runs. */
  private graphics: Graphics | null = null;
  private composer: { scene: THREE.Scene; composer: EffectComposer } | null = null;
  /** The level last drawn, to set it up for the quality when a new one comes. */
  private scene: THREE.Scene | null = null;
  private lastFrameMs: number | null = null;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      // MSAA for low, where nothing else smooths edges.
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(BACKGROUND);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMappingExposure = EXPOSURE;
    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    // Under Phaser's canvas, which draws overlays, fades and takes the pointer. A
    // positioned canvas would paint over Phaser's static one whatever the DOM
    // order; `#game` is fixed, so z-index -1 stays inside it.
    canvas.style.zIndex = '-1';
    parent.prepend(canvas);
    const start = startQuality('auto', qualityParam());
    this.quality = start.quality;
    this.frames = createFrameWatch(start.watch);
    this.applyQuality();
  }

  get currentQuality(): Quality {
    return this.quality;
  }

  /** Applies the Graphics setting: a fixed quality, or `auto` from high down. */
  setGraphics(graphics: Graphics): void {
    if (graphics === this.graphics) return;
    this.graphics = graphics;
    const start = startQuality(graphics, qualityParam());
    this.frames = createFrameWatch(start.watch);
    this.setQuality(start.quality);
  }

  /** Switches quality for the canvas and the level on it. */
  setQuality(quality: Quality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.applyQuality();
    if (this.scene) this.prepare(this.scene);
    rewarm(this.frames);
  }

  /** Matches the canvas to the game size in CSS pixels. */
  resize(width: number, height: number): void {
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    this.applyPixelRatio();
    this.composer?.composer.setSize(width, height, false);
    const canvas = this.renderer.domElement;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  setPose(pose: CameraPose): void {
    applyPose(this.camera, pose);
  }

  render(scene: THREE.Scene, deltaMs: number): void {
    if (scene !== this.scene) {
      this.scene = scene;
      this.prepare(scene);
      // A new level compiles new shaders: judge its frames after a warm-up of its own.
      rewarm(this.frames);
    }
    this.watch();
    if (this.quality === 'low') {
      this.renderer.render(scene, this.camera);
      return;
    }
    if (this.composer?.scene !== scene) this.buildComposer(scene);
    this.composer?.composer.render(deltaMs / 1000);
  }

  /** Drops the post-processing chain of a level that is gone. */
  forget(scene: THREE.Scene): void {
    if (this.scene === scene) this.scene = null;
    if (this.composer?.scene !== scene) return;
    this.composer.composer.dispose();
    this.composer = null;
  }

  /** Times frames with the wall clock (Phaser's delta is smoothed and capped) and steps quality down when they stay slow. */
  private watch(): void {
    const now = performance.now();
    const last = this.lastFrameMs;
    this.lastFrameMs = now;
    if (last === null || !watchFrame(this.frames, now - last)) return;
    const next = stepDown(this.quality);
    if (next) this.setQuality(next);
  }

  /** Sets a level's lights and materials up for the current quality. */
  private prepare(scene: THREE.Scene): void {
    const size = SHADOW_MAP[this.quality];
    scene.traverse((obj) => {
      if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
        if (obj.shadow.mapSize.x !== size) {
          obj.shadow.mapSize.set(size, size);
          obj.shadow.map?.dispose();
          obj.shadow.map = null;
        }
      }
      if (obj instanceof THREE.Mesh) {
        for (const m of [obj.material as THREE.Material | THREE.Material[]].flat()) {
          // Tone mapping moves between the renderer and the post chain.
          m.needsUpdate = true;
          const boost: unknown = m.userData[GLOW_BOOST_KEY];
          if (typeof boost === 'number' && m instanceof THREE.MeshBasicMaterial) {
            m.color.setScalar(this.quality === 'low' ? 1 : boost);
          }
        }
      }
    });
  }

  private applyPixelRatio(): void {
    const { width, height } = this.size;
    this.renderer.setPixelRatio(
      pixelRatioFor(this.quality, window.devicePixelRatio, width, height),
    );
    if (width > 0) this.renderer.setSize(width, height, false);
  }

  private applyQuality(): void {
    const post = this.quality !== 'low';
    this.applyPixelRatio();
    // With post-processing, tone mapping is an effect in the chain.
    this.renderer.toneMapping = post ? THREE.NoToneMapping : THREE.NeutralToneMapping;
    if (this.composer) {
      this.composer.composer.dispose();
      this.composer = null;
    }
  }

  private buildComposer(scene: THREE.Scene): void {
    this.composer?.composer.dispose();
    const { width, height } = this.size;
    const composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 0,
    });
    composer.addPass(new RenderPass(scene, this.camera));
    const ao = new N8AOPostPass(scene, this.camera, width, height);
    ao.configuration.aoRadius = AO.radius;
    ao.configuration.distanceFalloff = AO.falloff;
    ao.configuration.intensity = AO.intensity;
    ao.configuration.halfRes = true;
    ao.configuration.gammaCorrection = false;
    ao.configuration.transparencyAware = true;
    ao.setQualityMode('Low');
    composer.addPass(ao);
    composer.addPass(
      new EffectPass(
        this.camera,
        new BloomEffect({
          luminanceThreshold: BLOOM.threshold,
          luminanceSmoothing: BLOOM.smoothing,
          intensity: BLOOM.intensity,
          mipmapBlur: true,
        }),
        new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      ),
    );
    // SMAA finds edges in the final, tone-mapped picture.
    composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
    composer.setSize(width, height, false);
    this.composer = { scene, composer };
  }
}

/**
 * Points `cam` along `pose`, its principal point shifted off the canvas
 * center like the pose says, so it draws exactly what `projectPoint` computes.
 */
export function applyPose(cam: THREE.PerspectiveCamera, pose: CameraPose): void {
  const { width, height } = pose.viewport;
  const p = cameraPosition(pose);
  cam.position.set(p.x, p.y, p.z);
  cam.up.set(0, 1, 0);
  cam.lookAt(pose.target.x, pose.target.y, pose.target.z);
  cam.fov = (pose.fov * 180) / Math.PI;
  cam.aspect = width / height;
  cam.near = 0.5;
  cam.far = pose.distance * 4 + 50;
  cam.setViewOffset(
    width,
    height,
    width / 2 - pose.principal.x,
    height / 2 - pose.principal.y,
    width,
    height,
  );
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
}

let stage: Stage | null = null;

/** The game's stage, made on first use inside `parent` (the `#game` element). */
export function getStage(parent: HTMLElement): Stage {
  stage ??= new Stage(parent);
  return stage;
}

/** Frees every geometry, material, texture and shadow map under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (obj instanceof THREE.Light) obj.dispose();
    // Instance matrices and colors live in their own GPU buffers.
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite || obj instanceof THREE.Line) {
      (obj.geometry as THREE.BufferGeometry).dispose();
      const m = obj.material as THREE.Material | THREE.Material[];
      for (const mat of Array.isArray(m) ? m : [m]) materials.add(mat);
    }
  });
  for (const mat of materials) {
    for (const value of Object.values(mat)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    mat.dispose();
  }
}
