# ISV Simulator

Internal Zure game. An Overcooked-style couch co-op game about shipping software: 2 to 4 players on one screen each control a developer in a small office. Tickets arrive at the inbox; players carry them through stations (write code, test, pipeline) and ship them to the customer before the order timer runs out. Levels last about 3 minutes and end with a score and 1 to 3 stars. Chaos and shouting at each other is the point. 2D with a front-facing 3/4 view (like Overcooked), runs in the browser.

## Stack

- TypeScript (strict), Vite, Phaser 4 (latest 4.x), Vitest, ESLint, Prettier
- HUD and panels: plain DOM + CSS overlay on top of the canvas, no UI framework
- No backend

## Architecture rules

1. `src/sim/` is pure TypeScript: no Phaser, no DOM, no `Math.random`, no `Date.now`.
2. All randomness goes through the seeded RNG in `src/sim/rng.ts`.
3. The sim only advances via `tick(state)` with a fixed timestep (`TICKS_PER_SECOND = 60` in `src/sim/balance.ts`, so movement feels responsive).
4. All player input reaches the sim as per-tick input commands tagged with a player id: `{ playerId, tick, move: { x, y }, interact, work }`. The sim never knows whether input came from keyboard, gamepad or (later) the network. Other actions are commands: `applyCommand(state, cmd)` returns `{ ok: true }` or `{ ok: false, reason }`. Render and UI never mutate state directly.
5. `GameState` is plain JSON-serializable data: no classes, Maps, Sets or functions.
6. `src/render/` reads state and syncs sprites keyed by entity id. It may hold visual-only state (tweens, animation frames, interpolation).
7. `src/ui/` reads state and dispatches commands.
8. Every tunable number lives in `src/sim/balance.ts`.
9. Text content (ticket names, order names, level names) lives in `src/sim/content.ts` so anyone can add jokes.
10. Projection math (grid to screen and back) lives only in `src/render/projection.ts`. The sim works in plain grid/world coordinates; changing the camera angle or switching views must only touch `src/render/`.
11. No Phaser physics. Movement and collision are our own code in `src/sim/`, deterministic and tested.
12. Stick and keyboard directions are screen-relative: "up" moves up on screen, whatever the camera angle. The input layer converts them to world directions (with a helper in `src/render/projection.ts`) before they become input commands.

## Folder layout

```
src/
  sim/       game state, rules, movement and collision (pure TS)
  render/    Phaser scenes, projection math, sprite sync
  ui/        DOM HUD and panels
  main.ts
maps/        level maps as ASCII text
public/assets/
docs/plan/   phase specs
```

## Conventions

- Tests sit next to code: `foo.ts` + `foo.test.ts`.
- Every sim feature gets tests. A phase is done only when `npm run check` (typecheck, lint, test) passes and the manual checks in the phase file work.
- Small commits per step.
- Placeholder graphics are procedural (Phaser Graphics) until the art pass. Every asset pack is listed in `CREDITS.md` with its license.

## Working on phases

The plan lives in `docs/plan/`. Work on one phase at a time:

1. Read the phase file and write a short implementation plan (files, steps, tests). Wait for approval.
2. Implement, run `npm run check`, fix until green.
3. Tick the "Done when" boxes in the phase file.
4. Do not build anything from later phases, even if it seems convenient.

## Glossary

- **Player**: a person on the couch, controls one developer
- **Ticket**: an item carried around, with a list of required steps and progress per step
- **Station**: a solid tile you interact with from an adjacent tile (keyboard, test bench, pipeline, etc.)
- **Counter**: a solid tile you can put a ticket on and pick it up from
- **Order**: a request shown at the top with a timer; shipping a matching ticket completes it
- **Level**: an ASCII map plus settings (duration, order schedule, star thresholds)
