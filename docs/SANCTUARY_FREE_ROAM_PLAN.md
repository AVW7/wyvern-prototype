# Sanctuary Free-Roam Redesign

**Status:** Closed  
**Project mode:** Multi-AI collaboration  
**Last updated:** 2026-07-18  
**Primary scene:** `src/scenes/BaseScene.js`

## Vision

Turn the sanctuary grounds from a fitted roster diorama into a living,
explorable home space. The player directly controls a selected dragon/wyvern,
can zoom from a readable overview into close action, and can interact with
residents and authored landmarks without losing the management-sim layer.

The first release interprets **free roaming on the dragons** as controlling a
roster wyvern in the sanctuary. A mounted rider is a later product decision,
not part of this slice.

## Player experience

The sanctuary should support three complementary distances:

1. **Overview** — see the island, active residents, task markers, and the Roost
   panel together.
2. **Follow** — the camera smoothly follows the selected wyvern while the
   player explores with WASD/arrow keys.
3. **Inspect** — zoom toward the cursor and interact with a resident, spring,
   nest, training area, gate, or other landmark.

The management panel remains available and collapsible. World interaction is
not hidden inside the panel: nearby objects show an in-world prompt and accept
either click/tap or the interaction key.

## Current baseline and gaps

- `BaseScene.buildWorld()` builds a fixed fitted view and only wires the barred
  vault door (`wireEntrance()` finds the `barredDoor` prop by type).
- `buildSanctuaryView()` computes one camera zoom and center via the private
  `sanctuaryBounds()`; it has no pan, follow, cursor-anchored zoom, or bounds
  export. It is **shared with `VaultScene`**, so any signature change must stay
  compatible with both callers (`src/scenes/BaseScene.js:42`,
  `src/scenes/VaultScene.js:79`).
- `spawnSanctuaryResidents(scene, layer, view, zoom)` returns nothing and adds
  each resident as fire-and-forget sprites. Atlas-textured wyverns **already get
  an accent aura, a ground shadow, an idle animation, and a name label**; the
  gap is that none of these are returned as a handle, and every resident is
  animated with a stationary `y: -=amplitude` bob tween — so no resident can yet
  become a footprint-driven controlled character, and Milestone 2 must *reuse*
  the existing shadow/label rather than add a second one.
- Sanctuary props carry only `{ type, variant, offsetX, offsetY }` plus a sprite
  reference; they have no stable interaction ID, action, range, label, or
  availability state.
- Authored cells already carry `blocked: height >= TERRAIN.blockedAt` (set in
  `makeBuilder` in `data/sanctuary.js`), and cells can be `null` holes. A
  walkable mask can start from these two facts without new authoring.
- The map already has the right visual foundations: hand-authored cells,
  elevation, separate prop sprites, ground-footprint depth (`setData('depth', …)`
  keyed off the ground plane), and `screenToGrid()` in the shared iso system.
- `AtlasScene` already proves cursor-anchored wheel zoom, bounded pan, fit zoom,
  panel-aware framing, and pan momentum (`ATLAS.panDamping`/`panEpsilon`). Reuse
  its math and behavior, but keep the sanctuary implementation sanctuary-specific
  as required by the scene architecture.

## Design rules

- Preserve the separate Base, Vault, Atlas, and Mission scene implementations.
- Share only low-level math or small systems; do not make `BaseScene` inherit
  from or call scene logic in `AtlasScene`/`MissionScene`.
- Keep grid position/ground footprint separate from rendered flight lift.
  Movement, hit testing, interaction range, and depth use the footprint.
- Keep the selected wyvern and its shadow readable at every zoom level.
- Use simple movement bounds and cell metadata before introducing full physics.
- Put tuning values in `SANCTUARY` inside `src/config.js`.
- Keep HTML/CSS for panels and fixed HUD; use Phaser objects for world prompts,
  selection rings, hover highlights, and action effects.

## Proposed architecture

| Concern | Owner | Responsibility |
| --- | --- | --- |
| Scene orchestration | `BaseScene.js` | Build/reset world, choose controlled wyvern, call update systems, transition scenes |
| Camera | `systems/sanctuaryCamera.js` | Fit bounds, follow/survey modes, cursor zoom, pan, panel bias, reset view |
| Residents | `systems/sanctuaryRender.js` | Return `{ animal, sprite, label, shadow }` handles instead of fire-and-forget sprites |
| Player movement | `systems/sanctuaryMovement.js` | Input, footprint movement, island bounds, blocked cells, flight pose, animation |
| Interactions | `systems/sanctuaryInteractions.js` | Registry, hover/nearest target, prompt, click/key activation, cooldown |
| Authored world data | `data/sanctuary.js` | Walkable/blocked cells and stable interaction descriptors attached to props/areas |
| UI | `ui/roostPanel.js`, `ui/ui.css` | Selected dragon, camera-mode control, collapsed state, action result messages |
| Tuning | `config.js` | Zoom, follow smoothing, input speed, interaction range, lift, marker scale |

Avoid importing the combat-focused `Wyvern` entity directly into the Base
scene. It owns mission orders, attacks, damage, and mission keyboard bindings.
Instead, move only reusable animation/flight-pose behavior into a small helper
or implement a sanctuary controller around the selected resident handle.

## Data contract

Extend sanctuary authored data without breaking existing tile consumers:

