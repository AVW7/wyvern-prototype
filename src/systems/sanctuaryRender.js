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
import {
  normalizeView,
  projectBounds,
  projectCellQuad,
  projectFootprint,
  projectGrid,
  projectVector,
  unprojectVector,
} from './sanctuaryProjection.js';
import {
  applyGroundPlaneTransform,
  groundPlaneTransform,
} from './sanctuaryGroundPlane.js';
import { interactionGroundDepth } from './sanctuaryInteractions.js';
import { wyvernAnimationKey } from '../data/wyverns.js';
import {
  resolveWyvernVisual, scaleWyvernVisual, wyvernAccentColor,
} from './wyvernPresentation.js';
import {
  ensureTileTexture,
  ensureDecorTexture,
  ensureProjectedSanctuaryTileTexture,
  ensureProjectedSanctuaryDecorTexture,
  ensureSanctuaryBackdropTexture,
} from './textureBake.js';
import { DECOR_BOX } from './decorArt.js';
import { RESIDENT_SPOTS } from '../data/sanctuary.js';
import { getRoster } from './roster.js';

const LAYER_RESIDENTS = new WeakMap();
const RESIDENT_GROUND_BASE = Symbol('sanctuaryResidentGroundBase');

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/** Projected world-space shadow fitted to the visible sanctuary ground. */
export function sanctuaryWorldShadowGeometry(tiles, view = {}) {
  const projectionView = normalizeView(view);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let row = 0; row < (tiles?.length ?? 0); row += 1) {
    for (let col = 0; col < (tiles[row]?.length ?? 0); col += 1) {
      if (!tiles[row][col]) continue;
      projectCellQuad(col, row, TERRAIN.baseHeight, projectionView).points.forEach((point) => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      });
    }
  }
  if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
    throw new TypeError('Sanctuary world shadow requires at least one visible cell.');
  }
  const groundWidth = maxX - minX;
  const groundHeight = maxY - minY;
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2 + groundHeight * 0.18,
    width: Math.max(18, groundWidth * 0.9),
    height: Math.max(18, groundHeight * 0.32),
    view: projectionView,
  };
}

function applySanctuaryWorldShadow(shadow, tiles, view) {
  if (!shadow) return null;
  const geometry = sanctuaryWorldShadowGeometry(tiles, view);
  shadow.setPosition(geometry.x, geometry.y);
  shadow.setDisplaySize(geometry.width, geometry.height);
  return geometry;
}

/**
 * Builds one complete sanctuary view into the scene: backdrop, tile layer,
 * props, and a camera fitted to the map (zoomed out until the whole diorama
 * fits, looking left of center so the map clears the roster panel).
 *
 * @returns {{backdrop, shadow, layer, placed, zoom, bounds, tiles}} `bounds` is public
 *   for the free-roam camera; the additive return shape keeps VaultScene's
 *   fitted showcase compatible. `placed.decor` retains stable grid footprints
 *   so interactions and occlusion never need to infer them from lifted art.
 */
export function buildSanctuaryView(scene, view, tiles, options = {}) {
  const hasProjectedView = options.projectionView != null;
  const projectionView = hasProjectedView ? normalizeView(options.projectionView) : null;
  const bounds = sanctuaryBounds(tiles, projectionView);
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
    lookX,
    lookY,
    ensureSanctuaryBackdropTexture(
      scene.textures,
      view,
      { dioramaShadow: !hasProjectedView },
    ),
  );
  backdrop.setDisplaySize(GAME.width / zoom, GAME.height / zoom);

  // Base pans its sky independently, so its island shadow must live in world
  // space. Vault keeps the historical baked shadow on its fixed backdrop.
  const shadowGeometry = hasProjectedView
    ? sanctuaryWorldShadowGeometry(tiles, projectionView)
    : null;
  const shadow = shadowGeometry
    ? scene.add.ellipse(
      shadowGeometry.x,
      shadowGeometry.y,
      shadowGeometry.width,
      shadowGeometry.height,
      0x000000,
      0.3,
    )
    : null;

  const layer = scene.add.layer();
  const placed = placeSanctuaryTiles(scene, layer, tiles, projectionView);

  const cam = scene.cameras.main;
  cam.setZoom(zoom);
  cam.centerOn(lookX, lookY);

  return {
    backdrop, shadow, layer, placed, zoom, bounds, tiles, projectionView,
  };
}

