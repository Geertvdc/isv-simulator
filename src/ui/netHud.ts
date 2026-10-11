/**
 * The ping corner: the round trip to the server while online, and whether
 * the round on screen is waiting for the server's next snapshot (which shows
 * as stutter). On by default in dev builds and with `?nethud`; `N` toggles it.
 */

import type { NetStats } from '../render/GameScene';
import { ONLINE_TEXT } from '../sim/content';
import { el } from './dom';

export interface NetHud {
  render: (stats: NetStats | null) => void;
}

export function netStatsText(stats: NetStats): string {
  const parts = [
    `${ONLINE_TEXT.ping} ${stats.rttMs === null ? '…' : `${Math.round(stats.rttMs)} ms`}`,
  ];
  if (stats.status === 'waiting') parts.push(ONLINE_TEXT.waitingForSnapshots);
  if (stats.lag) {
    parts.push(`${ONLINE_TEXT.lagSimulated} ${stats.lag.lagMs}±${stats.lag.jitterMs} ms`);
  }
  return parts.join(' · ');
}

export function mountNetHud(root: HTMLElement): NetHud {
  const node = el('div', 'net-hud');
  node.hidden = true;
  root.append(node);
  return {
    render: (stats) => {
      node.hidden = stats === null;
      if (!stats) return;
      const text = netStatsText(stats);
      if (node.textContent !== text) node.textContent = text;
      node.dataset.status = stats.status ?? '';
    },
  };
}
