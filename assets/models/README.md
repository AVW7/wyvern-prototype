# 3D models

glTF/GLB models for the scoped 3D dragon experiment
(`docs/SANCTUARY_3D_DRAGON_PLAN.md`). Loaded at runtime via Three.js's
`GLTFLoader` from `src/systems/sanctuaryDragon3D.js` — not part of Phaser's
asset pipeline.

## wyvern3d/wyvern-test.glb

Milestone 1 test asset. Static mesh, no rig, no animation, no textures
(flat gray `pbrMetallicRoughness` material).

- Title: "Wyvern"
- Source: https://sketchfab.com/3d-models/wyvern-06809e9220314dc1b118b9cd02d280b8
- Author: Adrian Carter (https://sketchfab.com/Adrian.Carter3D)
- License: CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) —
  commercial use allowed, attribution required.

Required credit:

> This work is based on "Wyvern"
> (https://sketchfab.com/3d-models/wyvern-06809e9220314dc1b118b9cd02d280b8)
> by Adrian Carter (https://sketchfab.com/Adrian.Carter3D) licensed under
> CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)

## Not used: mega_wyvern

Also present in `wyvern-prototype/wyvernassets-3d testing/` (outside this
folder, not copied into the repo): "Mega Wyvern" by ArachnoBoy
(https://sketchfab.com/vang807), rigged with 11 named animations. Licensed
**CC-BY-NC-SA-4.0 (non-commercial, share-alike)** —
do not use if this prototype ever ships commercially. Recorded here so it
isn't reached for by accident later.

## dragon/drogon-sanctuary.glb

Milestone 2/3 asset, and the one the sanctuary currently renders. Rigged
(292 joints, 39,234 triangles) with the 16 clips `systems/dragonMotion.js`
drives — idle, idle break, alert, walk and its two turning variants, four
turn-in-place clips, takeoff, land, two air banks, an attack and a fire
breath. 9.5 MB.

- Title: "Drogon – Game of Thrones Dragon"
- Source: https://sketchfab.com/3d-models/drogon-game-of-thrones-dragon-d0522be8d01a40cd9e0791bef04e07de
- Author: CoreMesh 3D (https://sketchfab.com/CoreMesh3D)
- License: CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/) —
  commercial use allowed, attribution required.

Required credit:

> This work is based on "Drogon – Game of Thrones Dragon"
> (https://sketchfab.com/3d-models/drogon-game-of-thrones-dragon-d0522be8d01a40cd9e0791bef04e07de)
> by CoreMesh 3D (https://sketchfab.com/CoreMesh3D) licensed under
> CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)

### Derived from the source download

Not the raw Sketchfab file. Regenerate with `tools/prep-drogon.mjs`, which
takes it from 121 MB to 9.5 MB:

- keeps 16 of the 52 animation clips and disposes the other 36 — including
  their channels and samplers, which `Animation.dispose()` does not cascade
  to, and whose orphaned accessors otherwise keep all 52 clips' keyframes in
  the file. Animation data is ~0.36 MB per clip, so adding one to `KEEP`
  costs roughly that much;
- prints a root-motion audit per kept clip (`sway` inside the cycle, `net`
  start-to-end drift). Check `net` before adding a clip: a clip whose root
  does not return where it started walks the model out from under its own
  shadow every loop. `Battle_Down` has ~1568 units of net drift on the
  `Bip001` chain and is the one to watch. The tracks are deliberately *not*
  zeroed — the animator keyed foot contacts against them, so flattening the
  root would reintroduce the foot sliding this pipeline exists to avoid;
- converts the legacy `KHR_materials_pbrSpecularGlossiness` materials to
  `pbrMetallicRoughness` (Three.js dropped support for the old extension);
- resizes both textures to 1024 px webp.
