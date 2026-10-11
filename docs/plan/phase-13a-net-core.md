# Phase 13a: Net core

**Goal:** the pure netcode that both the browser and the server will use, written and tested before any networking library exists: message types, snapshot codec, server-side input buffer, clock sync and interpolation. Part of [phase 13](phase-13-online-multiplayer.md), first PR of the stacked 13a to 13f series (base `main`).

Built without a review round (the product owner was away); decisions are in `review-notes-13.md` under 13a.

## Scope

- `src/net/` is pure TypeScript under the same rules as `src/sim/`: no Phaser, no DOM, no `Math.random`, no `Date.now`, no `performance`. Time always comes in as an argument (ms in the caller's clock). ESLint enforces it (the `src/sim` / `src/flow` block also covers `src/net`, except `src/net/client.ts`, which 13e adds as the only browser network code).
- No Colyseus, no `ws`, no server: that is 13b.
- Every new tunable (`NET_*`) lives in `src/sim/balance.ts`.

## Files

- `src/net/protocol.ts`: `PROTOCOL_VERSION`, the message unions and runtime validators.
  - Client → server (`ClientMessage`): `hello` (protocol version, `userId`, `displayName`, `localPlayers`), `inputs` (a batch of `InputCommand`s, one per local player per tick, stamped with the server tick they're meant for), `ping` (`id`, `clientTimeMs`), `menu` (this frame's `DevicePress`es with client-local device ids; the server prefixes them with `<sessionId>:`).
  - Server → client (`ServerMessage`): `welcome` (session id, join code, server tick, tick rate, snapshot rate), `lobby` (join code, host, members without their user ids), `roundStart` (level id, the static `LevelMap`, the first snapshot), `snapshot` (server tick, the flow, the game snapshot or `null` outside rounds), `pong` (echoes `id` and `clientTimeMs`, adds `serverTick`), `error` (code + text).
  - `parseClientMessage(raw: unknown): ParseResult<ClientMessage>` checks everything on untrusted input: shape, types, finite numbers, integer ticks, string lengths, id format, batch sizes, and clamps `move` to length 1. `decodeClientMessage(text)` does `JSON.parse` safely first.
- `src/net/snapshot.ts`: `encodeSnapshot(state, serverTick, events)` returns a deep copy of the `GameState` without `level`, plus the events since the last snapshot and the server tick. `decodeSnapshot(snapshot, level)` puts the map back. `SnapshotEvents` helpers collect events tick by tick on the server. `isSnapshotTick(serverTick)`.
- `src/net/inputBuffer.ts`: one buffer per player on the server. `pushInput(buffer, input, nextTick)` classifies (`queued`, `late`, `duplicate`, `stale`, `tooLate`, `tooEarly`, `wrongPlayer`); `takeInput(buffer, tick)` gives the input for the tick about to run.
- `src/net/clock.ts`: `createClockSync()`, `addPong(clock, pong, nowMs)`, `estimateServerTick(clock, nowMs)`, `inputTargetTick(clock, nowMs)`, `rttMs(clock)`.
- `src/net/interpolation.ts`: `createSnapshotBuffer()`, `pushSnapshot(buffer, serverTick, state)`, `renderTickFor(estimatedServerTick)`, `sampleAt(buffer, renderTick)` returning the base state, lerped player and manager positions and a status (`interpolating`, `waiting` when render time is past the newest snapshot, `behind` when it's before the oldest).
- Tests next to each: `protocol.test.ts`, `snapshot.test.ts`, `inputBuffer.test.ts`, `clock.test.ts`, `interpolation.test.ts`, and `determinism.test.ts`.

## Steps (one commit each)

1. This plan.
2. Balance numbers, ESLint purity rule for `src/net/`, protocol types and validators + tests.
3. Snapshot codec + tests.
4. Input buffer + tests.
5. Clock sync + tests.
6. Interpolation + tests.
7. Determinism test.
8. Done boxes, review notes, PR.

## Tests

- Protocol: every valid client message parses; wrong type, missing fields, wrong types, non-finite numbers, non-integer or negative ticks, too long strings, bad user ids, too big batches, unknown message types and non-objects are rejected with a reason; `move` longer than 1 is clamped; bad JSON is rejected.
- Snapshot: encode → `JSON.stringify` → `JSON.parse` → decode equals the original state; the snapshot has no `level`; encoding copies (changing the state later doesn't change the snapshot); events collect across ticks and clear after each snapshot; a busy 4-player snapshot stays small.
- Input buffer: on-time inputs apply at their tick; out-of-order arrival still applies each at its own tick; duplicates are ignored; late inputs apply at the next tick that hasn't run, and several late ones merge without losing a press; inputs more than `NET_MAX_INPUT_LATE_TICKS` late or older than what was already applied are dropped; inputs too far ahead are dropped; with no input the last one repeats (no new interact or dash press is ever made up) and after `NET_INPUT_REPEAT_TICKS` the player stands still; inputs for another player are refused.
- Clock: with a fixed latency the estimate is exact; with random jitter (seeded RNG) and an asymmetric path it converges to within a tick; the smoothed RTT tracks the real one; a server clock jump resyncs; input target tick sits ahead of the estimate by half the RTT plus the lead.
- Interpolation: halfway between two snapshots gives the midpoint; exactly on a snapshot gives its positions; past the newest snapshot holds the newest (`waiting`); before the oldest holds the oldest (`behind`); players that only exist in the newer snapshot don't lerp; teleports snap; a new round (other level or lower sim tick) doesn't lerp across; out-of-order and duplicate snapshots are ignored; the buffer stays bounded.
- Determinism: a garage round played by bots, run directly and run through input buffers (inputs sent early, out of order and duplicated) with the server state re-created from a JSON round-tripped snapshot every `NET_SNAPSHOT_EVERY_TICKS`, ends in the same state and score.

## Done when

- [ ] `src/net/` has protocol, snapshot, inputBuffer, clock and interpolation, each with tests
- [ ] Determinism test passes
- [ ] `src/net/` is pure (ESLint rule) and every `NET_*` number is in `balance.ts`
- [ ] `npm run check` and `npm run build` pass

There's nothing to check by hand in this sub-phase: nothing uses `src/net/` yet. The game plays exactly as before.
