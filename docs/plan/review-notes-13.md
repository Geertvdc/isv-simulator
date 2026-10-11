# Review notes for phase 13 (online multiplayer)

Decisions made without you, open questions and issues found while the sub-phases were built by agents. Review these with the PRs.

## How to review this stack

Stacked PRs, each on top of the one before: 13a → `main`, 13b → 13a, 13c → 13b, 13d → 13c, 13e → 13d, 13f → 13e. Merge in order, rebase-merge only. To play the whole thing, check out the last branch (`phase-13f-resilience`).

## Decisions made up front (from the kickoff Q&A)

- We host a server: Node + Colyseus 0.18 (picked because it is TypeScript-first, Phaser is its flagship integration, and it gives rooms, join codes, reconnection and a simulation clock). Plain JSON messages, no `@colyseus/schema`.
- No deploy: local server + `Dockerfile`. No cloud resources created.
- Progress lives on the server in a JSON-file `ProfileStore`, keyed by a user id kept in `localStorage` that can be copied to another device.
- After an online round every user in the room gets the result recorded; unlocks in the room follow the host.

## Per sub-phase

(Each agent appends a section here.)

## 13a net core

PR: `phase-13a-net-core` → `main`. Pure netcode in `src/net/`, nothing uses it yet, so the game plays exactly as before. Plan and file list in `phase-13a-net-core.md`.

### Decisions