```js
{
  id: 'spring-main',
  type: 'spring',
  col: 9,
  row: 17,
  label: 'Drink from the spring',
  action: 'restore',
  range: 58,
  once: false,
}
```

Keep descriptors in a separate `INTERACTIONS.outside` list or return them next
to `{ tiles, cols, rows }`. Do not overload decorative cells with gameplay
rules that other sanctuary views cannot understand.

Initial interactions:

- **Vault gate:** enter `VaultScene`.
- **Spring:** short drink animation/effect and restore or bond feedback.
- **Resident wyvern:** select/focus and show its roster card.
- **Training marker:** play an action, then call the existing XP operation.
- **Nest/feed spot:** play an action, then call the existing bond operation.
- **Atlas/launch marker:** open the world atlas after confirmation or a clear
  second action; do not trigger travel on accidental proximity.

## Camera specification

- Add `SANCTUARY.zoom = { max: 2.2, step: 1.12 }` (mirroring `ATLAS.zoom`);
  derive `min` from fitted map bounds as the atlas does. The current fit uses
  `SANCTUARY.cameraMargin` (30) and `SANCTUARY.panelBias` (120) — reuse both so
  the opening overview is unchanged and `min` never zooms past the fitted view.
- Open in overview mode. Pressing movement or selecting **Follow** transitions
  to follow mode and tracks the controlled footprint with gentle lerp.
- Mouse wheel zooms toward the pointer, keeping its world point pinned.
- Space/right/middle drag pans in survey mode. Normal left-click remains free
  for interactions.
- `F` toggles Follow/Survey. `Home` resets to the fitted overview.
- Recompute the fit and horizontal panel bias whenever the Roost panel expands
  or collapses.
- Clamp the camera to sanctuary bounds plus a small configured margin.
- Do not scale fixed HUD text with the world camera.

## Movement and isometric rules

- Store the controlled actor's logical footprint as grid/world coordinates or
  as ground-plane screen coordinates; never use the lifted sprite `y` as its
  navigation position.
- Normalize diagonal input so diagonal travel is not faster.
- Convert intended movement consistently with the isometric diamond. The
  controls should feel like movement across the ground, not movement along
  arbitrary screen axes.
- Start with a walkable-cell mask generated from non-null cells whose existing
  `cell.blocked` flag is false (already `height >= TERRAIN.blockedAt` in the
  authored data). Add explicit ramps/bridges where elevation changes are
  traversable.
- The controlled resident must **not** keep the shared `y: -=amplitude` bob
  tween — that tween mutates sprite `y` directly and would fight footprint-driven
  movement. Kill/skip it for the controlled actor and drive its lift separately.
- Dragons may visually lift while moving, but the first slice still respects
  island edges and authored no-go cells. A later “high flight” mode can relax
  obstacles if it proves fun.
- Update sprite, label, selection ring, and shadow from one footprint. Sort the
  sanctuary layer while actors move.

## Isometric rendering improvements

1. Add a ground shadow and selection ring for the controlled wyvern.
2. Split tall scenery into prop/foreground sprites where required so moving
   actors can pass behind and in front correctly.
3. Add hover/selected tints or outlines only to interactive objects.
4. Fade tall foreground occluders when they cover the controlled wyvern.
5. Keep labels legible by inversely scaling within configured limits or by
   showing labels only on hover/selection.
6. Add small state effects at the footprint (ripples, dust, sparks, hearts)
   so actions remain visible even when the sprite is airborne.
7. Profile depth sorting only after the playable slice exists; the sanctuary
   population is currently small enough for a per-frame sort while moving.

## Known implementation risks

These are grounded in the current code, not hypothetical:

- **Rebuild wipes live state.** `BaseScene.buildWorld()` runs on every recruit
  (via `onRecruit`) and destroys the whole world layer, and `create()` runs on
  every return from Vault/Mission. Neither preserves the controlled selection,
  camera mode, or camera position. The controller must re-resolve a valid
  selected wyvern and re-seat the camera after any rebuild, and fall back
  gracefully if the previously selected animal was removed.
- **`tweens.killAll()` at the top of `buildWorld()`** stops ambient prop tweens
  intentionally; a movement/lift loop built on the update tick (not a tween)
  survives rebuilds better and avoids being silently cancelled here.
- **Shared render helper.** `buildSanctuaryView()` is called by both BaseScene
  and VaultScene; keep its return shape additive so the Vault showcase is not
  disturbed by camera/bounds changes.
- **Panel bias vs. follow.** `panelBias` shifts the whole view right so the
  fitted map clears the Roost panel. In follow mode the same bias must be
  applied to the follow target (or the followed wyvern hides behind the panel).

## Multi-model review workspace

This section is the shared place for Claude, Gemini, Codex, other models, and
humans to critique the plan before implementation. Reviews are append-only:
add a new review instead of rewriting another contributor's conclusions.

### Questions for reviewers

Reviewers should address the areas where independent input is most valuable:

1. **Player fantasy:** Does direct control of a selected sanctuary wyvern
   deliver the intended free-roaming experience, or should mounting/riding be
   part of the first playable slice?
2. **Camera UX:** Are Overview, Follow, and Inspect the right modes? Identify
   any control conflicts among movement, pointer interaction, drag-pan, and
   cursor-anchored zoom.
3. **Movement representation:** Should the controller store logical grid
   coordinates or a continuous screen-space ground footprint? Explain the
   collision, elevation, and animation tradeoffs for this codebase.
