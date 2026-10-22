# Phase 14b: 3D parity

**Goal:** every mechanic reads in 3D as well as in 2D: what a ticket still needs, work and repair progress, pipeline warnings, invites, hints, popups, puffs and shake. Still greybox. Part of [phase 14](phase-14-3d-graphics.md).

## Scope

- **Overlays stay 2D, drawn by Phaser over the 3D canvas** (`src/render/three/Overlays.ts`): the 2D drawing code (`drawTicketCard`, `drawProgressBar`, `drawInvite`, `drawBadge`, `createHintMarker`) is reused, placed every frame at the projected 3D point and scaled by `pixelsPerUnit` (so near things are a little bigger). Phaser's camera stays at zoom 1 in 3D, so its world is canvas pixels. Nearer overlays draw on top.
  - Ticket checklists float over the ticket; a carried ticket's checklist and title float over the carrier's head, the ticket itself is held in front. Only a queue's top ticket shows its checklist, plus the `x5` count.
  - Pipeline badge while a build waits, repair bar while repairing; meeting invites over heads; first-level hint arrows; popups; the meeting room label; debug tile labels (backtick / F3).
- **In the 3D world** (`src/render/three/WorldFx.ts`): pulsing red glow on a pipeline about to break, a dark top with smoke and sparks while broken, the meeting rug (pulses while someone is invited), dash puffs, and screen shake (moves the principal point, so overlays shake along).
- **Shared, Phaser-free:** `src/render/effects.ts` (`effectsFor`: which events give which shake, popup and puff; `pipelinePulse`), used by 2D and 3D. `mapShape.firstGroup` for the hint anchors.
- **14a review fixes:** the three canvas sits under Phaser's (`z-index: -1`; it was painting over it), `RoundRenderer.destroy()` called from the scene's shutdown, lights (shadow maps) freed with the level, `applyPose` tested against `projectPoint` with three.js in Node, `gridToWorld` everywhere, instanced floor and blocks, hover picks block tops (`pickTile`), target highlights of players who left are dropped (2D too), queue anchors cached, the fit box covers the slab and some headroom, a lighter slab.

## Tests

- `effects.test.ts`: which events shake, pop up and puff, and the warning pulse speeding up
- `three/stage.test.ts`: the three.js camera draws where `projectPoint` says, also with a shaken principal point
- `three/layout.test.ts`: `pickTile` picks a station top before the floor behind it

## Done when

- [x] Every mechanic scene reads in 3D (`npm run screenshots -- --render=3d --only=mechanics/`)
- [x] 2D unchanged
- [x] `npm run check` passes
