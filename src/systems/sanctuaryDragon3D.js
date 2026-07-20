// sanctuaryDragon3D: Milestone 1 of docs/SANCTUARY_3D_DRAGON_PLAN.md. Renders
// exactly one Base-scene resident (the controlled roster wyvern) as a
// Three.js model layered over the Phaser canvas, instead of a 2D sprite.
// This is the only file that imports `three` — the one recorded, scoped
// toolchain exception in CLAUDE.md's Guardrails.
//
// The Three.js scene is a flat "billboard" orthographic view aligned with
// the game's internal GAME.width/height resolution (matching how Phaser's
// own Scale.FIT keeps a fixed internal resolution and lets CSS handle
// letterbox scaling — see the shared --stage-* vars in ui.css). Position
// tracks the resident's projected screen coordinate (from
// sanctuaryProjection.js's projectFootprint(), the single source of truth
// for world position) plus the Phaser camera's own scroll/zoom, so the 3D
// model stays approximately aligned with the 2D sanctuary as the player
// pans/zooms. Perfect tracking under camera-rig yaw/elevation changes is an
// explicit non-goal for Milestone 1 (see the plan's Non-goals).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GAME, SANCTUARY, TERRAIN } from '../config.js';
import { projectFootprint } from './sanctuaryProjection.js';

