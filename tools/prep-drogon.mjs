// One-off asset prep for Milestone 2 of docs/SANCTUARY_3D_DRAGON_PLAN.md.
// Drogon ships as 121 MB: 52 animation clips x 292 bones of keyframe data,
// plus legacy KHR_materials_pbrSpecularGlossiness materials that Three.js
// no longer supports. This keeps only the clips the sanctuary plays,
// converts the materials to pbrMetallicRoughness, and downsizes textures.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  metalRough, prune, dedup, textureCompress, resample, quantize, meshopt,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = process.argv[2];
const DST = process.argv[3];

// Suffixes of the clips the sanctuary actually plays. Everything else
// (attacks, deaths, damage reactions, turns) is dead weight here.
const KEEP = [
  'DaenerysDragon_Neutural_Watch',   // idle
  'DaenerysDragon_Battle_Walk',      // walk
  'DaenerysDragon_Battle_SkyMoveL',  // fly candidate A
  'DaenerysDragon_Battle_Up',        // fly candidate B
];

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
for (const a of root.listAnimations()) console.log('  ', a.getName());

await MeshoptEncoder.ready;

await doc.transform(
  metalRough(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  // The bulk of this file is keyframes: 4 clips x ~640 channels x 292 bones,
  // exported at full sample density. resample() drops keyframes that are
  // interpolable from their neighbours, which is most of them on a rig this
  // dense. quantize + meshopt then compress what survives.
  resample({ tolerance: 1e-4 }),
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
