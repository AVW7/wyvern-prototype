# Sanctuary Rotatable Camera and Directional Wyverns

**Status:** Engineering implemented through Milestone 4; Milestone 5 directional
wyvern art remains blocked on atlas exports

**Owner direction recorded:** 2026-07-18  
**Predecessor:** [`SANCTUARY_FREE_ROAM_PLAN.md`](SANCTUARY_FREE_ROAM_PLAN.md)
— implemented first-release free roam  
**Primary scene:** `src/scenes/BaseScene.js`  
**Project mode:** Multi-AI collaboration

## Purpose

This is the canonical follow-up plan for the sanctuary camera and directional
art expansion. The predecessor plan delivered the playable Base sanctuary:
zoom, bounded pan, Overview/Follow/Survey, one directly controlled wyvern,
ambient residents, interactions, depth/occlusion, and compatible scene travel.

This plan starts from that working baseline. It must not reopen or rewrite the
completed free-roam milestones unless a regression is found.

## Owner requirements

The requested sanctuary changes are:

1. Preserve camera zoom in and out.
2. Move the viewpoint up and down.
3. Move the camera through at least **90° horizontally: 45° left and 45°
   right** from the current isometric heading.
4. Keep dragon movement eight-directional even though the map is isometric.
5. Make the requirements explicit enough for multiple models to implement and
   review without inventing incompatible coordinate or sprite conventions.

### Recorded interpretation

The current camera already pans vertically, so “up and down” is interpreted as
a new **camera elevation/pitch** axis, independent of screen pan, zoom, and the
dragon's visual flight lift. The exact pitch angles remain an owner-playtest
decision. The first implementation may use lower/default/higher steps.

The required horizontal range is `-45°..+45°` around today's view. A first 2D
implementation may ease between three authored headings (`-45°`, `0°`,
`+45°`) rather than promise a free continuous orbit.

## Current implementation state

| Area | Implemented today | Remaining gap |
| --- | --- | --- |
| Zoom | Cursor-anchored, fitted minimum, configured maximum, retained across projection changes | Owner playtest across the complete acceptance matrix |
| Pan | Bounded Survey drag with bounds recomputed per view | Owner playtest across the complete acceptance matrix |
| Follow | Smoothly follows the active projected logical footprint | Owner playtest/tuning |
| Camera yaw | Three eased endpoints at `-45°`, `0°`, and `+45°` | Owner acceptance of range and bindings |
| Camera elevation/pitch | Lower/default/higher projection presets | Owner acceptance of pitch presets |
| Dragon navigation | Camera-relative WASD/arrows with normalized world-space collision and 8 view sectors | Complete directional art |
| Directional animations | Runtime derives view-facing keys from stable world movement | Atlases still fall back to east because no profile declares complete directional frames |
| Projection | Phaser-free forward/inverse position, vector, footprint, quad, and bounds APIs | None for the supported nine views |
| Terrain/props | View-keyed procedural tile, sidewall, overlay, and decor bakes | Art-direction polish if owner requests it |
| Persistence | Mode, zoom, scroll, yaw, elevation, and selection survive rebuilds and Base travel in memory | Durable save/load remains out of scope |

## Product experience

- **Overview:** fit the projected sanctuary at the selected heading/elevation.
- **Follow:** track the controlled wyvern while retaining yaw, elevation, and
  zoom.
- **Survey:** pan and inspect at any supported view.
- **Orbit:** rotate left/right through the full 90° range without moving logical
  residents or interactions.
- **Elevate:** move to a lower or higher viewpoint without changing dragon
  altitude.
- **Reset:** return the complete rig—heading, elevation, zoom, and framing—to
  the default overview.

Camera transitions should be short and eased. They must not cause motion
sickness, expose outside the sanctuary, trigger an interaction, or make input
change direction halfway through a movement frame.

## Non-goals

- A free 360° orbit or a true 3D camera.
- Applying the new camera to Vault, Atlas, or Mission scenes.
- Mounted-rider controls.
- Free high-altitude flight over blocked sanctuary cells.
- Sanctuary combat, damage, or death.
- A new grounded `walk` animation state; current sanctuary locomotion uses
  `fly`.
- Durable save/load; only the existing in-memory Base session is in scope.
- Multi-page atlases unless the directional art cannot meet the one-page
  budget and the loader extension is explicitly approved.

## Coordinate and direction contract

