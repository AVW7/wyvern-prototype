// Sanctuary-only resident movement. Navigation lives on the unlifted isometric
// ground plane; terrain surface lift and flying are presentation offsets only.
// This keeps collision, camera following, interactions, and depth sorting in
// agreement even while a wyvern is visibly above the tile it occupies.
import {
  ISO, SANCTUARY, TERRAIN, WYVERN_ART, WYVERN_STATES,
} from '../config.js';
import { sortByDepth } from './iso.js';
import {
  normalizeView,
  projectFootprint,
  projectVector,
  unprojectVector,
  viewDirectionForWorldVector,
} from './sanctuaryProjection.js';
import { wyvernAnimationKey } from '../data/wyverns.js';

const DEFAULT_MOVEMENT = Object.freeze({
  speed: 120, // ground-plane screen pixels per second
  flightLift: 14,
  flightResponseMs: WYVERN_ART.flightLiftResponseMs,
  bobAmplitude: WYVERN_ART.flightBobAmplitude,
  bobRate: 0.008,
  collisionRadius: 3,
  collisionStep: 5,
  climbStep: 1, // height levels the actor climbs onto in one step (cliffs above this block)
  maxDeltaMs: 100,
  actionDurationMs: 650,
  // Real (not cosmetic) flight altitude, in Three.js world units above the tile
  // surface. Overridden by SANCTUARY.movement.flight; see config.js.
  flight: {
    minAltitude: 0,
    maxAltitude: 140,
    takeoffAltitude: 42,
    climbSpeed: 90, // world units/sec while holding ascend/descend
    settleHz: 2.5, // how fast altitude eases toward its target (and lands)
  },
});

const DIRECTION_SECTORS = Object.freeze([
  'e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne',
]);
const DEFAULT_VIEW = Object.freeze(normalizeView());
// An idle resident still has a stable world heading. Default screen-east is
// inverted once into logical space, then every camera view derives its own
// visible facing from this vector until the actor actually moves.
const DEFAULT_WORLD_FACING = Object.freeze(unprojectVector(1, 0, DEFAULT_VIEW));

// sanctuaryRender sorts a floor tile at its grid-cell center Y and ordinary
// props at center Y + 1. These small offsets keep every actor component above
// its own floor while preserving room for same-cell props and later tiles to
// occlude it according to the painter's algorithm.
const ACTOR_DEPTH_OFFSETS = Object.freeze({
  aura: 0.05,
  ring: 0.1,
  shadow: 0.15,
  sprite: 0.2,
  label: 0.25,
});

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function movementTuning(overrides = {}) {
  return {
    ...DEFAULT_MOVEMENT,
    ...(SANCTUARY.movement || {}),
    ...overrides,
  };
}

export function isBlockingDecor(decor) {
  if (!decor) return false;
  const nonBlocking = ['flowers', 'reeds', 'mushroom', 'bones', 'glow', 'torch', 'hoard'];
  return !nonBlocking.includes(decor.type);
}

/**
 * Builds a pure row/column mask. Truthy entries are authored cells that may
 * be occupied; null holes and explicit no-go cells stay false. Raised cells
 * (hills, terraces) ARE walkable — elevation is gated per step by the climb
 * rule in moveWithCollision, not by this flat mask, so the actor can walk up a
 * hill while a sheer rise beyond climbStep still stops it.
 */
export function createWalkableMask(tiles = []) {
  return tiles.map((row) => (row || []).map((cell) => Boolean(
    cell &&
    cell.noGo !== true &&
    cell.walkable !== false &&
    (!cell.decor || !isBlockingDecor(cell.decor)),
  )));
}

/** Per-cell heights (baseHeight for holes), used by the climb-step gate. */
export function createHeightGrid(tiles = []) {
  return tiles.map((row) => (row || []).map(
    (cell) => (cell ? finite(cell.height, TERRAIN.baseHeight) : TERRAIN.baseHeight),
  ));
}

function heightAt(heights, col, row) {
  return heights?.[Math.round(row)]?.[Math.round(col)] ?? TERRAIN.baseHeight;
}

// A rise larger than climbStep is a cliff/wall the actor can't step onto;
// descending any distance is allowed (it can drop or fly down).
function climbable(heights, climbStep, fromLogical, toLogical) {
  if (!heights) return true;
  const rise = heightAt(heights, toLogical.col, toLogical.row)
    - heightAt(heights, fromLogical.col, fromLogical.row);
  return rise <= climbStep;
}

/** Accepts continuous grid coordinates and resolves them to the current cell. */
export function canOccupy(mask, colOrFootprint, rowValue) {
  const col = typeof colOrFootprint === 'object' ? colOrFootprint?.col : colOrFootprint;
  const row = typeof colOrFootprint === 'object' ? colOrFootprint?.row : rowValue;
  if (!Number.isFinite(col) || !Number.isFinite(row)) return false;
  return mask[Math.round(row)]?.[Math.round(col)] === true;
}

function sameView(a, b) {
  return a.yawDeg === b.yawDeg && a.elevationStep === b.elevationStep;
}

function viewFrom(source, fallback = DEFAULT_VIEW) {
  const value = typeof source === 'function' ? source() : source;
  return normalizeView(value ?? fallback);
}

function logicalFromProjected(x, y, view = DEFAULT_VIEW) {
  const centreOffset = projectVector(0.5, 0.5, view);
  const projected = unprojectVector(
    x - ISO.originX - centreOffset.x,
    y - ISO.originY - centreOffset.y,
    view,
  );
  return { col: projected.col, row: projected.row };
}

function projectedFromLogical(logical, view = DEFAULT_VIEW) {
  const point = projectFootprint(logical.col, logical.row, TERRAIN.baseHeight, view);
  return { x: point.x, y: point.y, col: logical.col, row: logical.row };
}

function surfaceLiftAt(tiles, logical, view = DEFAULT_VIEW) {
  const cell = tiles[Math.round(logical.row)]?.[Math.round(logical.col)];
  if (!cell) return 0;
  const height = finite(cell.height, TERRAIN.baseHeight);
  const ground = projectFootprint(logical.col, logical.row, TERRAIN.baseHeight, view);
  const surface = projectFootprint(logical.col, logical.row, height, view);
  return Math.max(0, ground.y - surface.y);
}

