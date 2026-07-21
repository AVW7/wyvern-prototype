import { describe, expect, it } from 'vitest';
import {
  createHeightField,
  easeGroundHeight,
  sampleHeight,
  sampleSlope,
  slopeAlong,
} from '../src/systems/terrainHeightField.js';
import { SANCTUARY, TERRAIN } from '../src/config.js';
import { buildSanctuaryExterior } from '../src/data/sanctuary.js';
import { createHeightGrid } from '../src/systems/sanctuaryMovement.js';

/** A flat grid of `size` x `size` at `height`. */
function flat(size, height = 1) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => height));
}

/** Flat at 1, with a step up to `high` for every column at or past `atCol`. */
function step(size, atCol, high = 3) {
  return Array.from({ length: size }, () => Array.from(
    { length: size }, (_, col) => (col >= atCol ? high : 1),
  ));
}

describe('createHeightField', () => {
  it('survives an empty or ragged grid', () => {
    expect(() => createHeightField([])).not.toThrow();
    expect(() => createHeightField([[1], [1, 2, 3]])).not.toThrow();
    expect(createHeightField().raw).toEqual([]);
  });

  it('treats junk cell values as the base height', () => {
    const field = createHeightField([[Number.NaN, undefined, 2]]);
    expect(field.raw[0][0]).toBe(TERRAIN.baseHeight);
    expect(field.raw[0][1]).toBe(TERRAIN.baseHeight);
  });
});

describe('sampleHeight', () => {
  it('returns the cell height at a cell centre', () => {
    const field = createHeightField(step(6, 3));
    expect(sampleHeight(field, 0, 0)).toBeCloseTo(1, 9);
    expect(sampleHeight(field, 4, 0)).toBeCloseTo(3, 9);
  });

  it('ramps up on the approach, then clamps onto the tile it steps onto', () => {
    // Between a height-1 and a height-3 cell. On the low side the ground
    // ramps, so the climb has already begun before the step. Once the position
    // rounds onto the high cell the clamp owns it, because reading anything
    // below 3 there is the feet inside that tile.
    const field = createHeightField(step(6, 3));
    expect(sampleHeight(field, 2.0, 0)).toBeCloseTo(1, 9);
    expect(sampleHeight(field, 2.25, 0)).toBeCloseTo(1.5, 9);
    expect(sampleHeight(field, 2.49, 0)).toBeCloseTo(1.98, 2);
    // Math.round(2.5) is 3 — already standing on the high cell.
    expect(sampleHeight(field, 2.5, 0)).toBeCloseTo(3, 9);
    expect(sampleHeight(field, 2.75, 0)).toBeCloseTo(3, 9);
  });

  it('never sits below the tile being stood on', () => {
    // The whole point of the clamp. Pure interpolation reads half a level low
    // halfway onto a step, which is the feet sinking into the ground.
    const raw = step(8, 4, 5);
    const field = createHeightField(raw);
    for (let col = 0; col <= 7; col += 0.05) {
      const under = raw[3][Math.round(col)];
      expect(sampleHeight(field, col, 3)).toBeGreaterThanOrEqual(under - 1e-9);
    }
  });

  it('grades the approach so the crossing step is a fraction of the rise', () => {
    // Interpolation cannot remove the step — voxel ground is discontinuous, and
    // easeGroundHeight rides what is left. What it must do is start the climb
    // early, so what remains at the crossing is well under the full rise.
    const RISE = 4; // 1 -> 5
    const field = createHeightField(step(8, 4, 5));
    // Approaching, the height is already climbing before the cell changes.
    expect(sampleHeight(field, 3.4, 3)).toBeGreaterThan(1);
    const justBefore = sampleHeight(field, 3.49, 3);
    const justAfter = sampleHeight(field, 3.51, 3);
    expect(justAfter - justBefore).toBeLessThan(RISE * 0.6);
  });

  it('is flat over flat ground regardless of position', () => {
    const field = createHeightField(flat(5, 2));
    [0, 1.5, 2.25, 3.9, 4].forEach((p) => {
      expect(sampleHeight(field, p, p)).toBeCloseTo(2, 9);
    });
  });

  it('clamps at the rim rather than dropping to base height', () => {
    // Standing on the edge tile of the island, the 2x2 neighbourhood runs off
    // the grid. Falling back to baseHeight there would sink the model into the
    // tile it is standing on.
    const field = createHeightField(flat(4, 4));
    expect(sampleHeight(field, -1, -1)).toBeCloseTo(4, 9);
    expect(sampleHeight(field, 9, 9)).toBeCloseTo(4, 9);
    expect(sampleHeight(field, 3.5, 3.5)).toBeCloseTo(4, 9);
  });

  it('is safe against a missing field or junk coordinates', () => {
    expect(sampleHeight(null, 1, 1)).toBe(TERRAIN.baseHeight);
    expect(sampleHeight(createHeightField([]), 1, 1)).toBe(TERRAIN.baseHeight);
    const field = createHeightField(flat(4, 2));
    expect(Number.isFinite(sampleHeight(field, Number.NaN, 1))).toBe(true);
  });
});

