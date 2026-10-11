# Phase 13d: Online lobby

**Goal:** from the title, a player can host an online room or join one with its 4-letter code. Everyone in the room sees the online lobby (code, members, their couch players, host badge, connection status); couch players on every machine join with their own devices; the host starts and picks a level, and the server's intro and countdown show on every screen. Local couch play stays exactly as it was. Part of [phase 13](phase-13-online-multiplayer.md), stacked on 13c (PR base `phase-13c-identity`).

Built without a review round (the product owner was away); decisions are in `review-notes-13.md` under 13d.

## Scope

- `src/net/client.ts`: the only browser networking code, a thin wrapper around `@colyseus/sdk` (moved to `dependencies`).
- Title: `Host online` and `Join online` under `Play`. A join-code screen (keyboard typing, or a gamepad letter wheel) with friendly errors.
- The online lobby screen and the online level select (the host's stars and locks), drawn from the server's messages. The client doesn't run its own flow while online.
- Menu authority online: lobby open to everyone; level select, intro, pause and results only for the host's devices. Pause is room-wide. No settings/profile online.
- The room's unlock data (host's levels) in the `lobby` message.
- Not in scope: the online round itself (13e). When the host starts a level the client shows the server's intro card and countdown, then a "round in progress" placeholder (no render of the round).

## Design

### Local flow (`src/flow/flow.ts`, pure)

- `Screen` gains `joinCode` (typing a code) and `online` (the local flow hands the screen to the online session).
- Title items: `play`, `hostOnline`, `joinOnline`, `settings`, `credits` (`TITLE_ITEMS`).
- `Flow.joinCode: JoinCodeEntry = { text, cursor, error, busy }`; `Flow.online: boolean` marks a room's flow (set by the server).
- `hostOnline` → screen `online`, effect `{ type: 'hostOnline' }`. `joinOnline` → screen `joinCode` with an empty entry.
- On `joinCode`: back → title (and `cancelJoin` if a join is out); gamepad: up/down cycle the letter under the cursor, left/right move it, confirm submits. Keyboard typing comes from the DOM (`editJoinCode(flow, text)`, `submitJoinCode(flow)`). Submit checks `normalizeJoinCode`: bad → `error: 'badCode'`; good → `busy`, effect `{ type: 'joinOnline', code }`.
- The glue reports back: `joinSucceeded(flow)` → screen `online`; `joinFailed(flow, error)` → error shown, not busy; `onlineEnded(flow)` → title, cursor on the online line it came from.
- A room's flow (`flow.online`): back in the lobby does nothing (leaving is the client's business), the pause menu has no Settings or Quit (`resume`, `restart`, `levelSelect`, `changePlayers`).
- `FlowContext.canStart?(deviceId)`: who may start the game from the lobby; default player 1 (as before). `updateLobby` takes it.

### Online session state (`src/flow/online.ts`, pure)

`OnlineState = { role, status, error, sessionId, joinCode, members, levels, flow, serverTick }` and:

- `createOnline(role)`, `onlineConnected(state, sessionId, joinCode)`, `applyServerMessage(state, message)` (welcome, lobby, snapshot, roundStart, error), `onlineStatus(state, status, error?)`.
- `isOnlineHost`, `hostIsChoosing(state)` (a host-only screen and this machine isn't the host), `membersWithPlayers(state)` (each member with its couch players, local device ids), `onlineMenuPresses(state, presses)` → `{ send, leave }`: back on the lobby (or while connecting, or after the connection failed) leaves; everything else goes to the server.
- `onlineErrorFromCode(code)` maps protocol `ErrorCode`s to the screen's friendly errors.

### Client wrapper (`src/net/client.ts`)

- `socketUrl(httpUrl)`: `http` → `ws`, `https` → `wss`.
- `hostRoom(url, hello)` / `joinRoomByCode(url, code, hello)` → `Promise<NetConnection>`; reject with `JoinError { code: 'wrongCode' | 'roomFull' | 'protocolMismatch' | 'unreachable' }`.
- `NetConnection`: `sessionId`, `joinCode`, `send(message)`, `onMessage(cb)` (messages that came before anyone listened are kept and replayed), `onStatus(cb)` (`connected`, `reconnecting`, `closed`), `leave()`.
- `toJoinError(error)`: Colyseus's "invalid room id" (522) → `wrongCode`; our refusal codes come through; anything else → `unreachable`.
- `GAME_ROOM` moved to `src/net/protocol.ts` (the server re-exports it).
- `helloFor(identity, localPlayers)` builds the hello with `identity.userId` and `displayName`.

### Server (`server/roomLogic.ts`)

- The room flow is `online`.
- Lobby: a member's couch player count grows when another of its devices joins, while the room has space (`localPlayers` in `hello` is what it starts with). Back presses are dropped. Only a bound device of the host can start.
- Every other screen: only presses from the host's devices count.
- `LobbyMessage.levels`: the room's unlocks (the host's levels), sent on join, leave, hello, the host's profile arriving and after each finished round. `PROTOCOL_VERSION` 2.
- Snapshots keep the whole `Flow` (a few hundred bytes in menus); not slimmed.

