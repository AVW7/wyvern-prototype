// PreloadScene: loads all assets, then generates placeholder textures so the
// prototype runs with ZERO art files. Replace the generated textures with real
// loads (this.load.atlas / this.load.spritesheet / this.load.image) as art lands.
import { WYVERN_STATES, ENEMY_STATES, EMOJI } from '../config.js';
import { SPECIES } from '../data/species.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    // Simple loading bar so real asset loads later have visible feedback.
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 0, 8, 0x8a5cf6);
    this.load.on('progress', (p) => { bar.width = 240 * p; });

    // ---- REAL ASSET LOADS GO HERE (examples, commented until art exists) ----
    // Terrain tiles are procedural (see systems/textureBake.js, baked lazily by
    // MissionScene) and need no files. To move to hand-authored tile art, load
    // images here under the same keys tileTextureKey() produces.
    // this.load.atlas('wyvern', 'assets/sprites/wyverns/wyvern.png',
    //                           'assets/sprites/wyverns/wyvern.json');
    // this.load.tilemapTiledJSON('mission01', 'assets/tilemaps/mission01.json');
  }

  create() {
    this.createPlaceholderWyvern();
    this.createPlaceholderEnemy();
    this.createSpeciesTextures();
    this.createWyvernAnimations();
    this.createEnemyAnimations();

    // Boot into the base/management sim first, mirroring the game loop:
    // manage roster -> launch mission -> return to base.
    this.scene.start('Base');
  }

  // Bakes an emoji glyph onto a canvas texture. Placeholder for real sprite
  // art — swap the call sites for this.load.atlas/this.load.image once art
  // atlases exist, no other code needs to change.
  createEmojiTexture(key, emoji, width, height, fontSize) {
    const tex = this.textures.createCanvas(key, width, height);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, width / 2, height / 2);
    tex.refresh();
  }

  // Placeholder wyvern: an emoji glyph so the sprite + state machine work
  // before real frames exist. Swap for a loaded atlas later.
  createPlaceholderWyvern() {
    this.createEmojiTexture('wyvern-placeholder', EMOJI.wyvern, 48, 44, 40);
  }

  // Placeholder enemy: same emoji-texture approach as the wyvern.
  createPlaceholderEnemy() {
    this.createEmojiTexture('enemy-placeholder', EMOJI.enemy, 48, 44, 40);
  }

  // One texture per sanctuary species (`species-<id>`), so any recruited
  // animal can appear as a resident in the BaseScene sanctuary views. Same
  // emoji placeholders as above — swap for real art per species later.
  createSpeciesTextures() {
    Object.values(SPECIES).forEach((species) => {
      this.createEmojiTexture(`species-${species.id}`, species.emoji, 48, 44, 40);
    });
  }

  // Registers animations by state name. When you load a real atlas, replace the
  // single-frame configs with generateFrameNames() ranges from your sheet.
  createWyvernAnimations() {
    const key = 'wyvern-placeholder';
    Object.values(WYVERN_STATES).forEach((state) => {
      if (this.anims.exists(`wyvern-${state}`)) return;
      this.anims.create({
        key: `wyvern-${state}`,
        frames: [{ key }], // TODO: replace with real frame ranges per state
        frameRate: 8,
        repeat: state === WYVERN_STATES.DEATH ? 0 : -1,
      });
    });
  }

  // Same pattern as createWyvernAnimations, for the enemy state set.
  createEnemyAnimations() {
    const key = 'enemy-placeholder';
    Object.values(ENEMY_STATES).forEach((state) => {
      if (this.anims.exists(`enemy-${state}`)) return;
      this.anims.create({
        key: `enemy-${state}`,
        frames: [{ key }],
        frameRate: 8,
        repeat: state === ENEMY_STATES.DEATH ? 0 : -1,
      });
    });
  }
}
