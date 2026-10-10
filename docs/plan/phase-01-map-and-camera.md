# Phase 1: Map and camera (done)

> **Superseded in phase 2.** After the pivot to couch co-op, camera rotation was removed and the camera now auto-fits the whole level (pan, zoom and hover only in the F3 debug mode). The diamond iso projection was replaced by a front-facing 3/4 view in `src/render/projection.ts`, and the map format below was replaced by the level format in phase 2. Kept as a record of what was built.

**Goal:** load the Startup Pit from an ASCII file and render it isometric with pan, zoom, rotate and hover.

## Map format

| Char | Zone     | Meaning                                               |
| ---- | -------- | ----------------------------------------------------- |
| `#`  | wall     | blocked                                               |
| `.`  | floor    | buildable, walkable                                   |
| `=`  | corridor | walkable, not buildable for rooms                     |
| `E`  | entrance | where tickets arrive and leave                        |
| `L`  | locked   | buildable after purchase (parse it, no mechanics yet) |
| ` `  | void     | outside, not drawn                                    |

All rows must have equal length. Map: `maps/startup-pit.txt`, imported with Vite `?raw`.

## Sim

- `parseMap(text): BuildingMap` with `{ width, height, tiles: Zone[] }` (row-major)
- Clear errors with line and column for unknown chars and uneven rows
- `getZone(map, x, y)` returns `void` out of bounds

## Render

- `src/render/iso.ts`: `TILE_W = 64`, `TILE_H = 32`, `tileToScreen(x, y, rotation)`, `screenToTile(sx, sy, rotation)`
- Floor tiles as diamonds, colored per zone; entrance stands out
- Walls as simple extruded blocks, depth-sorted by `x + y`
- Camera: drag with right or middle mouse (or space + left drag), WASD/arrow keys, mouse wheel zoom 0.5x to 2x around the cursor, starts centered on the map
- Rotation: Q/E rotate the view in 90° steps (4 views), keeping the tile at the view center in place. Visual only: the sim never sees it. Depth sorting and walls stay correct in every view
- Hover: outline the tile under the mouse; overlay shows `x, y, zone`
- Backtick (`` ` ``, or F3) toggles a debug overlay with tile coordinates drawn on the map

## Tests

- Parser: valid map, uneven rows, unknown char, `getZone` out of bounds
- Iso: `screenToTile(tileToScreen(x, y))` round trip, plus points near diamond edges, in all 4 rotations
- Iso: depth sorting follows screen position in every rotation

## Done when

- [x] Map is visible and centered
- [x] Pan and zoom feel smooth
- [x] All 4 rotations render correctly and hover picks the right tile in each
- [x] Hover picks the correct tile at every zoom level, including tile edges
- [x] `npm run check` passes
