import type { Settings } from '../flow/save';
import { SOUND_TOGGLE_TITLE } from '../sim/content';
import { type Mounted, mountScreen } from './dom';

export interface SoundToggle extends Mounted {
  /** Shows the speaker for the current settings. */
  render: (settings: Settings) => void;
}

/** A speaker button in the top right corner that turns all sound and music off and on. */
export function mountSoundToggle(root: HTMLElement, onToggle: () => void): SoundToggle {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-toggle';
  // Not focusable: Enter and Space are game keys and must never click it.
  button.tabIndex = -1;
  const { scope, unmount } = mountScreen(root, button);
  scope.listen(button, 'click', () => {
    onToggle();
  });

  return {
    unmount,
    render: (settings) => {
      button.textContent = settings.muted ? '🔇' : '🔊';
      const label = settings.muted ? SOUND_TOGGLE_TITLE.unmute : SOUND_TOGGLE_TITLE.mute;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.classList.toggle('muted', settings.muted);
    },
  };
}