function worldMetricVector(deltaCol, deltaRow) {
  return projectVector(deltaCol, deltaRow, DEFAULT_VIEW);
}

function worldMetricLength(deltaCol, deltaRow) {
  const projected = worldMetricVector(deltaCol, deltaRow);
  return Math.hypot(projected.x, projected.y);
}

function logicalRadiusSamples(radius) {
  if (!(radius > 0)) return [{ col: 0, row: 0 }];
  return [
    { col: 0, row: 0 },
    unprojectVector(radius, 0, DEFAULT_VIEW),
    unprojectVector(-radius, 0, DEFAULT_VIEW),
    unprojectVector(0, radius, DEFAULT_VIEW),
    unprojectVector(0, -radius, DEFAULT_VIEW),
  ];
}

function canOccupyLogical(mask, logical, radius = 0) {
  return logicalRadiusSamples(radius).every((offset) => canOccupy(
    mask,
    logical.col + offset.col,
    logical.row + offset.row,
  ));
}

export function nearestWalkable(mask, col, row) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (let candidateRow = 0; candidateRow < mask.length; candidateRow += 1) {
    for (let candidateCol = 0; candidateCol < (mask[candidateRow]?.length || 0); candidateCol += 1) {
      if (!mask[candidateRow][candidateCol]) continue;
      const distance = (candidateCol - col) ** 2 + (candidateRow - row) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = { col: candidateCol, row: candidateRow };
      }
    }
  }
  return nearest;
}

export function findPath(mask, heights, start, end, options = {}) {
  const { range = 0, climbStep = 1 } = options;
  const startCol = Math.round(start.col);
  const startRow = Math.round(start.row);
  const endCol = Math.round(end.col);
  const endRow = Math.round(end.row);

  const numRows = mask.length;
  const numCols = mask[0]?.length || 0;
  if (
    startCol < 0 || startCol >= numCols ||
    startRow < 0 || startRow >= numRows ||
    endCol < 0 || endCol >= numCols ||
    endRow < 0 || endRow >= numRows
  ) {
    return null;
  }

  const distToTarget = (c, r) => {
    const p1 = projectFootprint(c, r, TERRAIN.baseHeight, DEFAULT_VIEW);
    const p2 = projectFootprint(endCol, endRow, TERRAIN.baseHeight, DEFAULT_VIEW);
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  };

  if (range > 0) {
    if (distToTarget(startCol, startRow) <= range) {
      return [];
    }
  } else if (startCol === endCol && startRow === endRow) {
    return [];
  }

  const openSet = [];
  const closedSet = new Set();
  const toKey = (c, r) => `${c},${r}`;

  const startNode = {
    col: startCol,
    row: startRow,
    g: 0,
    h: distToTarget(startCol, startRow),
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  openSet.push(startNode);

  while (openSet.length > 0) {
    let currentIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (openSet[i].f < openSet[currentIdx].f) {
        currentIdx = i;
      }
    }

    const current = openSet[currentIdx];

    const isGoal = range > 0
      ? distToTarget(current.col, current.row) <= range
      : (current.col === endCol && current.row === endRow);

    if (isGoal) {
      const path = [];
      let temp = current;
      while (temp) {
        path.push({ col: temp.col, row: temp.row });
        temp = temp.parent;
      }
      path.reverse();
      if (path.length > 0 && path[0].col === startCol && path[0].row === startRow) {
        path.shift();
      }
      return path;
    }

    openSet.splice(currentIdx, 1);
    closedSet.add(toKey(current.col, current.row));

    const neighbors = [
      { col: current.col + 1, row: current.row, dist: 1 },
      { col: current.col - 1, row: current.row, dist: 1 },
      { col: current.col, row: current.row + 1, dist: 1 },
      { col: current.col, row: current.row - 1, dist: 1 },
      { col: current.col + 1, row: current.row + 1, dist: Math.SQRT2, diag: true, adj1: { col: current.col + 1, row: current.row }, adj2: { col: current.col, row: current.row + 1 } },
      { col: current.col - 1, row: current.row + 1, dist: Math.SQRT2, diag: true, adj1: { col: current.col - 1, row: current.row }, adj2: { col: current.col, row: current.row + 1 } },
      { col: current.col + 1, row: current.row - 1, dist: Math.SQRT2, diag: true, adj1: { col: current.col + 1, row: current.row }, adj2: { col: current.col, row: current.row - 1 } },
      { col: current.col - 1, row: current.row - 1, dist: Math.SQRT2, diag: true, adj1: { col: current.col - 1, row: current.row }, adj2: { col: current.col, row: current.row - 1 } },
    ];

    for (const neighbor of neighbors) {
      if (
        neighbor.col < 0 || neighbor.col >= numCols ||
        neighbor.row < 0 || neighbor.row >= numRows
      ) {
        continue;
      }
      if (!mask[neighbor.row][neighbor.col]) {
        continue;
      }
      if (!climbable(heights, climbStep, current, neighbor)) {
        continue;
      }

      if (neighbor.diag) {
        const canAdj1 = mask[neighbor.adj1.row]?.[neighbor.adj1.col]
          && climbable(heights, climbStep, current, neighbor.adj1);
        const canAdj2 = mask[neighbor.adj2.row]?.[neighbor.adj2.col]
          && climbable(heights, climbStep, current, neighbor.adj2);
        if (!canAdj1 || !canAdj2) {
          continue;
        }
      }

      if (closedSet.has(toKey(neighbor.col, neighbor.row))) {
        continue;
      }

      const gScore = current.g + neighbor.dist;
      let openNeighbor = openSet.find((node) => node.col === neighbor.col && node.row === neighbor.row);

      if (!openNeighbor) {
        openNeighbor = {
          col: neighbor.col,
          row: neighbor.row,
          g: gScore,
          h: distToTarget(neighbor.col, neighbor.row),
          parent: current,
        };
        openNeighbor.f = openNeighbor.g + openNeighbor.h;
        openSet.push(openNeighbor);
      } else if (gScore < openNeighbor.g) {
        openNeighbor.g = gScore;
        openNeighbor.f = openNeighbor.g + openNeighbor.h;
        openNeighbor.parent = current;
      }
    }
  }

  return null;
}

