# Phase 13: Online multiplayer

**Goal:** play together from different machines, with lobbies and join codes, one authoritative clock, and progress stored per user without accounts.

Phase 13 is split into sub-phases, each a stacked PR on top of the one before (13a → `main`, 13b → 13a, ...). Each sub-phase has its own detailed file (`phase-13x-<name>.md`), written by the agent that built it. Decisions taken without the product owner go in `review-notes-13.md`.

## Architecture (decided up front)

```
 browser (Vite + Phaser)                          server/ (Node 22, Colyseus 0.18)
 ┌──────────────────────────┐   WebSocket (JSON)   ┌────────────────────────────────┐
 │ input/  → InputCommands  │ ───── inputs ──────▶ │ GameRoom (one per join code)   │
 │ net/    client, clock,   │                      │  - runs src/flow + src/sim     │
 │         snapshot buffer  │ ◀── snapshots ────── │    at TICKS_PER_SECOND         │
 │ render/ interpolates     │     20 Hz + events   │  - owns the clock (tick count) │
 │ ui/     lobby, join code │                      │  - lobby, host, players        │
 └──────────────────────────┘ ◀── HTTP /profile ── │ ProfileStore (JSON file)       │
       localStorage: user id                       └────────────────────────────────┘
```

- **Server authoritative.** The server runs the same pure `src/sim/` and `src/flow/` code at `TICKS_PER_SECOND` (60). It is the only clock: every client shows the server's tick. Clients never advance a shared sim. Client-side prediction is out of scope unless it feels laggy at 100 ms.
- **Library: Colyseus 0.18** (`colyseus` on the server, `@colyseus/sdk` in the browser). It gives rooms, matchmaking, custom room ids (join codes), seat reservation, reconnection tokens and `setSimulationInterval`. We use **plain messages** with our own JSON snapshots, **not** `@colyseus/schema`, so `GameState` stays plain JSON (architecture rule 5). If Colyseus gets in the way of that, falling back to plain `ws` is allowed. Write it down in the review notes.
- **Pure netcode in `src/net/`.** Protocol types, snapshot encoding, input buffering, the clock-sync estimate and interpolation are pure TS under the same rules as `src/sim/` (no Phaser, DOM, `Date.now` or `Math.random`; time comes in as an argument). The thin Colyseus client wrapper lives in `src/net/client.ts` and is the only browser network code.
- **Server code in `server/`**, its own `tsconfig`, importing `src/sim`, `src/flow` and `src/net`. It runs with `vite-node` or `tsx` in dev and has a `Dockerfile`. `npm run check` covers it.
- **Inputs:** clients send per-tick `InputCommand`s, batched (one message per client frame, holding the commands for each local player), stamped with the server tick they are meant for. The server keeps a small per-player buffer. Late inputs are applied at the next tick that hasn't run, or dropped when more than `NET_MAX_INPUT_LATE_TICKS` late. Duplicates and out-of-order inputs are handled. With no input for a tick, the last input repeats, with `interact`/`dash` edges cleared.
- **Snapshots:** every `NET_SNAPSHOT_EVERY_TICKS` (3, so 20 Hz) the server sends the `GameState` without the static `level` map (sent once at round start), plus the `GameEvent`s since the last snapshot (for sound and effects), plus the flow screen. Full snapshots first. Deltas only if they're measurably needed.
- **Interpolation:** clients render `NET_INTERP_DELAY_MS` (~100 ms) behind the newest snapshot, lerping player and manager positions between the two snapshots around the render time, like `GameLoop` does between ticks today.
- **Clock sync:** ping/pong carrying the server tick; the client keeps a smoothed RTT and offset to estimate the current server tick (to stamp inputs and drive interpolation).
- **Flow on the server:** the room runs `updateFlow` for the whole room. Remote devices become `DevicePress`es with room-unique device ids (`<sessionId>:<deviceId>`). The host's profile is the flow's save context (unlocks, level select). Pause is room-wide.
- **Identity, no auth:** a random user id (UUID v4 from `crypto.randomUUID` in the browser) in `localStorage` under `isv-simulator.userId`. Settings shows it with Copy and Paste/replace, so people can move it to another device. It's sent when joining a room and to the profile API. Anyone who knows an id is that user, which is fine for an internal game.
- **Profiles on the server:** `ProfileStore` interface plus a JSON-file implementation (`data/profiles.json`, path set by an env var, written atomically). A profile = display name + the existing `SaveData.levels` shape. Offline play keeps the local save. When online, the local save merges into the profile (best stars and score per level win) and the merged result comes back. After an online round, **every user in the room** gets the result recorded. Unlocks in the room follow the host's profile.

## Sub-phases (stacked PRs)

| #   | Branch                   | Result                                                                                                       |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 13a | `phase-13a-net-core`     | `src/net/` pure netcode: protocol, snapshot codec, input buffer, clock sync, interpolation. Determinism test |
| 13b | `phase-13b-server`       | `server/`: Colyseus server, room with join code, fixed-tick sim loop, `npm run server`, Dockerfile, tests    |
| 13c | `phase-13c-identity`     | User id in localStorage, copy/paste id UI, server `ProfileStore` + HTTP API, save merge                      |
| 13d | `phase-13d-online-lobby` | Title: Host online / Join online, join-code entry, online lobby (remote + couch players), host starts        |
| 13e | `phase-13e-online-play`  | Full online round: inputs up, snapshots down, interpolated render, events and sound, results to all profiles |
| 13f | `phase-13f-resilience`   | Disconnect/reconnect, late join, host leaving, lag simulator, ping HUD, docs, playtest notes                 |

## Assumptions (product owner away, see also `review-notes-13.md`)

- No deploy. The server runs locally (`npm run server`, `npm run dev:online`) and ships a `Dockerfile` plus deploy notes. The client finds the server through `VITE_SERVER_URL`, defaulting to the same host on port 2567.
- No auth, no anti-cheat, no rate limiting beyond basic message validation.
- Max 4 players per room (`MAX_PLAYERS`), counting couch players on each machine.
- Join codes: 4 letters with no ambiguous ones (no I, O, 0, 1), case-insensitive.
- If the host leaves, host moves to the next player who joined earliest; the room closes when empty.
- Late joiners wait in the lobby or results screen until the next round, and can't drop into a running round. 13f may relax this.
- Local couch play stays exactly as it is and needs no server.

## Tests (across the sub-phases)

- Server sim and a local sim given the same inputs end in the same state
- Snapshot serialization round trip
- Interpolation between two snapshots
- Input commands arriving late or out of order are applied at the right tick or dropped
- Clock-sync estimate converges under jitter
- Room: create, join by code, wrong code, full room, start, leave (integration tests with real Colyseus clients)
- Profile store: create, load, merge, record result, corrupt file
- Reconnect within the grace period keeps the player's slot

## Done when

- [ ] Two browsers on different machines can play a level together
- [ ] Movement looks smooth at 100 ms latency
- [ ] Lobby: host gets a code, others join with it, couch players on either machine can join too
- [ ] A user id can be copied to another browser and brings its progress along
- [ ] Disconnect and reconnect within the grace period puts the player back in the round
- [ ] `npm run check` passes (including `server/`)
