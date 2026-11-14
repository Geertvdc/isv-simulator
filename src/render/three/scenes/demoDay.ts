import type { LevelMap } from '../../../sim/level';
import { getTile } from '../../../sim/level';
import { gridToWorld, projectPoint } from '../../projection';
import { firstGroup, tileHash } from '../../mapShape';
import { tint } from '../kit';
import {
  avRack,
  BLACK,
  CASE_SIZES,
  cableSnake,
  cableCoil,
  cableSpools,
  countdownClock,
  feedScreen,
  flightCase,
  footlights,
  hazeMachine,
  hazeWisp,
  heldCase,
  lanyardRail,
  ledWall,
  liveDot,
  monitorWedge,
  pitchSlide,
  promptDesk,
  qaTicker,
  quietSign,
  rackLeds,
  rollUpBanner,
  SCREEN_LIFT,
  seat,
  slideLayout,
  spikeMark,
  streamCamera,
  swagBoxes,
  tapeRolls,
  trussRig,
  visionMixer,
} from '../setDressing/demoDay';
import type { SetPiece } from '../setDressing/shared';
import { scenePose } from './downTheHall';
import { shade } from './ground';
import {
  type AliveKind,
  GROUND,
  type GroundPainter,
  type GroundPatch,
  type Scene,
  type ScenePerson,
  type ScenePiece,
  type ScenePose,
} from './types';

/**
 * Demo Day's world (level 2-2, scene `demo-day`; see
 * `docs/plan/demo-day-environment.md`): the LAUNCHPAD accelerator's stage,
 * where YOTTA builds its product live in front of investors. The room is the
 * stage. Behind it the giant LED wall with YOTTA's pitch slide rises over the
 * back wall between two silver truss towers (moving heads, line arrays, a
 * beam of par cans across the top of the frame), with the camera-feed screen
 * and the Q&A ticker beside it. Left, the wings: flight cases stacked high,
 * cable spools, the stage manager's prompt desk, the "QUIET" sign, the next
 * startup's roll-up banner, a lanyard rail, the next founder rehearsing on
 * the phone and a stagehand with a case. Right, the tech side: the
 * livestream camera and its operator, the vision mixer, the AV rack, the
 * countdown clock, the haze machine; cable snakes from the ship hatches to
 * the vision mixer and on to the screen. In front, the stage lip with
 * footlights and monitor wedges, then the investors' reserved front row.
 * Void tiles become black stage decks with the wings' gear on them.
 *
 * Everything is placed from the level's outline, its void tiles and its ship
 * and inbox tiles, and from where the frame's edges fall for this map (the
 * camera fit at 1440×810), so it fits any map of this level. Pure data.
 */

/** The dark hall round the stage, out to the horizon: near-black blue. */
const HORIZON = 0x121318;
/** The backstage decks: black-grey painted ply. */
const DECK = 0x363944;
/** The hall's carpet: dark navy with a fleck. */
const CARPET = 0x2a2838;
/** The aisle's step lights in the carpet. */
const AISLE_LED = 0xffc27a;
/** The stage lip: how far it runs in front of the level, and how high (the stage's own height). */
const APRON = 0.34;
const APRON_H = 0.445;
/** The LED wall: how far behind the back wall its face stands, how tall its picture is. */
const SCREEN_GAP = 0.14;
const SCREEN_H = 2.65;
/** The truss rig: how tall the towers are, how far the beam reaches past them. */
const RIG_H = 4.5;
const RIG_OVER = 0.95;
/** The screen x the LED wall spans, right of the order cards and left of the mute button. */
const WALL_SPAN = { left: 715, right: 1320 } as const;
/** The screen the scene is composed for. */
const VIEW = { width: 1440, height: 810 };
/** Screen rectangles the HUD covers at 1440×810: story props stay out of them. */
const HUD: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 690, 140],
  [14, 619, 218, 734],
  [0, 755, 135, 810],
  [1320, 755, 1440, 810],
  [1370, 0, 1440, 60],
  [600, 765, 840, 810],
];
/** Where the order cards end on screen (plus a margin): the Q&A ticker shows below them. */
const CARDS = { x: 690, y: 154 } as const;
/** The Q&A ticker's height. */
const TICKER_H = 0.5;
/** The stagehand's hold: how far in front of them, how high, the case sits. */
const CARRY = { reach: 0.34, lift: 0.55 } as const;
/** The living props. */
const ALIVE: ReadonlyMap<SetPiece, AliveKind> = new Map<SetPiece, AliveKind>([
  [liveDot, 'blink'],
  [rackLeds, 'blink'],
  [hazeWisp, 'wisp'],
]);
/** The small light sources that keep their glow and bloom (see `ScenePiece.hot`). */
const HOT_PIECES: readonly SetPiece[] = [
  liveDot,
  rackLeds,
  promptDesk,
  quietSign,
  streamCamera,
  swagBoxes,
  visionMixer,
  countdownClock,
  hazeMachine,
];

