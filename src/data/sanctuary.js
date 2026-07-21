// Hand-authored sanctuary maps: the exterior island ("Mossy Monolith") and
// the vault interior ("Emberkeep Dragonvault"), ported coordinate-for-
// coordinate from the two design prototypes in "iso designs/".
//
// Both builders return the same { tiles, cols, rows } contract as
// systems/terrain.js, with one addition: cells can be null (holes — the
// island's silhouette against the void) and can carry an `overlay` (a one-off
// baked detail, see TILE_OVERLAYS in tileArt.js). BaseScene renders these
// through the same systems/isoRender.js path missions use.
import { TERRAIN } from '../config.js';
import { createNoise } from '../systems/noise.js';

// Stable gameplay descriptors stay separate from decorative cell data so the
// Vault and any future sanctuary renderer can consume the map without knowing
// BaseScene's actions. Prop-backed targets identify the authored prop they
// decorate; area targets (the spring) use their grid footprint directly.
export const INTERACTIONS = {
  outside: [
    {
      id: 'vault-gate', type: 'gate', propType: 'barredDoor', col: 14, row: 10,
      label: 'Enter the Rider Vault', action: 'vault', range: 78, once: false,
    },
    {
      id: 'spring-main', type: 'spring', col: 41, row: 43,
      label: 'Drink from the spring', action: 'restore', range: 68, once: false,
    },
    {
      id: 'training-ring', type: 'training', propType: 'arena', col: 50, row: 28,
      label: 'Train here', action: 'train', range: 70, once: false,
    },
    {
      id: 'feeding-nest', type: 'nest', propType: 'nest', col: 10, row: 48,
      label: 'Share a meal', action: 'feed', range: 68, once: false,
    },
    {
      id: 'atlas-waystone', type: 'atlas', propType: 'obelisk', col: 48, row: 18,
      label: 'Consult the world waystone', action: 'atlas', range: 72,
      once: false, confirm: true,
    },
    {
      id: 'training-dummy', type: 'dummy', propType: 'dummy', col: 14, row: 14,
      label: 'Strike the training dummy', action: 'strikeDummy', range: 68, once: false,
    },
    {
      id: 'brazier-1', type: 'brazier', propType: 'unlitBrazier', col: 38, row: 10,
      label: 'Light the brazier', action: 'lightBrazier', range: 68, once: false,
    },
    {
      id: 'brazier-2', type: 'brazier', propType: 'unlitBrazier', col: 50, row: 10,
      label: 'Light the brazier', action: 'lightBrazier', range: 68, once: false,
    },
    {
      id: 'brazier-3', type: 'brazier', propType: 'unlitBrazier', col: 56, row: 18,
      label: 'Light the brazier', action: 'lightBrazier', range: 68, once: false,
    },
    {
      id: 'lagoon-crystal', type: 'crystal', propType: 'crystal', col: 38, row: 37,
      label: 'Resonate with the crystal', action: 'resonateCrystal', range: 68, once: false,
    },
  ],
  inside: [],
};

// Shared setTile/fill/setProp helpers in the design files' authoring idiom,
// so layouts below read like the originals. (col, row) order matches the
// designs' (x, y) — both index tiles[row][col].
function makeBuilder(seed, size, defaultBiome) {
  const { hash2 } = createNoise(seed);
  const tiles = Array.from({ length: size }, () => Array(size).fill(null));

  const setTile = (col, row, height, biome = defaultBiome) => {
    if (row < 0 || row >= size || col < 0 || col >= size) return;
    tiles[row][col] = {
      biome,
      height,
      variant: Math.floor(hash2(col, row, 1300) * TERRAIN.variants),
      blocked: height >= TERRAIN.blockedAt,
      walkable: true,
      decor: null,
    };
  };
  const fill = (c0, r0, c1, r1, height, biome = defaultBiome) => {
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) setTile(col, row, height, biome);
    }
  };
  const setProp = (col, row, type, offsetX = 0, offsetY = 0) => {
    const cell = tiles[row]?.[col];
    if (!cell) return;
    cell.decor = {
      type, variant: Math.floor(hash2(col, row, 6210) * TERRAIN.variants), offsetX, offsetY,
    };
  };

  return { tiles, setTile, fill, setProp };
}

