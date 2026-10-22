import * as THREE from 'three';
import { type CameraPose, cameraPosition } from '../projection';

/** Behind the diorama: the same dark blue as the menus. */
export const BACKGROUND = 0x14161c;

/**
 * The one WebGL canvas for the whole game, under Phaser's (transparent)
 * canvas. Kept across scene restarts: browsers allow only a few WebGL
 * contexts, so levels swap their `THREE.Scene` and keep this.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera();
  private size = { width: 0, height: 0 };

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(BACKGROUND);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    // Under Phaser's canvas, which draws overlays, fades and takes the pointer.
    parent.prepend(canvas);
  }

  /** Matches the canvas to the game size in CSS pixels. */
  resize(width: number, height: number): void {
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    this.renderer.setSize(width, height, false);
    const canvas = this.renderer.domElement;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  /** Points the camera along `pose`, its principal point shifted off the canvas center like the pose says. */
  setPose(pose: CameraPose, shake: { x: number; y: number } = { x: 0, y: 0 }): void {
    const { width, height } = pose.viewport;
    const cam = this.camera;
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
      width / 2 - pose.principal.x - shake.x,
      height / 2 - pose.principal.y - shake.y,
      width,
      height,
    );
    cam.updateProjectionMatrix();
  }

  render(scene: THREE.Scene): void {
    this.renderer.render(scene, this.camera);
  }
}

let stage: Stage | null = null;

/** The game's stage, made on first use inside `parent` (the `#game` element). */
export function getStage(parent: HTMLElement): Stage {
  stage ??= new Stage(parent);
  return stage;
}

/** Frees every geometry, material and texture under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
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
