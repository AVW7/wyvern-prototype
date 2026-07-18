# Shared AI Development Context

Wyvern Prototype is explicitly a **multi-AI-use project**. Codex, Claude,
Gemini, other models, and humans may collaborate on the same codebase. No model
is the sole owner of the design or implementation.

## Read order

1. `README.md` — product overview and how to run the prototype.
2. `CLAUDE.md` — despite its historical filename, this is the detailed,
   model-neutral architecture and repository convention reference.
3. `ROADMAP.md` — current product priorities.
4. `docs/SANCTUARY_FREE_ROAM_PLAN.md` — active sanctuary redesign brief.
5. `AI_CONTRIBUTIONS.md` — model registry and append-only work log.

## Collaboration contract

- Inspect current source and git status before changing anything; documentation
  may lag a work in progress.
- Preserve unrelated human or model changes in a dirty worktree.
- Keep Base, Vault, Atlas, and Mission scene logic separate. Share only small,
  low-level systems where the architecture already permits it.
- Keep the zero-build vanilla-JavaScript setup unless a human explicitly
  approves a toolchain change.
- Prefer small, playable milestones and verify scene transitions manually.
- Record new architectural decisions in the relevant plan or context file.
- After a material contribution, register the model if needed and append one
  contribution row to `AI_CONTRIBUTIONS.md`.
- Never guess a model version or claim another model's work. Use `unknown` and
  link evidence when attribution is incomplete.

## Current initiative

The sanctuary free-roam redesign is planned, not implemented. Its first slice
adds a sanctuary-specific camera controller, one directly controlled roster
wyvern, world interactions, and clearer isometric action rendering. Read the
full plan before modifying `BaseScene`, `sanctuaryRender`, sanctuary map data,
or sanctuary camera behavior.

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
