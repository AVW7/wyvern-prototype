import { describe, expect, it } from 'vitest';
import { createCreatureFSM, CREATURE_STATES } from '../src/systems/creatureFSM.js';

describe('creatureFSM', () => {
  it('starts at initial state', () => {
    const fsm = createCreatureFSM(CREATURE_STATES.GROUNDED_IDLE);
    expect(fsm.getState()).toBe(CREATURE_STATES.GROUNDED_IDLE);
    expect(fsm.isTransitioning()).toBe(false);
  });

  it('validates allowed transitions', () => {
    const fsm = createCreatureFSM(CREATURE_STATES.GROUNDED_IDLE);
    expect(fsm.canTransitionTo(CREATURE_STATES.GROUNDED_WALK)).toBe(true);
    expect(fsm.canTransitionTo(CREATURE_STATES.TAKEOFF_TRANSITION)).toBe(true);
    expect(fsm.canTransitionTo(CREATURE_STATES.AIRBORNE_CRUISE)).toBe(false);
  });

  it('progresses transition over time', () => {
    const fsm = createCreatureFSM(CREATURE_STATES.GROUNDED_IDLE);
    const ok = fsm.transitionTo(CREATURE_STATES.GROUNDED_WALK, 200);
    expect(ok).toBe(true);
    expect(fsm.isTransitioning()).toBe(true);

    fsm.update(100);
    expect(fsm.getTransitionProgress()).toBe(0.5);

    fsm.update(100);
    expect(fsm.getTransitionProgress()).toBe(1);
    expect(fsm.isTransitioning()).toBe(false);
  });
});
