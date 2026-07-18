# AI Contribution Registry

This project intentionally uses multiple AI systems. This file makes that work
visible without treating any model as the sole author.

## Count

- **Distinct contributing model entries:** 5
- **Providers represented:** 3
- **Contribution records:** 11


Counts include only models with a concrete contribution and evidence. Gemini
contributed on 2026-07-18 (AI-003, Review R-003; AI-004, Review R-004; AI-005, Review R-005) and is counted above.

## Model registry

| ID | Model / product | Provider | First contribution | Attribution note |
| --- | --- | --- | --- | --- |
| AI-001 | Claude (exact model unknown) | Anthropic | 2026-07-17 | Existing git history includes merged branch `claude/nervous-mcnulty-402e56`; the exact model/version was not recorded. |
| AI-002 | Codex (GPT-5) | OpenAI | 2026-07-18 | Created the sanctuary free-roam brief and multi-AI collaboration context. |
| AI-003 | Gemini 3.5 Flash (High) | Google | 2026-07-18 | Reviewed the Sanctuary Rotatable Camera and Directional Wyverns plan and appended Review R-003. |
| AI-004 | Gemini 3.1 Pro (High) | Google | 2026-07-18 | Reviewed the Sanctuary Rotatable Camera plan (Review R-004), focusing on texture caching, input safety, and occlusion. |
| AI-005 | Gemini 3.1 Pro (Low) | Google | 2026-07-18 | Reviewed the Sanctuary Rotatable Camera plan (Review R-005), advocating for scope reduction through sprite mirroring and pre-baked tiles. |

## Contribution log

Append one row for each material work session. Keep old rows unchanged.