function resolveInitialLogical(resident, mask, view = DEFAULT_VIEW) {
  const supplied = resident?.footprint;
  let logical;
  if (Number.isFinite(supplied?.col) && Number.isFinite(supplied?.row)) {
    logical = { col: supplied.col, row: supplied.row };
  } else if (Number.isFinite(supplied?.x) && Number.isFinite(supplied?.y)) {
    logical = logicalFromProjected(supplied.x, supplied.y, view);
  } else if (Number.isFinite(resident?.sprite?.x) && Number.isFinite(resident?.sprite?.y)) {
    logical = logicalFromProjected(resident.sprite.x, resident.sprite.y, view);
  } else {
    logical = { col: 0, row: 0 };
  }
  if (canOccupy(mask, logical)) return logical;
  return nearestWalkable(mask, logical.col, logical.row) || logical;
}

function stopResidentBob(scene, resident) {
  const tween = resident?.bobTween;
  if (tween?.remove) tween.remove();
  else if (tween?.stop) tween.stop();

  // Older resident handles may not expose their tween. Kill only the two
  // bobbed objects, never ambient sanctuary tweens or other residents.
  [resident?.sprite, resident?.label].forEach((target) => {
    if (target && scene?.tweens?.killTweensOf) scene.tweens.killTweensOf(target);
  });
  if (resident) resident.bobTween = null;
}

function objectAlive(object) {
  return Boolean(object && object.active !== false && !object.destroyed);
}

function setPosition(object, x, y) {
  if (!objectAlive(object)) return;
  if (object.setPosition) object.setPosition(x, y);
  else {
    object.x = x;
    object.y = y;
  }
}

function setDepthData(object, depth) {
  if (!objectAlive(object)) return;
  if (object.setData) object.setData('depth', depth);
}

function capturePresentation(scene, resident, footprint, tiles) {
  stopResidentBob(scene, resident);
  if (resident?._sanctuaryMovementPresentation) {
    return resident._sanctuaryMovementPresentation;
  }
  const sprite = resident?.sprite;
  const spriteX = finite(sprite?.x, footprint.x);
  const spriteY = finite(sprite?.y, footprint.y);
  const label = resident?.label;

  // Sprite and label were the only bob-tween targets. Their relationship is
  // stable even if selection happens halfway through the old tween, while the
  // sprite itself is deliberately snapped back to the authoritative footprint.
  const presentation = {
    spriteOffsetX: spriteX - footprint.x,
    spriteOffsetY: 0,
    labelOffsetX: finite(label?.x, spriteX) - spriteX,
    labelOffsetY: finite(label?.y, spriteY) - spriteY,
    shadowOffsetX: finite(resident?.shadow?.x, footprint.x) - footprint.x,
    shadowOffsetY: finite(resident?.shadow?.y, footprint.y + 2) - footprint.y,
    auraOffsetX: finite(resident?.aura?.x, footprint.x) - footprint.x,
    auraOffsetY: finite(resident?.aura?.y, footprint.y + 1) - footprint.y,
    ringOffsetX: finite(resident?.selectionRing?.x, footprint.x) - footprint.x,
    ringOffsetY: finite(resident?.selectionRing?.y, footprint.y + 1) - footprint.y,
    shadowScaleX: finite(resident?.shadow?.scaleX, 1),
    shadowScaleY: finite(resident?.shadow?.scaleY, 1),
    shadowAlpha: finite(resident?.shadow?.alpha, WYVERN_ART.sanctuaryShadow.alpha),
    auraScaleX: finite(resident?.aura?.scaleX, 1),
    auraScaleY: finite(resident?.aura?.scaleY, 1),
    auraAlpha: finite(resident?.aura?.alpha, WYVERN_ART.sanctuaryAura.alpha),
  };
  if (resident) resident._sanctuaryMovementPresentation = presentation;
  return presentation;
}

function publishFootprint(resident, footprint, logical, tiles, view = DEFAULT_VIEW) {
  const projected = projectedFromLogical(logical, view);
  footprint.x = projected.x;
  footprint.y = projected.y;
  footprint.col = logical.col;
  footprint.row = logical.row;
  footprint.surfaceLift = surfaceLiftAt(tiles, logical, view);
  if (resident) {
    resident.footprint = footprint;
    if (resident.logicalFootprint && typeof resident.logicalFootprint === 'object') {
      resident.logicalFootprint.col = logical.col;
      resident.logicalFootprint.row = logical.row;
    } else {
      resident.logicalFootprint = { col: logical.col, row: logical.row };
    }
  }
  return footprint;
}

function directionForWorld(vector, view, fallback = 'e') {
  return viewDirectionForWorldVector(
    finite(vector?.col, 0),
    finite(vector?.row, 0),
    view,
    DIRECTION_SECTORS.includes(fallback) ? fallback : 'e',
  );
}

function animationExists(scene, key) {
  return scene?.anims?.exists ? scene.anims.exists(key) : true;
}

function playResidentState(scene, resident, state, direction, previousKey) {
  const { sprite, animal } = resident || {};
  if (!objectAlive(sprite) || !animal?.assetKey || typeof sprite.play !== 'function') {
    return previousKey;
  }
  const directionalKey = wyvernAnimationKey(animal, state, direction);
  const baseKey = wyvernAnimationKey(animal, state);
  const key = animationExists(scene, directionalKey) ? directionalKey : baseKey;
  if (key === previousKey) return previousKey;
  if (animationExists(scene, key)) sprite.play(key, true);
  return key;
}

function normalizedInput(keys) {
  let dx = 0;
  let dy = 0;
  if (keys?.LEFT?.isDown || keys?.A?.isDown) dx -= 1;
  if (keys?.RIGHT?.isDown || keys?.D?.isDown) dx += 1;
  if (keys?.UP?.isDown || keys?.W?.isDown) dy -= 1;
  if (keys?.DOWN?.isDown || keys?.S?.isDown) dy += 1;
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 };
}

function logicalInputVector(input, view) {
  if (input.x === 0 && input.y === 0) return { col: 0, row: 0 };
  const logical = unprojectVector(input.x, input.y, view);
  const metricLength = worldMetricLength(logical.col, logical.row);
  if (!(metricLength > 0)) return { col: 0, row: 0 };
  return {
    col: logical.col / metricLength,
    row: logical.row / metricLength,
  };
}

function blockedBy(source, controller) {
  const value = typeof source === 'function' ? source(controller) : source;
  return Boolean(value);
}

