// BaseScene: the explorable sanctuary grounds. The roster remains the source
// of the resident population and HTML owns fixed management UI, while Phaser
// owns roaming, world prompts, action effects, and camera presentation.
import {
  SANCTUARY, TERRAIN, WYVERN_STATES,
} from '../config.js';
import { sortByDepth } from '../systems/iso.js';
import {
  animateSanctuaryProps,
  buildSanctuaryView,
  clearSanctuaryEffects,
  coverSanctuaryCamera,
  playSanctuaryEffect,
  reprojectSanctuaryView,
  spawnSanctuaryResidents,
  updateSanctuaryOccluders,
  updateSanctuaryResidentReadability,
} from '../systems/sanctuaryRender.js';
import {
  createSanctuaryCamera,
  SANCTUARY_CAMERA_MODES,
} from '../systems/sanctuaryCamera.js';
import {
  createSanctuaryMovement,
  createSanctuaryWanderers,
} from '../systems/sanctuaryMovement.js';
import { createSanctuaryInteractions } from '../systems/sanctuaryInteractions.js';
import {
  normalizeView,
  projectGrid,
  projectFootprint,
  unprojectGround,
} from '../systems/sanctuaryProjection.js';
import { buildSanctuaryExterior } from '../data/sanctuary.js';
import { buildRoostOverlay } from '../ui/roostPanel.js';
import {
  gainXp, getAnimal, raiseBond, recruitAnimal,
} from '../systems/roster.js';

// Scene starts destroy display objects, but this small in-memory preference row
// survives Base -> Vault/Mission -> Base. Durable save/load remains deliberately
// deferred to the broader persistence milestone.
const SANCTUARY_SESSION = {
  selectedWyvernId: null,
  panelCollapsed: false,
  cameraMode: SANCTUARY_CAMERA_MODES.OVERVIEW,
  cameraView: { yawDeg: 0, elevationStep: 0 },
};

const CAMERA_MODES = new Set(Object.values(SANCTUARY_CAMERA_MODES));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function targetFootprint(target, view = {}) {
  let footprint = typeof target?.footprint === 'function'
    ? target.footprint()
    : target?.footprint;
  const declaredLogical = typeof target?.logicalFootprint === 'function'
    ? target.logicalFootprint()
    : target?.logicalFootprint;
  const col = declaredLogical?.col ?? footprint?.col ?? target?.col;
  const row = declaredLogical?.row ?? footprint?.row ?? target?.row;
  const hasLogical = Number.isFinite(col) && Number.isFinite(row);
  if (Number.isFinite(footprint?.x) && Number.isFinite(footprint?.y)) {
    return hasLogical ? { ...footprint, col, row } : footprint;
  }
  if (hasLogical) {
    footprint = {
      ...projectFootprint(col, row, TERRAIN.baseHeight, view),
      col,
      row,
    };
  }
  return footprint ?? null;
}

export default class BaseScene extends Phaser.Scene {
  constructor() {
    super('Base');
  }

  create() {
    this.world = null;
    this.residents = [];
    this.selectedResident = null;
    this.movement = null;
    this.wanderers = null;
    this.cameraController = null;
    this.interactions = null;
    this.messageTimer = null;
    this.resultMessage = '';
    this.atlasConfirmUntil = 0;
    this.panelCollapsed = SANCTUARY_SESSION.panelCollapsed;
    this.selectedWyvernId = SANCTUARY_SESSION.selectedWyvernId;
    this.cameraMode = CAMERA_MODES.has(SANCTUARY_SESSION.cameraMode)
      ? SANCTUARY_SESSION.cameraMode
      : SANCTUARY_CAMERA_MODES.OVERVIEW;
    this.projectionView = normalizeView(SANCTUARY_SESSION.cameraView);

    // Register before our individual controllers so their input hooks can be
    // released as one unit. Scene transitions save camera state explicitly;
    // Phaser system plugins may shut the CameraManager down before this event.
    this.events.once('shutdown', () => this.cleanUp());

    this.buildWorld({ restoreView: SANCTUARY_SESSION.cameraView });
    this.buildOverlay();
  }

