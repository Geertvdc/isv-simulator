import { describe, expect, it } from 'vitest';
import type { DevicePress } from '../input/controller';
import { updateLobby } from '../input/lobby';
import type { RoleId } from '../sim/roles';
import { applyCommand, commandFailureText, type FlowCommand } from './commands';
import { createFlow, type Flow, type Screen } from './flow';
import { selection } from './roster';

const join = (deviceId: string): DevicePress => ({
  deviceId,
  joinGroup: deviceId,
  join: true,
  interact: false,
  dash: false,
  menu: false,
  nav: { x: 0, y: 0 },
});

function flowWithPlayers(screen: Screen, n = 2): Flow {
  const flow = createFlow();
  for (let i = 0; i < n; i++) updateLobby(flow.lobby, [join(`pad-${i}`)]);
  flow.screen = screen;
  return flow;
}

describe('applyCommand', () => {
  describe('role', () => {
    it.each<Screen>(['lobby', 'intro'])('picks a role on the %s screen', (screen) => {
      const flow = flowWithPlayers(screen);
      expect(applyCommand(flow, { type: 'role', playerId: 2, roleId: 'qa' })).toEqual({ ok: true });
      expect(selection(flow.lobby, 2)).toEqual({ roleId: 'qa', ready: false });
      expect(selection(flow.lobby, 1)).toEqual({ roleId: 'generalist', ready: false });
    });

    it('a new role clears readiness, the same role keeps it', () => {
      const flow = flowWithPlayers('intro');
      applyCommand(flow, { type: 'ready', playerId: 1, ready: true });
      applyCommand(flow, { type: 'role', playerId: 1, roleId: 'generalist' });
      expect(selection(flow.lobby, 1)).toEqual({ roleId: 'generalist', ready: true });
      applyCommand(flow, { type: 'role', playerId: 1, roleId: 'backend' });
      expect(selection(flow.lobby, 1)).toEqual({ roleId: 'backend', ready: false });
    });

    it('refuses an unknown role and changes nothing', () => {
      const flow = flowWithPlayers('intro');
      const command = { type: 'role', playerId: 1, roleId: 'wizard' as RoleId } as const;
      expect(applyCommand(flow, command)).toEqual({ ok: false, reason: 'unknownRole' });
      expect(selection(flow.lobby, 1).roleId).toBe('generalist');
    });
  });

  describe('ready', () => {
    it('readies and unreadies a player on the intro', () => {
      const flow = flowWithPlayers('intro');
      expect(applyCommand(flow, { type: 'ready', playerId: 1, ready: true })).toEqual({ ok: true });
      expect(selection(flow.lobby, 1).ready).toBe(true);
      expect(applyCommand(flow, { type: 'ready', playerId: 1, ready: false })).toEqual({
        ok: true,
      });
      expect(selection(flow.lobby, 1).ready).toBe(false);
    });
  });

  const commands: FlowCommand[] = [
    { type: 'role', playerId: 1, roleId: 'frontend' },
    { type: 'ready', playerId: 1, ready: true },
  ];

  it.each(commands)('$type refuses a player not in the roster', (command) => {
    const flow = flowWithPlayers('intro', 1);
    const before = structuredClone(flow);
    expect(applyCommand(flow, { ...command, playerId: 3 })).toEqual({
      ok: false,
      reason: 'unknownPlayer',
    });
    expect(flow).toEqual(before);
  });

  it.each(commands)('$type is locked outside the lobby and the intro', (command) => {
    for (const screen of ['countdown', 'playing', 'paused', 'results', 'title'] as const) {
      const flow = flowWithPlayers(screen);
      const before = structuredClone(flow);
      expect(applyCommand(flow, command)).toEqual({ ok: false, reason: 'rosterLocked' });
      expect(flow).toEqual(before);
    }
  });

  it('commands are plain JSON', () => {
    const flow = flowWithPlayers('intro');
    for (const command of commands) {
      expect(applyCommand(flow, JSON.parse(JSON.stringify(command)) as FlowCommand).ok).toBe(true);
    }
  });

  it('every failure has text to show', () => {
    for (const reason of ['rosterLocked', 'unknownPlayer', 'unknownRole'] as const) {
      expect(commandFailureText(reason)).not.toBe('');
    }
  });
});
