// Game boot: builds the Phaser config and registers every scene.
import { GAME } from './config.js';
import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import BaseScene from './scenes/BaseScene.js';
import MissionScene from './scenes/MissionScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME.width,
  height: GAME.height,
  backgroundColor: GAME.backgroundColor,
  pixelArt: true,     // crisp pixels, no smoothing — matches sprite art
  roundPixels: true,  // avoid sub-pixel jitter when sprites move
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  // Scene order: first entry boots first. Flow is Boot -> Preload -> Base -> Mission.
  scene: [BootScene, PreloadScene, BaseScene, MissionScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
