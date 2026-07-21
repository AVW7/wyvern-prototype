# Wyvern Prototype

> **Multi-AI project:** this prototype is intentionally developed with human
> direction and is set up for contributions from Codex, Claude, Gemini, and
> other models.
> See the [shared AI context](AI_CONTEXT.md), [model contribution
> registry](AI_CONTRIBUTIONS.md), and [sanctuary free-roam
> baseline](docs/SANCTUARY_FREE_ROAM_PLAN.md). Camera/projection engineering and
> the remaining directional-art work are tracked in the
> [rotatable sanctuary camera plan](docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md).
> A separate, scoped experiment rendering one sanctuary resident as a 3D
> model over the 2D sanctuary is tracked in the
> [3D dragon experiment plan](docs/SANCTUARY_3D_DRAGON_PLAN.md).

A Phaser 3 scaffold for a two-layer game: an **isometric-background action mission**
with **sprite wyverns**, plus a **base/roster management sim** between missions.
Runs with zero art files — placeholder textures are generated at load so the shell
is playable immediately. Swap in real art and features as you go.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`
- A current desktop browser with WebGL

## Run it

Install the pinned dependencies once, then start the Vite preview:

```bash
npm ci
npm run dev
```

Open the local URL Vite prints. Opening `index.html` with `file://` is not
supported because the game uses ES modules and loaded assets.

| Command | Purpose |
|---|---|
| `npm run dev` | Local preview with fast refresh |
| `npm run validate:atlas` | Check every configured dragon atlas and PNG |
| `npm test` | Run atlas, presentation, sanctuary-system, and lifecycle tests |
| `npm run build` | Create the static production build, including runtime assets, in `dist/` |
| `npm run check` | Syntax, atlas validation, tests, and production build |

## Multi-AI collaboration

- `AI_CONTEXT.md` is the shared model-neutral handoff and read order.
- `CLAUDE.md` is the established detailed architecture reference.
- `AGENTS.md` and `GEMINI.md` route Codex/agents and Gemini into the same
  context rather than duplicating project rules.
- `AI_CONTRIBUTIONS.md` is an append-only model registry and contribution log.
- `docs/SANCTUARY_FREE_ROAM_PLAN.md` is the implemented and closed explorable
  sanctuary baseline.
- `docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md` records the implemented camera
  yaw/elevation and view-aware projection plus the open directional-art gate.
- `docs/SANCTUARY_3D_DRAGON_PLAN.md` records the scoped, owner-approved
  Three.js single-resident 3D rendering experiment (does not change the
  sanctuary camera or projection).

Models should add themselves only after a material contribution, then append a
work record with the files/evidence and verification performed.

## What you'll see

1. **Roost** (base sim + free roam) — directly explore the sanctuary as the
   selected wyvern, interact with residents and five authored landmarks, manage
   the roster, and enter the Emberkeep Rider Vault.
   - Move: Arrow keys / WASD
   - Interact: E or click/tap a nearby target
   - Orbit: `[` / `]`; elevate: Page Down / Page Up
   - Follow/Survey: F; reset overview: Home
   - Pan: Space-drag or right/middle-drag; zoom: mouse wheel

   The sanctuary camera now supports lower/default/higher elevation and
   `-45°..+45°` yaw through a view-aware 2D projection. Camera-correct movement
   and direction-key selection are implemented; configured atlases still need
   complete eight-direction dragon art before final visual acceptance.
2. **Rider Vault** — select one of three demo wyverns, preview the six currently
   exposed animation states, inspect live frame/texture diagnostics, and tune display
   height, flight lift, shadow opacity, and playback rate. Embertooth uses its
   real atlas; the other profiles demonstrate the fallback pipeline.
3. Click World Atlas and choose a destination — the **isometric mission** loads: a diamond-grid map with raised
   tiles, and a wyvern sprite you control.
   - Move: Arrow keys / WASD
   - Attack: Space
   - Return to base: button top-right

## Layout

```
wyvern-prototype/
├── index.html              Vite entry point
├── package.json            Pinned Phaser and development commands
├── src/
│   ├── bootstrap.js        Exposes pinned npm Phaser to existing modules
│   ├── main.js             Phaser config, registers scenes
│   ├── config.js           Constants and gameplay/camera tuning
│   ├── scenes/
│   │   ├── BootScene.js     One-time setup
│   │   ├── PreloadScene.js  Asset loading + placeholder texture/anim generation
│   │   ├── BaseScene.js     Explorable sanctuary + management overlay
│   │   ├── VaultScene.js    Wyvern profile + animation showcase
│   │   └── MissionScene.js  Iso background + wyvern + depth sorting
│   ├── entities/
│   │   └── Wyvern.js        Sprite + animation state machine + controls
│   ├── systems/
│   │   ├── iso.js           grid<->screen math + depth sort
│   │   ├── roster.js        Base/roster data model
│   │   ├── sanctuaryCamera.js       Overview/follow/survey camera
│   │   ├── sanctuaryProjection.js   Rotatable sanctuary projection math
│   │   ├── sanctuaryGroundPlane.js  Projected rings/shadows/markers
│   │   ├── sanctuaryDecorArt.js     View-built exterior prop art
│   │   ├── sanctuaryMovement.js     Controlled + ambient resident movement
│   │   ├── sanctuaryInteractions.js World target registry and activation
│   │   └── wyvernAtlas.js   Pure atlas contract + validation
│   └── ui/
│       └── ui.css           Management-sim overlay styling
├── scripts/                Syntax and atlas checks
├── tests/                  Atlas, presentation, and sanctuary system tests
└── assets/
    ├── sprites/wyverns/     Wyvern art (see folder README)
    ├── tilemaps/            Tiled iso maps (see folder README)
    ├── audio/               Music + SFX
    └── ui/                  UI art
```

## Where to add things next

- **Real wyvern art** → `assets/sprites/wyverns/` (README there contains the
  asset contract, sanctuary direction requirements, exporter limits, and
  troubleshooting). Complete eight-direction Idle/Fly before directional
  sanctuary actions.
- **Directional sanctuary wyverns** → the rotatable rig and world projection
  are implemented. Follow `docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md` and the
  sprite-folder contract to land complete eight-direction Idle/Fly, then
  Attack/Guard/Special, without replacing the east fallback prematurely.
- **Real iso maps** → author in Tiled, load in `PreloadScene`, build layers in
  `MissionScene` in place of the `DEMO_MAP` loop.
- **More actions** → add a state to `WYVERN_STATES` in `config.js`, register its
  animation in `PreloadScene.createWyvernAnimations()`, trigger it in `Wyvern.js`.
- **Sim depth** (building, resources, durable schedules) → extend the stable
  interaction descriptors in `data/sanctuary.js` and back state with
  `systems/roster.js` plus the future save/load layer.
- **A second mission** → add another `POIS` entry in `data/atlas.js`; its seed
  drives the mission selected and launched by `AtlasScene`.

## Design choices baked in

- `pixelArt: true` + `roundPixels: true` keep terrain crisp. High-resolution
  painted dragons opt into linear filtering when loaded.
- Iso rendering is manual (Phaser is screen-space): Mission/Atlas/Vault tiles
  use `gridToScreen`, while Base uses the explicit sanctuary projection;
  overlap is fixed by `sortByDepth` each frame. Sanctuary yaw/elevation
  reprojects logical world data instead of rotating the finished canvas.
- Management UI is an HTML/CSS overlay, not canvas-drawn — far faster to build
  menus, rosters, and tooltips that way.
```
