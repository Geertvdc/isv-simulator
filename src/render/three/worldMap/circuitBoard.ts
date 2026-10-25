import * as THREE from 'three';
import type { WorldMap } from '../../../flow/worldMap';
import { gridToWorld } from '../../projection';
import { MAP_PALETTE } from '../look';
import { BACKLOT, type GroundTile, labelRects, seeded } from './cityPlan';

/**
 * The world map as a circuit board (phase 20): traces with vias at their
 * ends and silkscreen footprints printed on the island's green tiles, and
 * the dark editor grid the board floats on. Both are canvas textures, drawn
 * once from a fixed seed, so the map looks the same every time.
 */

/** Texture pixels per map tile, and trace cells per tile (traces run on that finer grid). */
const PX = 64;
const CELLS = 4;
const CELL = PX / CELLS;
const TRACE = {
  width: 4,
  via: 6.5,
  hole: 2.6,
  /** About one trace per this many free cells. */
  density: 26,
  minLength: 4,
  maxLength: 16,
  /** The chance a trace bends 45° at a step. */
  bend: 0.18,
};
/** About one silkscreen footprint (a chip or a resistor's pads) per this many grass tiles. */
const FOOTPRINT_EVERY = 8;
/** How far round a level number the board stays plain, so the number reads (tiles). */
const LABEL_CLEAR = 0.3;
/** The overlay lies this high, just over the highest tile tops. */
export const OVERLAY_Y = 0.056;

/** The eight directions on the trace grid, axis-aligned first. */
const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
] as const;
/** Each direction's index in the turning order (45° steps). */
const TURN = [0, 4, 1, 5, 2, 6, 3, 7] as const;

