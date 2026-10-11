# Phase 13g: Local-player prediction

**Goal:** online, your own developer answers your keys as fast as on the couch. 13e measured your own player starting to move about 90 ms after the key without lag and about 340 ms at 100 ms each way, because everything (you included) is drawn from the server's snapshots, 100 ms plus half a round trip in the past. 13g predicts the movement of the players bound to this machine with the sim's own movement code, and reconciles with the server's snapshots. Part of [phase 13](phase-13-online-multiplayer.md), stacked on 13f (PR base `phase-13f-resilience`).

Built without a review round (the product owner was away); decisions are in `review-notes-13.md` under 13g.

## Scope

- Predict **only movement** (position, velocity, facing, dash) of this machine's players, with the sim's own deterministic movement and collision code. Interactions (pick up, work, throw, ship), tickets, stations, orders, managers and other players stay server-authoritative and interpolated as in 13e.
- Keep the inputs this machine sent, per tick. When a snapshot comes in: take the server's player at that snapshot's tick and replay the inputs the server hadn't applied yet (reconciliation).
- Small corrections glide away over a few frames (a visual error offset that decays in render); big ones (past `NET_PREDICT_SNAP_DISTANCE`) snap.
- Hard reconciles (no replay of stale inputs, or a snap instead of a glide) when the server did something prediction can't know: the round not running (countdown, pause, results), being shoved by a dashing player, bumped by a manager.
- A carried ticket follows the predicted body (the ticket renderer already draws carried tickets at `renderPos` of the carrier).
- `?predict=0` turns it off for comparison; on by default.
- Not in scope: predicting interactions, other players or managers; predicting the start of a round before its first `playing` snapshot arrives; lag compensation on the server.

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
  base: PredictionBase | null; // newest snapshot: tick, running, others' and managers' positions
  inputs: InputCommand[]; // sent, not yet acknowledged, sorted by tick
  lastAcked: Record<PlayerId, InputCommand>; // newest input below the base tick (what the server repeats)
  tick: number; // predicted state = after ticks < tick
  current: Player[];
  previous: Player[]; // this machine's players at tick and tick − 1
  offsets: Record<PlayerId, Vec>; // visual error, decays
  stats: { reconciles; corrections; snaps; hardResets; maxErrorTiles };
}
(createPrediction(enabled), resetPrediction(p, level));
recordInputs(p, stamped); // what was actually sent
advancePrediction(p, targetTick); // simulate up to floor(targetTick) + 1
reconcile(p, serverTick, state, localIds, running); // on every kept snapshot
decayCorrections(p, dtMs);
predictedPlayer(p, id, alpha); // lerp(previous, current) + offset, or null
```

- **Replaying a tick:** each local player `movePlayer` with the input for that tick (the newest at or before it if none was sent, as the server repeats it, idle after `NET_INPUT_REPEAT_TICKS`); then `separatePlayers` with copies of the other players frozen at the newest snapshot (not dashing, reset every tick), then `pushOutOfManager` against the managers frozen at the newest snapshot.
- **Others:** collide against their positions in the newest snapshot. A teammate standing at a station (the common case) is exactly where the server has them, so walking into them doesn't rubber-band. Someone walking is off by up to a round trip either way; the server corrects and the correction glides.
- **Reconcile:** `running` (the snapshot's flow is `playing` and the state has no result) → base = the server's players at `S`; inputs below `S` dropped (the newest kept per player as `lastAcked`); replay `S .. tick − 1`; error = old predicted position − new; `offsets += error`, zeroed when its length is past `NET_PREDICT_SNAP_DISTANCE` or a shove/bump hit a local player in this snapshot's events. Not running → hard reset: predicted = server at `S`, inputs cleared, the jump still glides when small (pause after running ahead a few ticks).
- **Limits:** a target more than `NET_PREDICT_MAX_TICKS` ahead of the base (a stalled tab, a clock resync) jumps the base forward instead of simulating seconds; a target behind the base holds the base.
- **Smoothing:** `offset *= exp(−dt / NET_PREDICT_SMOOTH_MS)`, zeroed under 0.001 tiles.

### View (`src/render/roundView.ts`)

`predictedView(frame, prediction, alpha)`: the frame's state with this machine's players replaced by their predicted copies (pos, vel, facing, dash), `renderPos` = predicted (+ offset) for them and interpolated for the rest. Renderers, carried tickets, the target-tile highlight and the meeting icon follow the predicted body with no renderer changes.

### Scene (`GameScene`)

- `prediction` kept with the round: reset on a new round, `reconcile` after every snapshot the round kept (also the one in a `roundStart`), with `localBindings` and `isRoundRunning(online.flow)`.
- `sendInputs` records what it sent; each frame `advancePrediction` to the target tick, `decayCorrections`, and `renderRound(predictedView(...))` when prediction is on and has a base.
- `NetDebug` gains `predict` (on/off, local ids, stats) and an opt-in `trace` (the script sets `isvNet.trace = []`; each frame pushes time, render tick and drawn local positions).

### Options

`OnlineOptions.predict` from `?predict=0` (`main.ts`). The ping corner shows "no prediction" when off.

## Files

- `src/sim/movement.ts`, `tick.ts`, `manager.ts` + `movement.test.ts`, `manager.test.ts`
- `src/sim/balance.ts`: `NET_PREDICT_SNAP_DISTANCE`, `NET_PREDICT_SMOOTH_MS`, `NET_PREDICT_MAX_TICKS`
- `src/net/clock.ts` (`inputTargetTickExact`) + test
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
  - not running (countdown, pause, results) resets to the server and drops the inputs;
  - a target too far ahead jumps instead of simulating; disabled prediction gives nothing.
- `predictedView`: local players from the prediction, others interpolated, state copy only swaps local players.

## Done when

- [ ] Your own player moves within a frame or two of the key online, with and without lag (measured in a browser)
- [ ] No visible correction jitter walking into walls, around corners and dashing, without lag and at `?lag=100&jitter=20` (drawn positions sampled every frame: no backward steps, no snaps)
- [ ] Others and managers still glide (interpolated) and interactions stay server-side
- [ ] A carried ticket follows the predicted body
- [ ] Pause, countdown, shoves and manager bumps don't leave the local player drifting
- [ ] `?predict=0` turns it off
- [ ] `npm run verify:online` still passes
- [ ] `npm run check`, `npm run build` and `npm run build:server` pass; the suite passes several runs in a row
- [ ] CI is green