4. **Isometric readability:** Which depth, occlusion, label, shadow, or
   foreground-layer problems are most likely to hide action?
5. **Interaction slice:** Are gate, spring, resident, training, and nest/feed
   the best first five targets? Recommend replacements only when they prove the
   base-management fantasy more clearly.
6. **Architecture:** Challenge the proposed system boundaries while preserving
   the established separation of Base, Vault, Atlas, and Mission scenes.
7. **Milestone order:** Identify dependencies, oversized milestones, or a
   smaller vertical slice that would produce useful player feedback sooner.
8. **Verification and accessibility:** Find missing keyboard, pointer, camera,
   performance, or readability acceptance checks.

### Copyable review prompt

Give the following prompt to another model from the repository root:

```text
Review docs/SANCTUARY_FREE_ROAM_PLAN.md as a senior Phaser 3 / isometric game
developer. First read AI_CONTEXT.md and the sanctuary architecture in
CLAUDE.md, then inspect the relevant current source files. Do not implement the
feature. Give concrete feedback on player fantasy, camera controls, logical
movement, depth/occlusion, interaction priorities, architecture seams,
milestone sizing, and verification. Distinguish must-fix issues from optional
ideas. Append your response as the next review in the plan's Multi-model review
workspace, preserve prior reviews, update the decision log only for decisions
the human owner has accepted, and record your work in AI_CONTRIBUTIONS.md.
```

### How to append a review

1. Read `AI_CONTEXT.md`, `CLAUDE.md`, this entire plan, and the relevant source.
2. Register the exact model in `AI_CONTRIBUTIONS.md` if it is not registered.
3. Copy the template below and use the next `R-###` identifier.
4. Cite file/function names for technical claims. Do not claim to have tested
   behavior that was only read from source.
5. Leave decisions as proposals. The human project owner accepts, rejects, or
   defers them in the decision log.

```md
### Review R-### — Model/product

- **Date:** YYYY-MM-DD
- **Model ID:** AI-###
- **Focus:** Camera / movement / interaction / rendering / full plan
- **Files inspected:** `path`, `path`
- **Summary:** One short paragraph.
- **Must fix before implementation:** Concrete issues, or `None`.
- **Recommended changes:** Ordered recommendations with reasons.
- **Keep as designed:** Decisions that should not be churned.
- **Risks and edge cases:** Failure modes and how to test them.
- **Suggested first vertical slice:** Smallest playable implementation.
- **Confidence / unknowns:** What the reviewer could not verify.
```

### Recorded reviews

### Review R-001 — Gemini 3.5 Flash

