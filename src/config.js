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
  // Residents' idle bob: pixels of travel and base duration (staggered per
  // resident so the roost doesn't bounce in lockstep).
  residentBob: { amplitude: 3, durationMs: 1150 },
  // Brazier flicker: how dim the flame dips and how fast it breathes.
  torchFlicker: { alphaTo: 0.72, durationMs: 780 },
};

// Wyvern animation state names. Keep these as the single source of truth so
// the entity, the preloader, and any AI all reference the same strings.
export const WYVERN_STATES = {
  IDLE: 'idle',
  FLY: 'fly',
  ATTACK: 'attack',
  HURT: 'hurt',
  DEATH: 'death',
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
