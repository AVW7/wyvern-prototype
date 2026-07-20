// The Roost management panel, shared by the two sanctuary scenes (BaseScene
// grounds / VaultScene interior). Pure HTML-overlay code — it renders into
// #ui-overlay and wires the caller's handlers; it knows nothing about Phaser.
// The scenes stay separate; only this UI widget is common between them.
import { getRoster } from '../systems/roster.js';
import { SPECIES } from '../data/species.js';
import { SANCTUARY } from '../config.js';
import { createNavIsland } from './uiKit.js';

function cameraRigMarkup(view = {}, transitioning = false, collapsed = false) {
  const yaw = Number.isFinite(view.yawDeg) ? view.yawDeg : 0;
  const elevation = Number.isFinite(view.elevationStep) ? view.elevationStep : 0;
  const rig = SANCTUARY.cameraRig;
  const elevationLabel = elevation < 0 ? 'Lower' : elevation > 0 ? 'Higher' : 'Default';
  const disabled = transitioning ? ' disabled' : '';
  const leftDisabled = transitioning || yaw <= rig.yaw.min ? ' disabled' : '';
  const rightDisabled = transitioning || yaw >= rig.yaw.max ? ' disabled' : '';
  const downDisabled = transitioning || elevation <= rig.elevation.minStep ? ' disabled' : '';
  const upDisabled = transitioning || elevation >= rig.elevation.maxStep ? ' disabled' : '';

  return `
    <div class="camera-rig${collapsed ? ' is-collapsed' : ''}"
      role="group" aria-label="Sanctuary viewpoint">
      <span class="camera-rig-readout" aria-live="polite">
        <strong>${yaw > 0 ? '+' : ''}${yaw}°</strong>
        <small>${elevationLabel}${transitioning ? ' · moving' : ''}</small>
      </span>
      <button class="camera-rig-btn" data-camera-rig="yaw-left"
        title="Rotate view left ([)" aria-label="Rotate view left"${leftDisabled}>↶</button>
      <button class="camera-rig-btn" data-camera-rig="yaw-right"
        title="Rotate view right (])" aria-label="Rotate view right"${rightDisabled}>↷</button>
      <button class="camera-rig-btn" data-camera-rig="elevation-down"
        title="Lower viewpoint (Page Down)" aria-label="Lower viewpoint"${downDisabled}>⇣</button>
      <button class="camera-rig-btn" data-camera-rig="elevation-up"
        title="Raise viewpoint (Page Up)" aria-label="Raise viewpoint"${upDisabled}>⇡</button>
      <button class="camera-rig-btn camera-rig-reset" data-camera-rig="reset"
        title="Reset complete camera rig (Home)" aria-label="Reset camera rig"${disabled}>⌂</button>
    </div>`;
}

function applyCameraTransitionLock(overlay, transitioning) {
  overlay.classList.toggle('is-camera-transitioning', transitioning);
  overlay.toggleAttribute('inert', transitioning);
  overlay.setAttribute('aria-busy', String(transitioning));
  if (!transitioning) return;
  overlay.querySelectorAll('button').forEach((button) => {
    button.disabled = true;
  });
  overlay.querySelectorAll('.roster-card').forEach((card) => {
    card.setAttribute('aria-disabled', 'true');
    card.tabIndex = -1;
  });
}

/**
 * Renders the roster panel + nav island into the overlay.
 *
 * @param {object} opts
 * @param {string}   opts.subtitle      line under the "Roost" title
 * @param {string}   opts.travelLabel   label of the scene-travel button
 * @param {string}   [opts.launchLabel] label of the launch button
 * @param {boolean}  opts.collapsed     panel collapsed to a pill?
 * @param {Function} opts.onTravel      travel button clicked
 * @param {Function} opts.onLaunch      launch button clicked
 * @param {Function} opts.onTrain       (animalId) Train clicked
 * @param {Function} opts.onFeed        (animalId) Feed clicked
 * @param {Function} opts.onRecruit     (speciesId) recruit button clicked
 * @param {Function} opts.onCollapse    hide-panel ✕ clicked
 * @param {Function} opts.onExpand      collapsed pill clicked
 * @param {string}   opts.selectedId    directly controlled roster wyvern
 * @param {string}   opts.cameraMode    overview / follow / survey
 * @param {string}   opts.resultMessage latest in-world action feedback
 * @param {Function} opts.onSelect      (animalId) roster card selected
 * @param {Function} opts.onCameraMode  (mode) camera control selected
 * @param {object}   opts.cameraView    current yaw/elevation state
 * @param {Function} opts.onCameraRig   (action) yaw/elevation control selected
 */
