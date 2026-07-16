// Biome palettes for the isometric background. Extracted from the
// isometric-world-builder HD prototype.
//
// Each row is pure data — tileArt.js and decorArt.js read it, nothing here
// knows about Phaser. To add a biome: add a row, list its `decor` types (they
// must exist in DECOR_DRAWERS in decorArt.js), and reference the key from
// terrain.js. Preload bakes whatever it finds here.
//
// Color roles:
//   top/light/mid/dark — the top face gradient and its surface detail
//   left/right         — the two visible sidewalls (left is the lit side)
//   soil               — the band just under the top edge on the sidewalls
//   rock               — embedded stones and rubble in the strata
//   outline            — the tile silhouette stroke
//   accent             — the brightest highlight (blades, sparks, runes)

export const BIOMES = {
  grass: {
    label: 'Grasslands',
    top: '#4f944d', light: '#8bcf70', mid: '#3f7d42', dark: '#245630',
    left: '#36533a', right: '#273e2f', soil: '#6d5536', rock: '#3d4140', outline: '#142019',
    accent: '#b7e27f', decor: ['tree', 'tree', 'rock', 'flowers', 'ruin'],
  },
  sand: {
    label: 'Shifting Sands',
    top: '#d8b96d', light: '#f4dda0', mid: '#bd9650', dark: '#886632',
    left: '#936d3b', right: '#71512f', soil: '#9b7040', rock: '#66533f', outline: '#372a1b',
    accent: '#fff0b2', decor: ['cactus', 'rock', 'bones', 'ruin'],
  },
  ice: {
    label: 'Icebound',
    top: '#88ced9', light: '#d8ffff', mid: '#5fb4c7', dark: '#327e98',
    left: '#397b94', right: '#285d76', soil: '#4f7182', rock: '#506a78', outline: '#153445',
    accent: '#f2ffff', decor: ['ice', 'rock', 'pine'],
  },
  lava: {
    label: 'Firelands',
    top: '#472326', light: '#ff913c', mid: '#872d25', dark: '#1d1217',
    left: '#322026', right: '#21151b', soil: '#522526', rock: '#21191d', outline: '#10090d',
    accent: '#ffd164', decor: ['vent', 'obsidian', 'spires'],
  },
  swamp: {
    label: 'Mercurial Marsh',
    top: '#596b3e', light: '#a0a85c', mid: '#465631', dark: '#27372a',
    left: '#31402f', right: '#223027', soil: '#5a4932', rock: '#414b3e', outline: '#101a14',
    accent: '#c2c768', decor: ['deadTree', 'reeds', 'mushroom', 'rock'],
  },
  crystal: {
    label: 'Crystal Forest',
    top: '#235d67', light: '#75f4e4', mid: '#268999', dark: '#123746',
    left: '#1d4451', right: '#12323e', soil: '#304d55', rock: '#294551', outline: '#071921',
    accent: '#c7fff7', decor: ['crystal', 'crystal', 'rock', 'spire'],
  },
  mushroom: {
    label: 'Mushroom Grove',
    top: '#675180', light: '#bf8be0', mid: '#59406e', dark: '#31263e',
    left: '#3e304d', right: '#2b2238', soil: '#51405b', rock: '#443b50', outline: '#150f1c',
    accent: '#f3c5ff', decor: ['mushroom', 'mushroom', 'glow', 'deadTree'],
  },
  void: {
    label: 'Obsidian Wastes',
    top: '#282838', light: '#71658d', mid: '#343248', dark: '#101119',
    left: '#181925', right: '#10111a', soil: '#2b2638', rock: '#1c1b26', outline: '#06070c',
    accent: '#b49aff', decor: ['obelisk', 'obsidian', 'glow', 'spires'],
  },

  // --- Sanctuary palettes (data/sanctuary.js hand-authored maps only) ---
  // Mission terrain never picks these: pickBiome() in terrain.js can't return
  // them, so they exist purely for the base's exterior island and vault
  // interior. Exterior trio is the Krog "Mossy Monolith" palette; interior
  // rows come from the Emberkeep Dragonvault design (ember pools reuse lava).
  moss: {
    label: 'Mossy Grass',
    top: '#49b528', light: '#64f0a1', mid: '#3457bb', dark: '#2a17bd',
    left: '#425f7e', right: '#191a58', soil: '#3457bb', rock: '#191a58', outline: '#0b0b29',
    // decor list only feeds the rim fringe/roots treatment + hand-placed props
    // in sanctuary.js — moss tiles never roll random decor.
    accent: '#ffbf3f', decor: ['tree', 'flowers', 'rock'],
  },
  bluestone: {
    label: 'Blue Stone',
    top: '#191a58', light: '#3457bb', mid: '#2a17bd', dark: '#0b0b29',
    left: '#3457bb', right: '#191a58', soil: '#2a17bd', rock: '#191a58', outline: '#0b0b29',
    accent: '#49b528', decor: [],
  },
  springwater: {
    label: 'Spring Water',
    top: '#3457bb', light: '#64f0a1', mid: '#2a17bd', dark: '#191a58',
    left: '#2a17bd', right: '#191a58', soil: '#191a58', rock: '#191a58', outline: '#0b0b29',
    accent: '#64f0a1', decor: [],
  },
  flagstone: {
    label: 'Flagstone Floor',
    top: '#59636a', light: '#9b9b8f', mid: '#46515a', dark: '#28333d',
    left: '#3c4852', right: '#252f39', soil: '#46515a', rock: '#26313a', outline: '#141c24',
    accent: '#c7bca3', decor: [],
  },
  masonry: {
    label: 'Pale Masonry',
    top: '#8d918d', light: '#d3c9b3', mid: '#69747b', dark: '#35434e',
    left: '#4b5964', right: '#2a3742', soil: '#56636c', rock: '#2b3741', outline: '#151e26',
    accent: '#eee1c6', decor: [],
  },
  warmstone: {
    label: 'Warm Stone',
    top: '#83796b', light: '#c5b69b', mid: '#6f6257', dark: '#443a35',
    left: '#62564e', right: '#3d3431', soil: '#66584e', rock: '#3b3432', outline: '#211a19',
    accent: '#e9c486', decor: [],
  },
  timber: {
    label: 'Dark Timber',
    top: '#895236', light: '#c98154', mid: '#75422e', dark: '#382722',
    left: '#69402e', right: '#3b2925', soil: '#68402e', rock: '#302523', outline: '#1b1211',
    accent: '#e0a06a', decor: [],
  },
  iron: {
    label: 'Ironwork',
    top: '#343e46', light: '#75828a', mid: '#2a343c', dark: '#151d24',
    left: '#29343c', right: '#151d24', soil: '#263039', rock: '#11171d', outline: '#090d11',
    accent: '#a8b0b4', decor: [],
  },
};

export const BIOME_KEYS = Object.keys(BIOMES);
