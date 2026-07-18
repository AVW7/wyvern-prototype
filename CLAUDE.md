# CLAUDE.md

Context for AI agents (and humans) working on this repo. Read this first.

## Multi-AI project

This repository intentionally supports collaboration among Claude, Codex,
Gemini, other models, and humans. Read `AI_CONTEXT.md` for the shared handoff,
`docs/SANCTUARY_FREE_ROAM_PLAN.md` for the implemented sanctuary baseline,
`docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md` for the active follow-up initiative,
and `AI_CONTRIBUTIONS.md` before recording material work. After contributing,
append a truthful contribution row; do not infer an exact model version that
was not recorded.

When asked to review the sanctuary design, use the questions and append-only
template under **Multi-model review workspace** in
`docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md`. Preserve the historical reviews in
the predecessor plan and leave final decision statuses to the human project
owner.

## What this is

A **Phaser 3** prototype for a two-layer game:

1. **Missions** — isometric-background action levels where the player controls
   **sprite-based wyverns**.
2. **Base** — a base-building / roster-management sim that runs *between* missions.

Current stage: **small prototype** — three demo wyverns, a few missions, proving the
concept. Scope decisions should favor "prove it fast" over "build it to scale."
It runs when art is absent because placeholder textures are generated at load.
Embertooth currently has a real atlas; Cinderlash and Galeclaw use fallbacks.

## Tech stack

- **Engine:** Phaser 3.80.1, pinned through npm. `src/bootstrap.js` exposes it
  globally for the existing scene modules.
- **Code:** vanilla JS as **ES modules**, served and built with Vite. Vitest
  covers pure technical contracts; there is no application UI framework.
- **Art pipeline:** Phaser hash atlases with required `meta.animations` state
  lists; see `assets/sprites/wyverns/README.md`. Tiled is still planned for
  isometric maps (64x32 tiles).

## Run / test

Use the pinned Node workflow (`file://` is unsupported):

```bash
npm ci
npm run dev
```

Run the full local gate after edits:

```bash
npm run check
```

This checks JavaScript syntax, configured wyvern atlases, Vitest contracts, and
the production build. Canvas behavior still needs a browser smoke test.

## Architecture & flow

Scene order (registered in `src/main.js`):
**Boot → Preload → Base ⇄ Vault**, and **Base/Vault → Atlas → Mission → (back
to Base)**

The four playable layers — sanctuary grounds, vault interior, world atlas,
mission — are **deliberately separate scenes that share no scene-level code**.
They share only low-level systems (draw/tileArt/decorArt/textureBake) and the
roster. Don't unify their rendering or scene logic.

- `scenes/BootScene.js` — one-time setup, hands off to Preload.
- `scenes/PreloadScene.js` — loads assets, validates wyvern atlases, and generates the wyvern/enemy
  placeholder textures + animations, plus one `species-<id>` emoji texture per
  sanctuary species (residents). Real `this.load.*` calls go here (examples are
  commented in place). Terrain textures are NOT baked here — they bake lazily
  on first use (see `systems/textureBake.js`).
- `scenes/BaseScene.js` — the sanctuary **grounds**: the hand-authored Mossy
  Monolith island rendered on canvas, with the roster roaming as residents
  under the HTML/CSS Roost panel (`#ui-overlay`). The selected wyvern is
  directly controllable; the scene orchestrates camera modes, bounded movement,
  world interactions, ambient wandering, roster actions, and travel to the
  Vault or Atlas.
- `scenes/VaultScene.js` — the sanctuary **interior**: the Emberkeep Dragon
  Vault showcase. One selected demo wyvern stands on the central dais while
  the HTML/CSS vault panel shows its profile and previews its six animation
  states. The sprite contract also registers a seventh `special` state, but no
  Vault button or gameplay trigger is wired yet. The daylight glow over the entry bridge (or the overlay button)
  returns to the grounds; management controls stay on BaseScene.
