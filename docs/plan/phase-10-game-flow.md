# Phase 10: Game flow, menus and save data

**Goal:** the game feels like a finished product from boot to the last star: a title screen, a menu you can drive with any controller, progress that's saved, and a "next level" button.

## Today

`GameScene` holds the whole flow: lobby → level select → round → end screen (interact: play again, dash: level select). Best stars per level are stored in `localStorage` (`src/ui/progress.ts`). You can't pause, there's no title screen, no settings and no "next level", and every level is open from the start.

## Flow (pure TS, tested)

- New folder `src/flow/` (add it to the folder layout in `AGENTS.md`): a plain-data state machine for the screens, outside `src/sim/` because it isn't part of a round, but held to the same rules (no Phaser, no DOM, JSON-serializable)
- Screens: `title`, `lobby`, `levelSelect`, `playing`, `paused`, `results`, `settings`, `credits`
- Menu input is per device and per frame: `{ deviceId, nav: { x, y }, confirm, back }`. Keyboard: arrows/WASD, Enter/Space, Escape. Gamepad: stick/d-pad, A, B, Start opens the pause menu. `updateFlow(flow, presses, save)` returns the effects for the scene to run (`startLevel`, `restartLevel`, `quitRound`, `saveResult`, ...) and never touches Phaser
- `GameScene` only runs the current round; the flow decides what happens next. Move the lobby and level select handling out of the scene
- Who can drive menus: on `title` any device; after the lobby only joined devices (same as the level select today)

## Screens

- **Title**: game name, `Play`, `Settings`, `Credits`. "Press any button" first, which also unlocks browser audio
- **Lobby**: as today, plus `back` to the title. The lobby stays the same between levels; `Change players` in the level select and pause menu goes back to it
- **Level select**: as today, plus locked levels (greyed out, with what you need to unlock them), best score next to best stars, and the total number of stars
- **Pause** (Escape / Start, from any joined device): the sim stops advancing (the `GameLoop` isn't advanced and its time accumulator is reset on resume). `Resume`, `Restart`, `Level select`, `Quit to title`
- **Results** (replaces the end screen): stars, score, "New best!", "Level unlocked!", then `Next level` (selected by default when unlocked), `Retry`, `Level select`. Keep the input delay so nobody skips it by accident
- **Settings**: sound volume, screen shake on/off. Stored in the save and applied right away
- **Credits**: rendered from the same list as `CREDITS.md`

## Save data

- Replace `src/ui/progress.ts` with a versioned save under one `localStorage` key: `{ version: 1, levels: { [levelId]: { bestStars, bestScore, plays } }, settings: { sfxVolume, screenShake } }`
- Load validates everything and falls back to defaults field by field; a save from a newer version is read as far as it can be, never thrown away
- Migrate the old `isv-simulator.best-stars` key on first load
- Only progress and settings are saved, never a round in progress
- Unlocking: a level unlocks when the one before it has at least `STARS_TO_UNLOCK` stars (1, in `balance.ts`). The first level is always open. `?unlockAll` opens everything for testing

## Tests

- Flow: every screen transition, including back, pause/resume, next level on the last level, and that non-joined devices can't drive menus after the lobby
- Pause: no ticks pass while paused, and resuming doesn't fast-forward
- Save: round trip, defaults for missing or broken fields, migration from the old key, storage that throws
- Unlocking: first level open, next level opens at `STARS_TO_UNLOCK`, a worse result never re-locks or lowers a best

## Done when

- [ ] Boot → title → lobby → level select → play → results → next level, all with only a gamepad, and all with only a keyboard
- [x] Pause works from every device in the round and the clock doesn't jump on resume
- [x] Progress and settings survive a reload; clearing site data starts fresh without errors
- [x] `npm run check` passes
