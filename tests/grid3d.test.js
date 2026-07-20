import { describe, expect, it } from 'vitest';
import {
  TILE_SIZE,
  HEIGHT_SCALE,
  gridToWorld3D,
  tileCenterY,
  worldToGridCol,
  worldToGridRow,
} from '../src/systems/grid3d.js';

describe('grid3d transform', () => {
  it('centres the map on the origin', () => {
    // The middle cell of an even grid sits at world X/Z = 0.
    const mid = gridToWorld3D(2, 2, 1, 4, 4);
    expect(mid.x).toBe(0);
    expect(mid.z).toBe(0);
  });

  it('maps height level to surface Y and adds altitude on top', () => {
    const grounded = gridToWorld3D(0, 0, 3, 8, 8);
    expect(grounded.y).toBe(3 * HEIGHT_SCALE);

    const flying = gridToWorld3D(0, 0, 3, 8, 8, 50);
    expect(flying.y).toBe(3 * HEIGHT_SCALE + 50);
  });

  it('spaces columns and rows by one tile', () => {
    const a = gridToWorld3D(1, 1, 1, 6, 6);
    const b = gridToWorld3D(2, 1, 1, 6, 6);
    expect(b.x - a.x).toBe(TILE_SIZE);
    const c = gridToWorld3D(1, 2, 1, 6, 6);
    expect(c.z - a.z).toBe(TILE_SIZE);
  });

  it('round-trips world X/Z back to the source grid column/row', () => {
    const cols = 7;
    const rows = 9;
    for (const [col, row] of [[0, 0], [3, 4], [6, 8], [2, 7]]) {
      const world = gridToWorld3D(col, row, 2, cols, rows);
      expect(worldToGridCol(world.x, cols)).toBeCloseTo(col);
      expect(worldToGridRow(world.z, rows)).toBeCloseTo(row);
    }
  });

  it('places a box mesh centre at half its extruded height', () => {
    // BoxGeometry is centred on its origin, so a 3-level tile's centre is at
    // half of 3 * HEIGHT_SCALE — distinct from the surface Y things stand on.
    expect(tileCenterY(3)).toBe((3 * HEIGHT_SCALE) / 2);
    expect(tileCenterY(3) * 2).toBe(gridToWorld3D(0, 0, 3, 2, 2).y);
  });
});
