# Phase 8: Couch polish

**Goal:** the things that make couch co-op fun to play more than once.

## Scope

### Mechanics (sim, all tested)

- **Dash**: a short burst of speed on a new button (keyboard: left Shift / right Alt, gamepad: B) with a cooldown. Dashing into another player shoves them harder
- **Throwing**: hold interact while carrying a ticket to throw it in the facing direction. It flies over floor and counters, lands on the first free counter or station in its path, or on the floor. Another player can catch it mid-air by facing it with empty hands. Tickets on the floor can be picked up
- **Review station (`R`)**: some orders need a `review` step. It only advances while two players hold work at the same `R` at once

### Feel (render and audio)

- Screen shake on broken pipelines and expired orders
- Sound effects for pick up, put down, work, ship, order expired, pipeline broke, dash and level end. Every sound file goes in `CREDITS.md`
- Little popups for points earned or lost

### Content

- Two more levels (about 14×10 so they fill a 16:9 screen) with different layouts, e.g. one split by a counter wall so throwing matters, one where the review station is far from everything
- Level select screen after the lobby, showing the best stars per level (stored in `localStorage`)

## Tests

- Dash speed, duration and cooldown; dash shove
- Throw trajectory: lands on the first valid tile, stops at walls, can be caught
- Review: advances only with two players working, stops when one lets go
- New levels parse and the bot run gets at least 1 star on each

## Done when

- [ ] Throwing and dashing feel good with 2 and with 4 players
- [ ] Review moments make players shout at each other
- [ ] Three levels playable from a level select
- [x] `npm run check` passes
