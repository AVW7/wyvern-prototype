// 2D Continuous Blend Tree solver for creature locomotion and steering animation weights.
// Calculates normalized weights summing to 1 across speed and yaw angular velocity.

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Solves 2D Steering Blend Tree weights for banking turns.
 * @param {number} yawRateDeg - angular velocity in deg/sec (-150 hard right .. +150 hard left)
 * @param {number} maxTurnRateDeg - hard over yaw threshold (default 90)
 * @returns {{ level: number, left: number, right: number }} weights summing to 1
 */
export function solveSteeringBlendTree(yawRateDeg = 0, maxTurnRateDeg = 90) {
  const b = clamp(yawRateDeg / Math.max(1, maxTurnRateDeg), -1, 1);
  return {
    level: 1 - Math.abs(b),
    left: Math.max(b, 0),
    right: Math.max(-b, 0),
  };
}

/**
 * Solves 1D/2D Locomotion Blend Tree weights for speed transitions.
 * @param {number} speed - current ground speed in world units/sec
 * @param {number} maxSpeed - nominal full movement speed (default 145)
 * @returns {{ stationary: number, moving: number, ratio: number }} weights summing to 1
 */
export function solveLocomotionBlendTree(speed = 0, maxSpeed = 145) {
  const ratio = clamp(speed / Math.max(1, maxSpeed), 0, 1);
  return {
    stationary: 1 - ratio,
    moving: ratio,
    ratio,
  };
}
