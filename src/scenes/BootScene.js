// BootScene: minimal setup that runs once before assets load.
// Good place for global settings, scaling config, or a loading-bar texture.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    // Nothing to load yet — hand straight off to the preloader.
    this.scene.start('Preload');
  }
}
