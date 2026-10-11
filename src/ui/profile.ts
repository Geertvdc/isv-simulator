/**
 * The online profile screen (Settings → Online profile): this browser's user
 * id with Copy, the display name, and a small dialog to type a new name or
 * paste an id from another browser. The menu runs in the flow like every
 * other screen; the flow's `profileAction` effects arrive here as `act`.
 *
 * Typing needs a keyboard. While the dialog is open its key presses never
 * reach the game (keydown stops at the dialog) and the scene holds back
 * menu presses; a gamepad's back button cancels it (`cancelDialog`).
 */

import { type MenuItem, type ProfileAction, menuItems } from '../flow/flow';
import { type Identity, normalizeUserId } from '../flow/identity';
import type { FlowView } from '../render/GameScene';
import { MENU_HINT, MENU_LABELS, PROFILE_TEXT } from '../sim/content';
import { el } from './dom';
import { createMenu } from './menu';
import type { ScreenView } from './screens';

export type ServerStatus = 'syncing' | 'online' | 'offline';

export interface ProfileDeps {
  identity: () => Identity;
  /** Switches to a pasted id. Answers why not, or `null` when it worked. */
  changeId: (text: string) => string | null;
  /** Picks a display name. Answers why not, or `null` when it worked. */
  changeName: (text: string) => string | null;
  /** Tells the game the dialog opened or closed. */
  onDialog: (open: boolean) => void;
}

export interface ProfileScreen extends ScreenView {
  /** Runs a line the flow picked on this screen. */
  act: (action: ProfileAction) => void;
  /** Closes the dialog without changing anything (a gamepad's back button). */
  cancelDialog: () => void;
  setServerStatus: (status: ServerStatus) => void;
}

const STATUS_TEXT: Record<ServerStatus, string> = {
  syncing: PROFILE_TEXT.serverSyncing,
  online: PROFILE_TEXT.serverOnline,
  offline: PROFILE_TEXT.serverOffline,
};

/** Copies with the clipboard API, or the old way where that isn't allowed (plain http on a LAN). */
async function copyText(text: string, selectable: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const range = document.createRange();
    range.selectNodeContents(selectable);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    try {
      // Deprecated, but the only way to copy outside a secure context.
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = 'profile-button';
  node.textContent = text;
  node.addEventListener('click', onClick);
  return node;
}

export function mountProfile(root: HTMLElement, deps: ProfileDeps): ProfileScreen {
  const screen = el('div', 'screen profile-screen');
  screen.hidden = true;
  root.append(screen);

  const card = el('div', 'profile-card');
  const idValue = el('div', 'profile-id');
  const nameValue = el('div', 'profile-name');
  card.append(
    el('div', 'profile-label', PROFILE_TEXT.idLabel),
    idValue,
    el('div', 'profile-label', PROFILE_TEXT.nameLabel),
    nameValue,
  );
  const status = el('div', 'profile-status');
  card.append(status);
  const server = el('div', 'profile-server');
  const menu = createMenu();
  const notes = el('div', 'profile-notes');
  notes.append(el('div', 'profile-about', PROFILE_TEXT.about), server);
  screen.append(
    el('h1', 'screen-title', PROFILE_TEXT.title),
    card,
    menu.root,
    notes,
    el('div', 'screen-hint', MENU_HINT),
  );

  // The dialog: a label, a text box, an error line and the keys.
  const dialog = el('div', 'profile-dialog');
  dialog.hidden = true;
  const dialogBox = el('div', 'profile-dialog-box');
  const prompt = el('div', 'profile-dialog-prompt');
  const input = document.createElement('input');
  input.className = 'profile-input';
  input.spellcheck = false;
  input.autocomplete = 'off';
  const error = el('div', 'profile-dialog-error');
  const dialogHint = el('div', 'profile-dialog-hint');
  const buttons = el('div', 'profile-dialog-buttons');
  buttons.append(
    button(PROFILE_TEXT.ok, () => {
      submit();
    }),
    button(PROFILE_TEXT.cancel, () => {
      close();
    }),
  );
  dialogBox.append(prompt, input, error, dialogHint, buttons);
  dialog.append(dialogBox);
  screen.append(dialog);

  let editing: 'changeName' | 'changeId' | null = null;
  /** For a new id: the checked id waiting for a second Enter. */
  let pendingId: string | null = null;
  let lastView: FlowView | null = null;

  const show = (): void => {
    const identity = deps.identity();
    idValue.textContent = identity.userId;
    nameValue.textContent = identity.displayName;
  };

  const say = (text: string): void => {
    status.textContent = text;
  };

  const open = (action: 'changeName' | 'changeId'): void => {
    editing = action;
    pendingId = null;
    prompt.textContent = action === 'changeName' ? PROFILE_TEXT.nameDialog : PROFILE_TEXT.idDialog;
    input.value = action === 'changeName' ? deps.identity().displayName : '';
    input.readOnly = false;
    input.classList.toggle('profile-input-id', action === 'changeId');
    error.textContent = '';
    dialogHint.textContent = PROFILE_TEXT.dialogHint;
    dialog.hidden = false;
    deps.onDialog(true);
    input.focus();
    input.select();
  };

  const close = (): void => {
    if (!editing) return;
    editing = null;
    pendingId = null;
    dialog.hidden = true;
    input.blur();
    deps.onDialog(false);
  };

  const submit = (): void => {
    if (editing === 'changeName') {
      const problem = deps.changeName(input.value);
      if (problem) {
        error.textContent = problem;
        return;
      }
      say(PROFILE_TEXT.nameChanged);
    } else if (editing === 'changeId') {
      if (pendingId === null) {
        // First Enter: check it, then ask to confirm.
        if (!normalizeUserId(input.value)) {
          error.textContent = PROFILE_TEXT.badId;
          return;
        }
        pendingId = input.value;
        input.readOnly = true;
        error.textContent = PROFILE_TEXT.idConfirm;
        dialogHint.textContent = PROFILE_TEXT.confirmHint;
        return;
      }
      const problem = deps.changeId(pendingId);
      if (problem) {
        pendingId = null;
        input.readOnly = false;
        error.textContent = problem;
        dialogHint.textContent = PROFILE_TEXT.dialogHint;
        return;
      }
      say(PROFILE_TEXT.idChanged);
    }
    close();
    show();
  };

  // Keys typed here are for the text box, never for the game.
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Tab') e.preventDefault();
    if (e.repeat) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  // The last complaint goes away once someone types again.
  input.addEventListener('input', () => {
    error.textContent = '';
  });

  return {
    render: (view) => {
      const wasHidden = screen.hidden;
      screen.hidden = view === null;
      lastView = view;
      if (!view) {
        close();
        return;
      }
      if (wasHidden) say('');
      show();
      const lines = menuItems(view.flow).map((item: MenuItem) => ({ label: MENU_LABELS[item] }));
      menu.render(lines, view.flow.menuIndex);
    },
    act: (action) => {
      if (!lastView) return;
      if (action === 'copyId') {
        void copyText(deps.identity().userId, idValue).then((ok) => {
          say(ok ? PROFILE_TEXT.copied : PROFILE_TEXT.copyFailed);
        });
        return;
      }
      open(action);
    },
    cancelDialog: close,
    setServerStatus: (next) => {
      server.textContent = STATUS_TEXT[next];
      server.dataset.status = next;
    },
  };
}