- **Purity is linted.** The ESLint block that keeps `src/sim` and `src/flow` free of Phaser, DOM, `Math.random`, `Date.now` and `performance` now covers `src/net` too, except `src/net/client.ts` (the Colyseus wrapper 13e will add).
- **Repeating inputs keeps held buttons held** (a deviation from the wording "repeat the last input with interact/dash cleared"). The sim acts on interact and dash only when they go from up to down, so repeating the last input as it was can never make up a new press. Clearing them would: a player holding interact to wind up a throw who misses one input would get a release and then a fresh press on the next input, which picks up or drops a ticket by accident. To keep a dropped connection from holding buttons forever, after `NET_INPUT_REPEAT_TICKS` (15, a quarter second) without input the player lets go and stands still.
- **Late inputs merge.** Inputs whose tick already ran (up to `NET_MAX_INPUT_LATE_TICKS` = 6, 100 ms) are applied at the next tick; several due at once become one input with the newest move and work, and interact/dash down if any of them had it down, so a quick tap is never lost. Known gap: if a button was already held and the late batch holds a release and a new press, that re-press is lost (the sim would need two ticks to see it). Rare, and only with late inputs.
- **Stale inputs are dropped**: anything for a tick at or before the newest input already applied (old out-of-order packets, duplicates of applied inputs). Inputs more than `NET_MAX_INPUT_AHEAD_TICKS` (30, half a second) ahead are dropped as a broken client clock.
- **Snapshots are the whole `GameState` minus `level`**, deep-copied with `structuredClone`, plus all events since the previous snapshot and the server tick. About 3 KB of JSON for a busy 4-player round on Middle Management, so ~60 KB/s per client at 20 Hz before compression. No deltas, as planned. `serverTick` is separate from `state.tick` because the sim tick stops during countdown, pause and menus while the server clock keeps going.
- **Snapshot message carries the whole `Flow`** (`{ type: 'snapshot', serverTick, flow, game }`, with `game: null` outside rounds), so menus, lobby and results can run on the server. 13b/13d may slim this down.
- **User ids are never broadcast.** `LobbyMember` has session id, display name, local player count, host and connected flags; the user id stays on the server, since knowing it is being that user.
- **Validation copies.** `parseClientMessage` builds a fresh message with only the known fields: ids are `[A-Za-z0-9_-]` up to 64 characters (so `<sessionId>:<deviceId>` can't be forged with a colon), display names are trimmed and 1 to 24 characters, `localPlayers` 1 to 4, ticks whole and non-negative, numbers finite, batches capped (64 inputs, 16 presses), and `move` longer than 1 is scaled to length 1. Server → client messages are not validated (they come from our own server).
- **Clock sync** keeps the last 16 pings and averages the offset of the half with the shortest round trips (NTP-style, since jitter only makes trips longer); the round trip is smoothed with a 1/8 weight like TCP. A pong is assumed to be answered half a tick into the reported server tick. Two pings in a row more than 30 ticks off restart the sync (one wild ping is ignored). Inputs are stamped `estimate + RTT/2 + NET_INPUT_LEAD_TICKS` (1 tick).
- **Interpolation** is driven by a render tick (`renderTickFor(estimatedServerTick)` = estimate minus `NET_INTERP_DELAY_MS`) rather than "newest snapshot minus delay", so it moves smoothly between arrivals. Everything that isn't a position comes from the older snapshot of the pair. Past the newest snapshot it holds the newest (`waiting`, no extrapolation); before the oldest it holds the oldest (`behind`). Entities that moved more than `NET_INTERP_SNAP_DISTANCE` (3 tiles) between two snapshots, or snapshots from another round (other level, or the sim tick went down), jump instead of gliding.

### Open questions

- Should the server's pong carry a fractional tick (time into the current tick)? It would take the clock estimate from "within a tick" to a few ms. Easy to add in 13b if movement looks jittery.
- When should the client play a snapshot's events: when it arrives, or when render time reaches it (100 ms later, in sync with the movement)? Left to 13e; the second is probably right for sounds tied to movement (dash, shove).

### What to check

- Nothing to check by hand: no code path uses `src/net/` yet. `npm run check` covers it, including the determinism test (a full bot round on Middle Management, through JSON messages, shuffled and duplicated early inputs, and snapshot round trips every 3 ticks, ends in exactly the same state as the direct run).

## 13b server

PR: `phase-13b-server` → `phase-13a-net-core`. A Colyseus server in `server/` that runs the room's flow and sim; nothing in the browser talks to it yet (13d/13e). Plan and file list in `phase-13b-server.md`, how to run, talk to and deploy it in `server/README.md`.

### Decisions

- **Colyseus 0.18 worked out**, no fallback to plain `ws` needed. `colyseus` 0.18.9 on the server, `@colyseus/sdk` 0.18.5 as a dev dependency for the tests (13e moves it to `dependencies` when the browser uses it).
- **Wire format:** Colyseus messages whose type is the protocol message's `type` and whose payload is the whole protocol object, both ways (`room.send(msg.type, msg)`, `client.send(msg.type, msg)`). The server listens with `onMessage('*')` and only ever reads the payload through `parseClientMessage`. Colyseus encodes payloads with msgpack, not JSON text; the content is still the plain JSON-safe objects from `protocol.ts`, so `decodeClientMessage` (text) isn't used on the server.
- **The `hello` is the join options** (`client.create('game', hello)`, `client.joinById(code, hello)`), checked in `onJoin`. That way a full room or a protocol mismatch refuses the join itself (the SDK's promise rejects with the `ErrorCode` as its message, status `4400`) instead of letting someone in and kicking them. A `hello` sent later in the room changes the display name and couch player count (refused with `roomFull` when it doesn't fit, or when it's below the devices already bound).
- **Join code = Colyseus room id**, set in `onCreate`. Letters without I and O (24 letters, 331,776 codes), random from `node:crypto`, unique among the rooms alive in this process (`server/joinCodes.ts`). `src/net/joinCode.ts` has `normalizeJoinCode` (upper case, spaces and dashes dropped) for the 13d join screen, so joining is `joinById(normalizeJoinCode(typed))`. `GET /rooms/:code` answers whether a code is open (any case), for the join screen to check before connecting.
- **Capacity:** at most `MAX_PLAYERS` (4) players per room, counting every member's `localPlayers`. The flow lobby still binds devices with join presses; a member can't bind more devices than the `localPlayers` it announced (extra join presses are dropped), so the two counts can't drift apart.
- **Room starts on the lobby screen** (`flow.screen = 'lobby'`, awake). From there the normal flow runs for the whole room: any member's joined devices drive the menus, like on the couch. Backing out of the lobby goes to the room's title screen, whose Play leads back to the lobby. 13d decides what the online menus look like and whether only the host may pick levels (`notHost` exists in the protocol for that).
- **Device ids and join groups** are both prefixed `<sessionId>:`, so two machines can both have a `kb-left` and Enter on one machine never joins a device on another.
- **Inputs are keyed by server tick.** The buffers from 13a get `room.serverTick` as `nextTick`, and clients stamp inputs with `inputTargetTick` (a server tick estimate), so the server and client agree on what a tick number means even while the sim tick stands still (countdown, pause). The sim ignores `InputCommand.tick`. Inputs are only accepted for player ids bound to the sender's devices; others are silently ignored. Buffers are drained every server tick while a round is loaded, also when paused, so inputs never pile up for the moment the round resumes.
- **Clock:** `setTimestep` (0.18's new name for `setSimulationInterval`) calls `advanceRoom` with the real time since the last call; our own accumulator turns that into whole ticks, without drift (tested over 6000 ragged frames). After a stall at most `NET_SERVER_MAX_CATCHUP_TICKS` (10) run and the rest of the backlog is dropped, like `GameLoop` on the client. The flow's clock (`nowMs`) is `serverTick * 1000/60`, so the countdown and results delay follow the server tick.
- **`roundStart`** goes to everyone when the flow's `startLevel` effect fires (on the intro card, like couch play), and to someone joining while a round is loaded. Its snapshot has no events (those stay for the next regular snapshot).
- **Leaving:** the host moves to the earliest joined member left (`members[0]`), everyone gets a new `lobby`. In the lobby, the leaver's players are dropped and the others renumbered in join order (player ids must be 1..n for spawns). During a round the leaver's players stay and stand still (their input buffers go idle). The room closes (Colyseus auto-dispose) and frees its code when the last member leaves.
- **Save context:** a fresh `createSave()` per room, so a new room starts with only the first level open (rounds played in the room unlock the next ones, for that room only); `saveChanged`/`settingsChanged` effects are ignored. 13c brings the host's profile. Settings changed in the room's settings menu only change that throwaway save.
- **Seeds:** each room starts from a random seed; every round takes the next one.
- **Dev server:** `npm run server` runs `vite-node` (so `?raw` level maps load like in Vite) under `node --watch`, which restarts the whole process on changes. `vite-node --watch` re-ran `main.ts` in the same process and the old server still held the port.
- **Production:** `npm run build:server` bundles `server/` with Vite's SSR build into `dist-server/main.js` (level maps inlined, `node_modules` external, `public/` not copied). The `Dockerfile` builds that and runs it on `node:22-slim` with `npm ci --omit=dev`. The image works locally (built, ran, `/health` answered) but is large (~770 MB unpacked) because `phaser` is a production dependency of the package; a separate `server/package.json` could trim it if it matters.
- **HTTP routes** use Colyseus 0.18's built-in router (`createRouter`/`createEndpoint`), no Express code of our own. Colyseus adds permissive CORS headers and its own `/__healthcheck` too.
- **Tests:** `server/roomLogic.test.ts` plays rooms tick by tick without networking (21 tests). `server/server.test.ts` boots one real server on port 0 for the file and connects `@colyseus/sdk` clients (9 tests, under 3 s, ran 5 times in a row without a flake). The "inputs move a player" test plays through the real flow (lobby, level select, intro, 2.1 s countdown) rather than building a state, because that path is what it checks.

### Open questions

- Should only the host drive the menus online (level select, pause, retry)? Today any joined device can, as on the couch.
- The settings menu (volume, music, shake) makes little sense room-wide; 13d probably hides it online or makes it local.
- A member who leaves mid-round leaves a frozen character behind. 13f (reconnection) decides whether it's kept for a grace period, removed, or taken over.
- No rate limiting per client (Colyseus's `maxMessagesPerSecond` is left at its default, unlimited); clients send about two messages per frame. Fine for an internal game.

### What to check

- `npm run server`, then `curl localhost:2567/health` answers `ok`. `npm run dev:online` starts the game on 5173 and the server on 2567 together.
- Optional: `docker build -t isv-simulator-server . && docker run --rm -p 2567:2567 isv-simulator-server`, then the same curl.
- In the browser nothing changes yet: the game doesn't connect to the server until 13d/13e.
