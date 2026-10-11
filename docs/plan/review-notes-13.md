# Review notes for phase 13 (online multiplayer)

Decisions made without you, open questions and issues found while the sub-phases were built by agents. Review these with the PRs.

## How to review this stack

Stacked PRs, each on top of the one before: 13a → `main`, 13b → 13a, 13c → 13b, 13d → 13c, 13e → 13d, 13f → 13e. Merge in order, rebase-merge only. To play the whole thing, check out the last branch (`phase-13f-resilience`).

## Decisions made up front (from the kickoff Q&A)

- We host a server: Node + Colyseus 0.18 (picked because it is TypeScript-first, Phaser is its flagship integration, and it gives rooms, join codes, reconnection and a simulation clock). Plain JSON messages, no `@colyseus/schema`.
- No deploy: local server + `Dockerfile`. No cloud resources created.
- Progress lives on the server in a JSON-file `ProfileStore`, keyed by a user id kept in `localStorage` that can be copied to another device.
- After an online round every user in the room gets the result recorded; unlocks in the room follow the host.

## Per sub-phase

(Each agent appends a section here.)
