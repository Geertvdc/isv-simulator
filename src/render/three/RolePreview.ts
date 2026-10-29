import * as THREE from 'three';
import type { RoleId } from '../../sim/roles';
import { createDeveloperRig, poseDeveloperRig, type DeveloperRig } from './DeveloperRig';
import { kitMaterials } from './kit';
import { playerPose } from './pose';

/** One offscreen WebGL context serves all visible portrait canvases. */
export class RolePreviews {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly materials = kitMaterials();
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  private readonly rigs = new Map<HTMLCanvasElement, { id: number; rig: DeveloperRig }>();
  private frame = 0;

  constructor() {
    this.camera.position.set(1.7, 1.5, 3.6);
    this.camera.lookAt(0, 0.8, 0);
    this.camera.zoom = 1.35;
    this.camera.updateProjectionMatrix();
    this.scene.add(new THREE.HemisphereLight(0xfff3dd, 0x697b9a, 2.8));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(-2, 4, 5);
    this.scene.add(key);
  }

  show(canvas: HTMLCanvasElement, id: number, roleId: RoleId): void {
    const current = this.rigs.get(canvas);
    if (current?.id === id && current.rig.roleId === roleId) return;
    this.hide(canvas);
    this.rigs.set(canvas, { id, rig: createDeveloperRig(roleId, id, this.materials) });
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      this.renderer.setSize(240, 240);
      this.renderer.setClearColor(0, 0);
    }
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  hide(canvas: HTMLCanvasElement): void {
    const entry = this.rigs.get(canvas);
    if (entry) {
      for (const geometry of entry.rig.geometries) geometry.dispose();
      this.rigs.delete(canvas);
    }
    if (this.rigs.size === 0) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  private readonly draw = (time: number): void => {
    if (!this.renderer || this.rigs.size === 0) {
      this.frame = 0;
      return;
    }
    for (const [canvas, { id, rig }] of this.rigs) {
      poseDeveloperRig(
        rig,
        playerPose(
          {
            speed: 0,
            fullSpeed: 1,
            carrying: false,
            working: false,
            dashing: false,
            windUp: 0,
            shovedMs: null,
            phase: id,
            stride: 0,
          },
          time,
        ),
      );
      rig.root.rotation.y = Math.sin(time / 3000) * 0.22;
      this.scene.add(rig.root);
      this.renderer.render(this.scene, this.camera);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Role preview needs a 2D canvas');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(this.renderer.domElement, 0, 0, canvas.width, canvas.height);
      this.scene.remove(rig.root);
    }
    this.frame = requestAnimationFrame(this.draw);
  };
}

export const rolePreviews = new RolePreviews();
