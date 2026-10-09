# Free sprites

All options below are CC0 (public domain, commercial use fine, credit optional but nice).

Our view is a front-facing 3/4 view (Overcooked style), not 2:1 isometric. Pre-rendered isometric packs won't match it. The best route is rendering 3D kits from our own camera angle, so furniture and characters are guaranteed to match.

## Furniture and stations

- **Kenney Furniture Kit**: 3D furniture and building materials (desks, chairs, computers, plants, walls). Render the 3D models from our camera angle with a Blender script (the agent can write it). https://opengameart.org/content/furniture-kit
- Stations without a direct match (pipeline, inbox, ship hatch) can be built from kit pieces in Blender, or stay stylised placeholders with a nice icon on top

## Characters

1. **Procedural placeholder developers** (capsule body in the player color, head, nose showing facing). Readable, zero effort, fits the humor. Start here.
2. **Render Kenney's 3D Mini Characters to sprite sheets** with the same Blender script: idle, walk, carry and work animations in 4 or 8 directions. Consistent with the furniture. Best long-term option.
3. **Puny Characters**: CC0, 8 directions, idle and walk animations. Pixel fantasy style, clashes with Kenney's clean renders and has no carry animation. https://opengameart.org/content/puny-characters

## Rules

- Keep the angle consistent: everything rendered at our `VIEW_PITCH` and `VIEW_YAW`
- Players must stay easy to tell apart: color is the main signal, a hat or shape is a nice second one
- Record every pack in `CREDITS.md`
- Never use assets from Overcooked, Theme Hospital or other commercial games