  update(time, delta) {
    if (!this.world) return;

    const moved = this.movement?.update(time, delta) ?? false;
    this.wanderers?.update(time, delta);
    if (moved && this.cameraController?.mode !== SANCTUARY_CAMERA_MODES.FOLLOW) {
      this.cameraController?.setMode(SANCTUARY_CAMERA_MODES.FOLLOW);
    }
    this.cameraController?.update(time, delta);
    this.interactions?.update(time);

    const footprint = this.controlledFootprint();
    const hoveredResidentId = this.interactions?.hovered?.target?.animal?.id ?? null;
    coverSanctuaryCamera(this.world.backdrop, this.cameras.main);
    updateSanctuaryResidentReadability(
      this.residents,
      this.cameras.main,
      this.selectedWyvernId,
      hoveredResidentId,
    );
    updateSanctuaryOccluders(this.world.placed, footprint);

    // Prompt/marker depths and wandering actors are dynamic. The sanctuary's
    // population is small enough that a single continuous painter sort is the
    // clearest and safest implementation.
    sortByDepth(this.world.layer);
  }

  // Rebuilds all world display objects after recruiting or changing the
  // controlled wyvern. Selection and camera state are captured before the
  // shared fitted-view helper resets the camera, then restored and clamped.
  buildWorld({ restoreView = null } = {}) {
    const cameraView = restoreView ?? this.captureCameraView();
    const projectionView = normalizeView(cameraView ?? this.projectionView);
    this.projectionView = projectionView;
    this.destroyControllers();
    this.tweens.killAll();
    this.destroyWorldDisplay();

    const worldData = buildSanctuaryExterior();
    this.world = buildSanctuaryView(
      this,
      SANCTUARY.VIEWS.OUTSIDE,
      worldData.tiles,
      { projectionView },
    );
    this.world.data = worldData;
    this.residents = spawnSanctuaryResidents(
      this,
      this.world.layer,
      SANCTUARY.VIEWS.OUTSIDE,
      this.world.zoom,
      { projectionView },
    );
    this.resolveControlledResident();

    this.movement = createSanctuaryMovement({
      scene: this,
      layer: this.world.layer,
      tiles: worldData.tiles,
      resident: this.selectedResident,
      view: projectionView,
      inputBlocked: () => this.cameraController?.transitioning === true,
      onMoveStart: () => this.cameraController?.setMode(SANCTUARY_CAMERA_MODES.FOLLOW),
    });
    this.wanderers = createSanctuaryWanderers({
      scene: this,
      layer: this.world.layer,
      tiles: worldData.tiles,
      residents: this.residents,
      excludeId: this.selectedWyvernId,
      view: projectionView,
      inputBlocked: () => this.cameraController?.transitioning === true,
    });
    this.cameraController = createSanctuaryCamera(this, {
      bounds: this.world.bounds,
      panelCollapsed: this.panelCollapsed,
      followTarget: () => this.controlledFootprint(),
      view: projectionView,
      onModeChange: (mode) => this.onCameraModeChange(mode),
      onViewChange: (next, previous, complete) => (
        this.transitionCameraView(next, previous, complete)
      ),
    });
    this.buildInteractions(worldData.interactions);

    this.residents.forEach((resident) => {
      resident.selectionRing?.setVisible(resident.animal.id === this.selectedWyvernId);
    });
    animateSanctuaryProps(this, this.world.placed);
    this.restoreCameraView(cameraView);
    coverSanctuaryCamera(this.world.backdrop, this.cameras.main);
    sortByDepth(this.world.layer);
    this.saveSessionState();
  }

  resolveControlledResident() {
    const wyverns = this.residents.filter((resident) => resident.animal.species === 'wyvern');
    this.selectedResident = wyverns.find(
      (resident) => resident.animal.id === this.selectedWyvernId,
    ) ?? wyverns[0] ?? null;
    this.selectedWyvernId = this.selectedResident?.animal.id ?? null;
    SANCTUARY_SESSION.selectedWyvernId = this.selectedWyvernId;
  }

