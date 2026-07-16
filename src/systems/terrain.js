// Procedural island generator: decides each cell's biome, height, and prop.
// Ported from the isometric-world-builder HD prototype's generateWorld().
//
// This is the seam between gameplay and art. The returned per-cell description
// is all MissionScene sees — to hand-author layouts later (Tiled export), read
// heights/biomes from the loaded map here instead of noise and nothing
// downstream changes.
//
// Everything is a pure function of the seed: same seed, same island.
import { ISO, TERRAIN } from '../config.js';
import { BIOMES } from '../data/biomes.js';
import { createNoise, clamp } from './noise.js';

// Classifies a cell from four independent climate layers. Order matters:
// earlier checks win, so magic overrides climate and yields rare exotic regions.
function pickBiome(fractalNoise, x, y) {
  const n = fractalNoise(x, y, 200);
  const moisture = fractalNoise(x + 90, y - 40, 500);
  const temperature = fractalNoise(x - 70, y + 120, 700);
  const magic = fractalNoise(x + 220, y + 220, 900);

  if (magic > 0.71) return magic > 0.80 ? 'void' : 'crystal';
  if (temperature < 0.34) return 'ice';
  if (temperature > 0.69 && moisture < 0.45) return n > 0.56 ? 'lava' : 'sand';
  if (moisture > 0.68) return magic > 0.55 ? 'mushroom' : 'swamp';
  if (n < 0.28) return 'sand';
  return 'grass';
}

/**
 * Builds the island.
 *
 * @param {object} [options]
 * @param {string} [options.seed]     overrides TERRAIN.seed
 * @param {number} [options.density]  overrides TERRAIN.decorDensity
 * @param {Array<{col,row}>} [options.exclude]  cells flattened to ground height
 *   and kept clear of props (spawn points, objectives)
 * @returns {{tiles: object[][], cols: number, rows: number}}
 *   tiles[row][col] = { biome, variant, height, blocked, decor } where decor is
 *   null or { type, variant, offsetX, offsetY }.
 */
export function buildTerrain(options = {}) {
  const seed = options.seed ?? TERRAIN.seed;
  const density = options.density ?? TERRAIN.decorDensity;
  const exclude = new Set((options.exclude ?? []).map(({ col, row }) => `${col},${row}`));
  const { hash2, fractalNoise } = createNoise(seed);
  const { cols, rows, baseHeight, maxHeight } = TERRAIN;

  // Island falloff: cells near the center can stack high, the rim stays low —
  // the map reads as one landmass instead of random noise columns.
  const centerCol = (cols - 1) / 2;
  const centerRow = (rows - 1) / 2;
  const maxRadius = Math.max(cols, rows) * 0.72;

  const tiles = [];
  for (let row = 0; row < rows; row++) {
    const out = [];
    for (let col = 0; col < cols; col++) {
      const terrain = fractalNoise(col, row, 30);
      const ridge = fractalNoise(col + 31, row - 17, 81);
      const dist = Math.hypot(col - centerCol, row - centerRow) / maxRadius;
      const falloff = clamp(1.2 - dist * 0.82, 0.25, 1.0);
      // Power-curve remap instead of the source builder's linear sum: fractal
      // noise clusters around 0.5, so a linear formula floors almost every
      // cell to the same level. Thresholding at 0.40 keeps ~half the island
      // as walkable plain, and the 1.6 exponent sharpens what's left into
      // real ridgelines and peaks. Tuned against the histogram for this seed.
      const peak = Math.pow(clamp((terrain - 0.40) / 0.32, 0, 1), 1.6);
      let height = baseHeight + Math.floor((peak * 4.8 + ridge * 0.5 - 0.2) * falloff);
      height = clamp(height, baseHeight, maxHeight);

      const excluded = exclude.has(`${col},${row}`);
      if (excluded) height = baseHeight;

      const biome = pickBiome(
        fractalNoise,
        col * TERRAIN.biomeScale,
        row * TERRAIN.biomeScale,
      );

      // Props can sit anywhere except spawn cells — on peaks they read as
      // clifftop pines and obelisks, which sells the elevation.
      let decor = null;
      if (!excluded && hash2(col, row, 1700) < density) {
        const choices = BIOMES[biome].decor;
        decor = {
          type: choices[Math.floor(hash2(col, row, 6100) * choices.length)],
          variant: Math.floor(hash2(col, row, 6210) * TERRAIN.variants),
          ...decorOffset(hash2, col, row),
        };
      }

      out.push({
        biome,
        variant: Math.floor(hash2(col, row, 1300) * TERRAIN.variants),
        height,
        blocked: height >= TERRAIN.blockedAt,
        decor,
      });
    }
    tiles.push(out);
  }

  return { tiles, cols, rows };
}

// Nudges a prop off the exact tile center so rows of them don't line up.
// Kept inside the diamond (the y range narrows as x approaches the corners).
function decorOffset(hash2, col, row) {
  const inset = 0.26;
  const offsetX = (hash2(col, row, 6200) * 2 - 1) * ISO.tileWidth * inset;
  const maxY = (ISO.tileHeight * inset) * (1 - Math.abs(offsetX) / (ISO.tileWidth * 0.5));
  const offsetY = (hash2(col, row, 6201) * 2 - 1) * maxY;
  return { offsetX, offsetY };
}