The implementation must keep these concepts separate:

| Concept | Meaning | Source of truth |
| --- | --- | --- |
| Grid/world position | Stable sanctuary cell or continuous logical footprint | Movement/data systems |
| Camera-relative input | What WASD/arrows mean in the current view | Input + inverse projection |
| World movement vector | Collision/range displacement independent of camera | Movement system |
| Projected footprint | Screen-plane point produced by the active view | Projection system |
| Render lift | Flight bob/elevation above the projected footprint | Presentation only |
| View direction | `n, ne, e, se, s, sw, w, nw` silhouette seen by the camera | Projected world vector |

Required flow:

```text
screen input
  → inverse camera heading
  → world movement vector
  → world collision + logical footprint
  → active sanctuary projection
  → projected footprint + projected motion vector
  → view-direction animation + render lift
```

Collision, interaction range, authored targets, and resident homes remain in
world/grid space. Shadows, labels, effects, prompts, and camera Follow attach
to the projected footprint. Sprite Y after flight lift is never navigation
state.

## Camera rig contract

The camera controller should expose one serializable view state. Names may
change during implementation, but the separation must survive:

```js
{
  mode: 'overview' | 'follow' | 'survey',
  zoom: 1,
  scrollX: 0,
  scrollY: 0,
  yawDeg: 0,          // minimum required range: -45..+45
  elevationStep: 0,  // proposed: -1 lower, 0 default, +1 higher
}
```

Requirements:

- Zoom, pan, mode, yaw, and elevation are independent properties.
- `Home` resets the full rig to Overview, fitted zoom, centre yaw, and default
  elevation.
- A recruit rebuild and Base → Vault/Atlas/Mission → Base travel preserve a
  valid yaw/elevation state in memory.
- Yaw/elevation transitions clamp or refit only when required; they do not
  silently discard the chosen zoom.
- Follow applies panel bias to the projected footprint so the wyvern does not
  hide behind the Roost panel.
- Bounds are recalculated from the projected sanctuary, not reused from the
  default view.
- Cursor-anchored zoom must preserve the logical world point beneath the
  pointer through the active inverse projection.
- Input and pointer activation should be paused or consistently transformed
  during an eased view transition—never half old projection, half new.

### Implemented provisional controls

| Action | Existing/proposed binding | Notes |
| --- | --- | --- |
| Move | WASD / arrows | Camera-relative after yaw |
| Interact | `E` / pointer | Must remain reserved |
| Follow/Survey | `F` | Existing behavior |
| Pan | Space/right/middle drag | Existing behavior |
| Zoom | Mouse wheel | Existing behavior |
| Yaw left/right | `[` / `]` plus visible buttons | Avoid conflict with Interact |
| Elevation down/up | `PageDown` / `PageUp` plus visible buttons | Exact mapping needs playtest |
| Full reset | `Home` | Reset yaw/elevation as well as zoom/framing |

These bindings are implemented but remain owner-playtest decisions. The same
actions are available through visible controls when a keyboard lacks the
preferred keys.

## Projection requirements

Do not use `Phaser.Camera.rotation` as the sanctuary yaw implementation. It
rotates a completed flat image but does not reveal correct tile sidewalls or
prop sides and does not solve inverse picking, depth, or occlusion.

Create a pure, sanctuary-focused forward/inverse projection seam. A proposed
API is:

```js
projectGrid(col, row, height, view) -> { x, y }
unprojectGround(x, y, view) -> { col, row }
projectVector(dx, dy, view) -> { x, y }
projectBounds(cells, view) -> { minX, maxX, minY, maxY }
```

The exact module name may differ, but it should remain Phaser-free so unit
tests can verify:

- default view compatibility with current `gridToScreen()` output;
- forward/inverse round trips at every supported yaw/elevation;
- stable vector mapping and eight-sector quantization;
- finite projected bounds;
- no mutation of authored map or resident data.

Elevation/pitch may initially change projection scale/skew and visible sidewall
height through discrete presets. It must not be approximated by moving the
whole world layer vertically.

## Rendering requirements

Every world-owned visual must use the active projection:

- tile top diamonds and elevation sidewalls;
- overlays and biome variants;
- tall props, their ground anchors, and foreground occlusion;
- resident sprite, aura, selection ring, shadow, label, and footprint;
- interaction markers, prompts, hover feedback, and action effects;
- sanctuary backdrop/shadow and camera bounds.

