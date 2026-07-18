import { describe, expect, it } from 'vitest';
import {
  WYVERN_DIRECTIONS,
  REQUIRED_WYVERN_STATES,
  firstUsableWyvernFrame,
  framesForWyvernDirection,
  framesForWyvernState,
  validateWyvernAtlas,
} from '../src/systems/wyvernAtlas.js';
import { wyvernAnimationKey } from '../src/data/wyverns.js';

const profile = {
  id: 'test-wyvern',
  name: 'Testwing',
  assetKey: 'wyvern-testwing',
  specialPower: {
    name: 'Test Pulse',
    description: 'Contract fixture for a profile-specific special power.',
  },
  atlas: {
    image: 'testwing.png',
    data: 'testwing.json',
    initialFrame: 'idle_0',
  },
};

function validAtlas() {
  const frames = {};
  const animations = {};
  REQUIRED_WYVERN_STATES.forEach((state) => {
    const frameName = `${state}_0`;
    animations[state] = [frameName];
    frames[frameName] = {
      frame: { x: 0, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      sourceSize: { w: 32, h: 32 },
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
    };
  });
  return {
    frames,
    meta: { size: { w: 256, h: 256 }, animations },
  };
}

describe('wyvern atlas contract', () => {
  it('accepts all required state sequences and resolves their frames', () => {
    const atlas = validAtlas();
    const report = validateWyvernAtlas(profile, atlas, {
      imageSize: { w: 256, h: 256 },
      maxTextureSize: 4096,
    });

    expect(report.valid).toBe(true);
    expect(framesForWyvernState(atlas, 'fly')).toEqual(['fly_0']);
    expect(firstUsableWyvernFrame(profile, atlas)).toBe('idle_0');
  });

  it('reports missing required animation frames without throwing', () => {
    const atlas = validAtlas();
    atlas.meta.animations.guard = ['guard_missing'];

    const report = validateWyvernAtlas(profile, atlas);

    expect(report.valid).toBe(false);
    expect(report.errors).toContain('Animation "guard" references missing frame "guard_missing".');
    expect(report.stateFrames.guard).toEqual([]);
  });

  it('warns when an otherwise valid atlas exceeds the portable page target', () => {
    const atlas = validAtlas();
    atlas.meta.size = { w: 4096, h: 6000 };

    const report = validateWyvernAtlas(profile, atlas);

    expect(report.valid).toBe(true);
    expect(report.warnings.some((warning) => warning.includes('portable 4096px target'))).toBe(true);
  });

  it('accepts optional directional sequences and exposes stable animation keys', () => {
    const atlas = validAtlas();
    atlas.frames.fly_n_0 = {
      frame: { x: 32, y: 0, w: 32, h: 32 },
      rotated: false,
      trimmed: false,
      sourceSize: { w: 32, h: 32 },
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
    };
    atlas.meta.directionalAnimations = { fly: { n: ['fly_n_0'] } };

    const report = validateWyvernAtlas(profile, atlas);

    expect(report.valid).toBe(true);
    expect(WYVERN_DIRECTIONS).toEqual(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
    expect(framesForWyvernDirection(atlas, 'fly', 'n')).toEqual(['fly_n_0']);
    expect(report.directionalStateFrames.fly.n).toEqual(['fly_n_0']);
    expect(report.warnings.some((warning) => warning.includes('east-facing baseline'))).toBe(true);
    expect(wyvernAnimationKey(profile, 'fly', 'n')).toBe('wyvern-testwing-fly-n');
    expect(wyvernAnimationKey(profile, 'fly')).toBe('wyvern-testwing-fly');
  });

  it('rejects directional sequences that reference absent frames', () => {
    const atlas = validAtlas();
    atlas.meta.directionalAnimations = { idle: { sw: ['idle_sw_missing'] } };

    const report = validateWyvernAtlas(profile, atlas);

    expect(report.valid).toBe(false);
    expect(report.errors).toContain(
      'Directional animation "idle.sw" references missing frame "idle_sw_missing".',
    );
  });
});
