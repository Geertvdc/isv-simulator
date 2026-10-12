# ISV Simulator

An Overcooked-style couch co-op game about shipping software. 2 to 4 players on one screen carry tickets through code, test and pipeline stations and ship them before the customer's order runs out. Runs in the browser. Internal Zure game.

## Run it

Needs Node 22+.

```bash
npm install
npm run dev      # start the game at http://localhost:5173
npm run check    # typecheck + lint + tests (what CI runs)
npm run build    # production build into dist/
```

### Demo mode (booths, big screens)

Left alone on the title for 30 seconds, the game starts a demo: four bots play a full round, then show their score and move on to the next level. Any menu button (Enter, Esc, E, WASD or the arrow keys; a gamepad stick, A, B or Start) goes back to the title.

For a booth, open the game with `?demo` (e.g. `http://localhost:5173/?demo`): it starts in the demo straight away, and the lobby, level select, intro, pause, results and credits also go back to the demo after a minute without a press. A round being played is never interrupted. Click the page once so the browser allows sound.

## How to play

The game docs, with screenshots of every screen, station, event and level: [`docs/game/`](docs/game/README.md).

## Working on it

- Architecture rules and conventions: [`AGENTS.md`](AGENTS.md)
- Roadmap, one phase at a time: [`docs/plan/`](docs/plan/README.md)
