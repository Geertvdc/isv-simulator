/// <reference types="node" />

/**
 * Capacity benchmark for the online server (`npm run bench:rooms`): how much
 * CPU, bandwidth and memory one 4-player room costs, to plan how many rooms
 * one server process (one core) holds. See "Scaling" in
 * `docs/plan/azure-hosting.md`.
 *
 * It drives the real room logic (`server/roomLogic.ts`, `server/round.ts`)
 * the way `GameRoom.ts` does, without any networking: four members with one
 * player each join, ready up and play a level, every player a bot from
 * `src/sim/bot.ts` sending one `inputs` message per tick like a client does
 * per frame. Timed per tick: the members' input messages plus `stepRoom`
 * (flow, sim, input buffers, building the snapshot every 3rd tick). Timed
 * per snapshot: encoding it the way Colyseus does (`getMessageBytes.raw`,
 * msgpack, once per broadcast; the same bytes go to every client).
 * The bots' own thinking runs on the clients and isn't timed.
 *
 * Not measured: the WebSocket writes (one per client per snapshot) and
 * Colyseus's own bookkeeping, hence the 50% busy budget.
 *
 *   npm run bench:rooms -- [--seconds=60] [--rooms=50] [--levels=garage,hackathon]
 *
 * `--seconds`: game time played per level (default 60). `--levels`: level
 * ids (default every campaign level). `--rooms`: rooms kept alive at once
 * for the memory measurement (default 50). Seeds are fixed, so runs play the
 * same; only the timings vary.
 */

import { runInNewContext } from 'node:vm';
import { setFlagsFromString } from 'node:v8';
import { deflateRawSync } from 'node:zlib';
import { Protocol, getMessageBytes } from 'colyseus';
import { COUNTDOWN_MS } from '../src/flow/flow';
import type { DevicePress } from '../src/input/controller';
import { PROTOCOL_VERSION, type ServerMessage } from '../src/net/protocol';
import { NET_SNAPSHOT_EVERY_TICKS, TICKS_PER_SECOND } from '../src/sim/balance';
import { type Bot, botInput, createBot } from '../src/sim/bot';
import { MAX_PLAYERS } from '../src/sim/level';
import { LEVELS } from '../src/sim/levels';
import { joinRoom, setMemberProfile } from '../server/membership';
import { type Outgoing, type RoomState, TICK_MS, createRoomState } from '../server/room';
import { handleMessage } from '../server/roomLogic';
import { stepRoom } from '../server/round';

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}
const seconds = Number(arg('seconds') ?? 60);
const roomCount = Number(arg('rooms') ?? 50);
const levelIds = arg('levels')?.split(',') ?? LEVELS.map((l) => l.id);
if (!(seconds > 0) || !(roomCount > 0)) throw new Error('--seconds and --rooms must be > 0');
for (const id of levelIds) {
  if (!LEVELS.some((l) => l.id === id)) throw new Error(`Unknown level '${id}'`);
}

const SESSIONS = Array.from({ length: MAX_PLAYERS }, (_, i) => `p${i + 1}`);
const DEVICE = 'kb-left';
const SNAPSHOTS_PER_SECOND = TICKS_PER_SECOND / NET_SNAPSHOT_EVERY_TICKS;
/** WebSocket frame header for a server-to-client binary frame up to 64 KB. */
const WS_FRAME_HEADER = 4;

function press(buttons: Partial<DevicePress> = {}): DevicePress {
  return {
    deviceId: DEVICE,
    joinGroup: 'kb',
    join: false,
    interact: false,
    dash: false,
    menu: false,
    nav: { x: 0, y: 0 },
    ...buttons,
  };
}

function menu(room: RoomState, sessionId: string, buttons: Partial<DevicePress>): void {
  handleMessage(room, sessionId, { type: 'menu', presses: [press(buttons)] });
  stepRoom(room);
}

function expectScreen(room: RoomState, screen: string): void {
  if (room.flow.screen !== screen) {
    throw new Error(`Expected the ${screen} screen, the room is on ${room.flow.screen}`);
  }
}

/**
 * A room of four members with one player each, every level unlocked (the
 * host's profile), from the lobby to the first tick of `levelId`, played for
 * `roundTicks`. Each member's bot plays their player.
 */
