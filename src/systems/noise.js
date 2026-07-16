// Seeded, deterministic noise. Same seed + same coords always give the same
// value, so a world can be rebuilt from a seed string alone with nothing stored.
// Extracted from the isometric-world-builder HD prototype.

// FNV-1a: turns a seed string into a 32-bit integer.
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function smoothstep(t) { return t * t * (3 - 2 * t); }

// Builds a noise sampler bound to one seed. Returned functions are pure.
// `salt` lets one coordinate feed many independent layers (biome, height,
// decor roll...) without them correlating.
export function createNoise(seed) {
  const seedHash = hashString(seed);

  // Hash two ints -> float in [0, 1]. The workhorse for all randomness here.
  function hash2(x, y, salt = 0) {
    let h = seedHash ^ Math.imul(x + 374761393, 668265263);
    h = Math.imul(h ^ Math.imul(y + 1274126177, 2246822519), 3266489917);
    h ^= salt * 374761393;
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  // Smooth-interpolated lattice noise at a given feature size.
  function valueNoise(x, y, scale, salt) {
    const fx = x / scale;
    const fy = y / scale;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = smoothstep(fx - x0);
    const ty = smoothstep(fy - y0);
    const a = hash2(x0, y0, salt);
    const b = hash2(x0 + 1, y0, salt);
    const c = hash2(x0, y0 + 1, salt);
    const d = hash2(x0 + 1, y0 + 1, salt);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }

  // Three octaves stacked: broad shapes plus fine detail.
  function fractalNoise(x, y, salt = 0) {
    return (
      valueNoise(x, y, 8.0, salt) * 0.55
      + valueNoise(x, y, 4.1, salt + 11) * 0.30
      + valueNoise(x, y, 2.2, salt + 37) * 0.15
    );
  }

  return { hash2, fractalNoise };
}
