/**
 * The join-code screen: four letter boxes, the error or "Joining…" line and
 * the keys. Keyboards type into a text box laid over the letters (pasting
 * works too); its key presses never reach the game, so typing E or W doesn't
 * pick or move anything. Gamepads turn the letters through the flow instead
 * (`updateFlow` on the `joinCode` screen), and the boxes show their cursor.
 */

import type { OnlineError } from '../flow/flow';
import { NET_JOIN_CODE_LENGTH } from '../sim/balance';
import { ONLINE_TEXT } from '../sim/content';
import { type Mounted, el, mountScreen } from './dom';
import { statusBar } from './statusBar';
import type { ScreenView } from './screens';

export interface JoinCodeDeps {
  /** The text box changed. */
  onText: (text: string) => void;
  /** Enter in the text box. */
  onSubmit: () => void;
  /** Esc in the text box. */
  onCancel: () => void;
}

export function mountJoinCode(root: HTMLElement, deps: JoinCodeDeps): ScreenView & Mounted {
  const screen = el('div', 'screen join-code-screen');
  screen.hidden = true;
  const boxes = el('div', 'join-code-boxes');
  const letters = Array.from({ length: NET_JOIN_CODE_LENGTH }, () => {
    const box = el('div', 'join-code-box');
    boxes.append(box);
    return box;
  });
  const input = document.createElement('input');
  input.className = 'join-code-input';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.autocapitalize = 'characters';
  input.setAttribute('aria-label', ONLINE_TEXT.joinPrompt);
  boxes.append(input);
  const status = el('div', 'join-code-status');
  screen.append(
    el('h1', 'screen-title', ONLINE_TEXT.joinTitle),
    el('div', 'join-code-prompt', ONLINE_TEXT.joinPrompt),
    boxes,
    status,
    statusBar(ONLINE_TEXT.joinCodeHint),
  );
  const { scope, unmount } = mountScreen(root, screen);

  scope.listen(input, 'keydown', (e) => {
    // Typing is for the box, never for the game.
    e.stopPropagation();
    if (e.key === 'Tab') e.preventDefault();
    if (e.repeat) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      deps.onSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      deps.onCancel();
    }
  });
  scope.listen(input, 'input', () => {
    deps.onText(input.value);
  });
  // A click anywhere on the screen puts the typing back in the box.
  scope.listen(screen, 'pointerdown', (e) => {
    if (e.target !== input) e.preventDefault();
    input.focus();
  });

  let shownError: OnlineError | null = null;

  return {
    unmount,
    render: (view) => {
      const visible = view?.flow.screen === 'joinCode';
      const wasHidden = screen.hidden;
      screen.hidden = !visible;
      if (!view || !visible) {
        if (!wasHidden) input.blur();
        return;
      }
      const entry = view.flow.joinCode;
      if (input.value !== entry.text) input.value = entry.text;
      input.readOnly = entry.busy;
      letters.forEach((box, i) => {
        box.textContent = entry.text[i] ?? '';
        box.classList.toggle('cursor', i === entry.cursor && !entry.busy);
      });
      status.textContent = entry.busy
        ? ONLINE_TEXT.joining
        : entry.error
          ? ONLINE_TEXT.errors[entry.error]
          : '';
      status.classList.toggle('error', !entry.busy && entry.error !== null);
      if (wasHidden || document.activeElement !== input) input.focus();
      // A refused code is picked, so typing the right one replaces it.
      if (entry.error !== shownError && entry.error !== null) input.select();
      shownError = entry.error;
    },
  };
}
