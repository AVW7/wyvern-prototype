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
- `scenes/PreloadScene.js` — loads assets AND generates placeholder textures +
  animations. Real `this.load.*` calls go here (examples are commented in place).
- `scenes/BaseScene.js` — the management sim. Renders as an **HTML/CSS overlay**
  (`#ui-overlay`), not canvas objects. Launches missions.
- `scenes/MissionScene.js` — builds the iso grid, spawns the wyvern, depth-sorts
  every frame.
- `entities/Wyvern.js` — the sprite + animation **state machine** + input.
- `systems/iso.js` — `gridToScreen` / `screenToGrid` / `sortByDepth`.
- `systems/roster.js` — shared base/roster data model.
- `config.js` — **single source of truth** for canvas size, iso tile size, the
  demo map, and wyvern state names.
- `ui/ui.css` — overlay styling.

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

## Replacing placeholders (the common next steps)

- **Real wyvern art:** see `assets/sprites/wyverns/README.md`. Load an atlas in
  Preload, swap frame configs to `generateFrameNames(...)` ranges, change the
  `Wyvern` constructor texture from `'wyvern-placeholder'` to `'wyvern'`.
- **Real iso maps:** author in Tiled (isometric, 64x32), load with
  `this.load.tilemapTiledJSON`, build layers in `MissionScene` in place of the
  `DEMO_MAP` loop. See `assets/tilemaps/README.md`.
- **More sim depth:** the disabled Train/Build buttons in `BaseScene` are the
  hooks; back new systems with (or alongside) `systems/roster.js`.

## Guardrails

- Don't introduce a build system, framework, or npm dependency without being
  asked — the no-tooling setup is deliberate for prototype speed.
- Don't pin a different Phaser major version; APIs used here target Phaser 3.
- Keep the prototype runnable with zero art at every step (placeholders first,
  then swap in real assets).
