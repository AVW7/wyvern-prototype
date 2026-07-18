# Game UI Redesign

**Status:** Planned
**Project mode:** Multi-AI collaboration
**Last updated:** 2026-07-18

## Vision

Unify the four overlay surfaces — Roost, Dragon Vault, World Atlas, and the
in-mission HUD — into one coherent, legible interface system using a "Floating UI"
design language (detached surfaces, pill geometry, soft rim-light elevation).
Today each screen was authored independently: they share a few button classes but drift on layout
language, spacing, typography scale, and the "how do I leave this screen" affordance.
This plan makes the overlay feel like one game rather than four prototypes stitched
together, without touching the deliberate scene separation or the canvas rendering.

**This is a UI-overlay redesign only.** It changes the HTML/CSS in `src/ui/*` and
the handler wiring in the scenes. It does **not** change Phaser rendering, the
sanctuary/atlas/terrain generators, the roster model, or the scene graph.

## Scope

In scope:

- `src/ui/roostPanel.js` — the Roost/companions panel (BaseScene grounds).
- `src/ui/vaultPanel.js` — the Dragon Vault showcase (VaultScene interior).
- `src/ui/atlasPanel.js` — the World Atlas region/POI panel (AtlasScene).
- `src/ui/ui.css` — the single shared stylesheet for every overlay.
- Mission HUD + order bar (`MissionScene` builds these inline via `overlay.innerHTML`).
- Navigation affordances: "Floating Nav Island", "Enter Vault", "Step Outside", "World Atlas",
  "Back to Sanctuary", "Launch Mission", collapse/expand pills.
- `src/main.js` and `src/scenes/BootScene.js` for canvas stage-rect scaling.

Out of scope (do not touch under this plan):

- Any `systems/*` rendering, `data/*`, `entities/*`, `scenes/*` logic beyond
  overlay handler wiring.
- The canvas-drawn worlds (sanctuary, atlas, mission islands).
- The `SANCTUARY_FREE_ROAM_PLAN.md` free-roam initiative — that plan owns
  BaseScene's canvas/camera/movement; this plan owns the DOM overlay on top of it.
  Where they meet (the Roost panel during free-roam), this plan defers layout
  ownership to whatever free-roam ships and only styles it.

## Current baseline

All overlays render into a single `#ui-overlay` div (`ui.css:23`), which is
`pointer-events: none` with `pointer-events: auto` on direct children so the
canvas keeps receiving input. Each scene clears the overlay (`innerHTML = ''`)
on transition and rebuilds it. This contract is good and stays.

Shared primitives that already exist and should become the design system's base:

- `.panel` — the frosted card (top-left by default). Used by every screen.
- `.panel-header` — gradient title block with `h1` + `.subtitle`.
- `.panel-hide` / `.panel-pill` — collapse to a pill and expand back.
- `.btn-view` — bottom-right scene-travel button.
- `.btn-primary` — the purple call-to-action (Launch / recruit CTA).
- `button` base + `.btn-icon` — the default control styling.
- `.roster-count` pill, `.xp-bar`/`.bond-bar` fills, `.tag` chips.

### Gaps this redesign fixes

1. **No shared design tokens.** Colors and spacing are hardcoded literals scattered
   across CSS. A palette change means a find-and-replace hunt.
2. **Inconsistent panel anatomy.** Headers, font scales, and widths vary with no rationale.
   Panels act like docked rails rather than floating cards.
3. **Navigation is a scavenger hunt.** "Enter Vault" is a canvas prop. Every screen puts its
   primary exit in a different place with a different label style.
4. **Collapse behavior is uneven.** Vault has no collapse at all despite being the most panel-heavy screen.
5. **The Vault is overloaded.** It stacks a companion picker, a full profile,
   a technical-diagnostics/tuning block, and a 7-button action dock.
6. **Responsive rules are ad hoc.** Only the Vault has media queries. Roost/Atlas/HUD don't reflow.
7. **Mission HUD is bare.** Built as raw `innerHTML` string with minimal styling.
8. **Coordinate space is broken (B-1).** The `#ui-overlay` is absolute to the window, but the game is letterboxed. UI floats off-canvas on widescreen displays.
9. **Keyboard Input Leaks.** Keyboard inputs in UI fields leak to the scene layer.

