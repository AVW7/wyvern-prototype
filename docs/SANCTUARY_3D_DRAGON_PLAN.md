# Sanctuary 3D Dragon Experiment

**Status:** Milestone 1 in progress (untextured test mesh, positioning/
compositing proof); Milestone 2 (rigged, animated Drogon swap-in) planned,
not started

**Owner direction recorded:** 2026-07-20
**Predecessor / sibling plans:** [`SANCTUARY_FREE_ROAM_PLAN.md`](SANCTUARY_FREE_ROAM_PLAN.md)
(implemented baseline); [`SANCTUARY_ROTATABLE_CAMERA_PLAN.md`](SANCTUARY_ROTATABLE_CAMERA_PLAN.md)
(active 2D projection/camera initiative — this plan does not reopen or
depend on its Milestone 5 directional-art gate)
**Primary scene:** `src/scenes/BaseScene.js`
**Project mode:** Multi-AI collaboration

## Purpose

Prove that a Three.js-rendered 3D creature can live inside the existing 2D
isometric sanctuary as a scoped experiment — not a production feature, not a
camera change. The sanctuary's environment (terrain, other residents, UI)
stays exactly as implemented today; only one resident's *representation*
changes, from a 2D sprite to a 3D model that can translate and yaw
continuously instead of snapping between eight sprite-facing directions.

## Owner requirements

1. Update the project's specs (README/ROADMAP/AI_CONTEXT/CLAUDE.md) to
   record this initiative, following the pattern already used for the
   rotatable-camera initiative.
2. Prepare the toolchain/asset pipeline for 3D work generally — this is the
   first 3D rendering in the repo.
3. Create this plan so other AI models can review and extend it, per the
   `AI_CONTRIBUTIONS.md` protocol.
4. Ship a first working milestone: replace the 2D sprite of **exactly one**
   resident — the player-controlled roster wyvern — with a 3D model, inside
   `BaseScene` (not `VaultScene`: the whole point is proving a 3D character
   can move freely while the environment stays iso, which only means
   anything in the free-roam scene).

### Toolchain exception, owner-approved

`CLAUDE.md`'s Guardrails state: *"Don't introduce a build system, framework,
or npm dependency without being asked."* `AI_CONTEXT.md`'s Collaboration
contract states: *"Keep the zero-build vanilla-JavaScript setup unless a
human explicitly approves a toolchain change."*

The human project owner explicitly approved adding `three` (pinned exact
version `0.185.1`) as an npm dependency on 2026-07-20, scoped to this one
dependency and to `src/systems/sanctuaryDragon3D.js` only. This is not a
general license for further framework/dependency additions elsewhere in the
prototype — see the matching Guardrails bullet in `CLAUDE.md`.

## Current state

| Area | Implemented today | New in this plan |
| --- | --- | --- |
| Resident rendering | Every roster animal is a Phaser `Sprite`/`Image` placed by `spawnSanctuaryResidents` (`src/systems/sanctuaryRender.js`) | Exactly one resident (the controlled wyvern) instead renders via a Three.js scene layered over the Phaser canvas |
| Movement | `sanctuaryMovement.js` computes camera-relative world-space footprint (`col`/`row`) and eight view-facing sectors for sprite animation selection | The 3D model reads the same footprint but uses continuous yaw instead of an 8-sector snap |
| Camera/projection | `sanctuaryProjection.js` — pure affine forward/inverse projection, unchanged by this plan | Read-only consumer: `projectionBasis()`/`projectFootprint()` calibrate the 3D camera and position, once at spawn |
| Toolchain | `phaser` is the only dependency; zero-build vanilla JS | `three` added as the one recorded exception (see above) |

## Product experience

The player sees the currently-selected roster wyvern rendered as a 3D
model standing/moving at its correct sanctuary footprint, while every other
resident, all HTML UI, and the Vault/Atlas/Mission scenes are visually
unchanged. In Milestone 1 the model is an untextured gray test mesh with no
animation — proving the pipeline, not the final look. Milestone 2 swaps in
a fully textured, rigged, animated dragon.

## Non-goals

- Any change to `sanctuaryProjection.js`, `sanctuaryCamera.js`'s yaw/
  elevation rig, or the Vault/Atlas/Mission scenes.
- A true free 3D camera or orbit. This is **not** the deferred "free
  360°/3D sanctuary camera" from `ROADMAP.md`'s Explicitly Deferred list —
  the sanctuary projection, camera bounds, and every other resident stay
  exactly as implemented today.
