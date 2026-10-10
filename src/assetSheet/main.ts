import Phaser from 'phaser';
import { BLOCK_STYLES } from '../render/MapRenderer';
import { PLAYER_COLORS } from '../render/playerColors';
import { TILE_SIZE, VIEW_PITCH, VIEW_YAW } from '../render/projection';
import { AssetSheetScene, type RenderedAsset } from './AssetSheetScene';
import { SHEET } from './catalog';
import { zip } from './zip';
import './style.css';

/**
 * Dev-only page (`/assets.html`): renders every placeholder on its own so it
 * can be handed to an artist, and bundles them as a zip with a manifest.
 */

const DEFAULT_SCALE = 4;
const scale = Number(new URLSearchParams(location.search).get('scale')) || DEFAULT_SCALE;

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

function getElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in assets.html`);
  return el;
}

function manifest(rendered: readonly RenderedAsset[]): unknown {
  return {
    view: {
      description:
        'Front-facing 3/4 view (Overcooked style). The floor is squashed vertically by viewPitch; tiles are tileSize wide and tileSize * viewPitch deep on screen. Block heights are in screen pixels.',
      tileSize: TILE_SIZE,
      viewPitch: VIEW_PITCH,
      viewYaw: VIEW_YAW,
      blockHeights: Object.fromEntries(
        Object.entries(BLOCK_STYLES).map(([tile, style]) => [tile, style.height]),
      ),
    },
    colors: {
      tiles: Object.fromEntries(
        Object.entries(BLOCK_STYLES).map(([tile, style]) => [tile, hex(style.color)]),
      ),
      players: PLAYER_COLORS.map(hex),
    },
    assets: rendered.map(({ asset, scale: s }) => ({
      file: `${asset.name}.png`,
      notes: asset.notes,
      scale: s,
      sizeAt1x: { width: asset.frame.width, height: asset.frame.height },
      anchorAt1x: asset.frame.anchor,
    })),
  };
}

async function download(rendered: readonly RenderedAsset[]): Promise<void> {
  const files = await Promise.all(
    rendered.map(async ({ asset, png }) => ({
      name: `placeholders/${asset.name}.png`,
      data: new Uint8Array(await png.arrayBuffer()),
    })),
  );
  files.push({
    name: 'placeholders/manifest.json',
    data: new TextEncoder().encode(JSON.stringify(manifest(rendered), null, 2)),
  });
  const bytes = zip(files);
  const url = URL.createObjectURL(
    new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `isv-placeholders@${scale}x.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function show(rendered: readonly RenderedAsset[]): void {
  const list = getElement('sheet');
  let group = '';
  for (const { asset, png, scale: s } of rendered) {
    const folder = asset.name.split('/')[0] ?? '';
    if (folder !== group) {
      group = folder;
      const h = document.createElement('h2');
      h.textContent = folder;
      list.append(h);
    }
    const card = document.createElement('figure');
    const img = document.createElement('img');
    img.src = URL.createObjectURL(png);
    img.width = asset.frame.width * Math.min(s, 2);
    const caption = document.createElement('figcaption');
    const { width, height, anchor } = asset.frame;
    caption.innerHTML = `<strong></strong><span></span><small></small>`;
    caption.children[0]?.append(asset.name.split('/').slice(1).join('/'));
    caption.children[1]?.append(asset.notes);
    caption.children[2]?.append(
      `${width}×${height} at 1x, anchor ${anchor.x},${anchor.y}, exported at ${s}x`,
    );
    card.append(img, caption);
    list.append(card);
  }
  const button = getElement('download') as HTMLButtonElement;
  button.disabled = false;
  button.addEventListener('click', () => void download(rendered));
  getElement('status').textContent = `${rendered.length} assets at ${scale}x`;
}

for (const s of [1, 2, 4, 8]) {
  const link = document.createElement('a');
  link.href = `?scale=${s}`;
  link.textContent = `${s}x`;
  if (s === scale) link.className = 'current';
  getElement('scales').append(link);
}

const frames = SHEET.map((a) => ({
  w: a.frame.width * (a.scale ?? scale),
  h: a.frame.height * (a.scale ?? scale),
}));

new Phaser.Game({
  type: Phaser.CANVAS,
  parent: getElement('stage'),
  transparent: true,
  width: Math.ceil(Math.max(...frames.map((f) => f.w))),
  height: Math.ceil(Math.max(...frames.map((f) => f.h))),
  scene: new AssetSheetScene(SHEET, scale, show),
});