// Swept steps prevent a long frame from tunnelling through a one-cell cliff or
// island edge. Axis retries provide natural sliding instead of sticky corners.
function moveWithCollision(mask, logical, deltaCol, deltaRow, tuning, heights = null) {
  const distance = worldMetricLength(deltaCol, deltaRow);
  if (!(distance > 0)) return false;
  const stepLimit = Math.max(1, finite(tuning.collisionStep, DEFAULT_MOVEMENT.collisionStep));
  const steps = Math.max(1, Math.ceil(distance / stepLimit));
  const stepCol = deltaCol / steps;
  const stepRow = deltaRow / steps;
  const radius = Math.max(0, finite(tuning.collisionRadius, 0));
  const climbStep = finite(tuning.climbStep, DEFAULT_MOVEMENT.climbStep);
  // A destination is enterable when it's on the walkable mask AND the rise onto
  // it from where the actor stands now is within one climb step.
  const enterable = (dest) => canOccupyLogical(mask, dest, radius)
    && climbable(heights, climbStep, logical, dest);
  let moved = false;

  for (let step = 0; step < steps; step += 1) {
    const target = {
      col: logical.col + stepCol,
      row: logical.row + stepRow,
    };
    if (enterable(target)) {
      logical.col = target.col;
      logical.row = target.row;
      moved = true;
      continue;
    }

    if (stepCol !== 0 && enterable({ col: target.col, row: logical.row })) {
      logical.col = target.col;
      moved = true;
    }
    if (stepRow !== 0 && enterable({ col: logical.col, row: target.row })) {
      logical.row = target.row;
      moved = true;
    }
  }
  return moved;
}

function syncPresentation(
  resident,
  footprint,
  presentation,
  flight,
  tuning,
  view = DEFAULT_VIEW,
) {
  if (!resident || !presentation) return;
  const { sprite, shadow, label, aura, selectionRing } = resident;
  const visualGroundY = footprint.y - footprint.surfaceLift;
  const flyingOffset = flight.lift + flight.bob;
  const spriteX = footprint.x + presentation.spriteOffsetX;
  const spriteY = visualGroundY + presentation.spriteOffsetY - flyingOffset;

  setPosition(sprite, spriteX, spriteY);
  setPosition(
    label,
    spriteX + presentation.labelOffsetX,
    spriteY + presentation.labelOffsetY,
  );
  setPosition(
    shadow,
    footprint.x + presentation.shadowOffsetX,
    visualGroundY + presentation.shadowOffsetY,
  );
  setPosition(
    aura,
    footprint.x + presentation.auraOffsetX,
    visualGroundY + presentation.auraOffsetY,
  );
  setPosition(
    selectionRing,
    footprint.x + presentation.ringOffsetX,
    visualGroundY + presentation.ringOffsetY,
  );

  // All sort keys stay on the unlifted footprint. While traversing the upper
  // half of a rounded owning cell, continuous Y is above that cell's center;
  // clamping to the center prevents the floor tile from painting over the
  // actor. The clamp changes sorting only, never navigation or interaction.
  const owningCell = projectFootprint(
    Math.round(footprint.col),
    Math.round(footprint.row),
    TERRAIN.baseHeight,
    view,
  );
  const actorDepth = Math.max(footprint.y, owningCell.y);
  setDepthData(aura, actorDepth + ACTOR_DEPTH_OFFSETS.aura);
  setDepthData(selectionRing, actorDepth + ACTOR_DEPTH_OFFSETS.ring);
  setDepthData(shadow, actorDepth + ACTOR_DEPTH_OFFSETS.shadow);
  setDepthData(sprite, actorDepth + ACTOR_DEPTH_OFFSETS.sprite);
  setDepthData(label, actorDepth + ACTOR_DEPTH_OFFSETS.label);

  const liftDenominator = Math.max(finite(tuning.flightLift, 0), 1);
  const flightRatio = clamp(flight.lift / liftDenominator, 0, 1);
  if (objectAlive(shadow)) {
    shadow.setScale?.(
      presentation.shadowScaleX * (1 - flightRatio * 0.22),
      presentation.shadowScaleY * (1 - flightRatio * 0.22),
    );
    shadow.setAlpha?.(presentation.shadowAlpha * (1 - flightRatio * 0.44));
  }
  if (objectAlive(aura)) {
    const pulse = 1 + Math.sin(flight.phase * 0.45) * 0.025;
    aura.setScale?.(
      presentation.auraScaleX * pulse * (1 - flightRatio * 0.06),
      presentation.auraScaleY * pulse * (1 - flightRatio * 0.06),
    );
    aura.setAlpha?.(presentation.auraAlpha * (1 - flightRatio * 0.25));
  }
}

function updateFlight(flight, delta, moving, tuning) {
  const responseMs = Math.max(1, finite(tuning.flightResponseMs, DEFAULT_MOVEMENT.flightResponseMs));
  const response = 1 - Math.exp(-delta / responseMs);
  const targetLift = moving ? Math.max(0, finite(tuning.flightLift, 0)) : 0;
  flight.lift += (targetLift - flight.lift) * response;
  flight.phase += delta * finite(tuning.bobRate, DEFAULT_MOVEMENT.bobRate);
  flight.bob = moving
    ? Math.sin(flight.phase) * finite(tuning.bobAmplitude, 0)
    : 0;
}

function isResidentActionLocked(resident, time = 0) {
  if (!resident) return false;
  if (resident.actionLocked || resident.locked) return true;
  if (Number.isFinite(resident.actionLockedUntil) && resident.actionLockedUntil > time) return true;
  return Boolean(resident.sprite?.getData?.('actionLocked'));
}

/**
 * Direct-control factory used by BaseScene.
 *
 * Public state: `footprint`, `isMoving`, and `moved`. `update(time, delta)`
 * returns the same moved flag for convenient scene orchestration.
 */
