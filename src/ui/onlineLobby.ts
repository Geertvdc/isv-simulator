/**
 * The online screens drawn from the server's messages (`FlowView.online`):
 *
 * - the online lobby: the join code (big, with Copy), everyone in the room
 *   with a host badge and their couch players in player colors and hats,
 *   the connection status, what to press, and Leave. It also shows while
 *   connecting and when the room closed, with the reason.
 * - the online bar on every other online screen: the room code, the
 *   connection, "Host is choosing a level" for guests on the host's screens,
 *   who is reconnecting, "you're watching" for someone without a player in
 *   the round, and Leave. During a round it moves to the bottom left, out of
 *   the orders' way.
 * - a banner over everything while this browser reconnects.
 */

import {
  type OnlineState,
  canJoinNextRound,
  hostIsChoosing,
  isOnlineHost,
  isSpectating,
  membersWithPlayers,
  reconnectingMembers,
} from '../flow/online';
import { playerCssColor } from '../render/playerColors';
import { NET_MAX_NAME_LENGTH } from '../sim/balance';
import { ONLINE_TEXT, WINDOW_FILES } from '../sim/content';
import { el } from './dom';
import { statusBar } from './statusBar';
import { deviceLabel } from './lobby';
import { playerBadge } from './playerBadge';
import { copyText } from './profile';
import type { ScreenView } from './screens';

export interface OnlineDeps {
  /** The Leave (or Back) button was clicked. */
  onLeave: () => void;
}

export interface OnlineLobbyDeps extends OnlineDeps {
  /** This browser's display name. */
  yourName: () => string;
  /** Picks a new display name. Answers why not, or `null` when it worked. */
  changeName: (text: string) => string | null;
  /** The name box opened or closed: game keys pause while typing. */
  onDialog: (open: boolean) => void;
}

/** Can be closed from outside, e.g. by gamepad B. */
export interface OnlineLobbyView extends ScreenView {
  cancelDialog: () => void;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `profile-button ${className}`;
  node.textContent = text;
  node.addEventListener('click', onClick);
  return node;
}

function statusText(online: OnlineState): string {
  if (online.status === 'closed' && online.error) return ONLINE_TEXT.errors[online.error];
  return ONLINE_TEXT.status[online.status];
}

/**
 * Whether the lobby panel is the screen to show (rather than the server's
 * other screens). While reconnecting, the screen it was on stays (with the
 * banner on top).
 */
function showsLobby(online: OnlineState): boolean {
  const up = online.status === 'connected' || online.status === 'reconnecting';
  return !up || online.flow === null || online.flow.screen === 'lobby';
}

/** "Grace reconnecting…", for everyone else whose connection dropped. */
function awayText(online: OnlineState): string {
  return reconnectingMembers(online)
    .map((m) => `${m.displayName} ${ONLINE_TEXT.memberReconnecting}`)
    .join(' · ');
}

/** What to press now, under the members. */
function lobbyHint(online: OnlineState): string {
  const mine = membersWithPlayers(online).find((m) => m.isYou);
  if (!mine || mine.players.length === 0) return ONLINE_TEXT.joinPlayerHint;
  return isOnlineHost(online) ? ONLINE_TEXT.hostStartHint : ONLINE_TEXT.guestWaitHint;
}

