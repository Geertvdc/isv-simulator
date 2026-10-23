import { isOnlineHost } from '../flow/online';
import { chapterIndexOf, isChapterOpen, isUnlocked, totalStars } from '../flow/save';
import type { FlowView } from '../render/GameScene';
import { MAX_STARS, STARS_TO_UNLOCK } from '../sim/balance';
import {
  CHAPTER_BLURBS,
  LEVEL_BLURBS,
  LEVEL_SELECT_GUEST_HINT,
  LEVEL_SELECT_HINT,
  chapterGateHint,
  levelLabel,
  unlockHint,
} from '../sim/content';
import { CHAPTERS, LEVELS } from '../sim/levels';
import { el } from './dom';

export interface LevelSelectView {
  /** Shows the level select with its cursor, or hides it for `null`. */
  render: (view: FlowView | null) => void;
}

/**
 * What floats over the world map on the level select (the map itself is
 * 3D, see `src/render/three/worldMap/`): the selected level's card, the
 * chapter's name in the top left, the star total in the top right and the
 * button hint at the bottom.
 */
export function mountLevelSelect(root: HTMLElement): LevelSelectView {
  const panel = el('div', 'screen level-select');
  panel.hidden = true;

  const chapterName = el('div', 'map-chapter-name');
  const chapterBlurb = el('div', 'map-chapter-blurb');
  const chapterGate = el('div', 'map-chapter-gate');
  const banner = el('div', 'map-chapter');
  banner.append(chapterName, chapterBlurb, chapterGate);

  const total = el('div', 'map-stars');
  const totalCount = el('span', 'map-stars-count');
  total.append(el('span', 'map-stars-icon', '★'), totalCount);

  const card = el('div', 'map-card');
  const number = el('div', 'map-card-number');
  const name = el('div', 'map-card-name');
  const blurb = el('div', 'map-card-blurb');
  const stars = el('div', 'map-card-stars');
  const starIcons = Array.from({ length: MAX_STARS }, () => el('span', 'map-card-star', '★'));
  stars.append(...starIcons);
  const status = el('div', 'map-card-status');
  card.append(number, name, blurb, stars, status);

  const hint = el('div', 'screen-hint map-hint', LEVEL_SELECT_HINT);
  panel.append(banner, total, card, hint);
  root.append(panel);

  return {
    render: (view) => {
      panel.hidden = view === null;
      if (!view) return;
      const { flow, save, levelIds, chapters, unlockAll } = view;
      // Online only the host picks; a guest's Enter joins the next round (if they have no player).
      hint.textContent =
        view.online && !isOnlineHost(view.online) ? LEVEL_SELECT_GUEST_HINT : LEVEL_SELECT_HINT;
      const have = totalStars(save, levelIds);
      totalCount.textContent = String(have).padStart(3, '0');

      const index = flow.levelIndex;
      const id = levelIds[index] ?? '';
      const level = LEVELS.find((l) => l.id === id);
      const c = chapterIndexOf(chapters, id);
      const chapter = CHAPTERS[c];
      const place = (chapters[c]?.levelIds.indexOf(id) ?? 0) + 1;
      const chapterOpen = isChapterOpen(save, levelIds, chapters, c, unlockAll);
      const open = isUnlocked(save, levelIds, index, unlockAll, chapters);
      const record = save.levels[id];

      banner.dataset.chapter = chapter?.id ?? '';
      chapterName.textContent = chapter?.name ?? '';
      chapterBlurb.textContent = CHAPTER_BLURBS[chapter?.id ?? ''] ?? '';
      chapterGate.hidden = chapterOpen;
      chapterGate.textContent = chapterOpen
        ? ''
        : `🔒 ${chapterGateHint(chapters[c]?.starGate ?? 0, have)}`;

      card.dataset.chapter = chapter?.id ?? '';
      card.classList.toggle('locked', !open);
      number.textContent = levelLabel(c + 1, place);
      name.textContent = level?.name ?? '';
      blurb.textContent = LEVEL_BLURBS[id] ?? '';
      const earned = open ? (record?.bestStars ?? 0) : 0;
      starIcons.forEach((icon, i) => icon.classList.toggle('earned', i < earned));
      if (!open) {
        status.textContent = `🔒 ${
          chapterOpen
            ? unlockHint(STARS_TO_UNLOCK, LEVELS[index - 1]?.name ?? '')
            : chapterGateHint(chapters[c]?.starGate ?? 0, have)
        }`;
      } else if (record) {
        status.textContent = `Best score: ${record.bestScore}`;
      } else {
        status.textContent = 'Not played yet';
      }
    },
  };
}