- **Date:** 2026-07-18
- **Model ID:** AI-003
- **Focus:** Full plan / Camera / Movement / Interaction / Rendering
- **Files inspected:** [BaseScene.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/scenes/BaseScene.js), [VaultScene.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/scenes/VaultScene.js), [sanctuaryRender.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/systems/sanctuaryRender.js), [iso.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/systems/iso.js), [config.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/config.js), [sanctuary.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/data/sanctuary.js), [wyverns.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/data/wyverns.js), [roster.js](file:///Users/ajadvanwyk/Documents/wyvern-prototype/src/systems/roster.js)
- **Summary:** The proposed Sanctuary Free-Roam Redesign plan is highly robust and fits nicely within the current multi-scene architecture. It addresses the transition from a static roster display to an interactive sandbox without compromising the clean separation of base/vault/atlas/mission scenes. However, key details around logical screen-space coordinate interpolation, continuous collision handling, camera transition states, and the impact of the roster rebuild loop need must-fix specifications to ensure smooth gameplay.
- **Must fix before implementation:**
  1. **Camera Mode Transitions and Follow State:** Panning in follow mode must explicitly toggle the mode back to survey/overview or suspend follow tracking (with a timeout or manual reactivation) to prevent the camera lerp fighting the user's manual pan inputs.
  2. **Collision and Elevation Resolution on Continuous Footprint:** Since movement is continuous, checking single cells for `blocked` is insufficient (causes clipping on tile boundaries). A sliding/footprint-aabb collision check must be detailed. Ramps/elevations (like stairs in the interior) require mapping transition zones in `data/sanctuary.js` so that height is interpolated smoothly based on the footprint's offset.
  3. **Rebuild State Preservation:** The `onRecruit` logic in `BaseScene.js` currently recreates the world and overlay entirely, resetting scene variables. The plan must specify how selected wyvern state, camera position, zoom, and mode are serialized or persisted in memory (e.g., in a temporary base state object or on the scene itself) to prevent jerky resets during gameplay.
- **Recommended changes:**
  1. **Uncontrolled Resident Wandering:** Restrict wander regions in `data/sanctuary.js` per resident spot to keep dragons from wandering into lava or falling off the island edges.
  2. **Interaction Target Weighting:** Since isometric projection causes overlapping targets visually, weighting by screen-space distance or a cone of sight from the controlled wyvern's facing direction is recommended over pure grid distance.
  3. **Camera Panel Bias Scaling:** Scale `panelBias` proportionally with zoom: at `zoom.max` (2.2), a hard 120px offset shifts the camera focus significantly more in world coordinates than at fit zoom (0.5).
- **Keep as designed:**
  1. **Separation of Scenes:** Keeping Base, Vault, Atlas, and Mission scene logic separate is a vital architectural guardrail.
  2. **Direct Dragon Control:** Directly roaming as a selected wyvern (rather than a rider) is the right priority to focus on creature animations and movement.
- **Risks and edge cases:**
  1. **Empty Roster/Roster Changes:** If the player recruits a new animal or if a wyvern is somehow absent, the default selected wyvern must degrade gracefully.
  2. **`tweens.killAll()` Conflict:** Rebuilding the world kills all tweens, which could disrupt any movement/lift loops if implemented as tweens. Implementing movement and lift entirely on the scene `update` tick (as recommended in the plan) avoids this risk.
- **Suggested first vertical slice:**
  Milestone 1 + a partial Milestone 2: Build the sanctuary camera controller and render the first roster wyvern with basic keyboard movement (WASD) on a flat plane without collisions, ensuring camera follow lerps correctly.
- **Confidence / unknowns:**
  High confidence in the Phaser 3 implementation details. Unverified: how the high-resolution Embertooth atlas performs under continuous rotation/facing updates if directional frames are present or if flipping `flipX` is the sole horizontal mirroring mechanism.

### Review R-002 — Claude Fable 5

- **Date:** 2026-07-18
- **Model ID:** AI-004
- **Attribution correction (2026-07-18):** this review was first signed
  "Claude Opus 4.8"; the authoring session's actual model is `claude-fable-5`
  (Claude Fable 5). Corrected by the same session per the registry's
  no-guessed-versions rule; see C-007 in `AI_CONTRIBUTIONS.md`.
- **Focus:** Full plan, weighted to engine implementation seams and art direction
- **Files inspected:** `src/scenes/BaseScene.js`, `src/scenes/AtlasScene.js`,
  `src/scenes/PreloadScene.js`, `src/systems/sanctuaryRender.js`,
  `src/systems/textureBake.js`, `src/systems/iso.js`,
  `src/systems/wyvernPresentation.js`, `src/systems/wyvernAtlas.js`,
  `src/entities/Wyvern.js`, `src/data/sanctuary.js`, `src/data/wyverns.js`,
  `src/config.js`, `src/main.js`, `assets/sprites/wyverns/README.md`
- **Summary:** The plan's architecture and milestone shape are sound and I would
  not restructure them. What is missing is mostly at the level of "this specific
  line will break when Milestone 1 lands." Five concrete failure seams exist in
  current code, four of them inside Milestone 1's blast radius. Separately, the
  art direction has an unresolved decision the camera work will force: the
  procedural terrain and the painted dragons have quality curves that run in
  opposite directions across a zoom range, so the zoom ceiling is an art
  decision before it is a camera constant. On the plus side, the eight-direction
  facing hook is already fully wired and can be used in Milestone 2 with zero
  new art.

- **Must fix before implementation:**

  1. **The vault gate fires on `pointerdown`, so drag-pan will teleport the
     player into the Vault.** `BaseScene.wireEntrance()` binds `pointerdown`
     straight to `enterVault()`. `AtlasScene.setupInput()` already solved this
     with `CLICK_SLOP` plus a `pendingPoiId` deferred to `pointerup`. Milestone 1
     adds drag-pan, but the interaction system that would fix this is Milestone 3
     — so between those two milestones every pan that begins over the gate is a
     scene transition. Move the gate to click-slop semantics inside Milestone 1.

  2. **`buildSanctuaryView()` never calls `cam.setBounds()`, and adding it
     naively will discard the panel framing.** It currently does `setZoom()` then
     `centerOn()` only. `AtlasScene.fitCamera()` documents the trap in its own
     comment: Phaser force-centers the camera on its bounds whenever the view is
     wider than they are, silently throwing away `centerOn()` and parking the map
     behind the panel. The atlas pads its bounds by `biasWorld = panelBias / fit`
     on both x sides to avoid it. The sanctuary needs the same padding, and the
     plan's camera section should state it rather than leaving it to be
     rediscovered.

  3. **The backdrop is sized for the fitted view only, so panning will reveal its
     edge.** `buildSanctuaryView()` places one image at `(lookX, lookY)` with
     `setDisplaySize(GAME.width / zoom, GAME.height / zoom)` — exactly the
     camera's footprint at fit zoom. Zooming in stays covered (fit is the zoom
     floor), but any pan slack moves the camera off that rectangle and exposes
     the void behind it. `AtlasScene` sidesteps this entirely with
     `cameras.main.setBackgroundColor()` plus a sea fade. Cheapest sanctuary fix
     is `backdrop.setScrollFactor(0)` so it is screen-locked; otherwise oversize
     it by the pan margin or set a matching camera background color.

  4. **Resident name labels bake their font size from the fit zoom.**
     `spawnSanctuaryResidents()` sets `font: ${Math.round(11 / zoom)}px monospace`
     using the zoom passed in from `BaseScene.buildWorld()`. Font size is baked
     into the text texture, so once zoom is free the label renders at whatever
     the camera happens to be — roughly 2.2× oversized at `zoom.max`, and it
     cannot be corrected by rescaling without resampling. Author labels at one
     fixed size and apply a clamped `label.setScale(1 / cam.zoom)` per frame (or
     use `setResolution`). This belongs in Milestone 1, because Milestone 1 is
     what introduces free zoom.

  5. **`panelBias` is resolved once at fit time and then passed around as if
     constant.** `lookX` bakes `panelBias / zoom` at build time, and
     `this.world.zoom` is handed to `spawnSanctuaryResidents()` as a stable
     value. R-001 raised bias scaling; the mechanism is that *every* stored
     consumer of that fit zoom goes stale the moment the camera can zoom. Follow
     mode must recompute the bias from live `cam.zoom` each frame.

