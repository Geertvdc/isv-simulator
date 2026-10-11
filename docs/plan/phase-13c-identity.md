# Phase 13c: Identity and profiles

**Goal:** every browser has a user id it can show, copy and replace, and the server keeps a profile (display name + level progress) per user id. Local progress merges into the profile when the server is reachable, the room uses the host's profile for unlocks, and every member of a room gets an online round's result recorded. Part of [phase 13](phase-13-online-multiplayer.md), stacked on 13b (PR base `phase-13b-server`).

Built without a review round (the product owner was away); decisions are in `review-notes-13.md` under 13c.

## Scope

- Client identity in `localStorage`, shown and edited on a new "Online profile" screen under Settings.
- Server `ProfileStore` (JSON file, atomic writes) and `GET`/`PUT /profiles/:userId`.
- Rooms load members' profiles, use the host's levels as the flow's save context, and record every member's result.
- Startup sync of the local save with the profile. Offline play is unchanged when the server can't be reached.
- Not in scope: lobby UI (13d), online play (13e).

## Files

- `src/flow/identity.ts` (pure, `StorageLike`): `USER_ID_KEY` (`isv-simulator.userId`), `DISPLAY_NAME_KEY` (`isv-simulator.displayName`), `Identity = { userId, displayName }`, `normalizeUserId(text)` (trim, lower case, UUID v4 or `null`), `normalizeDisplayName(text)` (trim, collapse spaces, 1 to `NET_MAX_NAME_LENGTH`, or `null`), `defaultDisplayName(userId)` (`Dev 1234`, the digits from the id), `loadIdentity(storage, newId)`, `replaceUserId(storage, identity, text)`, `setDisplayName(storage, identity, text)`. Storage guarded like `save.ts`.
- `src/flow/save.ts`: `parseLevels(raw)`, `mergeLevels(a, b)` (best stars and best score per level win, plays = max) and `recordLevel(levels, levelId, result)` split out so the server reuses them; `parseSave` and `recordResult` use them.
- `src/flow/flow.ts`: settings get an `Online profile` line leading to a `profile` screen with `Copy ID`, `Change name`, `Use another ID`, `Back`. Those three emit a `profileAction` effect; the flow stays pure and knows nothing about ids.
- `src/ui/profile.ts`: the profile screen (id, name, menu, a status line) and a small DOM dialog for typing a name or pasting an id (validated; a new id needs a second Enter to confirm). The dialog stops keydown from reaching the game's keyboard listeners while it is open.
- `src/render/GameScene.ts`: runs `profileAction` by emitting `PROFILE_ACTION_EVENT`; while the UI says a dialog is open (`DIALOG_EVENT`) menu presses are held back, and a gamepad's back button cancels the dialog (`DIALOG_CANCEL_EVENT`).
- `src/net/profileApi.ts` (pure, `fetch` injected): `serverUrl(envUrl, location)`, `createProfileApi(baseUrl, fetch)` with `get` and `put`, `syncLevels(api, identity, levels)` returning the merged levels or `null` on any failure, `parseProfile`.
- `src/main.ts`: loads the identity (`crypto.randomUUID`), mounts the profile screen, and starts one background sync on boot (and after the id changes) that merges the result into the in-memory save and writes it.
- `server/profileStore.ts`: `Profile`, `ProfileStore` (`get`, `merge`, `recordResult`), `MemoryProfileStore`, `JsonFileProfileStore` (`PROFILE_STORE_PATH`, default `server/data/profiles.json`; lazy load; corrupt file renamed to `<path>.corrupt-<time>` and started empty; writes serialized through one promise chain; temp file + rename).
- `server/app.ts`: `GET /profiles/:userId` (404 when unknown), `PUT /profiles/:userId` with `{ displayName?, levels }` (400 on a bad id or body), both with Colyseus's CORS headers. `startGameServer(port, { store })`.
- `server/roomLogic.ts`: members carry the levels loaded from their profile; `setMemberProfile(room, sessionId, levels)` merges them in; the room's save context follows the host (`room.save.levels` = host's levels, also after the host leaves); a finished round is recorded in every member's levels and queued as `ProfileWrite`s (one per user id) that `takeProfileWrites(room)` drains.
- `server/GameRoom.ts`: `gameRoomWith(store)` gives the room class its store; loads profiles on join, writes queued results after each tick batch. Store errors are logged, never fatal.
- `.gitignore`: `server/data/`.

## Steps (one commit each)

1. This plan.
2. `save.ts` split + `identity.ts` + tests.
3. Profile store + tests.
4. HTTP endpoints + tests.
5. Room profiles (pure logic + Colyseus glue) + tests.
6. Client API + startup sync + tests.
7. Profile screen (flow, UI, scene) + tests, browser check.
8. Done boxes, review notes, PR.

## Tests

- Identity: creates and persists an id, keeps a valid stored one, replaces an invalid stored one, works without storage, replaces with a pasted id (any case, spaces), refuses a bad one, display name default, edit and validation.
- Save: `mergeLevels`, `recordLevel`, `parseLevels` (and the old save tests stay green).
- Store (memory and JSON file in a temp dir): create on merge, load after a restart, merge keeps bests and max plays, record result, corrupt file backed up and started empty, missing file, 50 concurrent writes all land.
- HTTP: GET unknown is 404, PUT creates and merges, bad ids and bodies are 400, CORS headers for `http://localhost:5173`.
- Room: host's profile drives unlocks (level select confirm works only for unlocked levels), host change switches the save, a finished round queues a write for every member (once per user id) and updates every member's levels; integration: a real server with a memory store loads the host's profile.
- Client API: URL default, sync merges and returns levels, failures (network, bad JSON, non-200) return `null`.
- Flow: settings → profile → back, the three actions emit `profileAction`.

## Done when

- [ ] A user id is created on first boot, kept in `localStorage`, shown under Settings → Online profile with Copy, Use another ID and Change name
- [ ] `npm run server` serves `GET`/`PUT /profiles/:userId` backed by `server/data/profiles.json` (gitignored, atomic writes, survives a corrupt file)
- [ ] With the server running, booting the game merges local progress into the profile and back; without it, the game plays as before
- [ ] A room uses the host's profile for unlocks and records a finished round for every member
- [ ] `npm run check` and `npm run build` pass
- [ ] CI is green

Manual check: `npm run dev:online`, open the game, Settings → Online profile: copy the id, play a level, reload, `curl localhost:2567/profiles/<id>` shows it. Paste that id in another browser's profile screen: its level select opens the same levels.
