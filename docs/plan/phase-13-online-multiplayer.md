# Phase 13: Online multiplayer (later)

**Goal:** play together from different machines. Only start after phase 11 (phase 12 can come before or after).

## Scope

- Authoritative Node server running the same `src/sim/` code at `TICKS_PER_SECOND`
- Browsers send their per-tick `InputCommand`s; the server applies them and broadcasts state snapshots (or deltas) at a lower rate
- Clients render snapshots with interpolation, a little behind real time
- Lobby with a join code: one player creates a room, others enter the code. Couch players on one machine can still join together as several local players
- `Host online` and `Join online` on the title screen; the phase 10 flow runs on the host, and remote players drive menus like joined local devices
- Progress is saved on the host's machine only
- Handling for late joins, disconnects and reconnects
- Client-side prediction is a separate follow-up, only if it feels laggy

## Tests

- The server sim and a local sim given the same inputs end in the same state
- Snapshot serialization round trip
- Interpolation between two snapshots
- Input commands arriving late or out of order are applied at the right tick or dropped

## Done when

- [ ] Two browsers on different machines can play a level together
- [ ] Movement looks smooth at 100 ms latency
- [ ] `npm run check` passes