- **Recommended changes:**

  1. **Stop rebuilding the whole world on recruit.** `onRecruit` calls
     `buildWorld()`, which runs `tweens.killAll()` and destroys the backdrop,
     the layer, and every tile — when the only thing that changed is the resident
     set. Splitting resident spawning into its own `refreshResidents()` removes
     the camera-reset problem, the `killAll()` collision, and R-001's must-fix 3
     outright instead of working around them. Tiles, props, and the backdrop are
     unchanged and their textures are already cached, so the rebuild buys
     nothing.

  2. **Wire eight-way facing in Milestone 2 — the hook is already live and needs
     no art.** `PreloadScene.createWyvernAnimations()` registers all eight
     directional keys for every state, falling back to the east baseline when
     art is absent. `wyvernAnimationKey(profile, state, direction)` already takes
     a direction. A sanctuary controller can compute a heading and call
     directional keys today; un-authored directions play the baseline safely.
     Doing this now means directional art later lands with zero code change,
     which is strictly better than shipping `setFlipX` and retrofitting.

  3. **Resolve plan question 3 to screen-space, matching the mission layer.**
     `Wyvern.update(delta)` already stores a screen-space footprint (`this.x`,
     `this.groundY`), normalizes input in screen space, and is delta-timed
     (`SPEED` is px/ms). `screenToGrid()` rounds the inverse transform, which is
     the correct nearest-diamond test, so it is a valid per-frame collision
     lookup for a continuous screen-space position. Screen-space also yields
     uniform apparent speed in every direction for free; grid-space does not,
     because the 2:1 diamond makes equal grid rates produce unequal screen rates.

  4. **On R-001's must-fix 2 (sliding AABB collision): probably more than the
     first slice needs.** Recorded as disagreement, not correction. With a
     screen-space footprint and a point-in-cell test, axis-separated movement
     produces sliding for free — attempt the x step and revert it if the
     destination cell is null or `blocked`, then attempt the y step
     independently. A full AABB sweep only earns its cost if the dragon's
     footprint should be wider than one cell, which is not yet decided.

  5. **The depth sort is not the performance risk; `roundPixels` is.** The
     exterior is 24×24 with roughly 350–380 non-null cells, 9 props, and 4
     display objects per atlas-textured resident — a per-frame `sortByDepth()`
     over ~400 objects is not a 60fps problem, and the plan is right to defer
     profiling. The real per-frame risk is `roundPixels: true` in `main.js`
     combined with camera-follow lerp at fractional zoom: rounded sprite
     positions under a smoothly moving fractional-zoom camera produce visible
     stepping on exactly the sprite the player is watching. Test follow at a
     non-integer zoom before tuning the lerp constant.

- **Art direction (game-art lens):**

  6. **The two art styles' quality curves run in opposite directions across the
     new zoom range — the zoom ceiling is an art decision.** `ensureTileTexture()`
     bakes tiles at exactly `ISO.tileWidth`/`tileHeight` (64×32), 1:1 with
     display, so any zoom above the fit is pure magnification. Dragons are
     painted atlases whose source poses are ~600–750 px tall (sprite README)
     displayed at `WYVERN_ART.sanctuaryHeight` 64. Zooming in improves the dragon
     and degrades the terrain; zooming out does the reverse. Worse, `pixelArt:
     true` means nearest-neighbour magnification, so copying the atlas's
     continuous `zoom.step` of 1.12 lands the sanctuary on non-integer zooms
     where baked tile pixels double unevenly and shimmer during pan. Recommend
     `SANCTUARY.zoom` use discrete stops (1.0, 1.5, 2.0) rather than a
     multiplicative step, and cap `max` at 2.0. Baking tiles at 2× is the real
     fix but costs memory across 23 biome palettes × 4 variants × height levels,
     which is not a prototype-speed choice.

  7. **For directional art, author `n` and `s` next — not a full eight-way set,
     and not on Embertooth's current page.** The README's directions are
     screen-space with `e` as the required baseline. If sanctuary controls are
     screen-aligned (recommendation 3), the dominant headings are screen
     up/down/left/right = `n`, `s`, `e`, `w`. `e` exists and `w` can stay a
     temporary mirror under the README's own mirroring caveat, so two authored
     views cover the four most-used headings. Memory constraint: Embertooth's
     active atlas is already 4096×4350, about 68 MiB decoded and above the
     4096 px portable cap the README documents — new frames cannot go on that
     page without first trimming the required-state export. Treat directional
     art as a budgeted Milestone 4 task; the code hook (recommendation 2) lands
     in Milestone 2 regardless.

  8. **Sanctuary flight needs shadow altitude response, and the constants do not
     exist yet.** `Wyvern.updateFlightPose()` already scales and fades the mission
     shadow with `flightRatio` (`setScale(1 - flightRatio * 0.22)`, alpha ×
     `(1 - flightRatio * 0.44)`), but `spawnSanctuaryResidents()` creates a static
     ellipse from `WYVERN_ART.sanctuaryShadow` with no lift coupling, and
     `SANCTUARY` has no flight-lift constant at all. Without shadow separation a
     lifting dragon reads as a *bigger* dragon rather than a higher one — the
     clearest altitude cue available in an isometric view. Propose
     `SANCTUARY.flightLift` around 14–18 against the 64 px sanctuary sprite
     height, with scale/alpha response mirroring the mission numbers.

  9. **Selection must not be carried by accent color alone.** Residents already
     get an accent aura from `wyvernAccentColor` (Embertooth `#d97706`,
     Cinderlash `#dc3f50`, Galeclaw `#38a9c9`). The exterior is almost entirely
     the `moss` palette, so Galeclaw's cyan has the weakest value separation from
     the ground of the three. Keep the accent aura for identity and give
     selection its own high-value ring — brightness, not hue — so "which dragon
     am I controlling" survives both the green ground and color-vision
     differences.

  10. **Replace the gate's alpha-pulse affordance with a footprint marker.**
      `wireEntrance()` signals interactivity by tweening the whole gate sprite
      between alpha 1.0 and 0.8. At fit zoom that prop is small and the cue is
      nearly invisible, and spending sprite alpha on affordance conflicts with
      alpha as a state channel (the atlas already uses it for
      discovered/filtered). A pulsing ellipse at the prop's ground point reads at
      every zoom, matches the resident aura's visual language, and is exactly
      this plan's own rendering item 6.

  11. **Slow the sanctuary fly cadence with no new art.**
      `WYVERN_ART.frameRates.fly` is 11. A dragon cruising its home island at
      combat wing-cadence reads wrong. Apply a sanctuary playback rate (~0.7×) to
      the existing fly animation via `setPlaybackRate` rather than authoring a
      second animation or forking the frame-rate table.

  12. **Asset path naming has already drifted and directional exports will
      compound it.** Embertooth resolves to
      `.../Embertooth/wyvern_final_required_bundle/wyvern_required_atlas.png`;
      Cinderlash to `.../Cinderlash/wyvern_atlas_4096.png`. The README already
      prescribes `<profile-slug>.png` / `<profile-slug>.json` for new exports and
      warns that production hosts are case-sensitive, while folders are
      `Embertooth`/`Cinderlash` against keys `wyvern-embertooth`/
      `wyvern-cinderlash`. Worth normalizing before directional files multiply
      the filenames.