The HTML Roost panel stays fixed and upright. World labels/prompts should also
remain upright and readable; only their projected anchor changes.

Painter sorting must use the active projected ground order. Do not keep a
default-view `y` depth after yaw. If two projected footprints become equal,
use a stable secondary key so objects do not flicker between frames.

Single-view props are a blocking art/render problem. Procedural drawers should
accept view information or provide authored view variants where asymmetric
silhouettes matter. Rotating only resident art does not satisfy this plan.

## Movement and interaction requirements

- Convert camera-relative input through the inverse view heading before
  collision.
- Normalize diagonal input after transformation so diagonal speed remains
  equal.
- Keep the current swept collision and walkable mask in world space.
- Ambient wanderers choose world-space targets and derive their visible facing
  from the active projection.
- Recalculate `viewDirection` whenever either the actor moves or the camera
  heading changes, including while the actor is idle.
- Invert pointer coordinates through the active projection before target hit
  resolution.
- Keep interaction cooldowns, stable IDs, range, and callbacks unchanged.
- View gestures must continue suppressing click activation.
- Re-run occlusion from projected prop/actor relationships at each view.

## Directional wyvern sprite contract

The canonical export details live in
[`assets/sprites/wyverns/README.md`](../assets/sprites/wyverns/README.md).
This plan requires the following sanctuary coverage:

| State | First art slice | Final plan acceptance |
| --- | --- | --- |
| `idle` | All 8 directions | All 8 directions |
| `fly` | All 8 directions | All 8 directions |
| `attack` | East fallback allowed temporarily | All 8 directions |
| `guard` | East fallback allowed temporarily | All 8 directions |
| `special` | East fallback allowed temporarily | All 8 directions |
| `hurt` | East baseline | East baseline until sanctuary damage exists |
| `death` | East baseline | East baseline until sanctuary death exists |

Art rules:

- Directions are view-space silhouettes in clockwise order:
  `n, ne, e, se, s, sw, w, nw`.
- Track world direction separately; never reinterpret atlas directions as a
  fixed world compass after camera yaw.
- Do not rotate painted sprites to synthesize missing views. Mirroring is only
  a temporary scaffold where anatomy, markings, lighting, and effects remain
  valid.
- Keep source canvas, origin, ground pivot, scale, lighting, anatomy, cadence,
  and phase consistent across the turntable.
- Validate at 64 px sanctuary height at fitted and maximum zoom, plus the
  180 px Vault preview.
- Keep portable atlas pages within 4096 px where possible. If the complete
  action turntable cannot fit, stop and implement an approved multi-page
  loader/catalog/validator/fallback contract before export.

## Architecture and file ownership

| Concern | Expected owner | Implemented / required change |
| --- | --- | --- |
| Orchestration/session | `scenes/BaseScene.js` | Capture/restore rig, coordinate rebuilds and transitions |
| Camera state/input | `systems/sanctuaryCamera.js` | Yaw/elevation controls, transition state, refit/clamp |
| Projection math | New `systems/sanctuaryProjection.js` or equivalent | Pure forward/inverse position/vector/bounds math |
| World placement | `systems/sanctuaryRender.js` | Reproject tiles, props, residents, effects, depth, occlusion |
| Movement | `systems/sanctuaryMovement.js` | Camera input → world vector → view direction |
| Interactions | `systems/sanctuaryInteractions.js` | Projection-aware pointer/marker placement without changing IDs/callbacks |
| Procedural art | `systems/tileArt.js`, `systems/sanctuaryDecorArt.js`, `systems/textureBake.js` | Base-only view-built sidewalls/props and cache keys; generic scene rasters unchanged |
| Ground affordances | `systems/sanctuaryGroundPlane.js` | Project resident/interaction/effect rings and shadows without tilting upright art |
| Camera UI | `ui/roostPanel.js`, `ui/ui.css` | Visible yaw/elevation state and controls |
| Tuning | `config.js` | Rig range, steps, transition duration, input bindings if centralized |
| Directional assets | `data/wyverns.js`, `PreloadScene`, atlas tools | Prefer existing keys; extend page loading only if approved |
| Tests | `tests/sanctuary*.test.js`, new projection tests | Pure math, controller state, movement mapping, lifecycle regression |

Preserve Base, Vault, Atlas, and Mission scene separation. New low-level
projection math may be reusable later, but this plan does not authorize
rewriting Atlas or Mission cameras.

