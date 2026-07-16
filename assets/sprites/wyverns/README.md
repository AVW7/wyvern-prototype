# Wyvern sprites

Drop your wyvern art here. Recommended pipeline:

1. Author frames in **Aseprite**, one tag per action: idle, fly, attack, hurt, death.
2. Export a sprite sheet + JSON: File > Export Sprite Sheet, check "JSON Data" (Array),
   output `wyvern.png` + `wyvern.json` into this folder.
3. In `src/scenes/PreloadScene.js`, uncomment the `this.load.atlas('wyvern', ...)` line.
4. In `createWyvernAnimations()`, replace the single-frame configs with:
   `frames: this.anims.generateFrameNames('wyvern', { prefix: 'fly', start: 0, end: 5 })`
5. In `src/entities/Wyvern.js`, change the constructor texture from
   'wyvern-placeholder' to 'wyvern'.
