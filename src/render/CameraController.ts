import Phaser from 'phaser';
import {
  CAMERA_PAN_SPEED,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  CAMERA_ZOOM_SENSITIVITY,
} from '../sim/balance';
import type { Point } from './iso';

export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Pan (drag with right/middle mouse or space + left, WASD/arrows) and
 * zoom (wheel, around the cursor) for the main camera. The view center is
 * kept inside `bounds` so the map can't be lost off screen.
 */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly keys: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key[]>;
  private readonly space: Phaser.Input.Keyboard.Key;
  private dragFrom: Point | null = null;

  constructor(
    scene: Phaser.Scene,
    private bounds: WorldRect,
  ) {
    this.camera = scene.cameras.main;
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is not available');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: [keyboard.addKey(K.W), keyboard.addKey(K.UP)],
      down: [keyboard.addKey(K.S), keyboard.addKey(K.DOWN)],
      left: [keyboard.addKey(K.A), keyboard.addKey(K.LEFT)],
      right: [keyboard.addKey(K.D), keyboard.addKey(K.RIGHT)],
    };
    this.space = keyboard.addKey(K.SPACE);

    scene.input.mouse?.disableContextMenu();
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
    });

    this.centerOn({
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    });
  }

  /** World point at the center of the view. */
  get viewCenter(): Point {
    return {
      x: this.camera.scrollX + this.camera.width / 2,
      y: this.camera.scrollY + this.camera.height / 2,
    };
  }

  /** Replaces the area the view center must stay in (e.g. after rotating). */
  setBounds(bounds: WorldRect): void {
    this.bounds = bounds;
    this.clamp();
  }

  /** True while a drag-pan is in progress (so hover/clicks can ignore it). */
  get isDragging(): boolean {
    return this.dragFrom !== null;
  }

  /**
   * World point under a screen point, computed from the current scroll and
   * zoom (Phaser's camera matrix only updates at render time).
   */
  screenToWorld(sx: number, sy: number): Point {
    const cam = this.camera;
    return {
      x: cam.scrollX + cam.width / 2 + (sx - cam.width / 2) / cam.zoom,
      y: cam.scrollY + cam.height / 2 + (sy - cam.height / 2) / cam.zoom,
    };
  }

  update(deltaMs: number): void {
    const held = (keys: Phaser.Input.Keyboard.Key[]) => keys.some((k) => k.isDown);
    const dx = Number(held(this.keys.right)) - Number(held(this.keys.left));
    const dy = Number(held(this.keys.down)) - Number(held(this.keys.up));
    if (dx === 0 && dy === 0) return;
    const step = (CAMERA_PAN_SPEED * deltaMs) / 1000 / this.camera.zoom;
    const norm = Math.hypot(dx, dy);
    this.scrollBy((dx / norm) * step, (dy / norm) * step);
  }

  centerOn(p: Point): void {
    this.camera.scrollX = p.x - this.camera.width / 2;
    this.camera.scrollY = p.y - this.camera.height / 2;
    this.clamp();
  }

  private scrollBy(dx: number, dy: number): void {
    this.camera.scrollX += dx;
    this.camera.scrollY += dy;
    this.clamp();
  }

  /** Keeps the view center inside the map bounds. */
  private clamp(): void {
    const cam = this.camera;
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, this.bounds.left, this.bounds.right);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height / 2, this.bounds.top, this.bounds.bottom);
    cam.scrollX = cx - cam.width / 2;
    cam.scrollY = cy - cam.height / 2;
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    const panButton =
      pointer.rightButtonDown() ||
      pointer.middleButtonDown() ||
      (pointer.leftButtonDown() && this.space.isDown);
    if (panButton) this.dragFrom = { x: pointer.x, y: pointer.y };
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.dragFrom) return;
    if (!pointer.isDown) {
      this.dragFrom = null;
      return;
    }
    const zoom = this.camera.zoom;
    this.scrollBy((this.dragFrom.x - pointer.x) / zoom, (this.dragFrom.y - pointer.y) / zoom);
    this.dragFrom = { x: pointer.x, y: pointer.y };
  };

  private readonly onPointerUp = (): void => {
    this.dragFrom = null;
  };

  private readonly onWheel = (
    pointer: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    deltaY: number,
  ): void => {
    const cam = this.camera;
    const anchor = this.screenToWorld(pointer.x, pointer.y);
    const zoom = Phaser.Math.Clamp(
      cam.zoom * Math.exp(-deltaY * CAMERA_ZOOM_SENSITIVITY),
      CAMERA_ZOOM_MIN,
      CAMERA_ZOOM_MAX,
    );
    cam.setZoom(zoom);
    // Scroll so the world point under the cursor stays under the cursor.
    cam.scrollX = anchor.x - cam.width / 2 - (pointer.x - cam.width / 2) / zoom;
    cam.scrollY = anchor.y - cam.height / 2 - (pointer.y - cam.height / 2) / zoom;
    this.clamp();
  };

  /** Keeps the same world point at the view center when the canvas resizes. */
  private readonly onResize = (
    gameSize: Phaser.Structs.Size,
    _base: unknown,
    _display: unknown,
    previousWidth: number,
    previousHeight: number,
  ): void => {
    this.scrollBy((previousWidth - gameSize.width) / 2, (previousHeight - gameSize.height) / 2);
  };
}