export function buildRoostOverlay({
  subtitle, travelLabel, collapsed, launchLabel = 'World Atlas',
  onTravel, onLaunch, onTrain, onFeed, onDracarys, onRecruit, onCollapse, onExpand,
  selectedId = null, cameraMode = 'overview', resultMessage = '',
  cameraView = { yawDeg: 0, elevationStep: 0 }, cameraTransitioning = false,
  onSelect = () => {}, onCameraMode = () => {}, onCameraRig = () => {},
}) {
  const overlay = document.getElementById('ui-overlay');

  const navIsland = createNavIsland([
    { label: travelLabel, icon: '🏰', onClick: onTravel },
    { label: launchLabel, icon: '🗺️', onClick: onLaunch, primary: true }
  ]);
  const controlsHint = `
    <div class="sanctuary-controls-hint" aria-hidden="true">
      Move <kbd>WASD</kbd>/<kbd>Arrows</kbd> · Interact <kbd>E</kbd> ·
      Fly <kbd>G</kbd> · Altitude <kbd>R</kbd>/<kbd>Q</kbd> ·
      Orbit <kbd>[</kbd>/<kbd>]</kbd> · Elevate <kbd>PgUp</kbd>/<kbd>PgDn</kbd> ·
      Follow <kbd>F</kbd> · Reset <kbd>Home</kbd> · Pan <kbd>Space</kbd>/right-drag · Wheel zoom
    </div>`;
  const message = resultMessage
    ? `<div class="sanctuary-result" role="status" aria-live="polite">${resultMessage}</div>`
    : '';

  if (collapsed) {
    overlay.innerHTML = `
      <button id="btn-expand" class="panel-pill">🐉 Roost</button>
      ${cameraRigMarkup(cameraView, cameraTransitioning, true)}
      ${message}
      ${controlsHint}`;
    document.getElementById('btn-expand').onclick = onExpand;
    overlay.appendChild(navIsland);
    overlay.querySelectorAll('[data-camera-rig]').forEach((button) => {
      button.onclick = () => onCameraRig(button.dataset.cameraRig);
    });
    applyCameraTransitionLock(overlay, cameraTransitioning);
    return;
  }

  const roster = getRoster();
  const selected = roster.find((animal) => animal.id === selectedId);
  const rows = roster.map((animal) => renderCard(animal, animal.id === selectedId)).join('');
  const recruitButtons = Object.values(SPECIES)
    .map((s) => `<button class="recruit-btn" data-species="${s.id}" title="Recruit a new ${s.name}"><span class="btn-icon">${s.emoji}</span>${s.name}</button>`)
    .join('');

  overlay.innerHTML = `
    <div class="panel base-panel">
      <div class="panel-header">
        <button id="btn-collapse" class="panel-hide" title="Hide panel">✕</button>
        <h1>Roost</h1>
        <p class="subtitle">${subtitle}</p>
      </div>
      <h2>Companions <span class="roster-count">${roster.length}</span></h2>
      <div class="sanctuary-toolbar">
        <div class="controlled-animal">
          <span>Free roam${selected ? '<span class="live-dot" title="Live connection"></span>' : ''}</span>
          <strong>${selected?.name ?? 'Choose a wyvern'}</strong>
        </div>
        <div class="camera-modes" role="group" aria-label="Sanctuary camera mode">
          ${['overview', 'follow', 'survey'].map((mode) => {
            const title = mode === 'overview' 
              ? 'Overview: fit all to screen' 
              : mode === 'follow' 
                ? 'Follow: snap and track selected companion' 
                : 'Survey: free camera panning';
            return `
              <button class="camera-mode${cameraMode === mode ? ' is-active' : ''}"
                data-camera-mode="${mode}" aria-pressed="${cameraMode === mode}" title="${title}">
                ${mode === 'overview' ? '⌂' : mode === 'follow' ? '◎' : '✥'}
                <span>${mode}</span>
              </button>`;
          }).join('')}
        </div>
      </div>
      ${cameraRigMarkup(cameraView, cameraTransitioning)}
      ${message || '<p class="sanctuary-result is-muted">Approach a glowing landmark and press E.</p>'}
      <ul class="roster">${rows}</ul>
      <div class="base-actions">
        <h2 class="recruit-label">Recruit</h2>
        <div class="recruit-row">${recruitButtons}</div>
      </div>
    </div>
    ${controlsHint}`;

  overlay.appendChild(navIsland);

  document.getElementById('btn-collapse').onclick = onCollapse;
  roster.forEach((a) => {
    document.getElementById(`train-${a.id}`).onclick = (event) => {
      event.stopPropagation();
      onTrain(a.id);
    };
    document.getElementById(`feed-${a.id}`).onclick = (event) => {
      event.stopPropagation();
      onFeed(a.id);
    };
    const dracarysBtn = document.getElementById(`dracarys-${a.id}`);
    if (dracarysBtn) {
      dracarysBtn.onclick = (event) => {
        event.stopPropagation();
        onDracarys(a.id);
      };
    }
  });
  overlay.querySelectorAll('.roster-card').forEach((card) => {
    const choose = () => onSelect(card.dataset.animalId);
    card.onclick = (event) => {
      if (!event.target.closest('button')) choose();
    };
    card.onkeydown = (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
        event.preventDefault();
        choose();
      }
    };
  });
  overlay.querySelectorAll('.camera-mode').forEach((button) => {
    button.onclick = () => onCameraMode(button.dataset.cameraMode);
  });
  overlay.querySelectorAll('[data-camera-rig]').forEach((button) => {
    button.onclick = () => onCameraRig(button.dataset.cameraRig);
  });
  overlay.querySelectorAll('.recruit-btn').forEach((btn) => {
    btn.onclick = () => onRecruit(btn.dataset.species);
  });
  applyCameraTransitionLock(overlay, cameraTransitioning);
}