function playingRoom(levelId: string, seed: number, roundTicks: number): RoomState {
  const room = createRoomState(`B${seed}`, seed, { roundTicks });
  for (const sessionId of SESSIONS) {
    const joined = joinRoom(room, sessionId, {
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      userId: `bench-${sessionId}`,
      displayName: sessionId,
      localPlayers: 1,
    });
    if (!joined.ok) throw new Error(joined.reason);
  }
  const record = { bestStars: 3, bestScore: 1, plays: 1 };
  setMemberProfile(room, 'p1', Object.fromEntries(LEVELS.map((l) => [l.id, record])));
  for (const sessionId of SESSIONS) menu(room, sessionId, { join: true });
  menu(room, 'p1', { interact: true });
  expectScreen(room, 'levelSelect');
  // The host moving the level select's cursor to the level.
  room.flow.levelIndex = LEVELS.findIndex((l) => l.id === levelId);
  menu(room, 'p1', { interact: true });
  expectScreen(room, 'intro');
  for (const sessionId of SESSIONS) menu(room, sessionId, { interact: true });
  for (let i = 0; i < Math.ceil(COUNTDOWN_MS / TICK_MS) + 1; i++) stepRoom(room);
  expectScreen(room, 'playing');
  return room;
}

/** Each member's bot, by the player bound to their keyboard. */
function botsOf(room: RoomState): { sessionId: string; bot: Bot }[] {
  return room.flow.lobby.players.map((p) => ({
    sessionId: p.deviceId.split(':')[0] ?? '',
    bot: createBot(p.playerId),
  }));
}

/** Every member's `inputs` message for the tick that runs next: what their clients would send. */
function botMessages(
  room: RoomState,
  bots: { sessionId: string; bot: Bot }[],
): [string, unknown][] {
  const game = room.game;
  if (!game) return [];
  const all = bots.map((b) => b.bot);
  return bots.map(({ sessionId, bot }) => [
    sessionId,
    { type: 'inputs', inputs: [{ ...botInput(game, bot, all), tick: room.serverTick }] },
  ]);
}

interface Sample {
  tickMs: number[];
  encodeMs: number[];
  msgpackBytes: number[];
  jsonBytes: number[];
  msgpackDeflateBytes: number[];
  jsonDeflateBytes: number[];
  score: number;
}

function emptySample(): Sample {
  return {
    tickMs: [],
    encodeMs: [],
    msgpackBytes: [],
    jsonBytes: [],
    msgpackDeflateBytes: [],
    jsonDeflateBytes: [],
    score: 0,
  };
}

function snapshotOf(out: readonly Outgoing[]): ServerMessage | undefined {
  return out.find((o) => o.message.type === 'snapshot')?.message;
}

