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
      panel.remove();
    }
  };
}
