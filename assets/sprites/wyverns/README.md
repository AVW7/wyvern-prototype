# Wyvern sprite contract

The Dragon Vault, sanctuary, and missions share one profile-specific Phaser
atlas and one animation namespace per wyvern. A missing or invalid atlas falls
back to a colored generated dragon, so unfinished art must never prevent a
scene from opening.

Run this before opening the game after any sprite export:

```bash
npm run validate:atlas
```

The game intentionally loads large painted atlas files serially. Do not raise
Phaser's `loader.maxParallelDownloads` without testing a cold browser session:
parallel decoding of multiple 60+ MiB RGBA textures can intermittently fail and
leave an otherwise valid profile on its generated fallback.

Lower `atlas.loadPriority` values load first. Give portable atlases priority
over oversized compatibility-risk pages so one failing 4096+ px texture cannot
prevent valid profiles from reaching the sanctuary.

## Required profile and file setup

Each dragon has one row in `src/data/wyverns.js`:

```js
{
  id: 'wyv-01',
  name: 'Embertooth',
  assetKey: 'wyvern-embertooth',
  specialPower: {
    name: 'Fire Breath',
    description: 'Short character-facing description of the signature power.',
  },
  atlas: {
    image: 'assets/sprites/wyverns/Embertooth/wyvern_final_required_bundle/wyvern_required_atlas.png',
    data: 'assets/sprites/wyverns/Embertooth/wyvern_final_required_bundle/wyvern_required_atlas.json',
    initialFrame: 'idle_0',
    loadPriority: 20,
    origin: { x: 0.5, y: 0.88 },
  },
}
```

Paths and filenames are case-sensitive on production hosts. Keep one folder
per profile and use the same capitalization in the folder and catalog row.
Recommended new exports use `<profile-slug>.png` and `<profile-slug>.json`.

The public keys are fixed:

- Texture key: `wyvern-<profile-slug>`
- Animation key: `wyvern-<profile-slug>-<state>`
- Directional key: `wyvern-<profile-slug>-<state>-<direction>` (always registered)
- Example: `wyvern-embertooth-guard`
- Directional example: `wyvern-embertooth-fly-nw`

Do not put runtime animation keys in the atlas JSON. The loader constructs them
from the profile asset key, state name, and optional direction. All directional
keys are registered even when directional art is absent; those keys safely use
the east-facing baseline frames until authored frames are supplied.

## Required animation states

| State | Lifecycle | Intended technical read |
|---|---|---|
| `idle` | Loop | Neutral breathing or weight shift |
| `fly` | Loop | Wing cycle; runtime supplies altitude and shadow separation |
| `guard` | Loop | Braced or shielding pose |
| `attack` | One shot, then Idle | Anticipation, strike, follow-through |
| `special` | One shot, then Idle | This profile's unique signature power |
| `hurt` | One shot, then Idle | Clear impact and recovery |
| `death` | One shot, then Idle in the Vault | Missions retain existing death behavior |

Typical sprite playback is 8–24 FPS. Current per-state rates live in
`WYVERN_ART.frameRates` in `src/config.js`. Do not export duplicate frames just
to slow an action; timing is easier to tune in code.

## JSON requirements

The JSON must be a Phaser-compatible hash atlas with a `frames` object and a
custom `meta.animations` object. `frameTags` alone are not read at runtime.

```json
{
  "frames": {
    "idle_0": {
      "frame": { "x": 0, "y": 0, "w": 640, "h": 860 },
      "rotated": false,
      "trimmed": true,
      "spriteSourceSize": { "x": 192, "y": 64, "w": 640, "h": 860 },
      "sourceSize": { "w": 1024, "h": 1024 }
    }
  },
  "meta": {
    "image": "embertooth.png",
    "format": "RGBA8888",
    "size": { "w": 4096, "h": 4096 },
    "animations": {
      "idle": ["idle_0", "idle_1"],
      "fly": ["fly_0", "fly_1"],
      "guard": ["guard_0", "guard_1"],
      "attack": ["attack_0", "attack_1"],
      "special": ["special_0", "special_1"],
      "hurt": ["hurt_0", "hurt_1"],
      "death": ["death_0", "death_1"]
    }
  }
}
```

