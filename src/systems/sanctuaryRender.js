// Sanctuary rendering helpers, used ONLY by the sanctuary scenes (BaseScene
// grounds / VaultScene interior). The mission layer keeps its own inline
// placement in MissionScene — the layers are deliberately separate, so
// changes to how the sanctuary renders never risk mission regressions (and
// vice versa). Conventions mirror the mission ones: heights draw relative to
// TERRAIN.baseHeight, tiles anchor at origin (0.5, 0), and everything sorts
// by its ground-plane footprint.
import {
  GAME, ISO, TERRAIN, SANCTUARY, WYVERN_ART,
} from '../config.js';
import { gridToScreen } from './iso.js';
import { wyvernAnimationKey } from '../data/wyverns.js';
import {
  resolveWyvernVisual, scaleWyvernVisual, wyvernAccentColor,
} from './wyvernPresentation.js';
import {
  ensureTileTexture, ensureDecorTexture, ensureSanctuaryBackdropTexture,
} from './textureBake.js';
import { DECOR_BOX } from './decorArt.js';
import { RESIDENT_SPOTS } from '../data/sanctuary.js';
import { getRoster } from './roster.js';

/**
 * Builds one complete sanctuary view into the scene: backdrop, tile layer,
 * props, and a camera fitted to the map (zoomed out until the whole diorama
 * fits, looking left of center so the map clears the roster panel).
 *
 * @returns {{backdrop, layer, placed, zoom}} placed.decor lists every prop
 *   sprite with its type, so scenes can wire up specific props (the grounds'
 *   entrance gate, the vault's torches).
 */
export function buildSanctuaryView(scene, view, tiles) {
  const bounds = sanctuaryBounds(tiles);
  const mapW = bounds.maxX - bounds.minX;
  const mapH = bounds.maxY - bounds.minY;
  const { cameraMargin, panelBias } = SANCTUARY;
  const zoom = Math.min(
    1,
    (GAME.width - cameraMargin * 2 - panelBias) / mapW,
    (GAME.height - cameraMargin * 2) / mapH,
  );
  const lookX = (bounds.minX + bounds.maxX) / 2 - panelBias / zoom / 2;
  const lookY = (bounds.minY + bounds.maxY) / 2;

  // The backdrop is stretched to exactly cover what the zoomed-out camera
  // sees (added before the layer so display order keeps it underneath).
  const backdrop = scene.add.image(
    lookX, lookY, ensureSanctuaryBackdropTexture(scene.textures, view),
  );
  backdrop.setDisplaySize(GAME.width / zoom, GAME.height / zoom);

  const layer = scene.add.layer();
  const placed = placeSanctuaryTiles(scene, layer, tiles);

  const cam = scene.cameras.main;
  cam.setZoom(zoom);
  cam.centerOn(lookX, lookY);

  return { backdrop, layer, placed, zoom };
}

