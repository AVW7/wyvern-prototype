// Procedural face textures for the Three.js voxel terrain, and the pure
// neighbour-occlusion term that shades it.
//
// The diorama used to be flat-coloured boxes: one solid top colour and one
// solid side colour per biome, repeated across 1,600 identical cubes. This
// bakes a grain/speckle top and a banded-strata sidewall per biome from the
// same seeded noise the 2D art uses (systems/noise.js), so the surfaces have
// something to catch the light.
//
// Pixel generation is deliberately split from canvas creation: `bakeFacePixels`
// is a pure function over a Uint8ClampedArray, so it can be tested without a
// canvas implementation, exactly as `tileArt.js` is tested through a stub ctx.
//
// Sidewall bands run HORIZONTALLY on purpose. sanctuary3D scales one unit-tall
// box per instance, so a height-5 tile stretches its side UVs 5x vertically;
// horizontal strata survive that stretch as thicker strata, while any vertical
// detail would smear into streaks.
import { createNoise } from './noise.js';

const DEFAULTS = { size: 64, grain: 0.14, strata: 0.2 };

/** #rrggbb → [r, g, b] 0-255. Mirrors the parsing draw.js does inline. */
function parseHex(hex, fallback = [128, 128, 128]) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return fallback;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Bake one face's pixels.
 *
 * @param {'top'|'side'} face
 * @param {string} biome - biome key, used as the noise seed so a biome always
 *   bakes identically
 * @param {object} palette - a BIOMES row
 * @param {object} [options] - { size, grain, strata }
 * @returns {{data: Uint8ClampedArray, size: number}}
 */
export function bakeFacePixels(face, biome, palette = {}, options = {}) {
  const { size, grain, strata } = { ...DEFAULTS, ...options };
  const { hash2, fractalNoise } = createNoise(`tile3d:${biome}:${face}`);

  const isTop = face === 'top';
  const base = parseHex(isTop ? palette.top : (palette.left || palette.dark));
  const light = parseHex(isTop ? palette.light : palette.mid, base);
  const dark = parseHex(isTop ? palette.mid : palette.rock, base);

  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    // Sidewalls get a horizontal strata band per row plus a top-to-bottom
    // darkening, so a cliff face reads as layered rock lit from above rather
    // than a single flat rectangle.
    const band = isTop ? 0 : (fractalNoise(0, y, 71) - 0.5) * 2 * strata;
    const depth = isTop ? 0 : (y / size) * 0.28;
    for (let x = 0; x < size; x++) {
      const n = fractalNoise(x, y, isTop ? 13 : 29) - 0.5;
      const speck = hash2(x, y, isTop ? 401 : 907);
      let amount = n * 2 * grain + band;
      // A sparse brighter fleck breaks up the noise field's uniform frequency.
      if (speck > 0.985) amount += grain * 1.6;
      const colour = mix(base, amount >= 0 ? light : dark, Math.min(1, Math.abs(amount)));
      const i = (y * size + x) * 4;
      data[i] = colour[0] * (1 - depth);
      data[i + 1] = colour[1] * (1 - depth);
      data[i + 2] = colour[2] * (1 - depth);
      data[i + 3] = 255;
    }
  }
  return { data, size };
}

// Baked canvases keyed by `${biome}:${face}:${size}`. Faces are identical for
// every tile of a biome, so this is a handful of small canvases for the map.
const _canvasCache = new Map();

/**
 * Get (and cache) the two face canvases for a biome. Browser-only — needs a
 * real 2D context. Tests should use `bakeFacePixels`.
 *
 * @returns {{top: HTMLCanvasElement, side: HTMLCanvasElement} | null}
 */
export function tileFaceCanvases(biome, palette, options = {}) {
  const size = options.size ?? DEFAULTS.size;
  const key = `${biome}:${size}`;
  if (_canvasCache.has(key)) return _canvasCache.get(key);

  const build = (face) => {
    const { data } = bakeFacePixels(face, biome, palette, options);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(data, size, size), 0, 0);
    return canvas;
  };

  const faces = { top: build('top'), side: build('side') };
  if (!faces.top || !faces.side) return null;
  _canvasCache.set(key, faces);
  return faces;
}

/** Drop the canvas cache. Only needed when a palette changes at runtime. */
export function clearTileFaceCache() {
  _canvasCache.clear();
}

/**
 * How occluded a cell is by its taller neighbours, 0 (open) to 1 (boxed in).
 *
 * Real ambient occlusion would need a pass the prototype cannot afford, but the
 * grid already knows which neighbours are taller — that is where the shadow
 * would land. Diagonals count half, matching how much of the sky they block.
 * Pure and deterministic, so it is baked into instance colours at build time.
 *
 * @param {Array<Array<{height: number}|null>>} tiles
 * @param {number} col
 * @param {number} row
 * @returns {number} 0..1
 */
export function neighbourOcclusion(tiles, col, row) {
  const self = tiles?.[row]?.[col];
  if (!self) return 0;
  const height = self.height || 0;
  let occluded = 0;
  let total = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const weight = (dr === 0 || dc === 0) ? 1 : 0.5;
      total += weight;
      const neighbour = tiles?.[row + dr]?.[col + dc];
      // A hole in the island silhouette occludes nothing — it is open sky.
      if (!neighbour) continue;
      const rise = (neighbour.height || 0) - height;
      if (rise > 0) occluded += weight * Math.min(1, rise / 2);
    }
  }
  return total > 0 ? occluded / total : 0;
}
