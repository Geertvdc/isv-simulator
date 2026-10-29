import { describe, expect, it } from 'vitest';
import { claimOrphanedPlayer, createLobby, updateLobby } from '../input/lobby';
import type { DevicePress } from '../input/controller';
import { createGame } from '../sim/state';
import { LEVELS, levelById } from '../sim/levels';
import { COUNTDOWN_MS, createFlow, updateFlow, type FlowContext } from './flow';
import { createSave } from './save';
import {
  configureRoster,
  resetReadiness,
  rolesForRoster,
  rosterPresses,
  selection,
} from './roster';

const press = (deviceId: string, extra: Partial<DevicePress> = {}): DevicePress => ({
  deviceId,
  joinGroup: deviceId,
  join: false,
  interact: false,
  dash: false,
  menu: false,
  nav: { x: 0, y: 0 },
  ...extra,
});
const ctx: FlowContext = {
  save: createSave(),
  levelIds: LEVELS.map((l) => l.id),
  chapters: [],
  unlockAll: true,
  nowMs: 0,
};
const garage = levelById('garage');
if (!garage) throw new Error('Missing garage');

describe('shared ephemeral roster', () => {
  it('shared Enter joins cannot ready either keyboard slot or start a solo countdown', () => {
    for (const n of [1, 2]) {
      const flow = createFlow();
      flow.screen = 'lobby';
      for (let i = 0; i < n; i++)
        updateFlow(flow, [press(i === 0 ? 'kb-left' : 'kb-right', { join: true })], ctx);
      updateFlow(flow, [press('kb-left', { interact: true })], ctx);
      updateFlow(flow, [press('kb-left', { interact: true })], ctx);
      expect(flow.screen).toBe('intro');
      updateFlow(
        flow,
        [
          press('kb-left', { joinGroup: 'keyboard', join: true }),
          press('kb-right', { joinGroup: 'keyboard', join: true }),
        ],
        ctx,
      );
      expect(flow.screen).toBe('intro');
      for (const player of flow.lobby.players)
        expect(selection(flow.lobby, player.playerId).ready).toBe(false);
    }
  });

  it.each([1, 2, 3, 4])(
    'confirms all %i players separately, keeps defaults and allows duplicates',
    (n) => {
      const flow = createFlow();
      flow.screen = 'lobby';
      for (let i = 0; i < n; i++) {
        updateFlow(flow, [press(`pad-${i}`, { join: true })], ctx);
        expect(flow.screen).toBe('lobby');
        expect(selection(flow.lobby, i + 1)).toEqual({ roleId: 'generalist', ready: false });
      }
      for (const p of flow.lobby.players) {
        configureRoster(flow.lobby, 'lobby', { type: 'role', playerId: p.playerId, roleId: 'qa' });
      }
      updateFlow(flow, [press('pad-0', { interact: true })], ctx);
      updateFlow(flow, [press('pad-0', { interact: true })], ctx);
      expect(flow.screen).toBe('intro');
      for (let i = 0; i < n; i++) {
        updateFlow(flow, [press(`pad-${i}`, { interact: true })], ctx);
        expect(flow.screen).toBe(i === n - 1 ? 'countdown' : 'intro');
      }
      const game = createGame(
        garage,
        1,
        flow.lobby.players.map((p) => p.playerId),
        rolesForRoster(flow.lobby),
      );
      expect(game.players.map((p) => p.roleId)).toEqual(Array(n).fill('qa'));
      expect(
        configureRoster(flow.lobby, 'countdown', { type: 'role', playerId: 1, roleId: 'backend' })
          .ok,
      ).toBe(false);
      updateFlow(flow, [], { ...ctx, nowMs: COUNTDOWN_MS });
      expect(flow.screen).toBe('playing');
    },
  );

  it('only a bound device changes its role, and any real change invalidates its ready', () => {
    const lobby = createLobby();
    updateLobby(lobby, [press('pad-0', { join: true })]);
    rosterPresses(lobby, 'intro', [press('pad-1', { nav: { x: 1, y: 0 }, interact: true })]);
    expect(selection(lobby, 1).roleId).toBe('generalist');
    configureRoster(lobby, 'intro', { type: 'ready', playerId: 1, ready: true });
    rosterPresses(lobby, 'intro', [press('pad-0', { nav: { x: 1, y: 0 }, interact: true })]);
    expect(selection(lobby, 1)).toEqual({ roleId: 'frontend', ready: false });
    expect(configureRoster(lobby, 'intro', { type: 'role', playerId: 4, roleId: 'qa' }).ok).toBe(
      false,
    );
    for (const screen of ['countdown', 'playing', 'results', 'paused']) {
      expect(configureRoster(lobby, screen, { type: 'ready', playerId: 1, ready: true }).ok).toBe(
        false,
      );
    }
  });

  it('controller takeover preserves identity, role and readiness; resetting a round preserves only role', () => {
    const lobby = createLobby();
    updateLobby(lobby, [press('pad-0', { join: true })]);
    configureRoster(lobby, 'intro', { type: 'role', playerId: 1, roleId: 'platform' });
    configureRoster(lobby, 'intro', { type: 'ready', playerId: 1, ready: true });
    expect(
      claimOrphanedPlayer(lobby.players, [press('pad-2', { join: true })], new Set(['pad-2'])),
    ).toBe(true);
    expect(lobby.players[0]?.deviceId).toBe('pad-2');
    expect(selection(lobby, 1)).toEqual({ roleId: 'platform', ready: true });
    resetReadiness(lobby);
    expect(selection(lobby, 1)).toEqual({ roleId: 'platform', ready: false });
  });
});
