# Graph Report - src  (2026-07-20)

## Corpus Check
- 40 files · ~57,692 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 642 nodes · 1952 edges · 13 communities (12 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Core Game Architecture & Roster Systems
- Procedural Isometric Tile Art & Shadow Drawing
- Sanctuary Isometric Camera Projection & Texture Baking
- Sanctuary Interactive Camera Rig & Pan Controller
- Interactive Sanctuary Affordances & Input Handling
- World Map Biomes Generation & Atlas Panel UI
- Sanctuary Resident Pathfinding & Wander Movement
- Base Game Session State & Core Interaction Bindings
- Vault Inspector Panel & Sanctuary Settings UI
- Wyvern Asset Preloading & Atlas Validation
- Mission Scene Combat Loops & Enemy Spawners
- Sanctuary 3D Projection Decor Geometry & Lighting

## God Nodes (most connected - your core abstractions)
1. `SanctuaryCameraController` - 53 edges
2. `rect()` - 45 edges
3. `polygon()` - 43 edges
4. `SanctuaryInteractionController` - 43 edges
5. `drawObjectShadow()` - 41 edges
6. `BaseScene` - 38 edges
7. `normalizeView()` - 29 edges
8. `VaultScene` - 24 edges
9. `AtlasScene` - 23 edges
10. `MissionScene` - 23 edges

## Surprising Connections (you probably didn't know these)
- `makeBuilder()` --calls--> `createNoise()`  [EXTRACTED]
  data/sanctuary.js → systems/noise.js
- `playResidentState()` --calls--> `wyvernAnimationKey()`  [EXTRACTED]
  systems/sanctuaryMovement.js → data/wyverns.js
- `spawnSanctuaryResidents()` --calls--> `wyvernAnimationKey()`  [EXTRACTED]
  systems/sanctuaryRender.js → data/wyverns.js
- `targetFootprint()` --calls--> `projectFootprint()`  [EXTRACTED]
  scenes/BaseScene.js → systems/sanctuaryProjection.js
- `renderPoiCard()` --calls--> `getRegion()`  [EXTRACTED]
  ui/atlasPanel.js → data/atlas.js

## Import Cycles
- None detected.

## Communities (13 total, 1 thin omitted)

### Community 0 - "Core Game Architecture & Roster Systems"
Cohesion: 0.06
Nodes (56): COMBAT, DEMO_ENEMY_SPAWNS, EMOJI, ENEMY_STATES, GAME, ISO, ORDER_EFFECTS, SANCTUARY (+48 more)

### Community 1 - "Procedural Isometric Tile Art & Shadow Drawing"
Cohesion: 0.09
Nodes (74): drawArena(), drawBarredDoor(), drawBasaltSpires(), drawBones(), drawButte(), drawCactus(), drawCherry(), drawChest() (+66 more)

### Community 2 - "Sanctuary Isometric Camera Projection & Texture Baking"
Cohesion: 0.09
Nodes (63): decorTextureKey(), drawDecor(), gridToScreen(), EXTERIOR_SANCTUARY_DECOR_TYPES, applyGroundPlaneTransform(), finite(), groundPlaneTransform(), withoutTinyNoise() (+55 more)

### Community 3 - "Sanctuary Interactive Camera Rig & Pan Controller"
Cohesion: 0.07
Nodes (16): CAMERA_RIG_KEYS, cameraRigTuning(), clamp(), copyBounds(), createSanctuaryCamera(), DEFAULT_CAMERA_RIG, finite(), isPromiseLike() (+8 more)

### Community 4 - "Interactive Sanctuary Affordances & Input Handling"
Cohesion: 0.09
Nodes (21): actorGroundFootprint(), actorLogicalFootprint(), clamp(), createSanctuaryInteractions(), DEFAULT_TUNING, DEFAULT_VIEW, defaultPointFromLogical(), displayObjectAlive() (+13 more)

### Community 5 - "World Map Biomes Generation & Atlas Panel UI"
Cohesion: 0.07
Nodes (34): ATLAS, ATOLL_RING, getPoi(), getRegion(), POIS, REGION_BLOBS, REGIONS, BIOME_KEYS (+26 more)

### Community 6 - "Sanctuary Resident Pathfinding & Wander Movement"
Cohesion: 0.09
Nodes (45): ACTOR_DEPTH_OFFSETS, animationExists(), beginWanderPause(), canOccupy(), canOccupyLogical(), capturePresentation(), clamp(), climbable() (+37 more)

### Community 7 - "Base Game Session State & Core Interaction Bindings"
Cohesion: 0.15
Nodes (8): BaseScene, CAMERA_MODES, targetFootprint(), gainXp(), getAnimal(), raiseBond(), playSanctuaryEffect(), trackSanctuaryEffect()

### Community 8 - "Vault Inspector Panel & Sanctuary Settings UI"
Cohesion: 0.11
Nodes (15): defaultPreviewTuning(), ONE_SHOT_ACTIONS, VaultScene, createNavIsland(), ACTION_ICONS, buildVaultOverlay(), diagnosticValues(), escapeHtml() (+7 more)

### Community 9 - "Wyvern Asset Preloading & Atlas Validation"
Cohesion: 0.13
Nodes (20): DEMO_WYVERNS, getDemoWyvern(), wyvernAtlasDataKey(), LOOPING_STATES, PreloadScene, atlasFrames(), buildReport(), firstUsableWyvernFrame() (+12 more)

### Community 11 - "Sanctuary 3D Projection Decor Geometry & Lighting"
Cohesion: 0.19
Nodes (25): DECOR_DRAWERS, createGeometry(), diamondMark(), drawArena(), drawBarredDoor(), drawColumn(), drawCrystal(), drawCrystalShard() (+17 more)

## Knowledge Gaps
- **31 isolated node(s):** `BIOME_KEYS`, `INTERACTIONS`, `config`, `game`, `SANCTUARY_SESSION` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SanctuaryCameraController` connect `Sanctuary Interactive Camera Rig & Pan Controller` to `Base Game Session State & Core Interaction Bindings`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `normalizeView()` connect `Sanctuary Isometric Camera Projection & Texture Baking` to `Core Game Architecture & Roster Systems`, `Interactive Sanctuary Affordances & Input Handling`, `Sanctuary Resident Pathfinding & Wander Movement`, `Base Game Session State & Core Interaction Bindings`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **What connects `BIOME_KEYS`, `INTERACTIONS`, `config` to the rest of the system?**
  _31 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Game Architecture & Roster Systems` be split into smaller, more focused modules?**
  _Cohesion score 0.05570611261668172 - nodes in this community are weakly interconnected._
- **Should `Procedural Isometric Tile Art & Shadow Drawing` be split into smaller, more focused modules?**
  _Cohesion score 0.08954203691045796 - nodes in this community are weakly interconnected._
- **Should `Sanctuary Isometric Camera Projection & Texture Baking` be split into smaller, more focused modules?**
  _Cohesion score 0.09043020193151888 - nodes in this community are weakly interconnected._
- **Should `Sanctuary Interactive Camera Rig & Pan Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.06584723441615452 - nodes in this community are weakly interconnected._