## Design rules

- **Overlay-only.** Management UI stays HTML/CSS in `#ui-overlay`; never draw menus on canvas.
- **Floating UI Structure.** Use a detached floating UI language: uniform gutters, content-sized cards (not full-height rails), pill geometries for navigation, and soft rim-light elevation on dark backgrounds.
- **Two-Tier Token Hierarchy.** Introduce a global palette token layer and a semantic component token layer (e.g., `--panel-bg: var(--color-slate-900)`). No new color is introduced that isn't a token. 
- **Premium Typography.** Import a modern font (Inter or Outfit) rather than relying on system default.
- **Floating Nav Island.** Standardize primary navigation and exits into a single, uniform pill-shaped bottom-center navigation island across all screens.
- **Separate Debug UI.** The Vault's diagnostics/tuning block moves out of the panel into a separate floating debug card toggled by a hotkey (e.g., `~` or `D`), hidden by default.
- **Keep the handler contract.** Panel builders keep their current `opts`-with-callbacks signatures.
- **Motion Comfort.** Gate all buoyancy and animations behind `prefers-reduced-motion: reduce`.
- **Runnable at every step.** Ship screen-by-screen; the game stays playable after each.

## Proposed architecture

No new files unless a screen genuinely needs to split. The work is:

1. **Stage-Rect Alignment (B-1 Fix):** Add a `resize` listener in `main.js` that publishes `--stage-left`, `--stage-width`, etc., based on the canvas bounds. `#ui-overlay` binds to these properties.
2. **`ui.css` → two-tier token rewrite.** Add `:root` block at the top; refactor existing rules. Extract floating panel, button, and nav island shared classes. Add focus propagation stoppers for inputs.
3. **Panel builders → shared helpers.** Factor duplicated markup (header, pill, nav island, bars) into `src/ui/uiKit.js`. 
   - *Constraint:* `uiKit.js` must be pure DOM string helpers with NO Phaser/scene references, backed by Vitest contract tests.
4. **Per-screen restructure** (details below), each behind its own milestone.

## Per-screen plan

### Roost (BaseScene) — `roostPanel.js`

- Adopt floating panel anatomy + tokens. 
- Replace bottom-right buttons with the bottom-center **Floating Nav Island**, containing "Vault" (replaces gate prop clicking requirement), "World Atlas", and "Launch".
- Roster cards: tighten to the shared card component (avatar / name+level / xp bar / bond bar / Train+Feed). 
- Keep collapse-to-pill.

### Dragon Vault (VaultScene) — `vaultPanel.js`

- Adopt floating panel anatomy.
- **Debug UI extraction:** Extract `.vault-technical` to a hidden debug card toggled by a hotkey. Short-circuit `updateVaultDiagnostics` if closed.
- Action dock & Navigation: Adopt the **Floating Nav Island** (bottom-center) for "Grounds" and "Atlas" exits. Stack the action dock directly above the nav island, separated by a standard gutter.
- Add collapse-to-pill parity.

### World Atlas (AtlasScene) — `atlasPanel.js`

- Adopt floating panel anatomy. Ensure it behaves as a scrollable card, not a full-height rail.
- Adopt the **Floating Nav Island** for "Sanctuary" and "Launch" actions.
- POI detail card and region rows restyle to the shared chip/card components.

### Mission HUD (MissionScene)

- Bring the inline HUD, order bar, and win/lose overlay into the token system. 
- Do not add buoyancy to combat UI.

