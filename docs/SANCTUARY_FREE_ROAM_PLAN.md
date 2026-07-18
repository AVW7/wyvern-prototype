# Sanctuary Free-Roam Redesign

**Status:** Planned  
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

- `BaseScene` builds a fixed fitted view and only wires the barred vault door.
- `buildSanctuaryView()` computes one camera zoom and center; it has no pan,
  follow, cursor-anchored zoom, or bounds.
- `spawnSanctuaryResidents()` returns no resident handles and animates everyone
  with a stationary bob, so no resident can become the controlled character.
- Sanctuary props carry only a `type` and sprite reference; they have no stable
  interaction ID, action, range, label, or availability state.
- The map already has the right visual foundations: hand-authored cells,
  elevation, separate prop sprites, ground-footprint depth, and `screenToGrid()`
  in the shared iso system.
- `AtlasScene` already proves cursor-anchored wheel zoom, bounded pan, fit zoom,
  and panel-aware framing. Reuse its math and behavior, but keep the sanctuary
  implementation sanctuary-specific as required by the scene architecture.

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

- Add `SANCTUARY.zoom = { max: 2.2, step: 1.12 }`; derive `min` from fitted map
  bounds as the atlas does.
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
- Start with a walkable-cell mask generated from non-null cells and
  `height < blockedAt`. Add explicit ramps/bridges where elevation changes are
  traversable.
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

## Delivery plan

### Milestone 1 — Camera foundation

- Make sanctuary bounds public from `sanctuaryRender.js`.
- Add a sanctuary camera controller with overview, follow, survey, cursor zoom,
  pan bounds, and panel-aware refitting.
- Add an unobtrusive controls hint.

**Exit:** wheel zoom, drag pan, reset, and panel collapse work without showing
outside the authored sanctuary or breaking the vault gate.

### Milestone 2 — One controllable wyvern

- Return resident handles from `spawnSanctuaryResidents()`.
- Select the first authored roster wyvern by default; allow roster selection.
- Add normalized movement, footprint/shadow, flight lift, camera follow, and
  continuous depth sorting.
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
