// Action Pipeline Kanban Board floating UI panel component.
// Renders an interactive action sequence board for building dragon behavior pipelines.

import { ACTION_TYPES } from '../systems/actionPipeline.js';

export function createActionKanbanPanel({ overlayContainer, pipeline, onSelectTargetMode } = {}) {
  let panelEl = null;

  function render() {
    if (!overlayContainer) return;

    if (!panelEl) {
      panelEl = document.createElement('div');
      panelEl.id = 'action-kanban-panel';
      panelEl.className = 'kanban-panel-card';
      overlayContainer.appendChild(panelEl);
    }

    const queue = pipeline.getQueue();
    const activeIndex = pipeline.getActiveIndex();
    const isRunning = pipeline.isRunning();
    const statusText = pipeline.getStatusText();

    const telem = pipeline.getTelemetry?.() || { col: 0, row: 0, alt: 0, mode: 'Grounded' };

    let html = `
      <div class="kanban-header">
        <div class="kanban-title">
          <span class="kanban-icon">📋</span>
          <h3>Action Pipeline</h3>
        </div>
        <span class="kanban-status-badge ${isRunning ? 'active' : ''}">${statusText}</span>
      </div>

      <div class="kanban-telemetry-bar">
        <span>📍 Col ${telem.col}, Row ${telem.row} | Alt ${telem.alt}u | ${telem.mode}</span>
      </div>
      
      <div class="kanban-step-list">
    `;

    if (queue.length === 0) {
      html += `<div class="kanban-empty-msg">No actions queued. Add steps below!</div>`;
    } else {
      queue.forEach((step, idx) => {
        const isActive = isRunning && activeIndex === idx;
        html += `
          <div class="kanban-step-card ${isActive ? 'step-active' : ''}" data-index="${idx}">
            <span class="step-num">${idx + 1}</span>
            <div class="step-details">
              <span class="step-label">${step.label}</span>
              ${step.targetCell ? `<span class="step-sub">Cell (${step.targetCell.col}, ${step.targetCell.row})</span>` : ''}
            </div>
            <div class="step-actions">
              ${idx > 0 ? `<button class="btn-step-opt" data-action="up" data-index="${idx}" title="Move Up">▲</button>` : ''}
              ${idx < queue.length - 1 ? `<button class="btn-step-opt" data-action="down" data-index="${idx}" title="Move Down">▼</button>` : ''}
              <button class="btn-step-opt btn-step-del" data-action="del" data-index="${idx}" title="Delete">✕</button>
            </div>
          </div>
        `;
      });
    }

    html += `
      </div>

      <div class="kanban-preset-bar">
        <button class="btn-preset-opt" data-preset="FIRE_STRIKE">🔥 Strike Preset</button>
        <button class="btn-preset-opt" data-preset="PATROL">🚁 Patrol Preset</button>
      </div>

      <div class="kanban-add-bar">
        <button class="btn-add-step" data-add="${ACTION_TYPES.TARGET}">+ Target</button>
        <button class="btn-add-step" data-add="${ACTION_TYPES.TAKEOFF}">+ TakeOff</button>
        <button class="btn-add-step" data-add="${ACTION_TYPES.FLY_TO}">+ FlyTo</button>
        <button class="btn-add-step" data-add="${ACTION_TYPES.DRACARYS}">+ Dracarys</button>
        <button class="btn-add-step" data-add="${ACTION_TYPES.RETURN}">+ Return</button>
      </div>

      <div class="kanban-exec-bar">
        ${isRunning
          ? `<button class="btn-kanban-exec btn-stop" id="btn-kanban-stop">⏹ Stop Sequence</button>`
          : `<button class="btn-kanban-exec btn-run" id="btn-kanban-run">▶ Execute Sequence</button>`}
      </div>
    `;

    panelEl.innerHTML = html;
    bindEvents();
  }

  function bindEvents() {
    if (!panelEl) return;

    // Prevent keyboard leak to game engine
    panelEl.addEventListener('keydown', (e) => e.stopPropagation());

    // Step option buttons (up, down, delete)
    panelEl.querySelectorAll('.btn-step-opt').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const idx = parseInt(btn.dataset.index, 10);
        if (action === 'up') pipeline.moveStep(idx, idx - 1);
        else if (action === 'down') pipeline.moveStep(idx, idx + 1);
        else if (action === 'del') pipeline.removeStep(idx);
        render();
      });
    });

    // Add step buttons
    panelEl.querySelectorAll('.btn-add-step').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.dataset.add;
        if (type === ACTION_TYPES.TARGET && onSelectTargetMode) {
          onSelectTargetMode();
        } else {
          pipeline.addStep(type);
        }
        render();
      });
    });

    // Preset buttons
    panelEl.querySelectorAll('.btn-preset-opt').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const presetKey = btn.dataset.preset;
        pipeline.loadPreset(presetKey);
        render();
      });
    });

    // Run / Stop buttons
    const runBtn = panelEl.querySelector('#btn-kanban-run');
    if (runBtn) {
      runBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pipeline.executeSequence();
        render();
      });
    }

    const stopBtn = panelEl.querySelector('#btn-kanban-stop');
    if (stopBtn) {
      stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        pipeline.stopSequence();
        render();
      });
    }
  }

  return {
    render,
    update() {
      if (pipeline.isRunning()) {
        render();
      }
    },
    destroy() {
      if (panelEl && panelEl.parentNode) {
        panelEl.parentNode.removeChild(panelEl);
      }
      panelEl = null;
    },
  };
}