export function createSanctuaryMovement({
  scene,
  layer,
  tiles,
  resident,
  tuning = {},
  keys: suppliedKeys,
  onMoveStart,
  view = DEFAULT_VIEW,
  getView = null,
  inputBlocked = false,
} = {}) {
  const mask = createWalkableMask(tiles);
  const flyingMask = tiles.map((row) => (row || []).map((cell) => Boolean(
    cell && (!cell.decor || !isBlockingDecor(cell.decor)),
  )));
  const heights = createHeightGrid(tiles);
  const config = movementTuning(tuning);
  const keys = suppliedKeys || scene?.input?.keyboard?.addKeys?.(
    'W,A,S,D,UP,DOWN,LEFT,RIGHT,Q,R',
  ) || {};
  const initialView = viewFrom(getView ?? view);

  const controller = {
    scene,
    layer,
    tiles: tiles || [],
    get mask() {
      return this.isFlying ? flyingMask : mask;
    },
    heights,
    resident: null,
    footprint: null,
    logical: null,
    view: initialView,
    getView,
    inputBlocked,
    isMoving: false,
    moved: false,
    isFlying: false,
    direction: directionForWorld(DEFAULT_WORLD_FACING, initialView, 'e'),
    lastWorldVector: { ...DEFAULT_WORLD_FACING },
    state: WYVERN_STATES.IDLE,
    enabled: true,
    destroyed: false,
    presentation: null,
    animationKey: null,
    actionState: null,
    actionRemainingMs: 0,
    flight: { lift: 0, bob: 0, phase: 0 },
    // Real flight altitude (Three.js world units above the tile surface). The
    // 3D layer reads getAltitude(); the 2D footprint stays flat, so pathing,
    // collision, depth-sort, and interaction range are unaffected by height.
    altitude: 0,
    targetAltitude: 0,
    path: null,
    get climbStep() {
      return this.isFlying ? Infinity : config.climbStep;
    },

    getFootprint() {
      return this.footprint ? { ...this.footprint } : null;
    },

    getAltitude() {
      return this.altitude;
    },

    setAltitude(alt) {
      this.targetAltitude = alt;
      this.altitude = alt;
      this.isFlying = alt > 0;
    },

    getLogicalFootprint() {
      return this.logical ? { ...this.logical } : null;
    },

    setPath(nextPath) {
      this.path = nextPath || null;
      return this;
    },

    setFlying(flying) {
      const next = Boolean(flying);
      const flightCfg = config.flight || DEFAULT_MOVEMENT.flight;
      if (next && !this.isFlying) {
        // Seed a visible lift-off so takeoff reads immediately; the player then
        // trims altitude with the ascend/descend keys.
        this.targetAltitude = clamp(
          Math.max(this.targetAltitude, finite(flightCfg.takeoffAltitude, 42)),
          finite(flightCfg.minAltitude, 0),
          finite(flightCfg.maxAltitude, 140),
        );
      } else if (!next) {
        // Landing: ease back down to the surface.
        this.targetAltitude = finite(flightCfg.minAltitude, 0);
      }
      this.isFlying = next;
      return this;
    },

    setInputBlocked(blocked) {
      this.inputBlocked = blocked;
      return this;
    },

    setView(nextView) {
      const normalized = viewFrom(nextView, this.view);
      const changed = !sameView(normalized, this.view);
      this.view = normalized;
      if (!this.resident || !this.footprint || !this.logical || !this.presentation) {
        return changed;
      }
      publishFootprint(
        this.resident, this.footprint, this.logical, this.tiles, this.view,
      );
      this.direction = directionForWorld(
        this.lastWorldVector, this.view, this.direction,
      );
      this.animationKey = playResidentState(
        this.scene, this.resident, this.state, this.direction, this.animationKey,
      );
      syncPresentation(
        this.resident,
        this.footprint,
        this.presentation,
        this.flight,
        config,
        this.view,
      );
      if (changed && this.layer) sortByDepth(this.layer);
      return changed;
    },

    refreshView() {
      if (typeof this.getView !== 'function') return false;
      return this.setView(this.getView());
    },

    setResident(nextResident) {
      // A reusable controller may hand its actor back to the wander system.
      // Land and restore that actor before replacing the references; otherwise
      // its sprite/shadow can remain frozen in the previous flight pose.
      if (this.resident && this.footprint && this.logical && this.presentation
        && objectAlive(this.resident.sprite)) {
        this.flight.lift = 0;
        this.flight.bob = 0;
        publishFootprint(
          this.resident, this.footprint, this.logical, this.tiles, this.view,
        );
        syncPresentation(
          this.resident,
          this.footprint,
          this.presentation,
          this.flight,
          config,
          this.view,
        );
        playResidentState(
          this.scene, this.resident, WYVERN_STATES.IDLE, this.direction, null,
        );
      }
      this.resident = nextResident || null;
      this.isMoving = false;
      this.moved = false;
      this.isFlying = false;
      this.altitude = 0;
      this.targetAltitude = 0;
      this.path = null;
      this.actionState = null;
      this.actionRemainingMs = 0;
      this.flight = { lift: 0, bob: 0, phase: this.flight?.phase || 0 };
      this.animationKey = null;
      this.lastWorldVector = { ...DEFAULT_WORLD_FACING };
      this.direction = directionForWorld(this.lastWorldVector, this.view, 'e');
      if (!this.resident) {
        this.footprint = null;
        this.logical = null;
        this.presentation = null;
        return this;
      }

      this.logical = resolveInitialLogical(this.resident, this.mask, this.view);
      this.footprint = this.resident.footprint && typeof this.resident.footprint === 'object'
        ? this.resident.footprint
        : projectedFromLogical(this.logical, this.view);
      publishFootprint(
        this.resident, this.footprint, this.logical, this.tiles, this.view,
      );
      this.presentation = capturePresentation(
        this.scene, this.resident, this.footprint, this.tiles,
      );
      this.state = WYVERN_STATES.IDLE;
      this.animationKey = playResidentState(
        this.scene, this.resident, this.state, this.direction, this.animationKey,
      );
      syncPresentation(
        this.resident,
        this.footprint,
        this.presentation,
        this.flight,
        config,
        this.view,
      );
      return this;
    },

    playAction(action, duration = config.actionDurationMs) {
      if (this.destroyed || !this.resident || !Object.values(WYVERN_STATES).includes(action)) {
        return false;
      }
      this.actionState = action;
      this.actionRemainingMs = Math.max(0, finite(duration, config.actionDurationMs));
      this.isMoving = false;
      this.moved = false;
      this.state = action;
      this.animationKey = playResidentState(
        this.scene, this.resident, action, this.direction, this.animationKey,
      );
      return true;
    },

    update(timeValue, deltaValue) {
      const delta = deltaValue === undefined ? finite(timeValue, 0) : finite(deltaValue, 0);
      const time = deltaValue === undefined ? 0 : finite(timeValue, 0);
      this.refreshView();
      if (this.destroyed || !this.enabled || !this.resident || !this.footprint
        || !this.logical
        || (this.resident.sprite !== null && !objectAlive(this.resident.sprite))) {
        this.isMoving = false;
        this.moved = false;
        return false;
      }

      const poseDelta = clamp(delta, 0, Math.max(1, finite(config.maxDeltaMs, 100)));
      let moved = false;
      const externallyLocked = isResidentActionLocked(this.resident, time);

      if (this.actionState) {
        this.actionRemainingMs = Math.max(0, this.actionRemainingMs - poseDelta);
        if (this.actionRemainingMs === 0) this.actionState = null;
      }

      if (!this.actionState && !externallyLocked
        && !blockedBy(this.inputBlocked, this)) {
        const input = normalizedInput(keys);
        if (input.x !== 0 || input.y !== 0) {
          this.path = null;
          const beforeCol = this.logical.col;
          const beforeRow = this.logical.row;
          const worldInput = logicalInputVector(input, this.view);
          const distance = Math.max(0, finite(config.speed, DEFAULT_MOVEMENT.speed))
            * poseDelta / 1000;
          moved = moveWithCollision(
            this.mask,
            this.logical,
            worldInput.col * distance,
            worldInput.row * distance,
            { ...config, climbStep: this.climbStep },
            this.heights,
          );
          if (moved) {
            this.lastWorldVector = {
              col: this.logical.col - beforeCol,
              row: this.logical.row - beforeRow,
            };
            this.direction = directionForWorld(
              this.lastWorldVector, this.view, this.direction,
            );
          }
        } else if (this.path && this.path.length > 0) {
          const nextNode = this.path[0];
          const deltaCol = nextNode.col - this.logical.col;
          const deltaRow = nextNode.row - this.logical.row;
          const remaining = worldMetricLength(deltaCol, deltaRow);

          const isLastNode = this.path.length === 1;
          const tolerance = isLastNode ? 2 : 6;

          if (remaining <= tolerance) {
            this.path.shift();
            if (this.path.length === 0) {
              this.path = null;
            }
          } else {
            const distance = Math.min(
              remaining,
              Math.max(0, finite(config.speed, DEFAULT_MOVEMENT.speed)) * poseDelta / 1000,
            );
            const beforeCol = this.logical.col;
            const beforeRow = this.logical.row;
            moved = moveWithCollision(
              this.mask,
              this.logical,
              deltaCol / remaining * distance,
              deltaRow / remaining * distance,
              { ...config, climbStep: this.climbStep },
              this.heights,
            );
            if (moved) {
              this.lastWorldVector = {
                col: this.logical.col - beforeCol,
                row: this.logical.row - beforeRow,
              };
              this.direction = directionForWorld(
                this.lastWorldVector, this.view, this.direction,
              );
            } else {
              this.path = null;
            }
          }
        }
      }

      const wasMoving = this.isMoving;
      this.isMoving = moved;
      this.moved = moved;
      publishFootprint(
        this.resident, this.footprint, this.logical, this.tiles, this.view,
      );

      const nextState = this.actionState || (this.isFlying ? WYVERN_STATES.FLY : (moved ? WYVERN_STATES.FLY : WYVERN_STATES.IDLE));
      if (nextState !== this.state || moved) {
        this.state = nextState;
        this.animationKey = playResidentState(
          this.scene, this.resident, nextState, this.direction, this.animationKey,
        );
      }
      // Real flight altitude. R ascends / Q descends while flying (E is taken by
      // Interact); the value is clamped to the configured ceiling/floor and
      // always eases toward its target, so toggling flight off lands smoothly.
      const flightCfg = config.flight || DEFAULT_MOVEMENT.flight;
      const canControlAltitude = !this.actionState && !externallyLocked
        && !blockedBy(this.inputBlocked, this);
      if (this.isFlying && canControlAltitude) {
        const ascend = (keys?.R?.isDown ? 1 : 0) - (keys?.Q?.isDown ? 1 : 0);
        if (ascend !== 0) {
          this.targetAltitude = clamp(
            this.targetAltitude + ascend * finite(flightCfg.climbSpeed, 90) * poseDelta / 1000,
            finite(flightCfg.minAltitude, 0),
            finite(flightCfg.maxAltitude, 140),
          );
        }
      } else if (!this.isFlying) {
        this.targetAltitude = finite(flightCfg.minAltitude, 0);
      }
      const altitudeEase = 1 - Math.exp(
        -(poseDelta / 1000) * Math.max(0.001, finite(flightCfg.settleHz, 2.5)),
      );
      this.altitude += (this.targetAltitude - this.altitude) * altitudeEase;

      updateFlight(this.flight, poseDelta, moved || this.isFlying, config);
      syncPresentation(
        this.resident,
        this.footprint,
        this.presentation,
        this.flight,
        config,
        this.view,
      );
      if (moved && this.layer) sortByDepth(this.layer);
      if (moved && !wasMoving && typeof onMoveStart === 'function') onMoveStart(this);
      return moved;
    },

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.enabled = false;
      this.isMoving = false;
      this.moved = false;
      this.path = null;
      this.actionState = null;
      if (this.resident && this.footprint && this.logical
        && objectAlive(this.resident.sprite)) {
        this.flight.lift = 0;
        this.flight.bob = 0;
        publishFootprint(
          this.resident, this.footprint, this.logical, this.tiles, this.view,
        );
        syncPresentation(
          this.resident,
          this.footprint,
          this.presentation,
          this.flight,
          config,
          this.view,
        );
        playResidentState(
          this.scene, this.resident, WYVERN_STATES.IDLE, this.direction, null,
        );
      }
      this.resident = null;
      this.logical = null;
      this.presentation = null;
    },
  };

  return controller.setResident(resident);
}

