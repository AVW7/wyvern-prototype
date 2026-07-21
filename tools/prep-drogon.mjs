// One-off asset prep for Milestone 2 of docs/SANCTUARY_3D_DRAGON_PLAN.md.
// Drogon ships as 121 MB: 52 animation clips x 292 bones of keyframe data,
// plus legacy KHR_materials_pbrSpecularGlossiness materials that Three.js
// no longer supports. This keeps only the clips the sanctuary plays,
// converts the materials to pbrMetallicRoughness, and downsizes textures.
//
// SRC is no longer the Sketchfab download. tools/blender-flight-clips.py reads
// that, derives the eight flight clips the source never shipped, and writes the
// intermediate GLB this compresses:
//
//   blender --background --python tools/blender-flight-clips.py -- \
//       ~/Downloads/drogon-game-of-thrones-dragon/source/Dragon.fbx derived.glb
//   node tools/prep-drogon.mjs derived.glb \
//       assets/models/dragon/drogon-sanctuary.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  metalRough, prune, dedup, textureCompress, resample, quantize, meshopt,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = process.argv[2];
const DST = process.argv[3];

// Suffixes of the clips the sanctuary actually plays. The source ships 52;
// these are the ones systems/dragonMotion.js can drive. Everything else
// (deaths, damage reactions, the other 10 skills) is dead weight here.
// Suffix match, so 'Battle_Walk' does not also catch 'Battle_WalkL'.
const KEEP = [
  'DaenerysDragon_Neutural_Watch',   // idle
  'DaenerysDragon_Neutural_Roar',    // idle break / special
  'AA_DaenerysDragon_Battle_Stand',  // alert base pose / hover
  'DaenerysDragon_Battle_Walk',      // walk forward
  'DaenerysDragon_Battle_WalkL',     // walk turning left
  'DaenerysDragon_Battle_WalkR',     // walk turning right
  'DaenerysDragon_Battle_TurnL20',   // small heading correction, left
  'DaenerysDragon_Battle_TurnR20',   // small heading correction, right
  'DaenerysDragon_Battle_TurnL90',   // turn in place, left
  'DaenerysDragon_Battle_TurnR90',   // turn in place, right
  'DaenerysDragon_Battle_Attack04',  // short attack
  'DaenerysDragon_Battle_Skill08',   // fire-breath candidate
  // ── Added for the preset vocabulary — docs/WYVERN_DEBUG_PANEL_PLAN.md M4.
  // Picked by measuring each clip's foot-drop relative to the pelvis across
  // the source's 52 actions: the airborne clips cluster at 570-660, and
  // Skill10_L/R sit squarely in it, which is what identifies them as the
  // aerial attack. (The pelvis itself never leaves 414 in any clip — this rig
  // animates in place and lets the engine move the character, so height alone
  // tells you nothing.) Rendered stills confirmed each one by eye.
  'DaenerysDragon_Battle_Skill10_L',  // fly attack, left-hand pass
  'DaenerysDragon_Battle_Skill10_R',  // fly attack, right-hand pass
  'DaenerysDragon_Battle_Attack01',   // second ground attack, so it can vary
  'DaenerysDragon_Battle_TurnL180',   // about-face left; 20/90 could not
  'DaenerysDragon_Battle_TurnR180',   // about-face right
  // ── Derived by tools/blender-flight-clips.py; not in the Sketchfab source.
  // They replace SkyMoveL/R (banked, never level), Battle_Up (8.2 s) and
  // Battle_Down (a descent loop that never reached the ground), all of which
  // are inputs to the derivation now and so are no longer kept themselves.
  'Fly_Level_Loop',   // cruise; the clip the cross-blend was standing in for
  'Fly_BankL_Loop',   // air bank left
  'Fly_BankR_Loop',   // air bank right
  'Fly_Glide_Loop',   // wings held out — glide / scout
  'Fly_Hover_Loop',   // airborne and stationary
  'Fly_Takeoff',      // 2.5 s, resolves onto the level cycle's first frame
  'Fly_Land',         // resolves onto the ground pose the idles start from
  'Fly_Dracarys',     // fire breath on the wing
];

// Deliberately NOT kept, both because they duplicate a clip already here:
//   Skill11_L/R  — keyframe-identical to Skill10_L/R (same foot-drop to one
//     decimal, same key counts). Fire is a particle effect the game spawns
//     over a clip, never baked into one (see createDracarysParticles() in
//     systems/sanctuary3D.js), so "fly attack with fire" is Skill10 plus the
//     emitter rather than a second clip.
//   SkyMoveR01   — measured wingtip bank over the cycle returns SkyMoveR's
//     profile to the decimal. It was briefly kept as a "level cruise"; that
//     was wrong. The source has no level sky clip at all, which is why
//     Fly_Level_Loop above is derived rather than kept.

