// Dragon Vault showcase overlay. Pure DOM: exit navigation lives here.
import { createNavIsland } from './uiKit.js';

export const VAULT_ACTIONS = [];

export function buildVaultOverlay({
  onTravel,
  onAtlas,
}) {
  const overlay = document.getElementById('ui-overlay');
  const navIsland = createNavIsland([
    { label: '🌿 Grounds', onClick: onTravel },
    { label: '🗺️ World Atlas', onClick: onAtlas }
  ]);

  overlay.innerHTML = `
    <section class="panel vault-roster-panel" aria-label="Dragon Vault">
      <div class="panel-header vault-header">
        <p class="vault-eyebrow">EMBERKEEP</p>
        <h1>Dragon Vault</h1>
        <p class="subtitle">Welcome to the Emberkeep Dragon Vault.</p>
      </div>
    </section>
  `;

  overlay.appendChild(navIsland);
}

export function updateVaultDiagnostics() {}
