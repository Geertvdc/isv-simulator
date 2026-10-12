# Review notes for phase 13 (online multiplayer)

Decisions made without you, open questions and issues found while the sub-phases were built by agents. Review these with the PRs.

## How to playtest online

The whole online stack (13a net core, 13b server, 13c profiles, 13d lobby, 13e online play, 13f resilience, 13g prediction of your own player) is played from the last branch of the stack.

1. **Start it.** `npm install`, then `npm run dev:online`: Vite on 5173 and the game server on 2567 (`curl localhost:2567/health` says `ok`). Add `ROUND_SECONDS=30` in front to make every online round 30 s.
2. **Two (or more) players on one machine:** open the game in two windows, one of them private (each browser profile has its own user id). On other machines on the LAN: open `http://<your-ip>:5173`; the game finds the server on the same host, port 2567 (or set `VITE_SERVER_URL` when the server is elsewhere).
3. **Play.** Title → Host online: a room code shows. Others: Join online, type the code, Enter. Everyone presses Enter (or gamepad A) to join a player, more couch players on any machine too (4 per room). The host presses E to pick a level and plays; Esc on the host pauses everyone. Results go to every player's profile (Settings → Online profile shows the id; `curl localhost:2567/profiles/<id>`).
4. **Break it on purpose** (13f): turn a machine's wifi off for a few seconds mid-round (it shows "Reconnecting…", the others "<name> reconnecting…", it comes back into the round); reload a page mid-round (straight back in); join from a third window mid-round (it watches, then joins on the results with Enter); have the host click Leave room mid-round (the next player drives pause and the results); stop the server (everyone is told). Offline longer than 20 s: removed, with a message.
5. **Slow network:** `?lag=100&jitter=20` on the game's URL (or `NET_LAG_MS=50 NET_JITTER_MS=20` on the server). `N` shows the ping corner. Your own player is predicted (13g): it answers the keys at once even with lag. Add `predict=0` (`?lag=100&jitter=20&predict=0`) to feel the difference; the ping corner then says "no prediction".
6. **Automated check:** `npm run verify:online` runs most of step 4 with three headless Chromes against its own server and Vite (about two and a half minutes, needs Chrome; set `CHROME` if it isn't in the usual place). `npm run verify:prediction` (13g, about two minutes) measures your own player's key-to-motion time and correction jitter with and without prediction and lag. `npm run check` covers the rest, including real-server tests.
7. **Deploy notes** are in `server/README.md` (one container, a volume for profiles, WebSockets through the ingress).

## How to review this stack

Stacked PRs, each on top of the one before: 13a → `main`, 13b → 13a, 13c → 13b, 13d → 13c, 13e → 13d, 13f → 13e, 13g → 13f. Merge in order, rebase-merge only. To play the whole thing, check out the last branch (`phase-13g-prediction`).

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

## 13c identity and profiles

PR: `phase-13c-identity` → `phase-13b-server`. A user id and display name per browser (Settings → Online profile), a JSON-file profile store and `GET`/`PUT /profiles/:userId` on the server, a start-up sync of the local save, and rooms that follow the host's profile and record every member's rounds. Plan and file list in `phase-13c-identity.md`; the API in `server/README.md`.

### Decisions

- **Two keys:** `isv-simulator.userId` (a UUID v4, lower case) and `isv-simulator.displayName`. The name isn't stored until someone picks one; until then it is `Dev NNNN` with the digits taken from the id, so the same id always gets the same default. Where `crypto.randomUUID` is missing (it needs a secure context, so plain `http://` on a LAN has only `getRandomValues`) the id is built from 16 random bytes.
- **Profile ids are UUID v4s everywhere.** The HTTP API answers 400 for anything else, and a room member whose hello `userId` isn't one plays without a profile (nothing loaded, nothing recorded). Ids are compared in lower case, so a pasted upper-case id is the same user. The 13a protocol still accepts any `[A-Za-z0-9_-]` id in `hello`, so the 13b tests' `user-ada` keep working.
- **The profile screen is a flow screen** (`profile`, under Settings, from the title and from pause): `Copy ID`, `Change name`, `Use another ID`, `Back`. The flow stays pure: those three lines emit a `profileAction` effect; the scene passes it on as `PROFILE_ACTION_EVENT` and `src/ui/profile.ts` does the DOM work (clipboard, a small text dialog). Keyboard and gamepad navigate it like every menu.
- **Text entry needs a keyboard.** While the dialog is open its keydowns stop at the dialog (so typing `M`, `E` or arrows never mutes, picks or moves anything; key-ups still reach the game so nothing stays held), the scene holds back all menu presses, and any back button (gamepad B, or Esc when the text box lost focus) closes it. There is no on-screen keyboard: gamepad-only players can copy their id and look at it, not type one.
- **"Use another ID" asks twice:** Enter checks the format, a second Enter switches. The old id is forgotten on this browser (it's not deleted on the server). The local save is not cleared: it merges into the new id's profile on the sync that follows, so switching ids adds this browser's progress to that user. That is what "bring my progress to this browser" wants; it does mean two people can't use one browser to keep separate progress.
- **Copy** uses `navigator.clipboard`, and falls back to selecting the id and `document.execCommand('copy')` outside a secure context. The id is also selectable with the mouse.
- **Sync = one `PUT` with the local levels**, which the server merges and answers. On boot, after a name change and after an id change. The answer is merged into the in-memory save again (a round might have finished while the request was out) and written. A default name is never sent, so it can't overwrite a name picked on another device. Settings and `tutorialDone` stay local.
- **Merge rule:** per level best stars and best score win; `plays` is the larger count (adding would count rounds twice, since the same rounds are on both sides after the first sync). Shared by browser and server (`mergeLevels` in `save.ts`).
- **Offline is silent:** any failure (no server, timeout after `NET_PROFILE_TIMEOUT_MS` = 4 s, 500, junk) leaves the save alone. The only trace is a line on the profile screen ("Server not reachable: progress stays on this device for now") and the browser's own network error in devtools. `?scene=` pages never sync.
- **Server URL:** `VITE_SERVER_URL`, or the page's protocol and host on port 2567 (IPv6 hosts bracketed). CORS: Colyseus already answers every route with permissive CORS headers (it echoes the `Origin`, preflight included), so nothing was added; a test checks it for `http://localhost:5173`.
- **Store:** `ProfileStore` with `get`, `merge(userId, { displayName?, levels? }, now)` and `recordResult(userId, levelId, result, now, displayName?)`, all async, times passed in as ISO strings. `JsonFileProfileStore` keeps one JSON file (`{ version: 1, profiles: { [userId]: Profile } }`), read lazily on first use. Every call (reads too) goes through one promise chain, so changes are serialized and never interleave; after each change the whole file is written to `<path>.<pid>.tmp` and renamed over it. A file that isn't a JSON object is renamed to `<path>.corrupt-<time>` and the store starts empty; broken profiles in a good file are skipped one by one; a read error other than "missing" (say, permissions) fails the call and is retried on the next one, so a good file is never overwritten with nothing. One file rewritten per change is fine for an internal game (a few hundred profiles); a database is the upgrade path if it ever isn't.
- **Rooms:** each `Member` has `profileId` and `levels`. The profile is loaded after the join (not awaited: the join stays synchronous and is fast; it lands long before anyone reaches the level select) and merged into the member's levels, so a round finished before it arrived isn't lost. `room.save.levels` is a copy of the host's levels, refreshed when the host's profile arrives and when the host changes. When a round ends, `finishRound` records it in the room's save (the host's copy), and `recordForMembers` records it in every member's `levels` and queues one `ProfileWrite` per distinct user id; `GameRoom` drains them after each tick batch into `store.recordResult` (with the member's display name). Store errors are logged and never stop a room.
- **The room class gets its store through `gameRoomWith(store)`** (a subclass) rather than Colyseus's `defineRoom` default options, because those merge with the client's join options and a client could overwrite them. `startGameServer(port, { store })` takes a store; tests pass a `MemoryProfileStore`.
- **Docker:** the image sets `PROFILE_STORE_PATH=/app/server/data/profiles.json` and makes that folder writable for the `node` user; mount a volume there (`-v isv-profiles:/app/server/data`). Tried locally: a `PUT` writes the file in the volume.

