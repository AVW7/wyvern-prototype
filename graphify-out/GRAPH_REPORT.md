# Graph Report - .  (2026-07-21)

## Corpus Check
- 283 files · ~8,231,764 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1075 nodes · 2537 edges · 113 communities (31 shown, 82 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 193 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Isometric Coordinate Systems & Ground Plane Configuration
- Wyvern Roster Configurations & Atlas Validation
- Procedural Isometric Tile Art Drawing
- Sanctuary Camera Control & Input Bindings
- Sanctuary Interaction Systems & Target Footprints
- Base Game Scene Orchestration
- World Map Biomes Generation & POIs Roster
- Sanctuary Resident Pathfinding & Wander Movement
- Wyvern Sprite Sets & Animation Atlas
- Sanctuary Resident 3D Dragon Motion System
- Multi-AI Project Guidelines & Collaboration Context
- Package Configuration & Tooling Dependencies
- Mission Combat Loop & Enemy Spawners
- Sanctuary Camera Testing & Fixtures
- Procedural 3D Sanctuary Decor Geometry
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112

## God Nodes (most connected - your core abstractions)
1. `SanctuaryCameraController` - 51 edges
2. `rect()` - 45 edges
3. `polygon()` - 43 edges
4. `SanctuaryInteractionController` - 42 edges
5. `drawObjectShadow()` - 41 edges
6. `BaseScene` - 40 edges
7. `normalizeView()` - 30 edges
8. `projectFootprint()` - 26 edges
9. `AtlasScene` - 23 edges
10. `MissionScene` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Subzero Wyvern Character` --conceptually_related_to--> `Drogon Dragon Body Texture`  [INFERRED]
  assets/sprites/wyverns/Subzero/se_idle_0.png → wyvernassets-3d testing/drogon-game-of-thrones-dragon/textures/T_DaenerysDragon_Body_D.png
- `Subzero Wyvern Character` --conceptually_related_to--> `Mega Wyvern Base Color Texture`  [INFERRED]
  assets/sprites/wyverns/Subzero/se_idle_0.png → wyvernassets-3d testing/mega_wyvern 2/textures/Dragon_Boss_05_baseColor.png
- `footprint()` --calls--> `gridToScreen()`  [EXTRACTED]
  tests/sanctuaryMovement.test.js → src/systems/iso.js
- `createFixture()` --calls--> `createSanctuaryCamera()`  [EXTRACTED]
  tests/sanctuaryCamera.test.js → src/systems/sanctuaryCamera.js
- `createSanctuaryWanderers()` --indirect_call--> `footprint()`  [INFERRED]
  src/systems/sanctuaryMovement.js → tests/sanctuaryMovement.test.js

## Import Cycles
- None detected.

## Communities (113 total, 82 thin omitted)

### Community 0 - "Isometric Coordinate Systems & Ground Plane Configuration"
Cohesion: 0.07
Nodes (76): ISO, TERRAIN, decorTextureKey(), drawDecor(), gridToScreen(), EXTERIOR_SANCTUARY_DECOR_TYPES, applyGroundPlaneTransform(), finite() (+68 more)

### Community 1 - "Wyvern Roster Configurations & Atlas Validation"
Cohesion: 0.06
Nodes (44): root, COMBAT, DEMO_ENEMY_SPAWNS, EMOJI, ENEMY_STATES, ORDER_EFFECTS, WYVERN_ART, WYVERN_ORDERS (+36 more)

### Community 2 - "Procedural Isometric Tile Art Drawing"
Cohesion: 0.09
Nodes (74): drawArena(), drawBarredDoor(), drawBasaltSpires(), drawBones(), drawButte(), drawCactus(), drawCherry(), drawChest() (+66 more)

### Community 3 - "Sanctuary Camera Control & Input Bindings"
Cohesion: 0.07
Nodes (20): ActionKeyBinding, addActionKeys(), BINDINGS, isActionDown(), isActionJustDown(), KeyBinding, onActionDown(), cameraRigTuning() (+12 more)

### Community 4 - "Sanctuary Interaction Systems & Target Footprints"
Cohesion: 0.08
Nodes (26): actorGroundFootprint(), actorLogicalFootprint(), clamp(), createSanctuaryInteractions(), DEFAULT_TUNING, DEFAULT_VIEW, defaultPointFromLogical(), displayObjectAlive() (+18 more)

### Community 5 - "Base Game Scene Orchestration"
Cohesion: 0.08
Nodes (26): onKeydown(), ACTION_MOTIONS, BaseScene, CAMERA_MODES, clamp(), SANCTUARY_SESSION, targetFootprint(), addAnimal() (+18 more)

### Community 6 - "World Map Biomes Generation & POIs Roster"
Cohesion: 0.07
Nodes (37): ATLAS, ATOLL_RING, getPoi(), getRegion(), POIS, REGION_BLOBS, REGIONS, BIOME_KEYS (+29 more)

### Community 7 - "Sanctuary Resident Pathfinding & Wander Movement"
Cohesion: 0.07
Nodes (54): keyNameList(), ACTOR_DEPTH_OFFSETS, animationExists(), beginWanderPause(), canOccupy(), canOccupyLogical(), capturePresentation(), clamp() (+46 more)

### Community 8 - "Wyvern Sprite Sets & Animation Atlas"
Cohesion: 0.07
Nodes (47): Cinderlash Idle Animation, Cinderlash Special Animation, Cinderlash Wyvern Atlas 4096, Cinderlash Wyvern Atlas 8192, Embertooth Attack Animation, Embertooth Death Animation, Embertooth Fly Animation, Embertooth Guard Animation (+39 more)

### Community 9 - "Sanctuary Resident 3D Dragon Motion System"
Cohesion: 0.07
Nodes (28): SANCTUARY, createDragonMotion(), DEFAULTS, shortestAngle(), gridToWorld3D(), tileCenterY(), worldToGridCol(), worldToGridRow() (+20 more)

### Community 10 - "Multi-AI Project Guidelines & Collaboration Context"
Cohesion: 0.07
Nodes (33): A* pathfinding, AGENTS.md, AI_CONTEXT.md, AI_CONTRIBUTIONS.md, AtlasScene, BaseScene, CLAUDE.md, Claude (+25 more)

### Community 11 - "Package Configuration & Tooling Dependencies"
Cohesion: 0.07
Nodes (28): jsdom, dependencies, phaser, three, devDependencies, jsdom, typescript, vite (+20 more)

### Community 12 - "Mission Combat Loop & Enemy Spawners"
Cohesion: 0.13
Nodes (3): Enemy, MissionScene, ensureBackdropTexture()

### Community 13 - "Sanctuary Camera Testing & Fixtures"
Cohesion: 0.10
Nodes (8): GAME, SANCTUARY_CAMERA_MODES, createFixture(), makeScene(), MockCamera, MockInput, MockKey, WORLD_BOUNDS

### Community 14 - "Procedural 3D Sanctuary Decor Geometry"
Cohesion: 0.19
Nodes (25): DECOR_DRAWERS, createGeometry(), diamondMark(), drawArena(), drawBarredDoor(), drawColumn(), drawCrystal(), drawCrystalShard() (+17 more)

### Community 15 - "Community 15"
Cohesion: 0.16
Nodes (9): buildSanctuaryExterior(), buildSanctuaryInterior(), INTERACTIONS, makeBuilder(), RESIDENT_SPOTS, VAULT_PREVIEW_SPOT, VaultScene, createNavIsland() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (20): DOM, DOM.Iterable, ES2022, phaser, src, compilerOptions, allowJs, checkJs (+12 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (17): Game UI Frontend Agent Config, Game UI Frontend, 2D Maze Game Template, 2D Platform Game Template, GameBase Template Repository, Paddle Game Template (2D Breakout), Simple 2D Platformer Engine Template, 3D Web Games (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.19
Nodes (13): Three.js Lighting, DirectionalLight, DirectionalLightHelper, Image-Based Lighting, Light Helpers, PMREMGenerator, PointLight, PointLightHelper (+5 more)

### Community 19 - "Community 19"
Cohesion: 0.23
Nodes (12): Three.js Animation, Animation Blending, AnimationAction, AnimationClip, AnimationMixer, Clock, ColorKeyframeTrack, Keyframe Animation (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.20
Nodes (12): Three.js Fundamentals, CubeCamera, DragControls, Environment Lighting, Group, Line, LineSegments, Object3D (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (9): Three.js Skills for Claude Code, Three.js Geometry, ContactShadows, InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, Instancing, Mesh (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (9): Three.js Interaction, Camera Controls, FlyControls, Mouse Picking, Object Selection, OrbitControls, PointerLockControls, Raycaster (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.29
Nodes (8): 3D models README, Wyvern sprite contract, Roadmap, Sanctuary 3D Dragon Experiment, Sanctuary Free-Roam Redesign, Sanctuary Rotatable Camera and Directional Wyverns, Wyvern Prototype Entry Point, Mega Wyvern License

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (8): BoxGeometry, BufferAttribute, BufferGeometry, Custom BufferGeometry, EdgesGeometry, PlaneGeometry, SphereGeometry, WireframeGeometry

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (7): Bone, Bone Attachments, GLTFLoader, Skeletal Animation, Skeleton, SkeletonHelper, SkinnedMesh

### Community 26 - "Community 26"
Cohesion: 1.00
Nodes (5): Cinderlash Attack Animation, Cinderlash Death Animation, Cinderlash Fly Animation, Cinderlash Guard Animation, Cinderlash Hurt Animation

### Community 27 - "Community 27"
Cohesion: 0.60
Nodes (5): threejs-loaders, threejs-materials, threejs-postprocessing, threejs-shaders, threejs-textures

### Community 29 - "Community 29"
Cohesion: 0.50
Nodes (3): io, KEEP, root

## Knowledge Gaps
- **239 isolated node(s):** `WYVERN_ART`, `name`, `version`, `private`, `type` (+234 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **82 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SanctuaryCameraController` connect `Sanctuary Camera Control & Input Bindings` to `Base Game Scene Orchestration`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `normalizeView()` connect `Isometric Coordinate Systems & Ground Plane Configuration` to `Sanctuary Interaction Systems & Target Footprints`, `Base Game Scene Orchestration`, `Sanctuary Resident Pathfinding & Wander Movement`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `WYVERN_ART`, `name`, `version` to the rest of the system?**
  _239 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Isometric Coordinate Systems & Ground Plane Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.06591865357643759 - nodes in this community are weakly interconnected._
- **Should `Wyvern Roster Configurations & Atlas Validation` be split into smaller, more focused modules?**
  _Cohesion score 0.058544303797468354 - nodes in this community are weakly interconnected._
- **Should `Procedural Isometric Tile Art Drawing` be split into smaller, more focused modules?**
  _Cohesion score 0.08954203691045796 - nodes in this community are weakly interconnected._
- **Should `Sanctuary Camera Control & Input Bindings` be split into smaller, more focused modules?**
  _Cohesion score 0.06651017214397496 - nodes in this community are weakly interconnected._