# Phase 7: Art pass (optional, can start after phase 3)

**Goal:** replace procedural placeholders with CC0 sprites without touching the sim.

## Scope

- `src/render/assets.ts`: manifest mapping logical keys (`floor.corridor`, `wall`, `object.receptionDesk`, `room.devPit.desk`, `person.developer`) to files, with fallback to the procedural version when a key is missing
- Pick one pack family per category so viewing angles match. Check the render angle against our 2:1 tiles and adjust `TILE_W`/`TILE_H` or scale sprites.
- Furniture from the Kenney Furniture Kit isometric renders
- Characters: see `docs/assets.md`
- `CREDITS.md` listing every pack and license

## Done when

- [ ] Game looks coherent at all zoom levels
- [ ] Deleting an asset file falls back to the placeholder without errors
- [ ] `CREDITS.md` is complete