## Proposed tuning contract

Keep final values under `SANCTUARY` in `src/config.js`:

```js
cameraRig: {
  yaw: { min: -45, max: 45, step: 45 },
  elevation: { minStep: -1, maxStep: 1, defaultStep: 0 },
  transitionMs: 280,
}
```

These are starting values. The owner must validate the pitch/elevation visual
range and transition comfort before their decision statuses become accepted.

## Implementation snapshot — 2026-07-18

| Milestone | State | Evidence / remaining work |
| --- | --- | --- |
| 1 — Pure projection | Complete | `sanctuaryProjection.js` covers all nine endpoints with default-view compatibility, inverse round trips, vector mapping, quads, and finite bounds. |
| 2 — Camera rig | Complete | Serializable rig state, keyboard/visible controls, transition lock, full Home reset, per-view fit/bounds, and in-memory persistence are integrated. |
| 3 — Full reprojection | Complete in code | Existing tiles, sidewalls, overlays, per-point procedural props, resident components, radial ground affordances, world shadow, markers, prompts, effects, and depths reproject in place; final visual acceptance remains pending. |
| 4 — Movement/interactions | Complete | Logical world footprints remain canonical; input and wanderers are camera-relative at presentation time; collision/range remain world-relative; pointer coordinates invert through the active view. |
| 5 — Directional art | Blocked | No configured wyvern atlas currently declares complete eight-direction Idle/Fly or action frames. Runtime keys and east fallback remain intact, but final visual acceptance cannot be claimed. |
| 6 — Regression/handoff | In progress | Unit/build checks pass, and the core rig completed a 1280×720 Chrome route before the final scenery/ground-shadow refinements. A post-refinement visual rerun, directional-art inspection, full manual matrix, performance/memory profiling, and owner playtest remain. |

No human-owned decision status below was changed by the implementation.

## Delivery plan

### Milestone 1 — Pure projection spike

- Implement forward/inverse projection for default, left, and right headings
  plus lower/default/higher elevation.
- Prove default-view compatibility and round-trip tests.
- Reproject a small prop-free test patch and one footprint without changing
  production Base behavior.

**Exit:** pure tests pass and screenshots show the same logical cells at all
nine view combinations with no data mutation.

### Milestone 2 — Camera rig state and controls

- Add yaw/elevation state, visible controls, keyboard controls, transitions,
  reset, session capture, projected fit, and bounds.
- Preserve zoom, pan, Follow, panel bias, and click suppression.

**Exit:** the test patch traverses the full yaw range and all elevation steps;
zoom/pan/follow/reset remain stable at 1280×720.

### Milestone 3 — Full sanctuary reprojection

- Move tiles, sidewalls, overlays, props, backdrop, resident components,
  markers, prompts, effects, depth, and occlusion onto the projection seam.
- Add view-aware procedural art/cache variants where required.

**Exit:** the complete sanctuary remains coherent at all nine view
combinations with no missing surfaces, depth flicker, or invalid camera bounds.

### Milestone 4 — Camera-relative movement and interactions

- Transform input to world movement, derive view direction, update idle facing
  after yaw, and preserve swept collision/wandering.
- Invert pointer picking and keep interaction IDs/range/callbacks unchanged.

**Exit:** controlled and ambient residents move correctly in all eight world
directions; keyboard and pointer interactions work at every view.

### Milestone 5 — Directional wyvern art

- Land one profile with complete eight-direction Idle/Fly.
- Validate turntable pivot, phase, lighting, scale, memory, and fallback.
- Complete Attack/Guard/Special directions before final milestone acceptance.
- Extend the loader only if an approved atlas budget proves one page
  insufficient.

**Exit:** no sanctuary movement or visible action snaps to an unrelated facing
at any supported camera view.

### Milestone 6 — Regression and handoff

- Verify recruit rebuild and every Base/Vault/Atlas/Mission transition.
- Profile projection updates, texture baking/cache use, sorting, and memory.
- Update controls/help, architecture docs, sprite docs, plan status, and
  `AI_CONTRIBUTIONS.md`.

**Exit:** the complete acceptance matrix passes in a browser at 1280×720 and
the previous free-roam behavior remains available at the default view.

## Acceptance checklist

- [x] Default yaw/elevation reproduces the implemented sanctuary layout and
      controls without a visual or gameplay regression.
