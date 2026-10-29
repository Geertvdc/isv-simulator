import type { DeviceId } from '../input/controller';
import { isGamepadDevice } from '../input/gamepad';
import { KEY_SCHEMES, LEFT_KEYS, RIGHT_KEYS } from '../input/keyboard';
import type { Lobby } from '../input/lobby';
import { playerCssColor } from '../render/playerColors';
import { playerBadge } from './playerBadge';
import { statusBar } from './statusBar';
import { LOBBY_BACK_HINT, playerFile } from '../sim/content';
import { MAX_PLAYERS } from '../sim/level';
import { rolePanel, type RosterDispatch } from './roles';

export interface LobbyView {
  /** Shows the lobby, or hides it for `null` (the game has started). */
  render: (lobby: Lobby | null) => void;
}

export function deviceLabel(deviceId: DeviceId): string {
  if (deviceId === LEFT_KEYS.deviceId) return 'Keyboard: WASD, E, Q, left Shift';
  if (deviceId === RIGHT_KEYS.deviceId) return 'Keyboard: arrows, right Shift, /, right Alt';
  if (isGamepadDevice(deviceId)) return `Gamepad ${Number(deviceId.slice(4)) + 1}`;
  return deviceId;
}

/** How player 1 starts the game, matching `updateLobby`. */
export function startHint(lobby: Lobby): string | null {
  const first = lobby.players[0];
  if (!first) return null;
  if (isGamepadDevice(first.deviceId)) return 'Player 1: press A on your gamepad to start';
  const keyboardsFull = KEY_SCHEMES.every((s) =>
    lobby.players.some((p) => p.deviceId === s.deviceId),
  );
  const button = first.deviceId === LEFT_KEYS.deviceId ? 'E' : 'right Shift';
  return `Player 1: press ${button}${keyboardsFull ? ' or Enter' : ''} to start`;
}

export function mountLobby(root: HTMLElement, dispatch: RosterDispatch): LobbyView {
  const panel = document.createElement('div');
  panel.className = 'screen lobby';
  panel.hidden = true;

  const title = document.createElement('h1');
  title.className = 'lobby-title';
  title.textContent = 'Choose your crew';

  const slots = document.createElement('div');
  slots.className = 'lobby-slots';
  const slotEls = Array.from({ length: MAX_PLAYERS }, () => {
    const slot = document.createElement('div');
    slot.className = 'lobby-slot';
    const name = document.createElement('div');
    name.className = 'lobby-slot-name';
    const label = document.createElement('span');
    const device = document.createElement('div');
    device.className = 'lobby-slot-device';
    name.append(playerBadge(slots.children.length + 1), label);
    slot.append(name, device);
    slots.append(slot);
    const role = rolePanel(slot, dispatch);
    return { slot, name: label, device, role };
  });

  const hint = document.createElement('div');
  hint.className = 'lobby-hint';

  const back = statusBar(LOBBY_BACK_HINT);

  const content = document.createElement('div');
  content.className = 'selection-layout';
  const legend = document.createElement('div');
  legend.className = 'skill-legend';
  legend.textContent = '1.00x = standard work speed · Review and builds unchanged';
  content.append(title, slots, legend, hint);
  panel.append(content, back);
  root.append(panel);

  return {
    render: (lobby) => {
      panel.hidden = lobby === null;
      slotEls.forEach((el, i) => {
        const player = lobby?.players[i];
        el.role.render(player ? lobby : null, i + 1, true, false);
        if (!lobby) return;
        const id = i + 1;
        el.slot.classList.toggle('joined', player !== undefined);
        el.slot.style.setProperty('--player-color', playerCssColor(id));
        el.name.textContent = `Player ${id}`;
        el.slot.dataset.file = playerFile(id);
        el.device.textContent = player ? deviceLabel(player.deviceId) : 'Enter or gamepad A';
      });
      hint.textContent = lobby?.players.length
        ? `${startHint(lobby) ?? ''} · Left / right: role`
        : 'Enter or gamepad A to join · Left / right: choose role';
    },
  };
}