  controlledFootprint() {
    return this.movement?.getFootprint?.() ?? this.selectedResident?.footprint ?? null;
  }

  captureCameraView() {
    if (!this.cameraController || !this.cameras?.main) return null;
    const camera = this.cameras.main;
    return {
      mode: this.cameraController.mode,
      zoom: camera.zoom,
      scrollX: camera.scrollX,
      scrollY: camera.scrollY,
      ...this.cameraController.view,
    };
  }

  restoreCameraView(view) {
    if (!this.cameraController) return;
    this.projectionView = normalizeView(view ?? this.cameraController.view);
    const desiredMode = CAMERA_MODES.has(this.cameraMode)
      ? this.cameraMode
      : SANCTUARY_CAMERA_MODES.OVERVIEW;
    if (desiredMode === SANCTUARY_CAMERA_MODES.OVERVIEW) {
      this.cameraController.setMode(SANCTUARY_CAMERA_MODES.OVERVIEW);
      return;
    }

    const accepted = this.cameraController.setMode(desiredMode, { snap: !view });
    if (!accepted) return;
    if (view && Number.isFinite(view.zoom)
      && Number.isFinite(view.scrollX) && Number.isFinite(view.scrollY)) {
      const camera = this.cameras.main;
      camera.setZoom(clamp(
        view.zoom,
        this.cameraController.minZoom,
        this.cameraController.maxZoom,
      ));
      camera.setScroll(view.scrollX, view.scrollY);
      this.cameraController.refit({ reset: false });
    }
  }

  buildInteractions(authoredTargets) {
    const authored = authoredTargets.map((descriptor) => {
      const placed = this.world.placed.decor.find((decor) => (
        decor.col === descriptor.col
        && decor.row === descriptor.row
        && (!descriptor.propType || decor.type === descriptor.propType)
      ));
      return {
        ...descriptor,
        footprint: placed?.footprint ?? targetFootprint(descriptor, this.projectionView),
        logicalFootprint: placed?.logicalFootprint ?? {
          col: descriptor.col,
          row: descriptor.row,
        },
        sprite: placed?.sprite,
        hitRadius: descriptor.type === 'spring' ? 34 : 48,
      };
    });
    const residents = this.residents
      // Otherwise the controlled actor is always the nearest target at distance
      // zero and E can never reach a landmark or another resident.
      .filter((resident) => resident.animal.id !== this.selectedWyvernId)
      .map((resident) => ({
        id: `resident-${resident.animal.id}`,
        type: 'resident',
        action: 'resident',
        label: resident.animal.species === 'wyvern'
          ? `Focus on ${resident.animal.name}`
          : `Greet ${resident.animal.name}`,
        range: 70,
        hitRadius: 56,
        animal: resident.animal,
        sprite: resident.sprite,
        footprint: () => resident.footprint,
        logicalFootprint: () => resident.logicalFootprint ?? resident.footprint,
      }));

    this.interactions = createSanctuaryInteractions({
      scene: this,
      layer: this.world.layer,
      targets: [...authored, ...residents],
      actor: this.movement,
      camera: this.cameraController,
      view: this.projectionView,
      callbacks: {
        vault: () => { this.enterVault(); return true; },
        restore: (target) => this.drinkFromSpring(target),
        train: (target) => this.trainInWorld(target),
        feed: (target) => this.feedInWorld(target),
        resident: (target) => this.focusResident(target),
        atlas: (target) => this.activateAtlasMarker(target),
      },
    });
  }

