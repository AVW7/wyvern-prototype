// Central game constants. Tune the whole prototype from here.

export const GAME = {
  width: 960,
  height: 540,
  backgroundColor: '#1a1420',
};

// Isometric tile dimensions (screen-space diamond). Classic 2:1 ratio.
// When you author art in Tiled, match these to your tile image size.
export const ISO = {
  tileWidth: 64,   // full diamond width in px
  tileHeight: 32,  // full diamond height in px
  originX: GAME.width / 2, // where grid cell (0,0) lands on screen
  originY: 120,
};

// Placeholder mission map. 0 = walkable ground, 1 = raised/blocked.
// Swap this out for a Tiled export once you have real tilemaps.
export const DEMO_MAP = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0, 1, 0, 0],
  [0, 1, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

// Wyvern animation state names. Keep these as the single source of truth so
// the entity, the preloader, and any AI all reference the same strings.
export const WYVERN_STATES = {
  IDLE: 'idle',
  FLY: 'fly',
  ATTACK: 'attack',
  HURT: 'hurt',
  DEATH: 'death',
};
