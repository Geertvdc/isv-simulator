# ISV Simulator game server

The authoritative server for online play: Node 22 + [Colyseus](https://colyseus.io) 0.18. One `game` room per join code; each room runs the same `src/flow` and `src/sim` code as couch play, 60 ticks a second, and sends snapshots to its clients 20 times a second. See [phase 13](../docs/plan/phase-13-online-multiplayer.md) for the architecture.

Local couch play needs none of this.

## Run it

```sh
npm run server        # the server alone, restarts on changes (port 2567)
npm run dev:online    # the Vite client and the server together
curl localhost:2567/health
```

| Env var | Default | What                         |
| ------- | ------- | ---------------------------- |
| `PORT`  | `2567`  | Port for HTTP and WebSockets |

`npm run dev:online` leaves `PORT` alone: Vite reads it too, so setting it there would put both on one port.

## Files

- `roomLogic.ts`: one room as plain data and pure functions (members, host, capacity, the clock, flow, sim, snapshots). Returns the messages to send; tested without any networking.
- `GameRoom.ts`: the Colyseus room around it. The join code is the room id.
- `joinCodes.ts`: codes of the rooms alive in this process, so they stay unique.
- `app.ts`: `startGameServer(port)`, with the HTTP routes. `main.ts` is the entry point.
- `roomLogic.test.ts`, `server.test.ts` (a real server on a free port with `@colyseus/sdk` clients).

## Talking to it

Messages are the objects in [`src/net/protocol.ts`](../src/net/protocol.ts). Over Colyseus, each message's type is its `type` field and its payload is the whole object, both ways.

```ts
import { Client } from '@colyseus/sdk';

const client = new Client('http://localhost:2567');
const hello = {
  type: 'hello',
  protocol: PROTOCOL_VERSION,
  userId,
  displayName: 'Ada',
  localPlayers: 1,
};

const room = await client.create('game', hello); // host a room
// or join one: await client.joinById(normalizeJoinCode(typed), hello)

room.onMessage('*', (_type, message: ServerMessage) => {
  /* welcome, lobby, roundStart, snapshot, pong, error */
});
room.send('ping', { type: 'ping', id: 1, clientTimeMs: performance.now() });
```

- The `hello` goes in as the join options. A refused join rejects with the `ErrorCode` as its message: `badMessage`, `protocolMismatch` or `roomFull` (a room holds `MAX_PLAYERS` players, counting every member's `localPlayers`). A wrong code rejects too (the room doesn't exist).
- After joining: `welcome` to the newcomer, `lobby` to everyone (again whenever someone joins, leaves or changes), `roundStart` when a round is loaded (also to someone joining mid-round), `snapshot` every 3 ticks (the flow, plus the round or `null`).
- `menu` presses carry local device ids (`kb-left`, `pad-0`); the server makes them `<sessionId>:<deviceId>`. A member can't bind more devices than its `localPlayers`.
- `inputs` are stamped with the server tick they're meant for (`inputTargetTick` in `src/net/clock.ts`) and only count for players bound to the sender's devices.
- `hello` again in the room changes the display name and couch player count.
- The first member is the host; when the host leaves, the earliest joined member left takes over. The room closes when the last member leaves.

HTTP: `GET /health` → `ok`. `GET /rooms/:code` → `{ joinCode }` for an open room (any case, spaces and dashes allowed), 404 otherwise.

## Deploy

```sh
docker build -t isv-simulator-server .
docker run --rm -p 2567:2567 isv-simulator-server
```

The `Dockerfile` bundles `server/` with Vite (`npm run build:server`, which inlines the level maps) into `dist-server/main.js` and runs that with Node 22 and the production dependencies. It runs anywhere that runs a container and allows WebSockets: Azure Container Apps, Fly.io, Render, a VM. Things to know:

- **One instance.** Rooms live in the process's memory and the join codes are unique per process. Don't scale out (no Redis presence or driver is set up); restarting drops the rooms.
- **WebSockets and sticky sessions.** The platform's ingress must allow WebSocket upgrades. With one instance, no sticky sessions are needed.
- **TLS.** Let the platform terminate HTTPS; browsers on an `https://` page need `wss://`. The client finds the server through `VITE_SERVER_URL` (13d/13e).
- **Health check:** `GET /health`. The platform sets `PORT`; the image defaults to 2567.
- **No auth, no rate limiting** beyond validating every message. Fine for an internal game; don't expose it widely.

`npm run build` still builds only the browser game.