const DEFAULT_WANDER = Object.freeze({
  radius: 48,
  speed: 18, // ground-plane screen pixels per second
  pauseMinMs: 1700,
  pauseMaxMs: 4200,
  targetTolerance: 2,
  targetAttempts: 12,
});

function wanderTuning(overrides = {}) {
  return {
    ...movementTuning(),
    ...DEFAULT_WANDER,
    ...(SANCTUARY.wander || {}),
    ...overrides,
  };
}

function randomRange(random, min, max) {
  return min + clamp(finite(random(), 0.5), 0, 1) * (max - min);
}

function makeWanderTarget(record, mask, config, random) {
  const radius = Math.max(0, finite(config.radius, DEFAULT_WANDER.radius));
  const attempts = Math.max(1, Math.floor(finite(
    config.targetAttempts, DEFAULT_WANDER.targetAttempts,
  )));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // sqrt produces an even distribution across the home circle rather than
    // clustering every resident around its outer edge.
    const angle = randomRange(random, 0, Math.PI * 2);
    const distance = Math.sqrt(randomRange(random, 0, 1)) * radius;
    const offset = unprojectVector(
      Math.cos(angle) * distance,
      Math.sin(angle) * distance,
      DEFAULT_VIEW,
    );
    const target = {
      col: record.home.col + offset.col,
      row: record.home.row + offset.row,
    };
    if (canOccupyLogical(mask, target, config.collisionRadius)) return target;
  }
  return canOccupyLogical(mask, record.home, config.collisionRadius)
    ? { ...record.home }
    : null;
}

