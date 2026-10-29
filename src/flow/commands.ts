/**
 * Flow commands: every action on the screens' state that isn't per-tick
 * input (roles, readiness) goes through `applyCommand`. The same commands
 * come from the local UI and, online, from the network (the server runs
 * them on the room's flow), so they are plain JSON. Expected refusals are
 * results, never exceptions: callers show `commandFailureText(reason)`.
 */
import { COMMAND_FAILURE_TEXT } from '../sim/content';
import type { Flow } from './flow';
import { configureRoster, type RosterCommand, type RosterFailure } from './roster';

export type FlowCommand = RosterCommand;

export type CommandFailure = RosterFailure;

export type CommandResult = { ok: true } | { ok: false; reason: CommandFailure };

/** The part of a `Flow` commands act on (the server's room flow is a full `Flow`). */
export type CommandTarget = Pick<Flow, 'lobby' | 'screen'>;

/** Applies `command` to `flow` (mutating it) when allowed; says why not otherwise. */
export function applyCommand(flow: CommandTarget, command: FlowCommand): CommandResult {
  switch (command.type) {
    case 'role':
    case 'ready':
      return configureRoster(flow.lobby, flow.screen, command);
  }
}

/** What to tell the player about a refused command. */
export function commandFailureText(reason: CommandFailure): string {
  return COMMAND_FAILURE_TEXT[reason];
}