### Scene and UI glue

- `GameScene` keeps `online: OnlineState | null` and the `NetConnection`. While the local screen is `online` it polls devices, sends presses as `menu` messages, and emits a `FlowView` built from the server's flow, with `save.levels` = the room's levels and `online` = the session. Effects `hostOnline`/`joinOnline`/`cancelJoin` start or drop a connection; `ONLINE_LEAVE_EVENT` (Leave button) and leave presses close it and go back to the title.
- `FlowView.online: OnlineState | null`, `FlowView.isHost`.
- `src/ui/joinCode.ts`: the code entry (4 boxes, a text input that keeps keys from the game, the error line).
- `src/ui/onlineLobby.ts`: code (big) + Copy, members with name, host badge, "you", each member's players with color and hat, the status line, the start hint, Leave. Also the "Round in progress" placeholder.
- The online bar (in `src/ui/onlineLobby.ts`) sits on top of every online screen but the lobby: the room code, the connection, "Host is choosing a level" (or "Paused by the host", ...) for guests on the host's screens, and Leave. The level select, intro, countdown, pause and results screens themselves are the local ones, drawn from the room's flow.
- `main.ts`: hands the scene `serverUrl` and the identity; routes `FLOW_EVENT` to the online screens.
- Texts in `src/sim/content.ts` (`ONLINE_TEXT`, menu labels).

## Files

- `src/flow/flow.ts`, `flow.test.ts`; `src/flow/online.ts`, `online.test.ts`
- `src/input/lobby.ts`, `lobby.test.ts` (`canStart`)
- `src/net/protocol.ts` (`levels`, version 2), `src/net/client.ts`, `server/client.test.ts` (real server)
- `server/roomLogic.ts`, `roomLogic.test.ts`, `server/GameRoom.ts`, `server/server.test.ts`
- `src/render/GameScene.ts`, `src/main.ts`, `src/ui/joinCode.ts`, `src/ui/onlineLobby.ts`, `src/ui/profile.ts` (`copyText` exported), `src/style.css`, `src/sim/content.ts`
- `scripts/screenshots.ts` (title shots follow the new menu, `screens/join-code`, `screens/online-lobby`), `docs/game/README.md`
- `package.json`: `@colyseus/sdk` to `dependencies`

## Steps (one commit each)

1. This plan.
2. Flow: title items, join-code screen, online flags, `canStart` + tests.
3. Online state (`online.ts`) + tests.
4. Server: authority, lobby growth, levels in `lobby`, protocol 2 + tests.
5. Client wrapper + integration test against a real server.
6. Scene/main glue and UI (join code, online lobby, host note), browser check with two tabs.
7. Screenshots and docs.
8. Done boxes, review notes, PR.

## Tests

- Flow: title lists the online lines and Play still opens the local lobby; join-code typing filters to the code alphabet and 4 letters; gamepad wheel; bad code error; submit emits `joinOnline`; back cancels; `joinFailed`/`joinSucceeded`/`onlineEnded`; online lobby ignores back; online pause menu; `canStart` limits who starts. All old flow tests stay green.
- Online state: welcome/lobby/snapshot/roundStart/error applied; host detection; `hostIsChoosing`; members with their players; leave presses vs presses sent.
- Server (pure): only host presses drive level select, pause and results; guests still join in the lobby; only the host starts; a member's couch count grows while there's room and stops when full; lobby back is ignored; `lobby` carries the host's levels, also after the profile arrives and after a round.
- Client wrapper (real Colyseus server on port 0): host gets a code and its welcome/lobby (also when listening late), a second client joins by code and both see two members, friendly errors for a wrong code, a full room, a protocol mismatch and no server; `leave` closes; status events.

## Done when

- [x] Title has Host online and Join online; Play still starts local couch play exactly as before
- [x] Join online takes a 4-letter code (keyboard or gamepad) and shows friendly errors for no such room, room full, protocol mismatch and server unreachable
- [x] The online lobby shows the code (with Copy), members with names, a host badge, each member's couch players with colors and hats, and the connection status; Leave works
- [x] Couch players on each machine join with their own devices; the host starts and picks a level, guests see "Host is choosing a level"
- [x] Level select online shows the host's stars and locks
- [x] Starting a level shows the server's intro and countdown on every machine
- [x] Verified in a real browser with two tabs (host and guest both in the lobby)
- [x] `npm run check`, `npm run build` and `npm run build:server` pass
- [ ] CI is green

Manual check: `npm run dev:online`, open two browser windows. In one: Host online, note the code. In the other: Join online, type the code, Enter. Both lobbies list both names, the host has the badge. Press Enter in each window to join a player, then E in the host's: the host gets the level select, the guest sees "Host is choosing a level". Pick Garage: both show the intro card, then the countdown.
