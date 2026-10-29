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
import { NET_MAX_NAME_LENGTH } from '../sim/balance';
import { ONLINE_TEXT, WINDOW_FILES } from '../sim/content';
import { type Mounted, button, el, mountScreen } from './dom';
import { deviceLabel } from './lobby';
import { copyText } from './profile';
import type { ScreenView } from './screens';
import { statusBar } from './statusBar';
import { rolePanel, seatWindow, type RosterDispatch } from './roles';

export interface OnlineDeps {
  /** The Leave (or Back) button was clicked. */
  onLeave: () => void;
}

export interface OnlineLobbyDeps extends OnlineDeps {
  roster: RosterDispatch;
  /** This browser's display name. */
  yourName: () => string;
  /** Picks a new display name. Answers why not, or `null` when it worked. */
  changeName: (text: string) => string | null;
  /** The name box opened or closed: game keys pause while typing. */
  onDialog: (open: boolean) => void;
}

/** Can be closed from outside, e.g. by gamepad B. */
export interface OnlineLobbyView extends ScreenView, Mounted {
  cancelDialog: () => void;
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
  const { scope, unmount } = mountScreen(root, screen);

  const codeCard = el('div', 'online-code-card');
  codeCard.dataset.file = WINDOW_FILES.roomCode;
  const code = el('div', 'online-code');
  const copied = el('div', 'online-copied');
  const copy = button(
    scope,
    ONLINE_TEXT.copy,
    () => {
      const text = code.textContent;
      void copyText(text, code).then((ok) => {
        copied.textContent = ok ? ONLINE_TEXT.copied : ONLINE_TEXT.copyFailed;
      });
    },
    'online-copy',
  );
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
  scope.listen(nameInput, 'keydown', (event) => {
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
    button(scope, ONLINE_TEXT.changeName, openName, 'online-name-change'),
  );
  nameEdit.append(
    nameInput,
    button(scope, ONLINE_TEXT.saveName, saveName, 'online-name-save'),
    button(scope, ONLINE_TEXT.cancelName, closeName, 'online-name-cancel'),
    nameError,
  );
  nameEdit.hidden = true;
  nameRow.append(nameShow, nameEdit);

  const members = el('div', 'online-members');
  const slots = el('div', 'online-slots');
  const toolbar = el('div', 'online-toolbar');
  toolbar.append(codeCard, status, nameRow);
  const hint = el('div', 'lobby-hint');
  const leave = button(scope, ONLINE_TEXT.leave, deps.onLeave, 'online-leave');
  const keys = statusBar();
  const content = el('div', 'selection-layout');
  content.append(
    el('h1', 'screen-title online-title', ONLINE_TEXT.lobbyTitle),
    toolbar,
    members,
    slots,
    el('div', 'skill-legend', '1.00x = standard work speed · Review and builds unchanged'),
    hint,
    leave,
  );
  screen.append(content, keys);

  /** Redrawn only when the room changed, so the DOM isn't rebuilt every frame. */
  let drawn = '';
  let roles: ReturnType<typeof rolePanel>[] = [];

  return {
    unmount,
    cancelDialog: closeName,
    render: (view) => {
      const online = view?.online ?? null;
      screen.hidden = !online || !showsLobby(online);
      if (!online || screen.hidden) {
        for (const role of roles) role.render(null, 0, false, false);
        roles = [];
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
      if (online.setupError) status.textContent += ` · ${online.setupError}`;
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
      const key = JSON.stringify([list, online.flow?.lobby.selections]);
      if (key === drawn) return;
      drawn = key;
      for (const role of roles) role.render(null, 0, false, false);
      roles = [];
      slots.replaceChildren();
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
            // Whose seat it is and their controls, on the one line under `player-3.ts`.
            seatWindow(chip, player.playerId).textContent =
              `${member.displayName}${isYou ? ' · you' : ''} · ${deviceLabel(player.deviceId)}`;
            const role = rolePanel(chip, deps.roster);
            role.render(
              online.flow?.lobby ?? null,
              player.playerId,
              isYou && member.connected,
              false,
            );
            roles.push(role);
            slots.append(chip);
          }
          row.append(name, chips);
          return row;
        }),
      );
      for (let i = slots.children.length; i < 4; i++) {
        const empty = el('div', 'online-empty-slot', 'Enter or gamepad A to join');
        empty.prepend(el('div', 'online-player-name', 'Open seat'));
        slots.append(empty);
      }
    },
  };
}

/** The strip on top of the online screens other than the lobby. */
export function mountOnlineBar(root: HTMLElement, deps: OnlineDeps): ScreenView & Mounted {
  const bar = el('div', 'online-bar');
  bar.hidden = true;
  const room = el('span', 'online-bar-room');
  const waiting = el('span', 'online-bar-waiting');
  const away = el('span', 'online-bar-away');
  const banner = el('div', 'online-banner', ONLINE_TEXT.reconnectingBanner);
  banner.hidden = true;
  const { scope, unmount } = mountScreen(root, bar, banner);
  scope.add(() => {
    root.classList.remove('online-round', 'with-online-bar');
  });
  const leave = button(scope, ONLINE_TEXT.leave, deps.onLeave, 'online-bar-leave');
  bar.append(room, waiting, away, leave);
  return {
    unmount,
    render: (view) => {
      const online = view?.online ?? null;
      bar.hidden = !online || showsLobby(online);
      banner.hidden = bar.hidden || online?.status !== 'reconnecting';
      // The screens under it move down to make room.
      const screen = online?.flow?.screen;
      const inRound = screen === 'countdown' || screen === 'playing';
      root.classList.toggle('online-round', !!online && inRound);
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
