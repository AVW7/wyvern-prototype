import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../src/config.js';
import {
  normalizeView,
  projectFootprint,
  unprojectGround,
} from '../src/systems/sanctuaryProjection.js';

// Mirrors BaseScene.pointerLogicalPoint's 2D fallback: a screen point → the
// integer owning cell. This is the convention the 3D raycast picker
// (sanctuary3D.unprojectClick) already returns, so both paths resolve a click
// to the same tile. If BaseScene's formula changes, update it here too.
// `|| 0` folds Math.round's signed -0 to +0; both index arrays identically, it
// only trips strict deep-equality in the assertion below.
function pointerToCell(x, y, view) {
  const corner = unprojectGround(x, y, view);
  return {
    col: Math.round(corner.col - 0.5) || 0,
    row: Math.round(corner.row - 0.5) || 0,
  };
}

describe('sanctuary pointer picking convention', () => {
  const views = [
    normalizeView({ yawDeg: 0, elevationStep: 0 }),
    normalizeView({ yawDeg: 45, elevationStep: 0 }),
    normalizeView({ yawDeg: -45, elevationStep: 1 }),
  ];

  it('resolves a click at a cell centre to that integer cell in every view', () => {
    for (const view of views) {
      for (const [col, row] of [[0, 0], [3, 5], [12, 8], [20, 20]]) {
        const centre = projectFootprint(col, row, TERRAIN.baseHeight, view);
        expect(pointerToCell(centre.x, centre.y, view)).toEqual({ col, row });
      }
    }
  });

  it('returns integer indices (matching the 3D raycast picker output)', () => {
    const view = normalizeView({ yawDeg: 0, elevationStep: 0 });
    const centre = projectFootprint(7, 4, TERRAIN.baseHeight, view);
    const cell = pointerToCell(centre.x + 3, centre.y - 2, view);
    expect(Number.isInteger(cell.col)).toBe(true);
    expect(Number.isInteger(cell.row)).toBe(true);
  });
});
