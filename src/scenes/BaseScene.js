// BaseScene: the between-missions management sim (roster, base-building).
// UI-heavy screens like this are easiest as an HTML/CSS overlay on top of the
// canvas rather than hand-drawn Phaser objects. This scene shows/hides that
// overlay and hands off to a mission when the player launches one.
import {
  getRoster, gainXp, raiseBond, recruitAnimal,
} from '../systems/roster.js';
import { SPECIES } from '../data/species.js';

export default class BaseScene extends Phaser.Scene {
  constructor() {
    super('Base');
  }

  create() {
    this.buildOverlay();
  }

  buildOverlay() {
    const overlay = document.getElementById('ui-overlay');
    const roster = getRoster();
    const rows = roster.map((a) => this.renderCard(a)).join('');
    const recruitButtons = Object.values(SPECIES)
      .map((s) => `<button class="recruit-btn" data-species="${s.id}"><span class="btn-icon">${s.emoji}</span>${s.name}</button>`)
      .join('');

    overlay.innerHTML = `
      <div class="panel base-panel">
        <div class="panel-header">
          <h1>Roost</h1>
          <p class="subtitle">Sanctuary &amp; roster management</p>
        </div>
        <h2>Companions <span class="roster-count">${roster.length}</span></h2>
        <ul class="roster">${rows}</ul>
        <div class="base-actions">
          <button id="btn-launch" class="btn-primary"><span class="btn-icon">⚔️</span>Launch Mission</button>
          <h2 class="recruit-label">Recruit</h2>
          <div class="recruit-row">${recruitButtons}</div>
        </div>
      </div>`;

    document.getElementById('btn-launch').onclick = () => this.launchMission();
    roster.forEach((a) => {
      document.getElementById(`train-${a.id}`).onclick = () => this.train(a.id);
      document.getElementById(`feed-${a.id}`).onclick = () => this.feed(a.id);
    });
    document.querySelectorAll('.recruit-btn').forEach((btn) => {
      btn.onclick = () => this.build(btn.dataset.species);
    });
  }

  // Renders one roster entry as a self-contained card: avatar, xp/bond bars,
  // and its own Train/Feed actions (scoped to this animal's id).
  renderCard(a) {
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

  // Grants the given animal xp, leveling it up at the usual threshold.
  train(id) {
    gainXp(id, 25);
    this.buildOverlay();
  }

  // Raises the given animal's bond stat.
  feed(id) {
    raiseBond(id, 15);
    this.buildOverlay();
  }

  // Recruits a fresh animal of the given species into the roost.
  build(speciesId) {
    recruitAnimal(speciesId);
    this.buildOverlay();
  }

  launchMission() {
    // Clear the overlay so the mission canvas is unobstructed, then switch scene.
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Mission', { missionId: 'mission01' });
  }
}
