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
      decor: null,
    };
  };
  const fill = (c0, r0, c1, r1, height, biome = defaultBiome) => {
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) setTile(col, row, height, biome);
    }
  };
  // Props sit at the tile's center (the designs place interior objects
  // centered; exterior decor gets a hand-tuned nudge via offsetX/offsetY).
  const setProp = (col, row, type, offsetX = 0, offsetY = 0) => {
    const cell = tiles[row]?.[col];
    if (!cell) return;
    cell.decor = {
      type, variant: Math.floor(hash2(col, row, 6210) * TERRAIN.variants), offsetX, offsetY,
    };
  };

  return { tiles, setTile, fill, setProp };
}

// The Mossy Monolith island. All terrain is `moss` — the Krog palette's blue
// sidewalls make cliffs read as stone while tops stay green, exactly like the
// source design (which built everything from its "grass" material).
export function buildSanctuaryExterior() {
  const size = 24;
  const b = makeBuilder('SANCTUARY-EXTERIOR', size, 'moss');

  // Enlarged, irregular one-tile meadow footprint with cut corners.
  for (let y = 5; y <= 21; y++) {
    for (let x = 1; x <= 21; x++) {
      const cut = (x < 4 && y < 9) || (x > 18 && y < 7)
        || (x < 2 && y > 16) || (x > 20 && y > 16)
        || (x === 21 && (y === 11 || y === 14));
      if (!cut) b.setTile(x, y, 1);
    }
  }
  [
    [0, 11], [0, 12], [1, 8], [2, 22], [4, 22], [7, 22], [10, 22], [13, 22],
    [17, 22], [20, 15], [21, 8], [22, 9], [22, 12], [21, 19], [19, 21],
  ].forEach(([x, y]) => b.setTile(x, y, 1));

  // Broad central massif with staggered terraces.
  b.fill(3, 8, 7, 13, 4);
  b.fill(5, 6, 10, 9, 4);
  b.fill(8, 8, 13, 13, 4);
  b.setTile(6, 14, 3);
  b.setTile(7, 14, 3);
  b.setTile(11, 7, 3);
  b.setTile(12, 7, 3);
  b.setTile(13, 10, 5);

  // Tall monolith with a broken shoulder and small projecting shelf.
  b.fill(4, 3, 6, 5, 9);
  b.setTile(6, 4, 8);
  b.setTile(6, 5, 7);
  b.setTile(7, 4, 6);
  b.setTile(7, 5, 6);
  b.setTile(7, 3, 5);
  b.setTile(8, 4, 5);
  // The signature shadowed niche on the monolith's exposed face.
  b.tiles[4][6].overlay = 'monolithNiche';

  // Varied right-side outcrops and a stepped watch block.
  b.fill(14, 7, 19, 10, 2);
  b.fill(16, 10, 19, 13, 3);
  b.fill(17, 11, 18, 12, 4);
  b.setTile(15, 6, 2);
  b.setTile(16, 6, 2);
  b.setTile(20, 9, 2);
  b.setTile(20, 12, 3);
  b.setTile(21, 12, 2);

  // Left shelf and forward stair blocks for a more varied silhouette.
  b.fill(1, 12, 4, 16, 2);
  b.fill(2, 11, 4, 13, 3);
  b.setTile(1, 15, 3);
  b.setTile(3, 17, 2);
  b.setTile(4, 17, 2);
  b.fill(12, 16, 17, 19, 2);
  b.fill(14, 17, 16, 18, 3);
  b.setTile(13, 15, 3);
  b.setTile(17, 16, 3);
  b.setTile(18, 18, 2);

  // Recessed square spring in the foreground: stone basin, water heart.
  b.fill(7, 16, 11, 19, 1, 'bluestone');
  b.fill(8, 17, 10, 18, 1, 'springwater');

  // The vault entrance: a barred gate set against the massif's front cliff.
  // BaseScene finds it by type and makes it clickable — walking through it
  // (a click) switches to VaultScene.
  b.setProp(10, 14, 'barredDoor', 0, -4);

  // Hand-placed grounds decor (our addition — the source design left the
  // meadow bare and relied on painting). Kept clear of RESIDENT_SPOTS.
  b.setProp(2, 18, 'tree', -4, 2);
  b.setProp(16, 21, 'tree', 5, -2);
  b.setProp(20, 17, 'tree', 0, 3);
  b.setProp(10, 15, 'flowers', 6, -3);
  b.setProp(13, 20, 'flowers', -5, 2);
  b.setProp(5, 19, 'flowers', 3, 4);
  b.setProp(18, 14, 'rock', -3, -2);
  b.setProp(4, 6, 'crystal', 2, 0);
  b.setProp(6, 18, 'glow', -4, -2);

  return { tiles: b.tiles, cols: size, rows: size };
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

  return { tiles: b.tiles, cols: size, rows: size };
}

// Where roster residents stand in each view. BaseScene walks this list in
// roster order and wraps with a small offset if the roost outgrows it. Cells
// are flat, prop-free ground in their map.
export const RESIDENT_SPOTS = {
  outside: [
    { col: 13, row: 14 }, { col: 15, row: 15 }, { col: 5, row: 15 },
    { col: 9, row: 21 }, { col: 17, row: 20 }, { col: 12, row: 15 },
  ],
  inside: [
    { col: 9, row: 16 }, { col: 12, row: 12 }, { col: 6, row: 17 },
    { col: 14, row: 17 }, { col: 7, row: 12 }, { col: 11, row: 18 },
  ],
};

// The Dragon Vault showcases one selected profile on this clear central cell.
// Keeping the spot beside the authored map data makes moving the display dais
// a one-line change when the interior layout is revised.
export const VAULT_PREVIEW_SPOT = { col: 12, row: 12 };
