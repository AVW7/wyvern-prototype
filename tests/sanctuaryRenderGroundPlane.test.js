import { describe, expect, it, vi } from 'vitest';
import { groundPlaneTransform } from '../src/systems/sanctuaryGroundPlane.js';
import { projectFootprint } from '../src/systems/sanctuaryProjection.js';
import {
  playSanctuaryEffect,
  reprojectSanctuaryResidentAffordances,
  sanctuaryWorldShadowGeometry,
} from '../src/systems/sanctuaryRender.js';

function display({ scaleX = 1, scaleY = 1, rotation = 0 } = {}) {
  return {
    active: true,
    scaleX,
    scaleY,
    rotation,
    setScaleCalls: 0,
    setRotationCalls: 0,
    setScale(x, y = x) {
      this.scaleX = x;
      this.scaleY = y;
      this.setScaleCalls += 1;
      return this;
    },
    setRotation(value) {
      this.rotation = value;
      this.setRotationCalls += 1;
      return this;
    },
    setStrokeStyle() { return this; },
    setData(key, value) { this[key] = value; return this; },
    setOrigin() { return this; },
    destroy() { this.active = false; },
  };
}

describe('sanctuary resident ground affordances', () => {
  it('reprojects aura, shadow, and selection geometry without tilting sprite or label', () => {
    const aura = display({ scaleX: 1.2, scaleY: 0.8, rotation: 0.1 });
    const shadow = display({ scaleX: 0.9, scaleY: 1.1, rotation: -0.1 });
    const selectionRing = display();
    const sprite = display({ rotation: 0.25 });
    const label = display({ rotation: -0.25 });
    const resident = {
      aura,
      shadow,
      selectionRing,
      sprite,
      label,
      _sanctuaryMovementPresentation: {
        auraScaleX: 99,
        auraScaleY: 99,
        shadowScaleX: 99,
        shadowScaleY: 99,
      },
    };
    const higher = { yawDeg: 45, elevationStep: 1 };
    const highTransform = groundPlaneTransform(higher);

    reprojectSanctuaryResidentAffordances(resident, higher);

    expect(aura.scaleX).toBeCloseTo(1.2 * highTransform.scaleX);
    expect(aura.scaleY).toBeCloseTo(0.8 * highTransform.scaleY);
    expect(shadow.scaleX).toBeCloseTo(0.9 * highTransform.scaleX);
    expect(shadow.scaleY).toBeCloseTo(1.1 * highTransform.scaleY);
    expect(selectionRing.scaleY).toBeCloseTo(highTransform.scaleY);
    expect(resident._sanctuaryMovementPresentation).toMatchObject({
      auraScaleX: expect.closeTo(1.2 * highTransform.scaleX, 10),
      auraScaleY: expect.closeTo(0.8 * highTransform.scaleY, 10),
      shadowScaleX: expect.closeTo(0.9 * highTransform.scaleX, 10),
      shadowScaleY: expect.closeTo(1.1 * highTransform.scaleY, 10),
    });
    expect(sprite.setScaleCalls).toBe(0);
    expect(sprite.setRotationCalls).toBe(0);
    expect(label.setScaleCalls).toBe(0);
    expect(label.setRotationCalls).toBe(0);

    const lower = { yawDeg: -45, elevationStep: -1 };
    const lowTransform = groundPlaneTransform(lower);
    reprojectSanctuaryResidentAffordances(resident, lower);
    // Reprojection starts from authored scales; it never compounds the old view.
    expect(aura.scaleX).toBeCloseTo(1.2 * lowTransform.scaleX);
    expect(aura.scaleY).toBeCloseTo(0.8 * lowTransform.scaleY);
  });
});

describe('sanctuary transient ground effects', () => {
  it('projects the action ring while leaving its glyph upright', () => {
    const ellipses = [];
    const texts = [];
    const tweenConfigs = [];
    const scene = {
      add: {
        ellipse: () => {
          const object = display();
          ellipses.push(object);
          return object;
        },
        text: () => {
          const object = display();
          object.y = 20;
          texts.push(object);
          return object;
        },
      },
      tweens: {
        add: vi.fn((config) => {
          tweenConfigs.push(config);
          return config;
        }),
      },
    };
    const layer = { add: vi.fn() };
    const view = { yawDeg: 45, elevationStep: 1 };
    const footprint = {
      ...projectFootprint(2, 3, view),
      col: 2,
      row: 3,
    };
    const transform = groundPlaneTransform(view);

    playSanctuaryEffect(scene, layer, footprint, 'train', view);

    expect(ellipses).toHaveLength(1);
    expect(ellipses[0].scaleX).toBeCloseTo(transform.scaleX);
    expect(ellipses[0].scaleY).toBeCloseTo(transform.scaleY);
    expect(ellipses[0].rotation).toBeCloseTo(transform.rotation);
    expect(tweenConfigs[0]).toMatchObject({
      scaleX: expect.closeTo(transform.scaleX * 1.8, 10),
      scaleY: expect.closeTo(transform.scaleY * 1.8, 10),
    });
    expect(texts).toHaveLength(1);
    expect(texts[0].setRotationCalls).toBe(0);
  });
});

describe('sanctuary world shadow', () => {
  it('tracks projected ground bounds instead of the viewport backdrop', () => {
    const tiles = [
      [{ height: 1 }, { height: 7 }],
      [null, { height: 1 }],
    ];
    const centre = sanctuaryWorldShadowGeometry(tiles, {
      yawDeg: 0,
      elevationStep: 0,
    });
    const turned = sanctuaryWorldShadowGeometry(tiles, {
      yawDeg: 45,
      elevationStep: 1,
    });

    [centre, turned].forEach((geometry) => {
      expect(geometry.width).toBeGreaterThan(0);
      expect(geometry.height).toBeGreaterThan(0);
      expect(Number.isFinite(geometry.x)).toBe(true);
      expect(Number.isFinite(geometry.y)).toBe(true);
    });
    // Raised art does not distort a ground-only shadow, while the active
    // yaw/elevation projection still changes its fitted footprint.
    expect(turned).not.toMatchObject({
      x: centre.x,
      y: centre.y,
      width: centre.width,
      height: centre.height,
    });
  });
});
