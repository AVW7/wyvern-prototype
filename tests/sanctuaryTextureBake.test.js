import { describe, expect, it } from 'vitest';
import {
  ensureDecorTexture,
  ensureProjectedSanctuaryDecorTexture,
  ensureProjectedSanctuaryTileTexture,
  ensureSanctuaryBackdropTexture,
  ensureTileTexture,
} from '../src/systems/textureBake.js';
import {
  EXTERIOR_SANCTUARY_DECOR_TYPES,
} from '../src/systems/sanctuaryDecorArt.js';
import { projectedTileGeometry } from '../src/systems/tileArt.js';
import {
  projectCellQuad,
  projectionBasis,
} from '../src/systems/sanctuaryProjection.js';

function makeContext() {
  const transforms = [];
  const operations = [];
  const paths = [];
  let currentPath = [];
  const gradient = { addColorStop() {} };
  return {
    transforms,
    operations,
    paths,
    beginPath() {
      currentPath = [];
      operations.push(['beginPath']);
    },
    closePath() { operations.push(['closePath']); },
    moveTo(...args) {
      currentPath.push(args);
      operations.push(['moveTo', ...args]);
    },
    lineTo(...args) {
      currentPath.push(args);
      operations.push(['lineTo', ...args]);
    },
    quadraticCurveTo(...args) { operations.push(['quadraticCurveTo', ...args]); },
    arc(...args) { operations.push(['arc', ...args]); },
    ellipse(...args) { operations.push(['ellipse', ...args]); },
    fill() {
      paths.push(currentPath.map((point) => [...point]));
      operations.push(['fill']);
    },
    stroke() { operations.push(['stroke']); },
    fillRect(...args) { operations.push(['fillRect', ...args]); },
    clip() { operations.push(['clip']); },
    save() { operations.push(['save']); },
    restore() { operations.push(['restore']); },
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    translate: (...args) => {
      transforms.push(['translate', ...args]);
      operations.push(['translate', ...args]);
    },
    scale: (...args) => {
      transforms.push(['scale', ...args]);
      operations.push(['scale', ...args]);
    },
  };
}

class FakeTextures {
  constructor() {
    this.entries = new Map();
    this.created = [];
  }

  exists(key) {
    return this.entries.has(key);
  }

  createCanvas(key, width, height) {
    const context = makeContext();
    const texture = {
      key,
      width,
      height,
      context,
      refreshed: false,
      getContext: () => context,
      refresh() { this.refreshed = true; },
    };
    this.entries.set(key, texture);
    this.created.push(texture);
    return texture;
  }
}

function tileGeometry(view, height = 3, col = 0, row = 0) {
  const basis = projectionBasis(view);
  return projectedTileGeometry(
    projectCellQuad(col, row, height, view),
    {
      x: -basis.height.x * height,
      y: -basis.height.y * height,
    },
  );
}

describe('view-aware sanctuary tile art', () => {
  it.each([
    [-45, [1]],
    [0, [1, 2]],
    [45, [2]],
  ])('draws only front-facing non-degenerate walls at yaw %i', (yawDeg, indexes) => {
    const geometry = tileGeometry({ yawDeg, elevationStep: 0 });

    expect(geometry.visibleWalls.map((wall) => wall.index)).toEqual(indexes);
    geometry.visibleWalls.forEach((wall) => {
      expect(wall.faceArea).toBeGreaterThan(0);
    });
  });

  it('keeps translated copies on one shape key and returns reference-relative placement', () => {
    const view = { yawDeg: 45, elevationStep: 1 };
    const first = tileGeometry(view, 2, 0, 0);
    const translated = tileGeometry(view, 2, 8, 11);

    expect(translated.shapeKey).toBe(first.shapeKey);
    expect(translated.offsetX).toBeCloseTo(first.offsetX);
    expect(translated.offsetY).toBeCloseTo(first.offsetY);
    expect(first.originX).toBe(0);
    expect(first.originY).toBe(0);
  });

  it('normalizes view cache keys, caches the bake, and handles a wall overlay edge-on', () => {
    const textures = new FakeTextures();
    const first = ensureProjectedSanctuaryTileTexture(
      textures,
      'moss',
      2,
      3,
      'monolithNiche',
      { yawDeg: -999, elevationStep: 99 },
    );
    const cached = ensureProjectedSanctuaryTileTexture(
      textures,
      'moss',
      2,
      3,
      'monolithNiche',
      { yawDeg: -45, elevationStep: 1 },
    );
    const flatOverlay = ensureProjectedSanctuaryTileTexture(
      textures,
      'moss',
      0,
      0,
      'monolithNiche',
      { yawDeg: 45, elevationStep: 0 },
    );

    expect(first.key).toContain('y-45_e1');
    expect(cached).toEqual(first);
    expect(textures.created.filter(({ key }) => key === first.key)).toHaveLength(1);
    expect(first.width).toBeGreaterThan(0);
    expect(first.height).toBeGreaterThan(0);
    expect(Number.isFinite(first.offsetX)).toBe(true);
    expect(Number.isFinite(first.offsetY)).toBe(true);
    expect(flatOverlay.key).toContain('monolithNiche-y45_e0');
    expect(() => ensureProjectedSanctuaryTileTexture(
      textures,
      'moss',
      0,
      1,
      'not-an-overlay',
    )).toThrow(/unknown overlay/);
  });
});

