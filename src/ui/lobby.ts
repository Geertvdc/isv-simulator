import type { DeviceId } from '../input/controller';
import { isGamepadDevice } from '../input/gamepad';
import { KEY_SCHEMES, LEFT_KEYS, RIGHT_KEYS } from '../input/keyboard';
import type { Lobby } from '../input/lobby';
import { playerCssColor } from '../render/playerColors';
import { MAX_PLAYERS } from '../sim/level';

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

export function mountLobby(root: HTMLElement): LobbyView {
  const panel = document.createElement('div');
  panel.className = 'lobby';
  panel.hidden = true;

  const title = document.createElement('h1');
  title.className = 'lobby-title';
  title.textContent = 'Press Enter or gamepad A to join';

  const slots = document.createElement('div');
  slots.className = 'lobby-slots';
  const slotEls = Array.from({ length: MAX_PLAYERS }, () => {
    const slot = document.createElement('div');
    slot.className = 'lobby-slot';
    const name = document.createElement('div');
    name.className = 'lobby-slot-name';
    const device = document.createElement('div');
    device.className = 'lobby-slot-device';
    slot.append(name, device);
    slots.append(slot);
    return { slot, name, device };
  });

  const hint = document.createElement('div');
  hint.className = 'lobby-hint';

  panel.append(title, slots, hint);
  root.append(panel);

  return {
    render: (lobby) => {
      panel.hidden = lobby === null;
      if (!lobby) return;
      slotEls.forEach((el, i) => {
        const player = lobby.players[i];
        const id = i + 1;
        el.slot.classList.toggle('joined', player !== undefined);
        el.slot.style.setProperty('--player-color', playerCssColor(id));
        el.name.textContent = `Player ${id}`;
        el.device.textContent = player ? deviceLabel(player.deviceId) : 'Enter or gamepad A';
      });
      hint.textContent = startHint(lobby) ?? '';
    },
  };
}