- [x] Camera yaw reaches at least `-45°` and `+45°`; reset returns to `0°`.
- [x] Camera elevation moves lower and higher independently of pan, zoom, and
      dragon flight lift.
- [ ] Zoom, Follow, survey pan, panel collapse, and bounds work at every
      supported view.
- [x] WASD/arrows feel camera-relative while collision/range remain stable in
      world space.
- [x] Controlled and ambient wyverns support all eight logical movement
      directions with correct view-facing.
- [ ] Idle/Fly and visible sanctuary actions meet the directional art contract.
- [ ] Terrain, sidewalls, props, shadows, labels, prompts, effects, depth, and
      occlusion remain correct after view changes.
- [ ] Pointer hover/click resolves the same logical target at every view.
- [x] Camera gestures and transitions never activate an interaction.
- [x] Recruit rebuild and scene travel preserve a valid selected wyvern and
      camera rig.
- [x] Vault, Atlas, and Mission camera behavior is unchanged.
- [ ] Atlas validation, syntax, unit tests, production build, and browser
      console/runtime checks pass.

The unchecked rendering/runtime rows require one final browser pass after the
projected-prop, ground-affordance, and world-shadow refinements. Their pure and
integration contracts are covered by automated tests; final visual acceptance
is intentionally not inferred from those tests.

## Verification matrix

Test the Cartesian product of:

- yaw: left `-45°`, centre `0°`, right `+45°`;
- elevation: lower, default, higher;
- zoom: fitted minimum and configured maximum;
- mode: Overview, Follow, Survey where applicable.

At each yaw/elevation combination:

1. Move in all eight input directions and approach a blocked edge.
2. Confirm world movement, sprite view-facing, shadow, label, and depth.
3. Activate one target with `E` and one with pointer input.
4. Pan to bounds, zoom at an off-centre pointer, toggle Follow, and reset.
5. Collapse/expand the panel and confirm fit/bias.

After the matrix:

1. Select another wyvern.
2. Recruit an animal and verify the rebuilt world/camera.
3. Complete Base → Vault → Base.
4. Complete Base → Atlas → Mission → Base.
5. Inspect console/runtime errors and texture-memory fallbacks.

## Risks and mitigations

| Risk | Failure | Mitigation |
| --- | --- | --- |
| Flat camera rotation | Rotated screenshot with wrong world semantics | Explicit forward/inverse world projection |
| Direction-space confusion | Input or sprite rotates the wrong way | Separate screen input, world vector, and view direction |
| Single-view procedural art | Incorrect sidewalls/props after yaw | View-aware drawers/cache variants before full map acceptance |
| Pointer mismatch | Hover/click targets wrong cell | Inverse-projection unit tests and browser target checks |
| Depth instability | Props/residents flicker or overlap incorrectly | Projected ground-depth function plus stable secondary key |
| Rebuild state loss | Yaw/elevation reset after recruit/travel | Extend existing camera session capture and lifecycle tests |
| Atlas memory | Directional art fails GPU upload | Idle/Fly first, portable 4096 target, approved multi-page design only if needed |
| Input conflict | Camera controls steal Interact/Follow/pan | Reserve `E`/`F`; visible controls; owner playtest bindings |
| Motion discomfort | Orbit/elevation feels abrupt or nauseating | Short eased steps, transition lock, config-driven duration |
| Scope spread | Atlas/Mission cameras regress | Sanctuary-only ownership and explicit non-goals |

## Decision log

Only the human project owner changes final decision statuses.

| ID | Decision | Status | Source / reason |
| --- | --- | --- | --- |
| RC-001 | Support at least 90° sanctuary yaw, `-45°..+45°` around the current heading. | Owner requested | Direction recorded 2026-07-18. |
| RC-002 | Treat “up/down” as elevation/pitch beyond existing vertical pan. | Proposed interpretation | Exact meaning/range requires owner confirmation. |
| RC-003 | Start with three eased yaw headings and three elevation steps. | Proposed | Smallest art-compatible 2D slice. |
| RC-004 | Keep movement camera-relative but collision/interactions world-relative. | Proposed | Standard readable top-down/isometric control contract. |
| RC-005 | Require 8-direction Idle/Fly first, then Attack/Guard/Special. | Proposed | Stages art/memory cost and removes final action snaps. |
| RC-006 | Reproject the world instead of using flat Phaser camera rotation. | Proposed technical constraint | Required for correct surfaces, picking, depth, and occlusion. |
| RC-007 | Keep the feature sanctuary-only; do not change Vault/Atlas/Mission cameras. | Proposed | Preserves established scene boundaries. |

