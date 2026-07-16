# CLAUDE.md

Context for AI agents (and humans) working on this repo. Read this first.

## What this is

A **Phaser 3** prototype for a two-layer game:

1. **Missions** — isometric-background action levels where the player controls
   **sprite-based wyverns**.
2. **Base** — a base-building / roster-management sim that runs *between* missions.

Current stage: **small prototype** — one wyvern, a few missions, proving the
concept. Scope decisions should favor "prove it fast" over "build it to scale."
It runs today with **zero art files**: placeholder textures are generated at load.

## Tech stack

- **Engine:** Phaser 3.80.1, loaded from CDN in `index.html`. No build step.
- **Code:** vanilla JS as **ES modules** (`<script type="module">`). No bundler,
  no framework, no npm dependencies.
- **Planned art pipeline:** Aseprite (wyvern sprite sheets + JSON atlas) and
  Tiled (isometric maps, 64x32 tiles). Not yet wired — placeholders stand in.

## Run / test

ES modules require an HTTP server (opening `file://` throws CORS errors):

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

There is no test suite. To sanity-check syntax after edits:

```bash
for f in $(find src -name '*.js'); do node --check "$f"; done
```

Verification for gameplay changes is manual: run the server, load the page, open
the browser devtools console, and confirm no errors + expected behavior.

## Architecture & flow

Scene order (registered in `src/main.js`):
**Boot → Preload → Base → Mission → (back to Base)**

- `scenes/BootScene.js` — one-time setup, hands off to Preload.
- `scenes/PreloadScene.js` — loads assets and generates the wyvern/enemy
  placeholder textures + animations. Real `this.load.*` calls go here
  (examples are commented in place). Terrain textures are NOT baked here —
  they bake lazily on first use (see `systems/textureBake.js`).
- `scenes/BaseScene.js` — the management sim. Renders as an **HTML/CSS overlay**
  (`#ui-overlay`), not canvas objects. Launches missions.
- `scenes/MissionScene.js` — builds the procedural iso island, spawns the
  wyvern and enemies, resolves combat, depth-sorts every frame, and shows the
  order bar / win-lose overlay.
- `entities/Wyvern.js` — the sprite + animation **state machine** + input +
  standing order.
- `entities/Enemy.js` — minimal sprite state machine (idle/hurt/death), no
  input; hp and combat resolution live in `MissionScene`.
- `systems/iso.js` — `gridToScreen` / `screenToGrid` / `sortByDepth`.
- `systems/terrain.js` — procedural island generator: per-cell biome, height
  (1-5 with island falloff), and prop. Pure function of `TERRAIN.seed`.
- `systems/noise.js` — seeded hash / value / fractal noise (deterministic).
- `systems/draw.js` — low-level canvas helpers (pixel-snapped rects/polygons,
  color mixing, diamond geometry) shared by `tileArt.js` and `decorArt.js`.
- `systems/tileArt.js` — draws one iso tile to a canvas ctx: gradient
  sidewalls, soil strata, per-biome top texture, lit rim. Pure drawing, no
  Phaser.
- `systems/decorArt.js` — 18 procedural props (trees, crystals, ruins,
  obelisks...) in a `DECOR_DRAWERS` registry. Pure drawing, no Phaser.
- `systems/textureBake.js` — bakes tileArt/decorArt/backdrop into Phaser
  canvas textures on demand, cached by key. The only bridge between the pure
  drawing modules and Phaser.
- `data/biomes.js` — the 8 biome palettes + their prop lists. Pure data.
- `data/species.js` — the sanctuary species registry (id, name, emoji,
  hpBase, hpPerLevel). Pure data, same pattern as `data/biomes.js`.
- `systems/roster.js` — shared base/roster data model for every recruited
  animal (any species, not just wyverns) + xp/leveling (`gainXp`), bonding
  (`raiseBond`), and recruiting (`recruitAnimal`), backing each roster
  card's Train/Feed buttons and the Base sim's recruit row.
- `config.js` — **single source of truth** for canvas size, iso tile size,
  terrain seed/size/height tuning, wyvern state names, combat tuning, and
  wyvern orders.
- `ui/ui.css` — overlay styling.

### Procedural terrain pipeline

`terrain.js` (what goes where) → `tileArt.js`/`decorArt.js` (how it looks) →
`textureBake.js` (turn it into textures) → `MissionScene` (place sprites).

- The island is a pure function of `TERRAIN.seed` — change the seed, get a new
  world; nothing is stored.
- Ground tiles (`TERRAIN.baseHeight`) put their top face on the gameplay plane;
  taller cells rise above it as cliffs. Entities move freely on the plane
  (heights are cosmetic until pathing lands — `blocked` is already in the data).
- To add a biome: add a palette row in `data/biomes.js` (+ optional top-texture
  entry in `tileArt.js`). To add a prop: drawer + registry entry in
  `decorArt.js`, list it in a biome's `decor`. Nothing else needs wiring.

