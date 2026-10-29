# Phase 21: tickets that say what they mean

**Goal:** two bugs found while playing, then a rework of how tickets look. After this phase an incident really stops shipping, an order that runs out takes its ticket with it, and every ticket and order card shows at a glance what's left to do and how much time is left.

## Steps (one stacked PR each)

1. **Nothing ships while an incident is open.** Today an incident only stops new feature orders: `shipTicket` ships anything, while the banner ("New features on hold until the hotfix ships") and the incident intro make players think shipping is blocked. Make it real: while an incident is open, the ship tile refuses every ticket but the hotfix and says so (a `shipBlocked` event, a "nope" sound, a "Hotfix first!" popup over the player, the banner shakes its head). The pause on new feature orders stays. The banner and the intro say the new rule. Bots park a finished non-hotfix ticket on a free counter (or hold it if there is none) and fetch it again once the incident is over.
2. **Expired orders don't leave a zombie ticket.** Today a ticket whose order ran out still matches another order with the same steps, or ships for nothing. Tickets remember their order (`orderId`) and get an `expired` flag; shipping completes only the ticket's own order. When an order runs out, its tickets out in the office become expired: they can't be worked, built, merged or shipped, only carried, thrown and binned. The Garage map gets a bin. Expired cards are greyed out. Bots bin expired tickets.
3. **A ticket rework.** Overcooked-style tickets in the phase 20 software look. Layout: a timer bar on top and one tile per step with its station's icon, showing each step's live state. Look: an issue-tracker card (`#12`, a kind chip, steps styled like CI checks: pending, running, passed, skipped), with a `closed: wontfix` stamp once expired. Used for both the HUD order cards and the ticket cards in the world, from one shared step-look definition and a tested helper that gives each step's display state.

## Done when

Step 1:

- [x] While an incident is open, the ship tile refuses everything but the hotfix, with a sound, a "Hotfix first!" popup and a shaking banner
- [x] The hotfix still ships; everything ships again once it has shipped or the incident has run out
- [x] The banner and the incident intro say nothing ships until the hotfix does
- [x] Bots park finished tickets during an incident and ship them afterwards
- [x] Tests in `incidents.test.ts` and `bot.test.ts`

Step 2:

- [x] Shipping completes only the ticket's own order; a ticket from another order with the same steps doesn't steal it
- [x] When an order runs out, its tickets out in the office become expired: no work, build, merge or ship, only carry, throw and bin
- [x] The Garage has a bin; expired ticket cards are greyed out
- [x] Bots bin expired tickets
- [x] Tests for the order link, expiry, refusals and bots

Step 3:

- [x] HUD order cards and world ticket cards share one layout: timer bar on top, one tile per step with its station icon and live state
- [x] Cards read as issue-tracker cards (`#id`, kind chip, CI-check step states, `closed: wontfix` when expired)
- [x] One shared step-look definition; a tested helper gives each step's display state
- [x] Screenshots retaken where the look changed

All steps:

- [x] `npm run check` and `npm run build` pass

## Out of scope

- New mechanics, stations, levels or chapters (the Garage only gets a bin)
- Changing scores, timers or penalties beyond what the fixes need

## Decisions

Step 1, the incident ship block:

- **Only the hotfix ships.** A ticket of kind `incident` ships; features, bugs and full-stack features are refused, even when their order is about to run out. Bugs landing and open orders' timers keep running as before.
- **Feedback on the refusal:** a `shipBlocked` event (`playerId`, `ticketId`). It plays the existing error sound (`order-expired`, no new asset), pops "Hotfix first!" (`SHIP_BLOCKED_TEXT` in `content.ts`) over the player with a small shake, and the incident banner shakes its head (just the flash with reduced motion). The player keeps the ticket.
- **Words:** the banner reads "INCIDENT! Nothing ships until the hotfix does"; the Seed Round intro says nothing else ships and no new features come in until the hotfix does.
- **Bots:** a bot with a finished non-hotfix ticket parks it on the nearest free counter (no belt feeding it, no other bot about to use it) and goes for other work, the hotfix included; with no free counter it holds the ticket. Finished tickets on counters are fetched and shipped once shipping is open again.

Step 2, expired tickets:

- **Tickets belong to their order.** `Ticket.orderId` is set when the order opens (both full-stack parts too, and the merged ticket keeps it). `shipTicket` completes only that order; a ticket whose order is gone can't ship. This replaces phase 6's "first matching order, or ship for nothing".
- **Expiry:** queued tickets of the order go away as before; every other ticket of the order gets `expired: true`. An expired ticket has no workable steps, so no station, pipeline, review or merge takes it; a pipeline holding one stops building and never breaks. A shoved-off expired ticket is gone, not back in the queue (`ticketLost` with `queue: null`).
- **Bots** take expired tickets to the bin (or park them on a counter on a level without a bin), and fetch expired tickets lying around when there is a bin.
