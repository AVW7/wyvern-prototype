import { describe, expect, it } from 'vitest';
import {
  resolveWyvernVisual,
  scaleWyvernVisual,
  wyvernAccentColor,
} from '../src/systems/wyvernPresentation.js';

const baseFrame = {
  name: '__BASE',
  realHeight: 54,
  height: 54,
};

function textureWith() {
  return {
    get: () => baseFrame,
  };
}

describe('wyvern presentation', () => {
  it('resolves profile accent colors for shared scene markers', () => {
    expect(wyvernAccentColor({ accent: '#dc3f50' })).toBe(0xdc3f50);
    expect(wyvernAccentColor('invalid', 0x123456)).toBe(0x123456);
  });

  it('resolves placeholders and scales from source height', () => {
    const textures = { get: () => textureWith() };
    const profile = {
      assetKey: 'wyvern-fallback',
    };

    const visual = resolveWyvernVisual(textures, profile);

    expect(visual.usesAtlas).toBe(false);
    expect(visual.frameName).toBeUndefined();
    expect(scaleWyvernVisual(visual, 90, 1.9, 180)).toBeCloseTo(0.95);
  });
});
