// VaultScene: inside the sanctuary — the hand-authored Emberkeep Dragonvault
// (data/sanctuary.js): U-walled keep, raised gallery, ember heart, treasure
// and nests, with the roster resting here as residents. Reached through the
// gate on the BaseScene island; the glow over the entry bridge (or the
// overlay button) leads back outside. Its own scene, separate from both
// BaseScene and MissionScene.
import { SANCTUARY } from '../config.js';
import { sortByDepth } from '../systems/iso.js';
import {
  buildSanctuaryView, spawnSanctuaryResidents, animateSanctuaryProps,
} from '../systems/sanctuaryRender.js';
import { buildSanctuaryInterior } from '../data/sanctuary.js';
import { buildRoostOverlay } from '../ui/roostPanel.js';
import { gainXp, raiseBond, recruitAnimal } from '../systems/roster.js';

export default class VaultScene extends Phaser.Scene {
  constructor() {
    super('Vault');
  }

  create() {
    this.world = null;
    this.panelCollapsed = false;

    this.buildWorld();
    this.buildOverlay();
  }

  // (Re)builds the vault: backdrop, tiles, props, residents, exit. Called on
  // scene start and on recruit (so the newcomer appears inside too).
  buildWorld() {
    this.tweens.killAll();
    if (this.world) {
      this.world.layer.removeAll(true);
      this.world.layer.destroy();
      this.world.backdrop.destroy();
    }

    const { tiles } = buildSanctuaryInterior();
    this.world = buildSanctuaryView(this, SANCTUARY.VIEWS.INSIDE, tiles);
    spawnSanctuaryResidents(this, this.world.layer, SANCTUARY.VIEWS.INSIDE, this.world.zoom);
    sortByDepth(this.world.layer);
    animateSanctuaryProps(this, this.world.placed);
    this.wireExit();
  }

  // The daylight glow over the entry bridge is the way back outside (it
  // already pulses via animateSanctuaryProps, which marks it interactive-ish).
  wireExit() {
    const exit = this.world.placed.decor.find((d) => d.type === 'glow');
    if (!exit) return;
    exit.sprite.setInteractive({ useHandCursor: true });
    exit.sprite.on('pointerdown', () => this.stepOutside());
  }

  buildOverlay() {
    buildRoostOverlay({
      subtitle: 'Emberkeep vault &middot; roster management',
      travelLabel: '🌿 Step Outside',
      collapsed: this.panelCollapsed,
      onTravel: () => this.stepOutside(),
      onLaunch: () => this.openAtlas(),
      onTrain: (id) => { gainXp(id, 25); this.buildOverlay(); },
      onFeed: (id) => { raiseBond(id, 15); this.buildOverlay(); },
      onRecruit: (speciesId) => {
        recruitAnimal(speciesId);
        this.buildWorld();
        this.buildOverlay();
      },
      onCollapse: () => { this.panelCollapsed = true; this.buildOverlay(); },
      onExpand: () => { this.panelCollapsed = false; this.buildOverlay(); },
    });
  }

  stepOutside() {
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Base');
  }

  // Missions are chosen on the world map now — see BaseScene.openAtlas().
  openAtlas() {
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Atlas');
  }
}