- **Keep as designed:**
  1. Scene separation (D-002). Nothing in this review needs it relaxed.
  2. Direct dragon control for the first slice (D-001), and I would strengthen
     the reasoning: the sprite contract's ground pivot is authored for a grounded
     dragon and no profile has mount or rider frames, so riding is an art project
     before it is a code project.
  3. Footprint-driven depth. `placeSanctuaryTiles()`, `placeDecor()`, and
     `Wyvern` already agree on it; do not churn it.
  4. Movement and lift on the update tick rather than tweens, for the
     `killAll()` reason the plan already gives.

- **Risks and edge cases:**
  1. **Galeclaw has `atlas: null`.** It renders through the `species-<id>` branch
     in `spawnSanctuaryResidents()` with origin (0.5, 0.85) and no aura, shadow,
     or idle animation. Milestone 2 plans to "reuse the existing shadow/label" —
     for this profile there is no shadow to reuse. Either restrict control to
     atlas-backed profiles or give the placeholder branch a shadow.
  2. **Recruited non-wyvern species land in that same branch.** `CLAUDE.md`
     already notes they cannot go on missions; free-roam raises the same question
     for the sanctuary and should answer it explicitly rather than by crash.
  3. **`RESIDENT_SPOTS.outside` has six entries** and the roster wraps past that
     with a ±14 px offset, so a wrapped resident can occupy the same cell as the
     controlled dragon.
  4. **`tweens.killAll()` is scene-wide**, so any tween-based interaction effect
     from Milestone 3 dies silently if a recruit happens mid-effect.

- **Suggested first vertical slice:** Narrower than Milestone 1 as written.
  Ship only: bounds with bias padding, cursor-anchored zoom at discrete stops,
  screen-locked backdrop, per-frame label rescale, and the gate moved to
  `pointerup` with click slop. No movement, no follow, no actor. That slice is
  independently verifiable against the existing Base → Vault flow and clears
  four of the five must-fix seams before anything depends on them.

- **Confidence / unknowns:** Source was read, not run. I did not execute
  `npm run dev` or `npm run check`, so nothing here is an observed-behavior
  claim — in particular the `roundPixels`/fractional-zoom stepping, the tile
  magnification shimmer, and how the painted atlas actually resolves at zoom 2.0
  are predictions from the code and should be confirmed in a browser during
  Milestone 1. I did not inspect `tileArt.js` drawing internals, `ui/roostPanel.js`,
  or the Vitest suite.

### Review R-003 — Claude Fable 5

- **Date:** 2026-07-18
- **Model ID:** AI-004
- **Focus:** Verification and accessibility (reviewer question 8), plus an
  executed run of the project's check gate. Deliberately narrow: R-001 and
  R-002 covered design and implementation seams; neither systematically
  answered question 8, and R-002 left its own gate unrun.
- **Files inspected:** `tests/wyvernAtlas.test.js`,
  `tests/wyvernPresentation.test.js`, `src/ui/roostPanel.js`, `src/ui/ui.css`,
  `package.json`, plus re-reads of `AtlasScene.js`, `Wyvern.js`, `main.js`.
