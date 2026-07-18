// Projection-aware transforms for radial ground affordances. These shapes are
// world circles rendered as screen ellipses: sanctuary yaw changes which grid
// axes sit beneath them, but does not give the circle a compass orientation.
// Elevation does change the ground-plane foreshortening, so its screen Y scale
// follows the active projection while its X scale remains stable.
import {
  normalizeView,
  projectVector,
  unprojectVector,
} from './sanctuaryProjection.js';

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function withoutTinyNoise(value) {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

/**
 * Return the affine screen transform for a radial ground-plane shape.
 *
 * The reference axes are inverted at the active yaw but default elevation,
 * then projected through the complete active view. This deliberately derives
 * the transform from the same vector seam used by movement and picking. At a
 * fixed elevation the result is yaw-invariant; pitch/elevation changes only
 * the vertically foreshortened axis.
 */
export function groundPlaneTransform(view = {}) {
  const activeView = normalizeView(view);
  const referenceView = normalizeView({ yawDeg: activeView.yawDeg });
  const logicalX = unprojectVector(1, 0, referenceView);
  const logicalY = unprojectVector(0, 1, referenceView);
  const projectedX = projectVector(logicalX.col, logicalX.row, activeView);
  const projectedY = projectVector(logicalY.col, logicalY.row, activeView);

  return {
    scaleX: withoutTinyNoise(Math.hypot(projectedX.x, projectedX.y)),
    scaleY: withoutTinyNoise(Math.hypot(projectedY.x, projectedY.y)),
    rotation: withoutTinyNoise(Math.atan2(projectedX.y, projectedX.x)),
  };
}

/** Apply the pure ground transform on top of an affordance's authored scale. */
export function applyGroundPlaneTransform(object, view = {}, options = {}) {
  const transform = groundPlaneTransform(view);
  const scaleX = finite(options.scaleX, finite(options.scale, 1));
  const scaleY = finite(options.scaleY, finite(options.scale, 1));
  const rotation = finite(options.rotation, 0);

  object?.setScale?.(scaleX * transform.scaleX, scaleY * transform.scaleY);
  object?.setRotation?.(rotation + transform.rotation);
  return transform;
}
