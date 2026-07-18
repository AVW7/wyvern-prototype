import { describe, expect, it } from 'vitest';
import { ISO, TERRAIN } from '../src/config.js';
import { gridToScreen } from '../src/systems/iso.js';
import {
  normalizeView,
  projectBounds,
  projectCellQuad,
  projectFootprint,
  projectGrid,
  projectionBasis,
  projectVector,
  unprojectAtHeight,
  unprojectGround,
  unprojectVector,
  viewDirectionForWorldVector,
  viewKey,
} from '../src/systems/sanctuaryProjection.js';

const YAW_STEPS = [-45, 0, 45];
const ELEVATION_STEPS = [-1, 0, 1];
const VIEWS = YAW_STEPS.flatMap((yawDeg) => (
  ELEVATION_STEPS.map((elevationStep) => ({ yawDeg, elevationStep }))
));

function expectPointClose(actual, expected, digits = 9) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
}

function expectGridClose(actual, expected, digits = 9) {
  expect(actual.col).toBeCloseTo(expected.col, digits);
  expect(actual.row).toBeCloseTo(expected.row, digits);
}

describe('sanctuary projection view contract', () => {
  it('normalizes partial and out-of-range view state to the supported rig', () => {
    expect(normalizeView()).toEqual({ yawDeg: 0, elevationStep: 0 });
    expect(normalizeView({ yawDeg: -999, elevationStep: -9 }))
      .toEqual({ yawDeg: -45, elevationStep: -1 });
    expect(normalizeView({ yawDeg: 24, elevationStep: 0.51 }))
      .toEqual({ yawDeg: 45, elevationStep: 1 });
    expect(normalizeView({ yawDeg: -20, elevationStep: -0.49 }))
      .toEqual({ yawDeg: 0, elevationStep: 0 });
  });

  it('provides nine stable, unique cache keys', () => {
    const keys = VIEWS.map(viewKey);
    expect(new Set(keys).size).toBe(9);
    expect(viewKey({ yawDeg: -45, elevationStep: -1 })).toBe('y-45_e-1');
    expect(viewKey({ yawDeg: 0, elevationStep: 0 })).toBe('y0_e0');
    expect(viewKey({ yawDeg: 45, elevationStep: 1 })).toBe('y45_e1');
  });

  it('uses exact authored endpoint bases', () => {
    const left = projectionBasis({ yawDeg: -45, elevationStep: 0 });
    const centre = projectionBasis({ yawDeg: 0, elevationStep: 0 });
    const right = projectionBasis({ yawDeg: 45, elevationStep: 0 });

    expect(centre.col).toEqual({ x: 32, y: 16 });
    expect(centre.row).toEqual({ x: -32, y: 16 });
    expect(centre.height).toEqual({ x: 0, y: -18 });
    expect(left.col.x).toBe(0);
    expect(left.row.y).toBe(0);
    expect(left.col.y).toBeCloseTo(16 * Math.SQRT2);
    expect(left.row.x).toBeCloseTo(-32 * Math.SQRT2);
    expect(right.col.y).toBe(0);
    expect(right.row.x).toBe(0);
    expect(right.col.x).toBeCloseTo(32 * Math.SQRT2);
    expect(right.row.y).toBeCloseTo(16 * Math.SQRT2);
  });

  it('flattens ground and lengthens walls when lower, reversing when higher', () => {
    const lower = projectionBasis({ yawDeg: 0, elevationStep: -1 });
    const centre = projectionBasis({ yawDeg: 0, elevationStep: 0 });
    const higher = projectionBasis({ yawDeg: 0, elevationStep: 1 });

    expect(lower.groundYScale).toBeLessThan(centre.groundYScale);
    expect(lower.heightScale).toBeGreaterThan(centre.heightScale);
    expect(higher.groundYScale).toBeGreaterThan(centre.groundYScale);
    expect(higher.heightScale).toBeLessThan(centre.heightScale);
    expect(centre.groundYScale).toBe(1);
    expect(centre.heightScale).toBe(1);
  });
});

describe('sanctuary projection forward/inverse math', () => {
  it('is exactly compatible with the current default grid projection', () => {
    [
      { col: 0, row: 0 },
      { col: 4, row: 7 },
      { col: -2, row: 3 },
      { col: 1.25, row: 6.75 },
    ].forEach(({ col, row }) => {
      expect(projectGrid(col, row, TERRAIN.baseHeight, {
        yawDeg: 0,
        elevationStep: 0,
      })).toEqual(gridToScreen(col, row));
    });

    const projected = gridToScreen(4, 7);
    expect(projectFootprint(4, 7, TERRAIN.baseHeight, {
      yawDeg: 0,
      elevationStep: 0,
    })).toEqual({ x: projected.x, y: projected.y + ISO.tileHeight / 2 });

    const raised = projectGrid(4, 7, TERRAIN.baseHeight + 2, {
      yawDeg: 0,
      elevationStep: 0,
    });
    expect(raised).toEqual({ x: projected.x, y: projected.y - ISO.elevation * 2 });
  });

  it.each(VIEWS)(
    'round-trips ground and known-height points at yaw $yawDeg elevation $elevationStep',
    (view) => {
      const point = { col: 3.375, row: 5.625 };
      const ground = projectGrid(point.col, point.row, TERRAIN.baseHeight, view);
      expectGridClose(unprojectGround(ground.x, ground.y, view), point);

      const height = TERRAIN.baseHeight + 2;
      const raised = projectGrid(point.col, point.row, height, view);
      expectGridClose(unprojectAtHeight(raised.x, raised.y, height, view), point);
    },
  );

  it.each(VIEWS)(
    'round-trips vectors without applying origin at yaw $yawDeg elevation $elevationStep',
    (view) => {
      const vector = { col: -0.375, row: 1.125 };
      const projected = projectVector(vector.col, vector.row, view);
      expectGridClose(unprojectVector(projected.x, projected.y, view), vector);

      const start = projectGrid(2.25, 3.5, TERRAIN.baseHeight, view);
      const end = projectGrid(
        2.25 + vector.col,
        3.5 + vector.row,
        TERRAIN.baseHeight,
        view,
      );
      expectPointClose(projected, { x: end.x - start.x, y: end.y - start.y });
    },
  );
});

