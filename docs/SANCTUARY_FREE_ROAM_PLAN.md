# Sanctuary Free-Roam Redesign

**Status:** Implemented and closed — Milestones 1–4 browser-verified

**Project mode:** Multi-AI collaboration  
**Last updated:** 2026-07-18  
**Primary scene:** `src/scenes/BaseScene.js`

**Follow-up plan:** [`SANCTUARY_ROTATABLE_CAMERA_PLAN.md`](SANCTUARY_ROTATABLE_CAMERA_PLAN.md)

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

## Follow-up work

The owner-requested camera yaw/elevation and directional-art expansion is a
separate initiative because this free-roam plan is already implemented. Use
[`SANCTUARY_ROTATABLE_CAMERA_PLAN.md`](SANCTUARY_ROTATABLE_CAMERA_PLAN.md) as
the canonical source for all new camera, projection, movement-direction, and
sprite work. Do not reopen the completed milestones below.

## Implemented baseline and remaining gaps

- `BaseScene` now orchestrates an explorable exterior: selected-resident
  control, ambient wanderers, camera modes, authored targets, world prompts,
  roster actions, and the existing scene transitions.
- `buildSanctuaryView()` exposes additive `{ bounds, tiles }` data while keeping
  `VaultScene` compatible. `spawnSanctuaryResidents()` returns the live sprite,
  aura, shadow, label, selection ring, tween, and footprint handles needed by
  movement and interaction systems.
- `INTERACTIONS.outside` provides stable gate, spring, training, nest/feed, and
  atlas descriptors. Resident targets are added from the live roster without
  changing the authored map contract.
- Exterior base-height cells are walkable. Null cells and raised shelves are
  cliffs; ramps and free high-altitude traversal remain deferred. Reachability
  tests keep every initial resident and landmark on the main connected ground.
- Selection, camera mode/view, and panel collapse survive in-memory scene
  travel and world rebuilds. Durable save/load and completed one-time target
  persistence remain deferred follow-up work.
- The implementation remains sanctuary-specific and imports no Atlas or
  Mission scene logic.

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

## Implemented architecture

| Concern | Owner | Responsibility |
| --- | --- | --- |
| Scene orchestration | `BaseScene.js` | Build/reset world, choose controlled wyvern, call update systems, transition scenes |
| Camera | `systems/sanctuaryCamera.js` | Fit bounds, follow/survey modes, cursor zoom, pan, panel bias, reset view |
| Residents | `systems/sanctuaryRender.js` | Return `{ animal, sprite, label, shadow, aura, selectionRing, footprint }` handles |
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

### Implemented baseline

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

- **Rebuild/session regression.** `BaseScene.buildWorld()` now preserves the
  controlled selection and camera view across recruit rebuilds and scene
  travel. Future changes must keep that capture/restore path and lifecycle test.
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

This workspace is now historical. New camera/projection reviews continue in
[`SANCTUARY_ROTATABLE_CAMERA_PLAN.md`](SANCTUARY_ROTATABLE_CAMERA_PLAN.md),
starting with `R-003`.

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
ideas. Preserve prior reviews and decisions. This plan is implemented and
closed; use docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md for new camera work.
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

### Review R-001 — Codex (GPT-5)

- **Date:** 2026-07-18
- **Model ID:** AI-002
- **Focus:** Rotatable camera, isometric movement, sanctuary sprite contract
- **Files inspected:** `AI_CONTEXT.md`, `CLAUDE.md`,
  `docs/SANCTUARY_FREE_ROAM_PLAN.md`, `src/systems/sanctuaryCamera.js`,
  `src/systems/sanctuaryMovement.js`, `src/systems/sanctuaryRender.js`,
  `src/systems/wyvernAtlas.js`, `src/scenes/PreloadScene.js`,
  `assets/sprites/wyverns/README.md`
- **Summary:** The owner-directed 90° camera range is feasible only as a
  projection/rendering feature, not a flat canvas rotation. Logical movement
  is already eight-directional and the runtime already registers directional
  animation keys; the next slice must separate world direction from view
  facing, add view-aware terrain/props, and supply real directional art.