### Open questions

- **Online level select needs the host's progress on the clients.** Snapshots carry the flow, not the room's save, so a client drawing the level select (13d) can't show stars and locks yet. Easiest: add the room's `levels` to the `lobby` message or the snapshot.
- **Members who leave mid-round don't get the round recorded** (only members in the room when it ends). 13f (reconnection) may want to count members in their grace period.
- **The settings and profile screens run in the room's flow too** (any joined device can open them online, the profile actions do nothing there). 13d should probably hide Settings online or make it local.
- **Display names in rooms come from `hello`**, not from the profile. 13d's lobby will send `identity.displayName` in `hello`, so they match in practice.
- No way to "log out" or start fresh other than pasting a new random id; and two people sharing one browser share progress. Fine for now?
- Local rounds played while the server is up are only pushed at the next boot (or name/id change). Syncing after each finished round would be a one-line call in `main.ts` if wanted.

### What to check

- `npm run dev:online`, open the game: Settings → Online profile shows an id, `Dev NNNN`, and "Progress synced with the server." Copy ID, then `curl localhost:2567/profiles/<id>`.
- Change name: type a name (letters like M and E must type, not mute or pick), Enter. Esc cancels. The new name shows up in the `curl`.
- Play a level, reload (sync), `curl` again: the level is in the profile. Open another browser (or a private window), Settings → Online profile → Use another ID, paste, Enter, Enter: the level select there opens the same levels.
- Stop the server and reload: the game plays as before; the profile screen says the server isn't reachable.
- Corrupt `data/profiles.json` by hand and restart the server: it starts empty and keeps `profiles.json.corrupt-<time>` next to it.

