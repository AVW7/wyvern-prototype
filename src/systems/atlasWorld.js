// The world atlas's island generator. Ported from the world-atlas design.
//
// Returns the SAME per-cell contract as systems/terrain.js and
// data/sanctuary.js — { tiles, cols, rows } where tiles[row][col] describes
// one cell — so AtlasScene places tiles exactly the way the other layers do.
//
// This is deliberately NOT terrain.js. That module's pickBiome() is a climate
// model that produces a *random* mission island from four noise layers; the
// atlas needs a *specific*, authored world whose regions sit where the design
// put them. Sharing one generator would mean bending both. Instead the two sit
// side by side over the same low-level noise/art systems, and missions carry
// zero risk from atlas changes.
//
// Like terrain.js, everything is a pure function of the seed.
import { ISO, ATLAS } from '../config.js';
import { BIOMES } from '../data/biomes.js';
import { REGION_BLOBS, ATOLL_RING } from '../data/atlas.js';
import { createNoise, clamp } from './noise.js';

// Ocean floor and the atoll shelf sit BELOW the ground plane; land rises from
// it. Heights are absolute levels, same units as TERRAIN.baseHeight.
const SEA_FLOOR = 1;
const LAND_BASE = 2;
const MAX_HEIGHT = 8;

// The atlas's ground plane — the height a tile must be to sit level with the
// camera's notional sea-of-grass. AtlasScene lifts each tile by
// (height - this), exactly as the other layers do with TERRAIN.baseHeight, so
// ocean (height 0) sinks below the plane and peaks rise above it.
export const ATLAS_BASE_HEIGHT = LAND_BASE;

// The sunken atoll ring in the south — authored in data/atlas.js beside the
// blob it shadows, so the two can't drift apart.
const ATOLL = ATOLL_RING;

// Fractal noise clusters hard around 0.5, so a height curve that reads it raw
// floors an entire region to one level — terrain.js hit the same wall and
// solved it the same way (see its power-curve remap). Stretch the band the
// noise actually occupies out to a full 0..1 first; every curve below takes
// this spread value `r`, not the raw noise.
function relief(n) {
  return clamp((n - 0.38) / 0.30, 0, 1);
}

// Per-biome elevation. Each returns an absolute height level for one land
// cell, given the spread relief `r` (0..1) and the cell's world coords. These
// curves are what make each region read differently at a glance: snow spikes,
// badlands step into mesas, desert ripples, grass rolls.
const HEIGHT_CURVES = {
  snow: (r, wx, wy) => LAND_BASE + 2 + r * 3.4 + (Math.sin(wx * 0.5 + wy * 0.4) > 0.6 ? 1 : 0),
  taiga: (r) => LAND_BASE + 0.6 + r * 2.6,
  // Flat-topped buttes: floor the relief into steps, then kick the highest
  // ones up again so the mesas read as stacked plateaus, not a smooth hill.
  badlands: (r) => LAND_BASE + Math.floor(r * 3.6) + (r > 0.8 ? 1.2 : 0),
  sand: (r, wx, wy) => LAND_BASE - 0.6 + Math.sin(wx * 0.8) * 0.4
    + Math.cos(wy * 0.6) * 0.3 + r * 0.6,
  grass: (r) => LAND_BASE + r * 1.8,
  darkwood: (r) => LAND_BASE + 0.3 + r * 2.4,
  jungle: (r) => LAND_BASE + r * 2.8,
};

/**
 * Builds the Shattered Cradle.
 *
 * @param {object} [options]
 * @param {string} [options.seed]     overrides ATLAS.seed
 * @param {number} [options.density]  overrides ATLAS.decorDensity
 * @returns {{tiles: object[][], cols: number, rows: number}}
 *   tiles[row][col] = { biome, variant, height, blocked, decor, regionId, wx, wy }
 *   — the first five fields match terrain.js exactly; regionId/wx/wy are the
 *   atlas's own additions, used for region tinting and the hover readout.
 *   Cells are never null: sea is a real `ocean` tile.
 */
export function buildAtlasWorld(options = {}) {
  const seed = options.seed ?? ATLAS.seed;
  const density = options.density ?? ATLAS.decorDensity;
  const { cols, rows, variants, seaLevel } = ATLAS;
  const { hash2, fractalNoise } = createNoise(seed);

  const tiles = [];
  for (let row = 0; row < rows; row++) {
    const out = [];
    for (let col = 0; col < cols; col++) {
      // World space is centered, so the blobs' authored coords line up.
      const wx = col - cols / 2 + 0.5;
      const wy = row - rows / 2 + 0.5;
      out.push(buildCell({
        wx, wy, col, row, seaLevel, density, variants, hash2, fractalNoise,
      }));
    }
    tiles.push(out);
  }

  return { tiles, cols, rows };
}

