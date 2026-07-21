// Manages automated action sequence pipelines for the 3D dragon (Kanban / Action Board).
// Handles step queueing, reordering, step progression, and execution safety.

export const ACTION_TYPES = {
  TARGET: 'target',
  TAKEOFF: 'takeoff',
  FLY_TO: 'flyTo',
  DRACARYS: 'dracarys',
  RETURN: 'return',
};

export const PRESET_SEQUENCES = {
  FIRE_STRIKE: [
    { id: 'p1-1', type: ACTION_TYPES.TARGET, label: 'Attach Target', targetCell: { col: 20, row: 18 }, name: 'Brazier' },
    { id: 'p1-2', type: ACTION_TYPES.TAKEOFF, label: 'Take Off' },
    { id: 'p1-3', type: ACTION_TYPES.FLY_TO, label: 'Fly to Position' },
    { id: 'p1-4', type: ACTION_TYPES.DRACARYS, label: 'Dracarys' },
    { id: 'p1-5', type: ACTION_TYPES.RETURN, label: 'Return & Land' },
  ],
  PATROL: [
    { id: 'p2-1', type: ACTION_TYPES.TAKEOFF, label: 'Take Off' },
    { id: 'p2-2', type: ACTION_TYPES.FLY_TO, label: 'Fly to Position', targetCell: { col: 25, row: 25 }, name: 'Patrol Post' },
    { id: 'p2-3', type: ACTION_TYPES.RETURN, label: 'Return & Land' },
  ],
};

export const ACTION_DEFAULTS = PRESET_SEQUENCES.FIRE_STRIKE;

