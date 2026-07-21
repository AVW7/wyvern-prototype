import { describe, expect, it } from 'vitest';
import { solveSteeringBlendTree, solveLocomotionBlendTree } from '../src/systems/blendTree.js';

describe('blendTree', () => {
  it('solves steering weights summing to 1', () => {
    for (let yaw = -150; yaw <= 150; yaw += 30) {
      const weights = solveSteeringBlendTree(yaw, 90);
      expect(weights.level + weights.left + weights.right).toBeCloseTo(1, 6);
    }
  });

  it('solves locomotion speed weights summing to 1', () => {
    for (let speed = 0; speed <= 200; speed += 25) {
      const weights = solveLocomotionBlendTree(speed, 145);
      expect(weights.stationary + weights.moving).toBeCloseTo(1, 6);
      expect(weights.ratio).toBeGreaterThanOrEqual(0);
      expect(weights.ratio).toBeLessThanOrEqual(1);
    }
  });
});
