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
import { type CameraPose, cameraPosition } from '../projection';
import {
  type FrameWatch,
  type Quality,
  createFrameWatch,
  initialQuality,
  watchFrame,
} from './quality';

/** Behind the diorama: the same dark blue as the menus. */
export const BACKGROUND = 0x14161c;
const EXPOSURE = 0.95;

/** Ambient occlusion: soft dark in corners, under counters and around feet, in world units. */
const AO = { radius: 0.8, falloff: 0.5, intensity: 3.5 };
/** Only screens, LEDs and warning lights are bright enough to bloom. */
const BLOOM = { threshold: 0.85, smoothing: 0.2, intensity: 0.45 };

/**
 * The one WebGL canvas for the whole game, under Phaser's (transparent)
 * canvas. Kept across scene restarts: browsers allow only a few WebGL
 * contexts, so levels swap their `THREE.Scene` and keep this. On `high`
 * quality it draws through a post-processing chain (ambient occlusion,
 * bloom, SMAA, tone mapping); on `low` straight to the canvas.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera();
  private size = { width: 0, height: 0 };
  private quality: Quality;
  private readonly frames: FrameWatch;
  private composer: { scene: THREE.Scene; composer: EffectComposer } | null = null;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      // SMAA does the edges on high; MSAA on low, where it's the only anti-aliasing.
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(BACKGROUND);
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
    const start = initialQuality(new URLSearchParams(window.location.search).get('quality'));
    this.quality = start.quality;
    this.frames = createFrameWatch(start.watch);
    this.applyQuality();
  }

  get currentQuality(): Quality {
    return this.quality;
  }

  /** Switches quality; materials recompile for the shadow change. */
  setQuality(quality: Quality, scene: THREE.Scene | null): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.applyQuality();
    scene?.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      for (const m of [obj.material as THREE.Material | THREE.Material[]].flat()) {
        m.needsUpdate = true;
      }
    });
  }

  /** Matches the canvas to the game size in CSS pixels. */
  resize(width: number, height: number): void {
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    this.renderer.setSize(width, height, false);
    this.composer?.composer.setSize(width, height, false);
    const canvas = this.renderer.domElement;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  setPose(pose: CameraPose): void {
    applyPose(this.camera, pose);
  }

  render(scene: THREE.Scene, deltaMs: number): void {
    if (this.quality === 'low') {
      this.renderer.render(scene, this.camera);
      return;
    }
    if (this.composer?.scene !== scene) this.buildComposer(scene);
    this.composer?.composer.render(deltaMs / 1000);
  }

  /** Counts a frame; drops to low quality for good when frames stay slow. */
  watchFrame(deltaMs: number, scene: THREE.Scene): void {
    if (watchFrame(this.frames, deltaMs)) this.setQuality('low', scene);
  }

  /** Drops the post-processing chain of a level that is gone. */
  forget(scene: THREE.Scene): void {
    if (this.composer?.scene !== scene) return;
    this.composer.composer.dispose();
    this.composer = null;
  }

  private applyQuality(): void {
    const high = this.quality === 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1));
    if (this.size.width > 0) this.renderer.setSize(this.size.width, this.size.height, false);
    this.renderer.shadowMap.enabled = high;
    // On high, tone mapping is the last effect in the chain.
    this.renderer.toneMapping = high ? THREE.NoToneMapping : THREE.NeutralToneMapping;
    if (!high && this.composer) {
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
        new SMAAEffect(),
        new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
      ),
    );
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