export function createActionPipeline({ movement, dragon3D } = {}) {
  let queue = [...ACTION_DEFAULTS];
  let activeIndex = -1;
  let isRunning = false;
  let statusText = 'Ready';
  let originCell = null;
  let currentTargetCell = null;
  let stepTimerMs = 0;

  return {
    getQueue() {
      return queue;
    },
    getActiveIndex() {
      return activeIndex;
    },
    isRunning() {
      return isRunning;
    },
    getStatusText() {
      return statusText;
    },

    getTelemetry() {
      if (!movement) return { col: 0, row: 0, alt: 0, mode: 'Ground' };
      const pos = movement.getLogicalPosition?.() || { col: 0, row: 0 };
      const alt = movement.getAltitude?.() || 0;
      const isFlying = movement.isFlying ?? false;
      return {
        col: Math.round(pos.col * 10) / 10,
        row: Math.round(pos.row * 10) / 10,
        alt: Math.round(alt),
        mode: isFlying ? 'Airborne 🪽' : 'Grounded 🐾',
      };
    },

    loadPreset(presetKey) {
      if (PRESET_SEQUENCES[presetKey]) {
        queue = PRESET_SEQUENCES[presetKey].map(s => ({ ...s, id: 'step-' + Math.random().toString(36).substring(2, 7) }));
        this.stopSequence();
        statusText = `Loaded ${presetKey} preset`;
      }
      return queue;
    },

    addStep(type, details = {}) {
      const id = 'step-' + Math.random().toString(36).substring(2, 7);
      let label = 'Action';
      if (type === ACTION_TYPES.TARGET) label = `Attach Target: ${details.name || 'Cell'}`;
      else if (type === ACTION_TYPES.TAKEOFF) label = 'Take Off';
      else if (type === ACTION_TYPES.FLY_TO) label = 'Fly to Position';
      else if (type === ACTION_TYPES.DRACARYS) label = 'Dracarys';
      else if (type === ACTION_TYPES.RETURN) label = 'Return & Land';

      queue.push({
        id,
        type,
        label,
        targetCell: details.targetCell || { col: 20, row: 20 },
        name: details.name || 'Cell',
      });
      return queue;
    },

    removeStep(index) {
      if (index >= 0 && index < queue.length) {
        queue.splice(index, 1);
      }
      return queue;
    },

    moveStep(fromIndex, toIndex) {
      if (fromIndex >= 0 && fromIndex < queue.length && toIndex >= 0 && toIndex < queue.length) {
        const [item] = queue.splice(fromIndex, 1);
        queue.splice(toIndex, 0, item);
      }
      return queue;
    },

    setTargetCell(cell, name = 'Target Cell') {
      currentTargetCell = cell;
      // Update any target or flyTo steps in queue
      queue.forEach((step) => {
        if (step.type === ACTION_TYPES.TARGET || step.type === ACTION_TYPES.FLY_TO) {
          step.targetCell = { ...cell };
          step.name = name;
          if (step.type === ACTION_TYPES.TARGET) step.label = `Attach Target: ${name}`;
        }
      });
    },

    executeSequence() {
      if (queue.length === 0) {
        statusText = 'Queue empty';
        return false;
      }

      if (movement) {
        const cur = movement.getLogicalPosition?.() || { col: 15, row: 15 };
        originCell = { col: Math.round(cur.col), row: Math.round(cur.row) };
      }

      isRunning = true;
      activeIndex = 0;
      stepTimerMs = 0;
      statusText = `Executing Step 1: ${queue[0].label}`;
      return true;
    },

    stopSequence() {
      isRunning = false;
      activeIndex = -1;
      statusText = 'Stopped';
    },

    update(dtMs = 16) {
      if (!isRunning || activeIndex < 0 || activeIndex >= queue.length) {
        return;
      }

      stepTimerMs += dtMs;
      const step = queue[activeIndex];
      statusText = `Running [${activeIndex + 1}/${queue.length}]: ${step.label}`;

      switch (step.type) {
        case ACTION_TYPES.TARGET: {
          if (step.targetCell) {
            currentTargetCell = step.targetCell;
          }
          // Instant completion -> next step
          this._nextStep();
          break;
        }

        case ACTION_TYPES.TAKEOFF: {
          if (movement) {
            movement.setFlightMode?.(true);
          }
          if (stepTimerMs >= 800) {
            this._nextStep();
          }
          break;
        }

        case ACTION_TYPES.FLY_TO: {
          const dest = currentTargetCell || step.targetCell || { col: 20, row: 20 };
          if (movement && stepTimerMs < 50) {
            movement.setFlightMode?.(true);
            movement.moveToCell?.(dest.col, dest.row);
          }

          if (movement) {
            const pos = movement.getLogicalPosition?.() || { col: dest.col, row: dest.row };
            const dist = Math.hypot(pos.col - dest.col, pos.row - dest.row);
            if (dist < 0.8 || stepTimerMs > 8000) {
              this._nextStep();
            }
          } else {
            this._nextStep();
          }
          break;
        }

        case ACTION_TYPES.DRACARYS: {
          if (dragon3D && stepTimerMs < 50) {
            dragon3D.triggerAction?.('dracarys');
          }
          if (stepTimerMs >= 1500) {
            this._nextStep();
          }
          break;
        }

        case ACTION_TYPES.RETURN: {
          const dest = originCell || { col: 15, row: 15 };
          if (movement && stepTimerMs < 50) {
            movement.moveToCell?.(dest.col, dest.row);
          }

          if (movement) {
            const pos = movement.getLogicalPosition?.() || { col: dest.col, row: dest.row };
            const dist = Math.hypot(pos.col - dest.col, pos.row - dest.row);
            if (dist < 0.8 || stepTimerMs > 8000) {
              movement.setFlightMode?.(false);
              if (stepTimerMs > 500) {
                this._nextStep();
              }
            }
          } else {
            this._nextStep();
          }
          break;
        }

        default:
          this._nextStep();
          break;
      }
    },

    _nextStep() {
      stepTimerMs = 0;
      activeIndex++;
      if (activeIndex >= queue.length) {
        isRunning = false;
        activeIndex = -1;
        statusText = 'Sequence Complete!';
      } else {
        statusText = `Running [${activeIndex + 1}/${queue.length}]: ${queue[activeIndex].label}`;
      }
    },
  };
}
