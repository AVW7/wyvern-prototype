import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GAME, SANCTUARY, TERRAIN } from '../config.js';
import { BIOMES } from '../data/biomes.js';
import { TILE_SIZE, HEIGHT_SCALE, gridToWorld3D, tileCenterY } from './grid3d.js';
import { createDragonMotion } from './dragonMotion.js';
import { createNoise } from './noise.js';
import { ensureDecorTexture } from './textureBake.js';
import { neighbourOcclusion, tileFaceCanvases } from './tileTexture3D.js';

// Enable Three.js global Cache
THREE.Cache.enabled = true;

// Resting height (world units) of a resident's name label above its group
// origin. Flight altitude is added on top so the label rides up with the model.
const LABEL_BASE_Y = 32;

// ── Module-level caches ────────────────────────────────────────────────
// These survive across createSanctuary3D calls (recruit rebuilds, scene
// travel) so the browser never exhausts WebGL contexts, re-parses the
// GLTF model, or re-uploads identical textures to VRAM.

/** @type {THREE.WebGLRenderer | null} */
let _renderer = null;

/**
 * Cached GLTF result keyed by URL. Contains the parsed scene graph and
 * animation clips so successive calls clone from memory instead of hitting
 * the network and CPU parser again.
 * @type {Map<string, {scene: THREE.Group, animations: THREE.AnimationClip[]}>}
 */
const _gltfCache = new Map();

/**
 * THREE.CanvasTexture instances keyed by the Phaser texture key they were
 * built from. Avoids duplicate GPU texture uploads when the same decor or
 * species sprite appears in multiple tiles/residents.
 * @type {Map<string, THREE.CanvasTexture>}
 */
const _textureCache = new Map();

/**
 * BoxGeometry keyed by height level. The 40×40 grid has only ~5 distinct
 * height values, so caching reduces ~1600 geometry allocations to ≤5.
 * @type {Map<number, THREE.BoxGeometry>}
 */
const _geoCache = new Map();

/**
 * MeshStandardMaterial arrays keyed by `biome` name. Each entry is a
 * 6-element array matching Three.js BoxGeometry face order.
 * @type {Map<string, THREE.MeshStandardMaterial[]>}
 */
const _matCache = new Map();

/**
 * Single shared base geometry for instanced terrain voxels, translated
 * so its bottom is at Y = 0.
 * @type {THREE.BoxGeometry | null}
 */
let _instancedBaseGeo = null;

function getInstancedBaseGeometry() {
  if (!_instancedBaseGeo) {
    _instancedBaseGeo = new THREE.BoxGeometry(TILE_SIZE, 1, TILE_SIZE);
    _instancedBaseGeo.translate(0, 0.5, 0);
  }
  return _instancedBaseGeo;
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Lazily create / return the single WebGLRenderer for the #dragon3d canvas. */
function getRenderer() {
  const target = document.getElementById('dragon3d');
  if (!target) return null;

  if (_renderer && _renderer.domElement === target) return _renderer;

  // First call, or canvas was replaced (shouldn't happen in this prototype).
  if (_renderer) _renderer.dispose();
  _renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true });
  _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _renderer.setClearColor(0x000000, 0);
  _renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Filmic response curve. Without it the emissive lava and the sunlit tile
  // tops clip straight to white and the whole diorama reads as flat plastic.
  _renderer.toneMapping = THREE.ACESFilmicToneMapping;
  _renderer.toneMappingExposure = SANCTUARY.terrain3D?.exposure ?? 1.05;
  _renderer.shadowMap.enabled = true;
  _renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return _renderer;
}

/**
 * Get or create a cached BoxGeometry for the given tile height.
 * @param {number} h - Tile height level (1–5).
 */
function getTileGeometry(h) {
  if (!_geoCache.has(h)) {
    _geoCache.set(h, new THREE.BoxGeometry(TILE_SIZE, h * HEIGHT_SCALE, TILE_SIZE));
  }
  return _geoCache.get(h);
}

/**
 * Get or create a cached 6-face material array for the given biome.
 * @param {string} biome - Biome key from BIOMES.
 */
function getTileMaterials(biome) {
  if (_matCache.has(biome)) return _matCache.get(biome);

  const biomeData = BIOMES[biome] || BIOMES.moss;
  const topColor = new THREE.Color(biomeData.top);
  const sideColor = new THREE.Color(biomeData.left || biomeData.dark);
  const tuning = SANCTUARY.terrain3D || {};

  // Procedural grain/strata for the faces. The bake is the biome's own palette
  // shaded against itself, so `color` stays white here — otherwise the palette
  // would be applied twice and the tiles would come out muddy. Falls back to
  // flat colour if the canvas is unavailable (headless, no 2D context).
  const faces = tileFaceCanvases(biome, biomeData, tuning.texture);
  const faceMap = (canvas) => {
    if (!canvas) return null;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  };
  const topMap = faceMap(faces?.top);
  const sideMap = faceMap(faces?.side);

  const sideMat = new THREE.MeshStandardMaterial({
    color: sideMap ? 0xffffff : sideColor,
    map: sideMap,
    roughness: 0.82,
  });

  let topMat;
  if (biome === 'springwater') {
    // Opaque bed. The animated surface is a separate mesh laid over these tiles
    // (see buildWaterSurface) — the old transparent top face showed the inside
    // of the box, which is why the lagoon read as a hole rather than water.
    topMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(biomeData.dark || biomeData.top),
      roughness: 0.7,
    });
  } else if (biome === 'lava') {
    topMat = new THREE.MeshStandardMaterial({
      color: topMap ? 0xffffff : topColor,
      map: topMap,
      // The baked crust doubles as the emissive mask, so the glow sits in the
      // dark fissures between the cooled plates instead of washing the surface.
      emissiveMap: topMap,
      roughness: 0.9,
      emissive: new THREE.Color('#ff4500'),
      emissiveIntensity: tuning.lava?.emissiveMin ?? 1.5,
    });
    // Tagged so update() can breathe the glow without re-finding it.
    topMat.userData.isLava = true;
  } else {
    topMat = new THREE.MeshStandardMaterial({
      color: topMap ? 0xffffff : topColor,
      map: topMap,
      roughness: 0.92,
    });
  }

  const materials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
  // Shared across every createSanctuary3D call — destroy() must not dispose
  // these, which is what this flag tells it.
  materials.forEach((m) => { m._sanctuary3DCached = true; });
  _matCache.set(biome, materials);
  return materials;
}

/**
 * Get or create a cached THREE.CanvasTexture from a Phaser source image.
 * Uses NearestFilter to keep pixel-art textures crisp.
 * @param {string} key - Phaser texture key.
 * @param {HTMLCanvasElement | HTMLImageElement} sourceImage
 */
function getCachedTexture(key, sourceImage) {
  if (_textureCache.has(key)) return _textureCache.get(key);

  const tex = new THREE.CanvasTexture(sourceImage);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  _textureCache.set(key, tex);
  return tex;
}

// ── 3D Prop Geometry Builders ──────────────────────────────────────────

function build3DCrystal() {
  const geo = new THREE.OctahedronGeometry(6, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    roughness: 0.05,
    metalness: 0.9,
    emissive: 0x004444,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.85
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.set(1, 2.2, 1);
  mesh.position.y = 10; // Elevate slightly so center is above the tile
  return mesh;
}

function build3DObelisk() {
  const group = new THREE.Group();
  
  // Base pedestal
  const baseGeo = new THREE.BoxGeometry(8, 2, 8);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x5a5d64,
    roughness: 0.85,
    metalness: 0.1
  });
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 1;
  group.add(base);
  
  // Pillar (4-sided cylinder)
  const pillarGeo = new THREE.CylinderGeometry(2, 3, 16, 4);
  const pillar = new THREE.Mesh(pillarGeo, stoneMat);
  pillar.position.y = 10;
  group.add(pillar);
  
  // Pyramid cap
  const capGeo = new THREE.ConeGeometry(2 * Math.sqrt(2), 3, 4);
  capGeo.rotateY(Math.PI / 4);
  const cap = new THREE.Mesh(capGeo, stoneMat);
  cap.position.y = 19.5;
  group.add(cap);
  
  // Add a glowing rune core or light
  const runeGeo = new THREE.BoxGeometry(0.5, 6, 0.5);
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x00ffcc,
    emissive: 0x00ffcc,
    emissiveIntensity: 2.0
  });
  const rune = new THREE.Mesh(runeGeo, runeMat);
  rune.position.set(0, 10, 3.01);
  group.add(rune);

  return group;
}

function build3DBrazier() {
  const group = new THREE.Group();
  
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x2c2d30,
    roughness: 0.6,
    metalness: 0.8
  });
  
  // Base ring
  const baseGeo = new THREE.CylinderGeometry(3.5, 3.5, 1, 16);
  const base = new THREE.Mesh(baseGeo, metalMat);
  base.position.y = 0.5;
  group.add(base);
  
  // Post
  const postGeo = new THREE.CylinderGeometry(0.8, 0.8, 9, 8);
  const post = new THREE.Mesh(postGeo, metalMat);
  post.position.y = 5.5;
  group.add(post);
  
  // Bowl (Hemisphere, open at top)
  const bowlGeo = new THREE.SphereGeometry(3.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  bowlGeo.rotateX(Math.PI);
  const bowlMat = new THREE.MeshStandardMaterial({
    color: 0x2c2d30,
    roughness: 0.6,
    metalness: 0.8,
    side: THREE.DoubleSide
  });
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  bowl.position.y = 10;
  group.add(bowl);
  
  // Coals inside bowl
  const coalGeo = new THREE.DodecahedronGeometry(2, 0);
  const coalMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.95,
    metalness: 0.1
  });
  const coals = new THREE.Mesh(coalGeo, coalMat);
  coals.position.y = 9.5;
  coals.name = "coals";
  group.add(coals);

  // Unlit flame mesh (invisible until lit)
  const flameGeo = new THREE.SphereGeometry(1.5, 8, 8);
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff4500,
    emissive: 0xff4500,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0
  });
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.y = 11;
  flame.name = "flameCore";
  group.add(flame);
  
  return group;
}