| Record | Date | Model ID | Contribution | Main files / evidence | Verification |
| --- | --- | --- | --- | --- | --- |
| C-001 | 2026-07-17 | AI-001 | Earlier Claude-assisted development represented by the merged Claude branch. | Git merge `c1a7c1f`; branch name preserved in history | Existing merge history only; exact session details unavailable |
| C-002 | 2026-07-18 | AI-002 | Planned sanctuary free roam, zoom/follow/survey camera behavior, interaction architecture, isometric readability work, and multi-AI handoff conventions. | `docs/SANCTUARY_FREE_ROAM_PLAN.md`, `AI_CONTEXT.md`, `AGENTS.md`, `GEMINI.md`, README/roadmap context | Documentation links and repository consistency checked |
| C-003 | 2026-07-18 | AI-002 | Rebased the detached documentation work onto the latest local `main` lineage so other agents and worktrees can discover it safely. Updated the shared commands for the newer Vite workflow. | Branch `codex/multi-ai-sanctuary-docs`; documentation commit `4f82280` | Clean cherry-pick onto `de0b3d8`; `git diff --check`, syntax, and atlas validation passed; full check stopped because `vitest` is not installed in this worktree |
| C-004 | 2026-07-18 | AI-002 | Added a structured multi-model sanctuary review workflow with focused questions, a copyable prompt, append-only response template, and human-owned decision log. Routed Codex/agents, Claude, and Gemini entry files to it. | `docs/SANCTUARY_FREE_ROAM_PLAN.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | Documentation diff and heading/link checks |
| C-005 | 2026-07-18 | AI-002 | Implemented sanctuary free roam through Milestone 4: overview/follow/survey camera, footprint movement and ambient residents, stable world interactions, selection/rebuild session state, in-world feedback, occlusion/readability, and compatible scene travel. | `src/scenes/BaseScene.js`, `src/config.js`, `src/data/sanctuary.js`, `src/systems/sanctuary*.js`, `src/ui/roostPanel.js`, `src/ui/ui.css`, sanctuary tests, plan/context docs | `npm run check` (7 test files / 38 tests); 1280×720 Chrome route through Base, Vault, Atlas, Mission, recruit/rebuild, keyboard and pointer actions with no JavaScript runtime errors; known Embertooth atlas portability warning remains |
| C-006 | 2026-07-18 | AI-002 | Recorded the owner-directed sanctuary camera expansion and its art contract: zoom plus elevation/pitch, at least `-45°..+45°` yaw, camera-relative eight-direction movement, world/view direction separation, view-aware isometric projection, staged directional sprite coverage, risks, milestone, acceptance route, and multi-model review. | `docs/SANCTUARY_FREE_ROAM_PLAN.md`, `assets/sprites/wyverns/README.md`, `AI_CONTEXT.md`, `CLAUDE.md`, `ROADMAP.md`, `README.md` | Documentation/source consistency review, `git diff --check`, and `npm run check` (43 modules; 7 files / 38 tests; build passed; existing Embertooth portability warning); feature explicitly marked planned, not implemented |
| C-007 | 2026-07-18 | AI-002 | Split the completed sanctuary free-roam baseline from the new rotatable-camera initiative. Created a standalone implementation plan with coordinate, projection, camera rig, rendering, movement, interaction, directional art, architecture, milestone, test-matrix, risk, decision, review, and handoff contracts; rerouted every model entry point and core project document. | `docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md`, `docs/SANCTUARY_FREE_ROAM_PLAN.md`, `AGENTS.md`, `GEMINI.md`, `AI_CONTEXT.md`, `CLAUDE.md`, `ROADMAP.md`, `README.md`, sprite contract | Documentation/source/link consistency review and `git diff --check`; new plan explicitly marked planned and predecessor marked implemented/closed |
| C-008 | 2026-07-18 | AI-003 | Reviewed the Sanctuary Rotatable Camera and Directional Wyverns plan, contributing details on yaw/pitch projection matrices, camera-relative movement math, view-facing angle mapping, and iterative unprojection picking. | docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md | No code modified; documentation-only change. |
| C-009 | 2026-07-18 | AI-004 | Added Review R-004 to the Rotatable Camera plan with constraints for view-aware texture caching, lazy-loading directional sprite atlases, dynamic occlusion bounds, and tween input safety. | docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md | No code modified; documentation-only change. |
| C-010 | 2026-07-18 | AI-005 | Added Review R-005 to the Rotatable Camera plan proposing scope reductions: sprite mirroring to halve art requirements and pre-baking tiles to prevent cache thrashing. | docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md | No code modified; documentation-only change. |
| C-011 | 2026-07-18 | AI-002 | Implemented the rotatable sanctuary camera engineering through Milestone 4: nine-view forward/inverse projection, stepped yaw/elevation rig and transition lock, camera-relative logical movement, projected picking/range, in-place world reprojection, per-view tiles and procedural exterior props, projected ground affordances/world shadow, stable depth ties, visible controls, session persistence, and lifecycle safety. Directional wyvern atlas art remains an explicit Milestone 5 blocker. | `src/scenes/BaseScene.js`, `src/config.js`, `src/systems/sanctuary*.js`, `src/systems/tileArt.js`, `src/systems/textureBake.js`, `src/ui/roostPanel.js`, `src/ui/ui.css`, sanctuary tests, plan/context/README/roadmap/sprite docs | `npm run check` (50 modules; 11 test files / 135 tests; atlas validation and production build passed; existing Embertooth portability warning remains). A 1280×720 Chrome route covered all nine endpoints, transition lock, movement/Follow, Home, rebuild, panel, recruit, Vault, Atlas, and Mission before the final projected-prop/ground-shadow refinements; the post-refinement visual rerun remains pending. |

## How another model adds itself

1. If the exact model/version is not already in the registry, add one row with
   the next `AI-###` ID and increment **Distinct contributing model entries**.
2. If this adds a new provider, increment **Providers represented**.
3. Add one contribution row with the next `C-###` record and increment
   **Contribution records**.
4. Name the files or commit that prove the contribution and report the checks
   actually run. Use `not run` when appropriate.
5. Never add a placeholder model, infer an exact version, or rewrite another
   model's record.

Copyable contribution row:

```md
| C-### | YYYY-MM-DD | AI-### | What changed and why. | Files, commit, or PR | Checks run / not run |
```

Copyable model row:

```md
| AI-### | Product (exact model/version) | Provider | YYYY-MM-DD | First contribution and attribution evidence. |
```
