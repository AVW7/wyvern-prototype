// Bakes procedural art into Phaser canvas textures, on demand and cached by
// key. Baking once rather than drawing per frame is the whole reason this works
// in Phaser — the canvas art is expensive to draw but free to blit, and baked
// textures depth-sort as ordinary sprites.
//
// Any scene can call these with its `this.textures`; only the tiles/props the
// current map actually uses get baked.
import { ISO, TERRAIN, GAME } from '../config.js';
import { BIOMES } from '../data/biomes.js';
import { createNoise } from './noise.js';
import { drawIsoTile, tileTextureSize, tileTextureKey } from './tileArt.js';
import { drawDecor, decorTextureKey, DECOR_BOX } from './decorArt.js';

// Randomness source for a baked texture's internal detail. Keyed on the biome
// and variant only — never on map position, since one texture serves every tile
// of that biome+variant.
function variantRand(biome, variant) {
  const { hash2 } = createNoise(`${TERRAIN.seed}:${biome}`);
  return (salt) => hash2(variant, 0, salt);
}

// Ensures the tile texture exists and returns its key.
export function ensureTileTexture(textures, biome, variant, height) {
  const key = tileTextureKey(biome, variant, height);
  if (textures.exists(key)) return key;

  const size = tileTextureSize({
    tileWidth: ISO.tileWidth,
    tileHeight: ISO.tileHeight,
    elevation: ISO.elevation,
    height,
  });
  const tex = textures.createCanvas(key, size.width, size.height);
  drawIsoTile(tex.getContext(), {
    biome,
    variant,
    height,
    tileWidth: ISO.tileWidth,
    tileHeight: ISO.tileHeight,
    elevation: ISO.elevation,
    rand: variantRand(biome, variant),
  });
  tex.refresh();
  return key;
}

// Ensures the prop texture exists and returns its key. Baked per biome as well
// as per type because `rock` picks up the local stone color from the palette.
export function ensureDecorTexture(textures, biome, type, variant) {
  const key = decorTextureKey(biome, type, variant);
  if (textures.exists(key)) return key;

  const tex = textures.createCanvas(key, DECOR_BOX.width, DECOR_BOX.height);
  drawDecor(tex.getContext(), type, DECOR_BOX.baseX, DECOR_BOX.baseY, 1, variant, BIOMES[biome]);
  tex.refresh();
  return key;
}

// Atmospheric backdrop behind the island: vertical dusk gradient, a radial
// haze glow behind the map, and sparse pixel "stars". Ported from the HD
// builder's drawBackground(). Baked once at canvas size.
export function ensureBackdropTexture(textures) {
  const key = 'mission-backdrop';
  if (textures.exists(key)) return key;

  const w = GAME.width;
  const h = GAME.height;
  const tex = textures.createCanvas(key, w, h);
  const ctx = tex.getContext();

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#182130');
  g.addColorStop(0.55, '#0d121c');
  g.addColorStop(1, '#07090e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const haze = ctx.createRadialGradient(w * 0.52, h * 0.26, 0, w * 0.52, h * 0.26, Math.max(w, h) * 0.62);
  haze.addColorStop(0, 'rgba(92,127,164,.16)');
  haze.addColorStop(1, 'rgba(6,8,13,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, w, h);

  const grid = 28;
  for (let y = 0; y < h; y += grid) {
    for (let x = 0; x < w; x += grid) {
      const v = ((x / grid + y / grid) % 3 === 0) ? 0.026 : 0.012;
      ctx.fillStyle = `rgba(220,235,255,${v})`;
      ctx.fillRect(x + ((y / grid) % 2) * 2, y, 1, 1);
    }
  }

  // Soft shadow under the island so the map reads as one floating diorama.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#000';
  const span = (TERRAIN.cols + TERRAIN.rows) / 2;
  ctx.beginPath();
  ctx.ellipse(
    ISO.originX + 16,
    ISO.originY + span * ISO.tileHeight * 0.52 + 58,
    span * ISO.tileWidth * 0.39,
    span * ISO.tileHeight * 0.26,
    0, 0, Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  tex.refresh();
  return key;
}
