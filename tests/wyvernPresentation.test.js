import { describe, expect, it } from 'vitest';
import {
  resolveWyvernVisual,
  scaleWyvernVisual,
  wyvernAccentColor,
} from '../src/systems/wyvernPresentation.js';
import { WYVERN_STATES } from '../src/config.js';

const atlasFrame = {
  name: 'idle_0.png',
  realHeight: 640,
  height: 600,
};
const baseFrame = {
  name: '__BASE',
  realHeight: 54,
  height: 54,
};

function textureWith(frameNames = []) {
  return {
    has: (name) => frameNames.includes(name),
    get: (name) => (name ? atlasFrame : baseFrame),
  };
}

describe('wyvern presentation', () => {
  it('resolves profile accent colors for shared scene markers', () => {
    expect(wyvernAccentColor({ accent: '#dc3f50' })).toBe(0xdc3f50);
    expect(wyvernAccentColor('invalid', 0x123456)).toBe(0x123456);
  });


  it('resolves a real atlas frame and scales from its untrimmed source height', () => {
    const texture = textureWith(['idle_0.png']);
    const textures = { get: () => texture };
    const profile = {
      assetKey: 'wyvern-cinderlash',
      atlas: {
        initialFrame: 'idle_0.png',
        origin: { x: 0.5, y: 0.88 },
      },
    };

    const visual = resolveWyvernVisual(textures, profile);

    expect(visual.usesAtlas).toBe(true);
    expect(visual.frameName).toBe('idle_0.png');
    expect(visual.referenceHeight).toBe(640);
    expect(visual.origin).toEqual({ x: 0.5, y: 0.88 });
    expect(scaleWyvernVisual(visual, 180)).toBeCloseTo(0.28125);
  });

  it('keeps generated placeholders usable when an atlas frame is unavailable', () => {
    const textures = { get: () => textureWith() };
    const profile = {
      assetKey: 'wyvern-fallback',
      atlas: { initialFrame: 'missing.png' },
    };

    const visual = resolveWyvernVisual(textures, profile);

    expect(visual.usesAtlas).toBe(false);
    expect(visual.frameName).toBeUndefined();
    expect(scaleWyvernVisual(visual, 90, 1.9, 180)).toBeCloseTo(0.95);
  });
});
