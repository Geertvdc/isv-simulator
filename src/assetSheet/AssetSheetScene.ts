import Phaser from 'phaser';
import type { SheetAsset } from './catalog';

export interface RenderedAsset {
  asset: SheetAsset;
  scale: number;
  png: Blob;
}

/**
 * Draws each asset alone on a transparent canvas, one per frame, and crops
 * its frame out of the canvas as a PNG.
 */
export class AssetSheetScene extends Phaser.Scene {
  constructor(
    private readonly assets: readonly SheetAsset[],
    private readonly exportScale: number,
    private readonly onDone: (rendered: RenderedAsset[]) => void,
  ) {
    super('asset-sheet');
  }

  create(): void {
    void this.renderAll();
  }

  private async renderAll(): Promise<void> {
    const rendered: RenderedAsset[] = [];
    for (const asset of this.assets) {
      const scale = asset.scale ?? this.exportScale;
      const { width, height, anchor } = asset.frame;
      this.children.removeAll(true);
      asset.draw(this);
      for (const child of this.children.list) {
        if (child instanceof Phaser.GameObjects.Text) child.setResolution(scale);
      }
      const camera = this.cameras.main;
      camera.setSize(width * scale, height * scale).setZoom(scale);
      camera.centerOn(width / 2 - anchor.x, height / 2 - anchor.y);
      await this.nextRender();
      rendered.push({ asset, scale, png: await this.crop(width * scale, height * scale) });
    }
    this.children.removeAll(true);
    this.onDone(rendered);
  }

  private nextRender(): Promise<void> {
    return new Promise((resolve) => {
      this.game.events.once(Phaser.Core.Events.POST_RENDER, () => {
        resolve();
      });
    });
  }

  private crop(width: number, height: number): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(this.game.canvas, 0, 0, width, height, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('PNG encoding failed'));
      }, 'image/png');
    });
  }
}
