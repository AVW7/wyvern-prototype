// Central game constants. Tune the whole prototype from here.

export const GAME = {
  width: 1280,
  height: 720,
  backgroundColor: '#0a0d13',
};

// Isometric tile dimensions (screen-space diamond). Classic 2:1 ratio.
// When you author art in Tiled, match these to your tile image size.
export const ISO = {
  tileWidth: 64,   // full diamond width in px
  tileHeight: 32,  // full diamond height in px
  elevation: 18,   // px of sidewall per height level on a raised tile
  originX: GAME.width / 2, // where grid cell (0,0) lands on screen
  originY: 150,
};

// Procedural terrain tuning. The whole island — biomes, heights, props — is a
// pure function of `seed`: same seed always rebuilds the same world, so nothing
// needs storing. See systems/terrain.js and systems/tileArt.js.
export const TERRAIN = {
  seed: 'WYVERN-01',
  cols: 16,
  rows: 16,
  // Feature size of the biome noise. Larger = broader, smoother regions;
  // smaller = patchier. Tuned so the island reads as 3-4 regions, not confetti.
  biomeScale: 1.6,
  // Distinct baked textures per biome. More = less visible tiling, more bake
  // time and texture memory. 4 is enough to break up repeats at this map size.
  variants: 4,
  // Share of tiles that get a prop, 0-1.
  decorDensity: 0.4,
  // Tile height levels. Ground plane sits at baseHeight; the difference above
  // it becomes visible elevation. maxHeight caps the mountains.
  baseHeight: 1,
  maxHeight: 5,
  // Cells at or above this height count as blocked (impassable terrain data
  // for future pathing; movement is currently free flight).
  blockedAt: 3,
  // Max elevation levels the wyvern can climb in one step; a taller rise reads
  // as a cliff it must go around (see Wyvern terrain-aware movement).
  climbableStep: 1,
};

// The mission map is now fully procedural — see TERRAIN below and
// systems/terrain.js. To hand-author layouts later (Tiled export), have
// buildTerrain() read heights/biomes from the loaded map instead of noise;
// everything downstream only sees the per-cell descriptions it returns.

