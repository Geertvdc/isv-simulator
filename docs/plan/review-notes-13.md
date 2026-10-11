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
