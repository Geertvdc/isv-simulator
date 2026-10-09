/**
 * Dev-only page for auditioning sound effects: pick a game sound on the left,
 * browse the downloaded packs on the right, assign, and copy the choices for
 * `npm run sfx -- apply`. Open it at /tools/sound-picker/ on the dev server.
 */

import sourcesJson from '../../scripts/sfxSources.json';
import { SOUND_PACKS, type SoundSources } from '../../scripts/sfxPacks';
import {
  SOUND_DESCRIPTIONS,
  SOUND_KEYS,
  type SoundKey,
  soundUrl,
  soundVolume,
} from '../../src/render/sounds';

interface Candidate {
  pack: string;
  file: string;
  url: string;
}

const STORAGE_KEY = 'isv-simulator.sound-picks';

/** Candidates are listed pack by pack, in the order of `SOUND_PACKS`. */
function packOrder(id: string): number {
  return SOUND_PACKS.findIndex((p) => p.id === id);
}
const sources: SoundSources = sourcesJson;

const candidates: Candidate[] = Object.entries(
  import.meta.glob<string>('/sfx-candidates/*/Audio/*.ogg', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
)
  .map(([path, url]) => {
    const [, , pack = '', , file = ''] = path.split('/');
    return { pack, file, url };
  })
  .sort(
    (a, b) =>
      packOrder(a.pack) - packOrder(b.pack) ||
      a.file.localeCompare(b.file, 'en', { numeric: true }),
  );

function loadPicks(): SoundSources {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as SoundSources;
  } catch {
    return {};
  }
}

function savePicks(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
  } catch {
    // Picks just won't survive a reload.
  }
}

let picks = loadPicks();
let slot: SoundKey = SOUND_KEYS[0];
let filter = '';
let cursor = 0;
let playing: HTMLAudioElement | null = null;

function play(url: string, key: SoundKey = slot): void {
  playing?.pause();
  playing = new Audio(url);
  playing.volume = soundVolume(key);
  void playing.play();
}

function candidateUrl(pack: string, file: string): string | undefined {
  return candidates.find((c) => c.pack === pack && c.file === file)?.url;
}

/** What a slot sounds like now: its pick if any, else the file in the game. */
function slotUrl(key: SoundKey): string {
  const pick = picks[key];
  return (pick && candidateUrl(pick.pack, pick.file)) ?? `/${soundUrl(key)}`;
}

function visible(): Candidate[] {
  const q = filter.trim().toLowerCase();
  return q ? candidates.filter((c) => `${c.pack}/${c.file}`.toLowerCase().includes(q)) : candidates;
}

function unpick(key: SoundKey): void {
  picks = Object.fromEntries(Object.entries(picks).filter(([k]) => k !== key));
}

function assign(c: Candidate): void {
  const current = sources[slot];
  if (current?.pack === c.pack && current.file === c.file) unpick(slot);
  else picks = { ...picks, [slot]: { pack: c.pack, file: c.file } };
  savePicks();
  render();
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function button(text: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', className, text);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

const app = document.getElementById('app');
if (!app) throw new Error('Missing #app');
const slotsPanel = el('section', 'slots');
const browser = el('section', 'browser');
app.append(slotsPanel, browser);

const search = el('input');
search.type = 'search';
search.placeholder = 'Filter, e.g. impact, laser, click…';
search.addEventListener('input', () => {
  filter = search.value;
  cursor = 0;
  renderBrowser();
});
const toolbar = el('div', 'toolbar');
toolbar.append(search);
const packsEl = el('div');
browser.append(toolbar, packsEl);

function renderSlots(): void {
  slotsPanel.replaceChildren(
    el('h1', '', 'Sound picker'),
    Object.assign(el('p', 'help'), {
      innerHTML:
        'Pick a sound on the left, then browse on the right: <kbd>←</kbd><kbd>→</kbd> step and play, ' +
        '<kbd>Enter</kbd> use it, <kbd>Space</kbd> replay this slot, <kbd>Shift</kbd>+<kbd>↑</kbd><kbd>↓</kbd> change slot.',
    }),
  );
  for (const key of SOUND_KEYS) {
    const pick = picks[key];
    const source = pick ?? sources[key];
    const row = el('div', `slot${key === slot ? ' selected' : ''}${pick ? ' changed' : ''}`);
    row.append(
      el('div', 'slot-key', key),
      el('div', 'slot-what', SOUND_DESCRIPTIONS[key]),
      el('div', 'slot-file', source ? `${source.pack}/${source.file}${pick ? ' (new)' : ''}` : ''),
    );
    const buttons = el('div', 'slot-buttons');
    buttons.append(
      button('▶', () => {
        play(slotUrl(key), key);
      }),
    );
    if (pick) {
      buttons.append(
        button('Undo', () => {
          unpick(key);
          savePicks();
          render();
        }),
      );
    }
    row.append(buttons);
    row.addEventListener('click', () => {
      slot = key;
      render();
      play(slotUrl(key), key);
    });
    slotsPanel.append(row);
  }

  const changed = Object.keys(picks).length;
  const output = el('div', 'output');
  const text = el('textarea');
  text.readOnly = true;
  text.value = JSON.stringify(picks, null, 2);
  output.append(
    el(
      'div',
      'help',
      changed
        ? `${changed} changed. Save this as choices.json and run: npm run sfx -- apply choices.json (or paste it to Claude).`
        : 'Nothing changed yet.',
    ),
    text,
    button('Copy', () => void navigator.clipboard.writeText(text.value)),
  );
  slotsPanel.append(output);
}

function renderBrowser(): void {
  const list = visible();
  packsEl.replaceChildren();
  if (candidates.length === 0) {
    packsEl.append(
      el('div', 'empty', 'No sound packs found. Run: npm run sfx -- fetch, then reload.'),
    );
    return;
  }
  const inUse = picks[slot] ?? sources[slot];
  for (const pack of SOUND_PACKS) {
    const items = list.filter((c) => c.pack === pack.id);
    if (items.length === 0) continue;
    const section = el('div', 'pack');
    const grid = el('div', 'grid');
    section.append(el('h2', '', `${pack.name} (${items.length})`), grid);
    for (const c of items) {
      const i = list.indexOf(c);
      const used = inUse?.pack === c.pack && inUse.file === c.file;
      const b = button(
        c.file.replace(/\.ogg$/, ''),
        () => {
          cursor = i;
          play(c.url);
          renderBrowser();
        },
        `candidate${i === cursor ? ' cursor' : ''}${used ? ' in-use' : ''}`,
      );
      b.title = 'Click to play, double-click or Enter to use it';
      b.addEventListener('dblclick', () => {
        assign(c);
      });
      grid.append(b);
    }
    packsEl.append(section);
  }
  packsEl.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' });
}

function render(): void {
  renderSlots();
  renderBrowser();
}

document.addEventListener('keydown', (e) => {
  if (e.target === search && !['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return;
  const list = visible();
  if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    const i = SOUND_KEYS.indexOf(slot) + (e.key === 'ArrowUp' ? -1 : 1);
    slot = SOUND_KEYS[Math.min(Math.max(i, 0), SOUND_KEYS.length - 1)] ?? slot;
    render();
    play(slotUrl(slot));
  } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    cursor = Math.min(Math.max(cursor + step, 0), list.length - 1);
    const c = list[cursor];
    if (c) play(c.url);
    renderBrowser();
  } else if (e.key === 'Enter') {
    const c = list[cursor];
    if (c) assign(c);
  } else if (e.key === ' ') {
    play(slotUrl(slot));
  } else {
    return;
  }
  e.preventDefault();
});

render();