describe('view-aware sanctuary decor bake', () => {
  it.each(EXTERIOR_SANCTUARY_DECOR_TYPES)(
    'procedurally redraws %s geometry between yaw 0 and +45',
    (type) => {
      const textures = new FakeTextures();
      const defaultView = ensureProjectedSanctuaryDecorTexture(
        textures,
        'moss',
        type,
        1,
        { yawDeg: 0, elevationStep: 0 },
      );
      const turnedView = ensureProjectedSanctuaryDecorTexture(
        textures,
        'moss',
        type,
        1,
        { yawDeg: 45, elevationStep: 0 },
      );

      const defaultContext = textures.entries.get(defaultView.key).context;
      const turnedContext = textures.entries.get(turnedView.key).context;
      const geometryOperations = (context) => context.operations.filter(
        ([operation]) => ['moveTo', 'lineTo', 'fillRect', 'ellipse', 'arc'].includes(operation),
      );

      expect(defaultView.key).not.toBe(turnedView.key);
      expect(geometryOperations(defaultContext).length).toBeGreaterThan(3);
      expect(geometryOperations(turnedContext)).not.toEqual(geometryOperations(defaultContext));
      // View construction happens in the individual ground/height points,
      // never as a transform of a completed legacy canvas.
      expect(defaultContext.transforms).toEqual([]);
      expect(turnedContext.transforms).toEqual([]);
    },
  );

  it('uses ground pitch for spreads and height pitch for vertical structure', () => {
    const textures = new FakeTextures();
    const lowerArena = ensureProjectedSanctuaryDecorTexture(
      textures,
      'moss',
      'arena',
      1,
      { yawDeg: 0, elevationStep: -1 },
    );
    const higherArena = ensureProjectedSanctuaryDecorTexture(
      textures,
      'moss',
      'arena',
      1,
      { yawDeg: 0, elevationStep: 1 },
    );
    const lowerTree = ensureProjectedSanctuaryDecorTexture(
      textures,
      'moss',
      'tree',
      1,
      { yawDeg: 0, elevationStep: -1 },
    );
    const higherTree = ensureProjectedSanctuaryDecorTexture(
      textures,
      'moss',
      'tree',
      1,
      { yawDeg: 0, elevationStep: 1 },
    );

    const ySpan = (path) => {
      const ys = path.map(([, y]) => y);
      return Math.max(...ys) - Math.min(...ys);
    };
    const lowerArenaShadow = textures.entries.get(lowerArena.key).context.paths[0];
    const higherArenaShadow = textures.entries.get(higherArena.key).context.paths[0];
    expect(ySpan(higherArenaShadow)).toBeGreaterThan(ySpan(lowerArenaShadow));

    // The tree's first filled path is its shadow; the next path is a trunk
    // side with top and base points at the same logical corners.
    const lowerTrunkFace = textures.entries.get(lowerTree.key).context.paths[1];
    const higherTrunkFace = textures.entries.get(higherTree.key).context.paths[1];
    const faceHeight = (path) => Math.abs(path[0][1] - path[3][1]);
    expect(faceHeight(lowerTrunkFace)).toBeGreaterThan(faceHeight(higherTrunkFace));
    expect(lowerTree.elevationScale).toBeGreaterThan(higherTree.elevationScale);
    expect(lowerTree.height).toBeGreaterThan(higherTree.height);
  });

  it.each([
    ['Mission', 'grass', 'tree', 1],
    ['Atlas', 'grass', 'arena', 0],
    ['Vault', 'masonry', 'barredDoor', 0],
  ])('leaves the generic %s decor raster and API unchanged', (
    scene,
    biome,
    type,
    variant,
  ) => {
    const isolatedLegacy = new FakeTextures();
    const textures = new FakeTextures();
    const expectedKey = `iso-decor-${biome}-${type}-${variant}`;
    const isolatedKey = ensureDecorTexture(isolatedLegacy, biome, type, variant);

    ensureProjectedSanctuaryDecorTexture(
      textures,
      biome,
      type,
      variant,
      { yawDeg: 45, elevationStep: 1 },
    );
    const actualKey = ensureDecorTexture(textures, biome, type, variant);
    const isolatedTexture = isolatedLegacy.entries.get(isolatedKey);
    const actualTexture = textures.entries.get(actualKey);

    expect(scene).toBeTruthy();
    expect(actualKey).toBe(expectedKey);
    expect(isolatedKey).toBe(expectedKey);
    expect(actualTexture.width).toBe(72);
    expect(actualTexture.height).toBe(56);
    expect(actualTexture.context.operations).toEqual(isolatedTexture.context.operations);
  });

  it('rejects non-exterior props without polluting the projected texture cache', () => {
    const textures = new FakeTextures();
    expect(() => ensureProjectedSanctuaryDecorTexture(
      textures,
      'masonry',
      'chest',
      0,
      { yawDeg: 45, elevationStep: 0 },
    )).toThrow(/unsupported exterior prop/);
    expect(textures.created).toHaveLength(0);
  });

  it('leaves the generic tile API and key unchanged', () => {
    const textures = new FakeTextures();
    expect(ensureTileTexture(textures, 'grass', 1, 2))
      .toBe('iso-tile-grass-1-h2');
  });
});

describe('sanctuary backdrop split', () => {
  it('keeps Vault baked-shadow compatibility and gives Base a sky-only key', () => {
    const textures = new FakeTextures();
    const vaultKey = ensureSanctuaryBackdropTexture(textures, 'inside');
    const baseKey = ensureSanctuaryBackdropTexture(
      textures,
      'outside',
      { dioramaShadow: false },
    );
    const vaultOperations = textures.entries.get(vaultKey).context.operations;
    const baseOperations = textures.entries.get(baseKey).context.operations;

    expect(vaultKey).toBe('sanctuary-backdrop-inside');
    expect(baseKey).toBe('sanctuary-backdrop-outside-sky');
    expect(vaultOperations.some(([operation]) => operation === 'ellipse')).toBe(true);
    expect(baseOperations.some(([operation]) => operation === 'ellipse')).toBe(false);
  });
});