// Projected bounding box of every placed tile, including lifted top faces
// and the sidewalls hanging below the ground plane. Drives the camera fit.
export function sanctuaryBounds(tiles, projectionView = null) {
  if (projectionView) return projectBounds(tiles, projectionView);
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

// The fitted backdrop used to cover exactly one static viewport. Free-roam
// cameras can pan and zoom, so keep that same sky/void texture pinned behind
// the active view without involving a second camera or scaling world objects.
export function coverSanctuaryCamera(backdrop, camera) {
  if (!backdrop?.active || !camera?.zoom) return;
  backdrop.setPosition(
    camera.scrollX + camera.width / 2,
    camera.scrollY + camera.height / 2,
  );
  backdrop.setDisplaySize(camera.width / camera.zoom + 2, camera.height / camera.zoom + 2);
}

/**
 * Places every visible tile (and its decor) of a hand-authored sanctuary grid
 * into the given depth-sorted layer. Cells may be null — holes that shape the
 * island's silhouette (mission terrain has no holes; sanctuary maps do).
 */
export function placeSanctuaryTiles(scene, layer, tiles, projectionView = null) {
  const placed = { tiles: [], decor: [] };
  const activeView = projectionView ? normalizeView(projectionView) : null;

  for (let row = 0; row < tiles.length; row++) {
    for (let col = 0; col < tiles[row].length; col++) {
      const cell = tiles[row][col];
      if (!cell) continue;
      const legacy = gridToScreen(col, row);
      const projectedTop = activeView
        ? projectGrid(col, row, cell.height, activeView)
        : { x: legacy.x, y: legacy.y - (cell.height - TERRAIN.baseHeight) * ISO.elevation };
      const ground = activeView
        ? projectFootprint(col, row, TERRAIN.baseHeight, activeView)
        : { x: legacy.x, y: legacy.y + ISO.tileHeight / 2 };
      const texture = activeView
        ? ensureProjectedSanctuaryTileTexture(
          scene.textures,
          cell.biome,
          cell.variant,
          cell.height,
          cell.overlay,
          activeView,
        )
        : {
          key: ensureTileTexture(
            scene.textures, cell.biome, cell.variant, cell.height, cell.overlay,
          ),
          offsetX: 0,
          offsetY: 0,
          originX: 0.5,
          originY: 0,
        };
      const tile = scene.add.image(
        projectedTop.x + texture.offsetX,
        projectedTop.y + texture.offsetY,
        texture.key,
      );
      tile.setOrigin(texture.originX, texture.originY);
      // Sort by the tile's FOOTPRINT (diamond center on the ground plane),
      // not its lifted art, so a tall wall still sorts by where it stands.
      tile.setData('depth', ground.y);
      tile.setData('depthTie', row * 1000 + col * 10);
      layer.add(tile);
      placed.tiles.push({
        col,
        row,
        cell,
        sprite: tile,
        footprint: ground,
        logicalFootprint: { col, row },
      });

      if (cell.decor) {
        const decorPlacement = placeDecor(
          scene, layer, cell, col, row, activeView,
        );
        placed.decor.push({
          type: cell.decor.type,
          variant: cell.decor.variant,
          col,
          row,
          cell,
          sprite: decorPlacement.sprite,
          // Props render on lifted top faces, but gameplay uses their owning
          // ground-plane footprint. This is the same depth point used below.
          footprint: decorPlacement.footprint,
          logicalFootprint: decorPlacement.logicalFootprint,
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
function placeDecor(scene, layer, cell, col, row, projectionView = null) {
  const { decor } = cell;
  const legacy = gridToScreen(col, row);
  const logicalOffset = unprojectVector(decor.offsetX, decor.offsetY, {});
  const logicalFootprint = {
    col: col + logicalOffset.col,
    row: row + logicalOffset.row,
  };
  const projectedOffset = projectionView
    ? projectVector(logicalOffset.col, logicalOffset.row, projectionView)
    : { x: decor.offsetX, y: decor.offsetY };
  const visualBase = projectionView
    ? projectFootprint(col, row, cell.height, projectionView)
    : {
      x: legacy.x,
      y: legacy.y - (cell.height - TERRAIN.baseHeight) * ISO.elevation
        + ISO.tileHeight / 2,
    };
  const footprint = projectionView
    ? projectFootprint(logicalFootprint.col, logicalFootprint.row, TERRAIN.baseHeight, projectionView)
    : {
      x: legacy.x + decor.offsetX,
      y: legacy.y + ISO.tileHeight / 2 + decor.offsetY,
    };
  const texture = projectionView
    ? ensureProjectedSanctuaryDecorTexture(
      scene.textures, cell.biome, decor.type, decor.variant, projectionView,
    )
    : {
      key: ensureDecorTexture(scene.textures, cell.biome, decor.type, decor.variant),
      originX: DECOR_BOX.baseX / DECOR_BOX.width,
      originY: DECOR_BOX.baseY / DECOR_BOX.height,
    };
  const sprite = scene.add.image(
    visualBase.x + projectedOffset.x,
    visualBase.y + projectedOffset.y,
    texture.key,
  );
  // Anchor the prop by its feet — the point inside the texture where it meets
  // the ground — so tall props grow upward from the tile.
  sprite.setOrigin(texture.originX, texture.originY);
  // Depth uses the owning tile's footprint on the ground plane (plus a nudge
  // so the prop draws over its own tile), keeping occlusion right even when
  // the prop's visual base is lifted onto a wall or terrace.
  sprite.setData('depth', footprint.y + 1);
  sprite.setData('depthTie', row * 1000 + col * 10 + 5);
  layer.add(sprite);
  return { sprite, footprint, logicalFootprint };
}

/**
 * Reprojects an already-built Base sanctuary in place. Logical map cells and
 * resident controllers survive the view change; only their canvas textures,
 * projected anchors, and painter keys change. Vault never calls this seam.
 */
export function reprojectSanctuaryView(scene, world, view) {
  if (!world?.tiles || !world?.placed) {
    throw new TypeError('reprojectSanctuaryView requires a built sanctuary world.');
  }
  const projectionView = normalizeView(view);

  world.placed.tiles.forEach((entry) => {
    const {
      col, row, cell, sprite,
    } = entry;
    const top = projectGrid(col, row, cell.height, projectionView);
    const ground = projectFootprint(col, row, TERRAIN.baseHeight, projectionView);
    const texture = ensureProjectedSanctuaryTileTexture(
      scene.textures,
      cell.biome,
      cell.variant,
      cell.height,
      cell.overlay,
      projectionView,
    );
    sprite.setTexture?.(texture.key);
    sprite.setOrigin(texture.originX, texture.originY);
    sprite.setPosition(top.x + texture.offsetX, top.y + texture.offsetY);
    sprite.setData('depth', ground.y);
    sprite.setData('depthTie', row * 1000 + col * 10);
    if (entry.footprint) Object.assign(entry.footprint, ground);
    else entry.footprint = ground;
  });

  world.placed.decor.forEach((entry) => {
    const {
      col, row, cell, sprite, logicalFootprint,
    } = entry;
    const offset = projectVector(
      logicalFootprint.col - col,
      logicalFootprint.row - row,
      projectionView,
    );
    const visualBase = projectFootprint(col, row, cell.height, projectionView);
    const ground = projectFootprint(
      logicalFootprint.col,
      logicalFootprint.row,
      TERRAIN.baseHeight,
      projectionView,
    );
    const texture = ensureProjectedSanctuaryDecorTexture(
      scene.textures,
      cell.biome,
      entry.type,
      entry.variant,
      projectionView,
    );
    sprite.setTexture?.(texture.key);
    sprite.setOrigin(texture.originX, texture.originY);
    sprite.setPosition(visualBase.x + offset.x, visualBase.y + offset.y);
    sprite.setData('depth', ground.y + 1);
    sprite.setData('depthTie', row * 1000 + col * 10 + 5);
    if (entry.footprint) Object.assign(entry.footprint, ground);
    else entry.footprint = ground;
  });

  reprojectSanctuaryResidentAffordances(
    world.layer ? (LAYER_RESIDENTS.get(world.layer) ?? []) : [],
    projectionView,
  );
  applySanctuaryWorldShadow(world.shadow, world.tiles, projectionView);

  world.projectionView = projectionView;
  world.bounds = projectBounds(world.tiles, projectionView);
  return world.bounds;
}

function captureResidentGroundBase(resident) {
  if (resident?.[RESIDENT_GROUND_BASE]) return resident[RESIDENT_GROUND_BASE];
  const capture = (object) => ({
    scaleX: finite(object?.scaleX, 1),
    scaleY: finite(object?.scaleY, 1),
    rotation: finite(object?.rotation, 0),
  });
  const base = {
    aura: capture(resident?.aura),
    shadow: capture(resident?.shadow),
    selectionRing: capture(resident?.selectionRing),
  };
  if (resident) resident[RESIDENT_GROUND_BASE] = base;
  return base;
}

/**
 * Mutate resident-owned ground ellipses for a new projection without tilting
 * the sprite or its name label. Movement keeps applying flight/pulse scales,
 * so update its captured base scales as part of the same reprojection.
 */
export function reprojectSanctuaryResidentAffordances(residents, view = {}) {
  const rows = Array.isArray(residents) ? residents : [residents];
  const transform = groundPlaneTransform(view);
  rows.filter(Boolean).forEach((resident) => {
    const base = captureResidentGroundBase(resident);
    const apply = (object, authored) => {
      object?.setScale?.(
        authored.scaleX * transform.scaleX,
        authored.scaleY * transform.scaleY,
      );
      object?.setRotation?.(authored.rotation + transform.rotation);
    };
    apply(resident.aura, base.aura);
    apply(resident.shadow, base.shadow);
    apply(resident.selectionRing, base.selectionRing);

    const presentation = resident._sanctuaryMovementPresentation;
    if (presentation) {
      presentation.auraScaleX = base.aura.scaleX * transform.scaleX;
      presentation.auraScaleY = base.aura.scaleY * transform.scaleY;
      presentation.shadowScaleX = base.shadow.scaleX * transform.scaleX;
      presentation.shadowScaleY = base.shadow.scaleY * transform.scaleY;
    }
  });
  return transform;
}

/**
 * Every roster animal stands somewhere in the view — the roster IS the
 * population of the sanctuary. Spots wrap with a small offset if the roost
 * outgrows the hand-picked list. `zoom` sizes the name tags so they stay
 * readable however far the camera is zoomed out.
 */
export function spawnSanctuaryResidents(scene, layer, view, zoom, options = {}) {
  const spots = RESIDENT_SPOTS[view];
  const projectionView = options.projectionView != null
    ? normalizeView(options.projectionView)
    : null;
  const { amplitude, durationMs } = SANCTUARY.residentBob;
  const residents = [];

  getRoster().forEach((animal, i) => {
    const spot = spots[i % spots.length];
    const wrap = Math.floor(i / spots.length);
    const wrapOffset = {
      x: wrap * 14 * (i % 2 ? 1 : -1),
      y: wrap * 6,
    };
    const logicalOffset = unprojectVector(wrapOffset.x, wrapOffset.y, {});
    const logicalFootprint = {
      col: spot.col + logicalOffset.col,
      row: spot.row + logicalOffset.row,
    };
    const projected = projectionView
      ? projectFootprint(
        logicalFootprint.col,
        logicalFootprint.row,
        TERRAIN.baseHeight,
        projectionView,
      )
      : (() => {
        const point = gridToScreen(spot.col, spot.row);
        return {
          x: point.x + wrapOffset.x,
          y: point.y + ISO.tileHeight / 2 + wrapOffset.y,
        };
      })();
    const px = projected.x;
    const py = projected.y;

    const visual = resolveWyvernVisual(scene.textures, animal);
    const usesProfileTexture = Boolean(
      animal.assetKey && scene.textures.exists(animal.assetKey),
    );
    // Milestone 1 of docs/SANCTUARY_3D_DRAGON_PLAN.md: the controlled roster
    // wyvern renders via a separate Three.js layer instead of a Phaser
    // sprite. footprint/label/selectionRing stay real so movement, wanderer
    // exclusion, and interactions (which key off animal.id/footprint, not
    // sprite existence) keep working unchanged.
    const isDragon3D = options.selectedWyvernId != null
      && animal.id === options.selectedWyvernId
      && animal.species === 'wyvern';
    const sprite = isDragon3D
      ? null
      : (usesProfileTexture
        ? scene.add.sprite(px, py, visual.textureKey, visual.frameName)
        : scene.add.image(px, py, `species-${animal.species}`));
    const accent = wyvernAccentColor(animal);
    let aura = null;
    let shadow = null;

    if (isDragon3D) {
      // No aura/shadow/anim for the 3D-owned resident in Milestone 1.
    } else if (usesProfileTexture) {
      aura = scene.add.ellipse(
        px,
        py + 1,
        WYVERN_ART.sanctuaryAura.width,
        WYVERN_ART.sanctuaryAura.height,
        accent,
        WYVERN_ART.sanctuaryAura.alpha,
      );
      aura.setStrokeStyle(1, accent, 0.38);
      aura.setData('depth', py + 0.05);
      aura.setData('depthTie', i * 10 + 1);
      layer.add(aura);

      shadow = scene.add.ellipse(
        px,
        py + 2,
        WYVERN_ART.sanctuaryShadow.width,
        WYVERN_ART.sanctuaryShadow.height,
        0x05070a,
        WYVERN_ART.sanctuaryShadow.alpha,
      );
      shadow.setData('depth', py + 0.15);
      shadow.setData('depthTie', i * 10 + 3);
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
    if (sprite) {
      sprite.setData('residentId', animal.id);
      sprite.setData('depth', py + 0.2);
      sprite.setData('depthTie', i * 10 + 4);
      layer.add(sprite);
    }

    // One hidden ring per resident makes selection changes cheap and keeps the
    // selected actor's world affordance attached to the same footprint as its
    // existing aura and shadow. Non-selected residents look exactly as before.
    const selectionRing = scene.add.ellipse(
      px,
      py + 2,
      SANCTUARY.selectionRing.width,
      SANCTUARY.selectionRing.height,
      0x000000,
      0,
    );
    selectionRing.setStrokeStyle(2, accent, SANCTUARY.selectionRing.alpha);
    selectionRing.setVisible(false);
    selectionRing.setData('depth', py + 0.1);
    selectionRing.setData('depthTie', i * 10 + 2);
    layer.add(selectionRing);

    const labelLift = isDragon3D
      ? SANCTUARY.dragon3D.labelLift
      : (usesProfileTexture
        ? WYVERN_ART.sanctuaryHeight * visual.origin.y + 8
        : 40);
    const label = scene.add.text(px, py - labelLift, animal.name, {
      font: `${Math.round(11 / zoom)}px monospace`,
      color: '#d8e6ff',
    });
    label.setOrigin(0.5, 1);
    label.setAlpha(0.85);
    label.setData('depth', py + 0.25);
    label.setData('depthTie', i * 10 + 5);
    layer.add(label);

    // The 3D-owned resident's idle motion is driven by sanctuaryDragon3D.js
    // instead (see docs/SANCTUARY_3D_DRAGON_PLAN.md) — only its label bobs.
    const bobTween = scene.tweens.add({
      targets: [sprite, label].filter(Boolean),
      y: `-=${amplitude}`,
      duration: durationMs + i * 97,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const resident = {
      animal,
      sprite,
      label,
      shadow,
      aura,
      selectionRing,
      bobTween,
      visual,
      usesProfileTexture,
      labelLift,
      baseZoom: zoom,
      logicalFootprint,
      footprint: {
        x: px,
        y: py,
        col: logicalFootprint.col,
        row: logicalFootprint.row,
        homeCol: logicalFootprint.col,
        homeRow: logicalFootprint.row,
        homeX: px,
        homeY: py,
      },
    };
    reprojectSanctuaryResidentAffordances(resident, projectionView ?? {});
    residents.push(resident);
  });

  // Reprojection owns world visuals, while movement owns actor positions.
  // Keeping this private resident registry on the layer lets the former update
  // ellipse geometry before the latter republishes positions on a view step.
  if (layer && (typeof layer === 'object' || typeof layer === 'function')) {
    LAYER_RESIDENTS.set(layer, residents);
  }

  return residents;
}

// Keeps world labels at a readable screen size over the whole zoom range.
// Selection/hover decide emphasis; position remains owned by movement.
export function updateSanctuaryResidentReadability(
  residents,
  camera,
  selectedId,
  hoveredResidentId = null,
) {
  if (!camera?.zoom) return;
  residents.forEach((resident) => {
    if (!resident.label?.active) return;
    const rawScale = resident.baseZoom / camera.zoom;
    const scale = Math.max(
      SANCTUARY.interaction.labelMinScale,
      Math.min(SANCTUARY.interaction.labelMaxScale, rawScale),
    );
    resident.label.setScale(scale);
    const emphasized = resident.animal.id === selectedId
      || resident.animal.id === hoveredResidentId;
    resident.label.setAlpha(emphasized ? 1 : 0.58);
  });
}

// Fade tall foreground props when their projected art sits between the actor
// and camera. Only authored prop sprites are considered; tile sidewalls keep
// their normal depth ordering and never flicker from approximate hit boxes.
export function updateSanctuaryOccluders(placed, actorFootprint) {
  const occluderTypes = new Set(['tree', 'barredDoor', 'obelisk']);
  const tuning = SANCTUARY.occlusion;
  placed.decor.forEach((decor) => {
    if (!decor.sprite?.active || !occluderTypes.has(decor.type)) return;
    if (decor.sprite.getData('occlusionBaseAlpha') == null) {
      decor.sprite.setData('occlusionBaseAlpha', decor.sprite.alpha);
    }
    const baseAlpha = decor.sprite.getData('occlusionBaseAlpha');
    const dx = Math.abs(decor.footprint.x - (actorFootprint?.x ?? Infinity));
    const dy = decor.footprint.y - (actorFootprint?.y ?? -Infinity);
    const covered = dx <= tuning.radiusX && dy >= -4 && dy <= tuning.radiusY;
    const target = covered ? Math.min(baseAlpha, tuning.alpha) : baseAlpha;
    decor.sprite.alpha += (target - decor.sprite.alpha) * tuning.response;
  });
}

export function clearSanctuaryEffects(scene) {
  const effects = scene?._sanctuaryTransientEffects;
  if (!effects) return;
  effects.forEach((effect) => effect?.destroy?.());
  effects.clear();
}

function trackSanctuaryEffect(scene, effect) {
  if (!scene._sanctuaryTransientEffects) scene._sanctuaryTransientEffects = new Set();
  scene._sanctuaryTransientEffects.add(effect);
  return () => scene._sanctuaryTransientEffects?.delete(effect);
}

// Short footprint effects make management actions readable even while a
// wyvern's sprite is visually airborne. Effects are procedural and disposable,
// so the sanctuary still runs with no external art.
export function playSanctuaryEffect(scene, layer, footprint, kind, view = {}) {
  if (!footprint) return;
  const colors = {
    restore: 0x63d8ff,
    train: 0xf6c453,
    feed: 0xf472b6,
    select: 0xa78bfa,
    atlas: 0x7dd3fc,
    dracarys: 0xff3300,
  };
  const color = colors[kind] ?? 0xffffff;
  const groundDepth = interactionGroundDepth(footprint, view);
  const ring = scene.add.ellipse(footprint.x, footprint.y + 2, 34, 11, color, 0.12);
  const groundTransform = applyGroundPlaneTransform(ring, view);
  const releaseRing = trackSanctuaryEffect(scene, ring);
  ring.setStrokeStyle(2, color, 0.9);
  ring.setData('depth', groundDepth + 0.04);
  layer.add(ring);

  scene.tweens.add({
    targets: ring,
    scaleX: groundTransform.scaleX * 1.8,
    scaleY: groundTransform.scaleY * 1.8,
    alpha: 0,
    duration: 520,
    ease: 'Sine.easeOut',
    onComplete: () => { releaseRing(); ring.destroy(); },
  });

  if (kind !== 'feed' && kind !== 'train' && kind !== 'dracarys') return;
  const glyph = scene.add.text(
    footprint.x,
    footprint.y - 20,
    kind === 'feed' ? '♥' : (kind === 'dracarys' ? '🔥' : '✦'),
    { font: '18px monospace', color: kind === 'feed' ? '#f9a8d4' : (kind === 'dracarys' ? '#f97316' : '#fde68a') },
  );
  const releaseGlyph = trackSanctuaryEffect(scene, glyph);
  glyph.setOrigin(0.5);
  glyph.setData('depth', groundDepth + 0.05);
  layer.add(glyph);
  scene.tweens.add({
    targets: glyph,
    y: glyph.y - 24,
    alpha: 0,
    duration: 620,
    ease: 'Sine.easeOut',
    onComplete: () => { releaseGlyph(); glyph.destroy(); },
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