describe('sanctuary projected cell geometry and bounds', () => {
  it('returns the default diamond in stable corner order', () => {
    const view = { yawDeg: 0, elevationStep: 0 };
    const quad = projectCellQuad(2, 3, TERRAIN.baseHeight, view);

    expect(quad.top).toEqual(gridToScreen(2, 3));
    expect(quad.right).toEqual(gridToScreen(3, 3));
    expect(quad.bottom).toEqual(gridToScreen(3, 4));
    expect(quad.left).toEqual(gridToScreen(2, 4));
    expect(quad.points).toEqual([
      quad.top, quad.right, quad.bottom, quad.left,
    ]);
  });

  it.each(VIEWS)('keeps adjacent edges watertight at yaw $yawDeg elevation $elevationStep', (view) => {
    const first = projectCellQuad(2, 3, TERRAIN.baseHeight + 1, view);
    const nextCol = projectCellQuad(3, 3, TERRAIN.baseHeight + 1, view);
    const nextRow = projectCellQuad(2, 4, TERRAIN.baseHeight + 1, view);

    expect(first.right).toEqual(nextCol.top);
    expect(first.bottom).toEqual(nextCol.left);
    expect(first.left).toEqual(nextRow.top);
    expect(first.bottom).toEqual(nextRow.right);

    const twiceArea = first.points.reduce((total, point, index, points) => {
      const next = points[(index + 1) % points.length];
      return total + point.x * next.y - point.y * next.x;
    }, 0);
    expect(twiceArea).toBeGreaterThan(0);
  });

  it.each(VIEWS)('exports finite bounds containing tops and sidewalls at yaw $yawDeg elevation $elevationStep', (view) => {
    const tiles = Object.freeze([
      Object.freeze([Object.freeze({ height: 1 }), null]),
      Object.freeze([Object.freeze({ height: 2 }), Object.freeze({ height: 1 })]),
    ]);
    const before = JSON.stringify(tiles);
    const bounds = projectBounds(tiles, view);
    const basis = projectionBasis(view);

    expect(bounds.minX).toBeLessThan(bounds.maxX);
    expect(bounds.minY).toBeLessThan(bounds.maxY);
    Object.values(bounds).forEach((value) => expect(Number.isFinite(value)).toBe(true));

    [
      { col: 0, row: 0, height: 1 },
      { col: 0, row: 1, height: 2 },
      { col: 1, row: 1, height: 1 },
    ].forEach((cell) => {
      projectCellQuad(cell.col, cell.row, cell.height, view).points.forEach((point) => {
        const lower = {
          x: point.x - basis.height.x * cell.height,
          y: point.y - basis.height.y * cell.height,
        };
        [point, lower].forEach(({ x, y }) => {
          expect(x).toBeGreaterThanOrEqual(bounds.minX);
          expect(x).toBeLessThanOrEqual(bounds.maxX);
          expect(y).toBeGreaterThanOrEqual(bounds.minY);
          expect(y).toBeLessThanOrEqual(bounds.maxY);
        });
      });
    });
    expect(JSON.stringify(tiles)).toBe(before);
  });

  it('accepts flat descriptors and rejects an empty visible map', () => {
    expect(projectBounds([{ col: 1, row: 2, height: 1 }], {
      yawDeg: 0,
      elevationStep: 0,
    })).toMatchObject({
      minX: expect.any(Number),
      maxX: expect.any(Number),
      minY: expect.any(Number),
      maxY: expect.any(Number),
    });
    expect(() => projectBounds([])).toThrow(/at least one visible cell/);
  });
});

describe('sanctuary view-facing mapping', () => {
  it('maps fixed world axes through the active yaw before quantization', () => {
    expect(viewDirectionForWorldVector(1, 0, { yawDeg: -45, elevationStep: 0 }))
      .toBe('s');
    expect(viewDirectionForWorldVector(1, 0, { yawDeg: 0, elevationStep: 0 }))
      .toBe('se');
    expect(viewDirectionForWorldVector(1, 0, { yawDeg: 45, elevationStep: 0 }))
      .toBe('e');

    expect(viewDirectionForWorldVector(0, 1, { yawDeg: -45, elevationStep: 0 }))
      .toBe('w');
    expect(viewDirectionForWorldVector(0, 1, { yawDeg: 45, elevationStep: 0 }))
      .toBe('s');
  });

  it('preserves the previous valid view direction for a zero vector', () => {
    expect(viewDirectionForWorldVector(0, 0, {}, 'nw')).toBe('nw');
    expect(viewDirectionForWorldVector(0, 0, {}, 'invalid')).toBe('e');
  });
});