## 13d online lobby

PR: `phase-13d-online-lobby` → `phase-13c-identity`. Title gets Host online and Join online, a join-code screen, the online lobby, and the online level select, intro and countdown drawn from the server's messages. The round itself still only runs on the server: clients show a "Round in progress" placeholder until 13e. Plan and file list in `phase-13d-online-lobby.md`.

### Decisions

- **Two flows, one on each side.** The browser's own flow gets two screens: `joinCode` (typing a code) and `online` (it hands the screens to the room and waits). While online, the scene shows the room's flow from the server's snapshots, with the room's unlocks as `save.levels` and the room's clock (`serverTick`) for the countdown and results delay. The session state lives in `src/flow/online.ts` (pure: status, members, levels, the room's flow, the server tick) and the scene keeps it with the `NetConnection` (`GameScene.online`, `GameScene.connection`). `FlowView.online` tells the UI it is in a room.
- **The flow stays pure.** Host online and Join online emit `hostOnline` / `joinOnline { code }` / `cancelJoin` effects; the scene runs them with `src/net/client.ts` and reports back with `joinSucceeded`, `joinFailed(error)` and `onlineEnded` (pure functions in `flow.ts`).
- **Menu authority (decided: host only).** In the lobby every machine's devices join their own couch players. Only the host's joined devices start the game (`FlowContext.canStart`, also on the couch, where it defaults to player 1 as before), so the host starts even when a guest's device joined first and is player 1. On every other screen (level select, intro card, pause, results, and pausing a round) the server only takes the host's presses. Pause is room-wide (the room has one flow). Guests see a bar on top: "Host is choosing a level", "Host starts the round", "Paused by the host", "Host is choosing what is next".
- **Leaving is local.** Back in the room's lobby never reaches the server (a room's flow ignores it anyway, `flow.online`), it leaves the room, like back leaves the couch lobby for the title. Leave room buttons are on the lobby and on the online bar (so a guest can leave mid-round or from the level select). The online pause menu has no Settings and no Quit to title (`resume`, `restart`, `levelSelect`, `changePlayers`). The settings and the online profile can't be reached while online (only the speaker button and M mute work); they are this browser's own business anyway.
- **Couch players per machine grow as they join.** The client says `localPlayers: 1` in its hello (it can't know how many will join). In the lobby, a join press from one more device on that machine raises the member's `localPlayers` while the room has space, and is dropped when 4 players are in. A member's first seat stays reserved, so the room never has more players than its members' counts add up to.
- **Unlocks in the `lobby` message** (`levels`: the host's progress, a copy). Sent on join, leave, hello, when the host's profile arrives (`setMemberProfile` now returns the message) and after each finished round. `PROTOCOL_VERSION` is now 2 (a field was added to a server message).
- **Snapshots still carry the whole `Flow`.** In menus it's a few hundred bytes at 20 Hz, so slimming it wasn't worth a second message type. The client only redraws when the flow actually changed (compared as JSON).
- **Typing a code**: four letter boxes with an invisible text box over them. Its keydowns stop there, so typing W, E or Q doesn't move or pick anything; Enter joins, Esc goes back; pasting `ab-cd` works. Letters outside the code alphabet (I, O, digits) are dropped as they're typed. After a refused code the text is selected, so typing replaces it. A gamepad turns letters with up/down, moves with left/right, joins with A, backs out with B.
- **Friendly errors**: `badCode` (not 4 code letters, checked before connecting), `wrongCode` (Colyseus's 522 "invalid room id"), `roomFull`, `protocolMismatch` (our refusal codes), `unreachable` (anything else, e.g. no server), `disconnected` (the connection closed while in the room). Texts in `ONLINE_TEXT` in `content.ts`.
- **The client wrapper** keeps messages that arrive before anyone listens and hands them to the first listener, so nothing between the join and the scene subscribing is lost. Status comes from the SDK's `onDrop` (reconnecting), `onReconnect` and `onLeave`. The SDK's own automatic reconnection is left on as it is; 13f decides what reconnecting means for the room.
- **`@colyseus/sdk` moved to `dependencies`** (the browser bundle uses it). `GAME_ROOM` moved to `src/net/protocol.ts`, the server re-exports it.
- **Screenshots**: `screens/join-code` and `screens/online-lobby` (the second member joins from the script itself with the client wrapper; needs `npm run dev:online`, `--server=` if it's elsewhere). The title shots follow the longer menu.

### Assumptions

- The server is at `VITE_SERVER_URL` or the page's host on port 2567, as for the profile API (13c).
- A guest who never joined a device in the lobby is a spectator: their screens follow the room, but nothing of theirs is bound.

### Open questions

- **A new host without joined devices can't drive the menus.** When the host leaves after the lobby, the next member becomes host; if that member never joined a player, nobody can pick a level (after the lobby only joined devices count). 13f (host leaving) should send the room back to the lobby or let the new host's devices in.
- Should guests be allowed to pause (and then only the host resumes)? Today only the host can, so a guest whose doorbell rings has to shout.
- Should Esc in the online lobby ask before leaving? It leaves at once, like it goes back to the title on the couch.
- The guest's level select hint still says "Enter: play"; the bar says the host chooses. A per-role hint would be nicer.
- The map behind the online menus stays the one the browser had loaded (the first level); 13e loads the round's map on `roundStart`.

### What to check

- `npm run dev:online`, open two browser windows (a private one for the second, so it has its own user id). In the first: Host online, a code shows with you as host. In the second: Join online, type the code, Enter. Both lobbies list both names, the host with the badge.
- Press Enter in each window: each machine gets its player (colors and hats in join order); Enter again in one adds its second keyboard player. Press E in the guest's window: nothing. Press E in the host's: the host gets the level select, the guest sees it too with "Host is choosing a level" on top.
- Host picks Garage: both show the intro card, then the countdown, then "Round in progress". Esc in the host's window pauses for both; the guest's Esc does nothing during the round.
- Leave room in the guest's window: back on the title, and the host's lobby/bar shows one member less.
- Join online with ZZZZ: "No room with that code". Stop the server: Host online says the server is not reachable, Esc goes back.
- Local couch play: Play, Enter, Enter, E: exactly as before.

## 13e online play

PR: `phase-13e-online-play` → `phase-13d-online-lobby`. A whole online round: inputs up, snapshots down, the round drawn through the couch renderers 100 ms (plus half a round trip) behind the server, events and sounds once each, results for everyone, plus a lag simulator and a ping corner (both were listed under 13f; they were needed to check this phase). Plan and file list in `phase-13e-online-play.md`.

### Decisions

- **One set of renderers.** They read a `RoundView` (`src/render/roundView.ts`: a state plus `renderPos`/`renderManagerPos`). The couch `GameLoop` already was one; online, `frameView` turns the interpolated frame into one. `GameScene.renderRound(view, events, flow, time)` drives every renderer, the HUD frame, effects and sounds for both. Local play goes through the same call as before.
- **Render time = estimated server tick − half the round trip − `NET_INTERP_DELAY_MS`** (`roundRenderTick` in `src/net/onlineRound.ts`). 13a's `renderTickFor(estimate)` subtracts only the delay; a snapshot only gets here half a round trip after the server took it, so at 100 ms each way render time would sit right on the newest snapshot and stutter. With the half round trip, a 100 ms + 80 ms jitter link never ran out of snapshots in the browser checks.
- **Events play when render time reaches the snapshot that brought them** (not on arrival), so a sound or shake matches the picture. Each snapshot's events are queued once (duplicates and out-of-order snapshots add nothing) and taken once. Before the clock is synced everything plays at once.
- **Inputs:** each frame one `InputCommand` per local player (`localBindings`: the players bound to this machine's devices, from the room's lobby), screen-relative to world as on the couch, stamped with `inputTargetTick`. At most one send per target tick (`src/net/inputStamp.ts`); a tap on a frame that sent nothing is OR-ed into the next send so it isn't lost; a clock resync starts the stamper over. Inputs go out during the countdown too, so the first tick has them.
- **Pings** every `NET_PING_INTERVAL_MS` (500 ms), the first `NET_PING_FAST_COUNT` (8) every 100 ms, from the moment the room is joined, so the clock is synced long before the round.
- **Round start and end:** `roundStart` makes a new `OnlineRound`; a round on another level restarts the scene on that map (the map behind the online menus now follows the room). A snapshot with `game: null` (back to the level select) or the connection closing drops the round and restarts the scene for a clean map; so does leaving mid-round.
- **Results:** the star chimes and a `recordLevel` in this browser's save, once per round, only for a round whose state has a result (right after the host picks Retry/Next, the new `roundStart` arrives while the last snapshot still shows the results: without that check the browser counted the round twice; found in the browser check). The local record is the same one the server writes into the profile, so the next profile sync (max of both) agrees.
- **First-level hints are skipped online**: they point at one machine's players and save `tutorialDone`.
- **Music** follows the room's flow and the online round's clock (hurry at the end), like on the couch.
- **Lag simulator** (`src/net/lag.ts`): `?lag=<ms>&jitter=<ms>` on the page delays every message the browser sends and receives by `lag` plus up to `jitter`, so `lag=100` adds about 200 ms to the round trip. The server does the same with `NET_LAG_MS`/`NET_JITTER_MS`. Order is kept: one queue and one timer per direction (a timer per message let two messages a fraction of a millisecond apart swap, which a test caught). Capped at 2 s. Seeded RNG, so the pure part is tested.
- **`ROUND_SECONDS`** on the server makes every round that long, for trying the results; `RoomOptions.roundTicks` in the room logic, used by the round test.
- **Ping corner** (`src/ui/netHud.ts`): bottom right over the clock, "Ping 42 ms", "waiting for the server" when render time ran past the newest snapshot, and the simulated lag. On in dev builds and with `?nethud`, `N` toggles it.
- **The online bar steps aside during a round**: small, over the score, bottom left (on top it covered the orders). The "Round in progress" placeholder is gone.
- **Dev debug handle**: dev builds set `window.isvNet` (render tick, interpolation status, frames that waited, drawn positions, the drawn state, events played by type, the music track). The browser checks below read it.

### Assumptions

- Smooth enough without client-side prediction: at 100 ms each way your own player answers keys about 340 ms after the press (couch: under 100 ms). Everyone else glides smoothly. Prediction for the local players is the upgrade if playtests find it sluggish.
- Spectators (a member with no joined player) send no inputs and just watch.

### Open questions

- Is the extra input delay online acceptable, or should 13f (or later) predict the local players' own movement?
- Should the host's guests also get the first-level hints online?
- The ping corner shows in dev by default; in production only with `?nethud`. Should it always be available with `N`? (It is: `N` works in production too, it just starts hidden.)

### How it was verified

- `npm run check` (711 tests, the full suite run 10 times in a row without a failure after the lag queue fix), `npm run build`, `npm run build:server`.
- `server/round.test.ts`: two `src/net/client.ts` connections with real clock sync and input stamping play a 3 s Garage round on a real server: both join a player, the host starts, both walk; both get snapshots with both players moved, identical snapshots for the same server tick, the same results, and both profiles in the store have the round.
- In the browser: two headless Chromes (separate profiles, so two user ids) driven over the DevTools protocol against `vite` and the server (`ROUND_SECONDS=25`). Host online, join with the code, both join a player, the host picks Garage. Checked from page JS and screenshots: both screens show both players walking, the host's player picks up a ticket and the guest sees it carried, the HUD clock, score and orders match, Esc on the host pauses both (the guest's clock stops), both get the results with stars, the host's Next level loads Open Plan's map on both, both local saves and both server profiles got the round once, the snapshot events played are the same on both machines (e.g. `orderCreated: 3, pickedUp: 1, levelEnded: 1`), the music is the chapter track while playing and the menu track on the results. Leave room mid-round on the guest goes back to the title while the host plays on. On The Reorg (host with every level open) the manager, a meeting invite (icon and HUD card) and review stations show on both.
- Smoothness: sampled the drawn positions every animation frame while both players walked. Without lag, with `?lag=100&jitter=20` (round trip ~220 ms), `?lag=100&jitter=80` (~295 ms), server `NET_LAG_MS=50 NET_JITTER_MS=20` (~125 ms) and both together (~250 ms): never a frame waiting for a snapshot, never a step backwards, never a still frame mid-walk, the drawn position moves exactly 5 tiles/s of render time (0.0833 tiles per render tick, every frame), and render time advances 1.00 ticks per frame (sd ~0.05, that's the frame timing). No rubber-banding. Own key to own player moving on screen: ~90 ms without lag, ~340 ms at 100 ms each way.
- Local couch play checked in the browser too (Play, two keyboard players, Garage with its hints, pause): as before, no ping corner or room bar.

## 13f resilience

PR: `phase-13f-resilience` → `phase-13e-online-play`. Reconnecting, rejoining after a reload, host migration on every screen, late joins, rounds counted for leavers, server hygiene, a few small open items, and `npm run verify:online`. Plan and file list in `phase-13f-resilience.md`; how it behaves on the wire in `server/README.md`.

### Decisions

- **Grace period 20 s** (`NET_RECONNECT_GRACE_MS`), Colyseus `allowReconnection` in `onDrop`. While away the member stays in the room with their players (who stand still: no inputs) and their couch devices; `LobbyMember.connected` is now real. The SDK's own reconnection is tuned in `src/net/client.ts`: no 5 s minimum uptime, retries spread over the whole grace period (`reconnectRetries`), and nothing queued while away (stale inputs and pings are worthless).
- **Silent sockets:** the client closes a socket it heard nothing on for `NET_SILENCE_TIMEOUT_MS` (4 s; snapshots come 20 times a second, even in menus), which starts a reconnect. Covers a laptop waking up or a wifi that hangs instead of dropping. The SDK also closes on the browser's `offline` event.
- **Reload:** `sessionStorage` (`isv-simulator.rejoin`) keeps `{ joinCode, token, role, savedAtMs }`, saved after joining and after every reconnect (the token changes), dated again on `pagehide`; a ticket older than the grace period isn't tried. On boot the page goes straight to "Getting back into the room…" and `client.reconnect(token)`. Per tab, on purpose: a new tab is a new player. A failed rejoin shows "Couldn't get back into the room in time" with Back to the title.
- **"Return to the title with a clear message"** is the online lobby panel in its closed state (the reason in red, Back to the title, Esc), as 13d already did for a lost connection, rather than an automatic jump to the title, which would hide the reason.
- **While reconnecting** the screen it was on stays, with a big "Connection lost. Reconnecting…" banner; presses are not sent and Esc doesn't leave (Esc is pause; walking out of the room during a wifi blip would be cruel). The Leave room button still works.
- **Host:** the earliest joined member whose connection is up (`hostOf`). So the host badge (and the room's unlocks, which follow the host) move to the next member while the host is away and come back with them. Simple, and no screen is ever undriveable for 20 s.
- **A host without a player** (13d note) drives every screen after the lobby: the room passes their presses on as player 1's device, since the flow only takes joined devices after the lobby. In the lobby they still join a player to start (the hint says so). No auto-binding.
- **Leaving for good:** outside a round the leaver's players go at once and the rest are renumbered (also on the level select and results now, not only the lobby). Mid-round their character stands still until the round ends; it's dropped when the round stops or the next one starts. A room without any players left after that goes back to the lobby. Nobody takes over a departed character (deferred).
- **Late join:** someone joining mid-round watches (they already got the round in 13e; now the bar says "Round in progress: you're watching, you'll join after it"). On the level select and the results, a member without any player joins one with a join press (Enter / gamepad A), which does nothing else that frame; so they play the next round whatever the host picks (Retry, Next or another level). Members with players add more couch players only through Change players, so the host's Enter on the results can't accidentally add their second keyboard scheme.
- **Rounds count for who was there at the start** (`room.participants`), leavers included, late joiners not. `roundStart` now says so (`counted`), with a `roundId` (so a reconnect carries on with the same round on screen instead of restarting it). The browser records a round locally only when it was counted and it saw the round being played: a page that comes back on the results doesn't chime or count it again (the profile has it).
- **Message budget:** a token bucket per member, 120 messages a second with bursts of 60, refilled per server tick; past it messages are dropped silently (counted on the member). Colyseus disconnects a client at 600 a second. A normal client sends at most ~75 a second (one `inputs` per tick, pings, menu presses).
- **Idle rooms** close after 30 min without a press or a move (pings and standing still don't count) with `closing { reason: 'idle' }`. Empty rooms already close when the last member leaves; a room where everyone dropped closes when the last grace period ends.
- **Shutdown:** `onBeforeShutdown` sends `closing { reason: 'shutdown' }` and closes with code 4001 at once (pending reconnects are dropped, so a restart doesn't wait 20 s). The browser says "The server is restarting. Host a new room in a minute."
- **Protocol version 3** (`roundId`, `counted`, `closing`). Checked again on reconnect: the server's `welcome` after a reconnect carries the version and a client that doesn't match leaves with "another version".
- **Esc in the online lobby asks first:** the first back press turns the hint into "Press Esc or gamepad B again to leave the room" for 3 s (`NET_LEAVE_CONFIRM_MS`); the Leave room button leaves at once.
- **Guest level-select hint:** "The host picks the level · Enter or gamepad A: join the next round if you have no player yet".
- **`npm run verify:online`** (`scripts/verifyOnline.ts`, with a small DevTools client in `scripts/cdp.ts`) is the browser check, not in CI. `screenshots.ts` keeps its own copy of the DevTools client for now.

### Deferred

- Guests pausing (still host only); the "Esc or Start: pause" hint still shows for guests and spectators.
- Taking over a departed player's character mid-round.
- A server-side protocol check on reconnect (the SDK's reconnect sends no options; the client checks the `welcome` instead).
- Moving `screenshots.ts` onto `scripts/cdp.ts`.
- Showing the reason on the title itself instead of the closed lobby panel.

### What to check

- See "How to playtest online" at the top: step 4 is this phase.

### How it was verified

- `npm run check` (746 tests; the whole suite 6 times in a row, the server tests 3 times in parallel, no failures), `npm run build`, `npm run build:server`.
- `server/roomLogic.test.ts` (resilience block, 17 tests): drop keeps players and moves the menus, rejoin sends welcome/lobby/same round, a spectator host drives level select, intro, pause and results, leaving mid-round keeps the character until the next round, renumbering, back to the lobby without players, late joins on results and level select only, participants recorded after leaving, the budget, idle close.
- `server/resilience.test.ts`: real server, `@colyseus/sdk` clients behind TCP proxies whose sockets are destroyed: reconnect within the grace period (same session, the others see `connected: false` then `true`, same `roundId`, still bound), removal after the grace period (and the token stops working), a fresh client rejoining with the token (the reload path), the host moving while away and back, a 300-message flood dropped without a kick, the room closing after its last member's grace, shutdown sending `closing` and code 4001 within a second despite a pending 60 s grace.
- In the browser, `npm run verify:online` (12/12 on two runs; 11/11 on the run before the last step was added): three headless Chromes against the dev build. Checked: Esc once in the lobby only asks; the guest's level-select hint; both walk in a round; the guest offline for 5 s (DevTools network emulation) shows the banner, the host shows "Grace reconnecting…", the guest comes back into the same round and walks; the guest reloads mid-round and is back in the round walking; a third browser joins mid-round and watches; the host clicks Leave room mid-round, the guest pauses (the watcher sees "Paused by the host") and resumes, the round ends, the late joiner joins on the results, the guest starts the next round and the late joiner walks in it; the late joiner offline past 20 s gets "Couldn't get back into the room in time" and Esc to the title, and the room lets them go; the host's server profile has the round they left. Screenshots looked right (banner, bar, closed panel).
- By hand: a server stopped with `SIGTERM` while a browser was in a room: "The server is restarting. Host a new room in a minute." Local couch play (two keyboard players, a round, pause): unchanged, no room bar or ping corner.

## 13g prediction

PR: `phase-13g-prediction` → `phase-13f-resilience`. Your own developer is predicted online: it moves on the frame you press the key, also with lag, and the server's snapshots correct it. Plan and file list in `phase-13g-prediction.md`.

### Decisions

- **Only movement is predicted** (position, velocity, facing, dash), only for the players bound to this machine. Picking up, working, throwing and shipping stay the server's: a pickup still shows when the snapshot brings it (about a round trip plus 100 ms with lag), but the ticket is then drawn on the predicted body, so it never trails behind it.
- **Same code as the server.** `movePlayer` (the per-player half of `tick`: dash on the press, then `stepPlayer`) and `pushOutOfManager` (split out of the manager push) are called by both `tick` and `src/net/prediction.ts`, plus the sim's own `separatePlayers`. A unit test plays the same inputs through `tick` and through prediction and gets identical positions, velocities, facing and dash state every tick.
- **Timeline:** inputs are stamped for server tick `T` (13a), the server applies them at `T`, and the snapshot labelled `S` comes after ticks below `S` ran. The client draws its own players after tick `T`, between the predicted ticks `T` and `T + 1` with the fraction of the target tick (like `GameLoop` on the couch); everyone else is still drawn interpolated 100 ms plus half a round trip in the past. So your player lives ahead of the others (normal for prediction): with lag, a teammate you walk next to is drawn where they were ~300 ms ago.
- **Reconciliation** on every snapshot the round keeps: start from the server's players at `S`, drop the inputs below `S`, replay the rest (ticks without a sent input repeat the last one, idle after `NET_INPUT_REPEAT_TICKS`, exactly like the server's input buffer) up to the tick prediction had reached. The difference becomes a visual offset that glides away with a 100 ms time constant (`NET_PREDICT_SMOOTH_MS`); past 1.5 tiles (`NET_PREDICT_SNAP_DISTANCE`) it snaps. At most 60 ticks (`NET_PREDICT_MAX_TICKS`) are simulated in one go.
- **Other players:** prediction simulates them along from the newest snapshot without input (they slow down and stop) and lets everyone push each other with the sim's own `separatePlayers`; they are never drawn from it. So walking into a teammate who stands still (at a station, say) and pushing them predicts exactly what the server does: zero corrections in the browser check. A teammate who walks into you is off by up to a round trip and gets corrected (small, glides). The first version froze them where the snapshot had them; that gave small backward wobbles (0.016 tiles) while pushing a teammate in the browser check, so it was changed.
- **Managers** are obstacles where the newest snapshot has them (they walk slowly). A manager bumping you is a `managerBumped` event: snaps.
- **Hard cases:** a snapshot whose events say a local player was shoved (or shoved someone) or was bumped by a manager snaps instead of gliding. While the round doesn't run (pause, results) nothing is predicted and your player is where the server has it; the step back after a pause (prediction ran on for about a round trip) glides, under the pause screen, which covers the map. The **countdown** is predicted: its end is known from the room's clock (`countdownEndTick(countdownStartMs)`, the round's first sim tick; a server test pins that down), so prediction stands still until then and moves from that tick, without waiting for the first `playing` snapshot. Nothing in the sim teleports players (meetings only need you to stand in the room), so there's nothing else to snap on.
- **`?predict=0`** turns it off (the 13e behaviour) for comparison; the ping corner then says "no prediction". On by default.
- **Debug:** `window.isvNet.predict` (on, local ids, reconciles, corrections, snaps, largest correction), `isvNet.server` (the newest snapshot's positions) and an opt-in per-frame `isvNet.trace` for scripts.

### Known gaps

- A pause pressed on this machine isn't predicted: your player runs on for about a round trip and then glides back (invisible under the pause screen). Freezing prediction on your own pause press would make it exact, if it ever matters.
- Effects and sounds of your own dash still come with the snapshot (interpolated time), a little after the dash starts on screen with lag.
- Your player is drawn ahead of the others, so with lag a teammate you bump into is drawn a bit behind where the push happens. Standard for prediction; interpolating others closer to "now" would need extrapolation.

### How it was verified

- `npm run check` (774 tests; the whole suite 5 times in a row without a failure), `npm run build`, `npm run build:server`.
- Unit tests (`src/net/prediction.test.ts`, 19): a server (the real input buffers and `tick`) and a predicting client with fixed delays both ways: without lag the prediction equals the server after every tick through walls, the station row, corners and two dashes; at 100 ms each way it runs 13 ticks ahead and needs no correction at all; replay keeps only the inputs from the snapshot tick on; sparse inputs repeat and stop like the server; a mismatch is replayed on top of the server's position and glides; past 1.5 tiles or with a shove event it snaps; pause and results hold the server position; the countdown predicts exactly; pushing a teammate predicts exactly; a teammate walking across corrects without snaps; the 60-tick cap; turned off does nothing; drawing between ticks; the offset decay never overshoots and never moves more than a walking step per frame.
- In the browser, `npm run verify:prediction` (16/16, on several runs): two headless Chromes, a round on Garage, the host's page measured in four settings (it rejoins the same round through the 13f ticket after each URL change). Key to motion is measured from the keydown event to the first drawn frame that moved in the key's direction, over 10 taps; jitter from every drawn frame over a course of walking into the left wall, up into a keyboard station, diagonally along the station row and through the gap, two dashes and into the counters' corner (backward step: a frame moving against the held keys by more than 0.005 tiles, ignoring the first 200 ms after a key change; snap: faster than 1.3 × dash speed).

  | Setting                           | Round trip | Key to motion (median, 10 taps) | Backward steps | Snaps | Corrections / largest |
  | --------------------------------- | ---------- | ------------------------------- | -------------- | ----- | --------------------- |
  | no lag, prediction                | ~1 ms      | 22–27 ms                        | 0              | 0     | 0–10 / ≤ 0.07 tiles   |
  | no lag, `predict=0`               | ~1 ms      | 129–141 ms                      | 0              | 0     | –                     |
  | `?lag=100&jitter=20`, prediction  | ~225 ms    | 20–28 ms                        | 0              | 0     | 2–6 / ≤ 0.12 tiles    |
  | `?lag=100&jitter=20`, `predict=0` | ~225 ms    | 356–367 ms                      | 0              | 0     | –                     |

  About 20–30 ms is one to two frames: the key is seen on the next frame and drawn on it. (13e quoted ~90 ms and ~340 ms without prediction measured another way; this script measures from the keydown event, so the numbers are a bit higher.) Standing still afterwards the drawn player is exactly where the server has it (0.0000 tiles) in every setting. Also checked: the guest sees the host's walk interpolated without jitter; a pause pressed while walking with lag stops the player where the server stopped it (it glides back at most ~0.2 tiles a frame, under the pause screen) and it stays there; a ticket picked up from the inbox is drawn on the predicted body while walking with lag (screenshot); walking into the guest and pushing them: 0 backward steps, 0 snaps, 0 corrections; a restarted round's countdown: standing still, then moving with no backward steps or snaps.

- `npm run verify:online` still passes (12/12). CI is green.

## 13h player names

Asked for after the stack was built: set your multiplayer name from the online lobby.

- **Your name** row in the online lobby with **Change name**: a text box (Enter saves, Esc cancels, max 24 characters). The name is saved in this browser (same as Settings → Online profile), synced to the profile, and shown to everyone in the room right away, mid-round too.
- New client message `rename { displayName }` (protocol version 4). It doesn't reuse `hello`, which also carries the couch player count and would trip the room's capacity check once couch players have joined.
- While the box is open, game keys and menu presses pause (same as the profile dialog), so typing E or Esc never starts a level or leaves the room.
- Found while verifying: an Esc in a text box without `preventDefault` runs Chrome's own Esc action, which in headless Chrome stopped the page's frames. The box prevents it, like the profile dialog.
- `verify:online` has a rename step: the guest renames, the host sees it, Esc closes the box and both stay in the room.
