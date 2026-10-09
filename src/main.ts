import Phaser from 'phaser';
import { GameScene, TILE_HOVER_EVENT } from './render/GameScene';
import { mountHud } from './ui/hud';
import './style.css';

function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: getElement('game'),
  backgroundColor: '#14161c',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
    // WebGL fails on a 0x0 framebuffer (e.g. booting in a hidden or collapsed view).
    min: { width: 320, height: 240 },
  },
  scene: [GameScene],
});

const hud = mountHud(getElement('ui'));
game.events.on(TILE_HOVER_EVENT, hud.setHover);
