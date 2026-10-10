import Phaser from 'phaser';
import { loadSave, type StorageLike } from './flow/save';
import {
  FLOW_EVENT,
  type FlowView,
  GAME_FRAME_EVENT,
  GameScene,
  TILE_HOVER_EVENT,
} from './render/GameScene';
import { mountGameHud } from './ui/game';
import { mountHud } from './ui/hud';
import { mountCountdown, mountIntro } from './ui/intro';
import { mountLevelSelect } from './ui/levelSelect';
import { mountLobby } from './ui/lobby';
import { mountCredits, mountPause, mountResults, mountSettings, mountTitle } from './ui/screens';
import './style.css';

function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

/** The browser's `localStorage`, or `null` where touching it throws. */
function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = browserStorage();
const scene = new GameScene({
  storage,
  save: loadSave(storage),
  // For testing: every level open, without touching the save.
  unlockAll: new URLSearchParams(window.location.search).has('unlockAll'),
});

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
  scene: [scene],
});

const ui = getElement('ui');
const hud = mountHud(ui);
game.events.on(TILE_HOVER_EVENT, hud.setHover);
const gameHud = mountGameHud(ui);
game.events.on(GAME_FRAME_EVENT, gameHud.render);

const lobby = mountLobby(ui);
const levelSelect = mountLevelSelect(ui);
const intro = mountIntro(ui);
const countdown = mountCountdown(ui);
const screens = {
  title: mountTitle(ui),
  paused: mountPause(ui),
  results: mountResults(ui),
  settings: mountSettings(ui),
  credits: mountCredits(ui),
} as const;
game.events.on(FLOW_EVENT, (view: FlowView) => {
  const screen = view.flow.screen;
  lobby.render(screen === 'lobby' ? view.flow.lobby : null);
  levelSelect.render(screen === 'levelSelect' ? view : null);
  intro.render(view);
  countdown.render(view);
  for (const [name, mounted] of Object.entries(screens)) {
    mounted.render(name === screen ? view : null);
  }
});
