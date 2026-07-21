import { describe, expect, it } from 'vitest';
import { bakeFacePixels, neighbourOcclusion } from '../src/systems/tileTexture3D.js';
import { BIOMES } from '../src/data/biomes.js';

const OPTIONS = { size: 16, grain: 0.14, strata: 0.2 };

function cell(height) {
  return { height, biome: 'moss' };
}

// A 3x3 grid whose centre is the cell under test.
function grid(centre, neighbours) {
  const rows = [[], [], []];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      rows[r][c] = (r === 1 && c === 1) ? cell(centre) : neighbours[r][c];
    }
  }
  return rows;
}

const FLAT = [
  [cell(1), cell(1), cell(1)],
  [cell(1), null, cell(1)],
  [cell(1), cell(1), cell(1)],
];

describe('bakeFacePixels', () => {
  it('produces a fully opaque RGBA buffer of the requested size', () => {
    const { data, size } = bakeFacePixels('top', 'moss', BIOMES.moss, OPTIONS);
    expect(size).toBe(16);
    expect(data.length).toBe(16 * 16 * 4);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it('is deterministic — the same biome always bakes the same pixels', () => {
    const a = bakeFacePixels('top', 'moss', BIOMES.moss, OPTIONS);
    const b = bakeFacePixels('top', 'moss', BIOMES.moss, OPTIONS);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
  });

  it('gives each biome and each face its own surface', () => {
    const moss = bakeFacePixels('top', 'moss', BIOMES.moss, OPTIONS);
    const lava = bakeFacePixels('top', 'lava', BIOMES.lava, OPTIONS);
    const side = bakeFacePixels('side', 'moss', BIOMES.moss, OPTIONS);
    expect(Array.from(moss.data)).not.toEqual(Array.from(lava.data));
    expect(Array.from(moss.data)).not.toEqual(Array.from(side.data));
  });

  it('varies within a face — the whole point is not being a flat colour', () => {
    const { data } = bakeFacePixels('top', 'moss', BIOMES.moss, OPTIONS);
    const reds = new Set();
    for (let i = 0; i < data.length; i += 4) reds.add(data[i]);
    expect(reds.size).toBeGreaterThan(4);
  });

  it('darkens a sidewall toward its base', () => {
    const { data, size } = bakeFacePixels('side', 'moss', BIOMES.moss, OPTIONS);
    const rowLuma = (y) => {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        sum += data[i] + data[i + 1] + data[i + 2];
      }
      return sum / size;
    };
    expect(rowLuma(size - 1)).toBeLessThan(rowLuma(0));
  });

  it('falls back to a usable buffer for an unknown palette', () => {
    const { data } = bakeFacePixels('top', 'nonesuch', {}, OPTIONS);
    expect(data.length).toBe(16 * 16 * 4);
  });
});

describe('neighbourOcclusion', () => {
  it('is zero for a cell level with everything around it', () => {
    const tiles = grid(1, FLAT);
    expect(neighbourOcclusion(tiles, 1, 1)).toBe(0);
  });

  it('is zero for a cell that towers over its neighbours', () => {
    const tiles = grid(4, FLAT);
    expect(neighbourOcclusion(tiles, 1, 1)).toBe(0);
  });

  it('grows as more neighbours rise above the cell', () => {
    const one = grid(1, [
      [cell(1), cell(3), cell(1)],
      [cell(1), null, cell(1)],
      [cell(1), cell(1), cell(1)],
    ]);
    const three = grid(1, [
      [cell(1), cell(3), cell(1)],
      [cell(3), null, cell(3)],
      [cell(1), cell(1), cell(1)],
    ]);
    expect(neighbourOcclusion(three, 1, 1))
      .toBeGreaterThan(neighbourOcclusion(one, 1, 1));
  });

  it('weights a diagonal neighbour less than an orthogonal one', () => {
    const orthogonal = grid(1, [
      [cell(1), cell(3), cell(1)],
      [cell(1), null, cell(1)],
      [cell(1), cell(1), cell(1)],
    ]);
    const diagonal = grid(1, [
      [cell(3), cell(1), cell(1)],
      [cell(1), null, cell(1)],
      [cell(1), cell(1), cell(1)],
    ]);
    expect(neighbourOcclusion(diagonal, 1, 1))
      .toBeLessThan(neighbourOcclusion(orthogonal, 1, 1));
  });

  it('treats a hole in the island as open sky, not as an occluder', () => {
    const withHoles = grid(1, [
      [null, null, null],
      [null, null, null],
      [null, null, null],
    ]);
    expect(neighbourOcclusion(withHoles, 1, 1)).toBe(0);
  });

  it('saturates at 1 when boxed in by tall walls', () => {
    const walled = grid(1, [
      [cell(5), cell(5), cell(5)],
      [cell(5), null, cell(5)],
      [cell(5), cell(5), cell(5)],
    ]);
    expect(neighbourOcclusion(walled, 1, 1)).toBeCloseTo(1, 6);
  });

  it('returns 0 for a coordinate that is not a tile', () => {
    expect(neighbourOcclusion(grid(1, FLAT), 9, 9)).toBe(0);
    expect(neighbourOcclusion(null, 0, 0)).toBe(0);
  });
});
