import { describe, expect, it } from 'vitest';
import type { FlowCommand } from '../../flow/commands';
import { createOnline } from '../../flow/online';
import { createSave } from '../../flow/save';
import type { DevicePress } from '../../input/controller';
import { updateLobby } from '../../input/lobby';
import type { RoleId } from '../../sim/roles';
import { selection } from '../../flow/roster';
import { FlowController, type FlowView, type RoomLink } from './FlowController';

const join = (deviceId: string): DevicePress => ({
  deviceId,
  joinGroup: deviceId,
  join: true,
  interact: false,
  dash: false,
  menu: false,
  nav: { x: 0, y: 0 },
});

function setup(room: RoomLink = { state: null, sendCommand: () => false }) {
  const views: FlowView[] = [];
  const flows = new FlowController(
    { save: createSave(), unlockAll: false, scene: false, kiosk: false, practiceLevelId: null },
    room,
    (view) => views.push(view),
  );
  updateLobby(flows.flow.lobby, [join('pad-0')]);
  flows.flow.screen = 'intro';
  return { flows, views };
}

const badRole: FlowCommand = { type: 'role', playerId: 1, roleId: 'wizard' as RoleId };

describe('FlowController.dispatch', () => {
  it('applies a command offline and shows the screens', () => {
    const { flows, views } = setup();
    flows.dispatch({ type: 'role', playerId: 1, roleId: 'qa' }, 0);
    expect(selection(flows.flow.lobby, 1).roleId).toBe('qa');
    expect(views).toHaveLength(1);
    expect(views[0]?.commandError).toBeNull();
  });

  it('shows a refusal as commandError, never throwing, until it works', () => {
    const { flows, views } = setup();
    expect(() => {
      flows.dispatch(badRole, 0);
    }).not.toThrow();
    expect(views.at(-1)?.commandError).toEqual(expect.any(String));
    flows.dispatch({ type: 'ready', playerId: 1, ready: true }, 0);
    expect(views.at(-1)?.commandError).toBeNull();
  });

  it('drops a refusal once the screen changes', () => {
    const { flows, views } = setup();
    flows.dispatch(badRole, 0);
    flows.flow.screen = 'lobby';
    flows.emit(0);
    expect(views.at(-1)?.commandError).toBeNull();
  });

  it('hands commands to the room while online, without applying them here', () => {
    const sent: FlowCommand[] = [];
    const { flows, views } = setup({
      state: createOnline('host'),
      sendCommand: (command) => {
        sent.push(command);
        return true;
      },
    });
    const command: FlowCommand = { type: 'role', playerId: 1, roleId: 'qa' };
    flows.dispatch(command, 0);
    expect(sent).toEqual([command]);
    expect(selection(flows.flow.lobby, 1).roleId).toBe('generalist');
    expect(views).toHaveLength(0);
  });
});

describe('FlowController.emit', () => {
  it("online, shows the room's refusal as commandError", () => {
    const online = createOnline('host');
    online.setupError = 'Nope';
    const { flows, views } = setup({ state: online, sendCommand: () => true });
    flows.flow.screen = 'online';
    flows.emit(0);
    expect(views.at(-1)?.online).toBe(online);
    expect(views.at(-1)?.commandError).toBe('Nope');
    expect(views.at(-1)?.unlockAll).toBe(false);
  });

  it('tracks what the screens show for the countdown', () => {
    const { flows } = setup();
    flows.flow.screen = 'countdown';
    flows.flow.countdownStartMs = 0;
    expect(flows.shownChanged(flows.flow, 0)).toBe(true);
    flows.emit(0);
    expect(flows.shownChanged(flows.flow, 0)).toBe(false);
  });
});
