# Phase 13g: Local-player prediction

**Goal:** online, your own developer answers your keys as fast as on the couch. 13e measured your own player starting to move about 90 ms after the key without lag and about 340 ms at 100 ms each way, because everything (you included) is drawn from the server's snapshots, 100 ms plus half a round trip in the past. 13g predicts the movement of the players bound to this machine with the sim's own movement code, and reconciles with the server's snapshots. Part of [phase 13](phase-13-online-multiplayer.md), stacked on 13f (PR base `phase-13f-resilience`).

Built without a review round (the product owner was away); decisions are in `review-notes-13.md` under 13g.

## Scope

- Predict **only movement** (position, velocity, facing, dash) of this machine's players, with the sim's own deterministic movement and collision code. Interactions (pick up, work, throw, ship), tickets, stations, orders, managers and other players stay server-authoritative and interpolated as in 13e.
- Keep the inputs this machine sent, per tick. When a snapshot comes in: take the server's player at that snapshot's tick and replay the inputs the server hadn't applied yet (reconciliation).
- Small corrections glide away over a few frames (a visual error offset that decays in render); big ones (past `NET_PREDICT_SNAP_DISTANCE`) snap.
- Hard reconciles when the server did something prediction can't know: the round not running (pause, results: no prediction, the server's position), being shoved by a dashing player or bumped by a manager (a snap instead of a glide). The countdown's end is known (the room's clock), so prediction stands still until that server tick and moves from it, like the server.
- A carried ticket follows the predicted body (the ticket renderer already draws carried tickets at `renderPos` of the carrier).
- `?predict=0` turns it off for comparison; on by default.
- Not in scope: predicting interactions, drawing other players or managers from prediction; predicting a pause; lag compensation on the server.

## Design

### Timeline

The server applies the input stamped `t` at server tick `t`; the snapshot labelled `S` is taken after ticks `< S` ran (`stepRoom` increments before snapshotting). So a snapshot at `S` has applied every input stamped below `S`.

The client stamps inputs with `T = floor(target)` where `target = estimate + rtt/2 + NET_INPUT_LEAD_TICKS` (13a). The predicted state is the state after ticks `< T + 1`, i.e. what the server will have once the newest input lands. It's drawn between the predicted states at `T` and `T + 1` with `alpha = frac(target)`, like `GameLoop` draws between ticks, so the local player moves within a frame of the key. Everyone else is still drawn at render time (estimate − rtt/2 − 100 ms): the local player lives ahead of the others, as in every predicted shooter.

### Sim refactor (`src/sim/movement.ts`, `src/sim/manager.ts`)

- `movePlayer(map, player, move, dash)`: the per-player part of `tick` (dash edge from `dashHeld`, `startDash`, `stepPlayer`), returning whether a dash started. `tick` calls it, so prediction and server share it line for line.
- `pushOutOfManager(map, player, manager)`: the part of `pushPlayers` that pushes a player out of a manager (and stops their dash); `pushPlayers` calls it and adds the bump.

### Prediction (`src/net/prediction.ts`, pure)

```ts
interface Prediction {
  enabled: boolean; // ?predict=0 → false
  level: LevelMap | null;
  baseTick: number | null; // the newest snapshot's server tick
  runsFrom: number | null; // the server tick the sim runs from (countdown end), null: paused/ended
  others: Player[]; // other players, simulated without input from the newest snapshot (obstacles only)
  managers: { pos; facing }[]; // where the newest snapshot has them
  inputs: InputCommand[]; // sent for the base tick or later, sorted by tick
  lastAcked: Record<PlayerId, InputCommand | undefined>; // newest input below the base tick (what the server repeats)
  tick: number; // predicted state = after ticks < tick
  current: Player[];
  previous: Player[]; // this machine's players at tick and tick − 1
  offsets: Record<PlayerId, Vec | undefined>; // visual error, decays
  stats: { reconciles; corrections; snaps; maxErrorTiles; lastErrorTiles };
}
(createPrediction(enabled), resetPrediction(p, level));
recordInputs(p, stamped); // what was actually sent
advancePrediction(p, targetTick); // simulate up to floor(targetTick) + 1
reconcile(p, { serverTick, players, managers, events, runsFrom }, localIds); // every kept snapshot
decayCorrections(p, dtMs);
predictionAlpha(p, targetTick);
predictedPlayer(p, id, alpha); // lerp(previous, current) + offset, or null
countdownEndTick(countdownStartMs); // the round's first sim tick
```