// Projected bounding box of every placed tile, including lifted top faces
// and the sidewalls hanging below the ground plane. Drives the camera fit.
function sanctuaryBounds(tiles) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let row = 0; row < tiles.length; row++) {
    for (let col = 0; col < tiles[row].length; col++) {
      const cell = tiles[row][col];
      if (!cell) continue;
      const { x, y } = gridToScreen(col, row);
      const lift = (cell.height - TERRAIN.baseHeight) * ISO.elevation;
      minX = Math.min(minX, x - ISO.tileWidth / 2);
      maxX = Math.max(maxX, x + ISO.tileWidth / 2);
      minY = Math.min(minY, y - lift);
      maxY = Math.max(maxY, (y - lift) + ISO.tileHeight + cell.height * ISO.elevation);
    }
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Places every visible tile (and its decor) of a hand-authored sanctuary grid
 * into the given depth-sorted layer. Cells may be null — holes that shape the
 * island's silhouette (mission terrain has no holes; sanctuary maps do).
 */
export function placeSanctuaryTiles(scene, layer, tiles) {
  const placed = { decor: [] };

  for (let row = 0; row < tiles.length; row++) {
    for (let col = 0; col < tiles[row].length; col++) {
      const cell = tiles[row][col];
      if (!cell) continue;
      const { x, y } = gridToScreen(col, row);
      // How far this tile's top face rises above the ground plane.
      const lift = (cell.height - TERRAIN.baseHeight) * ISO.elevation;

      const key = ensureTileTexture(
        scene.textures, cell.biome, cell.variant, cell.height, cell.overlay,
      );
      // Every tile texture puts its top face's top vertex at local y=0, so a
      // tile of any height anchors with origin (0.5, 0).
      const tile = scene.add.image(x, y - lift, key);
      tile.setOrigin(0.5, 0);
      // Sort by the tile's FOOTPRINT (diamond center on the ground plane),
      // not its lifted art, so a tall wall still sorts by where it stands.
      tile.setData('depth', y + ISO.tileHeight / 2);
      layer.add(tile);

      if (cell.decor) {
        placed.decor.push({
          type: cell.decor.type,
          sprite: placeDecor(scene, layer, cell, x, y - lift),
        });
      }
    }
  }

  return placed;
}

// Props are their own depth-sorted sprites rather than being baked into the
// tile, so residents can pass correctly in front of and behind them. On a
// raised tile the prop stands on the lifted top face (parapet railings,
// gallery gates).
function placeDecor(scene, layer, cell, tileX, tileTopY) {
  const { decor } = cell;
  const baseX = tileX + decor.offsetX;
  const baseY = tileTopY + ISO.tileHeight / 2 + decor.offsetY;
  const key = ensureDecorTexture(scene.textures, cell.biome, decor.type, decor.variant);
  const sprite = scene.add.image(baseX, baseY, key);
  // Anchor the prop by its feet — the point inside the texture where it meets
  // the ground — so tall props grow upward from the tile.
  sprite.setOrigin(DECOR_BOX.baseX / DECOR_BOX.width, DECOR_BOX.baseY / DECOR_BOX.height);
  // Depth uses the owning tile's footprint on the ground plane (plus a nudge
  // so the prop draws over its own tile), keeping occlusion right even when
  // the prop's visual base is lifted onto a wall or terrace.
  sprite.setData('depth', baseY + (cell.height - TERRAIN.baseHeight) * ISO.elevation + 1);
  layer.add(sprite);
  return sprite;
}

/**
 * Every roster animal stands somewhere in the view — the roster IS the
 * population of the sanctuary. Spots wrap with a small offset if the roost
 * outgrows the hand-picked list. `zoom` sizes the name tags so they stay
 * readable however far the camera is zoomed out.
 */
export function spawnSanctuaryResidents(scene, layer, view, zoom) {
  const spots = RESIDENT_SPOTS[view];
  const { amplitude, durationMs } = SANCTUARY.residentBob;

  getRoster().forEach((animal, i) => {
    const spot = spots[i % spots.length];
    const wrap = Math.floor(i / spots.length);
    const { x, y } = gridToScreen(spot.col, spot.row);
    const px = x + wrap * 14 * (i % 2 ? 1 : -1);
    const py = y + ISO.tileHeight / 2 + wrap * 6;

    const visual = resolveWyvernVisual(scene.textures, animal);
    const usesProfileTexture = Boolean(
      animal.assetKey && scene.textures.exists(animal.assetKey),
    );
    const sprite = usesProfileTexture
      ? scene.add.sprite(px, py, visual.textureKey, visual.frameName)
      : scene.add.image(px, py, `species-${animal.species}`);

    if (usesProfileTexture) {
      const accent = wyvernAccentColor(animal);
      const aura = scene.add.ellipse(
        px,
        py + 1,
        WYVERN_ART.sanctuaryAura.width,
        WYVERN_ART.sanctuaryAura.height,
        accent,
        WYVERN_ART.sanctuaryAura.alpha,
      );
      aura.setStrokeStyle(1, accent, 0.38);
      aura.setData('depth', py - 0.2);
      layer.add(aura);

      const shadow = scene.add.ellipse(
        px,
        py + 2,
        WYVERN_ART.sanctuaryShadow.width,
        WYVERN_ART.sanctuaryShadow.height,
        0x05070a,
        WYVERN_ART.sanctuaryShadow.alpha,
      );
      shadow.setData('depth', py - 0.1);
      layer.add(shadow);

      sprite.setOrigin(visual.origin.x, visual.origin.y);
      sprite.setScale(visual.usesAtlas
        ? scaleWyvernVisual(visual, WYVERN_ART.sanctuaryHeight)
        : WYVERN_ART.sanctuaryHeight / Math.max(visual.referenceHeight, 1));

      const idleKey = wyvernAnimationKey(animal, 'idle');
      if (scene.anims.exists(idleKey)) sprite.play(idleKey);
    } else {
      sprite.setOrigin(0.5, 0.85); // feet-ish anchor for generated residents
    }
    sprite.setData('depth', py);
    layer.add(sprite);

    const labelLift = usesProfileTexture
      ? WYVERN_ART.sanctuaryHeight * visual.origin.y + 8
      : 40;
    const label = scene.add.text(px, py - labelLift, animal.name, {
      font: `${Math.round(11 / zoom)}px monospace`,
      color: '#d8e6ff',
    });
    label.setOrigin(0.5, 1);
    label.setAlpha(0.85);
    label.setData('depth', py + 0.5);
    layer.add(label);

    scene.tweens.add({
      targets: [sprite, label],
      y: `-=${amplitude}`,
      duration: durationMs + i * 97,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  });
}

// Ambient prop animation: braziers breathe and glow motes pulse, each on its
// own beat so nothing moves in lockstep. No-op for views without either.
export function animateSanctuaryProps(scene, placed) {
  placed.decor
    .filter((d) => d.type === 'torch' || d.type === 'glow')
    .forEach(({ sprite }, i) => {
      scene.tweens.add({
        targets: sprite,
        alpha: SANCTUARY.torchFlicker.alphaTo,
        duration: SANCTUARY.torchFlicker.durationMs + i * 133,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
}
