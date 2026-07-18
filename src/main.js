// Game boot: builds the Phaser config and registers every scene.
import { GAME } from './config.js';
import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import BaseScene from './scenes/BaseScene.js';
import VaultScene from './scenes/VaultScene.js';
import AtlasScene from './scenes/AtlasScene.js';
import MissionScene from './scenes/MissionScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME.width,
  height: GAME.height,
  backgroundColor: GAME.backgroundColor,
  pixelArt: true,     // crisp pixels, no smoothing — matches sprite art
  roundPixels: true,  // avoid sub-pixel jitter when sprites move
  // Painted wyvern atlases decode to roughly 60–70 MiB each. Loading them in
  // parallel causes intermittent browser image/decode failures, most visibly
  // dropping Cinderlash from the outside sanctuary. Serial loading keeps peak
  // decode pressure bounded without changing any public asset keys.
  loader: {
    maxParallelDownloads: 1,
  },
  scale: {
    mode: Phaser.Scale.FIT,          // letterbox into whatever window we get
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
  // Scene order: first entry boots first. Flow is Boot -> Preload -> Base,
  // then Base <-> Vault (the sanctuary interior), and Base/Vault -> Atlas
  // (the world map / mission select) -> Mission -> Base.
  scene: [BootScene, PreloadScene, BaseScene, VaultScene, AtlasScene, MissionScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
