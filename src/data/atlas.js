// The Shattered Cradle — the world atlas's hand-authored data. Pure data, the
// same way data/biomes.js and data/sanctuary.js are: nothing here knows about
// Phaser or about drawing. systems/atlasWorld.js turns REGION_BLOBS into
// terrain; AtlasScene places POIS on top of it and ui/atlasPanel.js renders
// REGIONS/POIS as the overlay.
//
// Coordinates are world-space and centered: x/y run ±ATLAS.cols/2 (so roughly
// -34..+34 on the default 68x68 grid). atlasWorld/AtlasScene convert them to
// grid cells. Note these are GRID axes, not compass directions — the map is
// drawn isometrically, so see the note above REGION_BLOBS before placing
// anything by eye.
//
// To add a region: add a REGIONS row and at least one REGION_BLOBS seed
// pointing at its id. To add a mission destination: add a POIS row — its
// `kind` must be a key in DECOR_DRAWERS (systems/decorArt.js) and its `seed`
// is what makes its mission a distinct island.

// `biome` must be a key in data/biomes.js. `explored` and each POI's
// `discovered` are static for now — the atlas has no persistence yet. Wiring
// them to real progress is ROADMAP Phase 4 (save/load); when that lands, read
// this shape from localStorage instead of hardcoding it and nothing
// downstream needs to change.
export const REGIONS = [
  {
    id: 0,
    name: 'Mesa Badlands',
    biome: 'badlands',
    type: 'ARID • MESA',
    color: '#c46a2f',
    accent: '#8a3a2a',
    explored: 62,
    description: 'Wind-carved citadels and rust stone bridges. Villages perch on sheer cliffs.',
  },
  {
    id: 1,
    name: 'Desert Dunes',
    biome: 'sand',
    type: 'DESERT • DUNES',
    color: '#e6d8a0',
    accent: '#b8a67a',
    explored: 48,
    description: 'Pale seas of sand with topographic ripples. Ancient caravan lines.',
  },
  {
    id: 2,
    name: 'Central Grasslands',
    biome: 'grass',
    type: 'GRASS • PLAINS',
    color: '#4d8a4a',
    accent: '#6fb56d',
    explored: 84,
    description: 'Fertile heart of the cradle. White tower watches over grazing lands.',
  },
  {
    id: 3,
    name: 'Taiga Highlands',
    biome: 'taiga',
    type: 'TAIGA • HIGHLAND',
    color: '#2f4a3a',
    accent: '#3f5d4a',
    explored: 35,
    description: 'Conifer ridges bridging snow and grass. Mist and outpost smoke.',
  },
  {
    id: 4,
    name: 'Frostpeaks',
    biome: 'snow',
    type: 'SNOW • PEAKS',
    color: '#e8f4ff',
    accent: '#a8c0d8',
    explored: 28,
    description: 'High altitude white wastes. Snow villages tucked in the lee.',
  },
  {
    id: 5,
    name: 'Darkwood',
    biome: 'darkwood',
    type: 'DARKWOOD • DEEP',
    color: '#1e4d2b',
    accent: '#2a6b3d',
    explored: 55,
    description: 'Old growth that drinks light. Canopy so dense maps fail.',
  },
  {
    id: 6,
    name: 'Jungle Expanse',
    biome: 'jungle',
    type: 'JUNGLE • ATOLL',
    color: '#1a5c2a',
    accent: '#2e7a3a',
    explored: 41,
    description: 'Humid green labyrinth in the south-east. Tidal sanctum submerged south.',
  },
];

// The landmass is the union of these blobs: every cell takes the biome of the
// nearest one (scaled by its radius), and anything too far from all of them is
// sea. Moving a blob reshapes the coastline — this is the whole island's
// silhouette in eight rows.
//
// Positioning these is not intuitive, because x/y are GRID axes but the map is
// drawn isometrically, so a blob's compass position on screen is a 45° turn
// from its coordinates. Work in screen terms and convert:
//
//   sx = screen-right, sy = screen-down   ->   x = (sx + sy) / 2
//                                              y = (sy - sx) / 2
//
// (Screen x is drawn at 32px per unit and screen y at 16px, so sy has to be
// about twice sx to look like the same distance.) The layout below places each
// region at the compass point the world map shows it at: taiga north, badlands
// north-west, desert west, grass centre, snow north-east, darkwood east,
// jungle south-east, atoll due south.
//
// Absolute distance from the origin barely matters — AtlasScene fits the
// camera to the island's own bounds, so a compact island just renders at a
// higher zoom. What matters is that each blob stays inside the grid: a blob
// reaches r * ATLAS.seaLevel past its centre, and beyond ±ATLAS.cols/2 the
// coastline gets clipped by the grid instead of fading into open sea.
export const REGION_BLOBS = [
  { x: -17, y: 3, r: 8, biome: 'badlands', regionId: 0 }, // NW
  { x: -9, y: 15, r: 10, biome: 'sand', regionId: 1 }, // W
  { x: 0, y: 0, r: 14, biome: 'grass', regionId: 2 }, // centre
  { x: -12, y: -12, r: 9, biome: 'taiga', regionId: 3 }, // N
  { x: 3, y: -17, r: 12, biome: 'snow', regionId: 4 }, // NE
  { x: 13, y: -11, r: 10, biome: 'darkwood', regionId: 5 }, // E
  { x: 18, y: 4, r: 11, biome: 'jungle', regionId: 6 }, // SE
  { x: 15, y: 15, r: 9, biome: 'atoll', regionId: 6 }, // S
];

