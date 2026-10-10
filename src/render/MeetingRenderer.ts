import Phaser from 'phaser';
import { MEETING_ROOM_TEXT } from '../sim/content';
import type { LevelMap } from '../sim/level';
import type { Invite } from '../sim/meetings';
import type { GameState } from '../sim/state';
import type { GameLoop } from './GameLoop';
import { vectors } from './MapRenderer';
import { BODY_HEIGHT, PLAYER_DEPTH_OFFSET } from './PlayerRenderer';
import { playerColor } from './playerColors';
import { tileCorners, tileDepth, tileToScreen } from './projection';

/** Placeholder meeting room: a rug over the floor, brighter while someone is invited. */
const RUG_COLOR = 0x8e6bd8;
const RUG_ALPHA = 0.35;
const RUG_ALPHA_INVITED = 0.6;
const RUG_PULSE_MS = 300;
/** Over the floor, under everything standing on it. */
const RUG_DEPTH = -0.5;

/** Calendar icon over an invited player's head. */
const ICON_SIZE = 22;
const ICON_LIFT = BODY_HEIGHT + 40;
const RING_RADIUS = 17;

/**
 * Meeting rooms and calendar invites in the world: the room's rug and label,
 * and a calendar with a countdown ring over every invited player.
 */
export class MeetingRenderer {
  private readonly rug: Phaser.GameObjects.Graphics;
  private readonly icons = new Map<number, Phaser.GameObjects.Graphics>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: LevelMap,
  ) {
    this.rug = scene.add.graphics().setDepth(RUG_DEPTH);
    this.drawRug(false, 0);
    const tiles = map.meetingTiles;
    if (tiles.length > 0) {
      const cx = tiles.reduce((sum, t) => sum + t.x, 0) / tiles.length;
      const top = Math.min(...tiles.map((t) => t.y));
      const label = tileToScreen(cx, top - 0.5);
      scene.add
        .text(label.x, label.y, MEETING_ROOM_TEXT, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#e6dcff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0)
        .setDepth(RUG_DEPTH);
    }
  }

  sync(loop: GameLoop, timeMs: number): void {
    const { state } = loop;
    this.drawRug(state.invites.length > 0, timeMs);
    const seen = new Set<number>();
    for (const invite of state.invites) {
      const pos = loop.renderPos(invite.playerId);
      if (!pos) continue;
      seen.add(invite.id);
      let g = this.icons.get(invite.id);
      if (!g) {
        g = this.scene.add.graphics();
        this.icons.set(invite.id, g);
      }
      const s = tileToScreen(pos.x, pos.y);
      g.setPosition(s.x, s.y - ICON_LIFT).setDepth(tileDepth(pos.x, pos.y) + PLAYER_DEPTH_OFFSET);
      drawInvite(g, state, invite);
    }
    for (const [id, g] of this.icons) {
      if (seen.has(id)) continue;
      g.destroy();
      this.icons.delete(id);
    }
  }

  private drawRug(invited: boolean, timeMs: number): void {
    const g = this.rug;
    g.clear();
    const pulse = invited ? 0.5 + 0.5 * Math.sin(timeMs / RUG_PULSE_MS) : 0;
    const alpha = invited ? RUG_ALPHA + (RUG_ALPHA_INVITED - RUG_ALPHA) * pulse : RUG_ALPHA;
    g.fillStyle(RUG_COLOR, alpha);
    g.lineStyle(2, RUG_COLOR, 0.9);
    for (const t of this.map.meetingTiles) {
      g.fillPoints(vectors(tileCorners(t.x, t.y)), true);
    }
  }
}

/** A little calendar page in the player's color, with a ring that runs down with the time left. */
function drawInvite(g: Phaser.GameObjects.Graphics, state: GameState, invite: Invite): void {
  g.clear();
  const color = playerColor(invite.playerId);
  const total = Math.max(1, invite.expiresTick - invite.createdTick);
  const left = Math.max(0, invite.expiresTick - state.tick) / total;
  const done = invite.attendedTicks / Math.max(1, invite.attendTicks);

  g.fillStyle(0x000000, 0.55);
  g.fillCircle(0, 0, RING_RADIUS + 3);
  g.lineStyle(4, left < 0.3 ? 0xff5a4f : color);
  g.beginPath();
  g.arc(0, 0, RING_RADIUS, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left, false);
  g.strokePath();

  const half = ICON_SIZE / 2;
  g.fillStyle(0xffffff);
  g.fillRect(-half, -half, ICON_SIZE, ICON_SIZE);
  g.fillStyle(0xd2322d);
  g.fillRect(-half, -half, ICON_SIZE, ICON_SIZE * 0.3);
  // Time sat so far fills the page from the bottom.
  g.fillStyle(0x7cf07c);
  const filled = (ICON_SIZE * 0.7 - 2) * done;
  g.fillRect(-half + 2, half - 1 - filled, ICON_SIZE - 4, filled);
  g.lineStyle(2, 0x1a1d24);
  g.strokeRect(-half, -half, ICON_SIZE, ICON_SIZE);
}