### Sanctuary species

- To add a sanctuary species: add an entry to `data/species.js` (id, name,
  emoji, hpBase, hpPerLevel) — the Base screen's recruit row and roster
  cards pick it up automatically. Mirrors the biome-registry pattern above.
- Non-wyvern species can't be sent on missions yet — `Wyvern`/`Enemy`
  entities and their Preload placeholder textures are combat-specific.
  Extending `MissionScene` to spawn any recruited species is the next seam
  once more species are added.

## Conventions (follow these)

- **Isometric is manual.** Phaser's world is screen-space. Never assume built-in
  iso support. Place things with `gridToScreen(col, row)` and rely on
  `sortByDepth()` for overlap. Anything that moves must set
  `this.setData('depth', this.y)` and the scene must re-sort each frame.
- **Wyvern states are string-keyed and centralized.** Add new actions to
  `WYVERN_STATES` in `config.js`, register the animation in
  `PreloadScene.createWyvernAnimations()`, and trigger via `wyvern.setState(...)`.
  Animation keys follow the pattern `wyvern-<state>`.
- **One-shot states lock the entity.** Attack/hurt/death set `this.locked = true`;
  the `animationcomplete` handler unlocks and returns to idle. Don't add movement
  code that ignores `locked`.
- **Management-sim UI = HTML/CSS overlay**, not canvas drawing. Build menus,
  rosters, tooltips in the `#ui-overlay` div and style them in `ui.css`. Clear
  the overlay (`innerHTML = ''`) on scene transitions.
- **Pixel art settings are intentional:** `pixelArt: true` + `roundPixels: true`
  in `main.js`. Keep them; sprites must stay crisp.
- **Tune from `config.js`.** Prefer adding constants there over hardcoding.
- **Keep comments explaining the "replace this placeholder" seams** — art and
  maps get swapped in incrementally.

## Wyvern orders

The mission HUD has an on-screen command bar — **Guard / Scout / Attack /
Recon / Protect** — that sets the wyvern's standing order. Orders are
deliberately a separate concept from `WYVERN_STATES`:

- `WYVERN_STATES` (idle/fly/attack/hurt/death) are **animation frames**,
  driven every tick by input and combat.
- `WYVERN_ORDERS` (`config.js`) are the **standing behavior mode** that gates
  or steers that input — set via `wyvern.setOrder(order)`, read every frame
  through `ORDER_EFFECTS[wyvern.order]`.

Each order's effect is a plain data row in `ORDER_EFFECTS`:
`speedMultiplier` (0 = holds position), `canAttack` (gates the manual
space-bar attack), `autoAttack` (MissionScene fires at the nearest enemy on
`COMBAT.autoAttackCooldownMs` with no key press), and
`damageTakenMultiplier` (scales contact damage in
`MissionScene.handleContactDamage`). Scout and Recon share numbers today —
Recon exists as its own hook for a future fog-of-war/vision system rather
than an alias.

To add a new order: add the key to `WYVERN_ORDERS`, a row to
`ORDER_EFFECTS`, and it appears in the HUD automatically (the button list is
generated from `Object.values(WYVERN_ORDERS)` in
`MissionScene.buildHud()`) — no other wiring needed unless the new order
needs behavior beyond the four existing effect fields.

## Replacing placeholders (the common next steps)

- **Real wyvern art:** see `assets/sprites/wyverns/README.md`. Preload
  currently bakes emoji glyphs to canvas textures (`createEmojiTexture`) as
  the placeholder. Load a real atlas instead, swap frame configs to
  `generateFrameNames(...)` ranges, change the `Wyvern`/`Enemy` constructor
  texture from `'wyvern-placeholder'`/`'enemy-placeholder'` to the real key.
- **Hand-authored iso maps:** author in Tiled (isometric, 64x32), load with
  `this.load.tilemapTiledJSON`, and have `buildTerrain()` in
  `systems/terrain.js` read biomes/heights from the loaded map instead of
  noise — everything downstream only sees the per-cell descriptions it
  returns. See `assets/tilemaps/README.md`.
- **More mission variety:** `DEMO_ENEMY_SPAWNS` and the hardcoded
  `'mission01'` id are the seams for per-mission enemy/layout data once more
  than one mission is needed.
- **Closing the mission ↔ roster loop:** `MissionScene.spawnWyvern()` always
  pulls `'wyv-01'` and never writes hp/xp back to `roster.js` on
  victory/defeat — the Base sim and Mission layer don't talk to each other
  yet beyond that one read. See `ROADMAP.md` for the sequencing.

## Guardrails

- Don't introduce a build system, framework, or npm dependency without being
  asked — the no-tooling setup is deliberate for prototype speed.
- Don't pin a different Phaser major version; APIs used here target Phaser 3.
- Keep the prototype runnable with zero art at every step (placeholders first,
  then swap in real assets).