## Multi-model review workspace

Reviews are append-only. Use the next repository-wide sanctuary review ID;
`R-001` and `R-002` are preserved in the predecessor plan, so the next review
here is `R-003`.

Reviewers should focus on:

1. Whether stepped 2D yaw/elevation is sufficient for the owner's intended
   camera experience.
2. Projection/inverse-projection math and default-view compatibility.
3. Camera-relative movement and world/view direction semantics.
4. View-aware tile, sidewall, prop, depth, and occlusion requirements.
5. Directional sprite coverage, pivot consistency, and atlas memory budget.
6. Controls, accessibility, motion comfort, and interaction conflicts.
7. Milestone dependencies and a smaller playable vertical slice if one exists.
8. Test coverage across the yaw/elevation/zoom/mode matrix.

### Copyable review prompt

```text
Review docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md as a senior Phaser 3 / 2D
isometric rendering and character-animation engineer. First read AI_CONTEXT.md,
CLAUDE.md, the implemented predecessor plan, and the relevant current source.
Do not implement the feature. Challenge the projection model, inverse picking,
camera-relative movement, world/view direction split, directional sprite and
atlas contract, view-aware scenery, controls, milestone order, risks, and
acceptance matrix. Distinguish must-fix issues from optional polish. Append
your response as the next review in this plan, preserve all prior reviews and
decision statuses, and append your work to AI_CONTRIBUTIONS.md.
```

### Review template

