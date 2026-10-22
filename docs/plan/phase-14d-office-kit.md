# Phase 14d: Office kit

**Goal:** every block in a level is a real-looking prop instead of a colored box: counters with doors, a desk with a monitor and keyboard, a test bench with pass/fail screens, a review desk with printouts and a magnifying glass, a build conveyor with a blinking server, inbox and bug trays, a ship hatch with a big red button, a bin, three wall themes, three floors and wall decorations. All built in code. Part of [phase 14](phase-14-3d-graphics.md).

## Scope

- `src/render/three/kit.ts`: `ModelBuilder`, a tiny modeling kit: rounded boxes (`RoundedBoxGeometry`), cylinders, spheres, capsules, tori, cones, glowing screens and LEDs, glass panes. Pieces get one color each (vertex colors) and merge into one geometry per layer (`body`, `glow`, `glass`), drawn with three shared materials.
- `src/render/three/models.ts`: the props. Each stands on the floor at the origin, fills one tile and faces the camera; station tops are at `STATION_HEIGHT`, props on them stay at the back so a ticket in the middle shows. Station tops are a light tint of the station color (they read from above), plain counters are laminate on wood. Tickets are folders (manila feature, pink bug, red incident with a yellow stripe) with a sheet peeking out.
- `src/render/three/MapView.ts`: places the models: one instanced mesh per model kind and layer, stations turned toward the floor they're worked from (`stationFacing`), wall pieces and decorations like 2D (`mapShape.wallPiece`, `mapShape.wallDeco`), floor tiles with a small per-tile brightness wobble, a letter badge on each station front matching the HUD's order cards. Screens draw at 2.5× their color, so they (and only they) bloom.
- `/models.html` (`src/modelSheet/main.ts`): every model on a turntable with its name, for building and reviewing models. Dev only.
- `mapShape.ts` now also holds the wall decoration choice, shared with 2D.

## 14c review fixes in this step

The sun comes from behind and left (shadows fall forward and right, where they show), the fill from the camera side; a warmer palette (warm concrete, cool plaster walls with light caps, laminate counters on wood); a flatter camera (50°, 24° field of view) and a smaller top band in 3D, so the level fills more of a wide screen; bloom only over white; SMAA after tone mapping; three quality steps (high, medium at 1× pixel ratio, low without post but with a 1024² shadow), pixel ratio capped at 1.5× and ~3.1 Mpx; frames timed with the wall clock and a fresh warm-up per level and per step; smoke clears ticket cards; the carried title and popups no longer overlap cards.

## 14d review fixes

- **Stations never turn their back to the camera** (`stationFacing` drops "away"), and each station is a base that turns toward its floor plus a **hero prop that faces the camera**, turned at most 45° (`heroPlacement`), so monitors never show their back or edge.
- **Hero props big enough to read from the couch:** a 0.58-wide code monitor and a keyboard with colored keycaps, a red/green light tower and test tubes, a standing magnifier and a red pen, a mailbox with its flag up, a big bug, a parcel by a hazard-striped chute and a mushroom button, a wide green recycling bin with its lid open.
- Trays have dark floors, so pink and red folders show on the bug queue.
- Wall caps darker than stations, low front walls (0.2) with a dark top, deeper wood, a warm teal carpet.
- Triangles: only boxes at least 0.08 thick with a bevel of 0.01+ are rounded; no floor under walls. `disposeTree` frees instanced meshes.
- Letter badges lie flat on each station's front-left corner, upright for the camera, 0.22 across, one material per letter.
- A broken pipeline flashes a red alarm on its build server, with smoke pouring from it.
- Screens bloom on high and medium, and draw at their own color on low (the stage sets the glow boost per quality).
- No decorations on walls behind stations and counters.
- `/models.html`: game camera tilt and lights, wider spacing, tickets and inner walls.

## Not done: ForgeGUI trial

The plan had a ForgeGUI trial for two or three hero props. It needs an account (and generations on free credits may land in its public catalog), which only the product owner can set up. Everything was built in code instead. To try it later: generate a GLB, run it through `@gltf-transform/cli` (simplify under 3k triangles, meshopt), put it in `public/assets/models/`, load it with `GLTFLoader` in `MapView` for that station, and list it in `CREDITS.md`.

## Tests

- `three/layout.test.ts`: `stationFacing` turns stations toward their floor, camera side first
- `three/quality.test.ts`: the three steps, warm-up after a step, the pixel ratio cap

## Done when

- [x] Every level is built from the kit (`npm run screenshots -- --render=3d --only=levels/`)
- [x] Stations read apart from each other, from counters and from walls
- [x] `/models.html` shows every model
- [x] `npm run check` passes
