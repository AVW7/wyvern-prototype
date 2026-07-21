# 3D Wyvern Debug Panel — rebuild and deepen

**Status:** Milestone 1 planned, not started. Milestones 2–5 specified,
not started.

**Owner direction recorded:** 2026-07-21 — *"better create the 3D Wyvern Debug
panel to be able to test all the built-in movements and actions of the wyvern,
we can also develop more in terms of the existing quality."*

**Predecessor / sibling plans:**
[`SANCTUARY_3D_DRAGON_PLAN.md`](SANCTUARY_3D_DRAGON_PLAN.md) — this plan
continues its Milestone 3 (*"the debug panel gained a live motion readout and a
clip picker"*) and owns the panel from here on;
[`SANCTUARY_ROTATABLE_CAMERA_PLAN.md`](SANCTUARY_ROTATABLE_CAMERA_PLAN.md) —
untouched by this plan;
[`UI_REDESIGN_PLAN.md`](UI_REDESIGN_PLAN.md) — the panel's CSS lives in the
same `src/ui/ui.css` it governs.

**Primary files:** `src/ui/testPanel.js` (replaced), `src/systems/sanctuary3D.js`,
`src/systems/dragonMotion.js`, `src/systems/sanctuaryMovement.js`,
`src/scenes/BaseScene.js`

**Project mode:** Multi-AI collaboration

---

## Purpose

Make the 3D dragon's every built-in movement and action reachable, observable,
and tunable from one panel — so the remaining animation and terrain work is
settled by eye in the browser instead of by editing `config.js` and reloading.

The panel is a development instrument, not a player-facing feature. It is
nonetheless mounted in every build (see TD-009), which is a deliberate owner
decision, not an oversight.

## Current state

`src/ui/testPanel.js` — 307 lines, built in Milestone 3 of the 3D dragon plan.

| Area | Implemented today | New in this plan |
| --- | --- | --- |
| Construction | One `innerHTML` template string; every control reached through global `document.getElementById`, so ids like `clip-name` collide with any other panel | Declarative schema → lil-gui folders, all queries scoped to the panel root |
| Actions | 6 hardcoded buttons (`idle`, `walk`, `fly`, `attack`, `dracarys`, `special`) against an 18-slot clip table | Every slot from `sanctuary3D.listMotionSlots()`, split into base loops vs one-shots |
| Motion tuning | **None** — `config.js` claims *"every value is live-tunable from the debug panel"*; it is not | All 16 `SANCTUARY.dragon3D.motion` keys, live |
| Playback | None | Pause, frame step, scrub, per-slot loop mode and timeScale, crossfade |
| Movement | An altitude slider that teleports (Finding B) | Fly toggle, walk-to-tile, five canned test routes, speed multiplier |
| Inspection | Wireframe toggle | Skeleton, bounds, axes, turntable, free-orbit camera |
| Perf | None | Stats FPS/MS/MB + `renderer.info` counters |
| Persistence | None — every `buildWorld()` rebuild resets all tuning | Session-scoped store + copy-to-clipboard export |
| Tests | **None** | Pure schema module under vitest, plus a jsdom mount/destroy test |

## Non-goals

- Player-facing UI. This panel is not designed, localised, or made responsive.
- Changing `sanctuaryProjection.js` or the 2D camera rig.
- Persisting tuning to disk or `localStorage` (TD-011). Tuned values leave via
  the clipboard and are pasted into `config.js` by a human — the same workflow
  the clip picker already uses.
- Replacing the Phaser-side roster/HUD panels (`roostPanel.js`, `atlasPanel.js`,
  `vaultPanel.js`). They are unrelated and untouched.
- Gameplay meaning for any of the driven movements. The canned routes exercise
  animation, they are not AI behaviour.

## Findings this plan fixes

These were verified against the current source on 2026-07-21. Any model picking
this up should re-verify rather than trust the line numbers.

### Finding A — base-motion overrides fire as one-shots

`testPanel.js:267` sets `scene.testOverrideAction`; `BaseScene.js:175` forwards
it to `sanctuary3D.setMotion()`; `sanctuary3D.js:1820` passes that same value
into `dragonMotion.update({ action })`; `dragonMotion.js:139` treats any
*changed* `action` as a one-shot. So clicking **Walk** or **Fly** plays the clip
once through `playOneShot()` before the base override takes effect.

One override channel is carrying two different meanings. Split it: `setMotion()`
sets a base override only and is no longer forwarded as `action`;
a new `triggerAction()` queues a one-shot. `BaseScene.update()` keeps sending
genuine gameplay actions through the action channel.

### Finding B — the altitude slider teleports

`setAltitude()` assigns `altitude` **and** `targetAltitude` together, so the
climb is instantaneous.

Corrected 2026-07-21 during implementation: the first draft of this finding
claimed takeoff and landing therefore never fire. That is wrong, and a test
written to guard it failed. They *do* fire — `wantsAir` in
`dragonMotion.js:148` keys off `targetAltitude`, which a snap sets just the
same. The real defect is that the model is already at altitude on the frame the
takeoff clip starts, so the clip animates a climb that has already happened,
and `verticalSpeed` never registers, so the nose never pitches into it.

Fix: `setTargetAltitude(alt)` sets only the target and lets `update()`'s
existing ease carry the model there. `setAltitude()` stays for callers that
genuinely want a snap. Covered by *flight altitude drives the 3D takeoff/land
bracket* in `tests/sanctuaryMovement.test.js`, which drives the real controller
into the real state machine rather than trusting either in isolation.

### Finding C — `dragonMotion` config is frozen at construction

`dragonMotion.js:63-64` copies `{...DEFAULTS, ...motion}` once. Add
`setConfig(patch)` merging into the live config object so the motion block is
tunable mid-run, which is what makes the `config.js:168` comment true.

## Reuse — do not reinvent these

| Need | Already exists |
| --- | --- |
| Pathfinding for canned routes | `findPath()`, `nearestWalkable()`, `createWalkableMask()` — exported from `src/systems/sanctuaryMovement.js:209/193/93`; hand the result to `movement.setPath()` (`:736`) |
| Free-orbit camera | `enableFreeCamera()`, `orbitBy()`, `panBy()`, `zoomBy()`, `resetCamera()` — `sanctuary3D.js:1536-1610`, currently only wired for Vault |
| Motion readout | `getMotionState()` — `sanctuary3D.js:2132` |
| Clip listing / rebinding | `listClips()`, `listMotionSlots()`, `setClip()` — `sanctuary3D.js:2123-2176` |
| Live tuning dispatch | `setTuning(param, value)` — `sanctuary3D.js:1613-1696` |
| Session-scoped state pattern | `SANCTUARY_SESSION` — `BaseScene.js:46` |
| Root-motion drift audit | `tools/prep-drogon.mjs` already prints per-clip `sway`/`net` |

## Toolchain note — no new dependency

lil-gui and Stats are **already vendored inside the approved `three` package**:

- `three/addons/libs/lil-gui.module.min.js` (v0.17.0)
- `three/addons/libs/stats.module.js`

The `three/addons/*` alias is already in use at `sanctuary3D.js:2-3`. Import
from there. **Do not** add `lil-gui` or `stats.js` to `package.json` — that
would trip the `CLAUDE.md` no-new-dependency guardrail for no benefit.

## Architecture and file ownership

| File | Role |
| --- | --- |
| `src/ui/debugPanelSchema.js` (new, **pure**) | Declarative control descriptors `{ folder, label, param, min, max, step, digits }` for every `setTuning` knob and every `SANCTUARY.dragon3D.motion` key; the session tuning store; `serializeTuning()` emitting a `config.js`-shaped block. No DOM, no lil-gui, no `three` import — this is what the tests exercise. |
| `src/ui/debugPanel.js` (new) | `createDragonDebugPanel(scene, sanctuary3D)` → `{ destroy() }`. Same signature as the factory it replaces. Walks the schema into lil-gui folders, mounts Stats, runs the readout poll, wires actions/transport/drive/inspection. The only file importing lil-gui or Stats. |
| `src/ui/testPanel.js` | **Deleted.** |
| `src/scenes/BaseScene.js` | Import/factory rename at `:40`/`:247`; re-applies stored tuning after `createSanctuary3D()`; `setMotion`/`triggerAction` split at `:175`. |
| `src/systems/sanctuary3D.js` | New API: `triggerAction()`, `setMotionTuning()`, `getClipTransport()`, `setClipTime()`, `setPaused()`, `stepFrames()`, `setSlotLoop()`, `getRenderStats()`, inspection-helper toggles. |
| `src/systems/dragonMotion.js` | `setConfig(patch)` (Finding C). Stays pure — no `three`, no DOM. |
| `src/systems/sanctuaryMovement.js` | `setTargetAltitude(alt)` (Finding B). |
| `src/ui/ui.css` | `.test-panel*` rules (`:1179-1349`) removed; a small block scopes `.lil-gui` to the game palette and pins the Stats canvas. |
| `tests/debugPanelSchema.test.js` (new) | Schema integrity + serializer round-trip. |
| `tests/debugPanel.dom.test.js` (new) | jsdom mount/destroy; no leaked intervals, no duplicate root. |

---

## Delivery plan

### Milestone 1 — Panel rebuild (lil-gui + Stats)

Folders: **Status**, **Actions**, **Environment**, **Terrain**, **Session**.

- Port every control that exists today off the schema instead of hand-wiring:
  scale, animation speed, wireframe, sun, ambient, exposure, AO, jitter, fog
  on/near/far, water speed, lava glow, reset world.
- **Status** extends the existing 4 Hz poll (`testPanel.js:184`, deliberately
  polled so the render loop stays free of DOM writes — keep that property) with
  movement state (`isMoving`, `isFlying`, `state`, footprint, altitude vs
  target, ground speed) and `renderer.info` counters, beside the Stats panel.
- **Actions** buttons generated from `listMotionSlots()`, split by
  `SANCTUARY.dragon3D.oneShotClips` — all 18 slots reachable, not 6.
- Fix **Finding A**.
- Tuning store survives `buildWorld()`; **Session** folder gets *Copy tuning
  JSON* and *Reset to config defaults*.

**Exit criteria:** every control that worked before still works; all 18 slots
play; a base loop no longer double-fires as a one-shot; tuning survives a world
rebuild; `npm run check` green with the two new test files.

### Milestone 2 — Playback transport, clip bindings, live motion tuning

- **Playback:** pause (`mixer.timeScale = 0`), step ±1 frame, scrub `action.time`
  against clip duration, per-slot loop mode
  (`LoopOnce`/`LoopRepeat`/`LoopPingPong`), per-slot `timeScale`, crossfade ms.
- **Clip bindings:** keep the existing picker but preselect the *currently
  bound* clip, show clip duration and the root-motion drift figure, and add
  *Copy clips table* emitting the whole `clips: { … }` block for `config.js:138`.
- Fix **Finding C**; the **Motion** folder then drives all 16 motion keys.
  Extend `tests/dragonMotion.test.js` to assert a mid-run
  `setConfig({ maxYawRateDeg })` changes the very next update's yaw step.

**Exit criteria:** any clip can be paused, scrubbed and single-stepped; a motion
slider changes behaviour on the next frame, not the next reload.

### Milestone 3 — Drive the wyvern

The core of the owner's ask: exercise every built-in movement without a keyboard.

- Fly toggle → `movement.setFlying()`; fix **Finding B** so the altitude slider
  commands an eased climb and the takeoff/land bracket actually fires.
- *Walk to col/row* → `findPath()` + `movement.setPath()`.
- Canned routes, each just a path handed to `setPath()`:

  | Route | Exercises |
  | --- | --- |
  | Square patrol | `walk` + 90° turn clips |
  | Figure-eight | `walkLeft`/`walkRight` blending |
  | Takeoff → circle → land | `takeoff`, `bankLeft`/`bankRight`, `land` |
  | Turn sweep (20°/90°, both ways) | `turnLeftSmall`…`turnRight` |
  | Speed ramp | walk `timeScale` matching across `walkTimeScale.min..max` |

- Speed multiplier over `SANCTUARY.movement.speed`; teleport to nearest
  walkable; reset to spawn.
- **Inspection:** `SkeletonHelper`, `Box3Helper`, `AxesHelper`, turntable
  auto-yaw, and free-orbit in Base via the existing camera methods, with a
  toggle that hands control back to the follow camera.

**Exit criteria:** each of the 18 clips can be provoked through actual movement,
not only by forcing the slot; flight brackets correctly from the panel.

### Preset vocabulary (owner-requested, 2026-07-21)

*"make sure all the presets like fly, scout, hunt, attack, attack with fire,
fly attack, fly attack with fire are presets that we can improve if need"*

A preset is a named combination of **base clip + altitude + optional one-shot +
optional particle effect** — not a new clip type. The key finding is that
**fire is a particle effect the game spawns over a clip**, never baked into
one: `dracarys` already plays `Skill08` *and* calls `createDracarysParticles()`
(`sanctuary3D.js`). So every "with fire" preset is its plain counterpart plus
the emitter.

| Preset | Base clip | Altitude | One-shot | Fire |
| --- | --- | --- | --- | --- |
| fly | `fly` (SkyMoveL/R, banked) | cruise | — | no |
| scout | `scout` (SkyMoveR01, level) | high | — | no |
| hunt | `alert` → `walk` | ground | — | no |
| attack | `idle`/`alert` | ground | `attack` / `attackAlt` | no |
| attack with fire | `idle`/`alert` | ground | `dracarys` | **yes** |
| fly attack | `fly` | cruise | `flyAttackLeft`/`Right` | no |
| fly attack with fire | `fly` | cruise | `flyAttackLeft`/`Right` | **yes** |

`hunt` and the ground attacks compose from clips already shipping; `scout` and
the fly attacks needed the Milestone 4 clip additions below. Implementing the
preset table itself (a pure module plus a **Presets** folder in the panel) is
the remaining piece.

### Milestone 4 — Clip/asset pipeline *(done 2026-07-21)*

Re-ran the pipeline against the source FBX; the shipped GLB now carries **22
clips, 11.1 MB** (was 16 clips, 9.9 MB).

**How the aerial clips were identified.** The pelvis (`Bip002`) never leaves
z≈414 in any of the 52 source clips — the rig animates in place and lets the
engine move the character — so height cannot separate a ground clip from an
airborne one. Measuring the **toe tip's drop relative to the pelvis** does:

| Band | Mean drop | Clips |
| --- | --- | --- |
| Grounded | 270–390 | Stand, Watch, Turn20/90/180, Attack01–03 |
| Walking | 433–469 | Walk, WalkL, WalkR |
| Airborne | 567–760 | SkyMoveL/R/R01, Up, Down, Down02, **Skill10_L/R**, **Skill11_L/R** |

Rendered stills at mid-clip confirmed each candidate by eye.

**Added:** `SkyMoveR01` (scout), `Skill10_L`/`Skill10_R` (fly attack),
`Attack01` (second ground attack), `TurnL180`/`TurnR180` (about-face).

**Deliberately excluded:** `Skill11_L/R` — keyframe-identical to `Skill10_L/R`
(same foot-drop to one decimal, same key counts). Fire is an effect, not a clip.

**Size.** At the original `resample({tolerance: 1e-4})` the 22 clips came to
19.8 MB (animation data 13.7 MB). Loosening to `1e-3` gives 11.1 MB with no
visible degradation. Animation keyframes are ~90% of this file; mesh and
textures are only 1.4 MB combined.

**Reproducing.** `@gltf-transform` is not in `node_modules`. The source is now
only `Dragon.fbx` (the 121 MB intermediate GLB is gone), so the FBX→GLB step
runs in Blender first (`bpy.ops.import_scene.fbx` → prune actions to `KEEP` →
`bpy.ops.export_scene.gltf`), then `tools/prep-drogon.mjs` does material
conversion, texture compression, resampling and quantisation.

### Milestone 4 — original scope

Widen `KEEP` in `tools/prep-drogon.mjs:21-38` (hover, glide, further roars,
damage reactions, alternate skills) guided by the drift audit the tool already
prints, re-run against
`~/Downloads/drogon-game-of-thrones-dragon/source/Dragon.fbx` via `npx`
(`@gltf-transform` is not in `node_modules`), then settle the remaining
slot↔clip guesses in `config.js:138-159` using the Milestone 2 picker.

**`KEEP` and the `clips` table must change together** — already documented at
`config.js:135`. Watch the GLB budget: currently 9.9 MB.

**Exit criteria:** every motion slot is bound to a clip chosen by eye rather
than guessed; no slot silently falls back to `idle`; GLB stays within budget.

### Milestone 5 — Terrain / render quality

Extend the schema past today's knobs: shadow bias/radius/map size, tone-mapping
operator select, hemisphere sky/ground colours, fog colour, and a `terrain3D`
block export in the same copy-JSON form.

**Exit criteria:** the whole `SANCTUARY.terrain3D` block is reachable from the
panel and exportable back into `config.js`.

## Known, accepted risks

- **The panel ships in production builds** (TD-009). Accepted owner decision.
- **Two WebGL contexts** (Phaser + Three.js) already run simultaneously; the
  Stats panel and inspection helpers add a little more per-frame cost. The
  helpers are opt-in and off by default.
- **Canned routes depend on the walkable mask**, which is seed-derived. A route
  that cannot be pathed must fail visibly in the readout, not silently do
  nothing.
- **lil-gui is vendored inside `three`**, so a future `three` bump could move or
  drop it. If that happens, vendor the file into `src/ui/` rather than adding a
  dependency.

## Acceptance checklist

- [ ] Every control present in the old panel still works.
- [ ] All 18 motion slots are reachable from **Actions**.
- [ ] A base-loop override no longer fires a one-shot first (Finding A).
- [ ] The altitude slider produces an eased climb with takeoff/land (Finding B).
- [ ] A motion slider takes effect on the next frame (Finding C).
- [ ] Each canned route provokes its intended clips.
- [ ] Tuning survives a `buildWorld()` rebuild; *Copy tuning JSON* round-trips
      through `config.js`.
- [ ] No duplicate panel, renderer, or orphaned canvas after a rebuild.
- [ ] Vault, Atlas, and Mission are unaffected.
- [ ] Zero browser console errors throughout.
- [ ] `npm run check` green; no regression to the existing tests.

## Verification matrix

Manual browser route (1280×720), after each milestone:

1. `npm run dev`, enter Base. Panel mounts exactly once; Stats reads a stable
   FPS; console clean.
2. Click every **Actions** button; confirm each slot plays and one-shots return
   to the base motion.
3. Pause, scrub, and single-step a clip; confirm the readout tracks.
4. Run each canned route; confirm the intended clips appear in the readout.
5. Drag a **Motion** slider mid-turn; confirm the change lands immediately.
6. *Reset World* (or recruit) — tuning survives, nothing duplicates.
7. Enter Vault → Atlas → Mission → back to Base; no 3D canvas leaks.
8. Resize the window; canvas stays aligned via the `--stage-*` vars.
9. *Copy tuning JSON* → paste into `config.js` → reload → identical look.
10. `npm run check`.

## Decision log

Only the human project owner changes final decision statuses.

| ID | Decision | Status | Source / reason |
| --- | --- | --- | --- |
| TD-008 | Build the panel on lil-gui + Stats, imported from `three/addons/libs/` rather than added to `package.json`. | Owner approved | Owner approved lil-gui + stats.js on 2026-07-21; both ship inside the already-approved `three`, so no new dependency and no new toolchain exception is required. |
| TD-009 | The panel stays mounted in every build, not dev-gated. | Owner decided | Direction recorded 2026-07-21; lets a production build be debugged. |
| TD-010 | Scope covers the motion system, the clip/asset pipeline, and terrain/render knobs — not the panel alone. | Owner decided | Direction recorded 2026-07-21. |
| TD-011 | Tuning is session-scoped plus clipboard export; no `localStorage`. | Owner decided | Matches the existing "paste the winning pairs back by hand" workflow; avoids the repo's first stale-persisted-state failure mode. |
| TD-012 | `src/ui/testPanel.js` is replaced, not extended. | Proposed | Its global-id/`innerHTML` construction is the root of the collision and test-coverage problems. |

## Multi-model review workspace

Reviews are append-only. `R-001`–`R-008` are recorded across the predecessor
plans; the next review here is **R-009**.

Reviewers should focus on:

1. Whether the `setMotion` / `triggerAction` split (Finding A) is the right cut,
   or whether the override channel should be removed from `dragonMotion`'s input
   entirely and handled only in `sanctuary3D`.
2. Whether `setTargetAltitude` (Finding B) can desynchronise `isFlying` from the
   altitude state in any ordering.
3. Whether live `setConfig` on `dragonMotion` (Finding C) breaks the module's
   purity contract or its test determinism.
4. The canned-route design — whether pushing paths through `setPath()` really
   exercises the turn/bank clips, or whether it needs direct heading control.
5. Whether the schema abstraction earns its keep, or whether it is indirection
   over what could be a flat list of lil-gui calls.
6. lil-gui's lifecycle under repeated `buildWorld()` rebuilds — destroy
   correctness, listener leaks, and the poll interval.

### Copyable review prompt

```text
Review docs/WYVERN_DEBUG_PANEL_PLAN.md as a senior Three.js / Phaser 3 tools
engineer. First read AGENTS.md, AI_CONTEXT.md, CLAUDE.md, this whole plan, and
the current source (src/ui/testPanel.js, src/systems/sanctuary3D.js,
src/systems/dragonMotion.js, src/systems/sanctuaryMovement.js,
src/scenes/BaseScene.js). Do not implement the feature. Re-verify Findings A, B
and C against the source rather than trusting this plan's line numbers.
Challenge the setMotion/triggerAction split, the schema abstraction, the canned
test routes, lil-gui destroy/leak correctness, and the milestone ordering.
Distinguish must-fix issues from optional polish. Append your response as the
next review in this plan, preserve all prior reviews and decision statuses, and
append your work to AI_CONTRIBUTIONS.md.
```

### Review template

```md
### Review R-### — Model/product

- **Date:** YYYY-MM-DD
- **Model ID:** AI-###
- **Focus:** Panel / motion system / assets / full plan
- **Files inspected:** `path`, `path`
- **Summary:** One short paragraph.
- **Must fix before implementation:** Concrete issues, or `None`.
- **Recommended changes:** Ordered recommendations with reasons.
- **Keep as designed:** Decisions that should not churn.
- **Risks and edge cases:** Failure modes and how to test them.
- **Suggested first vertical slice:** Smallest working implementation.
- **Confidence / unknowns:** What was not verified.
```

### Recorded reviews

_None yet. Next id: R-009._

## Handoff rule

Before material implementation:

1. Read `AI_CONTEXT.md`, `CLAUDE.md`, this whole plan, and the current source
   for `testPanel.js`, `sanctuary3D.js`, `dragonMotion.js`,
   `sanctuaryMovement.js`, and `BaseScene.js`.
2. Re-verify Findings A, B and C against the source before changing anything.
3. Inspect the current dirty worktree and preserve unrelated changes.
4. Implement **one milestone at a time**; do not touch a later milestone's
   files. Update the active milestone's status here rather than reopening a
   completed one.
5. Keep owner decision statuses unchanged unless the owner explicitly changes
   them.
6. Run `npm run check` before handoff, plus the manual verification matrix.
7. Append the exact model and contribution to `AI_CONTRIBUTIONS.md`.
