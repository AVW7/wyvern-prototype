// A floating test panel for tuning and testing the 3D Wyvern model on the sanctuary page.
export function createDragonTestPanel(scene, sanctuary3D) {
  // Check if panel already exists
  let panel = document.getElementById('dragon-test-panel');
  if (panel) {
    panel.remove();
  }

  panel = document.createElement('div');
  panel.id = 'dragon-test-panel';
  panel.className = 'test-panel';
  panel.innerHTML = `
    <div class="test-panel-header">
      <h3>🐉 3D Wyvern Debug</h3>
      <button id="test-panel-toggle" class="test-panel-btn-small" title="Minimize/Maximize">×</button>
    </div>
    <div class="test-panel-content">
      <div class="test-section">
        <label>Dragon Model scale: <span id="val-scale">1.0</span>x</label>
        <input type="range" id="tune-scale" min="0.5" max="3.0" step="0.1" value="1.0">
      </div>
      
      <div class="test-section">
        <label>Animation speed: <span id="val-speed">1.0</span>x</label>
        <input type="range" id="tune-speed" min="0.1" max="2.5" step="0.1" value="1.0">
      </div>
      
      <div class="test-section">
        <label>Flight Altitude: <span id="val-altitude">0</span> units</label>
        <input type="range" id="tune-altitude" min="0" max="150" step="5" value="0">
      </div>

      <div class="test-section">
        <h4>Interactive Actions</h4>
        <div class="test-btn-grid">
          <button class="test-btn" data-action="idle">Idle</button>
          <button class="test-btn" data-action="walk">Walk</button>
          <button class="test-btn" data-action="fly">Fly</button>
          <button class="test-btn" data-action="attack">Attack</button>
          <button class="test-btn" data-action="dracarys">Dracarys</button>
          <button class="test-btn" data-action="special">Special</button>
        </div>
        <button id="clear-override" class="test-btn test-btn-primary" style="margin-top: 8px; width: 100%;">Gameplay State (Auto)</button>
      </div>

      <div class="test-section">
        <h4>Motion State</h4>
        <pre id="motion-state" style="margin: 0; font-size: 11px; line-height: 1.5; white-space: pre-wrap;">—</pre>
      </div>

      <div class="test-section">
        <h4>Clip Bindings</h4>
        <div class="test-slider-row" style="margin-bottom: 6px;">
          <label for="clip-slot">Motion slot</label>
          <select id="clip-slot" style="width: 100%;"></select>
        </div>
        <div class="test-slider-row" style="margin-bottom: 6px;">
          <label for="clip-name">Clip</label>
          <select id="clip-name" style="width: 100%;"></select>
        </div>
        <button id="clip-apply" class="test-btn test-btn-primary" style="width: 100%;">Bind &amp; Play</button>
      </div>

      <div class="test-section">
        <h4>Environment &amp; Lighting</h4>
        <div class="test-checkbox-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label for="tune-wireframe" style="margin: 0;">Wireframe mode</label>
          <input type="checkbox" id="tune-wireframe">
        </div>
        <div class="test-slider-row" style="margin-bottom: 8px;">
          <label>Sun Intensity: <span id="val-sun">0.95</span></label>
          <input type="range" id="tune-sun" min="0.0" max="3.0" step="0.1" value="0.95" style="width: 100%;">
        </div>
        <div class="test-slider-row">
          <label>Ambient Light: <span id="val-ambient">1.2</span></label>
          <input type="range" id="tune-ambient" min="0.0" max="3.0" step="0.1" value="1.2" style="width: 100%;">
        </div>
      </div>

      <div class="test-section">
        <h4>Terrain</h4>
        <div class="test-slider-row" style="margin-bottom: 8px;">
          <label>Exposure: <span id="val-exposure">1.05</span></label>
          <input type="range" id="tune-exposure" min="0.4" max="2.0" step="0.05" value="1.05" style="width: 100%;">
        </div>
        <div class="test-slider-row" style="margin-bottom: 8px;">
          <label>Occlusion: <span id="val-ao">0.45</span></label>
          <input type="range" id="tune-ao" min="0" max="1" step="0.02" value="0.45" style="width: 100%;">
        </div>
        <div class="test-slider-row" style="margin-bottom: 8px;">
          <label>Tile jitter: <span id="val-jitter">0.13</span></label>
          <input type="range" id="tune-jitter" min="0" max="0.4" step="0.01" value="0.13" style="width: 100%;">
        </div>
        <div class="test-checkbox-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label for="tune-fog" style="margin: 0;">Distance haze</label>
          <input type="checkbox" id="tune-fog" checked>
        </div>
        <div class="test-slider-row" style="margin-bottom: 8px;">
          <label>Haze start: <span id="val-fognear">620</span></label>
          <input type="range" id="tune-fognear" min="100" max="2000" step="20" value="620" style="width: 100%;">
        </div>
        <div class="test-slider-row" style="margin-bottom: 8px;">
          <label>Haze end: <span id="val-fogfar">1750</span></label>
          <input type="range" id="tune-fogfar" min="400" max="4000" step="50" value="1750" style="width: 100%;">
        </div>
        <div class="test-slider-row" style="margin-bottom: 8px;">
          <label>Water speed: <span id="val-water">0.035</span></label>
          <input type="range" id="tune-water" min="0" max="0.2" step="0.005" value="0.035" style="width: 100%;">
        </div>
        <div class="test-slider-row">
          <label>Lava glow: <span id="val-lava">2.3</span></label>
          <input type="range" id="tune-lava" min="0.5" max="6" step="0.1" value="2.3" style="width: 100%;">
        </div>
      </div>

      <div class="test-section">
        <h4>World Commands</h4>
        <button id="reset-world" class="test-btn test-btn-secondary" style="width: 100%;">Reset World &amp; Braziers</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  // Wire up listeners
  const scaleInput = document.getElementById('tune-scale');
  const scaleVal = document.getElementById('val-scale');
  scaleInput.oninput = (e) => {
    const val = parseFloat(e.target.value);
    scaleVal.innerText = val.toFixed(1);
    sanctuary3D.setTuning('scale', val);
  };

  const speedInput = document.getElementById('tune-speed');
  const speedVal = document.getElementById('val-speed');
  speedInput.oninput = (e) => {
    const val = parseFloat(e.target.value);
    speedVal.innerText = val.toFixed(1);
    sanctuary3D.setTuning('animationSpeed', val);
  };

  const altitudeInput = document.getElementById('tune-altitude');
  const altitudeVal = document.getElementById('val-altitude');
  
  // Set initial altitude from movement if available
  if (scene.movement && typeof scene.movement.getAltitude === 'function') {
    const currentAlt = scene.movement.getAltitude();
    altitudeInput.value = Math.round(currentAlt);
    altitudeVal.innerText = Math.round(currentAlt);
  }
  
  altitudeInput.oninput = (e) => {
    const val = parseInt(e.target.value);
    altitudeVal.innerText = val;
    if (scene.movement && typeof scene.movement.setAltitude === 'function') {
      scene.movement.setAltitude(val);
    }
  };

  const wireframeInput = document.getElementById('tune-wireframe');
  wireframeInput.onchange = (e) => {
    sanctuary3D.setTuning('wireframe', e.target.checked);
  };

  const sunInput = document.getElementById('tune-sun');
  const sunVal = document.getElementById('val-sun');
  sunInput.oninput = (e) => {
    const val = parseFloat(e.target.value);
    sunVal.innerText = val.toFixed(2);
    sanctuary3D.setTuning('sunIntensity', val);
  };

  const ambientInput = document.getElementById('tune-ambient');
  const ambientVal = document.getElementById('val-ambient');
  ambientInput.oninput = (e) => {
    const val = parseFloat(e.target.value);
    ambientVal.innerText = val.toFixed(2);
    sanctuary3D.setTuning('ambientIntensity', val);
  };

  // Live motion readout. Polled rather than pushed so the render loop stays
  // free of DOM writes; 4 Hz is enough to read and cheap enough to ignore.
  const motionStateEl = document.getElementById('motion-state');
  const motionPoll = setInterval(() => {
    const state = sanctuary3D.getMotionState?.();
    if (!state || !motionStateEl) return;
    motionStateEl.textContent = [
      `playing  ${state.current ?? '—'}`,
      `base     ${state.base ?? '—'}${state.timeScale !== 1 ? ` ×${state.timeScale}` : ''}`,
      `oneshot  ${state.pending ?? '—'}`,
      `override ${state.override ?? '—'}`,
      `yaw ${state.headingDeg}°  roll ${state.rollDeg}°  pitch ${state.pitchDeg}°`,
      `airborne ${state.airborne}`,
    ].join('\n');
  }, 250);

  // Terrain sliders. Each maps 1:1 onto a sanctuary3D.setTuning() parameter.
  [
    ['tune-exposure', 'val-exposure', 'exposure', 2],
    ['tune-ao', 'val-ao', 'aoStrength', 2],
    ['tune-jitter', 'val-jitter', 'colorJitter', 2],
    ['tune-fognear', 'val-fognear', 'fogNear', 0],
    ['tune-fogfar', 'val-fogfar', 'fogFar', 0],
    ['tune-water', 'val-water', 'waterSpeed', 3],
    ['tune-lava', 'val-lava', 'lavaGlow', 1],
  ].forEach(([inputId, valueId, param, digits]) => {
    const input = document.getElementById(inputId);
    const readout = document.getElementById(valueId);
    if (!input) return;
    input.oninput = (e) => {
      const val = parseFloat(e.target.value);
      if (readout) readout.innerText = val.toFixed(digits);
      sanctuary3D.setTuning(param, val);
    };
  });

  const fogInput = document.getElementById('tune-fog');
  if (fogInput) {
    fogInput.onchange = (e) => sanctuary3D.setTuning('fogEnabled', e.target.checked);
  }

  // Clip picker. The model ships 16 clips and config.js guesses which belongs
  // in which motion slot; this is how those guesses get checked by eye. The
  // winning pairs are copied back into SANCTUARY.dragon3D.clips by hand.
  const slotSelect = document.getElementById('clip-slot');
  const clipSelect = document.getElementById('clip-name');
  const clipApply = document.getElementById('clip-apply');
  function fillClipPickers() {
    const slots = sanctuary3D.listMotionSlots?.() || [];
    const clips = sanctuary3D.listClips?.() || [];
    if (!slots.length || !clips.length) return false;
    slotSelect.innerHTML = slots
      .map((s) => `<option value="${s}">${s}</option>`).join('');
    clipSelect.innerHTML = clips
      .map((c) => `<option value="${c}">${c}</option>`).join('');
    return true;
  }
  // The model loads asynchronously, so the clip list may not exist yet.
  let clipPoll = null;
  if (!fillClipPickers()) {
    clipPoll = setInterval(() => {
      if (fillClipPickers()) {
        clearInterval(clipPoll);
        clipPoll = null;
      }
    }, 250);
  }
  if (clipApply) {
    clipApply.onclick = () => {
      const slot = slotSelect.value;
      if (!slot || !sanctuary3D.setClip?.(slot, clipSelect.value)) return;
      // Force the rebound slot on screen so the choice can be judged.
      actionButtons.forEach((b) => b.classList.remove('is-active'));
      scene.testOverrideAction = slot;
    };
  }

  // Actions
  const actionButtons = panel.querySelectorAll('.test-btn[data-action]');
  actionButtons.forEach(btn => {
    btn.onclick = () => {
      // Remove active class from others
      actionButtons.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      
      const action = btn.dataset.action;
      scene.testOverrideAction = action;
      
      // If it's dracarys, trigger particle effects manually in Three.js too
      if (action === 'dracarys') {
        scene.dracarysFromPanel(scene.selectedWyvernId);
      }
    };
  });

  const clearOverrideBtn = document.getElementById('clear-override');
  clearOverrideBtn.onclick = () => {
    actionButtons.forEach(b => b.classList.remove('is-active'));
    scene.testOverrideAction = null;
  };

  // Reset World
  const resetBtn = document.getElementById('reset-world');
  resetBtn.onclick = () => {
    const view = scene.captureCameraView();
    scene.buildWorld({ restoreView: view });
  };

  // Toggle minimizing the panel
  const toggleBtn = document.getElementById('test-panel-toggle');
  toggleBtn.onclick = () => {
    panel.classList.toggle('is-minimized');
    if (panel.classList.contains('is-minimized')) {
      toggleBtn.innerText = '+';
    } else {
      toggleBtn.innerText = '×';
    }
  };

  return {
    destroy() {
      if (clipPoll) clearInterval(clipPoll);
      clearInterval(motionPoll);
      panel.remove();
    }
  };
}