// The Mossy Monolith island (64x64 enlarged flight & training sanctuary).
export function buildSanctuaryExterior() {
  const size = 64;
  const b = makeBuilder('SANCTUARY-EXTERIOR', size, 'moss');

  // Build the core island shape (irregular circle with radius ~29 from center (32, 32))
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const dist = Math.sqrt((x - 32) ** 2 + (y - 32) ** 2);
      if (dist < 29.5) {
        b.setTile(x, y, 1);
      }
    }
  }

  // Zone 1: Whispering Grove (South-West)
  b.fill(4, 32, 28, 60, 1);
  for (let y = 32; y <= 60; y++) {
    for (let x = 4; x <= 28; x++) {
      if (b.tiles[y]?.[x]) {
        if (x + y > 72) b.setTile(x, y, 2);
      }
    }
  }

  // Zone 2: Bluestone Lagoon (South-East)
  b.fill(34, 36, 48, 50, 1, 'bluestone');
  b.fill(36, 38, 46, 48, 1, 'springwater');

  // Zone 3: Central Monolith Summit (Center-West)
  b.fill(16, 16, 34, 34, 2);
  b.fill(19, 19, 31, 31, 3);
  b.fill(22, 22, 28, 28, 4);
  b.fill(24, 24, 26, 26, 5);

  // High Monolith on the summit
  b.fill(17, 17, 19, 19, 6);
  b.setTile(18, 18, 7);
  if (b.tiles[18]?.[19]) b.tiles[18][19].overlay = 'monolithNiche';

  // Zone 4: Volcanic Lava Flats (North-East)
  for (let y = 2; y <= 32; y++) {
    for (let x = 36; x <= 60; x++) {
      const dist = Math.sqrt((x - 32) ** 2 + (y - 32) ** 2);
      if (dist < 29.5) {
        b.setTile(x, y, 1, 'warmstone');
      }
    }
  }
  b.fill(42, 6, 48, 12, 1, 'lava');
  b.fill(50, 18, 58, 24, 1, 'lava');

  // Zone 5: Ancient Ruins (North-West)
  b.fill(5, 5, 20, 20, 1, 'flagstone');
  for (let y = 5; y <= 20; y++) {
    for (let x = 5; x <= 20; x++) {
      if (x + y < 22) {
        b.setTile(x, y, 2, 'masonry');
      }
    }
  }

  // Vault gate entrance
  b.setTile(14, 10, 1, 'flagstone');
  b.setProp(14, 10, 'barredDoor', 0, -4);

  // Landmarks & Props:
  b.setProp(50, 28, 'arena');
  b.setProp(48, 18, 'obelisk');
  b.setProp(10, 48, 'nest');
  b.setProp(14, 14, 'dummy');

  // Unlit Braziers:
  b.setProp(38, 10, 'unlitBrazier');
  b.setProp(50, 10, 'unlitBrazier');
  b.setProp(56, 18, 'unlitBrazier');

  // Resonant Crystal:
  b.setProp(38, 37, 'crystal');

  // General decor:
  b.setProp(5, 34, 'tree', -3, 1);
  b.setProp(14, 40, 'tree', 2, -2);
  b.setProp(6, 50, 'tree', -2, 3);
  b.setProp(18, 56, 'tree', 4, 1);
  b.setProp(10, 42, 'flowers', 2, 2);
  b.setProp(20, 48, 'flowers', -3, -1);

  return {
    tiles: b.tiles, cols: size, rows: size, interactions: INTERACTIONS.outside,
  };
}

