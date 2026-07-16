// PreloadScene: loads all assets, then generates placeholder textures so the
// prototype runs with ZERO art files. Replace the generated textures with real
// loads (this.load.atlas / this.load.spritesheet / this.load.image) as art lands.
import { ISO, WYVERN_STATES } from '../config.js';

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
    // this.load.image('iso-ground', 'assets/tilemaps/ground.png');
    // this.load.image('iso-block',  'assets/tilemaps/block.png');
    // this.load.atlas('wyvern', 'assets/sprites/wyverns/wyvern.png',
    //                           'assets/sprites/wyverns/wyvern.json');
    // this.load.tilemapTiledJSON('mission01', 'assets/tilemaps/mission01.json');
  }

  create() {
    this.createPlaceholderTiles();
    this.createPlaceholderWyvern();
    this.createWyvernAnimations();

    // Boot into the base/management sim first, mirroring the game loop:
    // manage roster -> launch mission -> return to base.
    this.scene.start('Base');
  }

  // A diamond-shaped ground tile and a taller "blocked" tile, drawn with
  // Graphics and baked to textures. Lets the iso grid render before real art.
  createPlaceholderTiles() {
    const w = ISO.tileWidth;
    const h = ISO.tileHeight;

    const ground = this.add.graphics();
    ground.fillStyle(0x2f6f4f, 1);
    ground.lineStyle(1, 0x1d4a34, 1);
    ground.beginPath();
    ground.moveTo(w / 2, 0);
    ground.lineTo(w, h / 2);
    ground.lineTo(w / 2, h);
    ground.lineTo(0, h / 2);
    ground.closePath();
    ground.fillPath();
    ground.strokePath();
    ground.generateTexture('iso-ground', w, h);
    ground.destroy();

    // Blocked tile: same diamond top with a raised block body.
    const bh = h + 24;
    const block = this.add.graphics();
    block.fillStyle(0x5a4636, 1); // side
    block.fillRect(0, h / 2, w, 24);
    block.fillStyle(0x7a6048, 1); // top diamond
    block.beginPath();
    block.moveTo(w / 2, 0);
    block.lineTo(w, h / 2);
    block.lineTo(w / 2, h);
    block.lineTo(0, h / 2);
    block.closePath();
    block.fillPath();
    block.generateTexture('iso-block', w, bh);
    block.destroy();
  }

  // Placeholder wyvern: a colored body so the sprite + state machine work
  // before real frames exist. Swap for a loaded atlas later.
  createPlaceholderWyvern() {
    const g = this.add.graphics();
    g.fillStyle(0xc0392b, 1);
    g.fillTriangle(24, 4, 44, 40, 4, 40); // body
    g.fillStyle(0xe74c3c, 1);
    g.fillTriangle(24, 14, 34, 30, 14, 30); // belly highlight
    g.generateTexture('wyvern-placeholder', 48, 44);
    g.destroy();
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
}