## Design tokens (initial set)

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  /* Global Palette */
  --color-slate-900: rgba(20, 14, 30, 0.86);
  --color-slate-950: rgba(14, 10, 20, 1);
  --color-purple-500: #8b5cf6;
  --color-purple-600: #7c3aed;
  --color-amber-500: #c4813c;
  --color-text-main: #ece7f2;
  --color-text-dim: #9b8bbd;
  --color-text-faint: #8a7aa8;

  /* Semantic Components */
  --bg: var(--color-slate-950);
  --panel-bg: var(--color-slate-900);
  --text: var(--color-text-main);
  --text-dim: var(--color-text-dim);
  --text-faint: var(--color-text-faint);
  --accent: var(--color-purple-500); 
  --accent-strong: var(--color-purple-600);
  
  /* Floating Structure */
  --gutter: 24px;
  --radius-card: 24px;
  --radius-inner: 12px;
  --radius-pill: 999px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 22px; --space-6: 32px;
  
  /* Typography */
  --font-family: 'Inter', sans-serif;
  --font-h1: 24px; --font-h2: 12px; --font-body: 13px; --font-small: 10px;
  
  /* Elevation (Rim-light recipe) */
  --elev-float: 
    0 18px 44px rgba(0, 0, 0, 0.55),
    0 2px 8px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.09);
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

## Delivery plan

Each milestone leaves the game runnable (`npm run check` green) and is a natural review point.

### Milestone 0 — Coordinate Space & Floating Base
Bind `#ui-overlay` to canvas stage-rect scaling using Phaser's resize event. Set up Inter font, floating panel geometry, and reduced-motion resets. Prevent keyboard propagation from inputs.

### Milestone 1 — Token layer + uiKit
Add two-tier `:root` tokens to `ui.css`; migrate existing rules. Extract `src/ui/uiKit.js` with pure shared helpers and Vitest contract tests. Implement the floating Nav Island.

### Milestone 2 — Roost redesign
Restyle to floating panel anatomy; wire the bottom-center Nav Island; unify roster cards. **Gate:** enter vault from island and from gate prop.

### Milestone 3 — Vault redesign
Floating anatomy + amber accent; extract diagnostics/tuning into hotkey-toggled debug card; stack action dock over Nav Island. **Gate:** debug toggles and live-updates; step outside via island works.

### Milestone 4 — Atlas + Mission HUD
Restyle Atlas panel/POI card/tooltip into floating cards. Restyle Mission HUD/order bar. 

### Milestone 5 — Responsive + polish
Consistent media queries; verify no panel spills off-canvas at narrow dimensions.

## Acceptance checklist

- [ ] `#ui-overlay` is bound to the canvas bounding rect, not the window viewport.
- [ ] All overlay colors/spacing use the two-tier CSS token system.
- [ ] Every screen uses the bottom-center Floating Nav Island for primary exits.
- [ ] Roost, Vault, and Atlas all support collapse-to-pill and act as content-sized cards, not full rails.
- [ ] Vault diagnostics/tuning are moved to a separate debug card toggled by a hotkey (e.g., `~`).
- [ ] `uiKit.js` contains no Phaser references and has passing Vitest contract tests.
- [ ] Buoyancy/motion disabled via `prefers-reduced-motion`.
- [ ] Keyboard input inside text fields does not propagate to the game.
- [ ] `npm run check` passes after every milestone.

## Manual verification route

1. `npm run dev`.
2. **Resize Window:** Resize to ultra-wide and portrait aspect ratios; verify UI stays clamped to the letterboxed canvas frame.
3. **Roost:** Check floating nav island, recruit/train/feed, click **Vault** on the nav island.
4. **Vault:** Press `~` to toggle debug card and confirm diagnostics update; use nav island to return to Grounds.
5. **Atlas:** Select region + POI; Launch Mission via nav island.
6. **Mission:** Confirm HUD and order bar render correctly.

## Known implementation risks

- **Stage-Rect Reflows:** Updating `--stage-*` variables on resize must be performant; querying `getBoundingClientRect` causes forced reflow. Use ResizeObserver or hook directly into Phaser's scaled canvas bounds.
- **Diagnostics Live-Update Thrashing:** Ensure `updateVaultDiagnostics` skips DOM querying when the debug card is closed.
- **Overlay Rebuild Churn:** Keep `uiKit.js` helpers pure and fast. Don't introduce per-frame overlay rebuilds.
- **Free-roam overlap:** Coordinate the Roost milestone with `SANCTUARY_FREE_ROAM_PLAN.md` controls layout.

