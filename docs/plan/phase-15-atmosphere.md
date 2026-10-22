# Phase 15: Atmosphere

**Goal:** the diorama stops floating in the dark. Every level sits in a themed piece of the world that tells you which chapter you're in, full of small life, and the map itself gets details that don't get in the way of play. 3D only; no sim change. Part of [phases 15 to 18](phase-15-18-overview.md).

## Scope

- **Surroundings per chapter** (`src/render/three/surroundings.ts`), built in code from the kit, placed around the slab out to the edges of the screen at any aspect ratio:
  - **Garage:** a driveway with a parked hatchback, a bike, shelves of paint tins and boxes, a lawn with a tree, a garden hose, a basketball hoop.
  - **Startup** (a loft): brick, big plants, beanbags, a ping-pong table, a neon "ship it" sign, a coffee bar with an espresso machine.
  - **Scale-Up:** other teams' desks with their monitors, a meeting pod, a wall of screens with graphs, plants.
  - **Enterprise:** a cubicle farm, a water cooler, a printer and filing cabinets, a corporate lobby with a logo.
- **Background life:** people outside the play area, typing at desks, chatting at the coffee or the water cooler, one walking a loop; a cat in the garage. Blinking LEDs and monitors, steam from coffee. Visual only, animated from time.
- **Details on the map:** things on the tops of walls (books, plants, a printer, sticky notes, mugs), cable runs and a rug on open floor, chairs pushed under counters at the sides. Nothing that sits where tickets lie or hides a station.
- **Light:** a soft pool of warm light inside the office, the surroundings a little darker, so the eye stays on the play area.

## Rules

- No sim change; the camera still frames the level box. Surroundings fill the margins and run off the screen edge.
- One instanced mesh per prop kind; background people reuse the character models (no hats, muted colors, so they never look like players).
- Low quality drops the background people's animation and half the clutter.

## Tests

- The surroundings never overlap the level's floor (props placed outside the slab only)
- Placement is deterministic per level (same props in the same places every run)

## Done when

- [ ] Every level shows its chapter's surroundings, filling the screen at 16:9
- [ ] People and machines move in the background without pulling the eye off the play
- [ ] Gameplay and frame rate are unaffected (quality steps still work)
- [ ] `npm run check` passes
