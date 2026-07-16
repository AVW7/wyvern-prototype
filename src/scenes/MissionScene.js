// MissionScene: the isometric action layer. Renders the iso background grid,
// spawns the sprite wyvern, and depth-sorts everything each frame so sprites
// correctly overlap tiles in front of / behind them.
import { DEMO_MAP, ISO } from '../config.js';
import { gridToScreen, sortByDepth } from '../systems/iso.js';
import Wyvern from '../entities/Wyvern.js';

export default class MissionScene extends Phaser.Scene {
  constructor() {
    super('Mission');
  }

  init(data) {
    this.missionId = data.missionId || 'mission01';
  }

  create() {
    // Group holding every depth-sortable object (tiles + entities).
    this.isoLayer = this.add.layer();

    this.buildIsoBackground();
    this.spawnWyvern();
    this.buildHud();

    // Depth-sort once at start; entities also re-sort as they move (see update).
    sortByDepth(this.isoLayer);
  }

  // Paint the iso grid from DEMO_MAP. Ground tiles anchor at their diamond top;
  // blocked tiles are taller and anchored at the bottom so they "stand up".
  buildIsoBackground() {
    for (let row = 0; row < DEMO_MAP.length; row++) {
      for (let col = 0; col < DEMO_MAP[row].length; col++) {
        const { x, y } = gridToScreen(col, row);
        const blocked = DEMO_MAP[row][col] === 1;
        const key = blocked ? 'iso-block' : 'iso-ground';
        const tile = this.add.image(x, y, key);
        tile.setOrigin(0.5, blocked ? 1 : 0);
        // Depth key: screen-y plus grid sum keeps painting order stable.
        tile.setData('depth', y + (blocked ? 0 : ISO.tileHeight / 2));
        this.isoLayer.add(tile);
      }
    }
  }

  spawnWyvern() {
    // Drop the wyvern on a walkable start cell.
    const start = gridToScreen(3, 3);
    this.wyvern = new Wyvern(this, start.x, start.y);
    this.isoLayer.add(this.wyvern);
  }

  buildHud() {
    const overlay = document.getElementById('ui-overlay');
    overlay.innerHTML = `
      <div class="hud">
        <span>Mission: ${this.missionId}</span>
        <button id="btn-return">Return to Base</button>
      </div>
      <div class="controls-hint">Arrows/WASD move &middot; Space attack</div>`;
    document.getElementById('btn-return').onclick = () => {
      overlay.innerHTML = '';
      this.scene.start('Base');
    };
  }

  update(time, delta) {
    if (this.wyvern) this.wyvern.update(delta);
    // Keep overlap correct as the wyvern moves through the grid.
    sortByDepth(this.isoLayer);
  }
}
