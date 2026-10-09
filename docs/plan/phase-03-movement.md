# Phase 3: Movement

**Goal:** one player on the keyboard walks a developer around the garage, and it feels good.

## Sim

- `GameState`: `seed`, `rngState`, `tick`, `level`, `players` (one for now). JSON-serializable.
- `createGame(levelMap, seed)` places player 1 on spawn `1`
- `tick(state, inputs)` with `InputCommand = { playerId, tick, move: { x, y }, interact, work }`. `move` is a world direction with length 0 to 1
- Player: `id`, `pos` (grid units, floats, tile centers on integers), `vel`, `facing` (unit vector)
- Movement: acceleration toward `move * PLAYER_MAX_SPEED`, stronger deceleration when there is no input, so starting and stopping feel snappy. All numbers in `balance.ts`
- Collision: the player is a circle of `PLAYER_RADIUS` against solid tiles (`isSolid`). Resolve per axis so walking diagonally into a wall slides along it. Round off corners: a player clipping a corner by a small amount gets nudged around it instead of stopping dead
- Facing follows the last non-zero `move`
- `targetTile(state, playerId)`: the tile in front of the player (position + facing × `INTERACT_REACH`, rounded). This is what interact and work will act on later

## Input (render side)

- WASD and arrows, screen-relative: "up" moves up on screen. `screenDirToGrid(dir)` in `src/render/projection.ts` turns a screen direction into a world direction, normalised
- One `InputCommand` per sim tick for player 1

## Game loop (render side)

- Fixed-timestep accumulator at `TICKS_PER_SECOND = 60`, capped ticks per frame to avoid a spiral of death
- Render interpolates player positions between the last two ticks

## Render

- Placeholder developer: a colored capsule or circle with a nose showing `facing`, depth-sorted with blocks
- The target tile in front of the player is highlighted when it is a station or counter

## Tests

- Acceleration reaches max speed and stops within the expected ticks
- Diagonal input is not faster than straight input
- Collision: never ends up inside a solid tile, over many random inputs (seeded)
- Sliding: diagonal input against a wall keeps moving along the wall
- Corners: walking past a corner with a small overlap slides around it instead of sticking
- `targetTile` for each facing direction
- `screenDirToGrid`: screen up/down/left/right map to the expected world directions, and the result is unit length

## Out of scope

More than one player, gamepads, picking things up.

## Done when

- [ ] Walking around feels responsive, with no jitter at 60 Hz and above
- [x] You can't walk through walls or stations, and you slide along walls without getting stuck on corners
- [x] The highlighted tile always matches the station you're facing
- [x] `npm run check` passes
