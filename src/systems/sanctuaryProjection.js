// Pure sanctuary world <-> view projection. Phaser cameras still own viewport
// scroll and zoom; this module owns the affine grid projection underneath them.
// Keeping the two transforms separate makes pointer inversion, movement, and
// renderer placement agree at every supported sanctuary view.
import { ISO, SANCTUARY, TERRAIN } from '../config.js';

const SQRT_TWO = Math.SQRT2;
const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_PITCH_DEG = 30;
const DEFAULT_PITCH_STEP_DEG = 7.5;
const EPSILON = 1e-9;
const VIEW_DIRECTIONS = Object.freeze([
  'e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne',
]);

const FALLBACK_RIG = Object.freeze({
  yaw: Object.freeze({ min: -45, max: 45, step: 45, defaultDeg: 0 }),
  elevation: Object.freeze({
    minStep: -1,
    maxStep: 1,
    step: 1,
    defaultStep: 0,
    defaultPitchDeg: DEFAULT_PITCH_DEG,
    pitchStepDeg: DEFAULT_PITCH_STEP_DEG,
  }),
});

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function withoutNegativeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}

function requireFinite(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return value;
}

function sortedRange(first, second, fallbackMin, fallbackMax) {
  const a = finite(first, fallbackMin);
  const b = finite(second, fallbackMax);
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

function rigTuning() {
  const cameraRig = SANCTUARY.cameraRig ?? {};
  const configuredYaw = cameraRig.yaw ?? {};
  const configuredElevation = cameraRig.elevation ?? {};
  const yawRange = sortedRange(
    configuredYaw.min,
    configuredYaw.max,
    FALLBACK_RIG.yaw.min,
    FALLBACK_RIG.yaw.max,
  );
  const elevationRange = sortedRange(
    configuredElevation.minStep,
    configuredElevation.maxStep,
    FALLBACK_RIG.elevation.minStep,
    FALLBACK_RIG.elevation.maxStep,
  );

  return {
    yaw: {
      ...yawRange,
      step: Math.max(EPSILON, Math.abs(finite(
        configuredYaw.step,
        FALLBACK_RIG.yaw.step,
      ))),
      defaultDeg: clamp(finite(
        configuredYaw.defaultDeg ?? configuredYaw.default,
        FALLBACK_RIG.yaw.defaultDeg,
      ), yawRange.min, yawRange.max),
    },
    elevation: {
      ...elevationRange,
      step: Math.max(EPSILON, Math.abs(finite(
        configuredElevation.step,
        FALLBACK_RIG.elevation.step,
      ))),
      defaultStep: clamp(finite(
        configuredElevation.defaultStep,
        FALLBACK_RIG.elevation.defaultStep,
      ), elevationRange.min, elevationRange.max),
      defaultPitchDeg: clamp(finite(
        configuredElevation.defaultPitchDeg,
        FALLBACK_RIG.elevation.defaultPitchDeg,
      ), 1, 89),
      pitchStepDeg: finite(
        configuredElevation.pitchStepDeg,
        FALLBACK_RIG.elevation.pitchStepDeg,
      ),
      pitchByStep: configuredElevation.pitchDeg
        ?? configuredElevation.pitchDegByStep
        ?? configuredElevation.pitchByStep
        ?? null,
    },
  };
}

function snapToStep(value, anchor, step, min, max) {
  const snapped = anchor + Math.round((clamp(value, min, max) - anchor) / step) * step;
  return withoutNegativeZero(clamp(snapped, min, max));
}

/**
 * Clamp and snap a partial view to the configured three-step camera rig.
 * Unknown properties are deliberately discarded so the result is serializable
 * and suitable for texture-cache keys.
 */
export function normalizeView(view = {}) {
  const tuning = rigTuning();
  const source = view ?? {};
  const yawDeg = snapToStep(
    finite(source.yawDeg, tuning.yaw.defaultDeg),
    tuning.yaw.defaultDeg,
    tuning.yaw.step,
    tuning.yaw.min,
    tuning.yaw.max,
  );
  const elevationStep = snapToStep(
    finite(source.elevationStep, tuning.elevation.defaultStep),
    tuning.elevation.defaultStep,
    tuning.elevation.step,
    tuning.elevation.min,
    tuning.elevation.max,
  );
  return { yawDeg, elevationStep };
}

function pitchForStep(elevationStep, tuning) {
  const configured = tuning.pitchByStep?.[elevationStep]
    ?? tuning.pitchByStep?.[String(elevationStep)];
  return clamp(finite(
    configured,
    tuning.defaultPitchDeg
      + (elevationStep - tuning.defaultStep) * tuning.pitchStepDeg,
  ), 1, 89);
}

function endpointGroundBasis(yawDeg, groundYScale) {
  const horizontal = ISO.tileWidth / 2;
  const vertical = ISO.tileHeight / 2 * groundYScale;

  // Exact coefficients at the authored endpoints keep the default view
  // bit-compatible with gridToScreen() and avoid tiny sin/cos seams in bakes.
  if (Math.abs(yawDeg) <= EPSILON) {
    return {
      col: { x: horizontal, y: vertical },
      row: { x: -horizontal, y: vertical },
    };
  }
  if (Math.abs(yawDeg + 45) <= EPSILON) {
    return {
      col: { x: 0, y: vertical * SQRT_TWO },
      row: { x: -horizontal * SQRT_TWO, y: 0 },
    };
  }
  if (Math.abs(yawDeg - 45) <= EPSILON) {
    return {
      col: { x: horizontal * SQRT_TWO, y: 0 },
      row: { x: 0, y: vertical * SQRT_TWO },
    };
  }

  // This branch permits a future configured step inside the supported range
  // without changing the public contract. The current 3x3 rig uses only the
  // exact branches above.
  const alpha = (45 - yawDeg) * DEG_TO_RAD;
  return {
    col: {
      x: horizontal * SQRT_TWO * Math.cos(alpha),
      y: vertical * SQRT_TWO * Math.sin(alpha),
    },
    row: {
      x: -horizontal * SQRT_TWO * Math.sin(alpha),
      y: vertical * SQRT_TWO * Math.cos(alpha),
    },
  };
}

/**
 * Resolve the affine basis used by all forward/inverse helpers.
 *
 * `col` and `row` project one grid-unit displacement. `height` projects one
 * authored height level upward. At yaw/elevation zero these are exactly the
 * coefficients used by systems/iso.js.
 */
export function projectionBasis(view = {}) {
  const normalized = normalizeView(view);
  const tuning = rigTuning();
  const pitchDeg = pitchForStep(normalized.elevationStep, tuning.elevation);
  const defaultPitchDeg = pitchForStep(
    tuning.elevation.defaultStep,
    tuning.elevation,
  );
  const defaultPitchRad = defaultPitchDeg * DEG_TO_RAD;
  const pitchRad = pitchDeg * DEG_TO_RAD;
  const groundYScale = Math.sin(pitchRad) / Math.sin(defaultPitchRad);
  const heightScale = Math.cos(pitchRad) / Math.cos(defaultPitchRad);
  const ground = endpointGroundBasis(normalized.yawDeg, groundYScale);
  const height = { x: 0, y: -ISO.elevation * heightScale };
  const determinant = ground.col.x * ground.row.y - ground.col.y * ground.row.x;

  if (!Number.isFinite(determinant) || Math.abs(determinant) <= EPSILON) {
    throw new RangeError('Sanctuary projection basis must be finite and invertible.');
  }

  return {
    ...normalized,
    pitchDeg,
    groundYScale,
    heightScale,
    origin: { x: ISO.originX, y: ISO.originY },
    col: ground.col,
    row: ground.row,
    height,
    determinant,
  };
}

function resolveHeightAndView(height, view) {
  if (height && typeof height === 'object') {
    return { height: TERRAIN.baseHeight, view: height };
  }
  return {
    height: height === undefined ? TERRAIN.baseHeight : height,
    view: view ?? {},
  };
}

/** Project a grid corner at an absolute authored height level. */
export function projectGrid(col, row, height = TERRAIN.baseHeight, view = {}) {
  requireFinite(col, 'col');
  requireFinite(row, 'row');
  const resolved = resolveHeightAndView(height, view);
  requireFinite(resolved.height, 'height');
  const basis = projectionBasis(resolved.view);
  const heightDelta = resolved.height - TERRAIN.baseHeight;
  const defaultCompatible = basis.yawDeg === 0
    && basis.groundYScale === 1
    && basis.heightScale === 1;
  return {
    // Preserve the operation order of iso.gridToScreen() at the default view,
    // including for fractional/large coordinates where floating-point
    // association could otherwise differ by a few ulps.
    x: defaultCompatible
      ? basis.origin.x + (col - row) * (ISO.tileWidth / 2)
      : basis.origin.x
        + col * basis.col.x
        + row * basis.row.x
        + heightDelta * basis.height.x,
    y: defaultCompatible
      ? basis.origin.y
        + (col + row) * (ISO.tileHeight / 2)
        + heightDelta * basis.height.y
      : basis.origin.y
        + col * basis.col.y
        + row * basis.row.y
        + heightDelta * basis.height.y,
  };
}

/** Project the centre of a logical cell/continuous footprint. */
export function projectFootprint(col, row, height = TERRAIN.baseHeight, view = {}) {
  const resolved = resolveHeightAndView(height, view);
  const corner = projectGrid(col, row, resolved.height, resolved.view);
  const basis = projectionBasis(resolved.view);
  return {
    x: corner.x + (basis.col.x + basis.row.x) / 2,
    y: corner.y + (basis.col.y + basis.row.y) / 2,
  };
}

/** Project a grid-plane displacement. Origins and authored heights do not apply. */
export function projectVector(deltaCol, deltaRow, view = {}) {
  requireFinite(deltaCol, 'deltaCol');
  requireFinite(deltaRow, 'deltaRow');
  const basis = projectionBasis(view);
  return {
    x: deltaCol * basis.col.x + deltaRow * basis.row.x,
    y: deltaCol * basis.col.y + deltaRow * basis.row.y,
  };
}

/** Invert a projected displacement into a continuous grid-plane displacement. */
export function unprojectVector(x, y, view = {}) {
  requireFinite(x, 'x');
  requireFinite(y, 'y');
  const basis = projectionBasis(view);
  return {
    col: (x * basis.row.y - y * basis.row.x) / basis.determinant,
    row: (basis.col.x * y - basis.col.y * x) / basis.determinant,
  };
}

/**
 * Invert a projected point on a known height plane. This is exact for target
 * anchors whose owning-cell height is known; selecting among overlapping raised
 * tile tops still requires reverse-depth quad hit testing in the renderer.
 */
export function unprojectAtHeight(x, y, height = TERRAIN.baseHeight, view = {}) {
  requireFinite(x, 'x');
  requireFinite(y, 'y');
  const resolved = resolveHeightAndView(height, view);
  requireFinite(resolved.height, 'height');
  const basis = projectionBasis(resolved.view);
  const heightDelta = resolved.height - TERRAIN.baseHeight;
  return unprojectVector(
    x - basis.origin.x - heightDelta * basis.height.x,
    y - basis.origin.y - heightDelta * basis.height.y,
    resolved.view,
  );
}

/** Invert a point on the sanctuary's unraised gameplay plane. */
export function unprojectGround(x, y, view = {}) {
  return unprojectAtHeight(x, y, TERRAIN.baseHeight, view);
}

/**
 * Project one cell top in stable world-corner order. At the default view these
 * names are literally its top/right/bottom/left diamond corners; at endpoint
 * yaw they remain topology names even when the quad becomes a rectangle.
 */
export function projectCellQuad(
  col,
  row,
  height = TERRAIN.baseHeight,
  view = {},
) {
  const resolved = resolveHeightAndView(height, view);
  const top = projectGrid(col, row, resolved.height, resolved.view);
  const right = projectGrid(col + 1, row, resolved.height, resolved.view);
  const bottom = projectGrid(col + 1, row + 1, resolved.height, resolved.view);
  const left = projectGrid(col, row + 1, resolved.height, resolved.view);
  return {
    top,
    right,
    bottom,
    left,
    points: [top, right, bottom, left],
  };
}

function cellsFromGrid(grid) {
  const cells = [];
  grid.forEach((row, rowIndex) => {
    if (row == null) return;
    if (!Array.isArray(row)) {
      throw new TypeError('A sanctuary tile grid must contain row arrays.');
    }
    row.forEach((cell, colIndex) => {
      if (!cell) return;
      cells.push({
        col: colIndex,
        row: rowIndex,
        height: finite(cell.height, TERRAIN.baseHeight),
      });
    });
  });
  return cells;
}

function normalizeCells(source) {
  const rows = Array.isArray(source) ? source : source?.tiles;
  if (!Array.isArray(rows)) {
    throw new TypeError('projectBounds requires a tile grid or an array of cell descriptors.');
  }

  const isGrid = rows.some(Array.isArray)
    || rows.every((entry) => entry == null || Array.isArray(entry));
  if (isGrid) return cellsFromGrid(rows);

  return rows.filter(Boolean).map((descriptor) => {
    const col = requireFinite(descriptor.col, 'cell.col');
    const row = requireFinite(descriptor.row, 'cell.row');
    const height = finite(descriptor.height ?? descriptor.cell?.height, TERRAIN.baseHeight);
    return { col, row, height: requireFinite(height, 'cell.height') };
  });
}

/**
 * Bounds all projected top quads and their full downward block sidewalls.
 * The input is never mutated and may be either the authored 2D tile grid, a
 * `{ tiles }` map, or flat `{ col, row, height }` descriptors.
 */
export function projectBounds(cells, view = {}) {
  const normalizedCells = normalizeCells(cells);
  if (normalizedCells.length === 0) {
    throw new RangeError('projectBounds requires at least one visible cell.');
  }

  const basis = projectionBasis(view);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const include = (point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  };

  normalizedCells.forEach(({ col, row, height }) => {
    const quad = projectCellQuad(col, row, height, view);
    const wallLevels = Math.max(0, height);
    const wallOffset = {
      x: -basis.height.x * wallLevels,
      y: -basis.height.y * wallLevels,
    };
    quad.points.forEach((point) => {
      include(point);
      include({ x: point.x + wallOffset.x, y: point.y + wallOffset.y });
    });
  });

  return {
    minX, maxX, minY, maxY,
  };
}

/** Convert a stable world/grid motion vector into one of the eight art keys. */
export function viewDirectionForWorldVector(
  deltaCol,
  deltaRow,
  view = {},
  fallback = 'e',
) {
  requireFinite(deltaCol, 'deltaCol');
  requireFinite(deltaRow, 'deltaRow');
  if (deltaCol === 0 && deltaRow === 0) {
    return VIEW_DIRECTIONS.includes(fallback) ? fallback : 'e';
  }
  const projected = projectVector(deltaCol, deltaRow, view);
  const sector = Math.round(Math.atan2(projected.y, projected.x) / (Math.PI / 4));
  return VIEW_DIRECTIONS[(sector + VIEW_DIRECTIONS.length) % VIEW_DIRECTIONS.length];
}

/** Stable suffix for view-aware canvas/texture caches. */
export function viewKey(view = {}) {
  const normalized = normalizeView(view);
  return `y${normalized.yawDeg}_e${normalized.elevationStep}`;
}
