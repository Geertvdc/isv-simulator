/** Joining an online room: the join-code screen and what the join's answer does. */

import type { DevicePress } from '../input/controller';
import { JOIN_CODE_ALPHABET, normalizeJoinCode } from '../net/joinCode';
import { NET_JOIN_CODE_LENGTH } from '../sim/balance';
import {
  type Flow,
  type FlowEffect,
  type FlowUpdate,
  type JoinCodeEntry,
  type OnlineError,
  clamp,
  goTo,
  isBack,
  isConfirm,
  quitToTitle,
} from './flow';

// ---------------------------------------------------------------- joining online

const NOT_CODE_LETTERS = new RegExp(`[^${JOIN_CODE_ALPHABET}]`, 'g');

/**
 * The join-code screen with a gamepad (keyboards type into the UI's text
 * box, see `editJoinCode`): up and down turn the letter under the cursor,
 * left and right move the cursor, confirm joins and back goes to the title.
 * While a join is out only back counts, and drops it.
 */
export function updateJoinCodeScreen(flow: Flow, presses: readonly DevicePress[]): FlowUpdate {
  const update: FlowUpdate = { changed: false, effects: [] };
  const entry = flow.joinCode;
  if (presses.some(isBack)) {
    if (entry.busy) update.effects.push({ type: 'cancelJoin' });
    quitToTitle(flow, 'joinOnline');
    update.changed = true;
    return update;
  }
  if (entry.busy) return update;
  for (const { nav } of presses) {
    if (nav.y !== 0) turnLetter(entry, nav.y);
    else if (nav.x !== 0) {
      entry.cursor = clamp(
        entry.cursor + nav.x,
        0,
        Math.min(entry.text.length, NET_JOIN_CODE_LENGTH - 1),
      );
    } else continue;
    entry.error = null;
    update.changed = true;
  }
  if (presses.some(isConfirm)) {
    const submitted = submitJoinCode(flow);
    update.effects.push(...submitted.effects);
    update.changed = true;
  }
  return update;
}

/** The gamepad wheel: the letter under the cursor one step on (down) or back (up). */
function turnLetter(entry: JoinCodeEntry, step: number): void {
  const n = JOIN_CODE_ALPHABET.length;
  const at = entry.cursor;
  const current = entry.text[at];
  const index = current === undefined ? (step > 0 ? -1 : 0) : JOIN_CODE_ALPHABET.indexOf(current);
  const letter = JOIN_CODE_ALPHABET[(((index + step) % n) + n) % n] ?? 'A';
  entry.text = (entry.text.slice(0, at) + letter + entry.text.slice(at + 1)).slice(
    0,
    NET_JOIN_CODE_LENGTH,
  );
}

/**
 * Typed into the join-code box (any case, pasted with spaces or dashes):
 * kept as code letters only, upper case, at most a code long. The cursor
 * follows the end. Returns whether anything changed.
 */
export function editJoinCode(flow: Flow, typed: string): boolean {
  const entry = flow.joinCode;
  if (flow.screen !== 'joinCode' || entry.busy) return false;
  const text = typed.toUpperCase().replace(NOT_CODE_LETTERS, '').slice(0, NET_JOIN_CODE_LENGTH);
  if (text === entry.text) return false;
  entry.text = text;
  entry.cursor = Math.min(text.length, NET_JOIN_CODE_LENGTH - 1);
  entry.error = null;
  return true;
}

/** Joins with the typed code, or says it can't be one. */
export function submitJoinCode(flow: Flow): FlowUpdate {
  const entry = flow.joinCode;
  if (flow.screen !== 'joinCode' || entry.busy) return { changed: false, effects: [] };
  const code = normalizeJoinCode(entry.text);
  if (!code) {
    entry.error = 'badCode';
    return { changed: true, effects: [] };
  }
  entry.error = null;
  entry.busy = true;
  return { changed: true, effects: [{ type: 'joinOnline', code }] };
}

/** The join-code screen's text box was closed with Esc: back to the title. */
export function cancelJoinCode(flow: Flow): FlowUpdate {
  if (flow.screen !== 'joinCode') return { changed: false, effects: [] };
  const effects: FlowEffect[] = flow.joinCode.busy ? [{ type: 'cancelJoin' }] : [];
  quitToTitle(flow, 'joinOnline');
  return { changed: true, effects };
}

/** The join worked: the online screens take over. */
export function joinSucceeded(flow: Flow): void {
  if (flow.screen !== 'joinCode') return;
  flow.joinCode.busy = false;
  goTo(flow, 'online');
}

/** Back into an online room at boot (a reloaded page rejoins its room): the online screens take over. */
export function enterOnline(flow: Flow): void {
  flow.awake = true;
  goTo(flow, 'online');
}

/** The join was refused or the server is away: say why, and let them try again. */
export function joinFailed(flow: Flow, error: OnlineError): void {
  if (flow.screen !== 'joinCode') return;
  flow.joinCode.busy = false;
  flow.joinCode.error = error;
}
