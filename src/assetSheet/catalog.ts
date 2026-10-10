import type Phaser from 'phaser';
import { PIPELINE_FAIL_TICKS, PIPELINE_WARN_TICKS } from '../sim/balance';
import type { Tile } from '../sim/level';
import { GARAGE } from '../sim/levels';
import type { Pipeline } from '../sim/pipeline';
import type { Vec } from '../sim/state';
import { TICKET_STEPS, type TicketKind } from '../sim/tickets';
import {
  BLOCK_STYLES,
  FRONT_WALL_HEIGHT,
  MapRenderer,
  drawBlock,
  drawFloorTile,
} from '../render/MapRenderer';
import { drawPipelineState } from '../render/PipelineRenderer';
import { PLAYER_COLORS, playerShape } from '../render/playerColors';
import { PLAYER_DEPTH_OFFSET, drawPlayer } from '../render/PlayerRenderer';
import { TILE_SIZE, VIEW_PITCH, blockFaces, tileDepth, tileToScreen } from '../render/projection';
import { drawProgressBar, drawTicketCard } from '../render/TicketRenderer';

/**
 * Every placeholder the game draws, each on its own frame so it can be handed
 * to an artist. Frames are in game pixels at 1x; `anchor` is the pixel in the
 * frame that sits on the in-game position (tile center, a player's feet, the
 * bottom center of a card).
 */
export interface AssetFrame {
  width: number;
  height: number;
  anchor: { x: number; y: number };
}

export interface SheetAsset {
  /** File path inside the export, without extension. */
  name: string;
  /** What it is and when it shows, for the artist. */
  notes: string;
  frame: AssetFrame;
  /** Fixed export scale, for assets too big to export at the chosen one. */
  scale?: number;
  /** Draws the asset with its anchor at world (0, 0). */
  draw: (scene: Phaser.Scene) => void;
}

/** One frame for every tile asset, tall enough for walls, smoke and the warning badge. */
export const TILE_FRAME: AssetFrame = { width: 80, height: 112, anchor: { x: 40, y: 92 } };
export const PLAYER_FRAME: AssetFrame = { width: 64, height: 68, anchor: { x: 32, y: 54 } };
export const TICKET_FRAME: AssetFrame = { width: 64, height: 44, anchor: { x: 32, y: 42 } };

type BlockTile = Exclude<Tile, 'floor'>;

const TILE_NOTES: Readonly<Record<BlockTile, string>> = {
  wall: 'Back and side walls of the room.',
  counter: 'Plain desk. Tickets can be put down and picked up here.',
  inbox: 'Feature tickets queue up here (stack of cards on top). Sits in the back wall.',
  bugQueue: 'Bug tickets come back here. Sits in the back wall.',
  keyboard: 'Write code: hold work here to do the "code" step.',
  testBench: 'Test: hold work here to do the "test" step.',
  review: 'Code review station.',
  pipeline: 'CI/CD pipeline: builds a ticket on its own. Can break, see pipeline states.',
  ship: 'Ship to the customer: drop a finished ticket here. Sits in the front wall.',
  bin: 'Bin: throw a ticket away.',
};

const FACINGS: readonly { name: string; facing: Vec }[] = [
  { name: 'down', facing: { x: 0, y: 1 } },
  { name: 'up', facing: { x: 0, y: -1 } },
  { name: 'left', facing: { x: -1, y: 0 } },
  { name: 'right', facing: { x: 1, y: 0 } },
];

function blockAsset(tile: BlockTile): SheetAsset {
  return {
    name: `tiles/${tile}`,
    notes: TILE_NOTES[tile],
    frame: TILE_FRAME,
    draw: (scene) => {
      drawBlock(scene, 0, 0, tile, BLOCK_STYLES[tile].height);
    },
  };
}

function pipelineAsset(
  name: string,
  notes: string,
  state: Partial<Pipeline>,
  t: number,
): SheetAsset {
  return {
    name: `tiles/pipeline-${name}`,
    notes,
    frame: TILE_FRAME,
    draw: (scene) => {
      const height = BLOCK_STYLES.pipeline.height;
      drawBlock(scene, 0, 0, 'pipeline', height);
      const pipeline: Pipeline = { x: 0, y: 0, doneTicks: 0, broken: false, repair: 0, ...state };
      drawPipelineState(
        scene.add.graphics().setDepth(1),
        scene.add.graphics().setDepth(2),
        blockFaces(0, 0, height).top,
        { x: 0, y: -height },
        pipeline,
        t,
      );
    },
  };
}

