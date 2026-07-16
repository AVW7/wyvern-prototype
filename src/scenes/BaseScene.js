// BaseScene: the between-missions management sim (roster, base-building).
// UI-heavy screens like this are easiest as an HTML/CSS overlay on top of the
// canvas rather than hand-drawn Phaser objects. This scene shows/hides that
// overlay and hands off to a mission when the player launches one.
import { getRoster } from '../systems/roster.js';

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
    const rows = roster
      .map((w) => `<li><span>${w.name}</span><span class="lvl">Lv ${w.level}</span></li>`)
      .join('');

    overlay.innerHTML = `
      <div class="panel base-panel">
        <h1>Roost</h1>
        <p class="subtitle">Base &amp; roster management</p>
        <h2>Wyverns</h2>
        <ul class="roster">${rows}</ul>
        <div class="base-actions">
          <button id="btn-launch">Launch Mission</button>
          <button class="ghost" disabled>Train (todo)</button>
          <button class="ghost" disabled>Build (todo)</button>
        </div>
      </div>`;

    document.getElementById('btn-launch').onclick = () => this.launchMission();
  }

  launchMission() {
    // Clear the overlay so the mission canvas is unobstructed, then switch scene.
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Mission', { missionId: 'mission01' });
  }
}
