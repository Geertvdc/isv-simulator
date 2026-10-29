import Phaser from 'phaser';
import type { ProfileAction } from './flow/flow';
import { loadIdentity, replaceUserId, setDisplayName, uuidFromBytes } from './flow/identity';
import { loadSave, mergeLevels, type StorageLike, writeSave } from './flow/save';
import { parseLag } from './net/lag';
import { REJOIN_KEY } from './net/rejoin';
import { createProfileApi, serverUrl, syncLevels } from './net/profileApi';
import { SCREEN_FADE_MS } from './sim/balance';
import { NO_WEBGL_TEXT } from './sim/content';
import { sceneById } from './sim/scenes';
import {
  DIALOG_CANCEL_EVENT,
  DIALOG_EVENT,
  FLOW_EVENT,
  type FlowView,
  GAME_FRAME_EVENT,
  GameScene,
  NET_STATS_EVENT,
  INTRO_GUIDE_EVENT,
  JOIN_CODE_EVENT,
  type JoinCodeInput,
  ONLINE_LEAVE_EVENT,
  ONLINE_RENAME_EVENT,
  PROFILE_ACTION_EVENT,
  ROSTER_EVENT,
  TILE_HOVER_EVENT,
  TOGGLE_SOUND_EVENT,
  type TicketStore,
} from './render/GameScene';
import { createThreeRoundRenderer } from './render/three/ThreeRoundRenderer';
import { createWorldMapRenderer } from './render/three/worldMap/WorldMapRenderer';
import { mountDemo } from './ui/demo';
import { mountGameHud } from './ui/game';
import { mountHud } from './ui/hud';
import { mountCountdown, mountIntro } from './ui/intro';
import { mountLevelSelect } from './ui/levelSelect';
import { mountJoinCode } from './ui/joinCode';
import { mountLobby } from './ui/lobby';
import { mountNetHud } from './ui/netHud';
import { mountOnlineBar, mountOnlineLobby } from './ui/onlineLobby';
import { mountProfile } from './ui/profile';
import { mountSoundToggle } from './ui/soundToggle';
import { mountCredits, mountPause, mountResults, mountSettings, mountTitle } from './ui/screens';
import './style.css';
import type { RosterCommand } from './flow/roster';
import { levelById } from './sim/levels';

function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