## Multi-model review workspace

Reviewers: append below using the append-only template. Preserve earlier reviews;
leave decision status to the human project owner.

### Questions for reviewers

1. Is the single shared exit slot (bottom-right `.btn-view`) the right convention, or
   should exits live in the panel footer?
2. Should the Vault's diagnostics/tuning be a disclosure, a separate dev-only key
   toggle, or removed from player UI entirely?
3. Are CSS custom-property tokens sufficient, or is a heavier theming approach warranted
   for a prototype (the no-tooling guardrail says keep it light)?
4. Does splitting shared helpers into `src/ui/uiKit.js` respect the "scenes stay
   separate" rule, given it's DOM-string helpers with no scene logic?

### Review R-### — Model/product

```
### Review R-### — Model/product
**Reviewer:** <model / person>
**Date:** <YYYY-MM-DD>
**Verdict:** <support / support-with-changes / object>

<prose>
```

### Recorded reviews

### Review R-001 — Floating UI (detached-surface design language)

**Reviewer:** Claude Opus 4.8 (`claude-opus-4-8`), reviewing through a
"Floating UI" style brief (detached surfaces, soft diffuse elevation, pill
geometry, buoyant motion).
**Date:** 2026-07-18
**Verdict:** support-with-changes

The plan is sound and correctly scoped. The four gaps it names are real and I
found no disagreement with its boundaries. My changes are: one blocking
prerequisite it does not currently mention (B-1 below), two collision bugs that
already exist in `ui.css` today, and a concrete answer to question 1 that I
think is stronger than either option offered.

#### Framing: adopt floating structure, not floating palette

The Floating UI brief is written for light product surfaces: off-white page,
white cards, dark diffuse shadow. Applied literally here it would be wrong.
The overlay sits over a dark fantasy canvas (`GAME.backgroundColor '#0a0d13'`,
`ui.css:9` body `#0e0a14`), and white cards would blow out against the baked
terrain art, fight the sanctuary's own light sources, and cost legibility on
every screen at once.

What transfers is the *structure*, and it happens to solve the plan's stated
gaps better than a straight token migration would:

| Floating UI principle | What it fixes here |
| --- | --- |
| Detachment (uniform gutter, nothing touches an edge) | Gap 6, responsive; and blocker B-1 |
| Pill geometry / floating nav island | Gap 3, "navigation is a scavenger hunt" |
| Soft diffuse elevation | Gap 2, panel anatomy drift; needs a dark-mode recipe (S-1) |
| Content-sized islands, not full-height rails | Gap 5, the overloaded Vault |
| Buoyant motion | Not in the plan; add with guards (M-1) |

So: keep the dark palette, raise the panel surface slightly off the page,
and buy elevation with a rim light rather than a shadow. Recipe in S-1.

#### Answers to the reviewer questions

**Q1 — Is the bottom-right `.btn-view` slot the right exit convention, or should
exits live in the panel footer?**

Neither, and I would push back on the framing. Both options describe a
*position*; the discoverability problem in gap 3 is that each screen presents a
different *object*. Standardising the coordinate still leaves four differently
shaped controls that a player has to relearn.

Recommend a **floating nav island**: one pill-shaped bar, the same DOM component
on all four screens, carrying that screen's exits plus its primary CTA. Roost
gets `Vault / Atlas / Launch`; Vault gets `Grounds / Atlas`; Atlas gets
`Sanctuary` plus `Launch` when a POI is selected; Mission gets `Return to Base`.
The player learns one object once. It also delivers the plan's own acceptance
item "Enter Vault is reachable from a labeled button" for free, without adding a
one-off footer button that exists only on Roost.

Placement, given the collisions in B-2: put the island **bottom-centre** and
treat the Vault action dock as a member of the same component family stacked
directly above it with one gutter between them. Reserve bottom-centre as the
single "controls live here" zone and stop scattering docks and cards into it
with independent pixel math. The `.poi-card` then sits above the island too.