function ticketAsset(
  kind: TicketKind,
  name: string,
  notes: string,
  done: number,
  bar: number | null,
): SheetAsset {
  return {
    name: `tickets/${kind}-${name}`,
    notes,
    frame: TICKET_FRAME,
    draw: (scene) => {
      const steps = TICKET_STEPS[kind].map((k, i) => ({ kind: k, progress: i < done ? 1 : 0 }));
      drawTicketCard(scene.add.graphics(), { kind, steps }, bar);
    },
  };
}

function levelAsset(): SheetAsset {
  const { map } = GARAGE;
  const pad = 8;
  const left = -TILE_SIZE / 2 - pad;
  const top = -TILE_SIZE * VIEW_PITCH * 0.5 - BLOCK_STYLES.wall.height - pad;
  const right = (map.width - 0.5) * TILE_SIZE + pad;
  const bottom = (map.height - 0.5) * TILE_SIZE * VIEW_PITCH + pad;
  return {
    name: 'reference/level-garage',
    notes: 'The whole first level with players on their spawns, for context. Not an asset.',
    frame: { width: right - left, height: bottom - top, anchor: { x: -left, y: -top } },
    scale: 2,
    draw: (scene) => {
      new MapRenderer(scene, map);
      map.spawns.forEach((spawn, i) => {
        const s = tileToScreen(spawn.x, spawn.y);
        const depth = tileDepth(spawn.x, spawn.y) + PLAYER_DEPTH_OFFSET;
        const g = scene.add.graphics().setPosition(s.x, s.y).setDepth(depth);
        drawPlayer(g, PLAYER_COLORS[i] ?? 0xffffff, { x: 0, y: 1 }, playerShape(i + 1));
      });
    },
  };
}

export const SHEET: readonly SheetAsset[] = [
  {
    name: 'tiles/floor',
    notes: 'Office floor, one tile. The grid line is a placeholder aid, not required.',
    frame: TILE_FRAME,
    draw: (scene) => {
      drawFloorTile(scene.add.graphics(), 0, 0, true);
    },
  },
  ...(Object.keys(BLOCK_STYLES) as BlockTile[]).map(blockAsset),
  {
    name: 'tiles/wall-front',
    notes: 'Wall on the camera side of the room: cut down so it never hides players.',
    frame: TILE_FRAME,
    draw: (scene) => {
      drawBlock(scene, 0, 0, 'wall', FRONT_WALL_HEIGHT);
    },
  },
  pipelineAsset(
    'warning',
    'A finished build is waiting too long: the top pulses red with a "!" badge. Shown at the peak of the pulse.',
    { doneTicks: PIPELINE_FAIL_TICKS - PIPELINE_WARN_TICKS },
    0.125,
  ),
  pipelineAsset(
    'broken',
    'Broken pipeline: dark top with smoke and sparks (animated in game; one frame shown).',
    { broken: true },
    0.3,
  ),
  pipelineAsset(
    'repairing',
    'Broken pipeline while a player holds work to repair it, with the repair bar.',
    { broken: true, repair: 0.5 },
    0.3,
  ),
  ...PLAYER_COLORS.flatMap((color, i) =>
    FACINGS.map(({ name, facing }) => ({
      name: `players/player${i + 1}-${name}`,
      notes: `Player ${i + 1} developer facing ${name}. The white nose shows the facing direction; the white hat shape (${playerShape(i + 1)}) tells players apart without color. Needs idle, walk, carry and work animations later.`,
      frame: PLAYER_FRAME,
      draw: (scene: Phaser.Scene) => {
        drawPlayer(scene.add.graphics(), color, facing, playerShape(i + 1));
      },
    })),
  ),
  ticketAsset(
    'feature',
    'new',
    'Feature ticket, nothing done yet. One dot per step: code, test, pipeline.',
    0,
    null,
  ),
  ticketAsset(
    'feature',
    'coded',
    'Feature ticket after coding: done steps fill in with the station color.',
    1,
    null,
  ),
  ticketAsset(
    'feature',
    'working',
    'Feature ticket being worked on, with the work progress bar above it.',
    1,
    0.6,
  ),
  ticketAsset('feature', 'done', 'Feature ticket with every step done, ready to ship.', 3, null),
  ticketAsset(
    'bug',
    'new',
    'Bug ticket: reddish card. Steps: reproduce (test), code, test, pipeline.',
    0,
    null,
  ),
  ticketAsset('bug', 'done', 'Bug ticket with every step done.', 4, null),
  {
    name: 'ui/progress-bar',
    notes: 'Work and repair progress bar, shown half full.',
    frame: { width: 52, height: 14, anchor: { x: 26, y: 3 } },
    draw: (scene) => {
      drawProgressBar(scene.add.graphics(), 0, 0, 0.5);
    },
  },
  levelAsset(),
];
