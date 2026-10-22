# Phase 14e: Characters

**Goal:** the capsules become people: Overcooked-style developers with a bean body, a big head and floating hands, in a hoodie of their player color and their player's hat shape, animated from what they're doing; and a suited manager with a coffee. Part of [phase 14](phase-14-3d-graphics.md).

## Scope

- `src/render/three/pose.ts`: `playerPose(input, timeMs)`, a pure function from a few facts (speed, carrying, working, dashing, throw wind-up, time since a shove) to a pose (bounce, lean, roll, squash, head nod, hand positions). Idle breathes (out of step per character), walking bounces, leans and swings the hands, carrying holds the ticket out front by its sides at the ticket's height, working taps both hands and nods, dashing squashes wide and flings the arms back, a throw wind-up leans back with the ticket over the shoulder, a shove wobbles and settles. `turnToward` turns characters smoothly to their new facing.
- `src/render/three/Characters.ts`: the developer (jeans, hoodie with pocket and strings, head with hair, eyes, cheeks and ears, white gloves) and the hat per player shape, in white with a band in the player color like 2D: a bobble beanie (circle), a party hat (triangle), a square cap with a tassel (square), a headband with a diamond (diamond). Skin and hair vary per player. The manager: a taller suit with a red tie, grey slicked hair, stern brows and a coffee mug. Bodies and heads are drawn 1.2× (chunky like Overcooked); hands aren't, so they stay at the ticket.
- `src/render/three/People.ts`: syncs characters by id like the 2D renderers, with visual-only memory: the turn, a per-character phase, whether the step they face moved lately (working), and when they were shoved. Each player keeps the floor ring in their color.
- Overlay heights follow the new head height; the invite floats over the hat.
- `/models.html` shows each player in a pose (idle, carrying, working, dashing) and the manager.

## 14e review fixes

- Hands outside the body (gloves at ±0.40, radius 0.09); the carried ticket and the hands share one hold point (`layout.carryPoint`), so through a throw wind-up both swing over the shoulder, and the ticket turns with the drawn (smoothed) facing, not the sim's snapping one. Turning is faster (20 rad/s) and new people start facing the right way.
- A rounder silhouette: head (0.25) as wide as the body, a slimmer hoodie, tapered jeans, the head on the shoulders and tilted forward so the face shows; bigger eyes with highlights, hair kept above the face.
- Hats 1.35× bigger; the party hat is in the player's color with a white band, the other hats white with a band or tassel in the player's color.
- Overlays over heads start above the tallest hat (`layout.HAT_TOP`, tested against the model).
- The manager is bigger (1.35×), square-shouldered in a blue-grey suit with a white collar that shows from behind, glasses, a clipboard and a coffee.
- A calmer walk (1.6 to 2.2 cycles a second with speed), a bigger waddle; dashing keeps the head round and flings the hands back where they show.
- "Working" is render-only memory (`noteWork`): the step in front moved on the same ticket while standing still. Deliberately no sim change for it (gameplay is out of scope); two players at one station both look busy.

## Second review round

- A full throw wind-up swings the ticket up, back and over the right shoulder, clear of the head (tested); hands don't bob off a carried ticket.
- The manager's collar sits low and thin (it read as a beard), thicker glasses, a clipboard held face up, the coffee hand out in front of the jacket.
- Left for later (nice-to-haves): fewer per-frame allocations in posing, and moving a ticket's checklist off the hero prop of the station being worked.

## Tests

- `three/People.test.ts`: `noteWork` (shows and holds, ignores switching tickets and walking past), the layout's hat top matches the model's
- `three/pose.test.ts`: the hands hold the ticket where it's drawn, at every wind-up; idle is still, walking bounces and leans more when faster, carrying holds the ticket at carry height out front, working taps in turn and nods, dashing squashes, a wind-up leans back, a shove wobbles and settles; turning goes the short way and stops on target

## Done when

- [x] Each player is easy to tell apart by color and hat, and you can see who carries what
- [x] Walking, carrying, working, dashing and throwing look different
- [x] `npm run check` passes