// The base/sanctuary rendered by BaseScene: two hand-authored views (see
// data/sanctuary.js) with the roster wandering them as residents. Kept fully
// separate from the mission layer — tuning here never touches missions.
export const SANCTUARY = {
  VIEWS: { OUTSIDE: 'outside', INSIDE: 'inside' },
  // Screen px kept clear around the map when fitting the camera zoom.
  cameraMargin: 30,
  // Screen px the camera shifts the map right so it clears the roster panel.
  panelBias: 120,
  // The fitted overview is the zoom-out floor. Follow and survey may zoom in
  // to this ceiling, with wheel steps matching the Atlas camera's feel.
  zoom: { max: 2.2, step: 1.12 },
  // Follow uses a gentle per-frame lerp. Camera bounds include this much
  // world-space slack, and pointer travel past dragClickSlop suppresses clicks.
  followLerp: 0.1,
  panMargin: 150,
  dragClickSlop: 6,
  // The sanctuary is still rendered as authored 2D views. Yaw and elevation
  // therefore move through a small, cacheable rig instead of pretending this
  // is a free 3D orbit. Pitch values describe the camera angle above the
  // ground plane; 30° reproduces the existing 2:1 projection exactly.
  cameraRig: {
    yaw: { min: -45, max: 45, step: 45, default: 0 },
    elevation: {
      minStep: -1,
      maxStep: 1,
      defaultStep: 0,
      pitchDeg: { '-1': 22.5, 0: 30, 1: 37.5 },
    },
    transitionMs: 280,
  },
  // Speed uses the default-view ground metric so it stays perceptually stable
  // after camera-relative input is inverted into logical grid space. Flight
  // lift remains a presentation-only offset applied to the sprite and label.
  movement: {
    speed: 145,
    flightLift: 15,
    flightResponseMs: 140,
    bobAmplitude: 2.5,
    maxDeltaMs: 50,
    // Max height levels the wyvern climbs onto in one step. Gentle hills and
    // terraces (rise <= this) are walkable and ridden up; a taller rise reads
    // as a cliff/wall it's stopped by and must go around.
    climbStep: 1,
    // Real, player-controlled flight altitude — Three.js world units above the
    // tile surface (matches grid3d.js HEIGHT_SCALE = 12, so 140 ≈ 11.6 levels).
    // While flying, E ascends and Q descends; the footprint stays flat so
    // pathing/collision/interaction are unaffected. Lift only the model, not the
    // ground shadow. See systems/sanctuaryMovement.js and systems/sanctuary3D.js.
    flight: {
      minAltitude: 0,       // rests on the terrain surface
      maxAltitude: 140,     // ceiling above the tile top
      takeoffAltitude: 42,  // seeded lift on toggling flight so takeoff reads
      climbSpeed: 90,       // world units/sec while holding ascend/descend
      settleHz: 2.5,        // how fast altitude eases to target (and lands)
    },
  },
  // Non-controlled residents make short trips around their authored home
  // spots. They never leave the same walkable mask as the controlled wyvern.
  wander: {
    radius: 54,
    speed: 18,
    pauseMinMs: 1700,
    pauseMaxMs: 4200,
  },
  interaction: {
    defaultRange: 62,
    cooldownMs: 450,
    markerScale: 1,
    promptOffset: 46,
    labelMinScale: 0.38,
    labelMaxScale: 1.15,
  },
  selectionRing: { width: 52, height: 17, alpha: 0.85 },
  // Milestone 1 (docs/SANCTUARY_3D_DRAGON_PLAN.md): the controlled roster
  // wyvern renders via a Three.js layer (src/systems/sanctuaryDragon3D.js)
  // instead of a sprite. modelUrl is the untextured test mesh; Milestone 2
  // swaps it for a rigged/animated one and adds idleClip/walkClip/crossfadeMs.
  dragon3D: {
    modelUrl: 'assets/models/dragon/drogon-sanctuary.glb',
    // Matches WYVERN_ART.sanctuaryHeight so the 3D model reads at roughly
    // the same on-screen size as the 2D residents at default zoom.
    targetHeightPx: 64,
    // Clip names as they exist in drogon-sanctuary.glb. tools/prep-drogon.mjs
    // keeps only these (plus the unused DaenerysDragon_Battle_Up flight
    // alternative) out of the source model's 52.
    clips: {
      idle: 'DaenerysDragon_Neutural_Watch',
      walk: 'DaenerysDragon_Battle_Walk',
      fly: 'DaenerysDragon_Battle_SkyMoveL',
      special: 'DaenerysDragon_Battle_Up',
      attack: 'DaenerysDragon_Battle_Up',
      dracarys: 'DaenerysDragon_Battle_Up',
    },
    crossfadeMs: 250,
    // Flight height is now real, player-controlled altitude — see
    // SANCTUARY.movement.flight (the old cosmetic flightLiftPx lift is retired).
    labelLift: 90,
    interactiveProps: {
      dummyWobbleAngle: 12,
      dummyWobbleDurationMs: 100,
      dummyWobbleRepeats: 4,
      brazierFlameRadius: 8,
      crystalPulseMs: 1200,
    },
  },
  // Tall props fade only while their projected foreground overlaps the actor.
  occlusion: { alpha: 0.28, radiusX: 38, radiusY: 74, response: 0.16 },
  // Residents' idle bob: pixels of travel and base duration (staggered per
  // resident so the roost doesn't bounce in lockstep).
  residentBob: { amplitude: 3, durationMs: 1150 },
  // Residents wander the grounds tile-by-tile, riding steps up/down and
  // turning back at cliffs/holes/edges. climbStep caps how many height levels
  // a resident will step onto in one hop (taller = a cliff it roams around).
  roam: {
    tileMoveMs: 950, // ms to cross one tile
    pauseMinMs: 700, // idle dwell between hops (randomised up to max)
    pauseMaxMs: 3200,
    climbStep: 1,
    bobSpeed: 0.005, // rad/ms of the idle bob while roaming
  },
  // Brazier flicker: how dim the flame dips and how fast it breathes.
  torchFlicker: { alphaTo: 0.72, durationMs: 780 },
};

