# Roadmap

Prioritized next steps for the prototype. Ordered so each phase is playable
and demoable on its own — don't jump ahead of unfinished phases.

## Active design initiative — Sanctuary free roam

The sanctuary is planned to evolve from a fitted roster diorama into an
explorable home space: directly control a selected wyvern, follow or survey it
with cursor-anchored zoom, and interact with residents and landmarks in the
isometric world. The staged design, architecture seams, acceptance criteria,
and explicit deferrals live in
[`docs/SANCTUARY_FREE_ROAM_PLAN.md`](docs/SANCTUARY_FREE_ROAM_PLAN.md).

Implementation should land milestone-by-milestone so the existing
Base/Vault/Atlas/Mission loop remains playable after every change. This is a
multi-AI initiative; implementation sessions should also update
[`AI_CONTRIBUTIONS.md`](AI_CONTRIBUTIONS.md).

## Phase 1 — Close the base ↔ mission loop

The two layers currently don't talk to each other beyond one hardcoded read.
Fixing that is higher priority than new content because every later feature
(more wyverns, more missions, rewards) depends on it.

- **Mission outcomes write back to roster.** On victory/defeat,
  `MissionScene` should persist the wyvern's ending hp (and grant xp on a
  win) via `roster.js`, instead of only reading `wyv-01` at spawn and
  discarding state on return to Base.
- **Let the player pick which wyvern flies.** `BaseScene`'s roster list is
  display-only; add selection (click a roster row) and pass the chosen
  wyvern's id into `scene.start('Mission', { wyvernId })`, replacing the
  hardcoded `'wyv-01'` in `spawnWyvern()`.
- **Give Train/Build a cost.** Both are currently free and instant. Add a
  simple resource (e.g. gold from missions) so the base sim has a real
  decision loop, not just two buttons.

## Phase 2 — Mission variety

- **Multiple missions.** *Done* — the world atlas (`AtlasScene` +
  `data/atlas.js`) is the mission-select step. Its 12 POIs are the mission
  list, and each carries its own terrain `seed`, which `MissionScene` now
  passes to `buildTerrain()` — so every destination is a distinct island. The
  Roost's launch button opens the atlas instead of firing `'mission01'`.
- **Per-mission enemies + rewards.** Still open, and now the obvious next
  step: a POI row carries `danger` but nothing reads it. `DEMO_ENEMY_SPAWNS`
  and `COMBAT.enemyHp` are the remaining hardcoded seams — move spawn
  counts/stats onto the POI row and scale them by `danger`.
- **More enemy variety.** `Enemy.js` is a single hp/damage profile today.
  Parameterize per-mission enemy stats/counts instead of always using
  `COMBAT.enemyHp`.

## Phase 3 — Squad play

- **More than one wyvern (or other species) per mission.** Entities and
  depth-sorting already generalize; this is mostly `spawnWyvern()`/
  `Wyvern.js` input handling (currently single-controlled) needing a squad
  concept — direct-control one animal, order the rest via `WYVERN_ORDERS`.
  Sending a non-wyvern species into a mission also needs its own
  Preload placeholder texture and a combat entity (`Wyvern`/`Enemy` are
  currently the only two) — see the "Sanctuary species" note in CLAUDE.md.
- **Recruiting choices.** Species-based recruiting now exists
  (`data/species.js` + the Base screen's recruit row) — what's left is
  variety *within* a species (rarity/starting-stat rolls) so recruiting the
  same species twice isn't identical.

## Phase 4 — Persistence & polish

- **Save/load.** Roster and base state currently reset on page refresh
  (in-memory module state). Add `localStorage` persistence — this is a
  prototype-friendly zero-backend option, no build step required. The atlas
  needs this too: each POI's `discovered` and each region's `explored` are
  hardcoded in `data/atlas.js`, so the map can't record where you've been.
- **Real art.** Swap the emoji/procedural placeholders for an Aseprite atlas
  and Tiled maps once the loop above is fun — see "Replacing placeholders"
  in CLAUDE.md for the exact swap points already wired.
- **Audio.** No sound system exists yet; add hit/victory/ambient cues once
  the core loop is locked (avoid tuning audio against a loop that's still
  changing).

## Explicitly deferred

- Fog-of-war/vision (the `recon` order is stubbed for this — don't build
  vision systems before there's a reason to hide anything).
- Multiplayer/networking — out of scope for a prototype proving the core
  loop.
- Any build tooling/bundler — keep zero-build per CLAUDE.md guardrails
  until art/code size actually demands it.