function resolveLogicalHome(resident, logical, view) {
  const source = resident?.footprint;
  if (Number.isFinite(source?.homeCol) && Number.isFinite(source?.homeRow)) {
    return { col: source.homeCol, row: source.homeRow };
  }
  if (Number.isFinite(source?.homeX) && Number.isFinite(source?.homeY)) {
    return logicalFromProjected(source.homeX, source.homeY, view);
  }
  return { ...logical };
}

function beginWanderPause(record, config, random) {
  const min = Math.max(0, finite(config.pauseMinMs, DEFAULT_WANDER.pauseMinMs));
  const max = Math.max(min, finite(config.pauseMaxMs, DEFAULT_WANDER.pauseMaxMs));
  record.pauseRemainingMs = randomRange(random, min, max);
  record.target = null;
  record.path = null;
}

/**
 * Gives every non-controlled resident short, bounded trips around its authored
 * home footprint. Selection can change without rebuilding the factory: the
 * newly excluded handle is immediately left for the direct controller, while
 * the formerly selected handle resumes wandering from its current footprint.
 */
export function createSanctuaryWanderers({
  scene,
  layer,
  tiles,
  residents = [],
  excludeId = null,
  tuning = {},
  view = DEFAULT_VIEW,
  getView = null,
  inputBlocked = false,
} = {}) {
  const mask = createWalkableMask(tiles);
  const heights = createHeightGrid(tiles);
  const config = wanderTuning(tuning);
  const random = typeof tuning.random === 'function' ? tuning.random : Math.random;
  const initialView = viewFrom(getView ?? view);

  const records = residents.map((resident) => {
    const logical = resolveInitialLogical(resident, mask, initialView);
    const footprint = resident?.footprint && typeof resident.footprint === 'object'
      ? resident.footprint
      : projectedFromLogical(logical, initialView);
    const home = resolveLogicalHome(resident, logical, initialView);
    publishFootprint(resident, footprint, logical, tiles || [], initialView);
    return {
      resident,
      footprint,
      logical,
      home,
      presentation: null,
      flight: { lift: 0, bob: 0, phase: randomRange(random, 0, Math.PI * 2) },
      direction: directionForWorld(DEFAULT_WORLD_FACING, initialView, 'e'),
      lastWorldVector: { ...DEFAULT_WORLD_FACING },
      state: WYVERN_STATES.IDLE,
      animationKey: null,
      target: null,
      path: null,
      pauseRemainingMs: randomRange(
        random,
        Math.max(0, finite(config.pauseMinMs, DEFAULT_WANDER.pauseMinMs)),
        Math.max(
          finite(config.pauseMinMs, DEFAULT_WANDER.pauseMinMs),
          finite(config.pauseMaxMs, DEFAULT_WANDER.pauseMaxMs),
        ),
      ),
      isMoving: false,
    };
  });

  function activateRecord(record, activeView, resetFlight = false) {
    if (!objectAlive(record.resident?.sprite)) return;
    // A controlled actor may have roamed since this record was created. Reuse
    // its live public footprint instead of snapping back to the old position.
    const live = record.resident.footprint;
    if (live && typeof live === 'object') {
      record.footprint = live;
      if (Number.isFinite(live.col) && Number.isFinite(live.row)) {
        record.logical = { col: live.col, row: live.row };
      } else if (Number.isFinite(live.x) && Number.isFinite(live.y)) {
        record.logical = logicalFromProjected(live.x, live.y, activeView);
      }
    }
    publishFootprint(
      record.resident, record.footprint, record.logical, tiles || [], activeView,
    );
    if (!record.presentation) {
      record.presentation = capturePresentation(
        scene, record.resident, record.footprint, tiles || [],
      );
      record.animationKey = playResidentState(
        scene,
        record.resident,
        WYVERN_STATES.IDLE,
        record.direction,
        record.animationKey,
      );
    }
    if (resetFlight) {
      record.flight.lift = 0;
      record.flight.bob = 0;
      record.state = WYVERN_STATES.IDLE;
      record.animationKey = null;
      record.animationKey = playResidentState(
        scene,
        record.resident,
        WYVERN_STATES.IDLE,
        record.direction,
        record.animationKey,
      );
    }
    record.direction = directionForWorld(
      record.lastWorldVector, activeView, record.direction,
    );
    record.animationKey = playResidentState(
      scene, record.resident, record.state, record.direction, record.animationKey,
    );
    syncPresentation(
      record.resident,
      record.footprint,
      record.presentation,
      record.flight,
      config,
      activeView,
    );
  }

  records.forEach((record) => {
    if (record.resident?.animal?.id !== excludeId) activateRecord(record, initialView);
  });

  const controller = {
    scene,
    layer,
    tiles: tiles || [],
    mask,
    records,
    excludeId,
    view: initialView,
    getView,
    inputBlocked,
    destroyed: false,

    getLogicalFootprint(id) {
      const record = this.records.find((entry) => entry.resident?.animal?.id === id);
      return record?.logical ? { ...record.logical } : null;
    },

    setInputBlocked(blocked) {
      this.inputBlocked = blocked;
      return this;
    },

    setView(nextView) {
      const normalized = viewFrom(nextView, this.view);
      const changed = !sameView(normalized, this.view);
      this.view = normalized;
      this.records.forEach((record) => {
        if (record.resident?.animal?.id === this.excludeId) return;
        activateRecord(record, this.view);
      });
      if (changed && this.layer) sortByDepth(this.layer);
      return changed;
    },

    refreshView() {
      if (typeof this.getView !== 'function') return false;
      return this.setView(this.getView());
    },

    setExcludedId(id) {
      const previousExcludedId = this.excludeId;
      this.excludeId = id || null;
      records.forEach((record) => {
        const residentId = record.resident?.animal?.id;
        const excluded = residentId === this.excludeId;
        const resumed = residentId === previousExcludedId && !excluded;
        record.isMoving = false;
        record.target = null;
        if (!excluded) activateRecord(record, this.view, resumed);
      });
      return this;
    },

    update(timeValue, deltaValue) {
      const delta = deltaValue === undefined ? finite(timeValue, 0) : finite(deltaValue, 0);
      const time = deltaValue === undefined ? 0 : finite(timeValue, 0);
      if (this.destroyed) return false;
      this.refreshView();
      const poseDelta = clamp(delta, 0, Math.max(1, finite(config.maxDeltaMs, 100)));
      let anyoneMoved = false;
      const movementBlocked = blockedBy(this.inputBlocked, this);

      records.forEach((record) => {
        const { resident } = record;
        if (resident?.animal?.id === this.excludeId || !objectAlive(resident?.sprite)) {
          record.isMoving = false;
          return;
        }
        activateRecord(record, this.view);
        if (!record.presentation) return;

        if (movementBlocked || isResidentActionLocked(resident, time)) {
          record.isMoving = false;
          if (!movementBlocked) record.target = null;
          if (record.state !== WYVERN_STATES.IDLE) {
            record.state = WYVERN_STATES.IDLE;
            record.animationKey = playResidentState(
              scene,
              resident,
              record.state,
              record.direction,
              record.animationKey,
            );
          }
          updateFlight(record.flight, poseDelta, false, config);
          publishFootprint(
            resident, record.footprint, record.logical, tiles || [], this.view,
          );
          syncPresentation(
            resident,
            record.footprint,
            record.presentation,
            record.flight,
            config,
            this.view,
          );
          return;
        }

        if (record.pauseRemainingMs > 0) {
          record.pauseRemainingMs = Math.max(0, record.pauseRemainingMs - poseDelta);
        } else if (!record.target) {
          record.target = makeWanderTarget(record, mask, config, random);
          if (record.target) {
            record.path = findPath(mask, heights, record.logical, record.target, { climbStep: config.climbStep });
            if (!record.path || record.path.length === 0) {
              const dist = worldMetricLength(record.target.col - record.logical.col, record.target.row - record.logical.row);
              if (dist > Math.max(2, finite(config.targetTolerance, DEFAULT_WANDER.targetTolerance))) {
                record.path = [{ col: record.target.col, row: record.target.row }];
              } else {
                beginWanderPause(record, config, random);
              }
            }
          } else {
            beginWanderPause(record, config, random);
          }
        }

        let moved = false;
        if (record.target && record.pauseRemainingMs === 0) {
          if (!record.path || record.path.length === 0) {
            record.path = findPath(mask, heights, record.logical, record.target, { climbStep: config.climbStep });
            if (!record.path || record.path.length === 0) {
              const dist = worldMetricLength(record.target.col - record.logical.col, record.target.row - record.logical.row);
              if (dist > Math.max(2, finite(config.targetTolerance, DEFAULT_WANDER.targetTolerance))) {
                record.path = [{ col: record.target.col, row: record.target.row }];
              } else {
                beginWanderPause(record, config, random);
              }
            }
          }

          if (record.path && record.path.length > 0) {
            const nextNode = record.path[0];
            const deltaCol = nextNode.col - record.logical.col;
            const deltaRow = nextNode.row - record.logical.row;
            const remaining = worldMetricLength(deltaCol, deltaRow);
            
            const isLastNode = record.path.length === 1;
            const tolerance = isLastNode
              ? Math.max(2, finite(config.targetTolerance, DEFAULT_WANDER.targetTolerance))
              : Math.max(6, finite(config.targetTolerance, DEFAULT_WANDER.targetTolerance));

            if (remaining <= tolerance) {
              record.path.shift();
              if (record.path.length === 0) {
                beginWanderPause(record, config, random);
              }
            } else {
              const distance = Math.min(
                remaining,
                Math.max(0, finite(config.speed, DEFAULT_WANDER.speed)) * poseDelta / 1000,
              );
              const beforeCol = record.logical.col;
              const beforeRow = record.logical.row;
              moved = moveWithCollision(
                mask,
                record.logical,
                deltaCol / remaining * distance,
                deltaRow / remaining * distance,
                config,
                heights,
              );
              if (moved) {
                record.lastWorldVector = {
                  col: record.logical.col - beforeCol,
                  row: record.logical.row - beforeRow,
                };
                record.direction = directionForWorld(
                  record.lastWorldVector, this.view, record.direction,
                );
              } else {
                beginWanderPause(record, config, random);
              }
            }
          }
        }

        record.isMoving = moved;
        anyoneMoved ||= moved;
        publishFootprint(
          resident, record.footprint, record.logical, tiles || [], this.view,
        );
        const nextState = moved ? WYVERN_STATES.FLY : WYVERN_STATES.IDLE;
        if (nextState !== record.state || moved) {
          record.state = nextState;
          record.animationKey = playResidentState(
            scene, resident, nextState, record.direction, record.animationKey,
          );
        }
        updateFlight(record.flight, poseDelta, moved, config);
        syncPresentation(
          resident,
          record.footprint,
          record.presentation,
          record.flight,
          config,
          this.view,
        );
      });

      if (anyoneMoved && layer) sortByDepth(layer);
      return anyoneMoved;
    },

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      records.forEach((record) => {
        record.isMoving = false;
        record.target = null;
        if (!record.presentation || !objectAlive(record.resident?.sprite)) return;
        record.flight.lift = 0;
        record.flight.bob = 0;
        publishFootprint(
          record.resident,
          record.footprint,
          record.logical,
          tiles || [],
          this.view,
        );
        syncPresentation(
          record.resident,
          record.footprint,
          record.presentation,
          record.flight,
          config,
          this.view,
        );
        playResidentState(
          scene, record.resident, WYVERN_STATES.IDLE, record.direction, null,
        );
      });
    },
  };

  return controller;
}
