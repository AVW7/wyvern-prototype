// BaseScene: the sanctuary grounds — the hand-authored Mossy Monolith island
// (data/sanctuary.js) with the roster living on it as residents, plus the
// HTML Roost panel overlay. The vault interior is its own scene (VaultScene),
// entered through the barred gate at the massif's base; missions are a third,
// fully separate layer. This scene shares no scene code with either.
import { SANCTUARY } from '../config.js';
import { sortByDepth } from '../systems/iso.js';
import {
  buildSanctuaryView, spawnSanctuaryResidents, animateSanctuaryProps,
} from '../systems/sanctuaryRender.js';
import { buildSanctuaryExterior } from '../data/sanctuary.js';
import { buildRoostOverlay } from '../ui/roostPanel.js';
import { gainXp, raiseBond, recruitAnimal } from '../systems/roster.js';

export default class BaseScene extends Phaser.Scene {
  constructor() {
    super('Base');
  }

  create() {
    // Fresh refs each visit — the scene restarts when a mission or the vault
    // returns here, and the old display objects were destroyed with it.
    this.world = null;
    this.panelCollapsed = false;

    this.buildWorld();
    this.buildOverlay();
  }

  // (Re)builds the island: backdrop, tiles, props, residents, entrance.
  // Called on scene start and on recruit (so the newcomer appears). Baked
  // textures are cached across rebuilds, so this is cheap.
  buildWorld() {
    this.tweens.killAll();
    if (this.world) {
      this.world.layer.removeAll(true);
      this.world.layer.destroy();
      this.world.backdrop.destroy();
    }

    const { tiles } = buildSanctuaryExterior();
    this.world = buildSanctuaryView(this, SANCTUARY.VIEWS.OUTSIDE, tiles);
    spawnSanctuaryResidents(this, this.world.layer, SANCTUARY.VIEWS.OUTSIDE, this.world.zoom);
    sortByDepth(this.world.layer);
    animateSanctuaryProps(this, this.world.placed);
    this.wireEntrance();
  }

  // The barred gate at the massif's base is the way into the vault. A soft
  // breathing pulse marks it as interactive.
  wireEntrance() {
    const entrance = this.world.placed.decor.find((d) => d.type === 'barredDoor');
    if (!entrance) return;
    entrance.sprite.setInteractive({ useHandCursor: true });
    entrance.sprite.on('pointerdown', () => this.enterVault());
    this.tweens.add({
      targets: entrance.sprite,
      alpha: 0.8,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  buildOverlay() {
    buildRoostOverlay({
      subtitle: 'Sanctuary grounds &middot; roster management',
      travelLabel: 'Enter the Vault',
      collapsed: this.panelCollapsed,
      onTravel: () => this.enterVault(),
      onLaunch: () => this.openAtlas(),
      onTrain: (id) => { gainXp(id, 25); this.buildOverlay(); },
      onFeed: (id) => { raiseBond(id, 15); this.buildOverlay(); },
      // A recruit walks into the sanctuary immediately, so rebuild the world
      // as well as the panel.
      onRecruit: (speciesId) => {
        recruitAnimal(speciesId);
        this.buildWorld();
        this.buildOverlay();
      },
      onCollapse: () => { this.panelCollapsed = true; this.buildOverlay(); },
      onExpand: () => { this.panelCollapsed = false; this.buildOverlay(); },
    });
  }

  enterVault() {
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Vault');
  }

  // Missions are chosen on the world map now, not launched straight from here:
  // the atlas picks the destination and passes its seed through to Mission.
  openAtlas() {
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Atlas');
  }
}