The validator checks required sequences, referenced frame names, frame bounds,
PNG/JSON dimensions, initial frame, rotated frames, and texture-size limits.
Errors fail `npm run check`; warnings preserve the runtime fallback.

Every catalog profile must also define `specialPower.name` and
`specialPower.description`. The public runtime state is always `special`, even
when the artwork is power-specific. For example, Embertooth aliases his existing
`fire_breath_*` frames through `meta.animations.special`. Mechanics such as
damage, targeting, cooldown, and effects do not belong in this sprite contract.
The loader registers `<assetKey>-special`, and the Vault exposes it alongside
the other technical previews. Gameplay mechanics and mission triggers remain
outside the sprite contract.

## Art and pivot requirements

- Export transparent RGBA PNGs with no matte color around the dragon.
- Supply **isolated source frames**, preferably one PNG per pose. Do not build
  animation strips by placing poses so close that wings, tails, particles, or
  breath effects cross a cell boundary. Atlas padding cannot repair artwork
  already flattened into its neighbour's cell.
- Recommended source canvas: **1024×1024 px** for normal poses. Keep the visible
  dragon around **600–750 px high**, centered at x=512, with ground contact at
  y=901 (`{ x: 0.5, y: 0.88 }`). Transparent trimming keeps the packed frame
  smaller while `sourceSize` retains the stable 1024×1024 pivot space.
- A wide signature power may use **1536×1024 px**, but every frame in that
  Special sequence must use the same canvas and normalized ground pivot. With
  the shared origin, that pivot is x=768, y=901; place the dragon around that
  point and allow the effect to extend through the remaining transparent area.
- Author the required baseline facing screen-right/east. The current mission
  renderer may horizontally flip this baseline while directional art is absent.
- Keep `sourceSize` stable within each animation sequence. The runtime derives
  one pixels-to-screen scale from the initial Idle frame and reuses it for all
  states, so broader poses remain broader instead of being resized per action.
- Keep the ground contact point consistent relative to each state's source
  canvas. Trimming is safe only when `spriteSourceSize` and `sourceSize` are
  exported correctly.
- Disable frame rotation in the packer. The validator warns on rotated frames.
- Leave **16 transparent pixels inside every source-frame edge** and configure
  **8–16 px extrusion/padding between packed atlas rectangles**. Source-frame
  clearance prevents pose overlap; packed padding prevents linear-filter bleed.
- Start with the shared `{ x: 0.5, y: 0.88 }` origin. Adjust the profile's
  optional `atlas.origin` only if the whole atlas consistently floats or sinks;
  do not compensate for individually misaligned frames in code.
- Real painted atlases use linear texture filtering. Generated placeholders
  and terrain retain the prototype's pixel-art presentation.

## Eight-direction sanctuary contract

The canonical implementation sequence and camera acceptance matrix live in
[`docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md`](../../../docs/SANCTUARY_ROTATABLE_CAMERA_PLAN.md).
This file remains the export and runtime asset contract.

The technical pipeline recognizes these screen-space directions in clockwise
order:

```text
n, ne, e, se, s, sw, w, nw
```

East (`e`) remains the required baseline from `meta.animations`, keeping an
atlas globally compatible before its turntable is complete. The current
sanctuary movement controller already resolves motion into all eight sectors
and plays these directional keys; missing sequences retain the east baseline
and produce a validator warning.

The sanctuary camera now implements `-45°..+45°` yaw and
lower/default/higher elevation. A dragon is ready for final camera-milestone
acceptance only when the following view-space coverage exists:

