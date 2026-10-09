# Phase 2: Pivot cleanup and level format (done)

**Goal:** turn the management-sim scaffold into the base for an Overcooked-style couch co-op game: fixed auto-fit camera, a front-facing view, and a level format with stations.

## Scope

### Camera and view

- Remove camera rotation completely: code, key bindings, state, tests
- Auto-fit camera: frames the whole level and refits on window resize (`src/render/cameraFit.ts`, pure and tested). It keeps bands free for the HUD (`CAMERA_HUD_TOP` for the order bar, `CAMERA_HUD_BOTTOM`) and centers the level between them
- Pan (mouse drag), zoom (wheel) and tile hover only in debug mode (F3 or backtick); leaving debug mode refits. No keyboard panning: the keyboard belongs to the players
- Front-facing 3/4 view, Overcooked style: grid rows run horizontally across the screen (`VIEW_YAW = 0`), the floor is squashed by `VIEW_PITCH`, blocks show their top and front face. A small `VIEW_YAW` can turn the level so one side face shows too
- All projection math in `src/render/projection.ts`; the sim only sees grid coordinates
- Walls on the camera side of the room are drawn low so they never hide stations

### Level format

| Char | Meaning |
|---|---|
| `#` | wall |
| `.` | floor, walkable |
| `C` | counter |
| `I` | inbox: new tickets appear here |
| `K` | keyboard station: write code (hold work button) |
| `T` | test bench: run tests (hold work button) |
| `R` | review station: needs two players at once (used later) |
| `P` | pipeline: put a ticket in, it builds on a timer |
| `S` | ship: deliver finished tickets |
| `X` | bin: throw away a ticket |
| `1` to `4` | player spawn points (floor) |

- `parseLevelMap(text): LevelMap` with `{ width, height, tiles: Tile[], spawns }` (row-major), in `src/sim/level.ts`
- Every level has exactly one of each spawn `1` to `4`
- Clear errors with line and column for unknown chars, uneven rows and duplicate spawns
- `getTile(map, x, y)` returns `null` out of bounds; `isSolid(tile)` is true for everything except floor, and for out of bounds
- `maps/level-01-garage.txt` (14×10) replaces the Startup Pit
- Levels are sized for a 16:9 screen with the HUD bands: about 14 wide by 10 deep fills it best at the current camera angle
- Stations render as colored placeholder blocks with their letter on top; counters are plain grey blocks; debug mode shows grid coordinates and `P1` to `P4` on spawns

### Docs

- `AGENTS.md`: new intro, `TICKS_PER_SECOND = 60`, rules for per-tick input commands, no Phaser physics, screen-relative input; new glossary

## Tests

- Parser: every char, spawns, CRLF, uneven rows, unknown char, duplicate and missing spawn, the garage level
- `getTile` out of bounds, `isSolid`
- Projection: round trip, tile picking near corners and edges, depth follows screen position, the front edge is (almost) horizontal, visible block faces
- Camera fit: centering, width- and height-limited fits, insets, centering between uneven HUD bands

## Done when

- [x] No rotation code or keys left
- [x] The level fills a 16:9 window between the HUD bands and refits on resize
- [x] Pan, zoom and hover only work in debug mode
- [x] The garage renders with distinct, labeled stations and nothing hidden behind the front wall
- [x] `npm run check` passes
