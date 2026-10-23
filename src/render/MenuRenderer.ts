import type Phaser from 'phaser';
import type { Graphics } from '../flow/save';
import type { MenuView } from './menuView';

/**
 * What `GameScene` asks of the thing that draws the world map behind the
 * menus (`src/render/three/worldMap/`). One is made per scene start and
 * destroyed when the scene shuts down. Outside a round it draws instead of
 * the `RoundRenderer`: only one of the two draws on the stage in a frame.
 */
export interface MenuRenderer {
  /** What the map shows: the selected level, what is open, the stars. */
  syncMenu(view: MenuView): void;
  /** Draws the map; runs every frame the map is on screen. */
  render(timeMs: number, deltaMs: number): void;
  /** The Graphics setting from Settings. */
  setGraphics(graphics: Graphics): void;
  /** Frees what the renderer holds; `GameScene` calls it when the scene shuts down. */
  destroy(): void;
}

export type MenuRendererFactory = (scene: Phaser.Scene) => MenuRenderer;
