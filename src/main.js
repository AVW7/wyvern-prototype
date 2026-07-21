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

const game = new Phaser.Game(config);
window.game = game;

game.events.once('ready', () => {
  const updateStageRect = () => {
    const canvas = game.canvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    document.documentElement.style.setProperty('--stage-left', `${rect.left}px`);
    document.documentElement.style.setProperty('--stage-top', `${rect.top}px`);
    document.documentElement.style.setProperty('--stage-width', `${rect.width}px`);
    document.documentElement.style.setProperty('--stage-height', `${rect.height}px`);
  };

  // Listen to Phaser resize events
  game.scale.on('resize', updateStageRect);
  // Also listen to browser window resize events
  window.addEventListener('resize', updateStageRect);

  // Monitor DOM-level canvas size changes via ResizeObserver
  const canvas = game.canvas;
  if (canvas) {
    const resizeObserver = new ResizeObserver(updateStageRect);
    resizeObserver.observe(canvas);
  }

  // Call initially to set values
  setTimeout(updateStageRect, 0);
  
  // Prevent keyboard propagation for active inputs/buttons in #ui-overlay
  const uiOverlay = document.getElementById('ui-overlay');
  if (uiOverlay) {
    const stopKeyboardProp = (e) => {
      // If document focus is on any interactive element in the overlay, block propagation.
      if (document.activeElement && document.activeElement !== document.body) {
        e.stopPropagation();
      }
    };
    uiOverlay.addEventListener('keydown', stopKeyboardProp, true);
    uiOverlay.addEventListener('keyup', stopKeyboardProp, true);
  }
});
