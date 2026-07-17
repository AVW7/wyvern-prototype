// Dragon Vault showcase overlay. Pure DOM: profile selection and action
// controls live here while VaultScene owns the Phaser preview sprite.
import { WYVERN_STATES } from '../config.js';

export const VAULT_ACTIONS = [
  WYVERN_STATES.IDLE,
  WYVERN_STATES.FLY,
  WYVERN_STATES.GUARD,
  WYVERN_STATES.ATTACK,
  WYVERN_STATES.HURT,
  WYVERN_STATES.DEATH,
];

const ACTION_ICONS = {
  [WYVERN_STATES.IDLE]: '◌',
  [WYVERN_STATES.FLY]: '↟',
  [WYVERN_STATES.GUARD]: '◆',
  [WYVERN_STATES.ATTACK]: '⚔',
  [WYVERN_STATES.HURT]: '✦',
  [WYVERN_STATES.DEATH]: '☠',
};

export function buildVaultOverlay({
  wyverns, selectedId, activeAction, onSelect, onAction, onTravel,
}) {
  const overlay = document.getElementById('ui-overlay');
  const selected = wyverns.find((wyvern) => wyvern.id === selectedId) || wyverns[0];
  if (!selected) {
    overlay.innerHTML = '<button id="btn-travel" class="btn-view">🌿 Step Outside</button>';
    document.getElementById('btn-travel').onclick = onTravel;
    return;
  }

  const cards = wyverns.map((wyvern) => `
    <button type="button" class="vault-wyvern-card${wyvern.id === selected.id ? ' is-selected' : ''}"
      data-wyvern-id="${escapeHtml(wyvern.id)}" style="--wyvern-accent:${wyvern.accent}">
      <span class="vault-avatar">🐉</span>
      <span class="vault-card-copy">
        <strong>${escapeHtml(wyvern.name)}</strong>
        <small>${escapeHtml(wyvern.sex)} · ${escapeHtml(wyvern.role)}</small>
      </span>
      <span class="vault-card-level">LV ${wyvern.level}</span>
    </button>`).join('');

  const statRows = [
    ['Guard', selected.stats.guard],
    ['Attack', selected.stats.attack],
    ['Speed', selected.stats.speed],
  ].map(([label, value]) => `
    <div class="vault-stat-row">
      <span>${label}</span>
      <span class="vault-rating" aria-label="${label}: ${value} out of 5">
        ${renderRating(value)}
      </span>
      <strong>${value}/5</strong>
    </div>`).join('');

  const tags = selected.missionTags
    .map((tag) => `<span class="vault-tag">${escapeHtml(tag)}</span>`)
    .join('');

  const actions = VAULT_ACTIONS.map((action) => {
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    return `
      <button type="button" class="vault-action${activeAction === action ? ' is-active' : ''}"
        data-vault-action="${action}">
        <span>${ACTION_ICONS[action]}</span>${label}
      </button>`;
  }).join('');

  overlay.innerHTML = `
    <section class="panel vault-roster-panel" aria-label="Dragon Vault roster">
      <div class="panel-header vault-header">
        <p class="vault-eyebrow">EMBERKEEP</p>
        <h1>Dragon Vault</h1>
        <p class="subtitle">Choose a wyvern to inspect and animate.</p>
      </div>
      <div class="vault-roster">${cards}</div>
    </section>

    <section class="panel vault-profile-panel" aria-label="Selected wyvern profile"
      style="--wyvern-accent:${selected.accent}">
      <div class="vault-profile-heading">
        <span class="vault-profile-glyph">🐉</span>
        <div>
          <p class="vault-eyebrow">${escapeHtml(selected.role)}</p>
          <h1>${escapeHtml(selected.name)}</h1>
          <p class="subtitle">${escapeHtml(selected.sex)} · Level ${selected.level} · ${selected.hp} HP</p>
        </div>
      </div>
      <div class="vault-trait">
        <small>Signature trait</small>
        <strong>${escapeHtml(selected.trait)}</strong>
        <p>${escapeHtml(selected.description)}</p>
      </div>
      <h2>Mission profile</h2>
      <div class="vault-stats">${statRows}</div>
      <div class="vault-tags">${tags}</div>
    </section>

    <div class="vault-action-dock" aria-label="Animation previews">
      <span class="vault-action-label">Preview action</span>
      <div class="vault-actions">${actions}</div>
    </div>
    <button id="btn-travel" class="btn-view">🌿 Step Outside</button>`;

  overlay.querySelectorAll('.vault-wyvern-card').forEach((button) => {
    button.onclick = () => onSelect(button.dataset.wyvernId);
  });
  overlay.querySelectorAll('.vault-action').forEach((button) => {
    button.onclick = () => onAction(button.dataset.vaultAction);
  });
  document.getElementById('btn-travel').onclick = onTravel;
}

function renderRating(value) {
  return Array.from({ length: 5 }, (_, index) => (
    `<i class="${index < value ? 'is-filled' : ''}"></i>`
  )).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