// Root bones whose translation tracks are reported by the audit below. The rig
// has three top-level roots; the Bip002 chain is the one that drives the skin.
const ROOT_BONES = /^(Root_|Bip001_|Bip002_)\d+$/;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
const root = doc.getRoot();

let dropped = 0;
for (const anim of root.listAnimations()) {
  const name = anim.getName();
  if (KEEP.some((k) => name.endsWith(k))) {
    // Strip the "SKM_DaenerysDragon|" prefix so config keys stay readable.
    anim.setName(name.split('|').pop());
  } else {
    // Animation.dispose() does not cascade to its channels and samplers, and
    // orphaned samplers keep their accessors alive — which is what kept all
    // 52 clips' keyframes (~85 MB) in the file even after dropping 48 of them.
    for (const channel of anim.listChannels()) channel.dispose();
    for (const sampler of anim.listSamplers()) sampler.dispose();
    anim.dispose();
    dropped++;
  }
}
console.log(`dropped ${dropped} clips, kept ${root.listAnimations().length}:`);

// Root-motion audit. These clips animate the root bone's translation, so a
// clip whose root does not return to where it started walks the model out from
// under its own shadow and selection ring every loop. `sway` is how far the
// body travels inside the cycle (life, fine); `net` is start-to-end drift (a
// problem, and the number to check when adding a clip to KEEP). Report only —
// zeroing these tracks would unplant the feet the animator keyed against them,
// which is the foot-sliding this whole change exists to remove.
// Bone units; the runtime scales the model by ~0.044 of these.
for (const anim of root.listAnimations()) {
  const parts = [];
  for (const channel of anim.listChannels()) {
    const node = channel.getTargetNode();
    if (channel.getTargetPath() !== 'translation' || !ROOT_BONES.test(node?.getName() || '')) {
      continue;
    }
    const values = channel.getSampler()?.getOutput()?.getArray();
    if (!values) continue;
    const axis = (k) => {
      let min = Infinity;
      let max = -Infinity;
      for (let i = k; i < values.length; i += 3) {
        if (values[i] < min) min = values[i];
        if (values[i] > max) max = values[i];
      }
      return max - min;
    };
    const net = Math.hypot(
      values[values.length - 3] - values[0],
      values[values.length - 1] - values[2],
    );
    parts.push(`${node.getName()} sway ${axis(0).toFixed(0)}/${axis(1).toFixed(0)}/${axis(2).toFixed(0)} net ${net.toFixed(1)}`);
  }
  console.log(`   ${anim.getName()}${parts.length ? ` — ${parts.join(', ')}` : ''}`);
}

await MeshoptEncoder.ready;

await doc.transform(
  metalRough(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  // The bulk of this file is keyframes: 25 clips x ~690 channels x 230 bones,
  // exported at full sample density. resample() drops keyframes that are
  // interpolable from their neighbours, which is most of them on a rig this
  // dense. quantize + meshopt then compress what survives.
  //
  // 1e-3, not the 1e-4 this used before Blender was in the pipeline. Blender
  // re-bakes every bone on every frame, which took the file from 10.5 MB to
  // 14.4 MB at the old tolerance; 1e-3 brings it to 8.8 MB — smaller than
  // before, with eight more clips. Measured cost, slerp-sampled against a 1e-4
  // build across all 25 clips: 6.7° peak on Bip002-Ponytail1 and ~3.5° on the
  // toes, with 9 of 231 bones over 2°, on a model that renders 64 px tall.
  // Not 1e-2, which is 6.2 MB but collapses Fly_Glide_Loop from 48 keys to 16
  // and smooths its breathe away entirely.
  resample({ tolerance: 1e-3 }),
  dedup(),
  prune(),
  quantize(),
);

// Every animation accessor still indexes into the single ~85 MB buffer view
// that held all 52 original clips, so dropping clips freed nothing on disk.
// Copying each accessor's array detaches it from that shared view and forces
// the writer to allocate tightly-packed views for only the data we kept.
for (const accessor of root.listAccessors()) {
  const array = accessor.getArray();
  if (array) accessor.setArray(array.slice());
}
await doc.transform(prune());

await io.write(DST, doc);
console.log('wrote', DST);