export function createSanctuaryDragon3D({ canvas } = {}) {
  const config = SANCTUARY.dragon3D;
  const target = canvas || document.getElementById('dragon3d');

  const renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  // Fixed internal resolution, matching Phaser's own Scale.FIT behavior —
  // CSS (the shared --stage-* vars) handles letterbox scaling, not the
  // renderer. See main.js's resize hook.
  renderer.setSize(GAME.width, GAME.height, false);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(
    -GAME.width / 2, GAME.width / 2, GAME.height / 2, -GAME.height / 2, 0.1, 5000,
  );
  camera.position.set(0, 0, 1000);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xd8e6ff, 0x1a1a2a, 1.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
  keyLight.position.set(200, 400, 600);
  scene.add(keyLight);

  let root = null;
  let modelHeight = 1;
  let visible = false;
  let lastWorld = null; // projected world { x, y } from the previous sync, for yaw

  let mixer = null;
  const actions = {};           // motion name -> THREE.AnimationAction
  let currentMotion = null;     // 'idle' | 'walk' | 'fly'
  let pendingMotion = 'idle';   // requested before the GLTF finished loading
  let flightLiftPx = 0;         // eased toward the target lift while flying

  new GLTFLoader().load(
    config.modelUrl,
    (gltf) => {
      root = new THREE.Group();
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      modelHeight = size.y || 1;
      const center = new THREE.Vector3();
      box.getCenter(center);
      // Feet at local y = 0, body centred over x/z, so the model sits on the
      // footprint it occupies instead of hanging off it. Drogon's authored
      // origin is not centred horizontally; the old test mesh's was.
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;
      // Skinned meshes carry a bind-pose bounding sphere that does not cover
      // the animated silhouette, so Three.js culls them at the wrong moments.
      model.traverse((node) => { if (node.isMesh) node.frustumCulled = false; });
      root.add(model);
      root.visible = visible;
      scene.add(root);

      mixer = new THREE.AnimationMixer(model);
      for (const [motion, clipName] of Object.entries(config.clips)) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
        if (!clip) {
          // eslint-disable-next-line no-console
          console.warn('sanctuaryDragon3D: clip not found in model:', clipName);
          continue;
        }
        actions[motion] = mixer.clipAction(clip);
      }
      playMotion(pendingMotion, 0);
    },
    undefined,
    (error) => {
      // eslint-disable-next-line no-console
      console.error('sanctuaryDragon3D: failed to load', config.modelUrl, error);
    },
  );

  // Crossfades to `motion`, falling back to idle when a clip is missing so a
  // bad config name degrades to a still-animating dragon rather than a frozen
  // one. Returns silently before the GLTF resolves — setMotion() records the
  // request in pendingMotion and the load callback replays it.
  function playMotion(motion, fadeMs = config.crossfadeMs) {
    const next = actions[motion] || actions.idle;
    if (!next || currentMotion === motion) return;
    const previous = actions[currentMotion];
    next.reset().setEffectiveWeight(1).play();
    if (previous && previous !== next) {
      previous.crossFadeTo(next, fadeMs / 1000, false);
    }
    currentMotion = motion;
  }

  return {
    show() {
      visible = true;
      if (root) root.visible = true;
    },

    hide() {
      visible = false;
      if (root) root.visible = false;
      // Render one cleared frame immediately so no stale dragon image lingers
      // over Vault/Atlas/Mission once BaseScene.update() stops calling us.
      renderer.render(scene, camera);
    },

    // col/row: the resident's logical footprint. view: the sanctuary's
    // current projection view (from BaseScene.projectionView). camera: the
    // scene's main Phaser camera, read directly so this stays in step with
    // Phaser's own world -> screen transform. surfaceLift: the footprint's
    // own surfaceLift, so the dragon rides hills and terraces at the same
    // height the 2D residents do instead of sinking into raised ground.
    syncToFootprint(col, row, view, camera, surfaceLift = 0) {
      if (!root) return;
      // Ground-plane projection. Elevation is applied below as a lift, which
      // is how the 2D movement controller places residents on raised tiles.
      const projected = projectFootprint(col, row, TERRAIN.baseHeight, view);
      const {
        scrollX = 0, scrollY = 0, zoom = 1,
        width = GAME.width, height = GAME.height,
      } = camera || {};

      // Phaser scales about the camera's centre, not its top-left corner:
      // screen = (world - scroll - origin) * zoom + origin. Dropping the
      // origin terms makes the model slide off its tile as the player zooms.
      const originX = width / 2;
      const originY = height / 2;
      const worldY = projected.y - surfaceLift;
      const screenX = (projected.x - scrollX - originX) * zoom + originX;
      const screenY = (worldY - scrollY - originY) * zoom + originY;

      // Yaw comes from movement through the *world*, not across the screen —
      // panning and zooming both change the screen position without the
      // dragon having turned.
      if (lastWorld) {
        const dx = projected.x - lastWorld.x;
        const dy = projected.y - lastWorld.y;
        if (dx * dx + dy * dy > 0.25) {
          root.rotation.y = Math.atan2(dx, dy);
        }
      }
      lastWorld = { x: projected.x, y: projected.y };

      root.position.x = screenX - GAME.width / 2;
      // Screen Y grows downward, world Y grows upward. flightLiftPx raises the
      // dragon off the tile it still logically occupies while flying.
      root.position.y = -(screenY - GAME.height / 2) + flightLiftPx * zoom;
      root.position.z = 0;
      root.scale.setScalar((config.targetHeightPx / Math.max(modelHeight, 0.001)) * zoom);
    },

    // motion: 'idle' | 'walk' | 'fly'. Movement and flight are independent —
    // BaseScene decides which wins (flying beats walking).
    setMotion(motion) {
      pendingMotion = motion;
      playMotion(motion);
    },

    update(deltaMs) {
      const deltaSec = deltaMs / 1000;
      // Ease the lift so takeoff and landing read as a transition rather than
      // the dragon teleporting between ground and air.
      const targetLift = currentMotion === 'fly' ? config.flightLiftPx : 0;
      flightLiftPx += (targetLift - flightLiftPx)
        * Math.min(1, deltaSec * config.flightLiftLerpHz);
      mixer?.update(deltaSec);
      renderer.render(scene, camera);
    },

    // Internal render resolution stays fixed (see setSize above) — CSS
    // scaling already tracks #game's canvas via the shared --stage-* vars.
    // Kept as a hook for future HiDPI/resolution tuning.
    resize() {},

    destroy() {
      root = null;
      renderer.dispose();
    },
  };
}