- `scenes/AtlasScene.js` — the **world atlas**: the Shattered Cradle overworld
  and the game's mission select. Pans/zooms its own camera, places the island
  from `systems/atlasWorld.js`, and puts a clickable marker on each POI in
  `data/atlas.js`. Launching one starts a Mission **with that POI's seed**.
  Keeps its own tile placement and camera — it does not use `sanctuaryRender`.
- `scenes/MissionScene.js` — builds the procedural iso island (from the seed
  the atlas passed, else `TERRAIN.seed`), spawns the wyvern and enemies,
  resolves combat, depth-sorts every frame, and shows the order bar / win-lose
  overlay.
- `entities/Wyvern.js` — the sprite + animation **state machine** + input +
  standing order.
- `entities/Enemy.js` — minimal sprite state machine (idle/hurt/death), no
  input; hp and combat resolution live in `MissionScene`.
- `systems/iso.js` — `gridToScreen` / `screenToGrid` / `sortByDepth`.
- `systems/sanctuaryCamera.js` — Base-only overview/follow/survey camera,
  panel-aware fit, bounded pan, cursor-anchored zoom, three-step yaw,
  lower/default/higher elevation, transition locking, and full-rig reset.
- `systems/sanctuaryMovement.js` — Base-only logical-world collision and
  camera-relative normalized input, projected flight presentation, resident
  handoff, and bounded ambient wandering. Navigation never uses the visually
  lifted sprite position. World motion is projected into eight view-facing
  animation sectors whenever an actor or the camera moves.
- `systems/sanctuaryProjection.js` — Phaser-free forward/inverse position,
  footprint, vector, cell-quad, bounds, and view-direction projection for all
  nine supported yaw/elevation combinations. The default view remains
  compatible with `gridToScreen()`.
- `systems/sanctuaryGroundPlane.js` — pure projection transforms for radial
  ground affordances. Elevation changes their foreshortening while upright
  sprites, labels, prompts, and glyphs remain unchanged.
- `systems/sanctuaryDecorArt.js` — Base-only procedural exterior prop drawers
  built from active-view ground and height points. Generic `decorArt.js`
  remains the fixed-view contract for Vault, Atlas, and Mission.
- `systems/sanctuaryInteractions.js` — Base-only authored/live target registry,
  nearest/hover affordances, range/cooldown handling, and the shared E/click
  activation path.
- `systems/terrain.js` — procedural island generator: per-cell biome, height
  (1-5 with island falloff), and prop. Pure function of `TERRAIN.seed`.
- `systems/noise.js` — seeded hash / value / fractal noise (deterministic).
- `systems/draw.js` — low-level canvas helpers (pixel-snapped rects/polygons,
  color mixing, diamond geometry) shared by `tileArt.js` and `decorArt.js`.
- `systems/tileArt.js` — draws default and projected iso tile geometry to a
  canvas ctx: visible sidewalls, soil strata, per-biome top texture, lit rim,
  and overlays. Pure drawing, no Phaser.
- `systems/decorArt.js` — 18 procedural props (trees, crystals, ruins,
  obelisks...) in a `DECOR_DRAWERS` registry. Pure drawing, no Phaser.
- `systems/textureBake.js` — bakes tile/decor/backdrop art into Phaser canvas
  textures on demand. Base variants are cached by normalized view; generic
  fixed-view keys and rasters remain unchanged.
- `data/sanctuary.js` — the two hand-authored sanctuary maps
  (`buildSanctuaryExterior` / `buildSanctuaryInterior`) + `RESIDENT_SPOTS` and
  stable exterior `INTERACTIONS`. Same `{ tiles, cols, rows }` contract as
  `terrain.js`, but cells may be `null` (holes in the island silhouette), may
  carry an `overlay`, and expose explicit `walkable` metadata. The exterior
  builder additively returns its interaction descriptors.
