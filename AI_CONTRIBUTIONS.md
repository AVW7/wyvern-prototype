# AI Contribution Registry

This project intentionally uses multiple AI systems. This file makes that work
visible without treating any model as the sole author.

## Count

- **Distinct contributing model entries:** 2
- **Providers represented:** 2
- **Contribution records:** 3

Counts include only models with a concrete contribution and evidence. Gemini is
invited through `GEMINI.md` but is not counted until it contributes.

## Model registry

| ID | Model / product | Provider | First contribution | Attribution note |
| --- | --- | --- | --- | --- |
| AI-001 | Claude (exact model unknown) | Anthropic | 2026-07-17 | Existing git history includes merged branch `claude/nervous-mcnulty-402e56`; the exact model/version was not recorded. |
| AI-002 | Codex (GPT-5) | OpenAI | 2026-07-18 | Created the sanctuary free-roam brief and multi-AI collaboration context. |

## Contribution log

Append one row for each material work session. Keep old rows unchanged.

| Record | Date | Model ID | Contribution | Main files / evidence | Verification |
| --- | --- | --- | --- | --- | --- |
| C-001 | 2026-07-17 | AI-001 | Earlier Claude-assisted development represented by the merged Claude branch. | Git merge `c1a7c1f`; branch name preserved in history | Existing merge history only; exact session details unavailable |
| C-002 | 2026-07-18 | AI-002 | Planned sanctuary free roam, zoom/follow/survey camera behavior, interaction architecture, isometric readability work, and multi-AI handoff conventions. | `docs/SANCTUARY_FREE_ROAM_PLAN.md`, `AI_CONTEXT.md`, `AGENTS.md`, `GEMINI.md`, README/roadmap context | Documentation links and repository consistency checked |
| C-003 | 2026-07-18 | AI-002 | Rebased the detached documentation work onto the latest local `main` lineage so other agents and worktrees can discover it safely. Updated the shared commands for the newer Vite workflow. | Branch `codex/multi-ai-sanctuary-docs`; documentation commit `4f82280` | Clean cherry-pick onto `de0b3d8`; `git diff --check`, syntax, and atlas validation passed; full check stopped because `vitest` is not installed in this worktree |

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