// The Emberkeep Dragonvault interior: U-shaped keep open toward the camera,
// raised gallery, twin stair runs, and an ember heart sunk into the dais.
export function buildSanctuaryInterior() {
  const size = 22;
  const b = makeBuilder('SANCTUARY-INTERIOR', size, 'flagstone');

  // Main flagstone chamber and irregular front apron.
  b.fill(2, 3, 19, 18, 1, 'flagstone');
  b.fill(4, 19, 17, 20, 1, 'warmstone');
  [
    [2, 19], [3, 19], [6, 21], [7, 21], [10, 21], [14, 21],
    [17, 19], [18, 19], [19, 17],
  ].forEach(([x, y]) => b.setTile(x, y, 1, 'flagstone'));

  // Tall U-shaped castle walls, open toward the camera.
  b.fill(3, 3, 18, 3, 6, 'masonry');
  b.fill(2, 4, 2, 16, 6, 'masonry');
  b.fill(19, 4, 19, 13, 6, 'masonry');

  // Raised gallery around the rear and sides.
  b.fill(3, 4, 18, 7, 3, 'flagstone');
  b.fill(3, 8, 6, 14, 3, 'flagstone');
  b.fill(15, 8, 18, 12, 3, 'warmstone');
  b.fill(7, 8, 14, 8, 3, 'masonry');

  // Two stair runs linking the gallery and lower chamber.
  b.fill(4, 14, 6, 14, 3, 'masonry');
  b.fill(4, 15, 6, 15, 2, 'masonry');
  b.fill(4, 16, 6, 16, 1, 'masonry');
  b.fill(15, 12, 17, 12, 3, 'warmstone');
  b.fill(15, 13, 17, 13, 2, 'warmstone');
  b.fill(15, 14, 17, 14, 1, 'warmstone');

  // Lower-room dais, ember heart, central pillar bases and entry bridge.
  b.fill(10, 13, 14, 16, 1, 'warmstone');
  b.fill(11, 14, 13, 15, 1, 'lava');
  b.setTile(11, 16, 4, 'masonry');
  b.setTile(12, 16, 4, 'masonry');
  b.fill(7, 18, 10, 19, 2, 'timber');

  // Castle gates, treasure, lights, railings and furniture — placements
  // verbatim from the design (its chest at 14,15 was overwritten by the
  // hoard, so only the surviving object is placed here).
  [[5, 4], [9, 4], [13, 4], [17, 4], [3, 9], [18, 9]].forEach(([x, y]) => b.setProp(x, y, 'barredDoor'));
  [[5, 7], [17, 7]].forEach(([x, y]) => b.setProp(x, y, 'chest'));
  [[8, 12], [13, 18], [17, 15]].forEach(([x, y]) => b.setProp(x, y, 'torch'));
  [
    [7, 8], [9, 8], [11, 8], [13, 8], [6, 11], [15, 10], [8, 18], [10, 18],
  ].forEach(([x, y]) => b.setProp(x, y, 'railing'));
  b.setProp(12, 16, 'pillar');
  b.setProp(9, 14, 'table');
  b.setProp(14, 15, 'hoard');
  b.setProp(9, 13, 'dragonEgg');
  b.setProp(16, 16, 'crystalProp');
  b.setProp(8, 16, 'nest');
  b.setProp(10, 11, 'sleepingDragon');

  // Daylight spilling in over the entry bridge — the way back outside.
  // VaultScene finds this glow by type and makes it clickable.
  b.setProp(9, 19, 'glow');

  return {
    tiles: b.tiles, cols: size, rows: size, interactions: INTERACTIONS.inside,
  };
}

// Where roster residents stand in each view. BaseScene walks this list in
// roster order and wraps with a small offset if the roost outgrows it. Cells
// are flat, prop-free ground in their map.
export const RESIDENT_SPOTS = {
  outside: [
    { col: 16, row: 32 },
    { col: 12, row: 40 },
    { col: 41, row: 51 },
    { col: 48, row: 10 },
    { col: 14, row: 16 },
    { col: 24, row: 40 },
    { col: 22, row: 32 },
    { col: 8, row: 56 },
    { col: 17, row: 52 },
    { col: 32, row: 35 },
    { col: 49, row: 48 },
    { col: 38, row: 54 },
    { col: 51, row: 12 },
    { col: 43, row: 24 },
    { col: 10, row: 8 },
    { col: 6, row: 16 },
    { col: 28, row: 16 },
    { col: 32, row: 24 },
    { col: 38, row: 28 },
  ],
  inside: [
    { col: 9, row: 16 }, { col: 12, row: 12 }, { col: 6, row: 17 },
    { col: 14, row: 17 }, { col: 7, row: 12 }, { col: 11, row: 18 },
  ],
};

// The Rider Vault showcases one selected profile on this clear central cell.
// Keeping the spot beside the authored map data makes moving the display dais
// a one-line change when the interior layout is revised.
export const VAULT_PREVIEW_SPOT = { col: 12, row: 12 };