- `systems/sanctuaryRender.js` — sanctuary-only view building: camera fit,
  projected bounds/world shadow, backdrop, in-place tile/prop reprojection,
  resident handles and ground affordances, footprint effects, occlusion, and
  ambient prop tweens. Used by BaseScene and VaultScene; **not** by
  MissionScene, which keeps its own inline placement.
- `ui/roostPanel.js` — the Roost overlay widget (selectable roster cards,
  camera controls, action results, recruit row, travel/launch buttons) used by
  BaseScene. VaultScene keeps its separate `ui/vaultPanel.js`. Both are pure DOM.
- `systems/atlasWorld.js` — the atlas's island generator: region blobs →
  per-cell biome/height/prop, plus the southern atoll ring. Returns the same
  `{ tiles, cols, rows }` contract as `terrain.js`. Deliberately **not**
  `terrain.js`: that one models a random climate, this one rebuilds an
  authored world. Sea is a real `ocean` tile, never a `null` hole.
- `data/atlas.js` — the atlas's hand-authored world: `REGIONS` (7),
  `REGION_BLOBS` (the island silhouette in 8 rows), and `POIS` (12 mission
  destinations, each with its own terrain `seed`). Pure data.
- `ui/atlasPanel.js` — the atlas overlay (region list, POI card, hover
  tooltip). Pure DOM, same shape as `roostPanel.js`.
- `data/biomes.js` — the 23 biome palettes + their prop lists. Pure data:
  8 mission biomes, then the atlas regions (badlands/taiga/snow/darkwood/
  jungle/ocean/atoll), then the sanctuary materials (moss/bluestone/
  springwater outside; flagstone/masonry/warmstone/timber/iron inside).
  `pickBiome()` can never return an atlas or sanctuary palette, so missions
  are unaffected by them.
- `data/species.js` — the sanctuary species registry (id, name, emoji,
  hpBase, hpPerLevel). Pure data, same pattern as `data/biomes.js`.
- `data/wyverns.js` — the three immutable demo profiles, their one-to-five
  mission ratings/tags, and their profile-specific asset/animation key helper.
- `systems/wyvernAtlas.js` — pure atlas contract and validation used by the
  runtime, command-line validator, and tests. Atlas JSON `meta.animations` is
  the single source of frame sequences.
- `systems/roster.js` — shared base/roster data model for every recruited
  animal (any species, not just wyverns) + xp/leveling (`gainXp`), bonding
  (`raiseBond`), and recruiting (`recruitAnimal`), backing each roster
  card's Train/Feed buttons and the Base sim's recruit row.
- `config.js` — **single source of truth** for canvas size, iso tile size,
  terrain seed/size/height tuning, sanctuary camera/movement/interaction
  tuning, wyvern state names, combat tuning, and wyvern orders.
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

### The sanctuary (Base + Vault)

Both sanctuary maps are hand-authored in `data/sanctuary.js` — no noise, no
seed: the layouts are literal `fill`/`setTile`/`setProp` sequences ported from
the two design prototypes. To reshape either one, edit those calls.

- **To add a resident spot:** add a cell to `RESIDENT_SPOTS.outside/inside`.
  The roster fills spots in order and wraps with a small offset if it outgrows
  the list.
- **To add a grounds interaction:** add a stable descriptor to
  `INTERACTIONS.outside`, place any matching prop/area in the exterior builder,
  and map its `action` callback in `BaseScene`. Range and sorting use the ground
  footprint, not the rendered prop or resident height.
- **To add an interior prop:** write a drawer + registry entry in
  `decorArt.js` (see the interior-props section), then `setProp` it in the
  interior layout. Keep it inside `DECOR_BOX` or bump the box.
- **Travel between them is in-world:** Base uses the stable `vault-gate`
  interaction (E/click in range), while VaultScene finds the `glow` prop by
  type in `placed.decor` and makes it clickable. Both overlays retain explicit
  travel buttons.