- **Summary:** The check gate is green today — that is now an observed fact,
  not an assumption. But the entire automated test surface is wyvern-atlas
  shaped: two files, nine tests, all covering the sprite contract and
  presentation math. Nothing the free-roam initiative depends on — iso math,
  sanctuary data invariants, walkability — has a contract, and the plan's
  acceptance checklist has no accessibility line at all. The gaps below are
  additions to the plan's checklist and milestone exits, not code changes.
- **Executed verification (observed results, 2026-07-18):**
  - `npm run check:syntax` — pass, 35 modules.
  - `npm run validate:atlas` — 0 errors, 1 warning: Embertooth's 4096×4350
    page exceeds the portable 4096 px target. Pre-existing; confirms the
    budget constraint R-002 item 7 argued from the README.
  - `npx vitest run` — 9/9 pass (2 files).
  - `npx vite build` — pass, 37 modules transformed.
  - Environment caveat: run on a Linux copy of the worktree because the
    checked-in `node_modules` contains macOS-native bindings; the mounted
    worktree was not modified. Browser smoke test still **not run** — canvas
    behavior remains unverified, as `CLAUDE.md` itself warns.
- **Must fix before implementation:** None. Everything below is a
  verification-plan gap, not an implementation blocker.
- **Recommended changes:**
  1. **Add pure-data contract tests alongside the milestones, in the repo's
     own established pattern.** `wyvernAtlas.js` shows the house style:
     validate authored data with a pure module, test it without Phaser.
     Candidates, all pure today: (a) `gridToScreen`/`screenToGrid` round-trip
     — Milestone 2 promotes `screenToGrid` from "handy for click-to-move
     later" (its own comment) to load-bearing collision lookup, which is when
     it earns a test; (b) `RESIDENT_SPOTS` cells must be non-null, unblocked,
     prop-free — the data file claims this in comments, I hand-verified all
     six outside spots hold today, and Milestone 4's "tune layout" task is
     exactly when a silent regression would land; (c) once Milestone 3's
     `INTERACTIONS` list exists: unique ids, in-bounds cells, `kind` present
     in `DECOR_DRAWERS`, range positive; (d) the Milestone 2 walkable-mask
     builder, if written as a pure function of `tiles`, is testable before
     any scene wiring exists.
  2. **Add an accessibility line to the acceptance checklist: honor
     `prefers-reduced-motion`.** `grep` finds no reduced-motion handling
     anywhere in `src/`. The initiative adds camera lerp, cursor zoom, flight
     bob, and pulse affordances on top of the existing ambient tweens — this
     is the point where motion comfort becomes a real concern (D-003 says
     "validate motion comfort" but no checklist item enforces it). Cheap
     here: one `SANCTUARY` flag read from
     `matchMedia('(prefers-reduced-motion: reduce)')` that snaps the follow
     camera (no lerp) and skips ambient bob/flicker registration.
  3. **Add a keyboard/DOM-focus acceptance check.** `Wyvern` binds
     WASD/arrows/Space through Phaser's global keyboard plugin, and a
     sanctuary controller will do the same. `#ui-overlay` children take
     pointer events (`ui.css` lines 23–26) but nothing isolates *keyboard*
     input: world keys should not act while the user is clicking through the
     Roost panel, and Space is triple-booked — plan pan modifier, mission
     attack, and browser page-scroll. Checklist item: panel interaction never
     moves the dragon; movement keys never scroll the page.
  4. **Add a pointer-loss check to the manual route.** The atlas pan
     (`pointerup` handler, `AtlasScene.js`) has no handling for a pointer
     released outside the canvas/window; the sanctuary camera will inherit
     the pattern. Route step: start a drag, release the button outside the
     window, return — the camera must not still be glued to the cursor.
  5. **Pin the two open art/perf predictions to Milestone 1's exit.** R-002's
     `roundPixels` stepping and tile-magnification shimmer are one-minute
     browser checks once the camera exists. Add to the route: at a
     non-integer zoom, follow a moving dragon and watch tile edges and label
     glyphs for shimmer/stepping. Cheap to check, expensive to discover in
     Milestone 4.
  6. **Check the panel-bias assumption at one non-16:9 window size.** The
     canvas letterboxes inside `#game` (`Scale.FIT`) while the DOM panel
     positions against the window — at a wide window the panel can sit
     partly over the letterbox bar rather than the canvas, which changes how
     much world `panelBias` actually needs to clear. The checklist pins
     1280×720 only. One manual-route step at a very wide and a portrait-ish
     window catches it; I have not browser-verified the overlap myself.
  7. **Give the Milestone 4 performance item a number.** "Profile depth
     sorting" has no target. Propose: 60 fps sustained in follow mode at max
     zoom with 8 residents (one past the six authored spots, so wrap logic is
     live), measured with browser dev tools at Milestone 4 exit.
- **Keep as designed:**
  1. The check gate itself (`syntax → atlas → vitest → build`) is the right
     shape; nothing above requires changing it, only feeding it more
     contracts.
  2. Keeping HTML for panels and Phaser objects for world UI — the
     `pointer-events` split in `ui.css` already does the pointer isolation
     correctly; only keyboard isolation is missing.
- **Risks and edge cases:** Covered under recommendations 3, 4, and 6 — they
  are all "works on the dev machine, breaks on someone else's window/input"
  class failures, which is exactly what a multi-model project with no shared
  test hardware should push into checklists.