function build3DDummy() {
  const group = new THREE.Group();
  
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.9,
    metalness: 0.1
  });
  
  const strawMat = new THREE.MeshStandardMaterial({
    color: 0xd2b48c,
    roughness: 0.95,
    metalness: 0.05
  });
  
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a4a,
    roughness: 0.5,
    metalness: 0.7
  });
  
  // Base stand
  const baseGeo = new THREE.BoxGeometry(6, 1, 6);
  const base = new THREE.Mesh(baseGeo, woodMat);
  base.position.y = 0.5;
  group.add(base);
  
  // Spring / iron coil post
  const postGeo = new THREE.CylinderGeometry(0.6, 0.6, 6, 8);
  const post = new THREE.Mesh(postGeo, metalMat);
  post.position.y = 4;
  group.add(post);
  
  // Torus coil representing the spring
  const springGeo = new THREE.TorusGeometry(1.2, 0.35, 8, 16);
  springGeo.rotateX(Math.PI / 2);
  const spring = new THREE.Mesh(springGeo, metalMat);
  spring.position.y = 3.5;
  group.add(spring);
  
  // Torso (straw body)
  const torsoGeo = new THREE.CylinderGeometry(1.8, 1.8, 10, 8);
  const torso = new THREE.Mesh(torsoGeo, strawMat);
  torso.position.y = 11;
  group.add(torso);
  
  // Head (round target)
  const headGeo = new THREE.SphereGeometry(1.4, 12, 12);
  const head = new THREE.Mesh(headGeo, woodMat);
  head.position.y = 17;
  group.add(head);
  
  // Horizontal crossarms
  const armGeo = new THREE.CylinderGeometry(0.35, 0.35, 7, 8);
  armGeo.rotateZ(Math.PI / 2);
  const arm1 = new THREE.Mesh(armGeo, woodMat);
  arm1.position.set(0, 13, 1.5);
  arm1.rotation.y = Math.PI / 6;
  group.add(arm1);
  
  const arm2 = new THREE.Mesh(armGeo, woodMat);
  arm2.position.set(0, 11, 1.5);
  arm2.rotation.y = -Math.PI / 6;
  group.add(arm2);
  
  return group;
}

function build3DNest() {
  const group = new THREE.Group();
  
  const nestMat = new THREE.MeshStandardMaterial({
    color: 0xcd853f,
    roughness: 0.95,
    metalness: 0.05
  });
  
  // Straw outer ring
  const torusGeo = new THREE.TorusGeometry(5, 1.6, 8, 24);
  torusGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(torusGeo, nestMat);
  ring.position.y = 1.6;
  group.add(ring);
  
  // Inside floor
  const floorGeo = new THREE.CylinderGeometry(4.5, 4.5, 1, 16);
  const floor = new THREE.Mesh(floorGeo, nestMat);
  floor.position.y = 0.5;
  group.add(floor);
  
  // Pastel Eggs
  const eggGeo = new THREE.SphereGeometry(1.2, 16, 16);
  
  // Egg 1: Pastel Blue
  const egg1Mat = new THREE.MeshStandardMaterial({ color: 0xaec6cf, roughness: 0.5 });
  const egg1 = new THREE.Mesh(eggGeo, egg1Mat);
  egg1.scale.set(1, 1.4, 1);
  egg1.position.set(-1.2, 1.5, 0);
  egg1.rotation.set(0.2, 0, 0.4);
  group.add(egg1);
  
  // Egg 2: Pastel Pink
  const egg2Mat = new THREE.MeshStandardMaterial({ color: 0xffb7b2, roughness: 0.5 });
  const egg2 = new THREE.Mesh(eggGeo, egg2Mat);
  egg2.scale.set(1, 1.4, 1);
  egg2.position.set(1.2, 1.5, -0.6);
  egg2.rotation.set(-0.3, 0.4, -0.2);
  group.add(egg2);
  
  // Egg 3: Soft Gold
  const egg3Mat = new THREE.MeshStandardMaterial({ color: 0xe6c229, roughness: 0.4, metalness: 0.1 });
  const egg3 = new THREE.Mesh(eggGeo, egg3Mat);
  egg3.scale.set(1, 1.4, 1);
  egg3.position.set(0, 1.5, 1.2);
  egg3.rotation.set(0.4, -0.2, 0.1);
  group.add(egg3);
  
  return group;
}

function build3DArena() {
  const group = new THREE.Group();
  
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x7c7f85,
    roughness: 0.85,
    metalness: 0.15
  });
  
  const borderMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.4,
    metalness: 0.6
  });
  
  // Dais base
  const daisGeo = new THREE.CylinderGeometry(18, 18, 1.5, 32);
  const dais = new THREE.Mesh(daisGeo, stoneMat);
  dais.position.y = 0.75;
  group.add(dais);
  
  // Gold border ring
  const ringGeo = new THREE.TorusGeometry(18, 0.5, 8, 32);
  ringGeo.rotateX(Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, borderMat);
  ring.position.y = 1.5;
  group.add(ring);
  
  return group;
}

function build3DBarredDoor() {
  const group = new THREE.Group();
  
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x5a5d64,
    roughness: 0.85,
    metalness: 0.1
  });
  
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1f2022,
    roughness: 0.7,
    metalness: 0.9
  });
  
  // Left pillar
  const p1Geo = new THREE.BoxGeometry(3, 16, 3);
  const p1 = new THREE.Mesh(p1Geo, stoneMat);
  p1.position.set(-6, 8, 0);
  group.add(p1);
  
  // Right pillar
  const p2 = new THREE.Mesh(p1Geo, stoneMat);
  p2.position.set(6, 8, 0);
  group.add(p2);
  
  // Top arch beam
  const beamGeo = new THREE.BoxGeometry(15, 3, 3);
  const beam = new THREE.Mesh(beamGeo, stoneMat);
  beam.position.set(0, 17.5, 0);
  group.add(beam);
  
  // Iron bars
  const barGeo = new THREE.CylinderGeometry(0.25, 0.25, 16, 8);
  for (let i = -4.5; i <= 4.5; i += 1.5) {
    const bar = new THREE.Mesh(barGeo, ironMat);
    bar.position.set(i, 8, 0);
    group.add(bar);
  }
  
  return group;
}

// ── Main factory ───────────────────────────────────────────────────────

