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
  zoom: { max: 3.6, step: 1.12 },
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
    // Screen-pixel radius the actor collides with, against a 64px-wide tile
    // diamond. Measured in Blender, the walking model's folded body is 28.9
    // world units across (1.2 tiles) and its feet 8.7 (0.36 tiles); this sits
    // between them, at roughly the torso half-width. The default was 3 — a
    // point — which is why the body used to end up overlapping walls and props
    // it had never collided with. Raising it further would stop the wyvern
    // fitting down a one-tile corridor.
    collisionRadius: 22,
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
    // Motion slot → clip name as it exists in drogon-sanctuary.glb.
    // Clips named Fly_* do not exist in the source: tools/blender-flight-clips.py
    // derives them from it (see that file's header), and tools/prep-drogon.mjs
    // then keeps exactly the 17 source clips plus those 8. Its KEEP list and
    // this table must be changed together. systems/dragonMotion.js decides which
    // slot is active; the debug panel can rebind any slot live.
    clips: {
      idle: 'DaenerysDragon_Neutural_Watch',
      idleBreak: 'DaenerysDragon_Neutural_Roar',
      alert: 'AA_DaenerysDragon_Battle_Stand',
      walk: 'DaenerysDragon_Battle_Walk',
      walkLeft: 'DaenerysDragon_Battle_WalkL',
      walkRight: 'DaenerysDragon_Battle_WalkR',
      turnLeftSmall: 'DaenerysDragon_Battle_TurnL20',
      turnRightSmall: 'DaenerysDragon_Battle_TurnR20',
      turnLeft: 'DaenerysDragon_Battle_TurnL90',
      turnRight: 'DaenerysDragon_Battle_TurnR90',
      // Battle_Up ran 8.2 s, and Battle_Down was a descent *loop* — it began and
      // ended in the flight pose, so bound as `land` it never actually put the
      // dragon down. Both are retimed and resolved onto the pose the clip they
      // hand off to starts from.
      takeoff: 'Fly_Takeoff',
      land: 'Fly_Land',
      // Level flight is now a clip. It used to be a 0.42 cross-weight of the two
      // banked sky moves, on the theory that opposing banks cancel; measured on
      // the posed rig they do not — that mix sits 5.2° left and rocks through
      // 16° a beat. Fly_Level_Loop holds -0.6° across the whole cycle at the
      // same 70° wing swing, and the banks are its ±27° siblings.
      fly: 'Fly_Level_Loop',
      flyHover: 'Fly_Level_Loop',
      flyGlide: 'Fly_Glide_Loop',
      bankLeft: 'Fly_BankL_Loop',
      bankRight: 'Fly_BankR_Loop',
      attack: 'DaenerysDragon_Battle_Attack04',
      attackAlt: 'DaenerysDragon_Battle_Attack01',
      dracarys: 'DaenerysDragon_Battle_Skill08',
      // The airborne breath. Skill08 is the source's only fire clip and it is
      // grounded — feet keyed to the floor — so only its neck/head gesture is
      // layered over the level cycle, and the flame stays the particle effect
      // createDracarysParticles() already spawns.
      flyDracarys: 'Fly_Dracarys',
      special: 'DaenerysDragon_Neutural_Roar',
      // Wings held out, with a slow breathe so it does not read as a freeze;
      // the hold frame is the widest-reach frame of the cycle. Scouting is this
      // at altitude — it was a duplicate sky clip until 2026-07-21 and then a
      // blend preset; it is a clip again, and a real one this time.
      glide: 'Fly_Glide_Loop',
      scout: 'Fly_Glide_Loop',
      // Airborne and stationary used to play the cruise, which read as coasting
      // on nothing. Slower, deeper stroke, body leaned toward Battle_Up's climb
      // posture.
      hover: 'Fly_Hover_Loop',
      // Airborne strike passes. Identified by measuring foot-drop relative to
      // the pelvis across all 52 source clips: these sit in the same 570-660
      // band as SkyMove/Up/Down, and nowhere near the grounded attacks.
      flyAttackLeft: 'DaenerysDragon_Battle_Skill10_L',
      flyAttackRight: 'DaenerysDragon_Battle_Skill10_R',
      // Full about-face. turnLeft/turnRight are 90° clips and read badly when
      // the wyvern is asked to reverse.
      turnLeftAbout: 'DaenerysDragon_Battle_TurnL180',
      turnRightAbout: 'DaenerysDragon_Battle_TurnR180',
    },
    // Clips that play once and hand back to whatever motion was underneath,
    // instead of looping. Everything not listed here is a looping base motion.
    oneShotClips: [
      'turnLeft', 'turnRight', 'turnLeftSmall', 'turnRightSmall',
      'turnLeftAbout', 'turnRightAbout',
      'takeoff', 'land', 'attack', 'attackAlt', 'dracarys', 'special', 'idleBreak',
      'flyAttackLeft', 'flyAttackRight', 'flyDracarys',
    ],
    // How the model is steered. See systems/dragonMotion.js — this block is
    // that module's entire configuration, and every value is live-tunable from
    // the debug panel.
    motion: {
      // Degrees/sec the body may rotate. Below this the dragon snaps like a
      // sprite; far above it and it feels weightless.
      maxYawRateDeg: 150,
      // Heading error (deg) that makes a standing dragon play a turn clip
      // instead of just rotating. The small/large clips split at turnClipBigDeg.
      turnClipThresholdDeg: 35,
      turnClipBigDeg: 70,
      // World units/sec the walk cycle covers at timeScale 1. The walk clip's
      // playback rate is scaled by (actual speed / this) so the feet track the
      // ground instead of sliding. Tune by eye at SANCTUARY.movement.speed.
      walkClipSpeed: 96,
      walkTimeScale: { min: 0.55, max: 1.9 },
      // Yaw rate (deg/sec) at which the turning-walk clips fully replace the
      // straight walk, and the roll a full-rate air turn leans into.
      walkTurnRateDeg: 55,
      // Airborne turning is its own regime — a flying dragon carries momentum
      // through a far wider arc than one pivoting on its feet, so "hard over"
      // is a higher yaw rate in the air than on the ground.
      flightTurnRateDeg: 90,
      // How fast the lean into a turn builds and relaxes. Lower reads heavier.
      bankBlendResponseHz: 2.2,
      bankMaxDeg: 32,
      // Rig roll *on top of* the banked clips, so this is deliberately small —
      // past ~0.2 the model reads as pivoting inside its own animation.
      bankGain: 0.16,
      bankResponseHz: 3.2,
      // Nose up/down from vertical speed, and how hard altitude change drives it.
      pitchMaxDeg: 18,
      pitchGain: 0.22,
      pitchResponseHz: 2.6,
      // The imported rig's neutral airborne pose has a visible nose-down
      // attitude. Apply a small authored correction only while hovering so a
      // stopped wyvern holds level above its shadow rather than appearing to
      // dive at the ground.
      hoverPitchDeg: 12,
      // Altitude (world units) the climb has to pass before takeoff is
      // considered done, and below which landing commits.
      takeoffAltitude: 24,
      landAltitude: 6,
      // Seconds of unbroken idle before an idle-break clip may play, and the
      // per-second chance it does once eligible.
      idleBreakAfterSec: 14,
      idleBreakChance: 0.12,
    },
    // Ground contact. See systems/terrainHeightField.js — the model's Y comes
    // from a bilinear sample of a dilated height grid, not from the one cell
    // its centre rounds to.
    ground: {
      // How fast the model rides onto a new ground height, and the only thing
      // absorbing the step at a terrace edge — the surface there is genuinely
      // discontinuous, so it is travelled over time rather than smoothed away.
      // 9 settles a full level in about 100ms. Lower reads heavier; too low and
      // the feet lag visibly behind the ground on a staircase.
      settleHz: 9,
      // Height levels per tile of slope at which the body reaches its full
      // pitch. Walking up a one-level-per-tile ramp at gain 1 gives the whole
      // pitchMaxDeg, which is too much, so this is deliberately shallow.
      slopePitchGain: 0.45,
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
  // How the Three.js voxel diorama is shaded. Layout still comes from
  // data/sanctuary.js and colour still comes from data/biomes.js — this only
  // governs how those are turned into surfaces. See systems/sanctuary3D.js and
  // systems/tileTexture3D.js; every value is live-tunable from the debug panel.
  terrain3D: {
    // Filmic tone mapping. Without it the emissive lava and the lit tops clip
    // to flat white and the whole diorama reads as untextured plastic.
    exposure: 1.05,
    // Per-tile variation baked into the instance colours at build time (free at
    // runtime). jitter breaks up the flat biome sheet; ao darkens a tile for
    // each taller neighbour so height reads without a real AO pass.
    colorJitter: 0.13,
    aoStrength: 0.45,
    // Extra world units the island's boundary tiles extend downward, so the
    // silhouette reads as a monolith instead of a 12-unit crust over nothing.
    skirtDepth: 96,
    // Procedural face textures. size is per-face canvas px; grain/strata are
    // the top speckle and sidewall banding contrast.
    texture: { size: 64, grain: 0.14, strata: 0.2 },
    // Distance haze. `color` must match the Phaser backdrop showing through the
    // transparent Three canvas, or the horizon bands where they meet.
    fog: { enabled: true, color: '#0f141d', near: 620, far: 1750 },
    // Lagoon surface: scroll rates (uv/sec) of the two offset normal maps and
    // how far the surface sits above the tile top.
    water: { scrollX: 0.035, scrollY: 0.021, lift: 0.6, opacity: 0.82, roughness: 0.08 },
    // Lava crust glow: emissive floor/ceiling, how fast the noise breathes, and
    // the point light dropped over each authored lava field.
    lava: { emissiveMin: 0.75, emissiveMax: 2.3, breatheHz: 0.45, lightIntensity: 2.4, lightRange: 300 },
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
