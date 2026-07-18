# Wyvern Prototype

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
| `npm test` | Run the pure atlas-contract tests |
| `npm run build` | Create the static production build, including runtime assets, in `dist/` |
| `npm run check` | Syntax, atlas validation, tests, and production build |

## What you'll see

1. **Roost** (base sim) — manage the roster and enter the Emberkeep Dragon Vault.
2. **Dragon Vault** — select one of three demo wyverns, preview the six currently
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
│   ├── config.js           Constants: canvas, iso tile size, demo map, state names
│   ├── scenes/
│   │   ├── BootScene.js     One-time setup
│   │   ├── PreloadScene.js  Asset loading + placeholder texture/anim generation
│   │   ├── BaseScene.js     Management sim (HTML/CSS overlay)
│   │   ├── VaultScene.js    Wyvern profile + animation showcase
│   │   └── MissionScene.js  Iso background + wyvern + depth sorting
│   ├── entities/
│   │   └── Wyvern.js        Sprite + animation state machine + controls
│   ├── systems/
│   │   ├── iso.js           grid<->screen math + depth sort
│   │   ├── roster.js        Base/roster data model
│   │   └── wyvernAtlas.js   Pure atlas contract + validation
│   └── ui/
│       └── ui.css           Management-sim overlay styling
├── scripts/                Syntax and atlas checks
├── tests/                  Atlas-contract tests
└── assets/
    ├── sprites/wyverns/     Wyvern art (see folder README)
    ├── tilemaps/            Tiled iso maps (see folder README)
    ├── audio/               Music + SFX
    └── ui/                  UI art
```

## Where to add things next

- **Real wyvern art** → `assets/sprites/wyverns/` (README there contains the
  asset contract, exporter requirements, memory limits, and troubleshooting).
- **Real iso maps** → author in Tiled, load in `PreloadScene`, build layers in
  `MissionScene` in place of the `DEMO_MAP` loop.
- **More actions** → add a state to `WYVERN_STATES` in `config.js`, register its
  animation in `PreloadScene.createWyvernAnimations()`, trigger it in `Wyvern.js`.
- **Sim depth** (training, building, resources) → the disabled buttons in
  `BaseScene` are the hooks; back the sim with `systems/roster.js`.
- **A second mission** → pass a different `missionId` from `BaseScene.launchMission()`.

## Design choices baked in

- `pixelArt: true` + `roundPixels: true` keep terrain crisp. High-resolution
  painted dragons opt into linear filtering when loaded.
- Iso rendering is manual (Phaser is screen-space): tiles placed via `gridToScreen`,
  overlap fixed by `sortByDepth` each frame. This is the standard Phaser iso pattern.
- Management UI is an HTML/CSS overlay, not canvas-drawn — far faster to build
  menus, rosters, and tooltips that way.
```