| State | Required direction coverage | Reason |
|---|---|---|
| `idle` | All 8 | Standing and resident pauses must turn with the view |
| `fly` | All 8 | Controlled movement and wandering use Fly |
| `attack` | All 8 before final acceptance | Training plays Attack |
| `guard` | All 8 before final acceptance | Feeding plays Guard |
| `special` | All 8 before final acceptance | The spring plays Special |
| `hurt`, `death` | East baseline until used in sanctuary | Still required by the global Mission/Vault contract |

Complete Idle/Fly first as the art vertical slice. Partial action coverage is
acceptable during development, but the final rotatable-camera milestone cannot
ship with visible interactions snapping back to east.

```json
{
  "meta": {
    "animations": {
      "idle": ["idle_0", "idle_1"],
      "fly": ["fly_0", "fly_1"]
    },
    "directionalAnimations": {
      "idle": {
        "n": ["idle_n_0", "idle_n_1"],
        "ne": ["idle_ne_0", "idle_ne_1"],
        "nw": ["idle_nw_0", "idle_nw_1"]
      },
      "fly": {
        "n": ["fly_n_0", "fly_n_1"],
        "sw": ["fly_sw_0", "fly_sw_1"]
      }
    }
  }
}
```

The object order is **state → direction → frame names**. Directional frames
live in the same Phaser atlas and use the same texture key. Preload registers
every key. `sanctuaryMovement.js` keeps world motion separate from the
projected `viewDirection` and recomputes the visible key after either movement
or camera yaw. Missing atlas sequences still resolve through the east baseline
fallback.
Mission controls may continue using their existing behavior until that scene
explicitly adopts the directional contract.

For high-quality painted dragons:

- Draw all eight views when silhouette, lighting, markings, scars, saddle, or
  effects are asymmetric. Do not rotate a 2D sprite to fake compass directions.
- Do not mirror north/south diagonals when lighting or anatomy would reverse.
  Mirroring is acceptable only as a clearly temporary scaffold.
- Use one scale, baseline, camera angle, light direction, and perceived volume
  across all directions. Compare directions as a turntable before animating.
- Keep the dragon's ground pivot fixed while the visible body changes direction.
  Flight altitude belongs to runtime presentation; do not move the source pivot
  upward in Fly frames.
- Maintain matching cadence and phase across directions. For example, frame 1
  of every Fly direction should represent the same wing-cycle phase.
- Treat the direction names as **view-space silhouettes**, not fixed world
  compass headings. The same world movement may choose a different view-facing
  after the sanctuary camera yaws.
- Keep action readability: anticipation, impact, and recovery must remain clear
  at the current 64 px sanctuary height and 180 px Vault preview height, not
  only at source resolution.

A complete eight-direction set for seven states can contain hundreds of frames.
The current loader supports one atlas PNG per dragon, so do not export a giant
full set beyond the GPU limit. Start with directional Idle/Fly, validate memory,
and keep the required east-facing action set while the action turntables are in
progress. Multi-page directional atlases require a deliberate profile-catalog,
loader, validator, runtime fallback, and cleanup extension before export; they
are not silently supported by this contract.

## Texture size and memory

The portable target is a maximum atlas side of **4096 px**. The desktop
contract permits up to **8192 px**, but the vault checks the actual WebGL
`MAX_TEXTURE_SIZE` and falls back when the current GPU cannot load the page.

PNG file size is not GPU memory size. An RGBA atlas uses approximately:

```text
width × height × 4 bytes
```

Embertooth's active required-state atlas is 4096×4350, about **68.0 MiB
decoded** even though the PNG on disk is much smaller. This is substantially
lighter than the retired 4096×6555 Ultimate Atlas, but its height still makes it
incompatible with devices capped at 4096-pixel textures.

If an atlas exceeds the limit, first remove unused future actions from the
runtime export or reduce the source resolution. The current loader expects a
single PNG page per profile; do not silently switch to a multi-page export.

