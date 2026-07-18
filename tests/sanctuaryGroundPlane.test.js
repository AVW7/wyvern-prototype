import { describe, expect, it } from 'vitest';
import {
  applyGroundPlaneTransform,
  groundPlaneTransform,
} from '../src/systems/sanctuaryGroundPlane.js';
import { projectionBasis } from '../src/systems/sanctuaryProjection.js';

const YAWS = [-45, 0, 45];
const ELEVATIONS = [-1, 0, 1];

describe('sanctuary radial ground-plane transforms', () => {
  it.each(YAWS)('keeps radial footprints yaw-invariant at %s degrees', (yawDeg) => {
    expect(groundPlaneTransform({ yawDeg, elevationStep: 0 })).toEqual({
      scaleX: expect.closeTo(1, 12),
      scaleY: expect.closeTo(1, 12),
      rotation: 0,
    });
  });

  it.each(YAWS.flatMap((yawDeg) => ELEVATIONS.map((elevationStep) => [
    yawDeg,
    elevationStep,
  ])))('uses ground foreshortening at yaw %s / elevation %s', (yawDeg, elevationStep) => {
    const view = { yawDeg, elevationStep };
    const transform = groundPlaneTransform(view);
    const basis = projectionBasis(view);

    expect(transform.scaleX).toBeCloseTo(1, 12);
    expect(transform.scaleY).toBeCloseTo(basis.groundYScale, 12);
    expect(transform.rotation).toBe(0);
  });

  it('uses ground Y scale rather than vertical-height scale', () => {
    const view = { yawDeg: 45, elevationStep: 1 };
    const transform = groundPlaneTransform(view);
    const basis = projectionBasis(view);

    expect(transform.scaleY).toBeCloseTo(basis.groundYScale, 12);
    expect(transform.scaleY).not.toBeCloseTo(basis.heightScale, 3);
  });

  it('composes projection with an authored scale without changing the API object', () => {
    const object = {
      setScale(x, y) { this.scaleX = x; this.scaleY = y; return this; },
      setRotation(rotation) { this.rotation = rotation; return this; },
    };
    const view = { yawDeg: -45, elevationStep: -1 };
    const transform = applyGroundPlaneTransform(object, view, {
      scaleX: 1.5,
      scaleY: 0.75,
      rotation: 0.2,
    });

    expect(object.scaleX).toBeCloseTo(transform.scaleX * 1.5);
    expect(object.scaleY).toBeCloseTo(transform.scaleY * 0.75);
    expect(object.rotation).toBeCloseTo(transform.rotation + 0.2);
  });
});