- **Suggested first vertical slice:** No change to R-002's proposal; this
  review adds exit criteria to it, not scope.
- **Confidence / unknowns:** The four gate results are observed. The
  letterbox/panel overlap (item 6) and pointer-loss behavior (item 4) are
  read from source and standard browser behavior, not run — treat both as
  "verify," not "known broken." I did not measure real fps anywhere.


### Decision log

Reviews can disagree. Preserve that disagreement in their review entries; only
the human project owner changes a decision status here.

| ID | Decision | Status | Source / reason |
| --- | --- | --- | --- |
| D-001 | First slice directly controls a roster wyvern; mounted riding remains deferred. | Provisional | Working interpretation of “free roaming on the dragons”; invite reviewer challenge. |
| D-002 | Base, Vault, Atlas, and Mission retain separate scene logic. | Accepted | Existing architecture guardrail in `CLAUDE.md`; low-level math may still be shared. |
| D-003 | Camera opens in Overview and supports Follow plus Inspect-scale zoom. | Proposed | Core plan; validate control conflicts and motion comfort through reviews and Milestone 1. |

## Delivery plan

### Milestone 1 — Camera foundation

- Make sanctuary bounds public from `sanctuaryRender.js`.
- Add a sanctuary camera controller with overview, follow, survey, cursor zoom,
  pan bounds, and panel-aware refitting.
- Add an unobtrusive controls hint.

**Exit:** wheel zoom, drag pan, reset, and panel collapse work without showing
outside the authored sanctuary or breaking the vault gate.

### Milestone 2 — One controllable wyvern

- Return resident handles (`{ animal, sprite, label, shadow, aura }`) from
  `spawnSanctuaryResidents()` without changing what non-controlled residents
  look like.
- Select the first authored roster wyvern by default; allow roster selection.
- Add normalized movement, flight lift, camera follow, and continuous depth
  sorting — reusing the resident's existing shadow/label instead of adding new
  ones, and disabling its bob tween while it is controlled.
- Prevent leaving walkable sanctuary cells.

**Exit:** a selected wyvern can roam the island smoothly at minimum and maximum
zoom; other residents remain visible and management buttons still work.

### Milestone 3 — Interaction vertical slice

- Add stable interaction data and a nearest/hover target system.
- Implement gate, spring, resident, training, and nest/feed interactions.
- Add `E` plus click/tap activation, range feedback, and action result text.
- Ensure clicking while dragging/panning never activates an object.

**Exit:** the player can complete one visible management action in-world and
enter the Vault without using the side panel.

### Milestone 4 — Living sanctuary and render pass

- Give non-controlled residents small bounded wander/idles.
- Add interaction reactions and action effects.
- Add foreground occluder fade, hover affordances, and label scaling rules.
- Tune layout sight lines and interaction spacing in `data/sanctuary.js`.

**Exit:** activity remains readable in overview and follow views, with no
obvious depth-order popping or resident overlap loops.

### Milestone 5 — Persistence and polish

- Save selected resident, camera preference, and completed one-time sanctuary
  interactions with the broader save/load work.
- Add controller/touch input only after keyboard/mouse behavior is stable.
- Add real sprite/prop audio and animation hooks without changing data IDs.

## Acceptance checklist

- [ ] The selected wyvern can traverse every intended sanctuary zone and
      cannot disappear into null tiles or cliffs.
- [ ] Overview, Follow, and Inspect distances are usable at 1280×720.
- [ ] Zoom is cursor-anchored and clamped; panel collapse does not jump to an
      invalid camera position.
- [ ] At least five in-world targets have clear hover/nearby feedback.
- [ ] `E` and click/tap trigger the same action path.
- [ ] Panning does not accidentally select or activate an interaction.
- [ ] Actor shadow, label, and depth all follow the ground footprint.
- [ ] Existing Base → Vault → Base and Base → Atlas → Mission flows still work.
- [ ] Recruiting an animal (which rebuilds the world) preserves a valid
      controlled selection and does not leave the camera in an invalid state.
- [ ] The VaultScene showcase is visually unchanged by the shared-helper edits.
- [ ] No sanctuary code imports an Atlas or Mission scene.
- [ ] JavaScript syntax checks pass and the browser console has no errors.

## Manual verification route

1. Start at Base and collapse/expand the panel at fit zoom.
2. Zoom in at each corner and at the controlled wyvern; confirm cursor anchoring.
3. Pan to every bound, reset, then toggle Follow and move diagonally.
4. Try island edges, cliffs, props, and the spring from valid/invalid range.
5. Activate each initial interaction with both keyboard and pointer.
6. Enter and leave the Vault, then launch and return from a mission.
7. Recruit an animal and confirm rebuild preserves a valid selected wyvern and
   camera state.

## Deferred decisions

- Mounted rider versus direct dragon control.
- Sanctuary combat or destructive interactions.
- Fully simulated schedules, needs, and NPC pathfinding.
- Free high-altitude flight over blocked cells.
- Mobile virtual controls and gamepad remapping.
- Unifying camera code across scenes; only extract low-level math if repetition
  becomes costly after the sanctuary version is proven.

## Handoff rule

Any AI or human implementing a milestone should update its status here, record
material decisions under the relevant section, and append a row to
[`AI_CONTRIBUTIONS.md`](../AI_CONTRIBUTIONS.md). Do not mark a milestone done
until its exit condition has been manually verified.