describe('sampleSlope / slopeAlong', () => {
  it('is zero on flat ground', () => {
    const field = createHeightField(flat(6, 2));
    const { dCol, dRow } = sampleSlope(field, 3, 3);
    expect(dCol).toBeCloseTo(0, 9);
    expect(dRow).toBeCloseTo(0, 9);
  });

  it('points uphill along the rising axis', () => {
    const field = createHeightField(step(8, 4, 3));
    const { dCol, dRow } = sampleSlope(field, 3.5, 3);
    expect(dCol).toBeGreaterThan(0);
    expect(dRow).toBeCloseTo(0, 9);
  });

  it('is positive walking up the slope and negative walking down it', () => {
    const field = createHeightField(step(8, 4, 3));
    const uphill = slopeAlong(field, 3.5, 3, { col: 1, row: 0 });
    const downhill = slopeAlong(field, 3.5, 3, { col: -1, row: 0 });
    expect(uphill).toBeGreaterThan(0);
    expect(downhill).toBeCloseTo(-uphill, 9);
  });

  it('is zero across the slope, not just along it', () => {
    const field = createHeightField(step(8, 4, 3));
    expect(slopeAlong(field, 3.5, 3, { col: 0, row: 1 })).toBeCloseTo(0, 9);
  });

  it('ignores the direction vector length', () => {
    const field = createHeightField(step(8, 4, 3));
    expect(slopeAlong(field, 3.5, 3, { col: 5, row: 0 }))
      .toBeCloseTo(slopeAlong(field, 3.5, 3, { col: 1, row: 0 }), 9);
  });

  it('returns zero for a zero-length or junk direction', () => {
    const field = createHeightField(step(8, 4, 3));
    expect(slopeAlong(field, 3.5, 3, { col: 0, row: 0 })).toBe(0);
    expect(slopeAlong(field, 3.5, 3, null)).toBe(0);
  });
});

describe('against the real sanctuary map', () => {
  // Synthetic grids prove the maths; this proves it on the terrain the player
  // actually walks, including the terraces and cliff edges the model used to
  // clip through.
  const { tiles } = buildSanctuaryExterior();
  const raw = createHeightGrid(tiles);
  const field = createHeightField(raw);

  /** What the old implementation did: round to a cell, take its height. */
  const roundedHeight = (col, row) => tiles[Math.round(row)]?.[Math.round(col)]?.height ?? 1;

  it('cuts the worst single-frame Y jump the old sampler produced', () => {
    const STEP = 0.05; // far finer than a frame of walking covers
    let worstOld = 0;
    let worstNew = 0;

    for (let row = 1; row < raw.length - 1; row += 0.5) {
      let prevOld = roundedHeight(1, row);
      let prevNew = sampleHeight(field, 1, row);
      for (let col = 1; col < raw[0].length - 1; col += STEP) {
        const next = roundedHeight(col, row);
        const smooth = sampleHeight(field, col, row);
        worstOld = Math.max(worstOld, Math.abs(next - prevOld));
        worstNew = Math.max(worstNew, Math.abs(smooth - prevNew));
        prevOld = next;
        prevNew = smooth;
      }
    }

    // The old sampler jumped two whole levels — 24 world units — in a frame.
    expect(worstOld).toBeGreaterThanOrEqual(2);
    // Grading the approach cuts that by about a third; easeGroundHeight rides
    // the rest. It cannot reach zero: the surface really is discontinuous.
    expect(worstNew).toBeLessThan(worstOld * 0.75);
  });

  it('never places the ground below the tile the actor is standing on', () => {
    // A sample under the real tile height is the model sinking into it.
    let below = 0;
    for (let row = 0; row < raw.length; row += 0.25) {
      for (let col = 0; col < raw[0].length; col += 0.25) {
        const under = raw[Math.round(row)]?.[Math.round(col)];
        if (!Number.isFinite(under)) continue;
        if (sampleHeight(field, col, row) + 1e-9 < under) below += 1;
      }
    }
    expect(below).toBe(0);
  });
});

describe('easeGroundHeight', () => {
  it('moves toward the target without overshooting', () => {
    let h = 0;
    for (let i = 0; i < 200; i += 1) h = easeGroundHeight(h, 3, 1 / 60, 9);
    expect(h).toBeCloseTo(3, 3);
    expect(h).toBeLessThanOrEqual(3);
  });

  it('settles a full level in about a tenth of a second', () => {
    // The claim made in the config comment for settleHz: 9.
    let h = 0;
    for (let i = 0; i < 6; i += 1) h = easeGroundHeight(h, 1, 1 / 60, 9);
    expect(h).toBeGreaterThan(0.5);
    expect(h).toBeLessThan(1);
  });

  it('is framerate independent', () => {
    let fast = 0;
    for (let i = 0; i < 120; i += 1) fast = easeGroundHeight(fast, 5, 1 / 120, 9);
    let slow = 0;
    for (let i = 0; i < 30; i += 1) slow = easeGroundHeight(slow, 5, 1 / 30, 9);
    // One second of easing either way lands in the same place.
    expect(fast).toBeCloseTo(slow, 2);
  });

  it('snaps straight to the target when there is no previous height', () => {
    // A resident appearing for the first time must not fly in from zero.
    expect(easeGroundHeight(undefined, 4, 1 / 60, 9)).toBe(4);
    expect(easeGroundHeight(Number.NaN, 4, 1 / 60, 9)).toBe(4);
  });

  it('holds still on a zero delta or zero rate', () => {
    expect(easeGroundHeight(2, 5, 0, 9)).toBe(2);
    expect(easeGroundHeight(2, 5, 1 / 60, 0)).toBe(2);
  });
});