This does contradict the plan's current risk note, which reserves bottom-right
for the exit and keeps docks centre. I think that note is treating the symptom.
The bottom-right corner is also the worst corner to reserve on a letterboxed
canvas (B-1), which is a second reason to move off it.

**Q2 — Vault diagnostics: disclosure, dev-only key toggle, or removed?**

Separate floating card, hidden by default, toggled by key. Not an in-panel
disclosure.

The plan's instinct is right but the disclosure keeps developer chrome inside
the player-facing card, which is exactly what breaks the "one calm object" read
that makes a floating card work. The Vault is the plan's own example of an
overloaded screen; nesting a collapsed frame counter inside the profile card
still costs it a heading, a border rule, and vertical rhythm.

Good news, and this is the part worth recording: **moving those nodes is
zero-risk against the plan's stated concern.** `updateVaultDiagnostics`
(`vaultPanel.js:162-169`) resolves `[data-vault-diagnostic]` against
`#ui-overlay`, not against `.vault-profile-panel`. Any location inside the
overlay keeps working unchanged. And because `display: none` on an ancestor
leaves nodes in the DOM, `textContent` updates on a hidden card are still valid.
So the risk note "hiding them behind a disclosure must keep the nodes in the DOM
or guard the updater" is satisfied by construction for either option. Pick the
one that is better for the player, which is the separate card.

Keep the tuning sliders with the diagnostics; they are the same audience.

**Q3 — Are CSS custom properties sufficient, or is heavier theming warranted?**

Sufficient, and the codebase has already committed to the pattern. `vaultPanel.js`
sets `--wyvern-accent` inline per card and per profile (`:48`, `:103`) and
`ui.css` consumes it through `color-mix()` in eleven places. Custom properties
here are not just a stylesheet convenience, they are already the runtime API
between the panel builders and the stylesheet. The token layer formalises
something that exists rather than introducing a new mechanism, which is the
cheapest possible answer under the no-tooling guardrail.

Two floors worth writing into the plan explicitly, because the redesign leans
harder on both: `color-mix()` and `backdrop-filter`. Both are widely available
but neither degrades gracefully to *nothing*, so any panel whose readability
depends on `backdrop-filter` needs a solid-colour fallback in the same rule.
Today `.panel` has one (`rgba(20,14,30,0.86)` under the blur), which is correct
and should become the documented pattern rather than an accident.

**Q4 — Does `src/ui/uiKit.js` respect the "scenes stay separate" rule?**

