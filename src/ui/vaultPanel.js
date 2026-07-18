// Dragon Vault showcase overlay. Pure DOM: profile selection and action
// controls live here while VaultScene owns the Phaser preview sprite.
import { WYVERN_STATES } from '../config.js';

export const VAULT_ACTIONS = [
  WYVERN_STATES.IDLE,
  WYVERN_STATES.FLY,
  WYVERN_STATES.GUARD,
  WYVERN_STATES.ATTACK,
  WYVERN_STATES.SPECIAL,
  WYVERN_STATES.HURT,
  WYVERN_STATES.DEATH,
];

const ACTION_ICONS = {
  [WYVERN_STATES.IDLE]: '◌',
  [WYVERN_STATES.FLY]: '↟',
  [WYVERN_STATES.GUARD]: '◆',
  [WYVERN_STATES.ATTACK]: '⚔',
  [WYVERN_STATES.SPECIAL]: '✺',
  [WYVERN_STATES.HURT]: '✦',
  [WYVERN_STATES.DEATH]: '☠',
};

export function buildVaultOverlay({
  wyverns,
  selectedId,
  activeAction,
  diagnostics = {},
  tuning = {},
  tuningRanges = {},
  onSelect,
  onAction,
  onTune,
  onResetTuning,
  onTravel,
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

  const diagnosticRows = renderDiagnostics(diagnostics);
  const tuningRows = renderTuning(tuning, tuningRanges);
  const assetClass = diagnostics.valid === false ? ' is-warning' : ' is-ready';
  const assetLabel = diagnostics.assetMode === 'atlas'
    ? 'Atlas loaded'
    : diagnostics.assetMode === 'fallback'
      ? 'Atlas fallback'
      : 'Generated placeholder';

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
        <div class="vault-power">
          <small>Signature power</small>
          <strong>${escapeHtml(selected.specialPower.name)}</strong>
          <p>${escapeHtml(selected.specialPower.description)}</p>
        </div>
      </div>
      <h2>Mission profile</h2>
      <div class="vault-stats">${statRows}</div>
      <div class="vault-tags">${tags}</div>
      <section class="vault-technical" aria-label="Dragon rendering diagnostics">
        <div class="vault-technical-heading">
          <h2>Technical preview</h2>
          <span class="vault-asset-status${assetClass}" data-vault-diagnostic="assetStatus">
            ${escapeHtml(assetLabel)}
          </span>
        </div>
        <dl class="vault-diagnostics" aria-live="polite">${diagnosticRows}</dl>
        <div class="vault-tuning">${tuningRows}</div>
        <button type="button" class="vault-reset-tuning">Reset presentation</button>
      </section>
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
  overlay.querySelectorAll('[data-vault-tuning]').forEach((input) => {
    const output = overlay.querySelector(`[data-vault-tuning-value="${input.dataset.vaultTuning}"]`);
    input.oninput = () => {
      if (output) output.textContent = formatTuningValue(input.dataset.vaultTuning, input.value);
      onTune(input.dataset.vaultTuning, input.value);
    };
  });
  const resetButton = overlay.querySelector('.vault-reset-tuning');
  if (resetButton) resetButton.onclick = onResetTuning;
  document.getElementById('btn-travel').onclick = onTravel;
}

export function updateVaultDiagnostics(diagnostics = {}) {
  const overlay = document.getElementById('ui-overlay');
  if (!overlay) return;
  Object.entries(diagnosticValues(diagnostics)).forEach(([name, value]) => {
    const element = overlay.querySelector(`[data-vault-diagnostic="${name}"]`);
    if (element) element.textContent = value;
  });
}

function diagnosticValues(diagnostics) {
  const assetLabel = diagnostics.assetMode === 'atlas'
    ? 'Atlas loaded'
    : diagnostics.assetMode === 'fallback'
      ? 'Atlas fallback'
      : 'Generated placeholder';
  return {
    assetStatus: diagnostics.issueCount
      ? `${assetLabel} · ${diagnostics.issueCount} note${diagnostics.issueCount === 1 ? '' : 's'}`
      : assetLabel,
    state: diagnostics.state || 'idle',
    frame: `${diagnostics.framePosition || '1/1'} · ${diagnostics.frameName || '__BASE'}`,
    playback: `${diagnostics.frameRate || 0} fps · ${diagnostics.lifecycle || 'looping'}`,
    source: `${diagnostics.sourceSize || '—'} source · ${diagnostics.displayHeight || 0}px visible`,
    altitude: `${diagnostics.altitude || 0}px`,
    texture: `${diagnostics.atlasSize || 'generated'} · GPU max ${diagnostics.maxTextureSize || '—'}`,
  };
}

function renderDiagnostics(diagnostics) {
  const values = diagnosticValues(diagnostics);
  const rows = [
    ['State', 'state'],
    ['Frame', 'frame'],
    ['Playback', 'playback'],
    ['Scale', 'source'],
    ['Altitude', 'altitude'],
    ['Texture', 'texture'],
  ];
  return rows.map(([label, name]) => `
    <div>
      <dt>${label}</dt>
      <dd data-vault-diagnostic="${name}">${escapeHtml(values[name])}</dd>
    </div>`).join('');
}

function renderTuning(tuning, ranges) {
  const controls = [
    ['height', 'Reference height'],
    ['flightLift', 'Flight lift'],
    ['shadowAlpha', 'Shadow'],
    ['playbackRate', 'Playback'],
  ];
  return controls.map(([name, label]) => {
    const range = ranges[name];
    if (!range) return '';
    return `
      <label class="vault-tuning-row">
        <span>${label}</span>
        <input type="range" min="${range.min}" max="${range.max}" step="${range.step}"
          value="${tuning[name]}" data-vault-tuning="${name}">
        <output data-vault-tuning-value="${name}">${formatTuningValue(name, tuning[name])}</output>
      </label>`;
  }).join('');
}

function formatTuningValue(name, value) {
  const number = Number(value);
  if (name === 'shadowAlpha') return number.toFixed(2);
  if (name === 'playbackRate') return `${number.toFixed(2)}×`;
  return `${Math.round(number)}px`;
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
