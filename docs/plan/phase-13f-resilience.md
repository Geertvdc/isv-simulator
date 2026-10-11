# Phase 13f: Resilience

**Goal:** an online room survives the things that happen on a real network and a real couch: a wifi blip, a laptop lid, a page reload, the host walking off, someone arriving mid-round, a flooding client, a server restart. Nobody gets stuck on a screen nobody can drive. Part of [phase 13](phase-13-online-multiplayer.md), stacked on 13e (PR base `phase-13e-online-play`).

Built without a review round (the product owner was away); decisions are in `review-notes-13.md` under 13f.

## Scope

- **Reconnect.** A dropped socket keeps the member in the room for `NET_RECONNECT_GRACE_MS` (20 s, Colyseus `allowReconnection`). Their players stand still meanwhile (no inputs: the 13a buffers let go after a quarter second), others see "<name> reconnecting…". The browser shows "Reconnecting…" over the screen it was on and the SDK retries for the whole grace period. Back in: same session, same players, same couch devices, mid-round included. After the grace period they're removed as if they had left. If reconnecting fails the browser shows why with a Back to the title button.
- **Page reload rejoins.** The room code and reconnection token live in `sessionStorage` (per tab, survives a reload, not a new tab). On boot, a fresh token sends the page straight back into the room.
- **Silent drops.** A socket that stops delivering (laptop sleep, a wifi that hangs rather than drops) is closed by the client after `NET_SILENCE_TIMEOUT_MS` (4 s) without a message, which starts the reconnect.
- **Host leaving / migration.** While the host is disconnected or after they leave, the first connected member drives the menus. A host whose machine has no joined player can still drive every screen (level select, intro, pause, results): their presses count as the room's player 1 device for the menus.
- **Members leaving for good.** In the lobby: dropped and renumbered (as now). Outside a round (level select, results): dropped and renumbered right away. Mid-round: their character stays and stands still until the round ends; dropped when the round is stopped or the next one starts. A room left without players goes back to the lobby.
- **Late join.** Joining while a round runs: the newcomer spectates the round (it already got snapshots) with "Round in progress: you'll join after it". Their devices can join a player on the lobby, the level select and the results screen (a join press, Enter or gamepad A), so they play the next round whatever the host picks.
- **Rounds count for everyone who was there at the start.** A round is recorded in the profile of every member in the room when it started, also when they left mid-round. Late joiners don't get it. The browser records it in its local save only if it was counted and saw the round being played (not a page that came back on the results).
- **Server hygiene.** A per-member message budget (token bucket: `NET_MAX_MESSAGES_PER_SECOND` 120, burst `NET_MESSAGE_BURST` 60) drops floods; Colyseus kicks clients far past it. Rooms nobody has pressed anything in for `NET_ROOM_IDLE_MS` (30 min) close with a message. A server shutting down tells every room ("The server is restarting") before closing. The protocol version is checked again on reconnect (the `welcome` carries it; a reloaded page running another version leaves with "another version").
- **Cheap open items:** the guest's level select hint, Esc in the online lobby asks for a second Esc before leaving, the `roundStart` carries a round id so a reconnect doesn't restart the round on screen.
- **Tooling:** `npm run verify:online` (`scripts/verify-online.mjs`): two (or three) headless Chromes against a running `npm run dev:online`, exercising a whole online session including the resilience cases. Not part of CI.
- Not in scope: client-side prediction (13g), guest pause, taking over a departed player's character, deploys.

## Design

### Protocol (`src/net/protocol.ts`), version 3

- `RoundStartMessage` gains `roundId` (per room, counting up) and `counted` (this member counts in the round: in the room when it started).
- New server message `closing { reason: 'idle' | 'shutdown' }`, sent right before the server closes the room.
- `LobbyMember.connected` is now real.

### Room logic (`server/roomLogic.ts`, pure)

- `Member` gains `connected`, `budget` (message tokens). `RoomState` gains `roundId`, `participants` (`{ sessionId, profileId, displayName }` at round start), `lastActivityTick`, `closing`, `reconnectGraceMs` not needed (Colyseus side).
- `hostOf(room)`: the first connected member, else the first member.
- `dropMember(room, sessionId)`: connected = false, its pending presses dropped, new `lobby` to everyone. `rejoinMember(room, sessionId)`: connected = true, sends that session `welcome`, `lobby` and (when a round is loaded) `roundStart` with the same round id, and a new `lobby` to everyone.
- `leaveRoom`: as before, plus `pruneDeparted` when no round is loaded (removes and renumbers the players of devices whose session left); also run on `startLevel` (before creating the game) and `stopRound`. No players left after the lobby → back to the lobby screen.
- `allowedPresses`: on host screens, the host's presses from devices without a player are re-labelled as player 1's device, so the flow (which only takes joined devices after the lobby) accepts them. On the lobby, level select and results, join presses from any member's unbound device bind a new player (same capacity rule as the lobby: the member's couch count grows while the room has space).
- `handleMessage` spends one token; empty → dropped (counted in `member.dropped`). `stepRoom` refills `NET_MAX_MESSAGES_PER_SECOND / 60` per tick up to the burst.
- `menu`/`inputs` messages with something in them mark activity; `stepRoom` sets `room.closing = 'idle'` and sends `closing` after `NET_ROOM_IDLE_MS` of server ticks without any.
- `recordForMembers` uses `participants` (profile writes once per user, `levels` for those still in the room).

### Server shell (`server/GameRoom.ts`, `app.ts`)