## Visual quality acceptance checks

Review at 100% source scale, the 180 px Vault preview height, and the 64 px
sanctuary height at both overview and maximum zoom:

1. Solo every frame against black, white, and saturated magenta backgrounds.
   There must be no matte fringe, stray pixels, or pieces of another pose.
2. Toggle adjacent frames without playback. Feet/pivot stay fixed and the body
   changes through intentional motion rather than canvas drift.
3. Play loops for at least ten cycles. Idle, Fly, and Guard must not pop at the
   loop seam.
4. Play one-shots into Idle. Attack, Special, Hurt, and Death need clean first
   and last silhouettes with no accidental teleport.
5. Inspect Alpha, not just RGB. Fully transparent pixels may contain arbitrary
   RGB, but partially transparent edge pixels must not contain a colored matte.
6. Inspect every packed frame rectangle. No visible pixel may touch the packed
   rectangle edge after extrusion, and no neighbouring pose may be visible.
7. For directions, compare all views as a turntable and verify consistent size,
   anatomy, markings, light direction, pivot, and animation phase. In the
   sanctuary, move all eight directions at centre, left, and right camera yaw.
8. Run `npm run validate:atlas`, preview every state in the Vault, then run
   `npm run check` before accepting the export.

## Adding or replacing a dragon

1. Export the PNG and JSON using the contract above.
2. Put both files in that dragon's folder.
3. Add or update only the profile's `atlas` row in `src/data/wyverns.js`.
4. Run `npm run validate:atlas`.
5. Run `npm run dev`, enter the Dragon Vault, and confirm the asset badge says
   **Atlas loaded**.
6. Preview every state. Confirm the pivot does not jump, Fly separates from its
   shadow, and Attack/Hurt/Death return to Idle.
7. Enter the sanctuary and move all eight directions. For a camera-milestone
   profile, verify directional Idle/Fly and the Spring/Train/Feed action states
   at every supported yaw/elevation.
8. Use Technical Preview to find presentation values, then copy accepted
   shared defaults to `WYVERN_ART`; slider values are intentionally temporary.
   Reference Height is based on the initial Idle canvas, not each pose's
   trimmed visible bounds.
9. Run `npm run check` before handoff.

No changes should be needed in `VaultScene`, `Wyvern`, `PreloadScene`, or the
overlay when the profile and atlas obey this contract.

## Common failures

- **Generated placeholder / Atlas fallback:** Check the browser console and
  `npm run validate:atlas`; the image, JSON, or initial frame did not load.
- **Animation uses one static frame:** `meta.animations` is missing, empty,
  misspelled, or references absent frame names.
- **Dragon jitters between frames:** `sourceSize`, `spriteSourceSize`, or the
  ground contact point changes between exported frames.
- **Dragon is blurry:** Expected when detailed painted art is heavily
  downscaled. Tune display height first; do not enable global nearest-neighbor
  filtering for the painted atlas.
- **Dark or colored fringe:** The PNG has a matte/background or insufficient
  transparent padding.
- **The next pose appears beside the current frame:** Neighbouring artwork was
  flattened into the source cell before packing. Re-export isolated transparent
  frames; frame timing, Phaser filtering, JSON bounds, and atlas padding cannot
  reconstruct clipped anatomy.
- **A directional key shows the east pose:** That direction has no authored
  sequence, or the yaw-aware controller derived the wrong view-facing. Check
  `meta.directionalAnimations.<state>.<direction>`, the validator's
  partial-coverage warning, and the world-to-view direction transform.
- **Works locally but fails after deployment:** Check filename capitalization
  and remember that `file://` is unsupported; use Vite or a built static host.
- **Large atlas fails during repeated refreshes:** Restart the dev server and
  browser tab to release texture memory, then reduce the runtime atlas size.
  Hot-reloading a 100+ MiB decoded texture repeatedly is expensive.
