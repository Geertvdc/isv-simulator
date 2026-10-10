# Phase 12: Music, onboarding and transitions

**Goal:** new players get it without someone explaining, and the game sounds and moves like a finished one.

## Scope

- **Music**: a menu track and level tracks (one per chapter is enough). The level track speeds up or switches in the last 30 seconds. Music volume next to sound volume in settings. Every track in `CREDITS.md`
- **Level intro**: before the clock starts, a card with the level name, the order recipes you'll see (as station letters) and, for a level that teaches a new mechanic, one line and a picture of it. Any joined player skips it
- **First-level hints**: the first time the garage is played (stored in the save), short hints point at the inbox, the keyboard and the ship hatch until each has been used once
- **Transitions**: fade between screens, a "3, 2, 1, Ship it!" countdown before the round, and the stars on the results screen counting up one by one
- **Accessibility basics**: menus readable from the couch (big text), and each player's color paired with a shape or hat so it doesn't rely on color alone

## Tests

- Hints: shown until used, never again once done, never in other levels
- Countdown: the sim doesn't advance before it's over, and inputs during it are ignored

## Done when

- [ ] Someone who has never played gets through the first level without being told what to do
- [x] Music and sound volumes work independently and are remembered
- [x] `npm run check` passes

## Implementation

Built without a review round (the user was away); decisions are in `review-notes.md` under Phase 12.

### Files

- `src/flow/save.ts`: `settings.musicVolume` (0–10, default in `balance.ts`) and `tutorialDone` (top level). Saves without them get the defaults; `SAVE_VERSION` stays 1.
- `src/flow/flow.ts`: two new screens before `playing`:
  - `intro`: the level card. Confirm from any joined player goes on to the countdown; back returns to the level select. Shown when a level is picked (level select, "Next level"); Restart and Retry skip it and go straight to the countdown.
  - `countdown`: "3, 2, 1" (`COUNTDOWN_STEP_MS` each), then `playing`. Every press is ignored; `isRoundRunning` is false, so the sim does not tick. `countdownLabel(flow, nowMs)` is the pure text for the UI. "Ship it!" shows as the round starts.
  - A `music` menu line under `volume` in the settings.
- `src/flow/hints.ts` (pure): which first-level hints show (`inbox`, `keyboard`, `ship`), only on the Garage while `tutorialDone` is false; each goes away once the sim shows it used (`pickedUp` event, any code progress, `orderShipped` event). All three used → `tutorialDone`, saved.
- `src/render/music.ts` (pure): the track for a screen and level (menu track outside rounds and on the results, one track per chapter in rounds), the playback rate (`MUSIC_HURRY_RATE` in the last `MUSIC_HURRY_TICKS`), and the duck factor while paused.
- `src/render/MusicPlayer.ts`: plays and cross-fades tracks on the game's sound manager, kept across scene restarts; starts after the first button press on the title (browsers unlock audio on a gesture).
- `src/render/SoundPlayer.ts`: the sound volume is applied per sound instead of on the global sound manager, so music and sound volume are independent.
- `src/render/HintRenderer.ts`: a bobbing arrow and label over the tiles of each open hint.
- `src/render/PlayerRenderer.ts`, `playerColors.ts`: a hat per player (1 round beanie, 2 party cone, 3 square top hat, 4 diamond), drawn over the body; `src/ui/playerBadge.ts` draws the same shape as a small SVG for the lobby slots and invite cards.
- `src/ui/intro.ts`: the intro card (chapter, level, the recipes as station letters in their colors, the mechanic line with a procedural SVG picture) and the countdown overlay.
- `src/ui/screens.ts`: stars on the results count up one by one; settings show music volume.
- `src/style.css`: screens fade in; sizes in `rem` scaled with the window height so 1080p gets bigger text; smallest texts bumped.
- `src/sim/content.ts`: intro mechanic lines, hint texts, countdown text, menu labels. `src/sim/balance.ts`: countdown, star count-up, music numbers.
- `public/assets/music/*.ogg`: CC0 tracks from OpenGameArt, listed in `CREDITS.md`.

### Steps (one commit each)

1. Save fields + tests.
2. Flow: intro and countdown screens, music setting + tests.
3. Hints + tests.
4. Music: tracks, credits, track selection + tests, player, separate sfx volume.
5. Intro card, countdown overlay, hints in the scene.
6. Transitions: screen fades, camera fade-in, results stars counting up with a sound.
7. Accessibility: player hats, badges in lobby and invites, couch-sized text.
8. Done boxes, review notes, PR.

### Tests

- Save: missing `musicVolume` / `tutorialDone` get defaults; broken values fall back; they are written back.
- Flow: picking a level shows the intro; any joined player skips it, others can't; back goes to the level select; Restart/Retry skip the intro; the countdown ignores every press, the round does not run until it is over and then does; countdown labels.
- Hints: shown on the Garage until each is used; never again once `tutorialDone`; never on other levels.
- Music: track per screen and chapter, speed-up only in the last 30 s of a round, ducked while paused.