- Live re-orientation of the 3D model when the camera rig's yaw/elevation
  changes (`BaseScene.applyCameraProjection`). Deferred as an explicit
  follow-up milestone; the visual seam (3D model keeps its Milestone-1
  fixed angle while the 2D world reprojects around it) is accepted, not
  hidden.
- Replacing any other resident's sprite. Exactly one — the controlled
  roster wyvern — for this whole experiment.
- Draco/meshopt mesh compression. Neither test asset needs it; revisit only
  if a later asset is too large without it.
- (Milestone 1 specifically) Skeletal animation, an `AnimationMixer`, or
  clip crossfades — the Milestone 1 asset has no rig. Idle "life" is a
  simple procedural bob coded directly in the module.

## Asset and attribution contract

Two Sketchfab test assets live in `wyvern-prototype/wyvernassets-3d testing/`
(outside `assets/` — not yet part of the shipped game):

| Asset | Size | Rig/animation | License | Used |
| --- | --- | --- | --- | --- |
| `wyvern.glb` ("Wyvern" by Adrian Carter) | 2.9 MB, ~124.9k triangles | None (static mesh, flat gray `pbrMetallicRoughness` material, no textures) | CC-BY-4.0 — commercial use allowed | **Yes — Milestone 1** |
| `mega_wyvern.glb` ("Mega Wyvern" by ArachnoBoy) | 5.3 MB, 70-joint skin, 11 named clips (Idle, Roar, Death, ...), modern `KHR_materials_specular` | Rigged + animated | **CC-BY-NC-SA-4.0 — non-commercial** | **No** — flagged so it is never reached for later without re-checking the license; incompatible if the prototype ever ships commercially |
| `drogon__game_of_thrones_dragon.glb` ("Drogon – Game of Thrones Dragon" by CoreMesh3D) | 121 MB (pre-optimization), 292-bone skin, 52 named clips, legacy `KHR_materials_pbrSpecularGlossiness` | Rigged + animated | CC-BY-4.0 — commercial use allowed, attribution required | **Milestone 2 (deferred)** |

Required attribution text (Wyvern, in `assets/models/README.md`):

