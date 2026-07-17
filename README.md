# Wyvern Prototype

A Phaser 3 scaffold for a two-layer game: an **isometric-background action mission**
with **sprite wyverns**, plus a **base/roster management sim** between missions.
Runs with zero art files — placeholder textures are generated at load so the shell
is playable immediately. Swap in real art and features as you go.

## Run it

ES modules need to be served over HTTP (opening `index.html` via `file://` will
fail with a CORS error). From this folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve`, VS Code Live Server, etc.).

## What you'll see

1. **Roost** (base sim) — manage the roster and enter the Emberkeep Dragon Vault.
2. **Dragon Vault** — select one of three demo wyverns, inspect its mission
   profile, and preview idle/fly/guard/attack/hurt/death placeholders.
3. Click World Atlas and choose a destination — the **isometric mission** loads: a diamond-grid map with raised
   tiles, and a wyvern sprite you control.
   - Move: Arrow keys / WASD
   - Attack: Space
   - Return to base: button top-right

## Layout

```
wyvern-prototype/
├── index.html              Entry point; loads Phaser (CDN) + game module
├── src/
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
│   │   └── roster.js        Base/roster data model
│   └── ui/
│       └── ui.css           Management-sim overlay styling
└── assets/
    ├── sprites/wyverns/     Wyvern art (see folder README)
    ├── tilemaps/            Tiled iso maps (see folder README)
    ├── audio/               Music + SFX
    └── ui/                  UI art
```

## Where to add things next

- **Real wyvern art** → `assets/sprites/wyverns/` (README there has the exact steps).
- **Real iso maps** → author in Tiled, load in `PreloadScene`, build layers in
  `MissionScene` in place of the `DEMO_MAP` loop.
- **More actions** → add a state to `WYVERN_STATES` in `config.js`, register its
  animation in `PreloadScene.createWyvernAnimations()`, trigger it in `Wyvern.js`.
- **Sim depth** (training, building, resources) → the disabled buttons in
  `BaseScene` are the hooks; back the sim with `systems/roster.js`.
- **A second mission** → pass a different `missionId` from `BaseScene.launchMission()`.

## Design choices baked in

- `pixelArt: true` + `roundPixels: true` keep sprite pixels crisp.
- Iso rendering is manual (Phaser is screen-space): tiles placed via `gridToScreen`,
  overlap fixed by `sortByDepth` each frame. This is the standard Phaser iso pattern.
- Management UI is an HTML/CSS overlay, not canvas-drawn — far faster to build
  menus, rosters, and tooltips that way.
```
