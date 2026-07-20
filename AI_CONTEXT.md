# Shared AI Development Context

Wyvern Prototype is explicitly a **multi-AI-use project**. Codex, Claude,
Gemini, other models, and humans may collaborate on the same codebase. No model
is the sole owner of the design or implementation.

## Read order

1. `README.md` — product overview and how to run the prototype.
2. `CLAUDE.md` — despite its historical filename, this is the detailed,
   model-neutral architecture and repository convention reference.
3. `ROADMAP.md` — current product priorities.
4. `docs/SANCTUARY_FREE_ROAM_PLAN.md` — implemented sanctuary baseline and
   verification record.
5. `docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md` — implemented camera/projection
   engineering and the remaining directional-art acceptance work.
6. `docs/SANCTUARY_3D_DRAGON_PLAN.md` — scoped, owner-approved Three.js
   single-resident 3D rendering experiment (no camera/projection change).
7. `AI_CONTRIBUTIONS.md` — model registry and append-only work log.

## Collaboration contract

- Inspect current source and git status before changing anything; documentation
  may lag a work in progress.
- Preserve unrelated human or model changes in a dirty worktree.
- Keep Base, Vault, Atlas, and Mission scene logic separate. Share only small,
  low-level systems where the architecture already permits it.
- Keep the zero-build vanilla-JavaScript setup unless a human explicitly
  approves a toolchain change (see the 2026-07-20 Three.js approval recorded
  in `docs/SANCTUARY_3D_DRAGON_PLAN.md` — scoped to that one dependency and
  module, not a general license for further additions).
- Prefer small, playable milestones and verify scene transitions manually.
- Record new architectural decisions in the relevant plan or context file.
- After a material contribution, register the model if needed and append one
  contribution row to `AI_CONTRIBUTIONS.md`.
- Never guess a model version or claim another model's work. Use `unknown` and
  link evidence when attribution is incomplete.

## Current initiative

The sanctuary free-roam first slice is implemented through Milestone 4. Base
now has a sanctuary-specific overview/follow/survey camera, one directly
controlled roster wyvern, bounded ambient residents, authored world
interactions, and footprint-aware action rendering. Selection and camera state
survive scene travel in memory.

The rotatable-camera engineering in
`docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md` is implemented through Milestone 4.
Base retains zoom and pan while supporting three yaw endpoints
(`-45°`, `0°`, `+45°`) and lower/default/higher elevation. A pure projection
system drives view-aware terrain/props, bounds, residents, effects, and
inverse picking. Movement input is camera-relative while collision, range,
homes, and authored targets remain in logical world space. The rig and selected
wyvern survive rebuilds and Base scene travel in memory.

Milestone 5 remains open: configured wyvern atlases do not yet declare the
complete eight-direction Idle/Fly and Attack/Guard/Special frames required for
final visual acceptance. Runtime direction keys and east-facing fallback are
working; do not describe the directional-art milestone as complete. Treat
world direction, screen input, and sprite view-facing as separate values. Read
the full plan and `assets/sprites/wyverns/README.md` before changing `BaseScene`,
sanctuary systems, projection math, or wyvern exports.

Durable save/load, controller/touch input, audio, mounted riding, and a free
360°/3D camera remain deferred.

A separate, scoped experiment is planned in
`docs/SANCTUARY_3D_DRAGON_PLAN.md`: render exactly one Base-scene resident
(the controlled roster wyvern) as a Three.js 3D model instead of a 2D
sprite, to prove a 3D creature can move freely inside the existing 2D
isometric sanctuary. It does not touch the sanctuary camera/projection, and
does not affect Vault, Atlas, or Mission. Milestone 1 targets a small
untextured test mesh (no rig/animation); a later milestone swaps in a fully
rigged, animated dragon model.

## Verification baseline

Run the prototype with:

```bash
npm ci
npm run dev
```

Run the full local validation gate with:

```bash
npm run check
```

This checks JavaScript syntax, configured wyvern atlases, Vitest contracts, and
the production build. Gameplay changes also require a browser pass through
Base, Vault, Atlas, Mission, and back to Base, with no console errors.
