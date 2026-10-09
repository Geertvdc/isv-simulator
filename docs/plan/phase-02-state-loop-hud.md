# Phase 2: State, loop and HUD

**Goal:** a game state that ticks on a fixed timestep, commands, a HUD with money and clock, speed controls, save/load.

## Sim

- `GameState`: `seed`, `rngState`, `tick`, `money`, `reputation` (0 to 100), `map`, `rooms`, `objects`, `staff`, `tickets`, `nextId`, `events`, `layoutVersion` (arrays empty for now)
- `createGame(mapText, seed)`
- `tick(state)` mutates state in place
- Clock in `balance.ts`: `TICKS_PER_SECOND = 10`, `DAY_TICKS = 1200` (2 minutes real time at 1x). Show time as 09:00 to 17:00 spread over the day.
- Day rollover emits a `dayStarted` event
- `events`: `{ tick, type, message }`, keep the last 50
- `applyCommand(state, cmd)` dispatcher with one debug command `debugAddMoney` to prove the path
- `serialize(state)` / `deserialize(json)`
- Starting values in `balance.ts`: `START_MONEY = 10000`, `START_REPUTATION = 50`

## Game loop (render side)

- Accumulator loop: runs N sim ticks per frame based on speed (0, 1x, 2x, 4x), with a cap per frame to avoid spiral of death

## UI

- Top bar: money (formatted as euros, nl-NL), day + time, reputation, speed buttons
- Keys: space pauses, 1/2/3 set speed
- F5 saves to localStorage, F9 loads

## Tests

- Tick advances the clock, day rollover emits `dayStarted`
- Serialize/deserialize round trip
- Determinism: two games with the same seed are deep-equal after 1000 ticks
- `applyCommand` returns `ok: false` with a reason for unknown commands

## Done when

- [ ] Clock runs, speeds work, pause stops time
- [ ] Save and load restore the clock and money
- [ ] `npm run check` passes
