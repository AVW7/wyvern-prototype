// Finite State Machine (FSM) for creature animation states and transitions.
// Manages clean state progression and prevents invalid motion popping.

export const CREATURE_STATES = {
  GROUNDED_IDLE: 'grounded_idle',
  GROUNDED_WALK: 'grounded_walk',
  TAKEOFF_TRANSITION: 'takeoff_transition',
  AIRBORNE_HOVER: 'airborne_hover',
  AIRBORNE_CRUISE: 'airborne_cruise',
  LANDING_TRANSITION: 'landing_transition',
  COMBAT_ACTION: 'combat_action',
};

const VALID_TRANSITIONS = {
  [CREATURE_STATES.GROUNDED_IDLE]: [
    CREATURE_STATES.GROUNDED_WALK,
    CREATURE_STATES.TAKEOFF_TRANSITION,
    CREATURE_STATES.COMBAT_ACTION,
  ],
  [CREATURE_STATES.GROUNDED_WALK]: [
    CREATURE_STATES.GROUNDED_IDLE,
    CREATURE_STATES.TAKEOFF_TRANSITION,
    CREATURE_STATES.COMBAT_ACTION,
  ],
  [CREATURE_STATES.TAKEOFF_TRANSITION]: [
    CREATURE_STATES.AIRBORNE_HOVER,
    CREATURE_STATES.AIRBORNE_CRUISE,
    CREATURE_STATES.COMBAT_ACTION,
  ],
  [CREATURE_STATES.AIRBORNE_HOVER]: [
    CREATURE_STATES.AIRBORNE_CRUISE,
    CREATURE_STATES.LANDING_TRANSITION,
    CREATURE_STATES.COMBAT_ACTION,
  ],
  [CREATURE_STATES.AIRBORNE_CRUISE]: [
    CREATURE_STATES.AIRBORNE_HOVER,
    CREATURE_STATES.LANDING_TRANSITION,
    CREATURE_STATES.COMBAT_ACTION,
  ],
  [CREATURE_STATES.LANDING_TRANSITION]: [
    CREATURE_STATES.GROUNDED_IDLE,
    CREATURE_STATES.GROUNDED_WALK,
    CREATURE_STATES.COMBAT_ACTION,
  ],
  [CREATURE_STATES.COMBAT_ACTION]: [
    CREATURE_STATES.GROUNDED_IDLE,
    CREATURE_STATES.GROUNDED_WALK,
    CREATURE_STATES.AIRBORNE_HOVER,
    CREATURE_STATES.AIRBORNE_CRUISE,
  ],
};

export function createCreatureFSM(initialState = CREATURE_STATES.GROUNDED_IDLE) {
  let currentState = initialState;
  let previousState = null;
  let transitionProgress = 1;
  let transitionDurationMs = 280;
  let transitionElapsedMs = 0;

  return {
    getState() {
      return currentState;
    },
    getPreviousState() {
      return previousState;
    },
    getTransitionProgress() {
      return transitionProgress;
    },
    isTransitioning() {
      return transitionProgress < 1;
    },

    canTransitionTo(nextState) {
      if (nextState === currentState) return true;
      const allowed = VALID_TRANSITIONS[currentState] || [];
      return allowed.includes(nextState);
    },

    transitionTo(nextState, durationMs = 280) {
      if (nextState === currentState) return false;
      if (!this.canTransitionTo(nextState)) return false;

      previousState = currentState;
      currentState = nextState;
      transitionDurationMs = Math.max(1, durationMs);
      transitionElapsedMs = 0;
      transitionProgress = 0;
      return true;
    },

    update(dtMs = 16) {
      if (transitionProgress < 1) {
        transitionElapsedMs += dtMs;
        transitionProgress = Math.min(1, transitionElapsedMs / transitionDurationMs);
      }
      return {
        currentState,
        previousState,
        transitionProgress,
      };
    },
  };
}