// The world atlas: the overworld map layer (AtlasScene) and the game's mission
// select. One hand-seeded island — "The Shattered Cradle" — built by
// systems/atlasWorld.js from the region blobs in data/atlas.js. Like the
// sanctuary, tuning here never touches missions: the atlas has its own
// generator and never calls buildTerrain().
export const ATLAS = {
  seed: 'CRADLE-01',
  // The map is square and centered on the origin, so world coords run
  // -cols/2..+cols/2 — that's the space data/atlas.js POI x/y live in.
  // The island itself spans about ±30, so the grid must be comfortably wider
  // than that or the coastline gets clipped by the grid edge instead of
  // fading into open sea. 68 leaves a ~4-tile ocean ring all the way round.
  cols: 68,
  rows: 68,
  // Share of land tiles that get a prop. Lower than TERRAIN.decorDensity
  // because the atlas is ~18x the mission map's tile count.
  decorDensity: 0.28,
  variants: 4,
  // Distance past a region blob's radius where land gives way to sea. Above
  // 1.0 so blobs bleed into each other and the coastline isn't a circle.
  seaLevel: 1.12,
  // Tiles over which the open sea fades out at the grid's edge. The grid is a
  // square in world space, so it projects to a diamond on screen — without
  // this, the water's texture stops along a hard diagonal horizon and the map
  // reads as a tile grid floating in a void instead of an island in an ocean.
  seaFade: 7,
  // Camera. The atlas opens on the whole island — it's a world map, and the
  // point is to see the shape of the world at a glance. AtlasScene computes
  // that fit zoom from the island's own bounds (not the grid's — framing the
  // empty sea would shrink the world) and uses it as both the opening zoom
  // and the zoom-out floor, since there's nothing past the island worth
  // pulling back to. So only the ceiling is configured here.
  zoom: { max: 2.2, step: 1.12 },
  // Screen px kept clear around the map when fitting the camera.
  cameraMargin: 24,
  // Screen px the map shifts right so it clears the region panel. Mirrors
  // SANCTUARY.panelBias — same problem, same fix.
  panelBias: 320,
  // Pan momentum: how much of the drag velocity survives each frame, and the
  // speed below which the camera is considered stopped.
  panDamping: 0.88,
  panEpsilon: 0.01,
  // Screen px of slack around the island the camera may pan past.
  panMargin: 220,
};

// Wyvern animation state names. Keep these as the single source of truth so
// the entity, the preloader, and any AI all reference the same strings.
export const WYVERN_STATES = {
  IDLE: 'idle',
  FLY: 'fly',
  GUARD: 'guard',
  ATTACK: 'attack',
  SPECIAL: 'special',
  HURT: 'hurt',
  DEATH: 'death',
  DRACARYS: 'dracarys',
};

