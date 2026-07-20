// VaultScene: a focused 3D chamber. The authored sanctuary interior is the backdrop
// rendered in Three.js. This scene owns only the 3D diorama and the exit.
import { SANCTUARY } from '../config.js';
import { sortByDepth } from '../systems/iso.js';
import {
  buildSanctuaryView, animateSanctuaryProps,
} from '../systems/sanctuaryRender.js';
import { buildSanctuaryInterior } from '../data/sanctuary.js';
import { buildVaultOverlay } from '../ui/vaultPanel.js';
import { createSanctuary3D } from '../systems/sanctuary3D.js';

export default class VaultScene extends Phaser.Scene {
  constructor() {
    super('Vault');
  }

  create() {
    this.world = null;
    this.sanctuary3D = null;

    this.buildWorld();
    this.buildOverlay();

    // Wire exit click via unprojectClick
    this.input.on('pointerdown', (pointer) => {
      if (this.sanctuary3D) {
        const cell = this.sanctuary3D.unprojectClick(pointer.x, pointer.y);
        if (cell) {
          const exit = this.world.placed.decor.find((decor) => decor.type === 'glow');
          if (exit && cell.col === exit.col && cell.row === exit.row) {
            this.stepOutside();
          }
        }
      }
    });

    this.events.once('shutdown', () => this.cleanUp());
  }

  update(time, delta) {
    if (this.sanctuary3D) {
      this.sanctuary3D.update(delta);
    }
  }

  buildWorld() {
    const { tiles } = buildSanctuaryInterior();
    this.world = buildSanctuaryView(this, SANCTUARY.VIEWS.INSIDE, tiles);
    sortByDepth(this.world.layer);
    animateSanctuaryProps(this, this.world.placed);

    // Hide Phaser tiles/decor so only Three.js is visible
    this.world.placed.tiles.forEach((t) => t.sprite?.setAlpha(0));
    this.world.placed.decor.forEach((d) => d.sprite?.setAlpha(0));

    // Instantiate 3D diorama (empty of residents)
    this.sanctuary3D = createSanctuary3D({
      scene: this,
      tiles,
      interactions: [],
      residents: [],
      selectedWyvernId: null,
    });

    if (this.sanctuary3D) {
      this.sanctuary3D.show();
    }
  }

  buildOverlay() {
    buildVaultOverlay({
      onTravel: () => this.stepOutside(),
      onAtlas: () => { this.cleanUp(); this.scene.start('Atlas'); },
    });
  }

  cleanUp() {
    if (this.sanctuary3D) {
      this.sanctuary3D.destroy();
      this.sanctuary3D = null;
    }
    const overlay = document.getElementById('ui-overlay');
    if (overlay) overlay.innerHTML = '';
  }

  stepOutside() {
    this.cleanUp();
    this.scene.start('Base');
  }
}