  buildOverlay() {
    buildRoostOverlay({
      subtitle: 'Sanctuary grounds &middot; free roam &amp; roster management',
      travelLabel: 'Enter the Vault',
      collapsed: this.panelCollapsed,
      selectedId: this.selectedWyvernId,
      cameraMode: this.cameraController?.mode ?? this.cameraMode,
      cameraView: this.cameraController?.view ?? this.projectionView,
      cameraTransitioning: this.cameraController?.transitioning ?? false,
      resultMessage: this.resultMessage,
      onTravel: () => this.enterVault(),
      onLaunch: () => this.openAtlas(),
      onSelect: (id) => this.selectControlledWyvern(id),
      onCameraMode: (mode) => this.setCameraMode(mode),
      onCameraRig: (action) => this.handleCameraRig(action),
      onTrain: (id) => this.trainFromPanel(id),
      onFeed: (id) => this.feedFromPanel(id),
      onRecruit: (speciesId) => this.recruitFromPanel(speciesId),
      onCollapse: () => this.setPanelCollapsed(true),
      onExpand: () => this.setPanelCollapsed(false),
    });
  }

  setPanelCollapsed(collapsed) {
    if (this.cameraController?.transitioning) return false;
    this.panelCollapsed = Boolean(collapsed);
    SANCTUARY_SESSION.panelCollapsed = this.panelCollapsed;
    this.cameraController?.setPanelCollapsed(this.panelCollapsed);
    this.buildOverlay();
  }

  setCameraMode(mode) {
    if (this.cameraController?.transitioning) return false;
    if (!CAMERA_MODES.has(mode)) return;
    this.cameraController?.setMode(mode, {
      snap: mode === SANCTUARY_CAMERA_MODES.FOLLOW,
    });
    this.onCameraModeChange(this.cameraController?.mode ?? mode);
  }

  handleCameraRig(action) {
    if (!this.cameraController) return false;
    if (action === 'yaw-left') return this.cameraController.stepYaw(-1, { reason: 'ui' });
    if (action === 'yaw-right') return this.cameraController.stepYaw(1, { reason: 'ui' });
    if (action === 'elevation-down') {
      return this.cameraController.stepElevation(-1, { reason: 'ui' });
    }
    if (action === 'elevation-up') {
      return this.cameraController.stepElevation(1, { reason: 'ui' });
    }
    if (action === 'reset') return this.cameraController.reset({ reason: 'ui-reset' });
    return false;
  }

  transitionCameraView(next, previous, complete) {
    this.buildOverlay();
    const layer = this.world?.layer;
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const duration = complete.immediate || reduceMotion
      ? 0
      : Math.max(0, complete.durationMs ?? SANCTUARY.cameraRig.transitionMs);

    const finish = () => {
      complete();
      this.buildOverlay();
    };
    const apply = () => this.applyCameraProjection(next, previous);
    if (!layer?.active || duration === 0 || !this.tweens?.add) {
      apply();
      finish();
      return;
    }

    const fadeOutMs = Math.max(1, Math.round(duration * 0.38));
    this.tweens.add({
      targets: layer,
      alpha: 0,
      duration: fadeOutMs,
      ease: 'Sine.easeIn',
      onComplete: () => {
        apply();
        this.tweens.add({
          targets: layer,
          alpha: 1,
          duration: Math.max(1, duration - fadeOutMs),
          ease: 'Sine.easeOut',
          onComplete: finish,
        });
      },
    });
  }

  applyCameraProjection(next, previous) {
    if (!this.world || !this.cameraController) return;
    const camera = this.cameras.main;
    const previousCenter = {
      x: camera.scrollX + camera.width / 2,
      y: camera.scrollY + camera.height / 2,
    };
    const logicalCenter = unprojectGround(
      previousCenter.x,
      previousCenter.y,
      previous,
    );
    const oldZoom = camera.zoom;
    const mode = this.cameraController.mode;

    clearSanctuaryEffects(this);
    this.projectionView = normalizeView(next);
    this.world.bounds = reprojectSanctuaryView(
      this,
      this.world,
      this.projectionView,
    );
    this.movement?.setView?.(this.projectionView);
    this.wanderers?.setView?.(this.projectionView);
    this.interactions?.setView?.(this.projectionView);
    this.cameraController.setBounds(this.world.bounds, { reset: false });

    if (mode !== SANCTUARY_CAMERA_MODES.OVERVIEW) {
      camera.setZoom(clamp(
        oldZoom,
        this.cameraController.minZoom,
        this.cameraController.maxZoom,
      ));
    }
    if (mode === SANCTUARY_CAMERA_MODES.FOLLOW) {
      this.cameraController.snapToFollow();
    } else if (mode === SANCTUARY_CAMERA_MODES.SURVEY) {
      const projectedCenter = projectGrid(
        logicalCenter.col,
        logicalCenter.row,
        TERRAIN.baseHeight,
        this.projectionView,
      );
      camera.centerOn(projectedCenter.x, projectedCenter.y);
      this.cameraController.refit({ reset: false });
    }

    this.world.projectionView = this.projectionView;
    coverSanctuaryCamera(this.world.backdrop, camera);
    sortByDepth(this.world.layer);
    this.saveSessionState();
  }