```md
### Review R-### — Model/product

- **Date:** YYYY-MM-DD
- **Model ID:** AI-###
- **Focus:** Projection / camera / movement / art / full plan
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

### Review R-003 — Gemini 3.5 Flash (High)

- **Date:** 2026-07-18
- **Model ID:** AI-003
- **Focus:** Projection / camera / movement / art / full plan
- **Files inspected:** [BaseScene.js](file:///Users/ajadvanwyk/.codex/worktrees/406f/wyvern-prototype/src/scenes/BaseScene.js), [VaultScene.js](file:///Users/ajadvanwyk/.codex/worktrees/406f/wyvern-prototype/src/scenes/VaultScene.js), [sanctuaryRender.js](file:///Users/ajadvanwyk/.codex/worktrees/406f/wyvern-prototype/src/systems/sanctuaryRender.js), [config.js](file:///Users/ajadvanwyk/.codex/worktrees/406f/wyvern-prototype/src/config.js), [iso.js](file:///Users/ajadvanwyk/.codex/worktrees/406f/wyvern-prototype/src/systems/iso.js), [roostPanel.js](file:///Users/ajadvanwyk/.codex/worktrees/406f/wyvern-prototype/src/ui/roostPanel.js)
- **Summary:** The proposed plan for a rotatable camera and directional wyverns is technically sound, highly detailed, and fits within the project's scene separation contracts. However, the projection math, inverse coordinate picking for raised tiles, camera-relative movement vectors, and view-direction mapping require specific mathematical specifications to prevent coordinate-space bugs.
- **Must fix before implementation:**
  1. **Inverse Picking (Unprojection) on Raised Tiles:** In isometric scenes with vertical elevation, a single 2D screen coordinate $(x, y)_{screen}$ can map to multiple candidate world cells due to vertical stacking (cliffs/walls). A simple algebraic unprojection only resolves coordinates to the $Z=0$ ground plane. The inverse picking algorithm in `systems/sanctuaryProjection.js` must implement a layered hit-testing routine: test cells in reverse-depth order (front-to-back or top-to-bottom) until a tile's top face boundary or prop hitbox contains the screen point.
  2. **Tile Art Re-projection:** Since `systems/tileArt.js` draws and bakes 2D tile textures (top face and sidewalls) based on a fixed 45° angle, rotating the camera by $\pm 45^\circ$ makes the default baked textures visually incorrect. Skewing or rotating the standard diamond textures will result in fuzzy pixel edges under `Scale.FIT`. The procedural renderer in `tileArt.js` must draw and cache distinct top face and sidewall geometry variants for each of the three supported yaw angles ($-45^\circ$, $0^\circ$, $+45^\circ$).
  3. **Elevation Aspect Ratio Adjustment:** Changing camera elevation/pitch must adjust the vertical scaling of the top face diamond and the height of the tile sidewalls. The projection matrix must scale the screen $Y$ offset of tile heights by $\cos(\phi)$ where $\phi$ represents the viewing pitch angle, preventing visually inconsistent flattening of elevated walls.
- **Recommended changes:**
  1. **Camera-Relative WASD Movement Math:** The keyboard input vector $V_{input}$ (from WASD keys) must be rotated by the active camera yaw angle $\theta$ in world coordinates before collision resolution: $V_{world} = R(-\theta) \times V_{input}$. This ensures pressing "W" (up arrow) always drives the companion forward relative to the screen direction.
  2. **World-to-View Facing Map:** Map the companion's 8-direction world facing vector to its camera-relative view direction using: $\text{viewDirIndex} = (\text{worldDirIndex} - \text{yawIndex} + 8) \pmod 8$. This automatically selects the correct animation key (e.g. `n, ne, e, se, s, sw, w, nw`) when either the character turns or the camera rotates.
  3. **Screen Y Footprint Depth Sorting:** Rather than utilizing a default-view coordinate for depth sorting, the scene must sort all layers using the final projected screen Y coordinate of each object's ground footprint: $\text{depth} = y_{\text{projected}} + \text{nudge}$. This ensures occlusion remains correct across all yaws and elevations.
  4. **Smooth Orbit Easing:** To prevent motion sickness during camera yaw changes (which can feel abrupt in static orthographic views), rotation transitions must tween `yawDeg` and camera scroll coordinates over $300\text{ms}$ using a smooth quad/sine ease.
- **Keep as designed:**
  1. **Discrete Heading Steps:** Restricting the yaw to three steps ($-45^\circ$, $0^\circ$, $+45^\circ$) is the correct visual compromise to keep procedural texture memory and asset loading manageable.
  2. **Camera-relative control but world-relative collision:** This preserves the robust physics/walkable mask logic without adding mathematical complexity.
- **Risks and edge cases:**
  1. **Backdrop Edge Exposure:** Orbiting the camera shifts the bounding frustum of the screen relative to the backdrop image. The backdrop image must be overscaled to at least $1.25\times$ and use a slow parallax factor (`0.15`) to prevent showing black edges behind the world.
  2. **Rebuild Transition:** Rebuilding the world during a transition tween can cause camera jumps. Disable yaw/elevation inputs during transitions.
- **Suggested first vertical slice:** Milestone 1 + 2: Implement the pure projection utility (`projectGrid`, `unprojectGround`) and connect it to camera keyboard controls (`[`, `]`) to rotate a flat grid of tiles, verifying the inverse picking remains accurate before implementing character sprites.
- **Confidence / unknowns:** High confidence in Phaser 3 rendering boundaries. Unknown: exact performance overhead of dynamic depth-sorting on low-end mobile devices when transitioning between views.

### Review R-004 — Gemini 3.1 Pro (High)

- **Date:** 2026-07-18
- **Model ID:** AI-004
- **Focus:** Architecture / memory management / input safety / occlusion
- **Files inspected:** `src/systems/textureBake.js`, `src/scenes/BaseScene.js`, `src/systems/sanctuaryInteractions.js`
- **Summary:** While the mathematical projection logic in R-003 is robust, the architectural consequences of dynamic camera rotation on the existing engine need stricter guards. Specifically, procedural texture caching will thrash if not partitioned by camera angle, in-flight transitions introduce input race conditions, and dynamic occlusion requires view-aware bounds.
- **Must fix before implementation:**
  1. **Texture Cache Partitioning:** The procedural `textureBake.js` and `tileArt.js` systems currently cache assets by ID or biome. Rotating the camera requires generating new sidewall and top-down geometry. The cache key MUST be expanded to include the camera's `yaw` and `elevation` state (e.g., `${baseId}_y${yaw}_e${elevation}`) to prevent overwriting textures and causing visual corruption across views.
  2. **Input Suspension During Transitions:** Camera rotation transitions (tweens) take ~280-300ms. If a user clicks or presses WASD mid-tween, the inverse projection will calculate an incorrect world coordinate, potentially triggering an invalid interaction or out-of-bounds movement. Input must be strictly suspended (`input.enabled = false`) during yaw and elevation tweens.
- **Recommended changes:**
  1. **View-Aware Dynamic Occlusion:** Tall props (e.g., monoliths, large trees) will occlude the player differently at $-45^\circ$ vs $+45^\circ$. The occlusion system must recalculate which props intersect the line-of-sight from the camera to the player's projected footprint *after* every yaw/elevation change, fading them out accordingly.
  2. **Lazy-Load Action Atlases:** Packing 8 directions for all wyvern states (idle, fly, attack, guard, special) into a single texture atlas will likely exceed the 4096px safety limit on mobile WebGL. Keep `idle` and `fly` in the primary atlas, and lazy-load the remaining combat/interaction states on-demand when the relevant activity starts.
- **Keep as designed:**
  1. **Separation of World vs. View coordinates:** The contract to keep collision and interaction targets in fixed world space while only altering projection is the safest architectural choice.
- **Risks and edge cases:**
  1. **Z-Fighting on Tile Edges:** When modifying the projection aspect ratio for pitch/elevation, overlapping tile boundaries might suffer from floating-point Z-fighting. Ensure the sorting nudge offset scales proportionally with the projection zoom and pitch.
- **Suggested first vertical slice:** Add to Milestone 1: verify that `textureBake.js` can maintain multiple view states in memory simultaneously without cache eviction thrashing.
- **Confidence / unknowns:** High confidence in Phaser's input and cache APIs. Unknown: whether keeping three complete sets of baked tile textures in VRAM will hit mobile memory limits.

### Review R-005 — Gemini 3.1 Pro (Low)

- **Date:** 2026-07-18
- **Model ID:** AI-005
- **Focus:** Scope reduction / art budget / testing simplicity
- **Files inspected:** `docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md`, `assets/sprites/wyverns/README.md`
- **Summary:** While the technical solutions in R-003 and R-004 are correct, they demand significant engineering and art overhead. This review proposes scope reductions to make the initial release more achievable without compromising the owner's core requirements for camera rotation.
- **Must fix before implementation:**
  1. **Sprite Mirroring as a Permanent Solution:** The plan states "Mirroring is only a temporary scaffold". Requiring all 8 unique directional sprites for every action doubles the art budget and memory footprint unnecessarily. If the wyvern design has largely symmetric anatomy, the plan should explicitly allow `e` to mirror to `w`, `ne` to `nw`, and `se` to `sw` as a permanent optimization, cutting the art requirements almost in half.
- **Recommended changes:**
  1. **Pre-Bake the Three Angles:** Instead of rewriting `tileArt.js` to procedurally generate tile variants at runtime for $-45^\circ$, $0^\circ$, and $+45^\circ$, pre-bake these three specific angles as static asset sheets during the build process. This eliminates the risk of runtime cache thrashing and memory spikes flagged in R-004, trading a small disk space increase for guaranteed runtime stability.
- **Keep as designed:**
  1. **Three discrete camera steps:** Do not attempt continuous free-look rotation. Stepping between the three authored views is the only way to keep the 2D art workload realistic.
- **Risks and edge cases:**
  1. **Over-engineering Projection:** Creating a fully generalized `projectGrid` and `unprojectGround` that supports any arbitrary angle is risky. The math should be hardcoded or specifically optimized for just the three required angles ($-45^\circ$, $0^\circ$, $+45^\circ$) to avoid complex trigonometric bugs and rounding errors in collision logic.
- **Suggested first vertical slice:** Add to Milestone 1: hardcode the three projection matrices and verify them against static pre-rendered tiles before attempting to modify any of the dynamic rendering systems.
- **Confidence / unknowns:** High confidence that simplifying the art and rendering pipeline will speed up delivery. Unknown: whether the owner's art direction strictly demands asymmetric wyvern designs that prevent sprite mirroring.

## Handoff rule

Before material implementation:

1. Read `AI_CONTEXT.md`, `CLAUDE.md`, this whole plan, the predecessor plan's
   completed baseline, and the wyvern sprite contract.
2. Inspect the current dirty worktree and preserve unrelated changes.
3. Update the active milestone here rather than reopening the predecessor.
4. Keep owner decision statuses unchanged unless the owner explicitly changes
   them.
5. Run focused tests during development, `npm run check` before handoff, and
   the browser verification matrix for gameplay milestones.
6. Append the exact model and contribution to `AI_CONTRIBUTIONS.md`.

Do not mark a milestone complete until its exit condition has been verified.
