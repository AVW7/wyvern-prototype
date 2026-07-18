// Phaser is still exposed globally because the prototype's existing modules
// were written for the CDN build. Loading it here preserves that API while
// Vite/npm make the dependency reproducible. A later engine migration can
// convert modules to direct imports independently of the dragon pipeline.
import Phaser from 'phaser';

globalThis.Phaser = Phaser;
await import('./main.js');