export function createSanctuary3D({ scene, tiles, interactions, residents, selectedWyvernId } = {}) {
  const renderer = getRenderer();
  if (!renderer) return null;

  const target = renderer.domElement;
  renderer.setSize(GAME.width, GAME.height, false);

  const threeScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, GAME.width / GAME.height, 1, 10000);

  // Setup basic lighting
  threeScene.add(new THREE.HemisphereLight(0xe0e8ff, 0x1f1f2e, 1.2));
  const sunLight = new THREE.DirectionalLight(0xffffff, 0.95);
  sunLight.position.set(400, 800, 300);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  const d = 500;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 2000;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.02;
  threeScene.add(sunLight);

  const tileMeshes = [];
  const decorSprites = {}; // key: col_row -> { sprite, type, cell, ... }
  const residentVisuals = {}; // key: id -> { root, shadow, ring, label, ... }
  const activeParticles = [];
  const activeFireLights = [];

  let _fireParticleTex = null;
  let _smokeParticleTex = null;

  let controlledDragon = null; // reference to the GLTF dragon
  let mixer = null;
  const actions = {};
  let clipNames = [];
  let currentMotion = null;
  let pendingMotion = 'idle';
  let dracarysTimer = 0;
  let currentScaleMult = 1.0;
  let currentAnimSpeed = 1.0;

  // Steering. The state machine is pure (systems/dragonMotion.js) and decides
  // which motion slot should be playing, how fast, and how the body is angled;
  // everything below only translates that into Three.js calls.
  const dragonMotion = createDragonMotion({ motion: SANCTUARY.dragon3D?.motion });
  // Base motion to return to once a one-shot ends, and the slot a caller forced
  // through setMotion() (the debug panel and the Dracarys action use this).
  let baseMotion = 'idle';
  let baseTimeScale = 1;
  let overrideMotion = null;
  let elapsedSec = 0;

  // Camera State
  let camTarget = new THREE.Vector3(0, 0, 0);
  let camYaw = 0;
  let camPitch = 30 * Math.PI / 180;
  let camDistance = 450;
  let targetDistance = 450;
  let followId = selectedWyvernId;

  // Free-orbit camera (used by the Vault, which has no follow target). When
  // enabled, update() eases these targets instead of reading the Phaser rig.
  let freeCamera = false;
  let targetYaw = camYaw;
  let targetPitch = camPitch;
  const FREE_PITCH_MIN = 10 * Math.PI / 180;
  const FREE_PITCH_MAX = 80 * Math.PI / 180;
  const FREE_DIST_MIN = 55;
  const FREE_DIST_MAX = 1200;
  const freeDefaults = { yaw: camYaw, pitch: camPitch, distance: camDistance, target: new THREE.Vector3() };

  // Shared resident geometry — only created once per module lifetime.
  const shadowGeo = new THREE.RingGeometry(0, 8, 32);
  const ringGeo = new THREE.RingGeometry(7.2, 8, 32);

  // Build Voxel Terrain. Derive the grid size once (widest row wins so a ragged
  // edge doesn't mis-centre the map) and reuse it for every grid→world call.
  const rows = tiles.length || 40;
  const cols = tiles.reduce((max, row) => Math.max(max, row?.length || 0), 0) || 40;

  // Sample terrain height at a footprint. Footprints carry CONTINUOUS col/row
  // while walking (see publishFootprint in sanctuaryMovement.js), and array
  // indices must be integers — indexing with a fractional value returns
  // undefined and drops the model to ground level mid-stride, so it appears to
  // sink through raised terrain. Round to the owning cell, mirroring the
  // collision system's heightAt() so the model rides exactly the tile the
  // movement gate stands it on.
  function terrainHeightAt(footprint) {
    const cell = tiles[Math.round(footprint.row)]?.[Math.round(footprint.col)];
    return cell?.height || TERRAIN.baseHeight;
  }

  // Group tiles by biome to construct InstancedMesh per biome.
  const tilesByBiome = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = tiles[r]?.[c];
      if (!cell) continue;

      if (!tilesByBiome[cell.biome]) {
        tilesByBiome[cell.biome] = [];
      }
      tilesByBiome[cell.biome].push({ col: c, row: r, height: cell.height });

      // Create decor if cell has it
      if (cell.decor) {
        createDecorSprite(c, r, cell);
      }
    }
  }

  const baseGeo = getInstancedBaseGeometry();
  const dummy = new THREE.Object3D();
  const terrainTuning = SANCTUARY.terrain3D || {};
  const { hash2: tileHash } = createNoise('sanctuary-3d-tiles');
  const instanceColor = new THREE.Color();

  // True for a cell on the island's silhouette — one of its four orthogonal
  // neighbours is a hole. Those tiles get the skirt so the island reads as a
  // monolith rather than a 12-unit crust floating over nothing.
  function isBoundaryCell(col, row) {
    return !tiles[row - 1]?.[col] || !tiles[row + 1]?.[col]
      || !tiles[row]?.[col - 1] || !tiles[row]?.[col + 1];
  }

  for (const biome in tilesByBiome) {
    const list = tilesByBiome[biome];
    const count = list.length;
    const materials = getTileMaterials(biome);
    const instMesh = new THREE.InstancedMesh(baseGeo, materials, count);
    instMesh.castShadow = true;
    instMesh.receiveShadow = true;

    const tilesData = [];
    list.forEach((tileInfo, index) => {
      const { col, row, height } = tileInfo;
      const surface = gridToWorld3D(col, row, height, cols, rows);
      const skirt = isBoundaryCell(col, row) ? (terrainTuning.skirtDepth ?? 0) : 0;

      // Position bottom at Y = 0 (since geometry bottom is at 0), or below it
      // when this cell carries the island skirt. The top face stays put either
      // way — only the underside moves — so nothing standing on the tile shifts.
      dummy.position.set(surface.x, -skirt, surface.z);
      dummy.scale.set(1, height * HEIGHT_SCALE + skirt, 1);
      dummy.updateMatrix();
      instMesh.setMatrixAt(index, dummy.matrix);

      // Per-instance tint: a little deterministic variation so 1,600 cubes stop
      // reading as one flat sheet, darkened once per taller neighbour so height
      // reads without paying for a real ambient-occlusion pass. Multiplies into
      // the shared biome material, so the cache stays intact.
      const jitter = (tileHash(col, row, 91) - 0.5) * 2 * (terrainTuning.colorJitter ?? 0);
      const shade = 1 + jitter
        - neighbourOcclusion(tiles, col, row) * (terrainTuning.aoStrength ?? 0);
      instanceColor.setScalar(Math.max(0.35, shade));
      instMesh.setColorAt(index, instanceColor);

      tilesData.push({ col, row, height });
    });

    instMesh.instanceMatrix.needsUpdate = true;
    if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
    instMesh.userData = { tilesData };
    threeScene.add(instMesh);
    tileMeshes.push(instMesh);
  }

  // ── Lagoon surface ─────────────────────────────────────────────────────
  // One plane per contiguous run of springwater is overkill for the single
  // authored lagoon; a single plane over the biome's bounding box, masked to
  // the tile tops it covers, is enough and costs one draw call.
  let waterSurface = null;
  function buildWaterSurface() {
    const cells = tilesByBiome.springwater;
    if (!cells?.length) return;
    const waterCfg = terrainTuning.water || {};

    let minCol = Infinity; let maxCol = -Infinity;
    let minRow = Infinity; let maxRow = -Infinity;
    let surfaceHeight = 0;
    cells.forEach(({ col, row, height }) => {
      minCol = Math.min(minCol, col); maxCol = Math.max(maxCol, col);
      minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
      surfaceHeight = Math.max(surfaceHeight, height);
    });

    const min = gridToWorld3D(minCol, minRow, surfaceHeight, cols, rows);
    const max = gridToWorld3D(maxCol, maxRow, surfaceHeight, cols, rows);
    const width = (max.x - min.x) + TILE_SIZE;
    const depth = (max.z - min.z) + TILE_SIZE;

    const geo = new THREE.PlaneGeometry(width, depth, 1, 1);
    geo.rotateX(-Math.PI / 2);

    const biomeData = BIOMES.springwater;
    const faces = tileFaceCanvases('springwater', biomeData, terrainTuning.texture);
    const normalTex = faces?.top ? new THREE.CanvasTexture(faces.top) : null;
    if (normalTex) {
      normalTex.wrapS = THREE.RepeatWrapping;
      normalTex.wrapT = THREE.RepeatWrapping;
      normalTex.repeat.set(width / TILE_SIZE, depth / TILE_SIZE);
    }

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(biomeData.top),
      normalMap: normalTex,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: waterCfg.roughness ?? 0.08,
      metalness: 0.25,
      transparent: true,
      opacity: waterCfg.opacity ?? 0.82,
    });

    waterSurface = new THREE.Mesh(geo, mat);
    waterSurface.position.set(
      (min.x + max.x) / 2,
      min.y + (waterCfg.lift ?? 0.6),
      (min.z + max.z) / 2,
    );
    waterSurface.receiveShadow = true;
    threeScene.add(waterSurface);
  }
  buildWaterSurface();

  // ── Lava lighting ──────────────────────────────────────────────────────
  // The lava fields were emissive but lit nothing, so the surrounding warmstone
  // stayed cold. One light per authored field, placed at its centroid.
  const lavaLights = [];
  const lavaMaterials = [];
  function buildLavaLighting() {
    const cells = tilesByBiome.lava;
    if (!cells?.length) return;
    const lavaCfg = terrainTuning.lava || {};

    const topMat = getTileMaterials('lava')[2];
    if (topMat?.userData?.isLava) lavaMaterials.push(topMat);

    // Split the cells into connected fields so two distant pools do not share
    // one light hovering over the rock between them.
    const seen = new Set();
    const key = (c, r) => `${c}_${r}`;
    const lookup = new Map(cells.map((cell) => [key(cell.col, cell.row), cell]));
    cells.forEach((start) => {
      if (seen.has(key(start.col, start.row))) return;
      const queue = [start];
      const field = [];
      seen.add(key(start.col, start.row));
      while (queue.length) {
        const cell = queue.pop();
        field.push(cell);
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
          const k = key(cell.col + dc, cell.row + dr);
          if (lookup.has(k) && !seen.has(k)) {
            seen.add(k);
            queue.push(lookup.get(k));
          }
        });
      }

      const centre = field.reduce(
        (acc, cell) => {
          const w = gridToWorld3D(cell.col, cell.row, cell.height, cols, rows);
          return { x: acc.x + w.x, y: Math.max(acc.y, w.y), z: acc.z + w.z };
        },
        { x: 0, y: 0, z: 0 },
      );
      const light = new THREE.PointLight(
        0xff6a1e,
        lavaCfg.lightIntensity ?? 2.4,
        lavaCfg.lightRange ?? 300,
      );
      light.position.set(centre.x / field.length, centre.y + 14, centre.z / field.length);
      threeScene.add(light);
      lavaLights.push(light);
    });
  }
  buildLavaLighting();

  // Distance haze. The Three canvas is transparent over the Phaser backdrop, so
  // the fog colour has to match that backdrop or the horizon bands where the
  // two meet — it is a tuning value, not a free choice.
  if (terrainTuning.fog?.enabled) {
    threeScene.fog = new THREE.Fog(
      new THREE.Color(terrainTuning.fog.color || GAME.backgroundColor),
      terrainTuning.fog.near ?? 600,
      terrainTuning.fog.far ?? 1800,
    );
  }

  // Create Decor Sprite
  function createDecorSprite(col, row, cell) {
    const { type, variant } = cell.decor;
    const key = `${col}_${row}`;

    let is3DProp = false;
    let propObject = null;

    if (type === 'crystal') {
      propObject = build3DCrystal();
      is3DProp = true;
    } else if (type === 'obelisk') {
      propObject = build3DObelisk();
      is3DProp = true;
    } else if (type === 'dummy') {
      propObject = build3DDummy();
      is3DProp = true;
    } else if (type === 'nest') {
      propObject = build3DNest();
      is3DProp = true;
    } else if (type === 'arena') {
      propObject = build3DArena();
      is3DProp = true;
    } else if (type === 'barredDoor') {
      propObject = build3DBarredDoor();
      is3DProp = true;
    } else if (type === 'unlitBrazier' || type === 'brazier' || type === 'litBrazier') {
      propObject = build3DBrazier();
      is3DProp = true;
    }

    if (is3DProp) {
      const surface = gridToWorld3D(col, row, cell.height, cols, rows);
      propObject.position.set(surface.x, surface.y, surface.z);
      // Raycasting hits child meshes, not this root — unprojectClick walks
      // back up to whichever ancestor carries col/row.
      propObject.userData.col = col;
      propObject.userData.row = row;
      propObject.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      threeScene.add(propObject);

      decorSprites[key] = {
        sprite: propObject, // Alias to sprite
        type,
        col,
        row,
        cell,
        is3D: true,
        wobbleTime: 0,
        pulseTime: 0,
      };

      if (type === 'litBrazier') {
        const coals = propObject.getObjectByName("coals");
        if (coals && coals.material) {
          coals.material.color.setHex(0xff5500);
          coals.material.emissive.setHex(0xff3300);
          coals.material.emissiveIntensity = 2.0;
          coals.material.needsUpdate = true;
        }
        const flame = propObject.getObjectByName("flameCore");
        if (flame && flame.material) {
          flame.material.opacity = 0.9;
          flame.material.emissiveIntensity = 1.5;
          flame.material.needsUpdate = true;
        }
      }
      return;
    }

    if (scene.sys.settings.key === 'Vault') {
      // In Rider Vault, we don't render flat 2D billboard sprites
      return;
    }

    // Billboard the 2D drawer art for props with no 3D build. The texture has
    // to be *baked* first, not merely looked up: BaseScene bakes the exterior
    // props under the projected `sanctuary-…-<view>` keys, so the fixed-view
    // `iso-decor-…` key guessed here never existed and every one of these props
    // silently fell back to Phaser's missing-texture placeholder — the black
    // squares that used to litter the grounds. ensureDecorTexture bakes on
    // demand and returns the key it actually used. Fixed-view art is the right
    // choice for a billboard: it always faces the camera, so a view-projected
    // bake would be skewed for eight of the nine camera angles.
    const phaserKey = ensureDecorTexture(scene.textures, cell.biome, type, variant);
    const sourceImage = scene.textures.get(phaserKey)?.getSourceImage();
    if (!sourceImage) return;

    const texture = getCachedTexture(phaserKey, sourceImage);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);

    const surface = gridToWorld3D(col, row, cell.height, cols, rows);
    sprite.position.set(surface.x, surface.y + 12, surface.z);
    // Raycast target for hover/click hit-testing — without this the pointer
    // ray passes through the billboard onto whatever tile lies behind it.
    sprite.userData.col = col;
    sprite.userData.row = row;

    // Prop sizes
    let scaleX = 24;
    let scaleY = 28;
    if (type === 'obelisk') { scaleX = 20; scaleY = 32; }
    else if (type === 'arena') { scaleX = 40; scaleY = 24; }
    else if (type === 'barredDoor') { scaleX = 28; scaleY = 32; }
    else if (type === 'dummy') { scaleX = 20; scaleY = 28; }
    else if (type === 'nest') { scaleX = 28; scaleY = 18; }
    else if (type === 'crystal') { scaleX = 22; scaleY = 26; }

    sprite.scale.set(scaleX, scaleY, 1);
    threeScene.add(sprite);

    decorSprites[key] = {
      sprite,
      type,
      col,
      row,
      cell,
      is3D: false,
      baseScaleY: scaleY,
      wobbleTime: 0,
      pulseTime: 0,
    };
  }

  // ── GLTF model loading with cache ──────────────────────────────────
  function loadOrCloneDragon(config, residentGroup, onReady) {
    const url = config.modelUrl;

    function setupFromCache(cached) {
      const cloned = SkeletonUtils.clone(cached.scene);

      // Use the measurements computed once from the pristine gltf.scene
      // (whose bone matrices are correct). SkeletonUtils.clone copies the
      // hierarchy but its uninitialized bones can produce a degenerate
      // bounding box, which blows up the scale.
      const { center, minY, finalScale } = cached.measurements;

      cloned.position.x -= center.x;
      cloned.position.z -= center.z;
      cloned.position.y -= minY;

      cloned.traverse((node) => {
        if (node.isMesh) {
          node.frustumCulled = false;
          node.castShadow = true;
          node.receiveShadow = true;
          if (node.material) {
            node.material = node.material.clone();
            node.material.roughness = 0.6;
            node.material.metalness = 0.1;
            
            // Calibrate loaded textures to use sRGB Color Space if any exist
            if (node.material.map) {
              node.material.map.colorSpace = THREE.SRGBColorSpace;
            }
            if (node.material.emissiveMap) {
              node.material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
            }
          }
        }
      });

      cloned.scale.setScalar(finalScale);
      cloned.userData.finalScale = finalScale;
      residentGroup.add(cloned);

      const localMixer = new THREE.AnimationMixer(cloned);
      const localActions = {};
      const oneShots = new Set(config.oneShotClips || []);
      for (const [motion, clipName] of Object.entries(config.clips)) {
        const clip = THREE.AnimationClip.findByName(cached.animations, clipName);
        if (!clip) {
          console.warn(`sanctuary3D: clip "${clipName}" for motion "${motion}" is not in the model`);
          continue;
        }
        const clipAction = localMixer.clipAction(clip);
        if (oneShots.has(motion)) {
          // One-shots play to their last frame and hold it, so the crossfade
          // back to the base motion starts from a settled pose instead of
          // whipping through the clip's return-to-neutral frames.
          clipAction.setLoop(THREE.LoopOnce, 1);
          clipAction.clampWhenFinished = true;
        }
        localActions[motion] = clipAction;
      }

      onReady(cloned, localMixer, localActions, cached.animations);
    }

    if (_gltfCache.has(url)) {
      setupFromCache(_gltfCache.get(url));
      return;
    }

    // Dynamic loading UI injection
    const overlay = document.getElementById('ui-overlay');
    let loadingEl = document.getElementById('dragon-loading-overlay');
    if (!loadingEl && overlay) {
      loadingEl = document.createElement('div');
      loadingEl.id = 'dragon-loading-overlay';
      loadingEl.innerHTML = `
        <div class="dragon-loading-card">
          <div class="dragon-loading-title">Summoning Dragon Mesh...</div>
          <div class="dragon-loading-bar-bg">
            <div class="dragon-loading-bar-fill" id="dragon-loader-fill" style="width: 0%"></div>
          </div>
          <div class="dragon-loading-percentage" id="dragon-loader-pct">0%</div>
        </div>
      `;
      overlay.appendChild(loadingEl);
    }

    const manager = new THREE.LoadingManager();
    manager.onStart = () => {
      updateProgress(0);
    };

    manager.onProgress = (itemUrl, itemsLoaded, itemsTotal) => {
      const pct = Math.min(99, Math.round((itemsLoaded / itemsTotal) * 100));
      updateProgress(pct);
    };

    manager.onLoad = () => {
      updateProgress(100);
      setTimeout(() => {
        if (loadingEl && loadingEl.parentNode) {
          loadingEl.style.opacity = '0';
          setTimeout(() => {
            if (loadingEl && loadingEl.parentNode) {
              loadingEl.remove();
            }
          }, 300);
        }
      }, 200);
    };

    manager.onError = (errUrl) => {
      console.error(`Failed to load asset: ${errUrl}`);
      const titleEl = loadingEl?.querySelector('.dragon-loading-title');
      if (titleEl) {
        titleEl.textContent = 'Failed to load dragon model.';
        titleEl.style.color = '#ef4444';
      }
    };

    function updateProgress(pct) {
      const fillEl = document.getElementById('dragon-loader-fill');
      const pctEl = document.getElementById('dragon-loader-pct');
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (pctEl) pctEl.textContent = `${pct}%`;
    }

    const loader = new GLTFLoader(manager);

    function tryLoad(loadUrl, isFallback = false) {
      loader.load(
        loadUrl,
        (gltf) => {
          gltf.scene.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          const modelHeight = size.y || 1;
          const center = new THREE.Vector3();
          box.getCenter(center);

          _gltfCache.set(url, {
            scene: gltf.scene,
            animations: gltf.animations,
            measurements: {
              center: { x: center.x, z: center.z },
              minY: box.min.y,
              finalScale: 22 / modelHeight,
            },
          });
          setupFromCache(_gltfCache.get(url));
        },
        undefined,
        (err) => {
          console.warn(`Failed to load model from: ${loadUrl}`, err);
          if (!isFallback) {
            console.log('Attempting fallback to test wyvern model...');
            const titleEl = loadingEl?.querySelector('.dragon-loading-title');
            if (titleEl) titleEl.textContent = 'Retrying with fallback mesh...';
            tryLoad('assets/models/wyvern3d/wyvern-test.glb', true);
          } else {
            console.error('All model loading paths failed. Rendering procedural placeholder.');
            createProceduralPlaceholder();
          }
        }
      );
    }

    function createProceduralPlaceholder() {
      if (loadingEl && loadingEl.parentNode) {
        loadingEl.remove();
      }

      const placeholderGroup = new THREE.Group();
      
      const bodyGeom = new THREE.BoxGeometry(12, 6, 12);
      const wireframeMat = new THREE.MeshBasicMaterial({ 
        color: 0xd4af37, 
        wireframe: true, 
        transparent: true,
        opacity: 0.8
      });
      const body = new THREE.Mesh(bodyGeom, wireframeMat);
      body.position.y = 3;
      placeholderGroup.add(body);
      
      const headGeom = new THREE.BoxGeometry(4, 4, 6);
      const head = new THREE.Mesh(headGeom, wireframeMat);
      head.position.set(0, 7, 5);
      placeholderGroup.add(head);
      
      const leftWingGeom = new THREE.BoxGeometry(16, 1, 6);
      const leftWing = new THREE.Mesh(leftWingGeom, wireframeMat);
      leftWing.position.set(-10, 5, 0);
      placeholderGroup.add(leftWing);

      const rightWingGeom = new THREE.BoxGeometry(16, 1, 6);
      const rightWing = new THREE.Mesh(rightWingGeom, wireframeMat);
      rightWing.position.set(10, 5, 0);
      placeholderGroup.add(rightWing);

      placeholderGroup.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });

      _gltfCache.set(url, {
        scene: placeholderGroup,
        animations: [],
        measurements: {
          center: { x: 0, z: 0 },
          minY: 0,
          finalScale: 1.0,
        },
      });
      setupFromCache(_gltfCache.get(url));
    }

    tryLoad(url);
  }

  // Spawn residents in 3D
  residents.forEach((r) => {
    const isControlled = r.animal.id === selectedWyvernId;
    const accentColor = new THREE.Color(r.accent || '#ffbf3f');

    const residentGroup = new THREE.Group();
    const spawnHeight = terrainHeightAt(r.footprint);
    const spawn = gridToWorld3D(r.footprint.col, r.footprint.row, spawnHeight, cols, rows);
    residentGroup.position.set(spawn.x, spawn.y, spawn.z);
    threeScene.add(residentGroup);

    // Flight pivot holds the model/billboard so altitude lifts it while the
    // shadow and selection ring below stay pinned to the terrain surface.
    const flightPivot = new THREE.Group();
    residentGroup.add(flightPivot);

    // Flat Shadow
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.05;
    residentGroup.add(shadowMesh);

    // Selection Ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.06;
    ringMesh.visible = isControlled;
    residentGroup.add(ringMesh);

    // Text Label Billboard
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128;
    labelCanvas.height = 32;
    const ctx = labelCanvas.getContext('2d');
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(r.animal.name, 64, 20);
    ctx.fillText(r.animal.name, 64, 20);

    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.position.set(0, LABEL_BASE_Y, 0);
    labelSprite.scale.set(32, 8, 1);
    residentGroup.add(labelSprite);

    let visual3D = null;

    if (isControlled && r.animal.species === 'wyvern') {
      const config = SANCTUARY.dragon3D;
      loadOrCloneDragon(config, flightPivot, (cloned, localMixer, localActions, animations) => {
        visual3D = cloned;
        mixer = localMixer;
        Object.assign(actions, localActions);
        clipNames = (animations || []).map((clip) => clip.name);
        // A one-shot that has run its course hands the base motion back, and
        // tells the state machine it is free to request another.
        localMixer.addEventListener('finished', () => {
          dragonMotion.oneShotFinished();
          playMotion(baseMotion, SANCTUARY.dragon3D?.crossfadeMs);
        });
        playMotion(pendingMotion, 0);
        controlledDragon = cloned;

        // Apply current/pending tuning values
        const baseScale = cloned.userData.finalScale || 1;
        cloned.scale.setScalar(currentScaleMult * baseScale);
        localMixer.timeScale = currentAnimSpeed;
      });
    } else {
      // 2.5D Sprite Billboard for other residents
      let textureKey = `species-${r.animal.species}`;
      if (r.usesProfileTexture) {
        textureKey = r.visual.textureKey;
      }
      const phaserTexture = scene.textures.get(textureKey)?.getSourceImage();
      if (phaserTexture) {
        const tex = getCachedTexture(textureKey, phaserTexture);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(0, 12, 0);
        sprite.scale.set(22, 22, 1);
        flightPivot.add(sprite);
        visual3D = sprite;
      }
    }

    residentVisuals[r.animal.id] = {
      group: residentGroup,
      pivot: flightPivot,
      ring: ringMesh,
      label: labelSprite,
      visual: visual3D,
      animal: r.animal,
    };
  });

  // Crossfade to a motion slot. `currentMotion` tracks the slot that is really
  // playing — when the requested one has no clip and idle stands in, this must
  // record 'idle', or the requested slot looks active forever and can never be
  // started once its clip does exist.
  function playMotion(motion, fadeMs = 250) {
    const next = actions[motion];
    const resolved = next ? motion : 'idle';
    const action = next || actions.idle;
    if (!action || currentMotion === resolved) return;
    const previous = actions[currentMotion];
    action.reset().setEffectiveWeight(1).play();
    if (previous && previous !== action) {
      previous.crossFadeTo(action, fadeMs / 1000, false);
    }
    currentMotion = resolved;
  }

  // Restart a one-shot from its first frame even if it is already the current
  // motion, so pressing Attack twice plays it twice.
  function playOneShot(motion, fadeMs = 250) {
    const action = actions[motion];
    if (!action) return false;
    const previous = actions[currentMotion];
    action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
    if (previous && previous !== action) {
      previous.crossFadeTo(action, fadeMs / 1000, false);
    }
    currentMotion = motion;
    return true;
  }

  // Create 3D fire particles
  function createFireParticles(position) {
    const count = 25;
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];
    const lifetimes = [];

    for (let i = 0; i < count; i++) {
      // Spawn slightly offset from source
      positions.push(
        position.x + (Math.random() - 0.5) * 4,
        position.y + (Math.random() - 0.5) * 4,
        position.z + (Math.random() - 0.5) * 4,
      );
      velocities.push(
        (Math.random() - 0.5) * 15,
        Math.random() * 25 + 15,
        (Math.random() - 0.5) * 15,
      );
      lifetimes.push(Math.random() * 0.8 + 0.4);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xff5500,
      size: 4,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    threeScene.add(points);

    activeParticles.push({
      points,
      velocities,
      lifetimes,
      maxLifetimes: [...lifetimes],
    });
  }

  // Create a soft radial gradient canvas texture for fire particles
  function getFireParticleTexture() {
    if (!_fireParticleTex) {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      grad.addColorStop(0.3, 'rgba(255, 180, 0, 0.8)');
      grad.addColorStop(0.6, 'rgba(240, 60, 0, 0.4)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, 16);
      _fireParticleTex = new THREE.CanvasTexture(canvas);
    }
    return _fireParticleTex;
  }

  // Create a soft radial gradient canvas texture for smoke particles
  function getSmokeParticleTexture() {
    if (!_smokeParticleTex) {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      grad.addColorStop(0, 'rgba(100, 100, 100, 0.6)');
      grad.addColorStop(0.4, 'rgba(70, 70, 70, 0.3)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 16, 16);
      _smokeParticleTex = new THREE.CanvasTexture(canvas);
    }
    return _smokeParticleTex;
  }

  // Create 3D fire breath particles and smoke for the dragon
  function createDracarysParticles(position, yaw) {
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);

    // Mouth position (roughly 12 units forward and 10 units high relative to dragon position)
    const startX = position.x + dirX * 12;
    const startY = position.y + 10;
    const startZ = position.z + dirZ * 12;

    // 1. Spawn Fire Particles
    const fireCount = 24;
    const fireGeo = new THREE.BufferGeometry();
    const firePositions = [];
    const fireVelocities = [];
    const fireLifetimes = [];

    for (let i = 0; i < fireCount; i++) {
      firePositions.push(
        startX + (Math.random() - 0.5) * 1.5,
        startY + (Math.random() - 0.5) * 1.5,
        startZ + (Math.random() - 0.5) * 1.5,
      );

      const speed = Math.random() * 45 + 30;
      // Spread cone
      const spreadX = (Math.random() - 0.5) * 0.35;
      const spreadY = (Math.random() - 0.5) * 0.2 - 0.05;
      const spreadZ = (Math.random() - 0.5) * 0.35;

      // Add dynamic wave turbulence
      const waveX = Math.sin(i + position.x) * 0.1;
      const waveZ = Math.cos(i + position.z) * 0.1;

      fireVelocities.push(
        (dirX + spreadX + waveX) * speed,
        spreadY * speed,
        (dirZ + spreadZ + waveZ) * speed,
      );
      fireLifetimes.push(Math.random() * 0.5 + 0.3);
    }

    fireGeo.setAttribute('position', new THREE.Float32BufferAttribute(firePositions, 3));
    const fireMat = new THREE.PointsMaterial({
      color: 0xffaa00,
      size: 7.0,
      map: getFireParticleTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const firePoints = new THREE.Points(fireGeo, fireMat);
    threeScene.add(firePoints);

    activeParticles.push({
      points: firePoints,
      velocities: fireVelocities,
      lifetimes: fireLifetimes,
      maxLifetimes: [...fireLifetimes],
      isFireBreath: true,
      isSmoke: false,
    });

    // 2. Spawn Smoke Particles
    const smokeCount = 10;
    const smokeGeo = new THREE.BufferGeometry();
    const smokePositions = [];
    const smokeVelocities = [];
    const smokeLifetimes = [];

    for (let i = 0; i < smokeCount; i++) {
      smokePositions.push(
        startX + (Math.random() - 0.5) * 2.5,
        startY + (Math.random() - 0.5) * 2.5,
        startZ + (Math.random() - 0.5) * 2.5,
      );

      const speed = Math.random() * 20 + 10;
      const spreadX = (Math.random() - 0.5) * 0.5;
      const spreadY = Math.random() * 8 + 4; // rises upward
      const spreadZ = (Math.random() - 0.5) * 0.5;

      smokeVelocities.push(
        (dirX * 0.6 + spreadX) * speed,
        spreadY,
        (dirZ * 0.6 + spreadZ) * speed,
      );
      smokeLifetimes.push(Math.random() * 1.2 + 0.8);
    }

    smokeGeo.setAttribute('position', new THREE.Float32BufferAttribute(smokePositions, 3));
    const smokeMat = new THREE.PointsMaterial({
      color: 0x555555,
      size: 10.0,
      map: getSmokeParticleTexture(),
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const smokePoints = new THREE.Points(smokeGeo, smokeMat);
    threeScene.add(smokePoints);

    activeParticles.push({
      points: smokePoints,
      velocities: smokeVelocities,
      lifetimes: smokeLifetimes,
      maxLifetimes: [...smokeLifetimes],
      isFireBreath: false,
      isSmoke: true,
    });

    // 3. Spawn a Traveling Point Light
    if (activeFireLights.length < 3) {
      const fireLight = new THREE.PointLight(0xff5500, 5, 120);
      fireLight.position.set(startX, startY, startZ);
      fireLight.castShadow = true;
      fireLight.shadow.bias = -0.002;
      threeScene.add(fireLight);

      activeFireLights.push({
        light: fireLight,
        velocity: {
          x: dirX * 55,
          y: -2,
          z: dirZ * 55,
        },
        lifetime: 0.5,
        maxLifetime: 0.5,
      });
    }
  }

  return {
    show() {
      target.style.display = 'block';
    },

    hide() {
      target.style.display = 'none';
    },

    // Focus camera on a resident by ID
    setFollow(id) {
      followId = id;
    },

    // ── Free-orbit camera (Vault) ──────────────────────────────────────
    // Enable a user-driven pan/tilt/zoom camera framing the whole room. The
    // orbit math is shared with the Phaser-driven path in update().
    enableFreeCamera() {
      let sum = 0;
      let n = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = tiles[r]?.[c];
          if (cell) { sum += cell.height || 1; n++; }
        }
      }
      const avgHeight = n ? sum / n : 1;
      const width = Math.max(cols, rows) * TILE_SIZE;

      camTarget.set(0, tileCenterY(avgHeight), 0);
      camYaw = -45 * Math.PI / 180;
      camPitch = 30 * Math.PI / 180;
      camDistance = Math.min(FREE_DIST_MAX, Math.max(FREE_DIST_MIN, width * 1.15));
      targetYaw = camYaw;
      targetPitch = camPitch;
      targetDistance = camDistance;

      freeDefaults.yaw = camYaw;
      freeDefaults.pitch = camPitch;
      freeDefaults.distance = camDistance;
      freeDefaults.target.copy(camTarget);
      freeCamera = true;
    },

    // Rotate (yaw, free 360°) and tilt (pitch, clamped) by screen-drag degrees.
    orbitBy(dxDeg, dyDeg) {
      if (!freeCamera) return;
      targetYaw += (dxDeg || 0) * Math.PI / 180;
      targetPitch = Math.min(
        FREE_PITCH_MAX,
        Math.max(FREE_PITCH_MIN, targetPitch + (dyDeg || 0) * Math.PI / 180),
      );
    },

    // Slide the look-at point across the floor along the camera's ground axes.
    panBy(dxScreen, dyScreen) {
      if (!freeCamera) return;
      const s = Math.sin(camYaw);
      const c = Math.cos(camYaw);
      const fx = -s; const fz = -c; // camera→target forward, ground-projected
      const rx = -c; const rz = s; // right (perpendicular to forward)
      const scale = camDistance * 0.0016;
      camTarget.x -= (rx * dxScreen + fx * dyScreen) * scale;
      camTarget.z -= (rz * dxScreen + fz * dyScreen) * scale;

      // Keep the target within the map footprint (+ margin) so the view can't
      // drift off into empty space.
      const halfX = (cols * TILE_SIZE) / 2 + TILE_SIZE * 3;
      const halfZ = (rows * TILE_SIZE) / 2 + TILE_SIZE * 3;
      camTarget.x = Math.min(halfX, Math.max(-halfX, camTarget.x));
      camTarget.z = Math.min(halfZ, Math.max(-halfZ, camTarget.z));
    },

    zoomBy(factor) {
      if (!freeCamera || !(factor > 0)) return;
      targetDistance = Math.min(
        FREE_DIST_MAX,
        Math.max(FREE_DIST_MIN, targetDistance / factor),
      );
    },

    // Discrete nudges for the on-screen buttons / keyboard.
    stepYaw(dir) { this.orbitBy(45 * Math.sign(dir || 0), 0); },
    stepTilt(dir) { this.orbitBy(0, 7.5 * Math.sign(dir || 0)); },

    resetCamera() {
      if (!freeCamera) return;
      targetYaw = freeDefaults.yaw;
      targetPitch = freeDefaults.pitch;
      targetDistance = freeDefaults.distance;
      camTarget.copy(freeDefaults.target);
    },

    // Tune 3D dragon and scene properties dynamically
    setTuning(param, value) {
      if (param === 'scale') {
        currentScaleMult = value;
        if (controlledDragon) {
          const baseScale = controlledDragon.userData.finalScale || 1;
          controlledDragon.scale.setScalar(value * baseScale);
        }
      }
      if (param === 'animationSpeed') {
        currentAnimSpeed = value;
        if (mixer) {
          mixer.timeScale = value;
        }
      }
      if (param === 'wireframe') {
        threeScene.traverse((child) => {
          if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => { m.wireframe = value; });
            } else {
              child.material.wireframe = value;
            }
          }
        });
      }
      if (param === 'sunIntensity') {
        sunLight.intensity = value;
      }
      if (param === 'ambientIntensity') {
        threeScene.traverse((child) => {
          if (child instanceof THREE.HemisphereLight) {
            child.intensity = value;
          }
        });
      }
      if (param === 'exposure') {
        renderer.toneMappingExposure = value;
      }
      if (param === 'fogNear' && threeScene.fog) {
        threeScene.fog.near = value;
      }
      if (param === 'fogFar' && threeScene.fog) {
        threeScene.fog.far = value;
      }
      if (param === 'fogEnabled') {
        threeScene.fog = value
          ? new THREE.Fog(
            new THREE.Color(terrainTuning.fog?.color || GAME.backgroundColor),
            terrainTuning.fog?.near ?? 600,
            terrainTuning.fog?.far ?? 1800,
          )
          : null;
        threeScene.traverse((child) => {
          if (child.isMesh && child.material) {
            const list = Array.isArray(child.material) ? child.material : [child.material];
            list.forEach((m) => { m.needsUpdate = true; });
          }
        });
      }
      if (param === 'waterSpeed' && terrainTuning.water) {
        terrainTuning.water.scrollX = value;
        terrainTuning.water.scrollY = value * 0.6;
      }
      if (param === 'lavaGlow' && terrainTuning.lava) {
        terrainTuning.lava.emissiveMax = value;
      }
      // Rebuilding the instance colours means re-deriving them for every tile,
      // which is why aoStrength is a rebuild-the-attribute knob rather than a
      // uniform. Cheap enough at 1,600 tiles to run live from a slider.
      if (param === 'aoStrength' || param === 'colorJitter') {
        terrainTuning[param] = value;
        const color = new THREE.Color();
        tileMeshes.forEach((mesh) => {
          mesh.userData.tilesData?.forEach(({ col, row }, index) => {
            const jitter = (tileHash(col, row, 91) - 0.5) * 2 * (terrainTuning.colorJitter ?? 0);
            const shade = 1 + jitter
              - neighbourOcclusion(tiles, col, row) * (terrainTuning.aoStrength ?? 0);
            color.setScalar(Math.max(0.35, shade));
            mesh.setColorAt(index, color);
          });
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        });
      }
    },

    // Light brazier: change texture and trigger fire particles
    lightBrazier(col, row) {
      const key = `${col}_${row}`;
      const decor = decorSprites[key];
      if (decor && (decor.type === 'unlitBrazier' || decor.type === 'brazier')) {
        decor.type = 'litBrazier';

        if (decor.is3D) {
          // Glow coals and activate flame core
          const coals = decor.sprite.getObjectByName("coals");
          if (coals && coals.material) {
            coals.material.color.setHex(0xff5500);
            coals.material.emissive.setHex(0xff3300);
            coals.material.emissiveIntensity = 2.0;
            coals.material.needsUpdate = true;
          }
          const flame = decor.sprite.getObjectByName("flameCore");
          if (flame && flame.material) {
            flame.material.opacity = 0.9;
            flame.material.emissiveIntensity = 1.5;
            flame.material.needsUpdate = true;
          }
        } else {
          // Swap texture
          const phaserKey = `iso-decor-moss-torch-0`; // Re-use torch flame texture
          const sourceImage = scene.textures.get(phaserKey)?.getSourceImage();
          if (sourceImage) {
            decor.sprite.material.map = getCachedTexture(phaserKey, sourceImage);
            decor.sprite.material.needsUpdate = true;
          }
        }

        // Spawn fire particles
        const particlePos = decor.is3D
          ? new THREE.Vector3().copy(decor.sprite.position).add(new THREE.Vector3(0, 11, 0))
          : decor.sprite.position;
        createFireParticles(particlePos);

        // Add a point light to the fire!
        const fireLight = new THREE.PointLight(0xff7700, 1.8, 120);
        fireLight.position.set(0, decor.is3D ? 12 : 4, 0);
        decor.sprite.add(fireLight);
      }
    },

    // Strike training dummy: wobble wobble
    strikeDummy(col, row) {
      const key = `${col}_${row}`;
      const decor = decorSprites[key];
      if (decor && decor.type === 'dummy') {
        decor.wobbleTime = 1.2; // wobble duration in seconds
      }
    },

    // Resonate crystal: pulse scale and emissive
    resonateCrystal(col, row) {
      const key = `${col}_${row}`;
      const decor = decorSprites[key];
      if (decor && decor.type === 'crystal') {
        decor.pulseTime = 1.5; // pulse duration in seconds
      }
    },

    // Cast ray to determine clicked grid coordinate
    unprojectClick(screenX, screenY) {
      const mouse = new THREE.Vector2();
      mouse.x = (screenX / GAME.width) * 2 - 1;
      mouse.y = -(screenY / GAME.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // Include every decor prop — 3D builds and billboard sprites alike — so
      // the ray can't pass through one onto whatever tile lies behind it.
      // Sorted nearest-first so occlusion between props and tiles resolves
      // correctly.
      const propRoots = Object.values(decorSprites).map((d) => d.sprite);
      const intersects = raycaster.intersectObjects([...tileMeshes, ...propRoots], true);

      for (const hit of intersects) {
        if (hit.object instanceof THREE.InstancedMesh) {
          const instanceId = hit.instanceId;
          const data = hit.object.userData.tilesData[instanceId];
          if (data) return { col: data.col, row: data.row };
          continue;
        }
        // Prop hits land on a child mesh; walk up to the root that carries
        // col/row (tile meshes already have it directly on the hit object).
        let node = hit.object;
        while (node && node.userData.col === undefined) node = node.parent;
        if (node) return { col: node.userData.col, row: node.userData.row };
      }
      return null;
    },

    // Update coordinates, animations, and render frame
    update(deltaMs) {
      const deltaSec = deltaMs / 1000;

      // ── Dragon steering ──────────────────────────────────────────────
      // Everything the model does is decided here, from what the movement
      // controller reports. `overrideMotion` (debug panel / Dracarys) wins.
      if (controlledDragon) {
        const movement = scene.movement;
        const moveVector = movement?.lastWorldVector;
        const facing = moveVector && (moveVector.col !== 0 || moveVector.row !== 0)
          ? Math.atan2(moveVector.col, moveVector.row)
          : null;
        // The controller reports the step it took last frame in grid units;
        // convert to the world units/sec the clip rate is calibrated against.
        const stepped = movement?.isMoving && moveVector
          ? Math.hypot(moveVector.col, moveVector.row) * TILE_SIZE
          : 0;
        const speed = deltaSec > 0 ? stepped / deltaSec : 0;

        const pose = dragonMotion.update({
          dtMs: deltaMs,
          speed,
          desiredHeading: facing,
          isFlying: Boolean(movement?.isFlying),
          altitude: movement?.getAltitude?.() ?? 0,
          targetAltitude: movement?.getTargetAltitude?.() ?? 0,
          action: overrideMotion,
        });

        baseMotion = overrideMotion && !dragonMotion.pendingOneShot
          ? overrideMotion
          : pose.base;
        baseTimeScale = pose.baseTimeScale;

        const fade = SANCTUARY.dragon3D?.crossfadeMs ?? 250;
        if (pose.oneShot) {
          if (!playOneShot(pose.oneShot, fade)) dragonMotion.oneShotFinished();
        } else if (!dragonMotion.pendingOneShot) {
          playMotion(baseMotion, fade);
        }

        // Speed-matched playback on the walk cycle only; a one-shot or a flight
        // loop should run at its authored rate.
        const activeAction = actions[currentMotion];
        if (activeAction) {
          const matched = currentMotion === baseMotion && !dragonMotion.pendingOneShot;
          activeAction.setEffectiveTimeScale(matched ? baseTimeScale : 1);
        }

        controlledDragon.rotation.y = pose.heading;
        controlledDragon.rotation.z = pose.roll;
        controlledDragon.rotation.x = pose.pitch;
      }

      // ── Ambient terrain motion ───────────────────────────────────────
      elapsedSec += deltaSec;
      if (waterSurface?.material?.normalMap) {
        // Two offsets on one map at different rates: cheaper than a second
        // texture and enough to break up the repeat into moving water.
        const waterCfg = terrainTuning.water || {};
        const map = waterSurface.material.normalMap;
        map.offset.x = (elapsedSec * (waterCfg.scrollX ?? 0.035)) % 1;
        map.offset.y = (elapsedSec * (waterCfg.scrollY ?? 0.021)) % 1;
      }
      if (lavaMaterials.length) {
        const lavaCfg = terrainTuning.lava || {};
        const min = lavaCfg.emissiveMin ?? 0.75;
        const max = lavaCfg.emissiveMax ?? 2.3;
        // Two detuned sines read as an irregular breath; a single one pulses
        // like a metronome and gives the trick away.
        const t = elapsedSec * (lavaCfg.breatheHz ?? 0.45) * Math.PI * 2;
        const wave = (Math.sin(t) * 0.6 + Math.sin(t * 1.7 + 1.1) * 0.4 + 1) / 2;
        const intensity = min + (max - min) * wave;
        lavaMaterials.forEach((m) => { m.emissiveIntensity = intensity; });
        lavaLights.forEach((light) => {
          light.intensity = (lavaCfg.lightIntensity ?? 2.4) * (0.75 + wave * 0.5);
        });
      }

      // Spawning dracarys fire breath particles
      if (currentMotion === 'dracarys' && controlledDragon) {
        dracarysTimer += deltaMs;
        if (dracarysTimer >= 40) {
          dracarysTimer = 0;
          const dragonPos = new THREE.Vector3();
          controlledDragon.getWorldPosition(dragonPos);
          const yaw = controlledDragon.rotation.y;
          createDracarysParticles(dragonPos, yaw);
        }
      } else {
        dracarysTimer = 0;
      }

      // Update fire lights
      for (let lIdx = activeFireLights.length - 1; lIdx >= 0; lIdx--) {
        const fl = activeFireLights[lIdx];
        fl.lifetime -= deltaSec;
        if (fl.lifetime <= 0) {
          threeScene.remove(fl.light);
          fl.light.dispose();
          activeFireLights.splice(lIdx, 1);
        } else {
          fl.light.position.x += fl.velocity.x * deltaSec;
          fl.light.position.y += fl.velocity.y * deltaSec;
          fl.light.position.z += fl.velocity.z * deltaSec;

          const ratio = fl.lifetime / fl.maxLifetime;
          const flicker = 0.8 + Math.sin(Date.now() * 0.05) * 0.2;
          fl.light.intensity = ratio * 5 * flicker;
        }
      }

      // Update particle systems
      for (let pIdx = activeParticles.length - 1; pIdx >= 0; pIdx--) {
        const p = activeParticles[pIdx];
        const posAttr = p.points.geometry.attributes.position;
        let alive = false;

        for (let i = 0; i < p.lifetimes.length; i++) {
          if (p.lifetimes[i] > 0) {
            p.lifetimes[i] -= deltaSec;
            alive = true;

            const idx = i * 3;
            posAttr.array[idx] += p.velocities[idx] * deltaSec;
            posAttr.array[idx + 1] += p.velocities[idx + 1] * deltaSec;
            posAttr.array[idx + 2] += p.velocities[idx + 2] * deltaSec;

            if (p.isFireBreath) {
              p.velocities[idx] *= 0.93;
              p.velocities[idx + 2] *= 0.93;
              p.velocities[idx + 1] += 8 * deltaSec;
            } else if (p.isSmoke) {
              p.velocities[idx] *= 0.88;
              p.velocities[idx + 2] *= 0.88;
              p.velocities[idx + 1] += 12 * deltaSec;
            }

            // Fade particles out
            const ratio = p.lifetimes[i] / p.maxLifetimes[i];
            p.points.material.opacity = Math.max(0, ratio);

            if (p.isSmoke) {
              p.points.material.size = 10.0 + (1 - ratio) * 12.0;
            }
          }
        }

        if (p.isFireBreath && alive) {
          const avgLifetime = p.lifetimes.reduce((sum, val) => sum + Math.max(0, val), 0) / p.lifetimes.length;
          const avgMax = p.maxLifetimes.reduce((sum, val) => sum + val, 0) / p.lifetimes.length;
          const ratio = avgLifetime / avgMax;
          if (ratio > 0.7) {
            p.points.material.color.setHex(0xffeedd);
          } else if (ratio > 0.4) {
            p.points.material.color.setHex(0xffaa00);
          } else {
            p.points.material.color.setHex(0xff3300);
          }
        }

        posAttr.needsUpdate = true;

        if (!alive) {
          threeScene.remove(p.points);
          p.points.geometry.dispose();
          p.points.material.dispose();
          activeParticles.splice(pIdx, 1);
        }
      }

      // Update interactive prop animations (wobbles and pulses)
      for (const key in decorSprites) {
        const decor = decorSprites[key];

        // Dummy Wobble
        if (decor.wobbleTime > 0) {
          decor.wobbleTime -= deltaSec;
          const angle = Math.sin(decor.wobbleTime * 35) * decor.wobbleTime * 0.32;
          decor.sprite.rotation.z = angle;
          if (decor.wobbleTime <= 0) decor.sprite.rotation.z = 0;
        }

        // Crystal Resonating Pulse
        if (decor.pulseTime > 0) {
          decor.pulseTime -= deltaSec;
          const scale = 1 + Math.sin(decor.pulseTime * Math.PI * 5) * decor.pulseTime * 0.16;
          if (decor.is3D) {
            decor.sprite.scale.set(scale, scale * 2.2, scale);
            if (decor.sprite.material) {
              decor.sprite.material.emissiveIntensity = 0.8 + scale * 0.5;
            }
          } else {
            decor.sprite.scale.set(scale * 22, scale * 26, 1);
          }
          if (decor.pulseTime <= 0) {
            if (decor.is3D) {
              decor.sprite.scale.set(1, 2.2, 1);
              if (decor.sprite.material) {
                decor.sprite.material.emissiveIntensity = 0.8;
              }
            } else {
              decor.sprite.scale.set(22, 26, 1);
            }
          }
        }

        // Crystal constant auto-rotation
        if (decor.type === 'crystal' && decor.is3D) {
          decor.sprite.rotation.y += deltaSec * 0.5;
        }
      }

      // Update residents 3D coordinates based on Phaser equivalents
      residents.forEach((r) => {
        const visual = residentVisuals[r.animal.id];
        if (!visual) return;

        const currentHeight = terrainHeightAt(r.footprint);
        const surface = gridToWorld3D(r.footprint.col, r.footprint.row, currentHeight, cols, rows);

        // The group (with the grounded shadow + selection ring) always rides the
        // terrain surface. Real, player-controlled flight altitude comes from the
        // movement controller and lifts only the flight pivot + name label.
        visual.group.position.set(surface.x, surface.y, surface.z);
        const altitude = r.animal.id === selectedWyvernId
          ? (scene.movement?.getAltitude?.() ?? 0)
          : 0;
        if (visual.pivot) visual.pivot.position.y = altitude;
        if (visual.label) visual.label.position.y = LABEL_BASE_Y + altitude;

        // Heading, roll and pitch are applied at the top of update() by the
        // motion state machine. It is deliberately driven by the last WORLD
        // movement vector, not movement.direction — that is a camera-relative
        // 8-way art heading for the 2D sprites, so using it here re-pointed the
        // model every time the camera orbited (the dragon spun with you).
      });

      // Free-orbit camera (Vault): ease toward user-driven targets and skip the
      // Phaser rig / follow path entirely.
      if (freeCamera) {
        camYaw += (targetYaw - camYaw) * 0.2;
        camPitch += (targetPitch - camPitch) * 0.2;
        camDistance += (targetDistance - camDistance) * 0.15;

        camera.position.x = camTarget.x + camDistance * Math.cos(camPitch) * Math.sin(camYaw);
        camera.position.y = camTarget.y + camDistance * Math.sin(camPitch);
        camera.position.z = camTarget.z + camDistance * Math.cos(camPitch) * Math.cos(camYaw);
        camera.lookAt(camTarget);

        if (mixer) mixer.update(deltaSec);
        renderer.render(threeScene, camera);
        return;
      }

      // Synchronize 3D Camera with Phaser Camera inputs
      const phaserCam = scene.cameras.main;
      if (phaserCam) {
        // Read configuration settings. yawDeg/elevationStep are now continuous
        // (drag orbit), so derive pitch from the same linear rig the projection
        // uses (30° at step 0, ±7.5° per step) instead of a discrete lookup, and
        // ease toward the targets so both drag and stepped changes read smoothly.
        const rig = scene.cameraController?.view || { yawDeg: 0, elevationStep: 0 };
        const elevation = Number.isFinite(rig.elevationStep) ? rig.elevationStep : 0;
        const defaultPitchDeg = SANCTUARY.cameraRig.elevation.pitchDeg?.[0] ?? 30;
        const pitchStepDeg = SANCTUARY.cameraRig.elevation.pitchStepDeg ?? 7.5;
        const pitchDeg = defaultPitchDeg + elevation * pitchStepDeg;

        const targetYaw = (rig.yawDeg - 45) * Math.PI / 180; // -45° matches the isometric base angle
        const targetPitch = pitchDeg * Math.PI / 180;
        // Ease along the SHORT angular path so a full-turn yaw (or a reset from a
        // large accumulated angle) never unwinds through multiple spins.
        const yawDelta = Math.atan2(
          Math.sin(targetYaw - camYaw),
          Math.cos(targetYaw - camYaw),
        );
        camYaw += yawDelta * 0.2;
        camPitch += (targetPitch - camPitch) * 0.2;

        // Sync target coordinates to followed resident
        const targetResident = residents.find((r) => r.animal.id === followId);
        if (targetResident) {
          const followHeight = terrainHeightAt(targetResident.footprint);
          // Track the followed wyvern's flight altitude so it stays framed as it
          // climbs, instead of drifting to the top of the view.
          const followAltitude = targetResident.animal.id === selectedWyvernId
            ? (scene.movement?.getAltitude?.() ?? 0)
            : 0;
          const focus = gridToWorld3D(
            targetResident.footprint.col,
            targetResident.footprint.row,
            followHeight,
            cols,
            rows,
            followAltitude,
          );

          // Smoothly lerp camera focus target
          camTarget.lerp(new THREE.Vector3(focus.x, focus.y, focus.z), 0.12);
        }

        // Handle zoom based on Phaser camera zoom
        targetDistance = 460 / phaserCam.zoom;
        camDistance += (targetDistance - camDistance) * 0.15;

        // Position camera in orbit
        camera.position.x = camTarget.x + camDistance * Math.cos(camPitch) * Math.sin(camYaw);
        camera.position.y = camTarget.y + camDistance * Math.sin(camPitch);
        camera.position.z = camTarget.z + camDistance * Math.cos(camPitch) * Math.cos(camYaw);
        camera.lookAt(camTarget);
      }

      // Update GLTF animation mixer
      if (mixer) {
        mixer.update(deltaSec);
      }

      renderer.render(threeScene, camera);
    },

    // Force a motion slot, overriding the state machine. `null` hands control
    // back to it. Used by the debug panel and the Dracarys roster action.
    setMotion(motion) {
      pendingMotion = motion || 'idle';
      overrideMotion = motion || null;
      if (!controlledDragon && motion) playMotion(motion);
    },

    /** Every clip name in the loaded model, for the debug panel's picker. */
    listClips() {
      return [...clipNames];
    },

    /**
     * What the dragon is doing right now. The motion is decided across three
     * places — the state machine, the one-shot queue, and any override — so
     * without this readout a wrong pose gives no clue which one produced it.
     */
    getMotionState() {
      return {
        current: currentMotion,
        base: baseMotion,
        pending: dragonMotion.pendingOneShot,
        override: overrideMotion,
        timeScale: Number(baseTimeScale.toFixed(2)),
        airborne: dragonMotion.airborne,
        headingDeg: Math.round(dragonMotion.heading * 180 / Math.PI),
        rollDeg: Math.round(dragonMotion.roll * 180 / Math.PI),
        pitchDeg: Math.round(dragonMotion.pitch * 180 / Math.PI),
      };
    },

    /** Motion slot → clip name, as currently bound. */
    listMotionSlots() {
      return Object.keys(SANCTUARY.dragon3D?.clips || {});
    },

    /**
     * Rebind a motion slot to a different clip at runtime, so the remaining
     * clip↔slot choices can be settled by eye instead of by re-running
     * tools/prep-drogon.mjs. Not persisted — the winning pairs go back into
     * SANCTUARY.dragon3D.clips by hand.
     */
    setClip(motion, clipName) {
      if (!mixer || !controlledDragon) return false;
      const cached = _gltfCache.get(SANCTUARY.dragon3D.modelUrl);
      const clip = THREE.AnimationClip.findByName(cached?.animations || [], clipName);
      if (!clip) return false;

      const wasCurrent = currentMotion === motion;
      actions[motion]?.stop();
      const next = mixer.clipAction(clip);
      if ((SANCTUARY.dragon3D.oneShotClips || []).includes(motion)) {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      }
      actions[motion] = next;
      if (wasCurrent) {
        currentMotion = null;
        playMotion(motion, 0);
      }
      return true;
    },

    resize() {
      renderer.setSize(GAME.width, GAME.height, false);
      camera.aspect = GAME.width / GAME.height;
      camera.updateProjectionMatrix();
    },

    // Clear this instance's scene graph without disposing the shared renderer,
    // geometry cache, material cache, or texture cache. Those persist across
    // rebuilds and scene travel so re-entering Base is instant.
    destroy() {
      controlledDragon = null;
      mixer = null;

      // Dispose shadow map resources to prevent GPU memory leaks
      threeScene.traverse((obj) => {
        if (obj.shadow && typeof obj.shadow.dispose === 'function') {
          obj.shadow.dispose();
        }
      });

      // Dispose fire lights
      activeFireLights.forEach((fl) => {
        threeScene.remove(fl.light);
        fl.light.dispose();
      });
      activeFireLights.length = 0;

      // Per-instance terrain extras. The tile geometry/materials themselves are
      // in the shared caches and deliberately survive; these are not.
      lavaLights.forEach((light) => {
        threeScene.remove(light);
        light.dispose();
      });
      lavaLights.length = 0;
      lavaMaterials.length = 0;
      if (waterSurface) {
        threeScene.remove(waterSurface);
        waterSurface.geometry.dispose();
        waterSurface.material.normalMap?.dispose();
        waterSurface.material.dispose();
        waterSurface = null;
      }

      // Dispose textures
      if (_fireParticleTex) {
        _fireParticleTex.dispose();
        _fireParticleTex = null;
      }
      if (_smokeParticleTex) {
        _smokeParticleTex.dispose();
        _smokeParticleTex = null;
      }

      // Dispose per-instance objects that are NOT in the shared caches:
      // particle geometries/materials and per-resident label textures.
      activeParticles.forEach((p) => {
        threeScene.remove(p.points);
        p.points.geometry.dispose();
        p.points.material.dispose();
      });
      activeParticles.length = 0;

      // Dispose per-instance 3D prop geometries and materials (not cached)
      for (const key in decorSprites) {
        const decor = decorSprites[key];
        if (decor.is3D && decor.sprite) {
          decor.sprite.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
              } else {
                obj.material.dispose();
              }
            }
          });
        }
      }

      // Walk through residents and dispose their per-instance materials
      // (shadow, ring, label) but NOT shared cached textures.
      for (const id in residentVisuals) {
        const vis = residentVisuals[id];
        if (vis.group) {
          vis.group.traverse((obj) => {
            // Dispose per-instance materials (shadow, ring, label) only.
            // Cached materials (tile biomes) and cached textures are kept.
            if (obj.material && !obj.material._sanctuary3DCached) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m) => m.dispose());
              } else {
                obj.material.dispose();
              }
            }
          });
        }
      }

      // Remove all children from the Three.js scene without touching the
      // shared renderer. Clearing lets the GC collect the per-frame scene
      // graph while the module-level caches stay warm.
      threeScene.clear();
    },
  };
}