// The sunken atoll in the south: its own feature rather than a plain blob,
// because it's a ring (reef shelf with a lagoon inside) not a disc. Kept here
// beside the blob it shadows — the two must stay on the same spot.
// `innerT`/`outerT` are fractions of `r`: the reef sits between them.
export const ATOLL_RING = {
  x: 15, y: 15, r: 9, innerT: 0.55, outerT: 0.88,
};

// Every POI is a mission destination. `kind` selects the marker art from
// DECOR_DRAWERS; `danger` (1-5) is display-only until enemy scaling lands
// (ROADMAP Phase 2, "More enemy variety"); `seed` is handed to MissionScene,
// which passes it to buildTerrain() — that's what makes each destination its
// own island rather than the same map with a different label.
export const POIS = [
  {
    id: 'spire',
    name: 'White Spire',
    x: 0,
    y: -3,
    regionId: 2,
    kind: 'whiteSpire',
    danger: 1,
    seed: 'CRADLE-SPIRE',
    lore: 'A lone alabaster tower, pre-collapse beacon. Still hums on clear nights.',
    discovered: true,
  },
  {
    id: 'arena',
    name: 'Old Arena',
    x: 3,
    y: 2,
    regionId: 2,
    kind: 'arena',
    danger: 2,
    seed: 'CRADLE-ARENA',
    lore: 'Grass has retaken the fighting pits. Echoes of crowds in wind.',
    discovered: true,
  },
  {
    id: 'citadel_a',
    name: 'Mesa Citadel Alpha',
    x: -17,
    y: 3,
    regionId: 0,
    kind: 'citadel',
    danger: 3,
    seed: 'CRADLE-CIT-A',
    lore: 'Westernmost bastion, linked by rope bridges. Rust-orange walls.',
    discovered: true,
  },
  {
    id: 'citadel_b',
    name: 'Mesa Citadel Beta',
    x: -19,
    y: 2,
    regionId: 0,
    kind: 'citadel',
    danger: 3,
    seed: 'CRADLE-CIT-B',
    lore: 'Twin of Alpha. Market carved inside the butte.',
    discovered: true,
  },
  {
    id: 'citadel_c',
    name: 'Mesa Citadel Gamma',
    x: -15,
    y: 5,
    regionId: 0,
    kind: 'citadel',
    danger: 2,
    seed: 'CRADLE-CIT-C',
    lore: 'Lower terrace, stair town.',
    discovered: false,
  },
  {
    id: 'citadel_d',
    name: 'Mesa Citadel Delta',
    x: -18,
    y: 6,
    regionId: 0,
    kind: 'citadel',
    danger: 2,
    seed: 'CRADLE-CIT-D',
    lore: 'Bridge hub connecting the four.',
    discovered: true,
  },
  {
    id: 'pyramid',
    name: 'Desert Pyramid',
    x: -9,
    y: 16,
    regionId: 1,
    kind: 'pyramid',
    danger: 4,
    seed: 'CRADLE-PYRAMID',
    lore: 'Half-buried sandstone. Dune contours spiral inward.',
    discovered: true,
  },
  {
    id: 'cherry',
    name: 'Cherry Islet',
    x: 21,
    y: 15,
    regionId: 6,
    kind: 'cherry',
    danger: 1,
    seed: 'CRADLE-CHERRY',
    lore: 'Solitary pink canopy on southern rock. Pilgrimage marker.',
    discovered: true,
  },
  {
    id: 'sanctum',
    name: 'Tidal Sanctum',
    x: 15,
    y: 15,
    regionId: 6,
    kind: 'sanctum',
    danger: 5,
    seed: 'CRADLE-SANCTUM',
    lore: 'Sunken atoll temple, coral-speckled blue. Visible only at low tide.',
    discovered: false,
  },
  {
    id: 'jungle_heart',
    name: 'Jungle Heart',
    x: 18,
    y: 4,
    regionId: 6,
    kind: 'jungleRuin',
    danger: 4,
    seed: 'CRADLE-JUNGLE',
    lore: 'Vine-choked pyramid in deep green. Heat and insects.',
    discovered: true,
  },
  {
    id: 'outpost_n',
    name: 'Northwatch Outpost',
    x: -12,
    y: -12,
    regionId: 3,
    kind: 'outpost',
    danger: 2,
    seed: 'CRADLE-NORTHWATCH',
    lore: 'Timber outpost on the taiga edge. Sees the frostpeaks.',
    discovered: true,
  },
  {
    id: 'frost',
    name: 'Frosthold',
    x: 3,
    y: -17,
    regionId: 4,
    kind: 'frosthold',
    danger: 3,
    seed: 'CRADLE-FROSTHOLD',
    lore: 'Snow village in the white lee. Smoke means life.',
    discovered: true,
  },
];

export function getRegion(id) {
  return REGIONS.find((r) => r.id === id);
}

export function getPoi(id) {
  return POIS.find((p) => p.id === id);
}
