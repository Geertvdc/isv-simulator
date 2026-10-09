# Phase 3: Build mode

**Goal:** place Dev Pit rooms and a reception desk, with clear valid/invalid feedback.

## Rules

- Room: `{ id, type, x, y, w, h, door: { x, y, side } }`
- Room types in `balance.ts`: `devPit { minW: 3, minH: 3, cost: 3000 }`
- Valid when all tiles are floor (`.`), no overlap with rooms or objects, at least min size, enough money, and a door is possible
- Walls sit on tile edges, not on tiles: the room blocks movement across its boundary except at the door
- Door is auto-placed on a boundary tile whose outside neighbour is walkable and not in another room. Prefer corridor, then closest to the entrance (Manhattan).
- Reception desk: object, 1x1, cost 500, has a facing direction (R rotates). It needs a free walkable **service tile** in front (customers) and **staff tile** behind. Allowed on floor or corridor outside rooms.
- Remove room or object refunds 50%
- Every layout change increments `layoutVersion`

## Sim

- Commands: `placeRoom`, `placeObject`, `removeRoom`, `removeObject`
- `canPlaceRoom(state, type, rect)` and `canPlaceObject(...)` return `{ ok, reason }`, used by the UI ghost
- `canStep(state, from, to)`: respects map zones, objects, room walls and doors. Built and tested now, used in phase 4.

## UI and render

- Build menu: "Dev Pit €3.000", "Reception desk €500", "Remove"
- Room tool: drag a rectangle, ghost is green or red with the reason shown; release to place; Esc or right click cancels
- Object tool: ghost follows the cursor, R rotates, click places
- Room floor tinted per type, low cutaway walls on edges, visible door gap, room name in the middle

## Tests

- `canPlaceRoom`: valid, overlap, on corridor, on wall, too small, no money, no access
- Door selection prefers corridor
- Removal refund
- `canStep`: blocked by walls, blocked across room edges, allowed through door, blocked by objects

## Done when

- [ ] Can build and remove rooms and desks
- [ ] Invalid placement explains why
- [ ] Money updates correctly
- [ ] `npm run check` passes
