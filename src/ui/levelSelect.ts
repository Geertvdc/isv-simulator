import { isChapterOpen, isUnlocked, totalStars } from '../flow/save';
import type { FlowView } from '../render/GameScene';
import { MAX_STARS, STARS_TO_UNLOCK } from '../sim/balance';
import {
  CHAPTER_BLURBS,
  LEVEL_BLURBS,
  LEVEL_SELECT_HINT,
  LEVEL_SELECT_TITLE,
  chapterGateHint,
  levelLabel,
  unlockHint,
} from '../sim/content';
import { CHAPTERS, LEVELS } from '../sim/levels';
import { el } from './dom';
import { starText } from './format';

export interface LevelSelectView {
  /** Shows the level select with its cursor, or hides it for `null`. */
  render: (view: FlowView | null) => void;
}

interface LevelEntry {
  card: HTMLElement;
  stars: HTMLElement;
  score: HTMLElement;
  id: string;
  /** Index in `LEVELS`. */
  index: number;
  chapter: number;
}

/**
 * The chapter view: a column per chapter with its levels stacked, each card
 * with its best stars and score. Locked chapters and levels are greyed out
 * and say what opens them. The highlighted level is picked with confirm.
 */
export function mountLevelSelect(root: HTMLElement): LevelSelectView {
  const panel = el('div', 'screen level-select');
  panel.hidden = true;
  const total = el('div', 'level-select-total');
  const columns = el('div', 'chapters');
  const chapterViews: { column: HTMLElement; gate: HTMLElement }[] = [];
  const entries: LevelEntry[] = [];
  CHAPTERS.forEach((chapter, c) => {
    const column = el('div', 'chapter');
    const gate = el('div', 'chapter-gate');
    column.append(
      el('div', 'chapter-name', chapter.name),
      el('div', 'chapter-blurb', CHAPTER_BLURBS[chapter.id] ?? ''),
      gate,
    );
    chapter.levels.forEach((level, row) => {
      const card = el('div', 'level-card');
      const stars = el('div', 'level-card-stars');
      const score = el('div', 'level-card-score');
      card.append(
        el('div', 'level-card-number', levelLabel(c + 1, row + 1)),
        el('div', 'level-card-name', level.name),
        el('div', 'level-card-blurb', LEVEL_BLURBS[level.id] ?? ''),
        stars,
        score,
      );
      column.append(card);
      entries.push({ card, stars, score, id: level.id, index: LEVELS.indexOf(level), chapter: c });
    });
    columns.append(column);
    chapterViews.push({ column, gate });
  });
  panel.append(
    el('h1', 'screen-title', LEVEL_SELECT_TITLE),
    total,
    columns,
    el('div', 'screen-hint', LEVEL_SELECT_HINT),
  );
  root.append(panel);

  return {
    render: (view) => {
      panel.hidden = view === null;
      if (!view) return;
      const { flow, save, levelIds, chapters, unlockAll } = view;
      const stars = totalStars(save, levelIds);
      total.textContent = `${stars} / ${levelIds.length * MAX_STARS} ★`;
      const selected = entries.find((e) => e.index === flow.levelIndex)?.chapter;
      chapterViews.forEach(({ column, gate }, c) => {
        const open = isChapterOpen(save, levelIds, chapters, c, unlockAll);
        column.classList.toggle('locked', !open);
        column.classList.toggle('selected', c === selected);
        const needed = chapters[c]?.starGate ?? 0;
        gate.textContent = open ? '' : `🔒 ${chapterGateHint(needed, stars)}`;
        gate.hidden = open;
      });
      for (const { card, stars: starsLine, score, id, index, chapter } of entries) {
        const open = isUnlocked(save, levelIds, index, unlockAll, chapters);
        const record = save.levels[id];
        card.classList.toggle('selected', index === flow.levelIndex);
        card.classList.toggle('locked', !open);
        starsLine.classList.toggle('played', open && record !== undefined);
        const chapterOpen = isChapterOpen(save, levelIds, chapters, chapter, unlockAll);
        if (!open) {
          starsLine.textContent = chapterOpen
            ? `🔒 ${unlockHint(STARS_TO_UNLOCK, LEVELS[index - 1]?.name ?? '')}`
            : '🔒';
          score.textContent = '';
        } else if (record) {
          starsLine.textContent = starText(record.bestStars);
          score.textContent = `Best score: ${record.bestScore}`;
        } else {
          starsLine.textContent = 'Not played yet';
          score.textContent = '';
        }
      }
    },
  };
}