// One roster entry as a self-contained card: avatar, xp/bond bars, and its
// own Train/Feed actions (scoped to this animal's id).
function renderCard(a, selected) {
  const species = SPECIES[a.species];
  const xpPct = Math.min(100, Math.round((a.xp / 100) * 100));
  const bondPct = Math.min(100, a.bond);
  return `
    <li class="roster-card${selected ? ' is-selected' : ''}" data-animal-id="${a.id}"
      role="button" tabindex="0" aria-pressed="${selected}"
      aria-label="Select ${a.name} for sanctuary free roam">
      <div class="avatar">${species.emoji}</div>
      <div class="info">
        <div class="top-row">
          <span class="name">${a.name}</span>
          <span class="lvl">Lv ${a.level}</span>
        </div>
        <div class="xp-bar"><div class="xp-fill" style="width:${xpPct}%"></div></div>
        <div class="stats-row">
          <span class="species-tag">${species.name}</span>
          <span>${a.xp}/100 xp</span>
          <span>${a.hp} hp</span>
        </div>
        <div class="bond-bar"><div class="bond-fill" style="width:${bondPct}%"></div></div>
        <div class="card-actions">
          <button id="train-${a.id}" class="icon-btn" title="Train ${a.name} (+XP)">💪</button>
          <button id="feed-${a.id}" class="icon-btn" title="Feed ${a.name} (+Bond)">🍖</button>
          ${a.species === 'wyvern' ? `<button id="dracarys-${a.id}" class="icon-btn" title="Dracarys ${a.name} (Breathe Fire!)">🔥</button>` : ''}
        </div>
      </div>
    </li>`;
}
