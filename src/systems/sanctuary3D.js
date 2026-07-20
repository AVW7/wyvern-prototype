import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GAME, SANCTUARY, TERRAIN } from '../config.js';
import { BIOMES } from '../data/biomes.js';

const TILE_SIZE = 24;
const HEIGHT_SCALE = 12;

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

// ── Helpers ────────────────────────────────────────────────────────────

/** Lazily create / return the single WebGLRenderer for the #dragon3d canvas. */
function getRenderer() {
  const target = document.getElementById('dragon3d');
  if (!target) return null;

  if (_renderer && _renderer.domElement === target) return _renderer;

  // First call, or canvas was replaced (shouldn't happen in this prototype).
  if (_renderer) _renderer.dispose();
  _renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true });
  _renderer.setClearColor(0x000000, 0);
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
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  _textureCache.set(key, tex);
  return tex;
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
  threeScene.add(sunLight);

  const tileMeshes = [];
  const decorSprites = {}; // key: col_row -> { sprite, type, cell, ... }
  const residentVisuals = {}; // key: id -> { root, shadow, ring, label, ... }
  const activeParticles = [];

  let controlledDragon = null; // reference to the GLTF dragon
  let mixer = null;
  const actions = {};
  let currentMotion = null;
  let pendingMotion = 'idle';
  let flightLift = 0;

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

  // Build Voxel Terrain
  const cols = tiles[0]?.length || 40;
  const rows = tiles.length || 40;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = tiles[r]?.[c];
      if (!cell) continue;

      const h = cell.height;
      const geo = getTileGeometry(h);
      const materials = getTileMaterials(cell.biome);
      const mesh = new THREE.Mesh(geo, materials);

      const tx = (c - cols / 2) * TILE_SIZE;
      const tz = (r - rows / 2) * TILE_SIZE;
      const ty = (h * HEIGHT_SCALE) / 2;

      mesh.position.set(tx, ty, tz);
      mesh.userData = { col: c, row: r, height: h };
      threeScene.add(mesh);
      tileMeshes.push(mesh);

      // Create decor if cell has it
      if (cell.decor) {
        createDecorSprite(c, r, cell);
      }
    }
  }

  // Create Decor Sprite
  function createDecorSprite(col, row, cell) {
    const { type, variant } = cell.decor;
    const key = `${col}_${row}`;

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

    const tx = (col - cols / 2) * TILE_SIZE;
    const tz = (row - rows / 2) * TILE_SIZE;
    const ty = cell.height * HEIGHT_SCALE;

    sprite.position.set(tx, ty + 12, tz);

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
          if (node.material) {
            node.material = node.material.clone();
            node.material.roughness = 0.6;
            node.material.metalness = 0.1;
          }
        }
      });

      cloned.scale.setScalar(finalScale);
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

    new GLTFLoader().load(url, (gltf) => {
      // Compute bounding box once from the original scene (bone matrices
      // are correct at this point). These measurements are reused for
      // every subsequent SkeletonUtils.clone call.
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
    });
  }

  // Spawn residents in 3D
  residents.forEach((r) => {
    const isControlled = r.animal.id === selectedWyvernId;
    const accentColor = new THREE.Color(r.accent || '#ffbf3f');

    const residentGroup = new THREE.Group();
    const tx = (r.footprint.col - cols / 2) * TILE_SIZE;
    const tz = (r.footprint.row - rows / 2) * TILE_SIZE;
    const ty = (tiles[r.footprint.row]?.[r.footprint.col]?.height || 1) * HEIGHT_SCALE;
    residentGroup.position.set(tx, ty, tz);
    threeScene.add(residentGroup);

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
    labelSprite.position.set(0, 32, 0);
    labelSprite.scale.set(32, 8, 1);
    residentGroup.add(labelSprite);

    let visual3D = null;

    if (isControlled && r.animal.species === 'wyvern') {
      const config = SANCTUARY.dragon3D;
      loadOrCloneDragon(config, residentGroup, (cloned, localMixer, localActions) => {
        visual3D = cloned;
        mixer = localMixer;
        Object.assign(actions, localActions);
        playMotion(pendingMotion, 0);
        controlledDragon = cloned;
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
        residentGroup.add(sprite);
        visual3D = sprite;
      }
    }

    residentVisuals[r.animal.id] = {
      group: residentGroup,
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

    // Light brazier: change texture and trigger fire particles
    lightBrazier(col, row) {
      const key = `${col}_${row}`;
      const decor = decorSprites[key];
      if (decor && (decor.type === 'unlitBrazier' || decor.type === 'brazier')) {
        decor.type = 'litBrazier';

        // Swap texture
        const phaserKey = `iso-decor-moss-torch-0`; // Re-use torch flame texture
        const sourceImage = scene.textures.get(phaserKey)?.getSourceImage();
        if (sourceImage) {
          decor.sprite.material.map = getCachedTexture(phaserKey, sourceImage);
          decor.sprite.material.needsUpdate = true;
        }

        // Spawn fire particles
        createFireParticles(decor.sprite.position);

        // Add a point light to the fire!
        const fireLight = new THREE.PointLight(0xff7700, 1.8, 120);
        fireLight.position.set(0, 4, 0);
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
        const data = intersects[0].object.userData;
        return { col: data.col, row: data.row };
      }
      return null;
    },

    // Update coordinates, animations, and render frame
    update(deltaMs) {
      const deltaSec = deltaMs / 1000;

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

            // Fade particles out
            p.points.material.opacity = Math.max(0, p.lifetimes[i] / p.maxLifetimes[i]);
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
          decor.sprite.scale.set(scale * 22, scale * 26, 1);
          if (decor.pulseTime <= 0) {
            decor.sprite.scale.set(22, 26, 1);
          }
        }
      }

      // Update residents 3D coordinates based on Phaser equivalents
      residents.forEach((r) => {
        const visual = residentVisuals[r.animal.id];
        if (!visual) return;

        const tx = (r.footprint.col - cols / 2) * TILE_SIZE;
        const tz = (r.footprint.row - rows / 2) * TILE_SIZE;
        const currentHeight = tiles[r.footprint.row]?.[r.footprint.col]?.height || 1;
        const baseTy = currentHeight * HEIGHT_SCALE;

        // Apply visual height lift for flying
        const targetLift = (r.animal.id === selectedWyvernId && currentMotion === 'fly')
          ? SANCTUARY.dragon3D.flightLiftPx
          : 0;

        if (r.animal.id === selectedWyvernId) {
          flightLift += (targetLift - flightLift) * Math.min(1, deltaSec * SANCTUARY.dragon3D.flightLiftLerpHz);
          visual.group.position.set(tx, baseTy + flightLift, tz);
        } else {
          visual.group.position.set(tx, baseTy, tz);
        }

        // Handle rotations (yaw facing)
        if (r.animal.id === selectedWyvernId && controlledDragon) {
          // Continuous yaw calculation based on moving vector
          const moveVector = scene.movement?.lastWorldVector;
          if (moveVector && (moveVector.col !== 0 || moveVector.row !== 0)) {
            // Facing angle in XZ plane
            const yaw = Math.atan2(moveVector.col, moveVector.row);
            controlledDragon.rotation.y = yaw;
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
          const rx = (targetResident.footprint.col - cols / 2) * TILE_SIZE;
          const rz = (targetResident.footprint.row - rows / 2) * TILE_SIZE;
          const ry = (tiles[targetResident.footprint.row]?.[targetResident.footprint.col]?.height || 1) * HEIGHT_SCALE;

          // Smoothly lerp camera focus target
          camTarget.lerp(new THREE.Vector3(rx, ry, rz), 0.12);
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

      // Dispose per-instance objects that are NOT in the shared caches:
      // particle geometries/materials and per-resident label textures.
      activeParticles.forEach((p) => {
        threeScene.remove(p.points);
        p.points.geometry.dispose();
        p.points.material.dispose();
      });
      activeParticles.length = 0;

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
