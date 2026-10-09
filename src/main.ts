import Phaser from 'phaser';
import {
  GAME_FRAME_EVENT,
  GameScene,
  LEVEL_SELECT_EVENT,
  LOBBY_EVENT,
  TILE_HOVER_EVENT,
} from './render/GameScene';
import { mountGameHud } from './ui/game';
import { mountHud } from './ui/hud';
import { mountLevelSelect } from './ui/levelSelect';
import { mountLobby } from './ui/lobby';
import { browserStorage } from './ui/progress';
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
const lobby = mountLobby(getElement('ui'));
game.events.on(LOBBY_EVENT, lobby.render);
const storage = browserStorage();
const gameHud = mountGameHud(getElement('ui'), storage);
game.events.on(GAME_FRAME_EVENT, gameHud.render);
const levelSelect = mountLevelSelect(getElement('ui'), storage);
game.events.on(LEVEL_SELECT_EVENT, levelSelect.render);
