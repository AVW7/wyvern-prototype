import { describe, expect, it, vi } from 'vitest';
import { createActionPipeline, ACTION_TYPES } from '../src/systems/actionPipeline.js';

describe('actionPipeline', () => {
  it('initializes with default sequence steps', () => {
    const pipeline = createActionPipeline();
    const queue = pipeline.getQueue();
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].type).toBe(ACTION_TYPES.TARGET);
  });

  it('allows adding, removing, and moving steps', () => {
    const pipeline = createActionPipeline();
    const initialLen = pipeline.getQueue().length;

    pipeline.addStep(ACTION_TYPES.DRACARYS);
    expect(pipeline.getQueue().length).toBe(initialLen + 1);

    pipeline.removeStep(0);
    expect(pipeline.getQueue().length).toBe(initialLen);

    pipeline.moveStep(0, 1);
    expect(pipeline.getQueue().length).toBe(initialLen);
  });

  it('runs step sequence and advances step by step', () => {
    const mockMovement = {
      getLogicalPosition: () => ({ col: 10, row: 10 }),
      setFlightMode: vi.fn(),
      moveToCell: vi.fn(),
    };
    const mockDragon3D = {
      triggerAction: vi.fn(),
    };

    const pipeline = createActionPipeline({
      movement: mockMovement,
      dragon3D: mockDragon3D,
    });

    const started = pipeline.executeSequence();
    expect(started).toBe(true);
    expect(pipeline.isRunning()).toBe(true);
    expect(pipeline.getActiveIndex()).toBe(0);

    // Update ticks
    pipeline.update(50);
    expect(pipeline.getActiveIndex()).toBe(1); // Advances target step instantly
  });
});