type Edge = 'back' | 'front' | 'left' | 'right';
interface Tile {
  x: number;
  z: number;
}

/** A number from 0 to 1 for point (a, b) with `salt`, stirred so nearby points differ. */
function unit(a: number, b: number, salt: number): number {
  let h = tileHash(Math.round(a * 97) + salt * 7919, Math.round(b * 89) - salt * 31);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return ((h >>> 0) % 1000) / 1000;
}

/** Which edge of the map a group of tiles sits on (the inbox, the ship). */
function edgeOf(map: LevelMap, group: readonly Tile[]): Edge | null {
  const p = group[0];
  if (!p) return null;
  if (group.every((t) => t.z === 0)) return 'back';
  if (group.every((t) => t.z === map.height - 1)) return 'front';
  if (group.every((t) => t.x === 0)) return 'left';
  if (group.every((t) => t.x === map.width - 1)) return 'right';
  const d = { back: p.z, front: map.height - 1 - p.z, left: p.x, right: map.width - 1 - p.x };
  return (Object.keys(d) as Edge[]).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/** The scene round `map`: pure and deterministic. */
export function demoDayScene(map: LevelMap): Scene {
  const { width, height } = map;
  const L = -0.5;
  const R = width - 0.5;
  const B = -0.5;
  const F = height - 0.5;
  const pose = scenePose(map);
  /** The world x at screen x `sx`, on the ground (or `lift` above it) at depth z. */
  const xAt = (sx: number, z: number, lift = 0): number => {
    const a = projectPoint(pose, { x: 0, y: GROUND + lift, z });
    const b = projectPoint(pose, { x: 1, y: GROUND + lift, z });
    return (sx - a.x) / (b.x - a.x);
  };
  const midZ = (B + F) / 2;
  const sideL = L - xAt(0, midZ);
  const sideR = xAt(VIEW.width, midZ) - R;

  const tileAt = (x: number, z: number) => getTile(map, x, z);
  const isVoid = (x: number, z: number) => tileAt(x, z) === 'void';
  const isPlay = (x: number, z: number) => {
    const t = tileAt(x, z);
    return t !== null && t !== 'void' && t !== 'wall';
  };
  /** Whether something `high` tall and `half` wide at (x, z) would hide play on screen. */
  const hides = (x: number, z: number, high: number, half: number) => {
    const back = high * 0.85;
    for (let tz = Math.floor(z - back); tz <= Math.round(z); tz++)
      for (let tx = Math.round(x - half); tx <= Math.round(x + half); tx++)
        if (isPlay(tx, tz)) return true;
    return false;
  };
  /**
   * Whether a box `r` round (x, z) (`rz` along z), from `low` up to `high`,
   * stays clear of the HUD on screen.
   */
  const clear = (x: number, z: number, r: number, high: number, rz = r, low = 0) => {
    const pts = [];
    for (const dx of [-r, r])
      for (const dz of [-rz, rz])
        for (const y of [low, high])
          pts.push(projectPoint(pose, { x: x + dx, y: GROUND + y, z: z + dz }));
    const x0 = Math.min(...pts.map((p) => p.x)) - 2;
    const x1 = Math.max(...pts.map((p) => p.x)) + 2;
    const y0 = Math.min(...pts.map((p) => p.y)) - 2;
    const y1 = Math.max(...pts.map((p) => p.y)) + 2;
    return HUD.every(([a, b, c, d]) => x1 <= a || x0 >= c || y1 <= b || y0 >= d);
  };
  const ship = firstGroup(map, 'ship').map((p) => ({ x: p.x, z: p.y }));
  const inbox = firstGroup(map, 'inbox').map((p) => ({ x: p.x, z: p.y }));
  const shipEdge = edgeOf(map, ship);
  const inboxEdge = edgeOf(map, inbox);
  const mid = (g: readonly Tile[], k: 'x' | 'z') =>
    g.length > 0 ? g.reduce((s, t) => s + t[k], 0) / g.length : 0;
  /** Each ship hatch on the front edge: its tiles' middle x. */
  const shipHatches: number[] = [];
  map.tiles.forEach((t, i) => {
    const x = i % width;
    const z = Math.floor(i / width);
    if (t === 'ship' && z === height - 1 && tileAt(x - 1, z) !== 'ship')
      shipHatches.push(x + (tileAt(x + 1, z) === 'ship' ? 0.5 : 0));
  });
  /** The front of the level in column x: past its last tile that isn't void. */
  const frontOf = (x: number): number => {
    for (let z = height - 1; z >= 0; z--) if (!isVoid(x, z)) return z + 0.5;
    return B;
  };

  const pieces: ScenePiece[] = [];
  const ground: GroundPatch[] = [];
  const people: ScenePerson[] = [];
  const hot = new Set<SetPiece>(HOT_PIECES);
  let n = 0;
  /** Puts `piece` with its origin at (x, z), on the ground or `lift` above it. */
  const put = (
    piece: SetPiece,
    x: number,
    z: number,
    yaw = 0,
    variant = 0,
    row: ScenePiece['row'] = 'near',
    lift = 0,
  ) => {
    const i = n++;
    const bright = 0.93 + unit(i, 1, 3) * 0.1;
    const cool = (unit(i, 2, 5) * 2 - 1) * 0.03;
    const alive = ALIVE.get(piece);
    pieces.push({
      piece,
      variant: variant % (piece.variants ?? 1),
      at: gridToWorld(x, z, GROUND + lift),
      yaw,
      scale: [1, 1, 1],
      tint: [bright * (1 - cool), bright, bright * (1 + cool)],
      row,
      ...(alive ? { alive } : {}),
      ...(hot.has(piece) ? { hot: true } : {}),
    });
  };
  /** Puts a near prop `r` round and `high` tall only where it keeps clear of the HUD. */
  const putClear = (
    piece: SetPiece,
    x: number,
    z: number,
    r: number,
    high: number,
    yaw = 0,
    variant = 0,
    lift = 0,
  ): boolean => {
    if (!clear(x, z, r, high + lift)) return false;
    put(piece, x, z, yaw, variant, 'near', lift);
    return true;
  };
  /** A stack of flight cases at (x, z), `count` high, the biggest at the bottom; returns its height. */
  const stack = (x: number, z: number, count: number, salt: number, yaw = 0): number => {
    let lift = 0;
    const looks = [3, 1, 4, 0, 2];
    for (let k = 0; k < count; k++) {
      const v = looks[(k + salt) % looks.length] ?? 0;
      const [, h] = CASE_SIZES[v] ?? [0, 0.4, 0];
      const jig = (unit(x, z + k, salt) - 0.5) * 0.12;
      if (!clear(x, z, 0.55, lift + h)) break;
      put(flightCase, x + jig * 0.4, z + jig * 0.3, yaw + jig, v, 'near', lift);
      lift += h;
    }
    return lift;
  };
  const patch = (kind: string, x0: number, x1: number, z0: number, z1: number) =>
    ground.push({ kind, x0, x1, z0, z1 });
  const person = (x: number, z: number, yaw: number, pose: ScenePose) =>
    people.push({ at: gridToWorld(x, z, GROUND), yaw, pose });

  const outL = L - Math.max(4, sideL + 1);
  const outR = R + Math.max(4, sideR + 1);
  const lip = F + APRON;

  // ---- Ground: black stage decks round the level, the stage lip in front, the hall's carpet past it ----
  patch('decks', outL - 6, outR + 6, B - 10, lip);
  patch('carpet', -40, width + 40, lip, lip + 12);
  // The lip runs along the level's front, round any notch of void in it.
  for (let x = 0; x < width;) {
    const f = frontOf(x);
    let e = x + 1;
    while (e < width && frontOf(e) === f) e++;
    patch('apron', x - 0.5, e - 0.5, f, lip);
    x = e;
  }
  // Side strips of the lip past the level's corners, so it reads as one stage edge.
  patch('apron', L - 0.6, L, F, lip);
  patch('apron', R, R + 0.6, F, lip);

  // ---- Back: the LED wall, its truss rig, the camera-feed screen and the Q&A ticker ----
  const zs = B - SCREEN_GAP;
  const wallMid = SCREEN_LIFT + SCREEN_H / 2;
  const spanL = xAt(WALL_SPAN.left, zs, wallMid);
  const spanR = xAt(WALL_SPAN.right, zs, wallMid);
  const sw = Math.max(7.5, Math.round((spanR - spanL) * 2) / 2);
  const shipX = shipEdge === 'back' && ship.length > 0 ? mid(ship, 'x') : undefined;
  const cx =
    shipX !== undefined
      ? Math.min(spanR - sw / 2 + 0.6, Math.max(spanL + sw / 2, shipX))
      : (spanL + spanR) / 2;
  put(ledWall(sw, SCREEN_H), cx, zs, 0, 0, 'far');
  const slide = pitchSlide(sw, SCREEN_H);
  hot.add(slide);
  put(slide, cx, zs, 0, 0, 'far');
  // The red dot by LIVE DEMO, on the slide.
  const slideAt = slideLayout(sw, SCREEN_H);
  put(liveDot, cx + slideAt.dotX, zs + 0.01, 0, 0, 'far', SCREEN_LIFT + slideAt.liveY - 0.1);
  const span = sw + 0.7;
  const rig = trussRig(span, RIG_H, RIG_OVER);
  hot.add(rig);
  put(rig, cx, zs - 0.35, 0, 0, 'far');
  // Left of the rig: the camera-feed screen up high, the Q&A ticker low over the back wall.
  const towerL = cx - span / 2;
  const feedW = 3.0;
  const feedX = towerL - RIG_OVER - 0.1 - feedW / 2;
  put(feedScreen(feedW, 1.75, 2.15), feedX, zs - 0.1, 0, 0, 'far');
  const tickR = towerL - 0.45;
  const tickL = Math.max(L - 1.5, xAt(40, zs, 1.5));
  // Low enough that its top shows below the order cards; dropped if that would sink it behind the back wall.
  const tickTop = (lift: number) =>
    Math.min(
      ...[tickL, (tickL + tickR) / 2, tickR]
        .map((x) => projectPoint(pose, { x, y: GROUND + lift + TICKER_H + 0.06, z: zs }))
        .filter((p) => p.x < CARDS.x)
        .map((p) => p.y),
      Infinity,
    );
  let tickLift = SCREEN_LIFT;
  while (tickTop(tickLift) < CARDS.y && tickLift > SCREEN_LIFT - 0.35) tickLift -= 0.02;
  if (tickR - tickL > 2.5 && tickTop(tickLift) >= CARDS.y)
    put(qaTicker(tickR - tickL, TICKER_H, tickLift), (tickL + tickR) / 2, zs + 0.02, 0, 0, 'far');

  // ---- Left: the wings ----
  const wingIn = L - 0.75;
  // Where the wings meet the stage: by a stage door on the left edge, else halfway down.
  const doorZ = inboxEdge === 'left' && inbox.length > 0 ? mid(inbox, 'z') : midZ;
  // A wall of flight cases along the back of the wings, stacked high.
  for (let k = 0, x = wingIn; x > outL + 0.5 && k < 6; k++, x -= 0.95) {
    const z = B + 0.15 + unit(k, 1, 7) * 0.2;
    stack(x, z, 2 + (k % 2), k);
  }
  put(rollUpBanner, L - 2.4, B + 0.95, 0.15, 0);
  put(rollUpBanner, L - 3.25, B + 0.9, -0.1, 1);
  put(cableSpools, wingIn - 0.15, B + 1.35, 0.1);
  put(lanyardRail, L - 3.1, B + 2.0, 0.2);
  // The stage manager's corner by the stage entrance: the prompt desk, the QUIET sign, a cue.
  const pmZ = Math.max(B + 2.6, doorZ - 1.6);
  putClear(promptDesk, wingIn - 0.05, pmZ, 0.4, 1.25, Math.PI / 2 - 0.25);
  putClear(quietSign, wingIn - 0.25, pmZ - 0.85, 0.45, 1.7, 0.45);
  put(spikeMark, wingIn + 0.2, doorZ + 0.3, 0.3, 1);
  // The next founder rehearsing their pitch on the phone, a stagehand with a case.
  /** A spot for a person at depth z: `out` from the stage, but in frame and a tile clear of it. */
  const wingX = (out: number, z: number) => Math.min(L - 1.1, Math.max(L - out, xAt(50, z) + 0.35));
  const fz = doorZ + 0.55;
  person(wingX(2.35, fz), fz, 0.9, 'phoning');
  const hz = Math.min(F - 2.2, doorZ + 2.1);
  const hx = wingX(1.75, hz);
  const hyaw = Math.PI * 0.85;
  if (clear(hx, hz, 0.4, 1.3)) {
    person(hx, hz, hyaw, 'carrying');
    put(
      heldCase,
      hx + Math.sin(hyaw) * CARRY.reach,
      hz + Math.cos(hyaw) * CARRY.reach,
      hyaw,
      0,
      'near',
      CARRY.lift,
    );
  }
  // More cases toward the front of the wings, low, where the frame's corner allows.
  stack(wingIn - 0.2, doorZ + 1.4, 2, 3, 0.1);
  stack(L - 2.8, doorZ - 0.6, 2, 5, -0.15);
  stack(L - 1.0, F - 1.0, 1, 2, 0.05);
  stack(L - 2.2, F - 0.8, 1, 4, -0.1);
  putClear(tapeRolls, L - 1.6, F - 1.7, 0.2, 0.1, 0.4);
  putClear(cableCoil, wingIn - 0.1, doorZ - 0.6, 0.25, 0.1, 0.3, 0);
  putClear(swagBoxes, L - 1.9, B + 2.85, 0.45, 0.65, 0.25);
  putClear(swagBoxes, L - 3.4, doorZ + 1.6, 0.45, 0.65, -0.4);
  putClear(cableCoil, L - 3.3, F - 1.6, 0.25, 0.1, 1.1, 1);
  // Glow tape marking the walkway's edge either side of the stage.
  patch('tape', L - 0.62, L - 0.58, B + 0.9, F - 0.1);
  patch('tape', R + 0.58, R + 0.62, B + 2.6, F - 0.1);
  // ---- Right: the tech side ----
  const techIn = R + 0.8;
  // The vision mixer, where the ship hatches' feeds come in and go up to the screen.
  const mixZ = Math.min(F - 2.2, Math.max(B + 2.4, midZ - 0.6));
  const mixX = Math.min(R + sideR - 0.9, R + 2.2);
  put(visionMixer, mixX, mixZ, -Math.PI / 2 + 0.35);
  // The livestream camera on its tripod aimed at the stage, its operator behind it.
  // Kept inside the frame's right edge, which comes in toward the front.
  const camZ = Math.min(F - 1.4, mixZ + 1.9);
  const opX = Math.max(R + 1.3, Math.min(techIn + 0.95, xAt(VIEW.width - 45, camZ) - 0.25));
  putClear(streamCamera, opX - 0.8, camZ, 0.35, 1.55, -Math.PI / 2 + 0.15);
  person(opX, camZ + 0.05, -Math.PI / 2 + 0.15, 'idle');
  putClear(cableCoil, opX - 0.35, camZ + 0.75, 0.25, 0.1, 0.4, 1);
  // The AV rack and flight cases at the back, the haze machine toward the stage.
  put(avRack, techIn + 0.1, B + 0.45, -0.25);
  put(rackLeds, techIn + 0.1, B + 0.45, -0.25);
  stack(techIn + 0.95, B + 0.1, 3, 1);
  stack(techIn + 1.9, B + 0.25, 2, 4);
  stack(techIn + 1.2, B + 1.25, 1, 2, 0.2);
  put(hazeMachine, techIn + 0.4, B + 2.0, -Math.PI / 2 - 0.3);
  const wispYaw = -Math.PI / 2 - 0.3;
  put(
    hazeWisp,
    techIn + 0.4 + Math.sin(wispYaw) * 0.32,
    B + 2.0 + Math.cos(wispYaw) * 0.32,
    wispYaw,
    0,
    'near',
    0.08,
  );
  // The countdown clock at the front corner, turned to the stage (and the camera).
  for (let z = F - 0.55; z > B + 2.5; z -= 0.4) {
    const x = Math.min(techIn + 0.35, xAt(VIEW.width - 30, z, 1.4) - 0.5);
    // Never in front of the camera operator, nor on the mixer.
    if ((z > camZ - 1.0 && z < camZ + 2.0) || Math.abs(z - mixZ) < 0.9) continue;
    if (x > R + 0.55 && putClear(countdownClock, x, z, 0.5, 1.6, -0.75)) break;
  }
  stack(mixX + 0.2, mixZ - 1.1, 2, 2, 0.1);
  putClear(tapeRolls, techIn + 1.4, F - 1.5, 0.2, 0.1, -0.6);

  // Out by the frame's edges, more gear, so the floor never runs empty to the edge.
  const edgeR = (z: number) => xAt(VIEW.width - 40, z) - 0.5;
  const edgeL = (z: number) => xAt(40, z) + 0.5;
  if (edgeR(B + 1.7) > techIn + 2.4) stack(edgeR(B + 1.7), B + 1.7, 2, 6, -0.2);
  if (edgeR(F - 1.7) > R + 1.5)
    putClear(cableSpools, edgeR(F - 1.7) - 0.1, F - 1.7, 0.5, 0.95, -Math.PI / 2 + 0.2);
  if (edgeR(F - 0.5) > R + 1.3) stack(edgeR(F - 0.5), F - 0.5, 1, 3, 0.3);
  if (edgeL(midZ - 2.2) < L - 3.0) stack(edgeL(midZ - 2.2), midZ - 2.2, 3, 2, 0.1);
  if (edgeL(midZ + 2.4) < L - 3.0)
    putClear(cableSpools, edgeL(midZ + 2.4), midZ + 2.4, 0.5, 0.95, Math.PI / 2 + 0.3);

  // ---- Cable snakes: the ship hatches' feeds to the mixer, the mixer's to the screen ----
  const snakeX = R + 0.3;
  if (shipEdge === 'front') {
    // Along the lip from each hatch to the stage's right corner, then up the tech side.
    const sz = F + APRON * 0.55;
    const from = Math.min(...shipHatches);
    put(cableSnake(snakeX - from), from, sz, 0, 0, 'near', APRON_H);
    put(cableSnake(F - 0.05 - mixZ), snakeX, F - 0.05, Math.PI / 2, 0);
  }
  // Mixer to the screen: back along the tech side and in behind the back wall to the rig.
  put(cableSnake(mixZ - (B - 0.25)), snakeX + 0.25, mixZ, Math.PI / 2, 0);
  const towerR = cx + span / 2;
  const s0 = Math.min(towerR, snakeX + 0.25);
  const s1 = Math.max(towerR, snakeX + 0.25);
  if (s1 - s0 > 0.2) put(cableSnake(s1 - s0), s0, B - 0.25, 0, 0);

  // ---- Front: footlights and monitor wedges on the lip, the investors' front row ----
  // One warm strip along the whole lip, its side strips too, wherever the HUD allows.
  for (let k = -1; k <= width * 2; k++) {
    const x0 = k < 0 ? L - 0.6 : k === width * 2 ? R : L + k * 0.5;
    const len = k < 0 || k === width * 2 ? 0.6 : 0.5;
    if (clear(x0 + len / 2, F + APRON - 0.03, len / 2, APRON_H + 0.08, 0.05, APRON_H)) {
      const strip = footlights(len);
      hot.add(strip);
      put(strip, x0, F + APRON - 0.03, 0, 0, 'near', APRON_H);
    }
  }
  for (let x = 1; x < width - 1; x++) {
    const f = frontOf(x);
    const facing = getTile(map, x, Math.round(f - 0.5));
    if (facing !== 'wall' || x % 4 !== 1) continue;
    putClear(monitorWedge, x, f + APRON * 0.45, 0.25, APRON_H + 0.13, 0, 0, APRON_H);
  }
  // A notch of void in the level's front is more stage: a wedge, cases, a coil of cable.
  // A run of three or more gets a cluster: flight cases at its back end, a wedge, tape and a coil.
  const notches = [...Array(width).keys()].filter((x) => frontOf(x) < F - 0.01);
  /** A flight case on the notch's deck, if it hides no play and keeps clear of the HUD. */
  const notchCase = (x: number, z: number, v: number, lift: number, yaw: number): number => {
    const [w, h, d] = CASE_SIZES[v] ?? [0.6, 0.4, 0.5];
    if (hides(x, z, lift + h, w / 2) || !clear(x, z, w / 2 + 0.06, lift + h, d / 2 + 0.06, lift))
      return 0;
    put(flightCase, x, z, yaw, v, 'near', lift);
    return h;
  };
  for (let k = 0; k < notches.length;) {
    let e = k;
    while (
      notches[e + 1] === (notches[e] ?? 0) + 1 &&
      frontOf(notches[e + 1] ?? 0) === frontOf(notches[k] ?? 0)
    )
      e++;
    const a = notches[k] ?? 0;
    const b = notches[e] ?? 0;
    const z = frontOf(a) + 0.55;
    if (b - a >= 2) {
      // Flight cases from the run's wall end in (the first spots the HUD and the play behind leave),
      // one more on top, then tape, a coil and a wedge, all inside the run.
      const leftEnd = a === 0 || !isVoid(a - 1, Math.round(z));
      const dir = leftEnd ? 1 : -1;
      const inRun = (x: number, r: number) => Math.min(b + 0.45 - r, Math.max(a - 0.45 + r, x));
      const start = leftEnd ? a - 0.5 : b + 0.5;
      let first = -1;
      let h0 = 0;
      const cases: [number, number][] = [];
      for (let u = 0.3; cases.length < 2 && u < b - a + 0.7; u += 0.05) {
        const x = start + dir * u;
        for (const v of [1, 4, 2]) {
          const [w] = CASE_SIZES[v] ?? [0.8];
          if (x !== inRun(x, w / 2 + 0.02)) continue;
          if (cases.some(([q, wq]) => Math.abs(q - x) < (w + wq) / 2 + 0.06)) continue;
          const h = notchCase(x, z - 0.02, v, APRON_H, (cases.length ? -0.08 : 0.05) * dir);
          if (h === 0) continue;
          if (first < 0) {
            first = x;
            h0 = h;
          }
          cases.push([x, w]);
          break;
        }
      }
      if (first >= 0 && h0 > 0)
        notchCase(first + 0.04 * dir, z - 0.04, 2, APRON_H + h0, 0.18 * dir);
      const free = [...Array(b - a + 1).keys()]
        .map((i) => a + i)
        .filter((x) => !cases.some(([q, w]) => Math.abs(q - x) < w / 2 + 0.3))
        .filter((x) => clear(x, z, 0.3, APRON_H + 0.15));
      const [p0, p1, p2] = dir > 0 ? free : free.reverse();
      if (p0 !== undefined)
        putClear(monitorWedge, inRun(p0, 0.25), z, 0.25, APRON_H + 0.13, 0, 0, APRON_H);
      if (p1 !== undefined)
        putClear(tapeRolls, inRun(p1, 0.2), z + 0.08, 0.2, APRON_H + 0.1, 0.4, 0, APRON_H);
      if (p2 !== undefined)
        putClear(cableCoil, inRun(p2, 0.3), z + 0.02, 0.25, APRON_H + 0.1, 0.9, 1, APRON_H);
    } else
      for (let x = a; x <= b; x++) {
        if (unit(x, 0, 41) < 0.5) putClear(monitorWedge, x, z, 0.25, APRON_H + 0.13, 0, 0, APRON_H);
        else putClear(tapeRolls, x, z, 0.2, APRON_H + 0.1, 0.3, 0, APRON_H);
      }
    k = e + 1;
  }
  // The front row: black seats, every one reserved, a phone glowing here and there; an aisle where the pause hint is.
  const seatZ = lip + 0.32;
  hot.add(seat);
  // A seat that won't fit by the HUD slides up to a fifth of a seat either way, so the rows run to its edges.
  let lastSeat = -Infinity;
  for (let x = xAt(0, seatZ) + 0.15, k = 0; x < xAt(VIEW.width, seatZ) + 0.3; x += 0.56, k++) {
    const v = unit(k, 3, 13) < 0.22 ? 1 : unit(k, 4, 13) < 0.15 ? 2 : 0;
    for (const dx of [0, -0.12, 0.12, -0.2]) {
      if (x + dx - lastSeat < 0.52) continue;
      if (putClear(seat, x + dx, seatZ, 0.25, 0.58, 0, v)) {
        lastSeat = x + dx;
        break;
      }
    }
  }
  // Step lights in the carpet either side of the aisle under the pause hint, and out at the rows' ends.
  const aisleZ = seatZ - 0.05;
  for (const sx of [600, 840]) {
    const x = xAt(sx, aisleZ);
    patch('aisle', x - 0.05, x + 0.05, lip + 0.05, lip + 2.5);
  }
  patch('aisle', xAt(0, aisleZ), xAt(VIEW.width, aisleZ), lip + 0.06, lip + 0.12);

  // ---- Void tiles inside the outline: black stage decks with the wings' gear on them ----
  const voids: Tile[] = map.tiles.flatMap((t, i) =>
    t === 'void' ? [{ x: i % width, z: Math.floor(i / width) }] : [],
  );
  const inner = voids.filter((t) => t.z < frontOf(t.x) - 0.5);
  inner.sort((a, b) => a.z - b.z || a.x - b.x);
  inner.forEach((t, k) => {
    const spot = unit(t.x, t.z, 19);
    const backRow = !isVoid(t.x, t.z - 1);
    if (backRow && !hides(t.x, t.z, 1.6, 0.4)) {
      if (k % 4 === 1) put(rollUpBanner, t.x, t.z - 0.2, 0.1, k >> 2);
      else if (k % 4 === 2) put(lanyardRail, t.x, t.z - 0.1, -0.1);
      else stack(t.x + (spot - 0.5) * 0.2, t.z - 0.1, 2 + (k % 2), k);
    } else if (!hides(t.x, t.z, 0.9, 0.4)) {
      if (k % 3 === 0) put(cableSpools, t.x, t.z, 0.2 + spot);
      else if (k % 3 === 1) put(swagBoxes, t.x, t.z, spot - 0.5);
      else {
        stack(t.x, t.z, 1, k + 2, spot - 0.5);
        if (isVoid(t.x - 1, t.z) && isVoid(t.x + 1, t.z) && !isPlay(t.x, t.z + 1))
          put(cableCoil, t.x + 0.1, t.z + 0.1, spot * 3, k);
      }
    } else put(spikeMark, t.x, t.z, spot * 3, k);
  });

  return { horizon: HORIZON, ground, painters: PAINTERS, pieces, people, tufts: [] };
}

// ---- The scene's own ground ----

/**
 * Backstage stage decks: black-grey painted ply in 2×1 panels, each its own
 * shade, thin lighter joints, the odd strip of spike or glow tape.
 */
const decks: GroundPainter = (b, g, salt) => {
  const top = 0.02;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(
    w,
    top - 0.004,
    d,
    tint(DECK, 0.12),
    { at: [(g.x0 + g.x1) / 2, (top - 0.004) / 2, (g.z0 + g.z1) / 2] },
    0,
  );
  const pw = 2;
  const pd = 1;
  for (let j = 0, z = g.z0; z < g.z1; j++, z += pd) {
    const off = j % 2 ? pw / 2 : 0;
    for (let i = 0, x = g.x0 - off; x < g.x1; i++, x += pw) {
      const xa = Math.max(g.x0, x + 0.012);
      const xb = Math.min(g.x1, x + pw - 0.012);
      const za = z + 0.012;
      const zb = Math.min(g.z1, z + pd - 0.012);
      if (xb - xa < 0.05 || zb - za < 0.05) continue;
      const s = shade(i, j, salt);
      b.box(
        xb - xa,
        0.006,
        zb - za,
        tint(DECK, (s - 0.5) * 0.1),
        {
          at: [(xa + xb) / 2, top, (za + zb) / 2],
        },
        0,
      );
      // Scuffs and the odd tape mark.
      if (s > 0.86)
        b.box(
          0.5,
          0.004,
          0.04,
          tint(DECK, 0.25),
          { at: [xa + (xb - xa) * 0.4, top + 0.004, za + 0.3] },
          0,
        );
    }
  }
};

/**
 * The stage lip: a black deck at the stage's height with a lighter nosing
 * strip along its front edge (the LED edge line) and a dark fascia below.
 */
const apron: GroundPainter = (b, g) => {
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const cx = (g.x0 + g.x1) / 2;
  b.box(w, APRON_H, d, 0x1b1c21, { at: [cx, APRON_H / 2, (g.z0 + g.z1) / 2] }, 0);
  b.box(w, 0.006, d - 0.02, 0x30323a, { at: [cx, APRON_H + 0.003, (g.z0 + g.z1) / 2 - 0.01] }, 0);
  // The white edge line on the nosing, and a glow-tape strip just in from it.
  b.box(w, 0.006, 0.025, 0xd8d8e0, { at: [cx, APRON_H + 0.005, g.z1 - 0.02] }, 0);
  b.box(w, 0.025, 0.01, 0x8a7ae0, { at: [cx, APRON_H - 0.05, g.z1 + 0.003] }, 0);
  for (let x = g.x0 + 0.5; x < g.x1; x += 1.0)
    b.box(0.01, 0.007, d - 0.04, 0x26272d, { at: [x, APRON_H + 0.004, (g.z0 + g.z1) / 2] }, 0);
};

/** The hall's carpet: dark navy, a faint diamond fleck, the aisle lights' strip near the stage. */
const carpet: GroundPainter = (b, g, salt) => {
  const top = 0.012;
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  b.box(w, top, d, CARPET, { at: [(g.x0 + g.x1) / 2, top / 2, (g.z0 + g.z1) / 2] }, 0);
  for (let z = g.z0 + 0.15; z < Math.min(g.z1, g.z0 + 3); z += 0.3)
    for (let x = Math.floor(g.x0) + ((z * 10) % 2 > 1 ? 0.15 : 0); x < g.x1; x += 0.3) {
      if (x < -6 || x > 30) continue;
      if (shade(Math.round(x * 10), Math.round(z * 10), salt) > 0.5) continue;
      b.box(
        0.05,
        0.003,
        0.05,
        tint(CARPET, 0.12),
        { at: [x, top + 0.001, z], rot: [0, Math.PI / 4, 0] },
        0,
      );
    }
  b.box(w, 0.004, 0.06, BLACK, { at: [(g.x0 + g.x1) / 2, top + 0.002, g.z0 + 0.04] }, 0);
};

/** A dashed line of glow tape (pale green) along the patch's long side. */
const tape: GroundPainter = (b, g) => {
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const alongZ = d > w;
  const len = alongZ ? d : w;
  for (let u = 0.1; u < len - 0.2; u += 0.5) {
    const at: [number, number, number] = alongZ
      ? [(g.x0 + g.x1) / 2, 0.03, g.z0 + u + 0.15]
      : [g.x0 + u + 0.15, 0.03, (g.z0 + g.z1) / 2];
    b.box(alongZ ? w : 0.3, 0.004, alongZ ? 0.3 : d, 0x9ad8b0, { at }, 0);
  }
};

/**
 * The aisle's step lights: small warm LEDs set in the carpet, along the
 * patch's long side every 0.4 (sparser on a long run across the hall).
 */
const aisle: GroundPainter = (b, g) => {
  const w = g.x1 - g.x0;
  const d = g.z1 - g.z0;
  const alongZ = d > w;
  const len = alongZ ? d : w;
  const step = alongZ ? 0.4 : 1.6;
  for (let u = 0.1; u < len; u += step) {
    const at: [number, number, number] = alongZ
      ? [(g.x0 + g.x1) / 2, 0.016, g.z0 + u]
      : [g.x0 + u, 0.016, (g.z0 + g.z1) / 2];
    b.box(0.06, 0.006, 0.04, AISLE_LED, { at }, 0);
  }
};

const PAINTERS: Readonly<Record<string, GroundPainter>> = { decks, apron, carpet, tape, aisle };
