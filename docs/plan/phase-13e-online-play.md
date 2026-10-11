# Phase 13e: Online play

**Goal:** a full online round, end to end. Every machine in a room sends its couch players' inputs up, gets the server's snapshots down and draws the round through the same renderers as couch play, interpolated 100 ms behind the server. Sounds, effects, the HUD, pause, results with stars and Next/Retry/Level select all work online, and every member's profile gets the result. Part of [phase 13](phase-13-online-multiplayer.md), stacked on 13d (PR base `phase-13d-online-lobby`).

Built without a review round (the product owner was away); decisions are in `review-notes-13.md` under 13e.

## Scope

- Inputs up: each client frame builds one `InputCommand` per local player bound on this machine (screen-relative to world, as on the couch), stamped with `inputTargetTick` from the clock sync, sent as one `inputs` message. Pings every `NET_PING_INTERVAL_MS` keep the clock synced (faster for the first few).
- Snapshots down: `roundStart` loads the level's map (a scene restart when it's another level, which also fixes "the map behind online menus never changes"), snapshots go into the interpolation buffer, and each frame samples at `renderTickFor(estimateServerTick(now))`.
- One set of renderers: they read a `RoundView` (state + interpolated player and manager positions), which `GameLoop` already is on the couch and an `InterpolatedFrame` becomes online. No second copy of any renderer.
- Events (sounds, effects, popups, shake) from snapshots play exactly once, when render time reaches the snapshot that brought them.
- Countdown, room-wide pause, results with the star chimes, Next/Retry/Level select (the host's), music: as on the couch.
- After an online round the result is recorded in this browser's save too (the same record the server writes to the profile).
- Dev tools: a lag simulator (`?lag=<ms>&jitter=<ms>` on the client, `NET_LAG_MS`/`NET_JITTER_MS` on the server) and a ping HUD (bottom left while online, `N` toggles it, on by default in dev). `ROUND_SECONDS` on the server shortens every round, for trying the results quickly.
- Not in scope: reconnecting, late join into a running round, host leaving mid-round (13f), client-side prediction, first-level hints online (skipped).

## Design

### View source (`src/render/roundView.ts`, pure)

```ts
interface RoundView {
  readonly state: GameState;
  renderPos(id: PlayerId): Vec | undefined;
  renderManagerPos(id: number): Vec | undefined;
}
frameView(frame: InterpolatedFrame<GameState>): RoundView
```

`GameLoop` implements it unchanged. `PlayerRenderer`, `ManagerRenderer`, `MeetingRenderer` and `TicketRenderer` take a `RoundView` instead of a `GameLoop`. `GameScene.renderRound(view, events, time)` is the one place that drives all renderers, the HUD frame, effects and sounds, for both sources.

### Online round (`src/net/onlineRound.ts`, pure)

- `OnlineRound = { levelId, level, buffer: SnapshotBuffer<GameState>, events: { serverTick, events }[], lastPlayedTick }`.
- `startOnlineRound(message: RoundStartMessage)`, `pushRoundSnapshot(round, snapshot)` (decodes with the round's map, shared rather than copied per snapshot; queues its events once, only when the buffer took it).
- `roundRenderTick(clock, nowMs)`: the estimated server tick minus half the round trip minus `NET_INTERP_DELAY_MS`. (13a's `renderTickFor(estimate)` alone puts render time right at the newest snapshot once the one-way trip reaches the delay, so at 100 ms each way every frame would wait.)
- `sampleRound(round, renderTick)` → the interpolated frame (or `null`).
- `takeDueEvents(round, renderTick)`: the events of every queued snapshot at or before `renderTick`, oldest first, each only once.

### Input stamping (`src/net/inputStamp.ts`, pure)

- `createInputStamper()`, `stampInputs(stamper, commands, targetTick)`:
  - a target tick newer than the last sent: the commands go out stamped with it; interact/dash presses seen on frames that sent nothing are OR-ed in, so a tap between sends isn't lost;
  - the same (or an older) target tick (a 144 Hz screen sends at most one input per tick): nothing is sent, presses are kept for the next send;
  - the target tick going back more than `NET_CLOCK_RESYNC_TICKS` (clock resync): starts over.
- `localBindings(online)`: this machine's bound players with their local device ids (from `membersWithPlayers`).

### Lag simulator (`src/net/lag.ts`, pure)

- `parseLag(params)` → `{ lagMs, jitterMs } | null` from `?lag=&jitter=` (or env values on the server).
- `createLagLine(lag, seed)`, `deliveryTime(line, nowMs)` → the time a message sent now is delivered: `now + lag + jitter * random` with the seeded RNG, never before the previous message (WebSockets keep order).
- `createLagRunner(lag, seed, { now, setTimer })`: runs handed-over functions after the lag, in order, with one timer for the oldest (a timer per message let two messages a fraction of a millisecond apart swap: found by a flaky test).
- `src/net/client.ts` delays `send` and incoming messages with it when given a lag; `GameRoom` does the same for its messages when the env vars are set.

### Server

- `RoomOptions { roundTicks?: number; lag? }`: `createRoomState(code, seed, options)`; a set `roundTicks` replaces every round's `durationTicks`. `startGameServer(port, { store, roundSeconds, lag })`, `main.ts` reads `ROUND_SECONDS`, `NET_LAG_MS`, `NET_JITTER_MS`.

### Scene glue (`GameScene`)

- `onlineRound: OnlineRound | null`, `clock: ClockSync`, `stamper`, ping timer, kept across scene restarts.
- `roundStart` → a new `OnlineRound`; if its level isn't the loaded map, `scene.restart({ levelIndex })`. Snapshot with `game: null` while a round is loaded → round dropped, scene restarted on the same map (clean slate, like `stopRound`).
- Per frame while online: menu presses as before; inputs (while the room's screen is `countdown` or `playing`); pings; sample the round and `renderRound`; music from the room's flow; star chimes when the room's flow turns to `results`; the local save records the result once per round.
- Leaving mid-round drops the round and restarts the scene.
- The "Round in progress" placeholder is gone; the online bar stays on top while playing.

### UI

- `src/ui/netHud.ts`: `Ping 42 ms`, "waiting for the server" when render time ran past the newest snapshot, and the simulated lag; over the clock, bottom right. `NET_STATS_EVENT` from the scene with `NetStats | null`.
- Dev builds set `window.isvNet` (`NetDebug`: render tick, interpolation status, frames and waiting frames, drawn player positions, the drawn state, events played by type, the music track) for checking an online round from a script.

## Files

- `src/render/roundView.ts` + test; `GameLoop.ts` (implements `RoundView`); `PlayerRenderer.ts`, `ManagerRenderer.ts`, `MeetingRenderer.ts`, `TicketRenderer.ts`; `GameScene.ts`
- `src/net/onlineRound.ts`, `inputStamp.ts`, `lag.ts` + tests; `src/net/client.ts` (lag option); `src/flow/online.ts` (`localBindings`) + test
- `src/sim/balance.ts` (`NET_PING_INTERVAL_MS`, `NET_PING_FAST_COUNT`, `NET_PING_FAST_INTERVAL_MS`)
- `server/roomLogic.ts`, `GameRoom.ts`, `app.ts`, `main.ts` + `roomLogic.test.ts`, `server/round.test.ts` (two sdk clients play a short round)
- `src/ui/netHud.ts`, `src/ui/onlineLobby.ts` (placeholder removed), `src/main.ts`, `src/style.css`, `src/sim/content.ts`
- `server/README.md`, `docs/game/README.md` if a shot fits

## Steps (one commit each)

1. This plan.
2. `RoundView`: renderers read a view source; `GameLoop` is one. Local play unchanged.
3. Pure netcode: online round (buffer + events), input stamping, lag line, local bindings + tests.
4. Server: round length option, lag env, `main.ts` env + a two-client round test.
5. Client wrapper lag + scene glue: inputs, pings, round start/end, interpolated render, events, results, music, net HUD.
6. Browser check (two contexts, with and without lag), fixes.
7. Docs, done boxes, review notes, PR.

## Tests

- `roundView`: `frameView` hands out the interpolated positions and the base state; `GameLoop` satisfies `RoundView`; GameLoop tests unchanged.
- `onlineRound`: decoding keeps the map; events play when render time reaches their snapshot, in order, once, also when render time jumps; duplicates and out-of-order snapshots add no events; a new round starts clean.
- `inputStamp`: stamps with the target tick; one send per tick; taps between sends are kept; resync starts over.
- `lag`: delays by lag plus jitter in range, keeps order, deterministic per seed, parses URL values and rejects junk.
- `online`: `localBindings` lists only this machine's players.
- Server (pure): `roundTicks` shortens rounds.
- Server integration (`server/round.test.ts`): two `@colyseus/sdk` clients join a room, both join a player, the host starts Garage (shortened to a few seconds), both send stamped inputs; both get snapshots showing both players moved, the same score and clock, the results screen with stars, and both profiles in the store have the round.

## Done when

- [x] Both machines show both players moving, the same orders, score and timer, during a whole online round
- [x] Tickets, pipelines, managers, invites, effects, sounds and music work online
- [x] Countdown, room-wide pause, results with stars, Next/Retry/Level select (host) work online
- [x] The round is recorded in every member's profile and in each browser's save
- [x] A round on another level loads that level's map on every machine
- [x] Movement looks smooth with `?lag=100&jitter=20` (checked in a browser)
- [x] Ping HUD shows while online; `N` toggles it
- [x] Local couch play behaves exactly as before
- [x] Verified in a real browser with two contexts (host and guest), with and without lag
- [x] `npm run check`, `npm run build` and `npm run build:server` pass
- [ ] CI is green

Manual check: `ROUND_SECONDS=30 npm run dev:online`, two browser windows (one private). Host online, join with the code, Enter in both, E in the host's, pick Garage. Both players walk on both screens; pick up a ticket in one window and watch it move in the other; the clock and score match. Esc in the host's pauses both. At the end both show the results with stars; the host picks Retry, both play again. Then the same with `?lag=100&jitter=20` on both URLs: movement should glide, no snapping back.
