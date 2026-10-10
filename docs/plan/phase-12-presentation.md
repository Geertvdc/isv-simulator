# Phase 12: Music, onboarding and transitions

**Goal:** new players get it without someone explaining, and the game sounds and moves like a finished one.

## Scope

- **Music**: a menu track and level tracks (one per chapter is enough). The level track speeds up or switches in the last 30 seconds. Music volume next to sound volume in settings. Every track in `CREDITS.md`
- **Level intro**: before the clock starts, a card with the level name, the order recipes you'll see (as station letters) and, for a level that teaches a new mechanic, one line and a picture of it. Any joined player skips it
- **First-level hints**: the first time the garage is played (stored in the save), short hints point at the inbox, the keyboard and the ship hatch until each has been used once
- **Transitions**: fade between screens, a "3, 2, 1, Ship it!" countdown before the round, and the stars on the results screen counting up one by one
- **Accessibility basics**: menus readable from the couch (big text), and each player's color paired with a shape or hat so it doesn't rely on color alone

## Tests

- Hints: shown until used, never again once done, never in other levels
- Countdown: the sim doesn't advance before it's over, and inputs during it are ignored

## Done when

- [ ] Someone who has never played gets through the first level without being told what to do
- [ ] Music and sound volumes work independently and are remembered
- [ ] `npm run check` passes
