// PreloadScene: loads all assets, then generates placeholder textures so the
// prototype runs with ZERO art files. Replace the generated textures with real
// loads (this.load.atlas / this.load.spritesheet / this.load.image) as art lands.
import {
  WYVERN_STATES, WYVERN_ART, ENEMY_STATES, EMOJI,
} from '../config.js';
import { SPECIES } from '../data/species.js';
import {
  DEMO_WYVERNS, wyvernAnimationKey,
} from '../data/wyverns.js';

const LOOPING_STATES = new Set(['idle', 'fly', 'guard']);

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    // Simple loading bar so real asset loads later have visible feedback.
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 0, 8, 0x8a5cf6);
    this.load.on('progress', (p) => { bar.width = 240 * p; });
  }

  create() {
    this.createPlaceholderWyverns();
    this.createPlaceholderEnemy();
    this.createSpeciesTextures();
    this.validateWyvernAssets();
    this.createWyvernAnimations();
    this.createEnemyAnimations();

    // Boot into the base/management sim first, mirroring the game loop:
    // manage roster -> launch mission -> return to base.
    this.scene.start('Base');
  }

  validateWyvernAssets() {
    DEMO_WYVERNS.forEach((wyvern) => {
      const report = {
        profileName: wyvern.name,
        mode: 'placeholder',
        valid: true,
        errors: [],
        warnings: [],
      };
      this.registry.set(`wyvernAsset:${wyvern.id}`, report);
    });
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

  // One distinct placeholder per demo profile. If a real atlas was loaded in
  // preload(), its key already exists and the generated fallback is skipped.
  createPlaceholderWyverns() {
    DEMO_WYVERNS.forEach((wyvern) => {
      if (this.textures.exists(wyvern.assetKey)) {
        const existing = this.textures.get(wyvern.assetKey);
        if (!wyvern.atlas || existing?.has(wyvern.atlas.initialFrame)) return;
        this.textures.remove(wyvern.assetKey);
      }
      const width = 58;
      const height = 54;
      const tex = this.textures.createCanvas(wyvern.assetKey, width, height);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = wyvern.accent;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2 + 2, 23, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#f5e7c8';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = '38px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(EMOJI.wyvern, width / 2, height / 2);
      tex.refresh();
    });
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

  // Registers a complete animation namespace per profile.
  createWyvernAnimations() {
    DEMO_WYVERNS.forEach((wyvern) => {
      Object.values(WYVERN_STATES).forEach((state) => {
        const animationKey = wyvernAnimationKey(wyvern, state);
        const baselineFrames = [undefined];

        if (!this.anims.exists(animationKey)) {
          this.createWyvernAnimation(animationKey, wyvern.assetKey, state, baselineFrames);
        }

        // Directional keys always exist.
        const directions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
        directions.forEach((direction) => {
          const directionalKey = wyvernAnimationKey(wyvern, state, direction);
          if (this.anims.exists(directionalKey)) return;
          this.createWyvernAnimation(
            directionalKey,
            wyvern.assetKey,
            state,
            baselineFrames,
          );
        });
      });
    });
  }

  createWyvernAnimation(key, textureKey, state, frameNames) {
    this.anims.create({
      key,
      frames: frameNames.map((frame) => ({ key: textureKey, frame })),
      frameRate: WYVERN_ART.frameRates[state] ?? 10,
      repeat: LOOPING_STATES.has(state) ? -1 : 0,
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
