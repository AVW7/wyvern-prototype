// Where the ground *is*, for something standing on it. Pure: no `three`, no
// DOM, no Phaser — it takes a height grid and returns numbers, so the whole
// ground-contact behaviour is unit-testable without a browser.
// systems/sanctuary3D.js is the only consumer.
//
// The problem this exists to solve: the 3D model used to take its Y from
// `tiles[Math.round(row)][Math.round(col)].height`. Two things go wrong with
// that. The rounded cell changes in one frame, so Y teleported a whole
// HEIGHT_SCALE (12 world units) while X/Z moved smoothly — a visible pop at
// every terrace edge. And a single point sample knows nothing about the body
// standing on it: the dragon is about two tiles wide and two and a half long,
// so next to a taller tile its torso and tail intersected that tile's box
// while the sampled height still belonged to the shorter cell underfoot. That
// is the "dragon goes through the ground" glitch.
//
// Voxel terrain has a genuinely discontinuous surface, so no sampler can be
// both smooth everywhere and never below the tile underfoot. The two are split
// across three mechanisms instead, each owning exactly one problem:
//
//   * the body overlapping a *neighbouring* tile  -> collisionRadius keeps it
//     far enough away (SANCTUARY.movement), not this module's job;
//   * sinking into the tile it is standing on     -> sampleHeight() clamps to
//     that tile's real height, so the surface is never underneath the feet;
//   * the pop when the tile underfoot changes     -> easeGroundHeight() rides
//     the remaining step over ~100ms.
//
// Bilinear interpolation still earns its place between those: it grades the
// approach to a step so the height is already part-way up by the time the
// clamp takes over, which is what turns a 12-unit jump into a short ride.

import { TERRAIN } from '../config.js';

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Read a cell from a grid, clamping out-of-range lookups to the edge rather
 * than returning a default. An actor at the island's rim samples a 2x2
 * neighbourhood that runs off the grid; falling back to baseHeight there would
 * drag the model down into the edge tile instead of letting it stand on it.
 */
function cellAt(grid, col, row) {
  const rows = grid.length;
  if (!rows) return TERRAIN.baseHeight;
  const r = clamp(Math.round(row), 0, rows - 1);
  const line = grid[r];
  const cols = line?.length ?? 0;
  if (!cols) return TERRAIN.baseHeight;
  const c = clamp(Math.round(col), 0, cols - 1);
  return finite(line[c], TERRAIN.baseHeight);
}

/**
 * Build the sampling structure once per world.
 *
 * @param {number[][]} heights - raw per-cell height levels. Use
 *   createHeightGrid() from systems/sanctuaryMovement.js so the visual ground
 *   and the collision gate read the same numbers.
 * @returns {{raw: number[][]}}
 */
export function createHeightField(heights = []) {
  return {
    raw: (heights || []).map((row) => (row || []).map(
      (value) => finite(value, TERRAIN.baseHeight),
    )),
  };
}

/**
 * Ground height under a continuous grid position.
 *
 * Bilinear between cell centres, then clamped up to the real height of the
 * cell the position is actually standing on. The clamp is not optional: pure
 * interpolation dips below the tile top on the near side of a step — halfway
 * onto a cell one level up it reads half a level low — and that dip is the
 * model's feet disappearing into the ground.
 *
 * The interpolation still does the useful half of the work: approaching a
 * step, the height is already climbing before the clamp engages, so what is
 * left for easeGroundHeight() to absorb is a fraction of a level rather than
 * the full 12 units.
 *
 * @param {{raw: number[][]}} field - from createHeightField()
 * @param {number} col - continuous grid column
 * @param {number} row - continuous grid row
 * @returns {number} height level (not world units)
 */
export function sampleHeight(field, col, row) {
  const grid = field?.raw;
  if (!grid?.length) return TERRAIN.baseHeight;
  const c = finite(col, 0);
  const r = finite(row, 0);

  // Cell centres are at integer coordinates, so the interpolation cell spans
  // floor..floor+1 and the weight is the fractional part.
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const tc = c - c0;
  const tr = r - r0;

  const h00 = cellAt(grid, c0, r0);
  const h10 = cellAt(grid, c0 + 1, r0);
  const h01 = cellAt(grid, c0, r0 + 1);
  const h11 = cellAt(grid, c0 + 1, r0 + 1);

  const top = h00 + (h10 - h00) * tc;
  const bottom = h01 + (h11 - h01) * tc;
  const interpolated = top + (bottom - top) * tr;

  // Never below the tile being stood on.
  return Math.max(interpolated, cellAt(grid, c, r));
}

/**
 * Ride toward a new ground height instead of snapping to it.
 *
 * This is what absorbs the step that sampleHeight() deliberately leaves in:
 * the surface under the feet is genuinely discontinuous at a terrace edge, so
 * the model has to travel that last part over time rather than teleport. Also
 * covers a climbStep rise, where the walkable surface legitimately jumps a
 * whole level in a single step.
 *
 * Same exponential form as the altitude, roll and pitch easing elsewhere, so
 * it is framerate-independent.
 *
 * @param {number} current - height level the model is at
 * @param {number} target - height level sampled under it
 * @param {number} dtSec - frame delta in seconds
 * @param {number} hz - settle rate; higher snaps harder
 */
export function easeGroundHeight(current, target, dtSec, hz) {
  const to = finite(target, 0);
  if (!Number.isFinite(current)) return to;
  const dt = Math.max(0, finite(dtSec, 0));
  const rate = Math.max(0, finite(hz, 0));
  if (dt <= 0 || rate <= 0) return current;
  return current + (to - current) * (1 - Math.exp(-dt * rate));
}

/**
 * Local gradient of the sampled surface, in height levels per tile.
 *
 * Central differences over one tile, taken through sampleHeight() so the
 * gradient describes the same smoothed surface the model is standing on — a
 * gradient of the raw grid would be zero everywhere except at boundaries,
 * where it would be infinite.
 *
 * @returns {{dCol: number, dRow: number}}
 */
export function sampleSlope(field, col, row) {
  const step = 0.5;
  return {
    dCol: (sampleHeight(field, col + step, row) - sampleHeight(field, col - step, row))
      / (step * 2),
    dRow: (sampleHeight(field, col, row + step) - sampleHeight(field, col, row - step))
      / (step * 2),
  };
}

/**
 * How steeply the ground rises along a heading, in height levels per tile.
 * Positive is uphill. This is the scalar the body pitches to; the full
 * gradient is more than the model can use, since it only tilts about one axis.
 *
 * @param {object} field
 * @param {number} col
 * @param {number} row
 * @param {{col: number, row: number}} direction - travel direction, any length
 */
export function slopeAlong(field, col, row, direction) {
  const dc = finite(direction?.col, 0);
  const dr = finite(direction?.row, 0);
  const length = Math.hypot(dc, dr);
  if (!(length > 0)) return 0;
  const { dCol, dRow } = sampleSlope(field, col, row);
  return (dCol * dc + dRow * dr) / length;
}
