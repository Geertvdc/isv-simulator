import type { DevicePress } from '../../input/controller';
import type { InputFrame } from '../../input/devices';
import { claimOrphanedPlayer } from '../../input/lobby';
import { applyCommand, commandFailureText, type FlowCommand } from '../../flow/commands';
import {
  type Flow,
  type FlowContext,
  type FlowUpdate,
  type Screen,
  countdownNumber,
  createFlow,
  finishRound,
  resultsReady,
} from '../../flow/flow';
import { cancelJoinCode, editJoinCode, submitJoinCode } from '../../flow/joinFlow';
import { updateFlow } from '../../flow/updateFlow';
import { type OnlineState, onlineNowMs } from '../../flow/online';
import type { ChapterInfo, SaveData } from '../../flow/save';
import { DEMO_KIOSK_IDLE_MS } from '../../sim/balance';
import type { LevelResult } from '../../sim/orders';
import { CHAPTER_INFO, DEMO_LEVELS, LEVEL_IDS } from './campaign';

/** What the menus show: the flow plus what it is read with. */
export interface FlowView {
  flow: Flow;
  save: SaveData;
  levelIds: readonly string[];
  chapters: readonly ChapterInfo[];
  unlockAll: boolean;
  /** On the results screen: presses count now. */
  resultsReady: boolean;
  /** During the countdown: the number showing (3, 2, 1). */
  countdown: number | null;
  /**
   * In an online room: the session. `flow` is then the room's flow from the
   * server (or this browser's own `online` screen while connecting) and
   * `save.levels` the room's unlocks.
   */
  online: OnlineState | null;
  /** Why the last flow command was refused (by the room's server, online), or `null`. */
  commandError: string | null;
}

/** What the join-code screen's text box did. */
export type JoinCodeInput =
  { type: 'text'; text: string } | { type: 'submit' } | { type: 'cancel' };

/** The online room, as far as the screens are concerned (`OnlineSession`). */
export interface RoomLink {
  /** The room this browser is in (or connecting to), or `null`. */
  readonly state: OnlineState | null;
  /** Hands `command` to the room's server; `false` outside a room. */
  sendCommand(command: FlowCommand): boolean;
}

export interface FlowControllerOptions {
  save: SaveData;
  /** `?unlockAll`: every level is open. */
  unlockAll: boolean;
  /** `?scene=`: a picture, no demo. */
  scene: boolean;
  /** `?demo`: starts in the demo. */
  kiosk: boolean;
  /** A lab level played on its own, outside the campaign. */
  practiceLevelId: string | null;
}

/**
 * This browser's screens: owns the flow (and its roster), runs the menu
 * presses and flow commands on it, and turns it into the `FlowView` the
 * screens draw. The UI's one way in for flow commands: online they go to the
 * room's server, offline they're applied here, and either way a refusal
 * reaches the screens as `FlowView.commandError`, never as an exception.
 */
export class FlowController {
  /** The screens; kept for the whole game. */
  readonly flow: Flow = createFlow();
  /** A refused local flow command, shown until it works or the screen changes. */
  private localCommandError: { screen: Screen; text: string } | null = null;
  /** What the last view said about the results taking presses. */
  private shownResultsReady = false;
  /** The countdown number the last view showed. */
  private shownCountdown: number | null = null;

  constructor(
    private readonly options: FlowControllerOptions,
    private readonly room: RoomLink,
    /** Shows a new view on the screens. */
    private readonly publish: (view: FlowView) => void,
  ) {
    // A kiosk starts as if left alone for a while: straight into the demo.
    if (options.kiosk) this.flow.lastPressMs = -DEMO_KIOSK_IDLE_MS;
    if (options.practiceLevelId !== null) {
      this.flow.screen = 'lobby';
      this.flow.awake = true;
    }
  }

  private get levelIds(): readonly string[] {
    const practice = this.options.practiceLevelId;
    return practice === null ? LEVEL_IDS : [practice];
  }

  context(nowMs: number): FlowContext {
    const practice = this.options.practiceLevelId !== null;
    return {
      save: this.options.save,
      levelIds: this.levelIds,
      chapters: CHAPTER_INFO,
      unlockAll: this.options.unlockAll,
      nowMs,
      // A scene is a picture: no demo.
      demo:
        this.options.scene || practice
          ? undefined
          : { kiosk: this.options.kiosk, levels: DEMO_LEVELS },
      practice,
    };
  }

  /**
   * Hands lobby players whose device went away to a device that pressed.
   * Returns the presses that didn't claim anyone.
   */
  claimDevices(frame: InputFrame): DevicePress[] {
    const { players } = this.flow.lobby;
    const before = players.map((p) => p.deviceId);
    claimOrphanedPlayer(players, frame.presses, new Set(frame.readings.keys()));
    const claimed = new Set(
      players.filter((p, i) => p.deviceId !== before[i]).map((p) => p.deviceId),
    );
    return frame.presses.filter((p) => !claimed.has(p.deviceId));
  }

  /** This frame's menu presses on the flow. */
  update(presses: readonly DevicePress[], nowMs: number): FlowUpdate {
    return updateFlow(this.flow, presses, this.context(nowMs));
  }

  /** The couch round ended with `result`. */
  finishRound(result: LevelResult, nowMs: number): FlowUpdate {
    return finishRound(this.flow, result, this.context(nowMs));
  }

  /** The join-code text box: typing, Enter and Esc. */
  joinCode(input: JoinCodeInput): FlowUpdate {
    if (input.type === 'text') return { changed: editJoinCode(this.flow, input.text), effects: [] };
    if (input.type === 'submit') return submitJoinCode(this.flow);
    return cancelJoinCode(this.flow);
  }

  /** Runs a flow command from the UI, in the room or here (see the class). */
  dispatch(command: FlowCommand, nowMs: number): void {
    if (this.room.sendCommand(command)) return;
    const result = applyCommand(this.flow, command);
    this.localCommandError = result.ok
      ? null
      : { screen: this.flow.screen, text: commandFailureText(result.reason) };
    this.emit(nowMs);
  }

  /** Whether `flow`'s results-ready or countdown number moved on from what the screens show. */
  shownChanged(flow: Flow | null, nowMs: number): boolean {
    const ready = flow ? resultsReady(flow, nowMs) : false;
    const countdown = flow ? countdownNumber(flow, nowMs) : null;
    return ready !== this.shownResultsReady || countdown !== this.shownCountdown;
  }

  /** Shows the screens as they are now. */
  emit(nowMs: number): void {
    // Online, the screens show the room: its flow, its clock and its unlocks.
    const online = this.flow.screen === 'online' ? this.room.state : null;
    const flow = online?.flow ?? this.flow;
    const now = online ? onlineNowMs(online) : nowMs;
    this.shownResultsReady = resultsReady(flow, now);
    this.shownCountdown = countdownNumber(flow, now);
    const { save, unlockAll } = this.options;
    this.publish({
      flow,
      save: online ? { ...save, levels: online.levels } : save,
      levelIds: this.levelIds,
      chapters: CHAPTER_INFO,
      unlockAll: online ? false : unlockAll,
      resultsReady: this.shownResultsReady,
      countdown: this.shownCountdown,
      online,
      commandError: this.commandError(online, flow),
    });
  }

  /** The one place a refused command becomes text on the screens. */
  private commandError(online: OnlineState | null, flow: Flow): string | null {
    if (online) return online.setupError ?? null;
    const local = this.localCommandError;
    return local?.screen === flow.screen ? local.text : null;
  }
}
