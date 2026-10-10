import type { Settings } from '../flow/save';
import { SOUND_TOGGLE_TITLE } from '../sim/content';

export interface SoundToggle {
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
  button.addEventListener('click', () => {
    onToggle();
  });
  root.append(button);

  return {
    render: (settings) => {
      button.textContent = settings.muted ? '🔇' : '🔊';
      const label = settings.muted ? SOUND_TOGGLE_TITLE.unmute : SOUND_TOGGLE_TITLE.mute;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.classList.toggle('muted', settings.muted);
    },
  };
}
