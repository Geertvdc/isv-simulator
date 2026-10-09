import { TICKS_PER_SECOND } from '../sim/balance';

/** m:ss, rounded up so the clock shows 0:00 only when time is really up. */
export function formatClock(ticks: number): string {
  const seconds = Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Filled and empty stars, e.g. ★★☆. */
export function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));
}