export function mountOnlineLobby(root: HTMLElement, deps: OnlineLobbyDeps): OnlineLobbyView {
  const screen = el('div', 'screen online-lobby');
  screen.hidden = true;

  const codeCard = el('div', 'online-code-card');
  codeCard.dataset.file = WINDOW_FILES.roomCode;
  const code = el('div', 'online-code');
  const copied = el('div', 'online-copied');
  const copy = button('online-copy', ONLINE_TEXT.copy, () => {
    const text = code.textContent;
    void copyText(text, code).then((ok) => {
      copied.textContent = ok ? ONLINE_TEXT.copied : ONLINE_TEXT.copyFailed;
    });
  });
  codeCard.append(el('div', 'profile-label', ONLINE_TEXT.codeLabel), code, copy, copied);

  const status = el('div', 'online-status');

  // Your name: shown with a Change button, or as a text box while editing.
  const nameRow = el('div', 'online-name');
  const nameValue = el('span', 'online-name-value');
  const nameShow = el('div', 'online-name-show');
  const nameEdit = el('div', 'online-name-edit');
  const nameInput = document.createElement('input');
  nameInput.className = 'profile-input online-name-input';
  nameInput.spellcheck = false;
  nameInput.autocomplete = 'off';
  nameInput.maxLength = NET_MAX_NAME_LENGTH;
  const nameError = el('div', 'profile-dialog-error online-name-error');
  let editing = false;

  const closeName = (): void => {
    if (!editing) return;
    editing = false;
    nameEdit.hidden = true;
    nameShow.hidden = false;
    nameInput.blur();
    deps.onDialog(false);
  };
  const openName = (): void => {
    editing = true;
    nameInput.value = deps.yourName();
    nameError.textContent = '';
    nameShow.hidden = true;
    nameEdit.hidden = false;
    deps.onDialog(true);
    nameInput.focus();
    nameInput.select();
  };
  const saveName = (): void => {
    const problem = deps.changeName(nameInput.value);
    if (problem) {
      nameError.textContent = problem;
      return;
    }
    nameValue.textContent = deps.yourName();
    closeName();
  };
  nameInput.addEventListener('keydown', (event) => {
    // Typing must not reach the game (E, Esc and Enter mean something there).
    event.stopPropagation();
    if (event.repeat) return;
    // Without preventDefault Chrome also runs Esc's own action (stop loading).
    if (event.key === 'Enter') {
      event.preventDefault();
      saveName();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeName();
    }
  });
  nameShow.append(
    el('span', 'profile-label', ONLINE_TEXT.nameLabel),
    nameValue,
    button('online-name-change', ONLINE_TEXT.changeName, openName),
  );
  nameEdit.append(
    nameInput,
    button('online-name-save', ONLINE_TEXT.saveName, saveName),
    button('online-name-cancel', ONLINE_TEXT.cancelName, closeName),
    nameError,
  );
  nameEdit.hidden = true;
  nameRow.append(nameShow, nameEdit);

  const members = el('div', 'online-members');
  const hint = el('div', 'lobby-hint');
  const leave = button('online-leave', ONLINE_TEXT.leave, deps.onLeave);
  const keys = statusBar();
  screen.append(
    el('h1', 'screen-title online-title', ONLINE_TEXT.lobbyTitle),
    codeCard,
    status,
    nameRow,
    members,
    hint,
    leave,
    keys,
  );
  root.append(screen);

  /** Redrawn only when the room changed, so the DOM isn't rebuilt every frame. */
  let drawn = '';

  return {
    cancelDialog: closeName,
    render: (view) => {
      const online = view?.online ?? null;
      screen.hidden = !online || !showsLobby(online);
      if (!online || screen.hidden) {
        drawn = '';
        copied.textContent = '';
        closeName();
        return;
      }
      const closed = online.status === 'closed';
      nameRow.hidden = closed;
      if (closed) closeName();
      if (!editing) nameValue.textContent = deps.yourName();
      codeCard.hidden = online.joinCode === null;
      code.textContent = online.joinCode ?? '';
      status.textContent = statusText(online);
      status.dataset.status = online.status;
      hint.textContent = online.status === 'connected' && online.flow ? lobbyHint(online) : '';
      leave.textContent = closed ? ONLINE_TEXT.back : ONLINE_TEXT.leave;
      keys.textContent = closed
        ? ONLINE_TEXT.closedHint
        : online.leaveArmedAtMs !== null
          ? ONLINE_TEXT.leaveConfirmHint
          : ONLINE_TEXT.leaveHint;
      keys.classList.toggle('armed', !closed && online.leaveArmedAtMs !== null);

      const list = membersWithPlayers(online);
      const key = JSON.stringify(list);
      if (key === drawn) return;
      drawn = key;
      members.replaceChildren(
        ...list.map(({ member, isYou, players }) => {
          const row = el('div', 'online-member');
          row.classList.toggle('you', isYou);
          row.classList.toggle('away', !member.connected);
          const name = el('div', 'online-member-name', member.displayName);
          if (isYou) name.append(el('span', 'online-you', ` ${ONLINE_TEXT.you}`));
          if (member.isHost) name.append(el('span', 'online-host', ONLINE_TEXT.host));
          if (!member.connected) {
            name.append(el('span', 'online-away', ONLINE_TEXT.memberReconnecting));
          }
          const chips = el('div', 'online-players');
          if (players.length === 0)
            chips.append(el('div', 'online-no-players', ONLINE_TEXT.noPlayers));
          for (const player of players) {
            const chip = el('div', 'online-player');
            chip.style.setProperty('--player-color', playerCssColor(player.playerId));
            chip.append(
              playerBadge(player.playerId),
              el('span', 'online-player-name', `Player ${player.playerId}`),
              el('span', 'online-player-device', deviceLabel(player.deviceId)),
            );
            chips.append(chip);
          }
          row.append(name, chips);
          return row;
        }),
      );
    },
  };
}

/** The strip on top of the online screens other than the lobby. */
export function mountOnlineBar(root: HTMLElement, deps: OnlineDeps): ScreenView {
  const bar = el('div', 'online-bar');
  bar.hidden = true;
  const room = el('span', 'online-bar-room');
  const waiting = el('span', 'online-bar-waiting');
  const away = el('span', 'online-bar-away');
  const leave = button('online-bar-leave', ONLINE_TEXT.leave, deps.onLeave);
  bar.append(room, waiting, away, leave);
  const banner = el('div', 'online-banner', ONLINE_TEXT.reconnectingBanner);
  banner.hidden = true;
  root.append(bar, banner);
  return {
    render: (view) => {
      const online = view?.online ?? null;
      bar.hidden = !online || showsLobby(online);
      banner.hidden = bar.hidden || online?.status !== 'reconnecting';
      // The screens under it move down to make room.
      const screen = online?.flow?.screen;
      const inRound = screen === 'countdown' || screen === 'playing';
      root.classList.toggle('with-online-bar', !bar.hidden && !inRound);
      bar.classList.toggle('in-round', inRound);
      if (!online || bar.hidden) return;
      room.textContent = `${ONLINE_TEXT.roomLabel} ${online.joinCode ?? ''} · ${statusText(online)}`;
      const text =
        hostIsChoosing(online) && screen !== undefined && screen in ONLINE_TEXT.waiting
          ? ONLINE_TEXT.waiting[screen as keyof typeof ONLINE_TEXT.waiting]
          : isSpectating(online)
            ? ONLINE_TEXT.spectating
            : '';
      const join = canJoinNextRound(online) ? ONLINE_TEXT.joinNextRound : '';
      waiting.textContent = [text, join].filter((t) => t !== '').join(' · ');
      waiting.hidden = waiting.textContent === '';
      away.textContent = awayText(online);
      away.hidden = away.textContent === '';
    },
  };
}
