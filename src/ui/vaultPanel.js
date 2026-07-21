// Dragon Vault showcase overlay. Pure DOM: exit navigation lives here.
import { createNavIsland } from './uiKit.js';

export function buildVaultOverlay({
  onTravel,
  onAtlas,
  onCameraRig = () => {},
}) {
  const overlay = document.getElementById('ui-overlay');
  const navIsland = createNavIsland([
    { label: '🌿 Grounds', onClick: onTravel },
    { label: '🗺️ World Atlas', onClick: onAtlas }
  ]);

  overlay.innerHTML = `
    <section class="panel vault-roster-panel" aria-label="Rider Vault">
      <div class="panel-header vault-header">
        <p class="vault-eyebrow">EMBERKEEP</p>
        <h1>Rider Vault</h1>
        <p class="subtitle">Welcome to the Emberkeep Rider Vault.</p>
      </div>
      <p class="vault-camera-hint">Drag or two-finger swipe to orbit · right-drag to pan · wheel to zoom</p>
      <div class="camera-rig" role="group" aria-label="Vault camera controls">
        <span class="camera-rig-readout"><strong>Camera</strong><small>pan · tilt · zoom</small></span>
        <button class="camera-rig-btn" data-camera-rig="yaw-left" title="Rotate view left ([)" aria-label="Rotate view left">↶</button>
        <button class="camera-rig-btn" data-camera-rig="yaw-right" title="Rotate view right (])" aria-label="Rotate view right">↷</button>
        <button class="camera-rig-btn" data-camera-rig="tilt-down" title="Tilt down (PageDown)" aria-label="Tilt down">▾</button>
        <button class="camera-rig-btn" data-camera-rig="tilt-up" title="Tilt up (PageUp)" aria-label="Tilt up">▴</button>
        <button class="camera-rig-btn camera-rig-reset" data-camera-rig="reset" title="Reset camera (Home)" aria-label="Reset camera">⌂</button>
      </div>
    </section>
  `;

  overlay.querySelectorAll('[data-camera-rig]').forEach((button) => {
    button.onclick = () => onCameraRig(button.dataset.cameraRig);
  });

  overlay.appendChild(navIsland);
}
