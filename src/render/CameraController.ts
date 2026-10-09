import Phaser from 'phaser';
import {
  CAMERA_FIT_PADDING,
  CAMERA_ZOOM_MAX,
  CAMERA_ZOOM_MIN,
  CAMERA_ZOOM_SENSITIVITY,
} from '../sim/balance';
import { type WorldRect, fitCamera } from './cameraFit';
import type { Point } from './projection';

/**
 * Frames the whole level and refits whenever the canvas resizes. In debug
 * mode the camera can also be dragged with any mouse button and zoomed with
 * the wheel (around the cursor); leaving debug mode snaps back to the fit.
 * There is no keyboard panning: the keyboard belongs to the players.
 */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private dragFrom: Point | null = null;
  private debug = false;

  constructor(
    scene: Phaser.Scene,
    private readonly bounds: WorldRect,
  ) {
    this.camera = scene.cameras.main;

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

    this.fit();
  }

  /** Enables free pan and zoom; disabling it refits the level. */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
    this.dragFrom = null;
    if (!enabled) this.fit();
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

  private fit(): void {
    const { zoom, center } = fitCamera(
      this.bounds,
      { width: this.camera.width, height: this.camera.height },
      CAMERA_FIT_PADDING,
    );
    this.camera.setZoom(zoom);
    this.centerOn(center);
  }

  private centerOn(p: Point): void {
    this.camera.scrollX = p.x - this.camera.width / 2;
    this.camera.scrollY = p.y - this.camera.height / 2;
  }

  private scrollBy(dx: number, dy: number): void {
    this.camera.scrollX += dx;
    this.camera.scrollY += dy;
    this.clamp();
  }

  /** Keeps the view center inside the level so it can't be lost off screen. */
  private clamp(): void {
    const cam = this.camera;
    const cx = Phaser.Math.Clamp(cam.scrollX + cam.width / 2, this.bounds.left, this.bounds.right);
    const cy = Phaser.Math.Clamp(cam.scrollY + cam.height / 2, this.bounds.top, this.bounds.bottom);
    this.centerOn({ x: cx, y: cy });
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.debug) this.dragFrom = { x: pointer.x, y: pointer.y };
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
    if (!this.debug) return;
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

  /** Refits outside debug mode; in debug mode keeps the same world point centered. */
  private readonly onResize = (
    gameSize: Phaser.Structs.Size,
    _base: unknown,
    _display: unknown,
    previousWidth: number,
    previousHeight: number,
  ): void => {
    if (this.debug) {
      this.scrollBy((previousWidth - gameSize.width) / 2, (previousHeight - gameSize.height) / 2);
    } else {
      this.fit();
    }
  };
}