/** A transparent plane over the whole island with the board's traces, vias and silkscreen. */
export function circuitOverlay(map: WorldMap, ground: readonly GroundTile[]): THREE.Mesh {
  const rows = map.height + BACKLOT;
  const canvas = document.createElement('canvas');
  canvas.width = map.width * PX;
  canvas.height = rows * PX;
  const ctx = canvas.getContext('2d');
  if (ctx) drawBoard(ctx, map, ground);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    roughness: 0.6,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(map.width, rows).rotateX(-Math.PI / 2),
    material,
  );
  const center = gridToWorld(map.width / 2, (map.height - BACKLOT) / 2, OVERLAY_Y);
  mesh.position.set(center.x, center.y, center.z);
  mesh.receiveShadow = true;
  // Under the level numbers, which are see-through too.
  mesh.renderOrder = -1;
  return mesh;
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  map: WorldMap,
  ground: readonly GroundTile[],
): void {
  const random = seeded(2020);
  const rows = map.height + BACKLOT;
  const board = new Set<string>();
  for (const t of ground) if (t.kind === 'grass' || t.kind === 'lawn') board.add(`${t.x},${t.y}`);
  const labels = labelRects(map);
  const nearLabel = (x: number, y: number): boolean =>
    labels.some(
      (r) =>
        x > r.x0 - LABEL_CLEAR &&
        x < r.x1 + LABEL_CLEAR &&
        y > r.y0 - LABEL_CLEAR &&
        y < r.y1 + LABEL_CLEAR,
    );
  const w = map.width * CELLS;
  const h = rows * CELLS;
  const free = new Uint8Array(w * h);
  // A cell is free when it lies on green board, away from the level numbers.
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) / CELLS;
      const y = (j + 0.5) / CELLS - BACKLOT;
      if (board.has(`${Math.floor(x)},${Math.floor(y)}`) && !nearLabel(x, y)) free[j * w + i] = 1;
    }
  }
  const isFree = (i: number, j: number): boolean =>
    i >= 0 && j >= 0 && i < w && j < h && free[j * w + i] === 1;
  const center = (i: number, j: number): [number, number] => [
    i * CELL + CELL / 2,
    j * CELL + CELL / 2,
  ];

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Silkscreen footprints first, so traces route round them.
  const footprints = Math.round(board.size / FOOTPRINT_EVERY);
  ctx.strokeStyle = MAP_PALETTE.silkscreen;
  ctx.fillStyle = MAP_PALETTE.silkscreen;
  ctx.font = `700 ${Math.round(PX * 0.24)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  let placed = 0;
  for (let n = 0; n < footprints * 6 && placed < footprints; n++) {
    const chip = random() < 0.5;
    const fw = chip ? 4 + Math.floor(random() * 3) : 3;
    const fh = chip ? 3 : 2;
    const i0 = Math.floor(random() * (w - fw));
    const j0 = Math.floor(random() * (h - fh));
    let clear = true;
    for (let j = j0 - 1; j <= j0 + fh && clear; j++)
      for (let i = i0 - 1; i <= i0 + fw && clear; i++) clear = isFree(i, j);
    if (!clear) continue;
    for (let j = j0; j < j0 + fh; j++) for (let i = i0; i < i0 + fw; i++) free[j * w + i] = 2;
    const x0 = i0 * CELL;
    const y0 = j0 * CELL;
    ctx.lineWidth = 2.5;
    if (chip) {
      // A chip's outline, its pin-1 dot, its pins along both long sides and a part name.
      ctx.strokeRect(x0 + 4, y0 + 6, fw * CELL - 8, fh * CELL - 12);
      ctx.beginPath();
      ctx.arc(x0 + 11, y0 + 13, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = MAP_PALETTE.via;
      for (let k = 0; k < fw; k++) {
        ctx.fillRect(x0 + k * CELL + CELL / 2 - 3, y0, 6, 5);
        ctx.fillRect(x0 + k * CELL + CELL / 2 - 3, y0 + fh * CELL - 5, 6, 5);
      }
      ctx.fillStyle = MAP_PALETTE.silkscreen;
      ctx.fillText(`U${1 + Math.floor(random() * 40)}`, x0 + 9, y0 + (fh * CELL) / 2 + 2);
    } else {
      // A resistor: two pads in a box, a name beside them.
      ctx.strokeRect(x0 + 3, y0 + 3, fw * CELL - 6, fh * CELL - 6);
      ctx.fillStyle = MAP_PALETTE.via;
      ctx.fillRect(x0 + 7, y0 + 8, 10, fh * CELL - 16);
      ctx.fillRect(x0 + fw * CELL - 17, y0 + 8, 10, fh * CELL - 16);
      ctx.fillStyle = MAP_PALETTE.silkscreen;
      const name = `${random() < 0.5 ? 'R' : 'C'}${1 + Math.floor(random() * 60)}`;
      ctx.fillText(name, x0 + 20, y0 + (fh * CELL) / 2 + 1);
    }
    placed++;
  }

  // Traces: walks on the cell grid that bend 45° now and then, a via at each end.
  let freeCells = 0;
  for (const f of free) if (f === 1) freeCells++;
  const traces = Math.round(freeCells / TRACE.density);
  const ends: [number, number][] = [];
  ctx.strokeStyle = MAP_PALETTE.trace;
  ctx.lineWidth = TRACE.width;
  for (let n = 0; n < traces * 3 && ends.length < traces * 2; n++) {
    const si = Math.floor(random() * w);
    const sj = Math.floor(random() * h);
    if (!isFree(si, sj)) continue;
    let dir: number = TURN[Math.floor(random() * 4) * 2] ?? 0;
    const want = TRACE.minLength + Math.floor(random() * (TRACE.maxLength - TRACE.minLength));
    const path: [number, number][] = [[si, sj]];
    let [i, j] = [si, sj];
    for (let step = 0; step < want; step++) {
      if (random() < TRACE.bend) {
        const t = (TURN as readonly number[]).indexOf(dir);
        dir = TURN[(t + (random() < 0.5 ? 1 : 7)) % 8] ?? dir;
      }
      const [dx, dy] = DIRS[dir % DIRS.length] ?? [1, 0];
      if (!isFree(i + dx, j + dy)) break;
      i += dx;
      j += dy;
      path.push([i, j]);
    }
    if (path.length < 4) continue;
    for (const [pi, pj] of path) free[pj * w + pi] = 3;
    ctx.beginPath();
    path.forEach(([pi, pj], k) => {
      const [x, y] = center(pi, pj);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const first = path[0];
    const last = path[path.length - 1];
    if (first && last) ends.push(first, last);
  }
  for (const [i, j] of ends) {
    const [x, y] = center(i, j);
    ctx.fillStyle = MAP_PALETTE.via;
    ctx.beginPath();
    ctx.arc(x, y, TRACE.via, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = MAP_PALETTE.viaHole;
    ctx.beginPath();
    ctx.arc(x, y, TRACE.hole, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Grid squares per texture repeat: a brighter line every `MAJOR` tiles. */
const MAJOR = 4;

/**
 * The sea's texture: a dark editor background with a faint grid, one
 * square per map tile and a brighter line every few, repeated `repeat`
 * times across the sea.
 */
export function seaGridTexture(repeat: number): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const css = (c: number): string => `#${new THREE.Color(c).getHexString()}`;
    ctx.fillStyle = css(MAP_PALETTE.sea);
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = css(MAP_PALETTE.seaGrid);
    const cell = size / MAJOR;
    for (let k = 0; k < MAJOR; k++) {
      const line = k === 0 ? 5 : 2;
      ctx.globalAlpha = k === 0 ? 1 : 0.55;
      ctx.fillRect(k * cell, 0, line, size);
      ctx.fillRect(0, k * cell, size, line);
    }
    ctx.globalAlpha = 1;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat / MAJOR, repeat / MAJOR);
  texture.anisotropy = 8;
  return texture;
}
