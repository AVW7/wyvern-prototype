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
import {
  drawIsoTile,
  drawProjectedIsoTile,
  projectedTileGeometry,
  TILE_OVERLAYS,
  tileTextureSize,
  tileTextureKey,
} from './tileArt.js';
import { drawDecor, decorTextureKey, DECOR_BOX } from './decorArt.js';
import {
  drawProjectedSanctuaryDecor,
  EXTERIOR_SANCTUARY_DECOR_TYPES,
} from './sanctuaryDecorArt.js';
import {
  normalizeView,
  projectCellQuad,
  projectionBasis,
  viewKey,
} from './sanctuaryProjection.js';

// Randomness source for a baked texture's internal detail. Keyed on the biome
// and variant only — never on map position, since one texture serves every tile
// of that biome+variant.
function variantRand(biome, variant) {
  const { hash2 } = createNoise(`${TERRAIN.seed}:${biome}`);
  return (salt) => hash2(variant, 0, salt);
}

// Ensures the tile texture exists and returns its key. An `overlay` (a
// TILE_OVERLAYS key from tileArt.js) marks a position-specific one-off — it
// gets its own texture key so the shared biome+variant texture stays clean.
export function ensureTileTexture(textures, biome, variant, height, overlay = null) {
  const key = tileTextureKey(biome, variant, height) + (overlay ? `-${overlay}` : '');
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
    overlay,
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

function projectedTilePlacement(key, geometry, view) {
  return {
    key,
    offsetX: geometry.offsetX,
    offsetY: geometry.offsetY,
    originX: geometry.originX,
    originY: geometry.originY,
    offset: { x: geometry.offsetX, y: geometry.offsetY },
    origin: { x: geometry.originX, y: geometry.originY },
    width: geometry.width,
    height: geometry.height,
    view,
  };
}

/**
 * Ensure a sanctuary-only tile texture for the active projected view.
 *
 * The returned offset is relative to `projectGrid(col, row, height, view)`.
 * Callers place the image at that projected reference plus the offset and use
 * the returned origin. An explicit quad may be supplied for a custom projected
 * cell; translation-equivalent quads share one cache entry through shapeKey.
 * Mission, Atlas, and Vault continue using ensureTileTexture unchanged.
 */
export function ensureProjectedSanctuaryTileTexture(
  textures,
  biome,
  variant,
  height,
  overlay = null,
  view = {},
  quad = null,
) {
  if (overlay && !TILE_OVERLAYS[overlay]) {
    throw new Error(`ensureProjectedSanctuaryTileTexture: unknown overlay "${overlay}"`);
  }
  const normalized = normalizeView(view);
  const basis = projectionBasis(normalized);
  const projectedQuad = quad ?? projectCellQuad(0, 0, height, normalized);
  const wallLevels = Math.max(0, Number.isFinite(height) ? height : 0);
  const wallOffset = {
    x: -basis.height.x * wallLevels,
    y: -basis.height.y * wallLevels,
  };
  const geometry = projectedTileGeometry(projectedQuad, wallOffset);
  const overlaySuffix = overlay ? `-${overlay}` : '';
  const key = `sanctuary-${tileTextureKey(biome, variant, height)}`
    + `${overlaySuffix}-${viewKey(normalized)}-g${geometry.shapeKey}`;
  const placement = projectedTilePlacement(key, geometry, normalized);
  if (textures.exists(key)) return placement;

  const tex = textures.createCanvas(key, geometry.width, geometry.height);
  const rand = variantRand(biome, variant);
  if (quad == null && normalized.yawDeg === 0 && normalized.elevationStep === 0) {
    // Preserve the exact implemented sanctuary raster at the default view.
    drawIsoTile(tex.getContext(), {
      biome,
      variant,
      height,
      tileWidth: ISO.tileWidth,
      tileHeight: ISO.tileHeight,
      elevation: ISO.elevation,
      rand,
      overlay,
    });
  } else {
    drawProjectedIsoTile(tex.getContext(), {
      biome,
      variant,
      height,
      quad: projectedQuad,
      wallOffset,
      rand,
      overlay,
      geometry,
    });
  }
  tex.refresh();
  return placement;
}

function projectedDecorPlacement(key, normalized, basis) {
  const elevationScale = basis.heightScale;
  const width = DECOR_BOX.width;
  const height = Math.max(1, Math.ceil(DECOR_BOX.height * elevationScale));
  const baseX = DECOR_BOX.baseX;
  const baseY = DECOR_BOX.baseY * elevationScale;
  const originX = baseX / width;
  const originY = baseY / height;
  return {
    key,
    offsetX: 0,
    offsetY: 0,
    originX,
    originY,
    offset: { x: 0, y: 0 },
    origin: { x: originX, y: originY },
    width,
    height,
    baseX,
    baseY,
    elevationScale,
    view: normalized,
  };
}

/**
 * Ensure a Base-only, view-aware exterior sanctuary prop while preserving the
 * generic decor API. The projected drawer rebuilds ground and height pieces
 * from the active basis; it does not transform a completed legacy bitmap.
 */
export function ensureProjectedSanctuaryDecorTexture(
  textures,
  biome,
  type,
  variant,
  view = {},
) {
  const normalized = normalizeView(view);
  const basis = projectionBasis(normalized);
  if (!EXTERIOR_SANCTUARY_DECOR_TYPES.includes(type)) {
    throw new Error(
      `ensureProjectedSanctuaryDecorTexture: unsupported exterior prop "${type}"`,
    );
  }
  const key = `sanctuary-${decorTextureKey(biome, type, variant)}-${viewKey(normalized)}`;
  const placement = projectedDecorPlacement(key, normalized, basis);
  if (textures.exists(key)) return placement;

  const tex = textures.createCanvas(key, placement.width, placement.height);
  const ctx = tex.getContext();
  drawProjectedSanctuaryDecor(
    ctx,
    type,
    placement.baseX,
    placement.baseY,
    1,
    variant,
    BIOMES[biome],
    basis,
  );
  tex.refresh();
  return placement;
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

// Sanctuary backdrops, one per scene view. Base requests a sky-only variant
// because its projected island shadow is a separate world object that must pan
// with the map. Fixed-view Vault retains its historical baked shadow.
export function ensureSanctuaryBackdropTexture(
  textures,
  view,
  { dioramaShadow = true } = {},
) {
  const key = `sanctuary-backdrop-${view}${dioramaShadow ? '' : '-sky'}`;
  if (textures.exists(key)) return key;

  const w = GAME.width;
  const h = GAME.height;
  const tex = textures.createCanvas(key, w, h);
  const ctx = tex.getContext();

  if (view === 'inside') {
    // The vault: warm darkness with an ember glow rising off the heart.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#172534');
    g.addColorStop(0.52, '#0f1823');
    g.addColorStop(1, '#070c12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const ember = ctx.createRadialGradient(w * 0.55, h * 0.52, 0, w * 0.55, h * 0.52, w * 0.42);
    ember.addColorStop(0, 'rgba(194,91,37,.10)');
    ember.addColorStop(1, 'rgba(9,14,20,0)');
    ctx.fillStyle = ember;
    ctx.fillRect(0, 0, w, h);
  } else {
    // The grounds: deep night sky with a cool haze and sparse pixel stars.
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#101030');
    g.addColorStop(0.55, '#0a0a20');
    g.addColorStop(1, '#050514');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const haze = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, Math.max(w, h) * 0.6);
    haze.addColorStop(0, 'rgba(76,72,193,.14)');
    haze.addColorStop(1, 'rgba(6,8,13,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    const grid = 28;
    for (let y = 0; y < h; y += grid) {
      for (let x = 0; x < w; x += grid) {
        const v = ((x / grid + y / grid) % 3 === 0) ? 0.028 : 0.013;
        ctx.fillStyle = `rgba(220,235,255,${v})`;
        ctx.fillRect(x + ((y / grid) % 2) * 2, y, 1, 1);
      }
    }
  }

  if (dioramaShadow) {
    // Fixed-view Vault keeps the historical baked shadow. Rotatable Base asks
    // for sky-only art and owns a separate projected world-space shadow.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.64, w * 0.34, h * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  tex.refresh();
  return key;
}
