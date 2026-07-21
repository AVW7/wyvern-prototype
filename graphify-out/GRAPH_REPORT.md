# Graph Report - .  (2026-07-21)

## Corpus Check
- 133 files · ~205,429 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1108 nodes · 2632 edges · 134 communities (40 shown, 94 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 109 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
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
- Community 34
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
- Community 57
- Community 59
- Community 60
- Community 61
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
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 113
- Community 114
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 133

## God Nodes (most connected - your core abstractions)
1. `SanctuaryCameraController` - 51 edges
2. `rect()` - 45 edges
3. `polygon()` - 43 edges
4. `BaseScene` - 42 edges
5. `SanctuaryInteractionController` - 42 edges
6. `drawObjectShadow()` - 41 edges
7. `normalizeView()` - 30 edges
8. `projectFootprint()` - 26 edges
9. `AtlasScene` - 23 edges
10. `MissionScene` - 23 edges

## Surprising Connections (you probably didn't know these)
- `footprint()` --calls--> `gridToScreen()`  [EXTRACTED]
  tests/sanctuaryMovement.test.js → src/systems/iso.js
- `createSanctuaryWanderers()` --indirect_call--> `footprint()`  [INFERRED]
  src/systems/sanctuaryMovement.js → tests/sanctuaryMovement.test.js
- `pointerToCell()` --calls--> `unprojectGround()`  [EXTRACTED]
  tests/sanctuaryPicker.test.js → src/systems/sanctuaryProjection.js
- `tileGeometry()` --calls--> `projectedTileGeometry()`  [EXTRACTED]
  tests/sanctuaryTextureBake.test.js → src/systems/tileArt.js
- `rig()` --calls--> `createDragonMotion()`  [EXTRACTED]
  tests/sanctuaryMovement.test.js → src/systems/dragonMotion.js

## Import Cycles
- None detected.

## Communities (134 total, 94 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (96): TERRAIN, decorTextureKey(), drawDecor(), gridToScreen(), EXTERIOR_SANCTUARY_DECOR_TYPES, applyGroundPlaneTransform(), finite(), groundPlaneTransform() (+88 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (99): DECOR_DRAWERS, drawArena(), drawBarredDoor(), drawBasaltSpires(), drawBones(), drawButte(), drawCactus(), drawCherry() (+91 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (27): ACTION_MOTIONS, BaseScene, CAMERA_MODES, clamp(), SANCTUARY_SESSION, targetFootprint(), ACTION_TYPES, createActionPipeline() (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (22): ActionKeyBinding, addActionKeys(), BINDINGS, isActionDown(), KeyBinding, KeyboardAction, keyNameList(), onActionDown() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (60): bankWeights(), clamp(), createDragonMotion(), DEFAULTS, finite(), shortestAngle(), ACTOR_DEPTH_OFFSETS, beginWanderPause() (+52 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (27): COMBAT, DEMO_ENEMY_SPAWNS, EMOJI, ENEMY_STATES, ORDER_EFFECTS, WYVERN_ART, WYVERN_ORDERS, WYVERN_STATES (+19 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (46): align(), bank_cycle(), blend(), bone_of(), channelbag(), channels(), derive_all(), dracarys_cycle() (+38 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (21): ATLAS, ATOLL_RING, getPoi(), getRegion(), POIS, REGION_BLOBS, REGIONS, AtlasScene (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (5): displayObjectAlive(), distanceBetween(), pointerId(), SanctuaryInteractionController, pointer()

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (31): jsdom, dependencies, phaser, three, threejs-devtools-mcp, devDependencies, jsdom, typescript (+23 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (9): GAME, createSanctuaryCamera(), SANCTUARY_CAMERA_MODES, createFixture(), makeScene(), MockCamera, MockInput, MockKey (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (14): gridToWorld3D(), tileCenterY(), worldToGridCol(), worldToGridRow(), createSanctuary3D(), _geoCache, getInstancedBaseGeometry(), getRenderer() (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (18): ISO, BIOME_KEYS, BIOMES, atollCell(), buildAtlasWorld(), buildCell(), decorOffset(), HEIGHT_CURVES (+10 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (20): DOM, DOM.Iterable, ES2022, phaser, src, compilerOptions, allowJs, checkJs (+12 more)

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (14): SANCTUARY, createDragonDebugPanel(), applyTuning(), controlsForFolder(), isOneShot(), partitionMotionSlots(), resetTuning(), serializeTuning() (+6 more)

### Community 16 - "Community 16"
Cohesion: 0.15
Nodes (17): Game UI Frontend Agent Config, Game UI Frontend, 2D Maze Game Template, 2D Platform Game Template, GameBase Template Repository, Paddle Game Template (2D Breakout), Simple 2D Platformer Engine Template, 3D Web Games (+9 more)

### Community 17 - "Community 17"
Cohesion: 0.19
Nodes (13): Three.js Lighting, DirectionalLight, DirectionalLightHelper, Image-Based Lighting, Light Helpers, PMREMGenerator, PointLight, PointLightHelper (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (10): bakeFacePixels(), _canvasCache, DEFAULTS, mix(), neighbourOcclusion(), parseHex(), cell(), FLAT (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.23
Nodes (12): Three.js Animation, Animation Blending, AnimationAction, AnimationClip, AnimationMixer, Clock, ColorKeyframeTrack, Keyframe Animation (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.20
Nodes (12): Three.js Fundamentals, CubeCamera, DragControls, Environment Lighting, Group, Line, LineSegments, Object3D (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.38
Nodes (8): cellAt(), clamp(), createHeightField(), easeGroundHeight(), finite(), sampleHeight(), sampleSlope(), slopeAlong()

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (9): configPath, __dirname, __filename, generateProps(), getBlenderExecutable(), main(), processFlightClips(), rootDir (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.22
Nodes (9): Three.js Skills for Claude Code, Three.js Geometry, ContactShadows, InstancedBufferAttribute, InstancedBufferGeometry, InstancedMesh, Instancing, Mesh (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (9): Three.js Interaction, Camera Controls, FlyControls, Mouse Picking, Object Selection, OrbitControls, PointerLockControls, Raycaster (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (8): BoxGeometry, BufferAttribute, BufferGeometry, Custom BufferGeometry, EdgesGeometry, PlaneGeometry, SphereGeometry, WireframeGeometry

### Community 27 - "Community 27"
Cohesion: 0.46
Nodes (6): buildSanctuaryExterior(), buildSanctuaryInterior(), INTERACTIONS, makeBuilder(), RESIDENT_SPOTS, VAULT_PREVIEW_SPOT

### Community 28 - "Community 28"
Cohesion: 0.68
Nodes (7): build_crystal_pylon(), build_dragon_brazier(), build_sanctuary_pedestal(), clear_scene(), create_material(), export_glb(), main()

### Community 29 - "Community 29"
Cohesion: 0.33
Nodes (7): Bone, Bone Attachments, GLTFLoader, Skeletal Animation, Skeleton, SkeletonHelper, SkinnedMesh

### Community 31 - "Community 31"
Cohesion: 0.80
Nodes (3): clamp(), solveLocomotionBlendTree(), solveSteeringBlendTree()

### Community 32 - "Community 32"
Cohesion: 0.60
Nodes (3): createCreatureFSM(), CREATURE_STATES, VALID_TRANSITIONS

### Community 34 - "Community 34"
Cohesion: 0.50
Nodes (3): io, KEEP, root

## Knowledge Gaps
- **223 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+218 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **94 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SanctuaryCameraController` connect `Community 3` to `Community 2`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `SanctuaryInteractionController` connect `Community 8` to `Community 0`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `MissionScene` connect `Community 13` to `Community 5`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _243 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05069260241674035 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06472491909385113 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07927927927927927 - nodes in this community are weakly interconnected._