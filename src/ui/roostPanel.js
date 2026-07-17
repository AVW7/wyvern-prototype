// The Roost management panel, shared by the two sanctuary scenes (BaseScene
// grounds / VaultScene interior). Pure HTML-overlay code — it renders into
// #ui-overlay and wires the caller's handlers; it knows nothing about Phaser.
// The scenes stay separate; only this UI widget is common between them.
import { getRoster } from '../systems/roster.js';
import { SPECIES } from '../data/species.js';

/**
 * Renders the roster panel + travel button into the overlay.
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
 */
export function buildRoostOverlay({
  subtitle, travelLabel, collapsed, launchLabel = '<span class="btn-icon">🗺️</span>World Atlas',
  onTravel, onLaunch, onTrain, onFeed, onRecruit, onCollapse, onExpand,
}) {
  const overlay = document.getElementById('ui-overlay');
  const travelButton = `<button id="btn-travel" class="btn-view">${travelLabel}</button>`;

  if (collapsed) {
    overlay.innerHTML = `
      <button id="btn-expand" class="panel-pill">🐉 Roost</button>
      ${travelButton}`;
    document.getElementById('btn-expand').onclick = onExpand;
    document.getElementById('btn-travel').onclick = onTravel;
    return;
  }

  const roster = getRoster();
  const rows = roster.map(renderCard).join('');
  const recruitButtons = Object.values(SPECIES)
    .map((s) => `<button class="recruit-btn" data-species="${s.id}"><span class="btn-icon">${s.emoji}</span>${s.name}</button>`)
    .join('');

  overlay.innerHTML = `
    <div class="panel base-panel">
      <div class="panel-header">
        <button id="btn-collapse" class="panel-hide" title="Hide panel">✕</button>
        <h1>Roost</h1>
        <p class="subtitle">${subtitle}</p>
      </div>
      <h2>Companions <span class="roster-count">${roster.length}</span></h2>
      <ul class="roster">${rows}</ul>
      <div class="base-actions">
        <button id="btn-launch" class="btn-primary">${launchLabel}</button>
        <h2 class="recruit-label">Recruit</h2>
        <div class="recruit-row">${recruitButtons}</div>
      </div>
    </div>
    ${travelButton}`;

  document.getElementById('btn-collapse').onclick = onCollapse;
  document.getElementById('btn-launch').onclick = onLaunch;
  document.getElementById('btn-travel').onclick = onTravel;
  roster.forEach((a) => {
    document.getElementById(`train-${a.id}`).onclick = () => onTrain(a.id);
    document.getElementById(`feed-${a.id}`).onclick = () => onFeed(a.id);
  });
  overlay.querySelectorAll('.recruit-btn').forEach((btn) => {
    btn.onclick = () => onRecruit(btn.dataset.species);
  });
}

// One roster entry as a self-contained card: avatar, xp/bond bars, and its
// own Train/Feed actions (scoped to this animal's id).
function renderCard(a) {
  const species = SPECIES[a.species];
  const xpPct = Math.min(100, Math.round((a.xp / 100) * 100));
  const bondPct = Math.min(100, a.bond);
  return `
    <li class="roster-card">
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
          <button id="train-${a.id}" class="icon-btn" title="Train">💪</button>
          <button id="feed-${a.id}" class="icon-btn" title="Feed">🍖</button>
        </div>
      </div>
    </li>`;
}
