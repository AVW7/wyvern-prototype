// PreloadScene: loads all assets, then generates placeholder textures so the
// prototype runs with ZERO art files. Replace the generated textures with real
// loads (this.load.atlas / this.load.spritesheet / this.load.image) as art lands.
import {
  WYVERN_STATES, WYVERN_ART, ENEMY_STATES, EMOJI,
} from '../config.js';
import { SPECIES } from '../data/species.js';
import {
  DEMO_WYVERNS, wyvernAnimationKey, wyvernAtlasDataKey,
} from '../data/wyverns.js';

const LOOPING_WYVERN_STATES = new Set([
  WYVERN_STATES.IDLE,
  WYVERN_STATES.FLY,
  WYVERN_STATES.GUARD,
]);

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload() {
    // Simple loading bar so real asset loads later have visible feedback.
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 0, 8, 0x8a5cf6);
    this.load.on('progress', (p) => { bar.width = 240 * p; });

    // Each profile may provide its own Phaser atlas. Profiles without one keep
    // using the generated placeholder made in createPlaceholderWyverns().
    DEMO_WYVERNS.forEach((wyvern) => {
      if (wyvern.atlas) {
        this.load.atlas(wyvern.assetKey, wyvern.atlas.image, wyvern.atlas.data);
        // The atlas loader consumes the JSON to build frames. Cache a small
        // second copy so animation lists come directly from meta.animations
        // instead of being duplicated in source code.
        this.load.json(wyvernAtlasDataKey(wyvern), wyvern.atlas.data);
      }
    });

    // ---- OTHER REAL ASSET LOADS GO HERE ----
    // Terrain tiles are procedural (see systems/textureBake.js, baked lazily by
    // MissionScene) and need no files. To move to hand-authored tile art, load
    // images here under the same keys tileTextureKey() produces.
    // this.load.tilemapTiledJSON('mission01', 'assets/tilemaps/mission01.json');
  }

  create() {
    this.createPlaceholderWyverns();
    this.createPlaceholderEnemy();
    this.createSpeciesTextures();
    this.configureWyvernTextureFilters();
    this.createWyvernAnimations();
    this.createEnemyAnimations();

    // Boot into the base/management sim first, mirroring the game loop:
    // manage roster -> launch mission -> return to base.
    this.scene.start('Base');
  }

  // Terrain stays nearest-neighbor through the global pixelArt setting. The
  // high-resolution painted dragon atlases opt into linear downscaling so
  // their silhouettes and internal detail do not shimmer at small sizes.
  configureWyvernTextureFilters() {
    DEMO_WYVERNS.forEach((wyvern) => {
      if (!wyvern.atlas) return;
      const texture = this.textures.get(wyvern.assetKey);
      if (texture?.has(wyvern.atlas.initialFrame)) {
        texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
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
      if (this.textures.exists(wyvern.assetKey)) return;
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

  // Registers a complete animation namespace per profile. When a real atlas is
  // loaded, replace the one-frame `frames` config with that atlas's exported
  // tag frames; the scene/entity animation keys do not need to change.
  createWyvernAnimations() {
    DEMO_WYVERNS.forEach((wyvern) => {
      Object.values(WYVERN_STATES).forEach((state) => {
        const animationKey = wyvernAnimationKey(wyvern, state);
        if (this.anims.exists(animationKey)) return;
        const texture = this.textures.get(wyvern.assetKey);
        const atlasData = wyvern.atlas
          ? this.cache.json.get(wyvernAtlasDataKey(wyvern))
          : null;
        const configuredFrames = atlasData?.meta?.animations?.[state] || [];
        const realFrames = configuredFrames.filter((frame) => texture?.has(frame));
        const fallbackFrame = texture?.has(wyvern.atlas?.initialFrame)
          ? wyvern.atlas.initialFrame
          : undefined;
        this.anims.create({
          key: animationKey,
          frames: realFrames.length
            ? realFrames.map((frame) => ({ key: wyvern.assetKey, frame }))
            : [{ key: wyvern.assetKey, frame: fallbackFrame }],
          frameRate: WYVERN_ART.frameRates[state] ?? 10,
          repeat: LOOPING_WYVERN_STATES.has(state) ? -1 : 0,
        });
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