- **Must fix before implementation:** Define the projection/inverse-projection
  seam; preserve a stable world footprint; avoid `Phaser.Camera.rotation` as
  the yaw implementation; budget atlas pages before commissioning full action
  turntables; keep `E` reserved for interaction.
- **Recommended changes:** Prototype three yaw headings and three elevation
  steps; complete eight-direction Idle/Fly first; derive `viewDirection` after
  projection; then add directional Attack/Guard/Special and finish action
  acceptance.
- **Keep as designed:** Scene separation, footprint-based collision/range/depth,
  Overview/Follow/Survey modes, cursor zoom, panel-aware framing, and
  placeholder fallback behavior.
- **Risks and edge cases:** Camera-relative input reversal, pointer mismatch,
  incorrect depth after yaw, single-view prop art, labels rotating with the
  world, rebuild state loss, and atlas/GPU memory limits.
- **Suggested first vertical slice:** Reproject a small prop-free sanctuary
  test patch at `-45°`, `0°`, and `+45°`; move one dragon through all eight
  world directions using complete directional Idle/Fly art; then add props,
  interactions, and the full map.
- **Confidence / unknowns:** High confidence in the current runtime and asset
  gaps. Exact pitch range, continuous-versus-stepped transitions, and final
  input bindings require owner playtesting.

### Review R-002 — Codex (GPT-5)