- **The vault is a showcase, not a second management screen:** its overlay is
  built by `ui/vaultPanel.js`, and `VAULT_PREVIEW_SPOT` in `data/sanctuary.js`
  controls where the selected demo wyvern stands.
- **One-off tile details** (like the monolith's niche) are `TILE_OVERLAYS`
  entries in `tileArt.js`, named by a cell's `overlay` field. They bake to
  their own texture key, so the shared biome+variant texture stays clean.

#### Rotatable sanctuary view

The canonical implementation brief is
`docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md`; this section is only the architecture
summary.

The current sanctuary has zoom, bounded pan, Overview/Follow/Survey,
camera-relative eight-direction logical movement, a 90° horizontal camera
range (`-45°..+45°` around the default heading), and lower/default/higher
elevation presets. Milestones 1–4 of the canonical plan are implemented;
directional wyvern atlas art remains the final blocking milestone.

- Do not implement yaw with `Phaser.Camera.rotation`. That rotates a completed
  flat picture but cannot reveal new terrain/prop sides or preserve correct
  pointer inversion, depth, and occlusion.
- Keep stable grid/world coordinates as the source of truth. A low-level
  projection maps them into the active view and can invert pointer positions.
- Treat `screenInput`, `worldDirection`, and `viewDirection` as different
  concepts. Input becomes camera-relative; collision/range stay in world
  space; animation facing is derived after projecting the motion vector.
- Reproject tiles, sidewalls, props, resident footprints, markers, effects,
  shadows, and camera bounds. Keep DOM panels fixed and world text upright.
- The implemented 2D rig eases among three yaw headings and three elevation
  steps. Free 360°/3D orbit remains deferred.
- Preserve zoom, Follow, survey pan, panel bias, selected resident, yaw, and
  elevation through recruit rebuilds and in-memory Base scene travel.

#### Sanctuary-ready wyvern art

Directional keys already exist for `n, ne, e, se, s, sw, w, nw`, and the
sanctuary controller already selects them. Missing sequences currently fall
back to east-facing baseline art. For the rotatable-camera milestone:

- Idle and Fly require complete eight-view turntables for the first art slice.
- Attack, Guard, and Special require all eight views before final milestone
  acceptance because the spring, training, and feed interactions play them.
- Hurt and Death may retain east baseline art until those states exist in the
  sanctuary, but remain required global atlas states for Mission/Vault.
- Direction names describe the sprite's view-space silhouette, not a fixed
  world compass. Runtime derives them from world motion plus camera heading.
- Keep one ground pivot, scale, light direction, anatomy, cadence, and phase
  across every view. Do not rotate painted sprites to fake missing art.
- The current loader accepts one atlas page per profile. Extend loader,
  catalog, validator, and fallback behavior before exporting a directional set
  that needs multiple pages. Full details live in
  `assets/sprites/wyverns/README.md`.

### The world atlas

`data/atlas.js` (what exists) → `systems/atlasWorld.js` (where it goes) →
`tileArt`/`decorArt`/`textureBake` (how it looks) → `AtlasScene` (place +
camera) → `ui/atlasPanel.js` (the overlay).

- **To add a mission destination:** add a `POIS` row. Its `kind` must be a key
  in `DECOR_DRAWERS`, and its `seed` is what makes its mission a distinct
  island. Nothing else needs wiring — the marker, the list row, and the launch
  button all come from that one row.
- **To reshape the island:** move/resize the `REGION_BLOBS`. Each cell takes
  the biome of the nearest blob; anything far from all of them becomes sea.
- **x/y are grid axes, not compass directions.** The map is drawn
  isometrically, so a blob's position on screen is a 45° turn from its
  coordinates — placing one by eye will put it somewhere surprising. Convert
  from screen terms (`x = (sx+sy)/2`, `y = (sy-sx)/2`); see the note above
  `REGION_BLOBS`. The current layout matches the reference world map: taiga N,
  badlands NW, desert W, grass centre, snow NE, darkwood E, jungle SE,
  atoll S.
- **The camera frames the island, not the grid** (`AtlasScene.fitCamera`), so
  how far a blob sits from the origin barely matters — a compact island just
  renders at a higher zoom. What matters is staying inside the grid: past
  `±ATLAS.cols/2` the coastline is clipped instead of fading into open sea.
  The open sea fades out at the grid's edge (`ATLAS.seaFade`) so its diamond
  boundary never reads as a horizon.
- **To retune a region's terrain:** edit its `HEIGHT_CURVES` entry in
  `atlasWorld.js` — that's what makes snow spike and badlands step into mesas.
- **Atlas heights are relative to `ATLAS_BASE_HEIGHT`**, not
  `TERRAIN.baseHeight`. Ocean sits below the plane; peaks rise above it.
- The atlas has **no persistence**: `explored`/`discovered` are static data.
  Wiring them to real progress is ROADMAP Phase 4.

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
  iso support. Mission/Atlas/Vault use `gridToScreen(col, row)`; the Base
  sanctuary uses `sanctuaryProjection.js`. Rely on `sortByDepth()` for overlap.
  Anything that moves must set depth from its ground footprint, not its
  visually elevated sprite Y, and the scene must re-sort each frame. Preserve
  logical grid coordinates; do not mutate world data or rotate the flat camera
  output to simulate yaw.
- **Direction is view-dependent.** The eight direction labels are screen/view-
  space animation facings. Keep a separate world movement vector and derive the
  view-facing key from the active sanctuary projection.
- **Wyvern states are string-keyed and centralized.** Add new actions to
  `WYVERN_STATES` in `config.js`, register the animation in
  `PreloadScene.createWyvernAnimations()`, and trigger via `wyvern.setState(...)`.
  Animation keys follow the profile-specific pattern `<assetKey>-<state>`
  (for example `wyvern-embertooth-guard`).
- **One-shot states lock the entity.** Attack/hurt unlock and return to Idle on
  completion. Mission death remains locked; the Vault deliberately returns its
  Death preview to Idle. Don't add movement code that ignores `locked`.
- **Management-sim UI = HTML/CSS overlay**, not canvas drawing. Build menus,
  rosters, tooltips in the `#ui-overlay` div and style them in `ui.css`. Clear
  the overlay (`innerHTML = ''`) on scene transitions.
- **Pixel art settings are intentional:** `pixelArt: true` + `roundPixels: true`
  in `main.js` keep terrain crisp. Real high-resolution wyvern atlases opt into
  linear filtering in `PreloadScene` so downscaled painted art stays stable.
- **Tune from `config.js`.** Prefer adding constants there over hardcoding.
- **Keep comments explaining the "replace this placeholder" seams** — art and
  maps get swapped in incrementally.

## Wyvern orders

The mission HUD has an on-screen command bar — **Guard / Scout / Attack /
Recon / Protect** — that sets the wyvern's standing order. Orders are
deliberately a separate concept from `WYVERN_STATES`:

- `WYVERN_STATES` (idle/fly/guard/attack/special/hurt/death) are **animation frames**,
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

- **Real wyvern art:** see `assets/sprites/wyverns/README.md`. Embertooth uses
  the compact required-state atlas configured in `data/wyverns.js`; profiles without an
  atlas still receive a colored emoji placeholder. Add later atlas paths and
  frame-name arrays to the profile data—VaultScene and Wyvern need no changes.
  Sanctuary camera rotation now makes eight-direction Idle/Fly the next art
  priority, followed by Attack/Guard/Special.
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
- Do not describe the directional-wyvern milestone or complete rotatable-camera
  plan as accepted until the required Idle/Fly and visible action turntables
  land and pass the browser matrix in
  `docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md`.
