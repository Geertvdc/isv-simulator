# Phase 4: Multiplayer input

**Goal:** 2 to 4 people on one screen join a lobby and walk around together, on keyboards and gamepads.

## Input layer (`src/input/`)

- A `Controller` abstraction: reads a device each frame and returns a screen-relative `{ move, interact, work, join }`
- Keyboard split:
  - Left: WASD to move, E interact, Q work
  - Right: arrows to move, right Shift interact, right Ctrl work
- Gamepads via the Gamepad API, up to 4: left stick or D-pad to move (with a dead zone), A interact, X work
- Converts screen directions to world directions with `screenDirToGrid` and produces one `InputCommand` per joined player per tick
- Handles gamepads connecting and disconnecting mid-game: the player stays, and stands still until a pad joins again

## Lobby

- "Press A or Enter to join" screen showing four slots
- A gamepad joins with A. Enter joins the left keyboard scheme first, then the right one
- Each joined player gets a color and the next free spawn `1` to `4`
- Start when at least one player has joined (start button: Enter or A by player 1)
- DOM overlay, not Phaser text

## Sim

- `createGame(levelMap, seed, playerIds)` spawns each player on their spawn point
- Player vs player collision: circles push each other apart softly (`PLAYER_PUSH_STRENGTH`), never overlapping for long and never pushed into walls

## Tests

- Keyboard mapping: each key produces the right move/interact/work for its scheme, and the two schemes don't interfere
- Gamepad mapping with a fake `Gamepad` object: dead zone, D-pad, buttons
- Per-tick input commands: one per joined player per tick, tagged with the right `playerId` and `tick`
- Lobby: join order, spawn assignment, no double joins from one device
- Player vs player push: two players walking into each other separate, and nobody ends up inside a wall

## Out of scope

Carrying, stations, online play.

## Done when

- [ ] Two players on one keyboard plus two gamepads can join and walk around at the same time
- [ ] Pressing up on any device moves that player up on screen
- [ ] Bumping into each other feels like a soft shove, not a wall
- [ ] `npm run check` passes