> This work is based on "Wyvern"
> (https://sketchfab.com/3d-models/wyvern-06809e9220314dc1b118b9cd02d280b8)
> by Adrian Carter (https://sketchfab.com/Adrian.Carter3D) licensed under
> CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)

Milestone 1 target path: `assets/models/wyvern3d/wyvern-test.glb`.
Milestone 2 target path (when executed): `assets/models/dragon/drogon-sanctuary.glb`,
after Blender-based material conversion (`KHR_materials_pbrSpecularGlossiness`
→ Principled BSDF / metallic-roughness), optional decimation, and re-export
— see "Milestone 2" below for the full procedure.

## Rendering/coordinate contract

- `src/systems/sanctuaryProjection.js` remains the single source of truth
  for screen position. The 3D layer only **reads** `projectFootprint(col,
  row, height, view)` (returns `{x, y}` screen pixels) and
  `projectionBasis(view)` (returns the affine yaw/pitch/scale basis); it
  never reimplements projection math.
- Camera orientation is read **once**, at creation, from the sanctuary's
  current default `projectionBasis(view)` — a fixed yaw/pitch approximating
  today's iso look. Only the 3D model's *position* updates every frame,
  from the controlled resident's `footprint.col/row`.
- The 3D canvas composites as a DOM sibling between `#game` (Phaser) and
  `#ui-overlay` (HTML UI), reusing the existing `--stage-left/top/width/
  height` CSS custom properties that `src/main.js` already keeps in sync
  (via `game.scale`'s resize event, `window` resize, and a `ResizeObserver`
  on `game.canvas`) — no new resize plumbing.

## Architecture and file ownership

| File | Role |
| --- | --- |
| `src/systems/sanctuaryDragon3D.js` (new) | The only file that imports `three`. Owns `WebGLRenderer`, `Scene`, camera, `GLTFLoader`, and (Milestone 2) `AnimationMixer`. Exposes `syncToFootprint`/`setMoving`/`update`/`resize`/`destroy`. |
| `src/systems/sanctuaryRender.js` | `spawnSanctuaryResidents` gains one branch: skip sprite/aura/shadow creation for the 3D-owned resident. Everything else unchanged. |
| `src/scenes/BaseScene.js` | Threads `selectedWyvernId` into `spawnSanctuaryResidents` options; creates/steps/resizes the 3D module from `buildWorld()`/`update()`; leaves `applyCameraProjection()` untouched for Milestone 1 (commented pointer to this plan's Non-goals). |
| `src/systems/sanctuaryMovement.js` | Unchanged — its `objectAlive()` guard already treats `sprite: null` as a safe no-op, used throughout (`setPosition`, `playResidentState`, `stopResidentBob`, the wanderer-exclusion check). |
| `index.html`, `src/ui/ui.css`, `src/main.js` | One new `#dragon3d` canvas sibling reusing the existing `--stage-*` vars and resize hook. |
| `src/config.js` | New `SANCTUARY.dragon3D` block: `modelUrl`, `targetHeightPx`, `bobAmplitude`/`bobSpeedHz` (Milestone 1); `idleClip`/`walkClip`/`crossfadeMs` added in Milestone 2. |
| `assets/models/README.md` (new) | Attribution for both test assets and (once executed) Drogon. |

## Delivery plan

### Milestone 1 — Positioning/compositing proof (static mesh)

- Copy `wyvern.glb` into `assets/models/wyvern3d/wyvern-test.glb`; write
  `assets/models/README.md`.
- Add `three@0.185.1` (exact pin) to `package.json`.
- Build `sanctuaryDragon3D.js`: `WebGLRenderer` + `Scene` + a camera
  calibrated once from `projectionBasis()`, `GLTFLoader` load of the test
  mesh, `syncToFootprint(col, row, view, facingRad)` (translate + continuous
  yaw), `setMoving(isMoving)` (toggles a procedural sine-wave idle bob, no
  clip), `update(deltaMs)`, `resize`, `destroy`.
- Thread `selectedWyvernId` into `spawnSanctuaryResidents`'s options; branch
  to `sprite: null, aura: null, shadow: null` for that one resident, keeping
  `footprint`/`label`/`selectionRing`.
- Wire the `#dragon3d` canvas, the shared resize hook, and per-frame
  `BaseScene.update()` stepping.
- **Exit criteria:** the controlled wyvern renders as the 3D mesh at the
  correct footprint/scale; WASD/arrows move it in lockstep with continuous
  yaw; standing still shows the idle bob; switching selection/recruiting/
  visiting Vault-Atlas-Mission all behave per the Verification matrix below;
  `npm run check` stays green.

### Milestone 2 — Drogon swap-in (deferred, not started)

- Import `drogon__game_of_thrones_dragon.glb` via the (now working) Blender
  MCP connection; inventory datablocks (2 meshes, 292-bone armature, 52
  actions).
- Inspect both materials' node graphs to see what Blender's importer did
  with `KHR_materials_pbrSpecularGlossiness`; rebuild each as a plain
  Principled BSDF (Base Color ← diffuse texture, derived/flat Roughness,
  low flat Metallic ~0.05–0.1, keep any Normal input).
- Re-check datablocks (mesh/armature/52 actions unchanged after the
  material rebuild — should be a no-op regression check).
- Decimate body/head meshes only (never the armature) if the triangle count
  is high; resize textures toward ~2048 px if 4K+.
- Export to `assets/models/dragon/drogon-sanctuary.glb`
  (`export_animations=True, export_skins=True`); re-import to verify 2
  meshes, Principled-only materials, all 52 clip names, armature intact.
  Target ~8–20 MB (no Draco/meshopt).
- Extend `sanctuaryDragon3D.js` with `GLTFLoader`'s skin path,
  `AnimationMixer`, and an idle/walk crossfade: **`Neutural_Watch`** →
  idle, **`Battle_Walk`** → moving (owner-confirmed 2026-07-20, over
  `Battle_Stand` — reads calmer for a home-base sanctuary resident).
  `crossfadeMs: 250`.
- **Exit criteria:** same manual route as Milestone 1, plus: idle/walk
  animation crossfades correctly with no snap/pop; visual scale/proportions
  read reasonably against the 2D residents.

## Known, accepted risks

- **Two WebGL contexts** (Phaser + Three.js) run simultaneously — may not
  run well on low-end/integrated GPUs. No fallback/degradation path is in
  scope for either milestone.
- **Fixed camera angle in Milestone 1/2**: if the player changes the
  sanctuary camera's yaw/elevation while this experiment is active, the 3D
  model keeps rendering at its original fixed angle while the 2D world
  reprojects around it. Documented, not silently papered over — see
  Non-goals.

## Acceptance checklist

- [ ] Controlled wyvern renders as the 3D model at the correct footprint
      and a scale comparable to the existing ~64px 2D wyverns.
- [ ] WASD/arrows move the 3D model in lockstep with the existing footprint
      system, with continuous (not 8-sector) yaw facing.
- [ ] Idle state reads clearly (Milestone 1: procedural bob; Milestone 2:
      `Neutural_Watch` clip).
- [ ] Selecting a different roster wyvern moves the 3D representation to
      the new selection; the previous one reverts to a normal 2D sprite.
- [ ] Recruiting (a `buildWorld()` rebuild) does not leak a duplicate
      renderer/WebGL context.
- [ ] Vault, Atlas, and Mission are visually unaffected; the 3D canvas does
      not render there.
- [ ] Window resize keeps the 3D canvas aligned with the Phaser canvas via
      the reused `--stage-*` vars.
- [ ] Zero browser console errors throughout.
- [ ] `npm run check` stays green; no regression to the existing ~150 tests.
- [ ] (Milestone 2 only) All 52 source animation clip names survive asset
      prep; idle/walk crossfade has no snap/pop.

## Verification matrix

Manual browser route (1280×720), after each milestone:

1. Enter Base. Confirm the controlled wyvern renders as the 3D model at its
   correct sanctuary footprint/scale; every other resident stays a normal
   2D sprite.
2. Move with WASD/arrows; confirm lockstep tracking with the footprint
   system and continuous yaw facing the movement direction.
3. Stand still; confirm the idle state (bob or clip) plays.
4. Select a different roster wyvern (if more than one exists); confirm the
   3D representation follows the new selection and the old one reverts to
   2D.
5. Recruit a new animal (triggers a rebuild); confirm no duplicate
   renderer/WebGL context leak (watch devtools for `WebGL context lost` or
   orphaned canvases).
6. Zoom/pan/toggle Follow/Survey; confirm the 3D model's position still
   visually tracks its footprint (perfect pixel-scale tracking across zoom
   is not required/promised — note any drift for the deferred yaw-sync
   follow-up).
7. Enter Vault, Atlas, launch a Mission, return to Base; confirm none of
   those scenes show the 3D canvas and Base resumes correctly.
8. Resize the browser window / toggle devtools; confirm the 3D canvas
   stays aligned at the new size.
9. Check the console throughout for zero JavaScript/WebGL errors.
10. Run `npm run check` (`check:syntax` → `validate:atlas` → `vitest` →
    `vite build`); confirm no regression.

## Risks and mitigations

| Risk | Failure | Mitigation |
| --- | --- | --- |
| Two simultaneous WebGL contexts | Poor performance or context-limit errors on low-end/integrated GPUs | Accepted known limitation for this experiment; no fallback path in scope |
| Fixed 3D camera angle vs. live 2D camera rig | Visual mismatch when the player rotates/elevates the sanctuary camera | Documented non-goal; live re-sync is an explicit deferred follow-up |
| `resident.sprite === null` breaking a downstream consumer | Crash or silent no-op in movement/wanderer/interaction code | Verified: `sanctuaryMovement.js`'s `objectAlive()` guard already treats `null` sprites as safe everywhere it's used |
| Scale mismatch between the 3D mesh and 2D residents | 3D model reads as comically large/small | Calibrate `targetHeightPx` against the model's own bounding box before final tuning |
| Non-commercial asset reused by mistake later | Legal/licensing risk if the prototype ships | `mega_wyvern.glb`'s CC-BY-NC-SA-4.0 status is explicitly recorded in this plan and `assets/models/README.md` |
| Milestone 2 material conversion loses data | Missing textures/animations after Blender re-export | Re-import-and-verify step before accepting the exported asset |

## Decision log

Only the human project owner changes final decision statuses.

| ID | Decision | Status | Source / reason |
| --- | --- | --- | --- |
| TD-001 | Add `three` (pinned exact version) as a one-off, scoped toolchain exception. | Owner approved | Direction recorded 2026-07-20; see "Toolchain exception" above. |
| TD-002 | Target `BaseScene` (not `VaultScene`) for the experiment. | Owner requested | Only the free-roam scene tests "moves freely in 3D." |
| TD-003 | Use `wyvern.glb` (static, untextured) for Milestone 1 instead of Drogon. | Owner requested | Isolates the positioning/compositing proof from animation/material-conversion risk. |
| TD-004 | Do not use `mega_wyvern.glb`. | Owner-adjacent, recorded here | CC-BY-NC-SA-4.0 is non-commercial; incompatible with a prototype that may ship. |
| TD-005 | Milestone 2 idle clip is `Neutural_Watch`, not `Battle_Stand`. | Owner decided | Confirmed 2026-07-20 — reads calmer for a home-base sanctuary resident. |
| TD-006 | No Draco/meshopt compression for either milestone. | Proposed | Neither asset's size currently requires it. |
| TD-007 | Live camera-rig yaw/elevation re-sync is deferred, not built in Milestone 1 or 2. | Proposed | Keeps each milestone's scope achievable; documented visual seam is accepted. |

## Multi-model review workspace

Reviews are append-only. `R-001`–`R-005` are recorded across the predecessor
and rotatable-camera plans; the next repository-wide sanctuary review here
is **R-006**.

Reviewers should focus on:

1. Whether the `sprite: null` interception point in `spawnSanctuaryResidents`
   is actually safe against every downstream consumer (not just
   `sanctuaryMovement.js`) — re-verify against the current source, not just
   this plan's claims.
2. The fixed-camera-angle approach for Milestone 1/2 versus alternatives
   (e.g., a lightweight live yaw sync) and whether the visual seam is
   acceptable for a first-release experiment.
3. Scale/proportion calibration between the 3D model and existing 2D
   residents.
4. Whether the two-WebGL-context risk needs a fallback path sooner than
   assumed here (e.g., device/GPU detection).
5. Milestone sequencing — whether Milestone 2's asset-prep procedure
   (material conversion, decimation, re-export) is correctly scoped before
   it's executed.
6. License/attribution completeness for all three referenced assets.

### Copyable review prompt

```text
Review docs/SANCTUARY_3D_DRAGON_PLAN.md as a senior Three.js / Phaser 3
integration engineer. First read AI_CONTEXT.md, CLAUDE.md, this whole plan,
and the relevant current source (sanctuaryRender.js, sanctuaryMovement.js,
sanctuaryProjection.js, BaseScene.js, main.js, index.html, ui.css). Do not
implement the feature. Challenge the sprite=null interception point, the
fixed-camera-angle compromise, canvas compositing/resize correctness, scale
calibration, WebGL context risk, and the Milestone 1/2 split. Distinguish
must-fix issues from optional polish. Append your response as the next
review in this plan, preserve all prior reviews and decision statuses, and
append your work to AI_CONTRIBUTIONS.md.
```

### Review template

```md
### Review R-### — Model/product

- **Date:** YYYY-MM-DD
- **Model ID:** AI-###
- **Focus:** Integration / rendering / assets / full plan
- **Files inspected:** `path`, `path`
- **Summary:** One short paragraph.
- **Must fix before implementation:** Concrete issues, or `None`.
- **Recommended changes:** Ordered recommendations with reasons.
- **Keep as designed:** Decisions that should not churn.
- **Risks and edge cases:** Failure modes and how to test them.
- **Suggested first vertical slice:** Smallest playable implementation.
- **Confidence / unknowns:** What was not verified.
```

### Recorded reviews

### Review R-006 — Gemini 3.5 Flash (High)

- **Date:** 2026-07-20
- **Model ID:** AI-003
- **Focus:** Three.js Voxel Environment & 3D Roster Integration
- **Files inspected:** [BaseScene.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/scenes/BaseScene.js), [sanctuary3D.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/systems/sanctuary3D.js), [sanctuaryRender.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/systems/sanctuaryRender.js), [decorArt.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/systems/decorArt.js), [config.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/config.js), [main.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/main.js), [ui.css](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/ui/ui.css)
- **Summary:** The initial implementation has taken a bold step beyond the original "single-controlled 3D resident" plan by upgrading the entire Base scene into a fully 3D voxel diorama in Three.js, complete with animated dummies, fires, and resonance effects. While this voxel-based pivot elegantly resolves the complex depth-sorting and occlusion challenges that would plague a hybrid 2D/3D approach, it introduces critical stability, memory, and lifecycle issues by rebuilding the WebGL context and loading assets from scratch on every transition and recruitment.
- **Must fix before implementation:**
  1. **WebGL Renderer Lifetime Leaks:** Instantiating a new `THREE.WebGLRenderer` in `createSanctuary3D()` during every `buildWorldDisplay()` call and disposing of it on scene transitions or world rebuilds (e.g. when a wyvern is recruited) will quickly exhaust the browser's WebGL context limit. This causes "Too many active WebGL contexts" warnings, resulting in empty 3D viewports or browser crashes. The scene must lazily initialize the `THREE.WebGLRenderer` once and cache it on the `BaseScene` instance or globally, sharing/reusing it across scene travels and rebuilds instead of recreating it.
  2. **GLTF Asset Load Thrashing:** Calling `new GLTFLoader().load(modelUrl, ...)` inside `createSanctuary3D()`'s initial spawn block forces a network or browser-cache load and full CPU parse of `wyvern-test.glb` (2.9 MB) every time `BaseScene` is loaded or reconstructed. This results in measurable jank/freezes during gameplay transitions. The model data should be preloaded and cached using Phaser's loader or a shared Three.js asset cache.
- **Recommended changes:**
  1. **Three.js Texture Cache Re-use:** Currently, Phaser canvas textures (e.g. `species-${r.animal.species}`) are uploaded into Three.js as `new THREE.CanvasTexture` on every resident spawn. These textures must be cached in a registry (e.g. `threeTextureCache`) keying off the texture key to prevent VRAM bloat and texture upload overhead.
  2. **Instanced Mesh Optimization for Voxel Tiles:** Rendering an individual `THREE.Mesh` and `THREE.BoxGeometry` for every tile in the 40x40 grid results in ~1,600 unique draw calls. While acceptable for a prototype, this should be optimized using `THREE.InstancedMesh` or merging geometries into a single mesh group to keep draw calls low on lower-end devices.
  3. **Occlusion Fade in 3D:** Implement view-dependent opacity changes for 3D billboard props and decor. When the camera rotations place a tree or obelisk directly between the camera and the controlled dragon, its material opacity should be dynamically tweened/reduced.
- **Keep as designed:**
  1. **Voxel Diorama Pivot:** Transitioning the entire BaseScene terrain and residents to a unified 3D viewport is highly endorsed. Trying to render a 3D dragon that moves smoothly in a 2D isometric Phaser projection would lead to complex, fragile depth-sorting logic.
  2. **CSS Custom Property Layout Sync:** Sizing the Three.js canvas dynamically via `--stage-*` custom properties synchronizes the rendering aspect ratio perfectly under Phaser's `Scale.FIT` without duplicating resizing logic.
- **Risks and edge cases:**
  1. **WebGL Context Lost Handling:** In-game scene transitions (especially switching to `MissionScene` which uses WebGL via Phaser) may trigger context loss. A listener for `webglcontextlost` must be registered on the canvas to handle recovery gracefully.
  2. **Three.js Camera aspect ratio on first load:** The initial aspect ratio is set via `GAME.width / GAME.height`, but the canvas size might be letterboxed. Rely on the `ResizeObserver` callbacks in `main.js` to ensure the initial resize is triggered before the first frame is rendered to prevent stretching.
- **Suggested first vertical slice:** Refactor `createSanctuary3D` and `BaseScene.js` to lazily instantiate a single, persistent `THREE.WebGLRenderer` cached on `BaseScene` (or as a persistent game-level system) and verify that switching between Base and Vault 10 times consecutively does not leak contexts or trigger texture re-uploads.
- **Confidence / unknowns:** High confidence in Three.js integration patterns and Phaser's WebGL context interactions. Unknown: performance limits of the unoptimized voxel drawing on older mobile GPUs.

## Handoff rule

Before material implementation:

1. Read `AI_CONTEXT.md`, `CLAUDE.md`, this whole plan, and the current
   source for `sanctuaryRender.js`, `sanctuaryMovement.js`,
   `sanctuaryProjection.js`, and `BaseScene.js`.
2. Inspect the current dirty worktree and preserve unrelated changes.
3. Update the active milestone here rather than reopening a completed one.
4. Keep owner decision statuses unchanged unless the owner explicitly
   changes them.
5. Run `npm run check` before handoff, plus the manual browser
   verification matrix above.
6. Append the exact model and contribution to `AI_CONTRIBUTIONS.md`.
