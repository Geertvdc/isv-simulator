# ISV Simulator

Internal Zure game. A Theme Hospital-style management sim where you run a software vendor: customers arrive with tickets, you build rooms, hire staff, fix their problems and get paid. Isometric 2D, runs in the browser.

## Stack

- TypeScript (strict), Vite, Phaser 3 (latest 3.x), Vitest, ESLint, Prettier
- HUD and panels: plain DOM + CSS overlay on top of the canvas, no UI framework
- No backend

## Architecture rules

1. `src/sim/` is pure TypeScript: no Phaser, no DOM, no `Math.random`, no `Date.now`.
2. All randomness goes through the seeded RNG in `src/sim/rng.ts`.
3. The sim only advances via `tick(state)` with a fixed timestep (`TICKS_PER_SECOND` in `src/sim/balance.ts`).
4. Player actions are commands: `applyCommand(state, cmd)` returns `{ ok: true }` or `{ ok: false, reason }`. Render and UI never mutate state directly.
5. `GameState` is plain JSON-serializable data: no classes, Maps, Sets or functions.
6. `src/render/` reads state and syncs sprites keyed by entity id. It may hold visual-only state (tweens, animation frames, interpolation).
7. `src/ui/` reads state and dispatches commands.
8. Every tunable number lives in `src/sim/balance.ts`.
9. Text content (problem names, staff names) lives in `src/sim/content.ts` so anyone can add jokes.
10. Iso math lives only in `src/render/iso.ts`.

## Folder layout

```
src/
  sim/       game state, rules, pathfinding (pure TS)
  render/    Phaser scenes, iso math, sprite sync
  ui/        DOM HUD and panels
  main.ts
maps/        building maps as ASCII text
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

- **Ticket**: a customer with a problem (the "patient")
- **Problem**: what the ticket has, e.g. YAML Fever (the "disease")
- **Room**: rectangular area with a type, e.g. Dev Pit
- **Object**: placeable item, e.g. reception desk
- **Staff**: hired people with role, skill and salary
- **Building**: a predefined map with zones, e.g. Startup Pit