  onCameraModeChange(mode) {
    this.cameraMode = mode;
    SANCTUARY_SESSION.cameraMode = mode;
    this.syncCameraModeUi(mode);
  }

  syncCameraModeUi(mode) {
    document.querySelectorAll('.camera-mode').forEach((button) => {
      const active = button.dataset.cameraMode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  selectControlledWyvern(id) {
    if (this.cameraController?.transitioning) return false;
    const animal = getAnimal(id);
    if (!animal) return;
    if (animal.species !== 'wyvern') {
      this.showResult(`${animal.name} can live here, but only wyverns can free-roam in this slice.`);
      return;
    }
    if (id === this.selectedWyvernId) {
      this.setCameraMode(SANCTUARY_CAMERA_MODES.FOLLOW);
      this.showResult(`Following ${animal.name}.`);
      return;
    }

    const cameraView = this.captureCameraView();
    this.selectedWyvernId = id;
    this.cameraMode = SANCTUARY_CAMERA_MODES.FOLLOW;
    this.buildWorld({ restoreView: cameraView });
    playSanctuaryEffect(
      this, this.world.layer, this.controlledFootprint(), 'select', this.projectionView,
    );
    this.showResult(`${animal.name} is now exploring the sanctuary.`);
  }

  drinkFromSpring(target) {
    const animal = raiseBond(this.selectedWyvernId, 5);
    if (!animal) return false;
    this.movement?.playAction(WYVERN_STATES.SPECIAL, 620);
    playSanctuaryEffect(
      this, this.world.layer, targetFootprint(target, this.projectionView), 'restore',
      this.projectionView,
    );
    this.showResult(`${animal.name} drinks from the spring. Bond +5.`);
    return true;
  }

  trainInWorld(target) {
    const animal = gainXp(this.selectedWyvernId, 25);
    if (!animal) return false;
    this.movement?.playAction(WYVERN_STATES.ATTACK, 650);
    playSanctuaryEffect(
      this, this.world.layer, targetFootprint(target, this.projectionView), 'train',
      this.projectionView,
    );
    this.showResult(`${animal.name} completes a training pass. XP +25.`);
    return true;
  }

  feedInWorld(target) {
    const animal = raiseBond(this.selectedWyvernId, 15);
    if (!animal) return false;
    this.movement?.playAction(WYVERN_STATES.GUARD, 580);
    playSanctuaryEffect(
      this, this.world.layer, targetFootprint(target, this.projectionView), 'feed',
      this.projectionView,
    );
    this.showResult(`${animal.name} shares a meal at the nest. Bond +15.`);
    return true;
  }

  focusResident(target) {
    const animal = target?.animal;
    if (!animal) return false;
    if (animal.species !== 'wyvern') {
      playSanctuaryEffect(
        this, this.world.layer, targetFootprint(target, this.projectionView), 'select',
        this.projectionView,
      );
      this.showResult(`${animal.name} greets the roaming wyvern.`);
      return true;
    }
    this.selectControlledWyvern(animal.id);
    return true;
  }

  activateAtlasMarker(target) {
    const now = this.time.now;
    if (!target.confirm || (this.atlasConfirmUntil > 0 && now <= this.atlasConfirmUntil)) {
      this.openAtlas();
      return true;
    }
    this.atlasConfirmUntil = now + 3500;
    playSanctuaryEffect(
      this, this.world.layer, targetFootprint(target, this.projectionView), 'atlas',
      this.projectionView,
    );
    this.showResult('The waystone points beyond the sanctuary. Interact again to open the World Atlas.');
    // Rejected activations do not consume the interaction cooldown, making the
    // required second deliberate action immediately available.
    return false;
  }

  trainFromPanel(id) {
    if (this.cameraController?.transitioning) return false;
    const animal = gainXp(id, 25);
    if (!animal) return;
    if (id === this.selectedWyvernId) this.movement?.playAction(WYVERN_STATES.ATTACK, 650);
    const resident = this.residents.find((entry) => entry.animal.id === id);
    playSanctuaryEffect(
      this, this.world.layer, resident?.footprint, 'train', this.projectionView,
    );
    this.showResult(`${animal.name} trains. XP +25.`);
  }

  feedFromPanel(id) {
    if (this.cameraController?.transitioning) return false;
    const animal = raiseBond(id, 15);
    if (!animal) return;
    if (id === this.selectedWyvernId) this.movement?.playAction(WYVERN_STATES.GUARD, 580);
    const resident = this.residents.find((entry) => entry.animal.id === id);
    playSanctuaryEffect(
      this, this.world.layer, resident?.footprint, 'feed', this.projectionView,
    );
    this.showResult(`${animal.name} is fed. Bond +15.`);
  }

  recruitFromPanel(speciesId) {
    if (this.cameraController?.transitioning) return false;
    const animal = recruitAnimal(speciesId);
    const cameraView = this.captureCameraView();
    this.buildWorld({ restoreView: cameraView });
    this.showResult(`${animal.name} has joined the sanctuary.`);
  }

  showResult(message, durationMs = 3600) {
    this.resultMessage = message;
    this.messageTimer?.remove(false);
    this.messageTimer = durationMs > 0
      ? this.time.delayedCall(durationMs, () => {
        this.resultMessage = '';
        this.messageTimer = null;
        if (this.sys.isActive()) this.buildOverlay();
      })
      : null;
    this.buildOverlay();
  }

  saveSessionState() {
    SANCTUARY_SESSION.selectedWyvernId = this.selectedWyvernId;
    SANCTUARY_SESSION.panelCollapsed = this.panelCollapsed;
    SANCTUARY_SESSION.cameraMode = this.cameraController?.mode ?? this.cameraMode;
    const cameraView = this.captureCameraView();
    // During Scene shutdown Phaser may clear CameraManager before user
    // listeners run. Preserve the explicit pre-transition snapshot instead of
    // replacing it with null in that lifecycle phase.
    if (cameraView) SANCTUARY_SESSION.cameraView = cameraView;
  }

  destroyControllers() {
    this.interactions?.destroy();
    this.wanderers?.destroy();
    this.movement?.destroy();
    this.cameraController?.destroy();
    this.interactions = null;
    this.wanderers = null;
    this.movement = null;
    this.cameraController = null;
  }

  destroyWorldDisplay() {
    if (!this.world) return;
    clearSanctuaryEffects(this);
    // Layer.destroy() owns child teardown. Calling removeAll(true) first skips
    // Phaser's removal callbacks, leaving animated Sprites in the UpdateList
    // with a dead Layer as their displayList and crashing the next shutdown.
    this.world.layer?.destroy();
    this.world.shadow?.destroy();
    this.world.backdrop?.destroy();
    this.world = null;
    this.residents = [];
    this.selectedResident = null;
  }

  cleanUp() {
    this.saveSessionState();
    this.messageTimer?.remove(false);
    this.messageTimer = null;
    this.destroyControllers();
    this.world = null;
    this.residents = [];
    this.selectedResident = null;
  }

  enterVault() {
    if (this.cameraController?.transitioning) return false;
    this.saveSessionState();
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Vault');
  }

  // Missions are chosen on the world map: the atlas owns destination seed and
  // mission launch, preserving the scene boundaries described in CLAUDE.md.
  openAtlas() {
    if (this.cameraController?.transitioning) return false;
    this.saveSessionState();
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Atlas');
  }
}