Yes, and there is precedent: `roostPanel.js` is already shared between BaseScene
and VaultScene, and its header comment states the reasoning ("The scenes stay
separate; only this UI widget is common between them"). The guardrail in
`CLAUDE.md` is about scene logic and rendering, not DOM string helpers.

One constraint to make it enforceable rather than aspirational: `uiKit.js` must
import nothing from `scenes/`, `entities/`, or Phaser, and must hold no module
state. That is checkable as a pure-data test in the existing Vitest suite, in the
same style the repo already uses for `wyvernAtlas`. I would add it to Milestone 1
so the seam cannot rot later.

#### Blockers and bugs found in current source

**B-1 (blocking, not currently in the plan) — the overlay is detached from the
wrong rectangle.**

`main.js` runs `Phaser.Scale.FIT` with `CENTER_BOTH` at 1280x720, so the canvas
is letterboxed inside the window. But `#ui-overlay` is `position: absolute;
inset: 0` on the *window* (`ui.css:16-21`). Every overlay offset is therefore
measured from the window edge, not the game frame.

Worked example on a 1440x900 window: the canvas fits to width and renders
1440x810, leaving 45px bars top and bottom. `.btn-view { bottom: 24px }` then
lands 21px *below* the canvas, floating on the black bar, outside the game
image entirely. The same applies to `.panel { top: 24px; left: 24px }` on any
window narrower than 16:9.

This matters for this plan more than it did before. "Detachment with a uniform
gutter" is the load-bearing idea of the whole redesign; if the gutter is measured
against the wrong box, the redesign looks broken exactly where it is trying
hardest to look deliberate. It also silently defeats the acceptance item "no
panel overflows the canvas at 1080px-wide / 640px-tall viewports", because a
panel can satisfy the window check while sitting off the canvas.

Suggested fix, small and self-contained: publish the canvas rect as CSS custom
properties (`--stage-x/y/w/h`) from Phaser's scale `resize` event, and position
the overlay against those instead of the viewport. Belongs in Milestone 1 ahead
of the token work, since every later milestone inherits the coordinate space.

**B-2 (bug that exists today) — the Vault action dock overlaps both side panels
in the 1081px to roughly 1200px band.**

`.vault-action-dock` is `width: min(610px, calc(100vw - 680px))` with
`min-width: 520px` (`ui.css:428-441`). Below about 1200px the `calc` wins the
`min()` but is then overridden by `min-width`, pinning the dock at 520px.

At a 1100px viewport: roster panel occupies 24 to 310, profile panel 774 to
1076, leaving 464px of clear centre. The dock renders 520px centred, spanning
290 to 810. It overlaps the roster panel by 20px and the profile panel by 36px.
The `@media (max-width: 1080px)` rule that sets `width: 500px; min-width: 0`
fixes this below 1080 but leaves the band above it broken.

This is the concrete form of the plan's "position collisions" risk. The general
lesson for the redesign: independently positioned elements with hand-tuned pixel
math will keep colliding. A single float layer with one gutter token, laying the
bottom-centre stack out in flow, removes the class of bug rather than this
instance of it.

**B-3 (cosmetic, but on the critical path) — the "pill" affordances are not
pills.** `.panel-pill` (`ui.css:55`) and `.btn-view` (`:64`) both inherit
`border-radius: 9px` from the base `button` rule (`:196`). The collapsed control
is named a pill and is drawn as a rounded rectangle. Since pill geometry is one
of the three things carrying the floating read, this is worth fixing in the same
pass rather than later.

**B-4 (observation) — two panels are rails, not floating cards.**
`.atlas-panel { bottom: 24px }` (`:475`) and `.vault-profile-panel { bottom: 24px }`
(`:269-278`) combine with `.panel { top: 24px }` to span the full height. They
read as docked sidebars, which is the opposite of the intended language. If the
plan adopts the floating reading, these should be content-sized with a
`max-height` cap and internal scroll. Flagging rather than insisting: this is a
real design call, and a two-list Atlas panel may genuinely want the height.

#### Spec addendum: dark-floating implementation

Offered as concrete input to the plan's token section, not as a replacement for
it. Values preserve current hues so the migration stays visually neutral except
where it is deliberately fixing elevation.

**S-1 — elevation on dark.** The current
`box-shadow: 0 8px 32px rgba(0,0,0,0.45)` over a `#0e0a14` page is close to
invisible: a black shadow on a near-black background has almost no luminance
delta, which is why panels currently read as flat and rely on their 1px border
to separate. Three-part recipe instead:

```css
--elev-float:
  0 18px 44px rgba(0, 0, 0, 0.55),          /* occlusion, still useful */
  0 2px 8px rgba(0, 0, 0, 0.4),             /* contact shadow */
  inset 0 1px 0 rgba(255, 255, 255, 0.09);  /* rim light: the actual lift */
```

The inset rim is what sells elevation on dark. Pair it with a panel surface
*lighter* than its surroundings (`rgba(26,19,38,0.78)` over the `#0e0a14` page)
and increase the blur to `14px`; the current `6px` is too tight to read as depth
against high-frequency terrain art.

**S-2 — geometry and gutter.**

```css
--gutter:     24px;   /* the single detachment value, all four edges, all screens */
--radius-card: 24px;  /* was 14px: larger radius reads as more detached */
--radius-pill: 999px; /* nav island, collapsed pills, chips, bars */
--radius-inner: 12px; /* elements nested inside a card */
```

One gutter token, used for both the outer detachment and the gap between
stacked floating elements, is what makes the layout self-consistent without
per-screen pixel tuning. It is also the direct fix for the B-2 class of bug.

**S-3 — nav island.**

```css
.nav-island {
  position: absolute;
  bottom: var(--gutter);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: var(--space-3);
  padding: 10px 14px;
  border-radius: var(--radius-pill);
  background: var(--panel-bg);
  box-shadow: var(--elev-float);
  backdrop-filter: blur(14px);
}
```

Built by `uiKit.js` from a `[{ label, icon, onClick, primary }]` array so each
screen declares its exits as data. Keeps the plan's "new controls are optional
callbacks" contract.

**M-1 — motion, with two guards.** The Floating UI brief calls for a slow 2px
translateY loop. Two constraints specific to this project:

1. Never animate a control the player clicks repeatedly. A drifting hit target
   is a Fitts's-law regression, and the Vault action dock (7 buttons) and the
   Mission order bar are both high-frequency. Restrict buoyancy to passive
   surfaces: panel bodies and collapsed pills.
2. Gate all of it behind `prefers-reduced-motion: reduce`. Review R-003 on the
   sanctuary plan already established reduced-motion as an acceptance item, so
   this is consistency with existing project precedent rather than a new ask.

Mission HUD should probably opt out of buoyancy entirely; motion during combat
competes with the thing the player is actually tracking.

**S-4 — suggested milestone reordering.** Insert B-1 (stage-rect coordinate
space) and B-2/B-3 (float layer, pill geometry) *before* the token migration.
Both change where things are positioned, and doing them after the token pass
means touching every positioned rule twice.

#### What I did not verify

No code was modified and no build or browser pass was run for this review. The
letterbox arithmetic in B-1 and the overlap arithmetic in B-2 are computed from
the CSS and `main.js` scale config, not observed in a browser; both should be
confirmed visually before they are treated as settled. The `updateVaultDiagnostics`
claim in Q2 is read directly from `vaultPanel.js:162-169` and I am confident in
it. All aesthetic recommendations are one style brief's reading and should be
weighed against the project owner's art direction, which I have not seen.

### Review R-002 — Gemini 3.5 Flash

- **Reviewer:** Gemini 3.5 Flash (`gemini-3.5-flash`)
- **Date:** 2026-07-18
- **Verdict:** support-with-changes
- **Focus:** Layout positioning, technical diagnostics separation, design system tokens, and performance.
- **Files inspected:** `src/ui/ui.css`, `src/ui/roostPanel.js`, `src/ui/vaultPanel.js`, `src/ui/atlasPanel.js`, `src/scenes/BaseScene.js`, `src/scenes/VaultScene.js`, `src/scenes/AtlasScene.js`, `src/scenes/MissionScene.js`, `src/main.js`
- **Summary:** The Game UI Redesign plan outlines a crucial and timely unification of the visual overlay systems. I support the plan and align with the "Floating UI" direction established in R-001. Specifically, the proposed canvas stage-rect scaling mechanism (fixing B-1) and the layout-independent nav island (fixing Q1/B-2) are must-have additions. My changes target concrete implementations for letterbox positioning, semantic token tiering, keyboard input blocking, and performance optimizations for diagnostic updates.

#### Answers to the Reviewer Questions

**Q1 — Shared exit slot vs. panel footer?**
I strongly endorse the **Floating Nav Island** (placed bottom-center) proposed in R-001. Positioning exits bottom-center as part of a uniform, reusable navigation component drastically reduces visual hunt times and prevents the layout from clipping near letterbox borders. Additionally, for the Vault scene, stacking the action dock directly above the nav island keeps all interaction vectors grouped together.

**Q2 — Vault diagnostics: disclosure, dev-only key toggle, or removed?**
Diagnostics and presentation tuning must be split into a **separate floating debug card** and hidden by default. Storing developer-facing sliders and status strings directly inside the premium profile panel degrades the layout. Toggling this debug card via a hotkey (such as the backtick key `~` or `D`) is cleaner than an in-panel disclosure.
*Performance tip:* While updating hidden elements via `textContent` is valid, we should add a short-circuit guard in the update loop so `updateVaultDiagnostics` only queries the DOM if the debug card is open, reducing layout thrashing.

**Q3 — CSS custom-property tokens vs. heavier theming?**
CSS custom-property tokens are ideal. To prevent "token soup" in `ui.css`, I recommend establishing a **two-tier token hierarchy**:
1. *Global Palette Tokens:* Base colors (e.g., `--color-purple-500`, `--color-slate-900`).
2. *Semantic Component Tokens:* Map base colors to specific design roles (e.g., `--brand-accent: var(--color-purple-500);`, `--panel-background: var(--color-slate-900);`).
This architecture makes sweeping style updates (like changing the vault's theme) simple and maintains high readability.

**Q4 — Scene separation vs. `uiKit.js`?**
A shared `uiKit.js` module is perfectly aligned with project conventions, provided it behaves as a pure, stateless templating helper. It should contain no references to the Phaser runtime, scene registries, or active entity classes. I support R-001's recommendation to write Vitest contract tests for `uiKit.js` to enforce these boundaries.

#### Recommended Technical Changes

1. **Concrete Implementation for Stage-Rect Alignment (B-1):**
   To resolve the letterboxing alignment bug, we should implement a listener on Phaser's scale resize event in `BootScene` or `main.js`:
   ```javascript
   this.scale.on('resize', (gameSize) => {
     const canvas = this.sys.game.canvas;
     const rect = canvas.getBoundingClientRect();
     document.documentElement.style.setProperty('--stage-left', `${rect.left}px`);
     document.documentElement.style.setProperty('--stage-top', `${rect.top}px`);
     document.documentElement.style.setProperty('--stage-width', `${rect.width}px`);
     document.documentElement.style.setProperty('--stage-height', `${rect.height}px`);
   });
   ```
   Then, bind `#ui-overlay` coordinates to these properties in `ui.css`:
   ```css
   #ui-overlay {
     position: absolute;
     top: var(--stage-top, 0px);
     left: var(--stage-left, 0px);
     width: var(--stage-width, 100%);
     height: var(--stage-height, 100%);
     pointer-events: none;
   }
   ```
   This ensures all absolute positioning is calibrated to the playable game rectangle instead of the browser window.

2. **Isolate Keyboard Events during UI Panel Interactions:**
   Currently, `#ui-overlay` blocks mouse pointers via `pointer-events`, but keyboard inputs (WASD, Arrows, Space) can still propagate to scenes. If a user is interacting with text inputs or panels, they might trigger mission attacks or movement.
   *Fix:* Add an event listener to the `#ui-overlay` container that stops propagation of keydown events when an input element is focused:
   ```javascript
   document.getElementById('ui-overlay').addEventListener('keydown', (e) => {
     if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
       e.stopPropagation();
     }
   });
   ```

3. **Motion Comfort Safeguards (Reduced Motion):**
   Ensure all hover shifts and buoyancy effects are disabled under a media query:
   ```css
   @media (prefers-reduced-motion: reduce) {
     * {
       animation: none !important;
       transition: none !important;
     }
   }
   ```

4. **Typography Upgrade:**
   To elevate the visual feel from "standard browser default" to "premium dark-mode game," import a clean typeface like **Inter** or **Outfit** in the HTML `<head>` rather than relying strictly on the system font fallback.

#### Verification Strategy

- **Browser Verification:** Verify the nav island's centering and the B-1 stage positioning at extreme aspect ratios (e.g., ultra-wide 21:9 and portrait-style windows).
- **Reduced Motion Test:** Enable "Reduce Motion" in macOS system settings and confirm that the UI snaps instantly without transitions.
- **Diagnostics Rate Limiting:** Confirm that the technical diagnostics card updates at a throttled interval (e.g., 100ms) rather than every animation tick.

### Decision log

_(owner-only)_

## Handoff rule

After material work here, append a truthful row to `AI_CONTRIBUTIONS.md` and update
this doc's **Last updated** date. Do not merge across the deliberately-separate scenes;
this plan touches the overlay layer only.

