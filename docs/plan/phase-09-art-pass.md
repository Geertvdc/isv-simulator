# Phase 9: Art pass (optional, can start after phase 6)

**Goal:** replace procedural placeholders with real art without touching the sim.

## Scope

- `src/render/assets.ts`: manifest mapping logical keys (`floor`, `wall`, `wall.front`, `counter`, `station.keyboard`, `station.testBench`, `station.review`, `station.pipeline`, `station.inbox`, `station.ship`, `bin`, `ticket`, `station.pipeline.broken`, `character`) to files, with fallback to the procedural version when a key is missing
- Match the camera: sprites must be drawn or rendered at our front-facing 3/4 view (`VIEW_PITCH`, `VIEW_YAW` in `src/render/projection.ts`). If an art set has a different angle, adjust the projection constants rather than mixing angles
- Office furniture and stations: desks with keyboards, a test bench with screens, a pipeline as a server rack or conveyor, inbox and ship as hatches in the wall
- Characters: developers in a few player colors with idle, walk, carry (ticket held up) and work animations, in at least 4 directions
- See `docs/assets.md` for sources
- `CREDITS.md` listing every pack and license

## Done when

- [ ] Game looks coherent at every window size
- [ ] Each player is easy to tell apart, and you can see at a glance who is carrying what
- [ ] Deleting an asset file falls back to the placeholder without errors
- [ ] `CREDITS.md` is complete
