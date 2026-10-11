# Phase 13b: Server

**Goal:** an authoritative game server that runs the room's flow and sim at `TICKS_PER_SECOND`, with join codes, a lobby of members, input buffers and snapshots, built on the pure `src/net/` code from 13a. Part of [phase 13](phase-13-online-multiplayer.md), stacked on 13a (PR base `phase-13a-net-core`).

Built without a review round (the product owner was away); decisions are in `review-notes-13.md` under 13b.

## Scope

- `server/`: Node 22 + Colyseus 0.18 (`colyseus` on the server, `@colyseus/sdk` 0.18 as the client in tests). Plain messages carrying the `src/net/protocol.ts` objects; no `@colyseus/schema` state.
- Room logic in pure, tested modules (`server/roomLogic.ts`), the Colyseus glue (`server/GameRoom.ts`, `server/app.ts`) kept thin.
- No client UI (13d), no profiles or identity (13c), no reconnection (13f). The flow's save context is a fresh `createSave()` per room until 13c.
- `npm run build` still builds only the client.

## Wire format

Colyseus messages: the message type is the protocol message's `type`, the payload is the whole protocol message (`room.send(msg.type, msg)`; the server listens with `onMessage('*')` and only reads the payload, through `parseClientMessage`). Server to client the same: `client.send(msg.type, msg)`, so a client can listen with `room.onMessage('*', (type, msg) => ...)`.

The `hello` is the join options: `client.create('game', hello)` or `client.joinById(code, hello)`. It is checked in `onJoin` (bad shape: `badMessage`, other protocol: `protocolMismatch`, too many players: `roomFull`), and a refused join rejects the SDK's promise with the `ErrorCode` as the message. A later `hello` in the room updates the name and couch player count.

## Files

- `src/net/joinCode.ts` (pure, shared with the client in 13d): `JOIN_CODE_ALPHABET` (A to Z without I and O), `generateJoinCode(randomInt, isTaken)`, `normalizeJoinCode(text)` (trims, uppercases, drops spaces and dashes; `null` when it can't be a code). `NET_JOIN_CODE_LENGTH` (4) in `balance.ts`.
- `server/roomLogic.ts`: `RoomState` (plain data: join code, members in join order, server tick, tick accumulator, flow, save, game, input buffers, snapshot log, queued menu presses, round seed) and the functions that change it, each returning the messages to send (`Outgoing = { to: sessionId | null, message }`, `null` = everyone):
  - `createRoomState(joinCode, seed)`: flow starts on the lobby screen.
  - `joinRoom(room, sessionId, userId-bearing hello)`: capacity (`MAX_PLAYERS` summed over the members' `localPlayers`), welcome to the newcomer, lobby to all, `roundStart` to the newcomer when a round is loaded.
  - `leaveRoom(room, sessionId)`: host moves to the earliest joined member left; in the lobby the leaver's players are dropped and the rest renumbered.
  - `handleMessage(room, sessionId, raw)`: `ping` → `pong`, `inputs` → input buffers (only for player ids this session's devices are bound to), `menu` → presses queued with device ids and join groups prefixed `<sessionId>:`, `hello` → name/player count update, bad messages → `error`.
  - `advanceRoom(room, deltaMs)`: fixed-step accumulator (at most `NET_SERVER_MAX_CATCHUP_TICKS` per call) calling `stepRoom`.
  - `stepRoom(room)`: one server tick: `updateFlow` with the queued presses (time = server tick in ms), the flow's effects (`startLevel` creates the game and sends `roundStart`, `stopRound` drops it), one input per player from the buffers, `tick` while the flow is `playing`, `finishRound` when the round ends, and a `snapshot` to all every `NET_SNAPSHOT_EVERY_TICKS`.
- `server/joinCodes.ts`: the live codes of this process (`reserveJoinCode`, `releaseJoinCode`, `isLiveJoinCode`), random from `node:crypto`.
- `server/GameRoom.ts`: the Colyseus room: custom room id = join code, `setSimulationInterval` feeding `advanceRoom`, `onMessage('*')`, `onJoin`/`onLeave`/`onDispose`.
- `server/app.ts`: `createGameServer()` (room `game`, routes `GET /health` and `GET /rooms/:code`), `startGameServer(port)` returning the port and a `close()`; used by `main.ts` and the tests.
- `server/main.ts`: entry; `PORT` env var, default 2567.
- `server/tsconfig.json`, `vite.server.config.ts` (bundles the server to `dist-server/` for production, so the `?raw` maps are inlined), `Dockerfile` (multi-stage, `node:22-slim`), `.dockerignore`, `server/README.md`.
- Scripts: `npm run server` (vite-node under `node --watch`, which restarts the whole process so the port is freed), `npm run dev:online` (vite + server via `concurrently`), `npm run build:server`, `npm run start:server` (the built bundle). `npm run typecheck` also checks `server/`, ESLint lints it with Node globals, Vitest runs `server/**/*.test.ts`.

## Steps (one commit each)

1. This plan.
2. Dependencies, `server/` tsconfig, lint and test config, join codes (`src/net/joinCode.ts` + tests).
3. Pure room logic + tests.
4. Colyseus room, app, entry, scripts + integration tests.
5. Production bundle, Dockerfile, README.
6. Done boxes, review notes, PR.

## Tests

- Join codes: right length and alphabet, never a taken one, gives up when every try is taken; normalize accepts lower case, spaces and dashes and refuses wrong letters and lengths.
- Room logic: the first member is host; host moves on leave to the earliest joined; capacity counts couch players; protocol mismatch refused; welcome/lobby/roundStart messages; ping → pong with the server tick; menu presses prefixed and unforgeable; a session can't join more devices than its `localPlayers`; inputs only for owned players; bad messages answered with `error`; the accumulator runs exactly one tick per 1000/60 ms over a long run with ragged frame times and caps catch-up; a full flow from lobby to playing moves a player with inputs and sends snapshots every 3 ticks; leaving the lobby renumbers players.
- Integration (a real Colyseus server on a random port, `@colyseus/sdk` clients): `/health`; create gets a 4-letter code and welcome + lobby; join by code (lower case through `normalizeJoinCode` and `/rooms/:code`); wrong code fails; full room refused with `roomFull`; ping/pong; inputs move a player through a real round; leave moves the host and updates the lobby.

## Done when

- [x] `npm run server` boots a Colyseus server on `PORT` (2567) with `GET /health`
- [x] Rooms get unique 4-letter join codes; joining by code (any case) works, wrong codes and full rooms are refused
- [x] The room runs flow and sim at 60 ticks per second, sends snapshots at 20 Hz, answers pings
- [x] Pure room logic and integration tests pass in `npm run check`, which also typechecks and lints `server/`
- [x] `npm run build` still builds only the client; `npm run build:server` bundles the server; `Dockerfile` and `server/README.md` exist
- [x] CI is green

Manual check: `npm run server`, then `curl localhost:2567/health`. There is nothing to see in the game yet: the browser doesn't connect until 13d/13e.