- **Date:** 2026-07-18
- **Model ID:** AI-002
- **Focus:** Plan separation and multi-model handoff
- **Files inspected:** `AI_CONTEXT.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
  `docs/SANCTUARY_FREE_ROAM_PLAN.md`,
  `docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md`,
  `assets/sprites/wyverns/README.md`
- **Summary:** The implemented free-roam plan and planned rotatable-camera work
  should not share milestone status. The predecessor now remains the closed
  implementation record, while the new plan is the canonical source for yaw,
  elevation, projection, camera-relative movement, and directional art.
- **Must fix before implementation:** Route every model entry point and core
  handoff document to the new plan; do not mark camera yaw/elevation as part of
  the completed predecessor.
- **Recommended changes:** Use the new plan's independent milestones, decision
  IDs, acceptance matrix, and review workspace; preserve `R-001` and this
  review here as historical context.
- **Keep as designed:** The implemented free-roam architecture, verified
  acceptance checklist, scene separation, footprint contract, and existing
  contribution history.
- **Risks and edge cases:** Two active plans would cause status drift,
  duplicated decisions, conflicting implementation sequences, and false
  claims that yaw/elevation already exist.
- **Suggested first vertical slice:** Follow Milestone 1 in the new plan: pure
  projection round trips and a small prop-free view at the nine proposed
  yaw/elevation combinations.
- **Confidence / unknowns:** High confidence in the documentation split. The
  exact pitch range and stepped-versus-continuous controls remain owner choices.

### Decision log

Reviews can disagree. Preserve that disagreement in their review entries; only
the human project owner changes a decision status here.

| ID | Decision | Status | Source / reason |
| --- | --- | --- | --- |
| D-001 | First slice directly controls a roster wyvern; mounted riding remains deferred. | Provisional | Working interpretation of “free roaming on the dragons”; invite reviewer challenge. |
| D-002 | Base, Vault, Atlas, and Mission retain separate scene logic. | Accepted | Existing architecture guardrail in `CLAUDE.md`; low-level math may still be shared. |
| D-003 | Camera opens in Overview and supports Follow plus Inspect-scale zoom. | Proposed | Core plan; validate control conflicts and motion comfort through reviews and Milestone 1. |
| D-004 | Expand sanctuary camera yaw to at least 90° total, 45° left/right from the current heading. | Owner requested; implementation pending | Human request on 2026-07-18. |
| D-005 | Interpret camera up/down as elevation/pitch in addition to existing vertical survey pan. | Proposed interpretation | Clarifies the 2026-07-18 request; exact range still needs owner playtesting. |
| D-006 | Preserve eight-direction logical movement and derive camera-relative sprite facing after yaw. | Owner requested; implementation pending | Movement already has eight sectors; projection/art integration remains. |
| D-007 | Require full eight-direction Idle/Fly first, then Attack/Guard/Special before final rotatable-camera acceptance. | Proposed | Stages art cost while preventing action-facing snaps in the completed feature. |

`D-004` through `D-007` are preserved as historical records from before the
plan split. Their active counterparts are `RC-001` through `RC-005` in
[`SANCTUARY_ROTATABLE_CAMERA_PLAN.md`](SANCTUARY_ROTATABLE_CAMERA_PLAN.md).

## Delivery plan

### Milestone 1 — Camera foundation

**Status:** Implemented and browser-verified at 1280×720 on 2026-07-18.

- Make sanctuary bounds public from `sanctuaryRender.js`.
- Add a sanctuary camera controller with overview, follow, survey, cursor zoom,
  pan bounds, and panel-aware refitting.
- Add an unobtrusive controls hint.

**Exit:** wheel zoom, drag pan, reset, and panel collapse work without showing
outside the authored sanctuary or breaking the vault gate.

### Milestone 2 — One controllable wyvern

**Status:** Implemented and browser-verified at 1280×720 on 2026-07-18.

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

**Status:** Implemented and browser-verified at 1280×720 on 2026-07-18.

- Add stable interaction data and a nearest/hover target system.
- Implement gate, spring, resident, training, and nest/feed interactions.
- Add `E` plus click/tap activation, range feedback, and action result text.
- Ensure clicking while dragging/panning never activates an object.

**Exit:** the player can complete one visible management action in-world and
enter the Vault without using the side panel.

### Milestone 4 — Living sanctuary and render pass

**Status:** Implemented and browser-verified at 1280×720 on 2026-07-18.

- Give non-controlled residents small bounded wander/idles.
- Add interaction reactions and action effects.
- Add foreground occluder fade, hover affordances, and label scaling rules.
- Tune layout sight lines and interaction spacing in `data/sanctuary.js`.

**Exit:** activity remains readable in overview and follow views, with no
obvious depth-order popping or resident overlap loops.

### Milestone 5 — Persistence and polish

**Status:** Deferred as designed; only in-memory scene-session preservation is
included in the implemented slice.

- Save selected resident, camera preference, and completed one-time sanctuary
  interactions with the broader save/load work.
- Add controller/touch input only after keyboard/mouse behavior is stable.
- Add real sprite/prop audio and animation hooks without changing data IDs.

## Acceptance checklist

- [x] The selected wyvern can traverse every intended sanctuary zone and
      cannot disappear into null tiles or cliffs.
- [x] Overview, Follow, and Inspect distances are usable at 1280×720.
- [x] Zoom is cursor-anchored and clamped; panel collapse does not jump to an
      invalid camera position.
- [x] At least five in-world targets have clear hover/nearby feedback.
- [x] `E` and click/tap trigger the same action path.
- [x] Panning does not accidentally select or activate an interaction.
- [x] Actor shadow, label, and depth all follow the ground footprint.
- [x] Existing Base → Vault → Base and Base → Atlas → Mission flows still work.
- [x] Recruiting an animal (which rebuilds the world) preserves a valid
      controlled selection and does not leave the camera in an invalid state.
- [x] The VaultScene showcase is visually unchanged by the shared-helper edits.
- [x] No sanctuary code imports an Atlas or Mission scene.
- [x] JavaScript syntax checks pass and the browser console has no errors.

Verification record: a 1280×720 Chrome pass exercised keyboard movement,
wheel zoom, Home reset, panel collapse/expand, keyboard and pointer actions,
resident selection, Base ↔ Vault, Base → Atlas → Mission → Base, atlas-marker
confirmation, and recruit-triggered rebuild. The run produced no JavaScript
runtime or console API errors. The existing placeholder path handled atlas
image failures in the headless renderer; the command-line validator retains
its documented Embertooth portability warning.

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

This implemented plan is closed. Preserve its milestone statuses, acceptance
record, reviews, and decisions. New camera/projection implementation belongs in
[`SANCTUARY_ROTATABLE_CAMERA_PLAN.md`](SANCTUARY_ROTATABLE_CAMERA_PLAN.md).
Persistence work remains a broader roadmap item. Every material contribution
still requires an append-only row in
[`AI_CONTRIBUTIONS.md`](../AI_CONTRIBUTIONS.md).
