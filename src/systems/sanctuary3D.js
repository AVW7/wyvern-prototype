import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { GAME, SANCTUARY, TERRAIN } from '../config.js';
import { BIOMES } from '../data/biomes.js';
import { TILE_SIZE, HEIGHT_SCALE, gridToWorld3D, tileCenterY } from './grid3d.js';

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

  const sideMat = new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.82 });

  let topMat;
  if (biome === 'springwater') {
    topMat = new THREE.MeshStandardMaterial({
      color: topColor,
      roughness: 0.1,
      transparent: true,
      opacity: 0.65,
      roughnessMap: null,
    });
  } else if (biome === 'lava') {
    topMat = new THREE.MeshStandardMaterial({
      color: topColor,
      roughness: 0.9,
      emissive: new THREE.Color('#ff4500'),
      emissiveIntensity: 1.5,
    });
  } else {
    topMat = new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.92 });
  }

  const materials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
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
  let currentMotion = null;
  let pendingMotion = 'idle';
  let dracarysTimer = 0;
  let currentScaleMult = 1.0;
  let currentAnimSpeed = 1.0;

  // Camera State
  let camTarget = new THREE.Vector3(0, 0, 0);
  let camYaw = 0;
  let camPitch = 30 * Math.PI / 180;
  let camDistance = 450;
  let targetDistance = 450;
  let followId = selectedWyvernId;

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

      // Position bottom at Y = 0 (since geometry bottom is at 0)
      dummy.position.set(surface.x, 0, surface.z);
      dummy.scale.set(1, height * HEIGHT_SCALE, 1);
      dummy.updateMatrix();
      instMesh.setMatrixAt(index, dummy.matrix);

      tilesData.push({ col, row, height });
    });

    instMesh.instanceMatrix.needsUpdate = true;
    instMesh.userData = { tilesData };
    threeScene.add(instMesh);
    tileMeshes.push(instMesh);
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

    // Drawers from Phaser cache
    let phaserKey = `iso-decor-${cell.biome}-${type}-${variant}`;
    let sourceImage = scene.textures.get(phaserKey)?.getSourceImage();
    if (!sourceImage) {
      // Fallback
      phaserKey = `iso-decor-moss-tree-0`;
      sourceImage = scene.textures.get(phaserKey)?.getSourceImage();
    }

    if (!sourceImage) return;

    const texture = getCachedTexture(phaserKey, sourceImage);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);

    const surface = gridToWorld3D(col, row, cell.height, cols, rows);
    sprite.position.set(surface.x, surface.y + 12, surface.z);

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
      for (const [motion, clipName] of Object.entries(config.clips)) {
        const clip = THREE.AnimationClip.findByName(cached.animations, clipName);
        if (clip) {
          localActions[motion] = localMixer.clipAction(clip);
        }
      }

      onReady(cloned, localMixer, localActions);
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
      loadOrCloneDragon(config, flightPivot, (cloned, localMixer, localActions) => {
        visual3D = cloned;
        mixer = localMixer;
        Object.assign(actions, localActions);
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

  // Crossfade dragon motions
  function playMotion(motion, fadeMs = 250) {
    const next = actions[motion] || actions.idle;
    if (!next || currentMotion === motion) return;
    const previous = actions[currentMotion];
    next.reset().setEffectiveWeight(1).play();
    if (previous && previous !== next) {
      previous.crossFadeTo(next, fadeMs / 1000, false);
    }
    currentMotion = motion;
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

      const intersects = raycaster.intersectObjects(tileMeshes);
      if (intersects.length > 0) {
        const hit = intersects[0];
        if (hit.object instanceof THREE.InstancedMesh) {
          const instanceId = hit.instanceId;
          const data = hit.object.userData.tilesData[instanceId];
          if (data) {
            return { col: data.col, row: data.row };
          }
        } else {
          const data = hit.object.userData;
          if (data) {
            return { col: data.col, row: data.row };
          }
        }
      }
      return null;
    },

    // Update coordinates, animations, and render frame
    update(deltaMs) {
      const deltaSec = deltaMs / 1000;

      // Spawning dracarys fire breath particles
      if (pendingMotion === 'dracarys' && controlledDragon) {
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

        // Handle rotations (yaw facing)
        if (r.animal.id === selectedWyvernId && controlledDragon) {
          const isMoving = scene.movement?.isMoving;
          const moveVector = scene.movement?.lastWorldVector;
          if (isMoving && moveVector && (moveVector.col !== 0 || moveVector.row !== 0)) {
            // Face the direction of active movement vector
            const yaw = Math.atan2(moveVector.col, moveVector.row);
            controlledDragon.rotation.y = yaw;
          } else {
            // Fall back to the direction string when stationary/performing actions
            const dir = scene.movement?.direction;
            const DIRECTION_TO_YAW = {
              's': 0,
              'se': Math.PI / 4,
              'e': Math.PI / 2,
              'ne': 3 * Math.PI / 4,
              'n': Math.PI,
              'nw': -3 * Math.PI / 4,
              'w': -Math.PI / 2,
              'sw': -Math.PI / 4,
            };
            if (dir && DIRECTION_TO_YAW[dir] !== undefined) {
              controlledDragon.rotation.y = DIRECTION_TO_YAW[dir];
            }
          }
        }
      });

      // Synchronize 3D Camera with Phaser Camera inputs
      const phaserCam = scene.cameras.main;
      if (phaserCam) {
        // Read configuration settings
        const rig = scene.cameraController?.view || { yawDeg: 0, elevationStep: 0 };
        const pitchMap = SANCTUARY.cameraRig.elevation.pitchDeg;
        const pitchAngle = (pitchMap[rig.elevationStep] ?? 30) * Math.PI / 180;

        camYaw = (rig.yawDeg - 45) * Math.PI / 180; // offset 45 degrees to match isometric view angle
        camPitch = pitchAngle;

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

    setMotion(motion) {
      pendingMotion = motion;
      playMotion(motion);
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