// Real atlas frames are authored at high resolution, while generated emoji
// placeholders are already close to their on-screen size. Scenes normalize
// them independently so swapping art does not change gameplay proportions.
export const WYVERN_ART = {
  vaultPreviewHeight: 180,
  sanctuaryHeight: 64,
  missionHeight: 72,
  placeholderPreviewScale: 1.9,
  placeholderMissionScale: 1,
  origin: { x: 0.5, y: 0.88 },
  vaultFlightLift: 38,
  missionFlightLift: 18,
  flightBobAmplitude: 2.5,
  flightLiftResponseMs: 140,
  vaultShadow: { width: 86, height: 21, alpha: 0.34 },
  vaultAura: { width: 122, height: 34, alpha: 0.14 },
  sanctuaryShadow: { width: 44, height: 11, alpha: 0.3 },
  sanctuaryAura: { width: 54, height: 16, alpha: 0.12 },
  missionShadow: { width: 46, height: 13, alpha: 0.32 },
  previewTuning: {
    height: { min: 80, max: 240, step: 2 },
    flightLift: { min: 0, max: 100, step: 1 },
    shadowAlpha: { min: 0.05, max: 0.6, step: 0.01 },
    playbackRate: { min: 0.5, max: 2, step: 0.05 },
  },
  frameRates: {
    idle: 7,
    fly: 11,
    guard: 8,
    attack: 12,
    special: 12,
    hurt: 12,
    death: 8,
  },
};

// Enemy animation state names (mirrors WYVERN_STATES, minus movement).
export const ENEMY_STATES = {
  IDLE: 'idle',
  HURT: 'hurt',
  DEATH: 'death',
};

// Placeholder sprites drawn as emoji glyphs instead of shape art, so combat
// and the roster loop can be prototyped before real dragon art lands.
export const EMOJI = {
  wyvern: '🐉',
  enemy: '👹',
};

// Combat tuning. Move to per-wyvern/per-enemy data once variety is needed.
export const COMBAT = {
  wyvernAttackDamage: 20,
  wyvernAttackRange: 48,
  enemyHp: 30,
  enemyContactDamage: 5,
  enemyContactRange: 36,
  enemyContactCooldownMs: 800,
  autoAttackCooldownMs: 700,
};

// Player-issued orders — the on-screen command bar sets one of these on the
// wyvern. Distinct from WYVERN_STATES: states are animation frames driven by
// input each tick, orders are the standing behavior mode that gates/steers
// that input. See CLAUDE.md "Wyvern orders" for the full writeup.
export const WYVERN_ORDERS = {
  GUARD: 'guard',
  SCOUT: 'scout',
  ATTACK: 'attack',
  RECON: 'recon',
  PROTECT: 'protect',
};

// Per-order behavior. speedMultiplier scales movement (0 = holds position);
// canAttack gates the manual space-bar attack; autoAttack makes MissionScene
// fire an attack at the nearest enemy in range on autoAttackCooldownMs, no
// key press needed; damageTakenMultiplier scales contact damage from
// MissionScene.handleContactDamage.
export const ORDER_EFFECTS = {
  [WYVERN_ORDERS.GUARD]: {
    speedMultiplier: 0, canAttack: true, autoAttack: true, damageTakenMultiplier: 1,
  },
  [WYVERN_ORDERS.SCOUT]: {
    speedMultiplier: 1.6, canAttack: false, autoAttack: false, damageTakenMultiplier: 1,
  },
  [WYVERN_ORDERS.ATTACK]: {
    speedMultiplier: 1, canAttack: true, autoAttack: true, damageTakenMultiplier: 1,
  },
  // Recon shares Scout's numbers for now — kept as its own order so a future
  // fog-of-war/vision system has a hook without renaming anything.
  [WYVERN_ORDERS.RECON]: {
    speedMultiplier: 1.3, canAttack: false, autoAttack: false, damageTakenMultiplier: 1,
  },
  [WYVERN_ORDERS.PROTECT]: {
    speedMultiplier: 1, canAttack: true, autoAttack: true, damageTakenMultiplier: 0.5,
  },
};

// Placeholder enemy spawn cells for the demo map. Swap for per-mission data
// once real mission/tilemap authoring lands. Spawn cells are flattened to
// ground height by the terrain builder so nothing spawns inside a mountain.
export const DEMO_ENEMY_SPAWNS = [
  { col: 4, row: 3 },
  { col: 12, row: 5 },
  { col: 6, row: 12 },
  { col: 13, row: 11 },
];