function buildCell({
  wx, wy, col, row, seaLevel, density, variants, hash2, fractalNoise,
}) {
  const n = fractalNoise(wx, wy, 30);
  const blobs = rankBlobs(wx, wy);
  const nearest = blobs[0];
  const second = blobs[1];

  const atollDist = Math.hypot(wx - ATOLL.x, wy - ATOLL.y) / ATOLL.r;
  const inAtoll = atollDist < 1.2;

  let biome;
  let regionId;
  let height;

  if (inAtoll) {
    ({ biome, regionId, height } = atollCell(atollDist, n));
  } else if (isSea(nearest.t, second.t, n, seaLevel)) {
    biome = 'ocean';
    regionId = 6;
    height = SEA_FLOOR - 0.8 - n * 0.9;
  } else {
    biome = nearest.blob.biome;
    regionId = nearest.blob.regionId;
    const curve = HEIGHT_CURVES[biome];
    height = curve ? curve(relief(n), wx, wy) : LAND_BASE + relief(n);
  }

  height = clamp(Math.round(height), 0, MAX_HEIGHT);
  const isWater = biome === 'ocean' || biome === 'atoll';

  return {
    biome,
    variant: Math.floor(hash2(col, row, 1300) * variants),
    height,
    // Water is impassable; so is anything steep. Display-only today — the
    // atlas has no walkable entity — but it keeps the contract with terrain.js
    // honest for whatever reads these cells next.
    blocked: isWater || height >= LAND_BASE + 3,
    decor: rollDecor(biome, isWater, col, row, density, variants, hash2),
    regionId,
    wx,
    wy,
  };
}

// Every blob ranked by normalized distance: t < 1 means inside its radius.
function rankBlobs(wx, wy) {
  return REGION_BLOBS
    .map((blob) => ({ blob, t: Math.hypot(wx - blob.x, wy - blob.y) / blob.r }))
    .sort((a, b) => a.t - b.t);
}

// A cell is sea when it's outside every blob. The second-nearest blob pulls
// the threshold outward where two regions meet, so land bridges form between
// neighbours instead of each blob rendering as its own circle — and the noise
// term breaks the remaining arcs into a real coastline.
function isSea(nearestT, secondT, n, seaLevel) {
  const bridge = Math.max(0, 1 - secondT * 0.6) * 0.25;
  const coast = (n - 0.5) * 0.22;
  return nearestT - bridge - coast > seaLevel;
}

// The atoll is a ring: reef where the shelf breaks the surface, lagoon inside,
// open water outside. This is the Tidal Sanctum's setting.
function atollCell(atollDist, n) {
  if (atollDist > ATOLL.innerT && atollDist < ATOLL.outerT) {
    return { biome: 'atoll', regionId: 6, height: SEA_FLOOR - 0.2 + n * 0.6 };
  }
  // Lagoon (shallow, inside the ring) or the open sea just beyond it.
  const height = atollDist <= ATOLL.innerT
    ? SEA_FLOOR - 0.5 - n * 0.4
    : SEA_FLOOR - 1.2 - n * 0.5;
  return { biome: 'ocean', regionId: 6, height };
}

function rollDecor(biome, isWater, col, row, density, variants, hash2) {
  const choices = BIOMES[biome].decor;
  if (!choices.length) return null;
  // Reefs are sparse; land rolls at the configured density.
  const chance = isWater ? density * 0.4 : density;
  if (hash2(col, row, 1700) >= chance) return null;
  return {
    type: choices[Math.floor(hash2(col, row, 6100) * choices.length)],
    variant: Math.floor(hash2(col, row, 6210) * variants),
    ...decorOffset(hash2, col, row),
  };
}

// Nudges a prop off the exact tile center so rows of them don't line up.
// Kept inside the diamond (the y range narrows toward the corners) — same
// treatment as terrain.js's decorOffset.
function decorOffset(hash2, col, row) {
  const inset = 0.26;
  const offsetX = (hash2(col, row, 6200) * 2 - 1) * ISO.tileWidth * inset;
  const maxY = (ISO.tileHeight * inset) * (1 - Math.abs(offsetX) / (ISO.tileWidth * 0.5));
  const offsetY = (hash2(col, row, 6201) * 2 - 1) * maxY;
  return { offsetX, offsetY };
}

/** World coords (centered, as authored in data/atlas.js) -> grid cell. */
export function worldToCell(wx, wy) {
  return {
    col: Math.round(wx + ATLAS.cols / 2 - 0.5),
    row: Math.round(wy + ATLAS.rows / 2 - 0.5),
  };
}
