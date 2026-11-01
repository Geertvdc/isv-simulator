/**
 * Pure parts of `npm run sim -- --drafts`: bots play every draft (phase 23)
 * and its current map, and we sum up whether they could finish and how they
 * scored, as a markdown table.
 */

/** What the report needs from one bot run. */
export interface RunScore {
  score: number;
  stars: number;
  shipped: number;
}

export interface DraftSimRow {
  /** `1-1 Garage`. */
  level: string;
  /** 1 for the main draft, N for `<id>.phaseN.txt` played for the whole round. */
  phase: number;
  bots: number;
  /** The live map with the same seeds and settings, to compare with. */
  current: readonly RunScore[];
  /** The draft's runs, or why they couldn't run (the sim threw). */
  draft: readonly RunScore[] | { error: string };
}

export interface RunsSummary {
  averageScore: number;
  averageStars: number;
  averageShipped: number;
  worstStars: number;
  /** Runs that shipped nothing: the bots couldn't do the level. */
  stuckRuns: number;
}

export function summarizeRuns(runs: readonly RunScore[]): RunsSummary {
  const n = Math.max(1, runs.length);
  const sum = (pick: (r: RunScore) => number): number =>
    runs.reduce((total, r) => total + pick(r), 0);
  return {
    averageScore: Math.round(sum((r) => r.score) / n),
    averageStars: sum((r) => r.stars) / n,
    averageShipped: sum((r) => r.shipped) / n,
    worstStars: runs.length > 0 ? Math.min(...runs.map((r) => r.stars)) : 0,
    stuckRuns: runs.filter((r) => r.shipped === 0).length,
  };
}

/** Below this share of the current map's average score, a draft that runs is flagged `low`. */
export const LOW_SCORE_SHARE = 0.5;

/**
 * `error: …` (the sim threw), `stuck 2/5` (runs that shipped nothing), `low`
 * (under half the current map's average score) or `ok`.
 */
export function draftVerdict(row: DraftSimRow): string {
  if ('error' in row.draft) return `error: ${row.draft.error}`;
  const draft = summarizeRuns(row.draft);
  if (draft.stuckRuns > 0) return `stuck ${draft.stuckRuns}/${row.draft.length}`;
  const current = summarizeRuns(row.current).averageScore;
  return draft.averageScore < current * LOW_SCORE_SHARE ? 'low' : 'ok';
}

/** Whether the bots couldn't finish the draft: it threw or a run shipped nothing. */
export function draftFailed(row: DraftSimRow): boolean {
  return 'error' in row.draft || summarizeRuns(row.draft).stuckRuns > 0;
}

/** The draft's average score against the current map's, as `+12%`; `—` without a baseline. */
export function scoreChange(draft: number, current: number): string {
  if (current <= 0) return '—';
  const change = Math.round(((draft - current) / current) * 100);
  return `${change > 0 ? '+' : ''}${change}%`;
}

function stars(summary: RunsSummary): string {
  return `${summary.averageStars.toFixed(1)} (worst ${summary.worstStars})`;
}

/** The report as a markdown table, one row per draft phase and bot count. */
export function draftSimTable(rows: readonly DraftSimRow[]): string {
  const lines = [
    '| Level | Phase | Bots | Current avg | Draft avg | Change | Draft ★ | Draft shipped | Verdict |',
    '| ----- | ----- | ---- | ----------- | --------- | ------ | ------- | ------------- | ------- |',
  ];
  for (const row of rows) {
    const current = summarizeRuns(row.current);
    const draft = 'error' in row.draft ? null : summarizeRuns(row.draft);
    lines.push(
      `| ${[
        row.level,
        String(row.phase),
        String(row.bots),
        String(current.averageScore),
        draft ? String(draft.averageScore) : '—',
        draft ? scoreChange(draft.averageScore, current.averageScore) : '—',
        draft ? stars(draft) : '—',
        draft ? draft.averageShipped.toFixed(1) : '—',
        draftVerdict(row),
      ].join(' | ')} |`,
    );
  }
  return lines.join('\n');
}