/** Whether this browser can draw the 3D office (three.js needs WebGL 2). */
function hasWebGL2(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

if (!hasWebGL2()) {
  const message = document.createElement('p');
  message.className = 'no-webgl';
  message.textContent = NO_WEBGL_TEXT;
  getElement('ui').append(message);
  throw new Error('No WebGL 2');
}

/** This tab's rejoin ticket in `sessionStorage` (survives a reload, not a new tab); quiet where storage throws. */
const tickets: TicketStore = {
  load: () => {
    try {
      return window.sessionStorage.getItem(REJOIN_KEY);
    } catch {
      return null;
    }
  },
  save: (text) => {
    try {
      if (text === null) window.sessionStorage.removeItem(REJOIN_KEY);
      else window.sessionStorage.setItem(REJOIN_KEY, text);
    } catch {
      // No session storage: a reload just doesn't rejoin.
    }
  },
  nowMs: () => Date.now(),
};

/** The browser's `localStorage`, or `null` where touching it throws. */
function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const params = new URLSearchParams(window.location.search);
const sceneId = params.get('scene');
const practiceLevel =
  import.meta.env.DEV && params.get('lab') === 'lab-roles' ? levelById('lab-roles') : undefined;
const shownScene = sceneId === null ? null : (sceneById(sceneId) ?? null);
if (sceneId !== null && !shownScene) console.warn(`No scene '${sceneId}'`);
// A scene never touches the save.
const storage = shownScene || practiceLevel ? null : browserStorage();
const save = loadSave(storage);

// Online identity: a random id kept in localStorage, shown under Settings → Online profile.
let identity = loadIdentity(storage, () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : uuidFromBytes(crypto.getRandomValues(new Uint8Array(16))),
);
const gameServerUrl = serverUrl(import.meta.env.VITE_SERVER_URL, window.location);
const profileApi = createProfileApi(gameServerUrl, (url, init) => fetch(url, init));
const scene = new GameScene({
  storage,
  save,
  // For testing: every level open, without touching the save.
  unlockAll: params.has('unlockAll'),
  scene: shownScene,
  practiceLevel,
  // `?demo`: a kiosk for a booth, bots play whenever nobody does.
  kiosk: !shownScene && params.has('demo'),
  roundRenderer: createThreeRoundRenderer,
  menuRenderer: createWorldMapRenderer,
  // A scene is a picture: it never goes online.
  online:
    shownScene || practiceLevel
      ? null
      : {
          serverUrl: gameServerUrl,
          identity: () => identity,
          // Dev tools: `?lag=100&jitter=20` simulates a slow network; `?nethud` shows the ping corner.
          lag: parseLag(params.get('lag'), params.get('jitter')),
          netHud: import.meta.env.DEV || params.has('nethud'),
          // `?predict=0`: no client-side prediction of your own player, to compare.
          predict: params.get('predict') !== '0',
          tickets,
        },
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: getElement('game'),
  // three.js draws the level on its own canvas under this one.
  transparent: true,
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
ui.style.setProperty('--screen-fade', `${SCREEN_FADE_MS}ms`);
const hud = mountHud(ui);
game.events.on(TILE_HOVER_EVENT, hud.setHover);
const gameHud = mountGameHud(ui);
game.events.on(GAME_FRAME_EVENT, gameHud.render);

const roster = (command: RosterCommand): void => {
  game.events.emit(ROSTER_EVENT, command);
};
const lobby = mountLobby(ui, roster);
const levelSelect = mountLevelSelect(ui);
const intro = mountIntro(ui, roster);
game.events.on(INTRO_GUIDE_EVENT, intro.toggleGuide);
const countdown = mountCountdown(ui);
const demo = mountDemo(ui);
const screens = {
  title: mountTitle(ui),
  paused: mountPause(ui),
  results: mountResults(ui),
  settings: mountSettings(ui),
  credits: mountCredits(ui),
} as const;
const joinInput = (input: JoinCodeInput): void => {
  game.events.emit(JOIN_CODE_EVENT, input);
};
const joinCode = mountJoinCode(ui, {
  onText: (text) => {
    joinInput({ type: 'text', text });
  },
  onSubmit: () => {
    joinInput({ type: 'submit' });
  },
  onCancel: () => {
    joinInput({ type: 'cancel' });
  },
});
const leaveOnline = { onLeave: () => game.events.emit(ONLINE_LEAVE_EVENT) };
/**
 * Picks a new display name: saved here, on the online profile, and (when in
 * a room) shown to everyone there. Answers why not, or `null` when it worked.
 */
function changeName(text: string): string | null {
  const change = setDisplayName(storage, identity, text);
  if (!change.ok) return change.reason;
  identity = change.identity;
  void syncProgress();
  game.events.emit(ONLINE_RENAME_EVENT, identity.displayName);
  return null;
}
const onlineLobby = mountOnlineLobby(ui, {
  roster,
  ...leaveOnline,
  yourName: () => identity.displayName,
  changeName,
  onDialog: (open) => game.events.emit(DIALOG_EVENT, open),
});
const onlineBar = mountOnlineBar(ui, leaveOnline);
const netHud = mountNetHud(ui);
game.events.on(NET_STATS_EVENT, netHud.render);
const soundToggle = mountSoundToggle(ui, () => {
  game.events.emit(TOGGLE_SOUND_EVENT);
});

const profile = mountProfile(ui, {
  identity: () => identity,
  changeId: (text) => {
    const change = replaceUserId(storage, identity, text);
    if (!change.ok) return change.reason;
    identity = change.identity;
    void syncProgress();
    return null;
  },
  changeName,
  onDialog: (open) => game.events.emit(DIALOG_EVENT, open),
});
game.events.on(PROFILE_ACTION_EVENT, (action: ProfileAction) => {
  profile.act(action);
});
game.events.on(DIALOG_CANCEL_EVENT, () => {
  profile.cancelDialog();
  onlineLobby.cancelDialog();
});

/**
 * Merges this browser's progress with the online profile, both ways. When the
 * server can't be reached nothing changes and the game plays on offline.
 */
async function syncProgress(): Promise<void> {
  // A scene (`?scene=`) never touches the save.
  if (!storage) return;
  profile.setServerStatus('syncing');
  const levels = await syncLevels(profileApi, identity, save.levels);
  profile.setServerStatus(levels ? 'online' : 'offline');
  if (!levels) return;
  // Merged again: a round may have finished while the request was out.
  save.levels = mergeLevels(save.levels, levels);
  writeSave(storage, save);
}
void syncProgress();

game.events.on(FLOW_EVENT, (view: FlowView) => {
  soundToggle.render(view.save.settings);
  const screen = view.flow.screen;
  // Online, the room's lobby has its own screen.
  lobby.render(screen === 'lobby' && !view.online ? view.flow.lobby : null);
  onlineLobby.render(view);
  onlineBar.render(view);
  joinCode.render(view);
  levelSelect.render(screen === 'levelSelect' ? view : null);
  intro.render(view);
  countdown.render(view);
  demo.render(view);
  for (const [name, mounted] of Object.entries(screens)) {
    mounted.render(name === screen ? view : null);
  }
  profile.render(screen === 'profile' ? view : null);
});
