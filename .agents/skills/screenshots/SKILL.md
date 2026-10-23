---
name: screenshots
description: Retake the docs screenshots (every level, mechanic and screen) in 2D, 3D or both, check them and commit them. Use when the user asks to "make new screenshots", "retake the pictures", "update the docs images", or to render the levels again after visual changes.
---

# Retake the docs screenshots

`scripts/screenshots.ts` (`npm run screenshots`) drives headless Chrome over a running dev server and writes `.webp` files:

- 2D: `docs/game/images/{levels,mechanics,screens}/` (the default `--out`)
- 3D: `docs/game/images-3d/...` with `--render=3d --out=docs/game/images-3d`

Shots are scenes from `src/sim/scenes.ts` (built game states, not playthroughs) plus menu screens. A new level gets a `levels/<id>` shot automatically; a new mechanic needs a scene in `scenes.ts` first.

Ask which look the user wants if they didn't say: 2D, 3D or both.

## 1. Servers

The online lobby shot needs the game server on 2567, the rest only the dev server on 5173.

- Stop any dev or game server already running from this checkout (preview tool `preview_list` / `preview_stop`), so nothing else sits on 5173 or 2567.
- Start both with the preview tool: `preview_start` with name `dev-online` (from `.claude/launch.json`). Don't start them with Bash.
- Check the ports: `lsof -iTCP -sTCP:LISTEN -P | grep -E ":5173|:2567"` must show one listener on each. Watch out: both vite and the game server read `PORT`, and the preview tool sets `PORT` to the config's port. The `dev-online` config sets `PORT=2567` on the server only; never run plain `npm run dev:online` from the preview tool, or both land on the same port and the shots load the wrong thing.

## 2. Take the shots

One run per look, with the online lobby in its own run (it leaves the page in a room). Each run takes a few minutes; send the output to a log and only grep it.

```bash
npm run screenshots -- --render=3d --out=docs/game/images-3d --skip=online-lobby > /tmp/shots3d.log 2>&1
npm run screenshots -- --render=3d --out=docs/game/images-3d --only=online-lobby >> /tmp/shots3d.log 2>&1
```

For 2D, the same without `--render=3d --out=...`. `--only=<text>` retakes just the shots whose name contains it (`levels/monorepo`, `mechanics/`, `screens/level-select`).

Then: count the shots (`grep -c '\.png' <log>`, one line per shot) and check for `failed`. "no room: is the game server running" means the server isn't on 2567.

## 3. Check them

Look at a few before committing: convert with `sips -s format png -Z 900 <file>.webp --out <scratch>/<name>.png` and read the PNGs. At least one old level, one new or changed level, the level select and the online lobby. Look for: the wrong map, a blank canvas, cut-off UI, missing surroundings in 3D.

## 4. Docs and commit

- New levels or mechanics: add them to `docs/game/levels.md` / `mechanics.md` (2D images) and to the tables in `docs/game/3d.md` (3D images).
- Commit only the images (and doc changes): `git add docs/game && git commit -m "Retake the <2D/3D> screenshots"`. Unchanged scenes may still produce byte-different files; that's fine.
- Push if the branch has a PR.
- Stop the servers when done (`preview_stop`).