- **Replaying a tick:** each local player `movePlayer` with the input for that tick (the newest at or before it if none was sent, as the server repeats it, idle after `NET_INPUT_REPEAT_TICKS`); the other players `movePlayer` without input; then `separatePlayers` on everyone (sorted by id, like the server), then `pushOutOfManager` against the managers frozen at the newest snapshot. Ticks before `runsFrom` (the countdown) don't move anyone.
- **Others:** simulated along from the newest snapshot without input (they slow down and stop, and get pushed), never drawn from the prediction. A teammate standing at a station (the common case) then moves exactly as on the server when you walk into them and push them, so it doesn't rubber-band. (The first version froze them at the snapshot; pushing a teammate then gave small backward wobbles in the browser check.) Someone walking is off by up to a round trip; the server corrects and the correction glides. Their dash is dropped in the copy: a shove by them is the server's call and snaps.
- **Reconcile:** base = the server's players at `S`; inputs below `S` dropped (the newest kept per player as `lastAcked`); when the sim runs, replay `S .. tick − 1`; error = old predicted position − new; `offsets += error`, zeroed when its length is past `NET_PREDICT_SNAP_DISTANCE` or a shove/bump hit a local player in this snapshot's events. Not running (pause, results) → no replay: the server's players at `S`, the jump back glides when small (a pause after running ahead; the pause screen covers the map anyway).
- **Limits:** at most `NET_PREDICT_MAX_TICKS` simulated in one go (a stalled tab, a clock resync); the rest is skipped. A target behind the prediction holds it (alpha 1).
- **Smoothing:** `offset *= exp(−dt / NET_PREDICT_SMOOTH_MS)`, zeroed under 0.001 tiles.

### View (`src/render/roundView.ts`)

`predictedView(frame, prediction, alpha)`: the frame's state with this machine's players replaced by their predicted copies (pos, vel, facing, dash), `renderPos` = predicted (+ offset) for them and interpolated for the rest. Renderers, carried tickets, the target-tile highlight and the meeting icon follow the predicted body with no renderer changes.

### Scene (`GameScene`)

- `prediction` kept with the round: reset on a new round, `reconcile` after every snapshot the round kept (also the one in a `roundStart`), with `localBindings` and `runsFrom` from the snapshot's flow (playing: now; countdown: `countdownEndTick`; else `null`).
- `sendInputs` records what it sent; each frame `advancePrediction` to the target tick, `decayCorrections`, and `renderRound(predictedView(...))` when prediction is on and has a base.
- `NetDebug` gains `predict` (on/off, local ids, stats), `server` (the newest snapshot's player positions) and an opt-in `trace` (the script sets `isvNet.trace = []`; each frame pushes time, render tick, input target tick and drawn positions).

### Options

`OnlineOptions.predict` from `?predict=0` (`main.ts`). The ping corner shows "no prediction" when off.

## Files

- `src/sim/movement.ts`, `tick.ts`, `manager.ts` + `movement.test.ts`, `manager.test.ts`
- `src/sim/balance.ts`: `NET_PREDICT_SNAP_DISTANCE`, `NET_PREDICT_SMOOTH_MS`, `NET_PREDICT_MAX_TICKS`
- `src/net/clock.ts` (`inputTargetTickExact`) + test
- `server/roomLogic.test.ts`: the round's first sim tick is `countdownEndTick`
- `src/net/prediction.ts` + `prediction.test.ts`
- `src/render/roundView.ts` + test, `src/render/GameScene.ts`, `src/main.ts`, `src/ui/netHud.ts`
- `scripts/verifyPrediction.ts`, `package.json` (`verify:prediction`)
- `docs/plan/review-notes-13.md`, `docs/plan/phase-13-online-multiplayer.md`

## Steps (one commit each)

1. This plan.
2. Sim refactor: `movePlayer`, `pushOutOfManager` (behaviour unchanged, tests).
3. `src/net/prediction.ts` + tests; `inputTargetTickExact`.
4. `predictedView` + scene glue + `?predict=0` + debug trace.
5. `verify:prediction` browser script; measure, tune, fix.
6. Docs, done boxes, review notes, PR.

## Tests

- `movePlayer` matches the old inline code (dash only on the press, facing, cooldown); `pushOutOfManager` pushes out of a manager and stops a dash.
- Prediction:
  - without lag (snapshots for every tick right away) the predicted player equals the server's after every tick, through walking, walls, corners and a dash;
  - determinism: the same inputs through `tick` (a full `GameState`, no other players near) and through prediction end in exactly the same position, velocity, facing and dash state;
  - reconciliation after a mismatch: a server that shoved the player gives the server's position plus the replayed inputs;
  - replay: inputs below the snapshot tick are dropped, the rest replayed, missing ticks repeat the last input, idle after `NET_INPUT_REPEAT_TICKS`;
  - small corrections become an offset that decays toward 0 and never overshoots; a correction past `NET_PREDICT_SNAP_DISTANCE` snaps (offset 0); a shove event on a local player snaps;
  - not running (pause, results) holds the server position and predicts nothing; through a countdown it stands still and moves from the end tick on, with no corrections;
  - walking into a teammate standing still predicts exactly (they get pushed the same); a teammate walking across corrects a little, without snaps;
  - a target too far ahead jumps instead of simulating; disabled prediction gives nothing.
- `predictedView`: local players from the prediction, others interpolated, state copy only swaps local players.

## Done when

- [x] Your own player moves within a frame or two of the key online, with and without lag (measured in a browser)
- [x] No visible correction jitter walking into walls, around corners and dashing, without lag and at `?lag=100&jitter=20` (drawn positions sampled every frame: no backward steps, no snaps)
- [x] Others and managers still glide (interpolated) and interactions stay server-side
- [x] A carried ticket follows the predicted body
- [x] Pause, countdown, shoves and manager bumps don't leave the local player drifting
- [x] `?predict=0` turns it off
- [x] `npm run verify:online` still passes
- [x] `npm run check`, `npm run build` and `npm run build:server` pass; the suite passes several runs in a row
- [ ] CI is green