- `onDrop` → `dropMember` + `allowReconnection(client, grace)`; `onReconnect` → `rejoinMember`; `onLeave` (consented, or after the grace ran out) → `leaveRoom`.
- `GameRoomSettings.reconnectGraceMs` (tests use short ones), `maxMessagesPerSecond` hard cap (5× the budget).
- After each tick batch: `core.closing` → `disconnect()`. `onBeforeShutdown`: send `closing: shutdown`, reject pending reconnections (so shutdown doesn't wait for grace periods), then disconnect.

### Client (`src/net/client.ts`, `src/net/rejoin.ts`, `src/flow/online.ts`)

- `client.ts`: reconnection tuned (`minUptime` 0, retries spread over the grace period, no message queue while away: stale inputs and pings are worthless), `rejoinRoom(url, token)` (`client.reconnect`), `reconnectionToken()` on the connection plus an `onToken` callback after join and each reconnect, a silence watchdog, and close reasons: `closing` message or close code 4001 → `serverShutdown`/`roomClosed`, a failed reconnect → `reconnectFailed`.
- `rejoin.ts` (pure): `RejoinTicket { joinCode, token, role, savedAtMs }`, `encodeTicket`, `parseTicket(text, nowMs)` (null when malformed or older than the grace period).
- `online.ts`: `OnlineStatus` gains `rejoining`; `onlineMenuPresses(state, presses, nowMs)` arms "press Esc again to leave" in the lobby (`NET_LEAVE_CONFIRM_MS` 3 s); `reconnectingMembers(state)`; `isSpectating(state)` (in a round with no local players); welcome with another protocol → close with `protocolMismatch`.
- `OnlineError` gains `serverShutdown`, `roomClosed` (idle), `reconnectFailed`.

### Scene and UI

- `GameScene`: saves the ticket on join/reconnect (and clears it on leave or close), boots into the room from a ticket (`OnlineOptions.rejoin`), keeps the round on screen while reconnecting, reuses the `OnlineRound` for a `roundStart` with the same round id, records locally only when `counted` and the round was seen playing.
- `onlineLobby.ts`: reconnecting members marked in the lobby list and on the bar; "Reconnecting…" banner (big, centered) while this browser reconnects; spectator line during a round; the lobby leave hint switches to "Esc again to leave".
- `levelSelect.ts`: online guests see "Host picks the level · Enter or gamepad A: join the next round" instead of the play hint.

## Files

- `src/net/protocol.ts`, `src/net/rejoin.ts` + tests, `src/net/client.ts`, `src/net/onlineRound.ts` + test
- `src/flow/online.ts`, `src/flow/flow.ts` (`OnlineError`, `enterOnline`) + tests
- `src/sim/balance.ts`, `src/sim/content.ts`
- `server/roomLogic.ts` + `roomLogic.test.ts`, `server/GameRoom.ts`, `server/app.ts`, `server/resilience.test.ts` (sdk clients: reconnect within/after grace, reload rejoin by token, rate limit, cleanup, shutdown)
- `src/render/GameScene.ts`, `src/main.ts`, `src/ui/onlineLobby.ts`, `src/ui/levelSelect.ts`, `src/style.css`
- `scripts/verify-online.mjs`, `package.json` (`verify:online`)
- `server/README.md`, `docs/game/README.md`, `docs/plan/review-notes-13.md`

## Steps (one commit each)

1. This plan.
2. Protocol v3 + room logic: connected/drop/rejoin, host = first connected, menu aliasing, late joins, prune departed, participants, rate budget, idle close + tests.
3. Server shell: reconnection, shutdown, idle close, hard rate cap + integration tests.
4. Client: wrapper reconnection, rejoin ticket, silence watchdog, close reasons; pure online state + tests.
5. Scene and UI: reconnect banner, rejoin on reload, spectating, lobby Esc confirm, guest hints.
6. `verify:online` script; browser checks and fixes.
7. Docs, done boxes, review notes, PR.

## Tests

- Room logic: drop keeps the member and their players, marks them not connected, moves menu authority to the next connected member and back on rejoin; rejoin sends welcome, lobby and the same round id; host without a player drives level select, intro, pause and results; leaving mid-round keeps the character until the round stops, then renumbers; leaving at the level select renumbers at once; no players left → lobby; late join binds on level select and results but not mid-round; participants recorded after leaving mid-round, late joiners not; budget drops a flood and refills; idle close after the idle time and not before.
- Integration (real server, `@colyseus/sdk` clients, sockets closed abruptly): reconnect within the grace period keeps the session, the player and the round; others see `connected: false` then `true`; after the grace period the member is gone and the token no longer works; a fresh `Client` rejoins with the stored token (the reload path); floods are dropped without kicking; the room disposes once its last member's grace ran out; server shutdown sends `closing`.
- Pure client: ticket encode/parse/expiry; Esc confirm; reconnecting members; spectating; protocol check on welcome; online round reuse by id.

## Done when

- [ ] A dropped socket (offline for a few seconds) comes back into the same round with its player, checked in a browser
- [ ] A page reload mid-round comes back into the same round with its player, checked in a browser
- [ ] Others see "<name> reconnecting…" while someone is away; after the grace period the member is removed
- [ ] The host leaving mid-round makes the guest host, who can pause, finish and pick the next level (browser)
- [ ] Someone joining mid-round spectates and plays the next round (browser)
- [ ] Rounds are recorded for members who left mid-round; late joiners aren't
- [ ] Floods are dropped, idle rooms close, a server shutdown tells the clients
- [ ] Guest level-select hint, Esc confirm in the online lobby
- [ ] `npm run verify:online` runs the browser checks
- [ ] `npm run check`, `npm run build` and `npm run build:server` pass; the suite passes several runs in a row
- [ ] CI is green