/** Plays one level for `ticks` server ticks, timing what the server does. */
function playLevel(levelId: string, seed: number, ticks: number, into: Sample): void {
  const room = playingRoom(levelId, seed, ticks + TICKS_PER_SECOND);
  const bots = botsOf(room);
  for (let i = 0; i < ticks; i++) {
    const messages = botMessages(room, bots);
    const start = performance.now();
    for (const [sessionId, message] of messages) handleMessage(room, sessionId, message);
    const out = stepRoom(room);
    into.tickMs.push(performance.now() - start);

    const snapshot = snapshotOf(out);
    if (!snapshot) continue;
    const encodeStart = performance.now();
    const bytes = getMessageBytes.raw(Protocol.ROOM_DATA, snapshot.type, snapshot);
    into.encodeMs.push(performance.now() - encodeStart);
    // Sizes on every 10th snapshot: compressing them all would only slow the run.
    if (into.encodeMs.length % 10 !== 0) continue;
    const json = JSON.stringify(snapshot);
    into.msgpackBytes.push(bytes.byteLength);
    into.jsonBytes.push(json.length);
    into.msgpackDeflateBytes.push(deflateRawSync(bytes).byteLength);
    into.jsonDeflateBytes.push(deflateRawSync(json).byteLength);
  }
  into.score += room.game?.score ?? 0;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

/** `global.gc`, exposed at run time when node wasn't started with `--expose-gc`. */
function gcFunction(): () => void {
  setFlagsFromString('--expose-gc');
  return runInNewContext('gc') as () => void;
}

function heapAfterGc(gc: () => void): number {
  gc();
  gc();
  return process.memoryUsage().heapUsed;
}

/** Heap per room with `count` rooms mid-round (20 s in, snapshot log filled). */
function memoryPerRoom(count: number): number {
  const gc = gcFunction();
  const levelId = levelIds[0] ?? 'garage';
  const before = heapAfterGc(gc);
  const rooms: RoomState[] = [];
  for (let r = 0; r < count; r++) {
    const room = playingRoom(levelId, 1000 + r, seconds * TICKS_PER_SECOND);
    const bots = botsOf(room);
    for (let i = 0; i < 20 * TICKS_PER_SECOND; i++) {
      for (const [sessionId, message] of botMessages(room, bots)) {
        handleMessage(room, sessionId, message);
      }
      stepRoom(room);
    }
    rooms.push(room);
  }
  const after = heapAfterGc(gc);
  if (rooms.length !== count) throw new Error('rooms were collected');
  return (after - before) / count;
}

const fmt = (n: number, digits = 2): string => n.toFixed(digits);
const kb = (bytes: number): string => `${fmt(bytes / 1024, 1)} KB`;

function main(): void {
  const ticks = Math.round(seconds * TICKS_PER_SECOND);
  console.log(
    `Room bench: ${MAX_PLAYERS} players per room, ${seconds} s per level, ${levelIds.length} levels, node ${process.version}`,
  );

  // Warm-up, so the JIT has compiled the hot paths before anything counts.
  playLevel(levelIds[0] ?? 'garage', 999, 10 * TICKS_PER_SECOND, emptySample());

  const total = emptySample();
  console.log('\nlevel                 tick mean   tick p99     score');
  levelIds.forEach((levelId, i) => {
    const sample = emptySample();
    playLevel(levelId, i + 1, ticks, sample);
    console.log(
      `${levelId.padEnd(20)} ${fmt(mean(sample.tickMs) * 1000, 0).padStart(7)} µs ${fmt(percentile(sample.tickMs, 99) * 1000, 0).padStart(7)} µs ${String(sample.score).padStart(7)}`,
    );
    for (const key of Object.keys(total) as (keyof Sample)[]) {
      const from = sample[key];
      const to = total[key];
      if (Array.isArray(from) && Array.isArray(to)) to.push(...from);
    }
  });

  const tickMean = mean(total.tickMs);
  const encodeMean = mean(total.encodeMs);
  // CPU per 1000 ms of game time: 60 ticks plus 20 snapshot encodes.
  const cpuPerSecond = tickMean * TICKS_PER_SECOND + encodeMean * SNAPSHOTS_PER_SECOND;
  const roomsPerCore = (0.5 * 1000) / cpuPerSecond;
  const snapshotBytes = mean(total.msgpackBytes);
  const bytesPerSecond = (snapshotBytes + WS_FRAME_HEADER) * SNAPSHOTS_PER_SECOND * MAX_PLAYERS;
  const deflatedPerSecond =
    (mean(total.msgpackDeflateBytes) + WS_FRAME_HEADER) * SNAPSHOTS_PER_SECOND * MAX_PLAYERS;

  console.log(`\nTick (inputs + stepRoom), all levels:`);
  console.log(
    `  mean ${fmt(tickMean * 1000, 0)} µs, p99 ${fmt(percentile(total.tickMs, 99) * 1000, 0)} µs, max ${fmt(Math.max(...total.tickMs), 2)} ms`,
  );
  console.log(`Snapshot encode (msgpack, once per broadcast):`);
  console.log(
    `  mean ${fmt(encodeMean * 1000, 0)} µs, p99 ${fmt(percentile(total.encodeMs, 99) * 1000, 0)} µs`,
  );
  console.log(`Snapshot size (mean):`);
  console.log(
    `  msgpack ${kb(snapshotBytes)} (deflate ${kb(mean(total.msgpackDeflateBytes))}), JSON ${kb(mean(total.jsonBytes))} (deflate ${kb(mean(total.jsonDeflateBytes))})`,
  );
  console.log(
    `  largest msgpack ${kb(Math.max(...total.msgpackBytes))}; the server sends msgpack, no permessage-deflate`,
  );

  console.log(`\nPer room (${MAX_PLAYERS} clients, ${SNAPSHOTS_PER_SECOND} snapshots/s):`);
  console.log(
    `  CPU: ${fmt(cpuPerSecond)} ms per 1000 ms of game time (${fmt(cpuPerSecond / 10)}% of a core)`,
  );
  console.log(`  rooms per core at 50% busy: ${fmt(roomsPerCore, 0)}`);
  console.log(
    `  outbound: ${fmt(bytesPerSecond / 1024, 1)} KB/s (${fmt((bytesPerSecond * 8) / 1e6)} Mbit/s); with deflate ${fmt(deflatedPerSecond / 1024, 1)} KB/s`,
  );

  const perRoom = memoryPerRoom(roomCount);
  console.log(`  memory: ${kb(perRoom)} heap per room (${roomCount} rooms alive mid-round)`);
}

main();
