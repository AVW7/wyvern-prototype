// Sanctuary-specific camera controls for BaseScene. AtlasScene deliberately
// keeps its own camera implementation; this controller only shares the same
// interaction principles (fit, cursor zoom, bounded pan) through scene APIs.
import { GAME, SANCTUARY } from '../config.js';
import {
  KeyboardAction, addActionKeys, isActionDown, onActionDown,
} from '../input/keyboardActions.js';

export const SANCTUARY_CAMERA_MODES = Object.freeze({
  OVERVIEW: 'overview',
  FOLLOW: 'follow',
  SURVEY: 'survey',
});

const FRAME_MS = 1000 / 60;
// Continuous drag-orbit sensitivity. Yaw is in degrees per screen pixel; tilt
// is in elevation-steps per pixel. Both are clamped to the rig's supported
// range so the shared projection (and camera-relative WASD) stay valid.
const ORBIT_YAW_SENS = 0.35;
const ORBIT_TILT_SENS = 0.006;
// Degrees of yaw per unit of horizontal wheel delta (touchpad two-finger swipe).
const WHEEL_YAW_SENS = 0.2;
const DEFAULT_CAMERA_RIG = Object.freeze({
  yaw: Object.freeze({ min: -45, max: 45, step: 45, default: 0 }),
  elevation: Object.freeze({ minStep: -1, maxStep: 1, step: 1, defaultStep: 0 }),
  transitionMs: 280,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function cameraRigTuning() {
  const configured = SANCTUARY.cameraRig ?? {};
  const configuredYaw = configured.yaw ?? {};
  const configuredElevation = configured.elevation ?? {};
  const yawMin = finite(configuredYaw.min, DEFAULT_CAMERA_RIG.yaw.min);
  const yawMax = finite(configuredYaw.max, DEFAULT_CAMERA_RIG.yaw.max);
  const elevationMin = finite(
    configuredElevation.minStep,
    DEFAULT_CAMERA_RIG.elevation.minStep,
  );
  const elevationMax = finite(
    configuredElevation.maxStep,
    DEFAULT_CAMERA_RIG.elevation.maxStep,
  );

  return {
    yaw: {
      min: Math.min(yawMin, yawMax),
      max: Math.max(yawMin, yawMax),
      step: Math.max(1, Math.abs(finite(
        configuredYaw.step,
        DEFAULT_CAMERA_RIG.yaw.step,
      ))),
      default: finite(
        configuredYaw.default,
        finite(configured.yawDeg, DEFAULT_CAMERA_RIG.yaw.default),
      ),
    },
    elevation: {
      minStep: Math.min(elevationMin, elevationMax),
      maxStep: Math.max(elevationMin, elevationMax),
      step: Math.max(1, Math.abs(finite(
        configuredElevation.step,
        DEFAULT_CAMERA_RIG.elevation.step,
      ))),
      defaultStep: finite(
        configuredElevation.defaultStep,
        DEFAULT_CAMERA_RIG.elevation.defaultStep,
      ),
    },
    transitionMs: Math.max(0, finite(
      configured.transitionMs,
      DEFAULT_CAMERA_RIG.transitionMs,
    )),
  };
}

function snapToStep(value, min, max, step, fallback) {
  const clamped = clamp(finite(value, fallback), min, max);
  const anchor = clamp(fallback, min, max);
  return clamp(anchor + Math.round((clamped - anchor) / step) * step, min, max);
}

/**
 * Resolve a serializable sanctuary rig view. Yaw is kept continuous over a full
 * turn so the camera can orbit all the way around a resident (see its front);
 * elevation stays snapped to the discrete tilt steps.
 */
export function normalizeSanctuaryCameraView(view = {}) {
  const rig = cameraRigTuning();
  return Object.freeze({
    yawDeg: finite(view?.yawDeg, rig.yaw.default),
    elevationStep: snapToStep(
      view?.elevationStep,
      rig.elevation.minStep,
      rig.elevation.maxStep,
      rig.elevation.step,
      rig.elevation.defaultStep,
    ),
  });
}

function viewsEqual(a, b) {
  return a.yawDeg === b.yawDeg && a.elevationStep === b.elevationStep;
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === 'function');
}

function validBounds(bounds) {
  return bounds
    && Number.isFinite(bounds.minX)
    && Number.isFinite(bounds.maxX)
    && Number.isFinite(bounds.minY)
    && Number.isFinite(bounds.maxY)
    && bounds.maxX > bounds.minX
    && bounds.maxY > bounds.minY;
}

function copyBounds(bounds) {
  if (!validBounds(bounds)) {
    throw new TypeError('Sanctuary camera requires finite, non-empty world bounds.');
  }
  return {
    minX: bounds.minX,
    maxX: bounds.maxX,
    minY: bounds.minY,
    maxY: bounds.maxY,
  };
}

function pointerButtonDown(pointer, name, mask, button) {
  const method = pointer?.[`${name}ButtonDown`];
  if (typeof method === 'function' && method.call(pointer)) return true;
  return pointer?.button === button || Boolean(pointer?.buttons & mask);
}

/**
 * Resolve a follow target at the moment it is used. A function is the most
 * rebuild-safe form, but resident/movement handles with `getFootprint()` or a
 * `{ footprint: { x, y } }` member are accepted too. The resolved x/y must be
 * the actor's ground footprint, not its visually lifted sprite position.
 */
function resolveFollowPoint(target) {
  let value = typeof target === 'function' ? target() : target;
  if (typeof value?.getFootprint === 'function') value = value.getFootprint();
  if (value?.footprint) value = value.footprint;
  if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) return null;
  return { x: value.x, y: value.y };
}

/**
 * Controller for the sanctuary's overview, follow, and free-survey views.
 *
 * Public lifecycle/API:
 * - `update(deltaMs)` advances smooth follow (also accepts `(time, delta)`).
 * - `setFollowTarget(target, options)` swaps the ground-footprint source.
 * - `setMode(mode, options)` / `toggleFollow()` change camera mode.
 * - `setView(view)` / `stepYaw()` / `stepElevation()` change the camera rig.
 * - `refit(options)` recomputes the fit, bounds, and panel bias.
 * - `setPanelCollapsed(collapsed)` refits and returns to overview.
 * - `reset()` returns the full rig to its default fitted overview.
 * - `consumeClickSuppression()` lets world interactions reject drag releases.
 * - `destroy()` removes every input listener installed by the controller.
 */
export class SanctuaryCameraController {
  constructor(scene, {
    bounds,
    panelCollapsed = false,
    followTarget = null,
    onModeChange = null,
    view = null,
    onViewChange = null,
    onOrbit = null,
  } = {}) {
    if (!scene?.cameras?.main || !scene?.input) {
      throw new TypeError('Sanctuary camera requires a scene with camera and input APIs.');
    }

    this.scene = scene;
    this.camera = scene.cameras.main;
    this.bounds = copyBounds(bounds);
    this.panelCollapsed = Boolean(panelCollapsed);
    this.followTarget = followTarget;
    this.onModeChange = typeof onModeChange === 'function' ? onModeChange : null;
    this.onViewChange = typeof onViewChange === 'function' ? onViewChange : null;
    this.onOrbit = typeof onOrbit === 'function' ? onOrbit : null;

    this._mode = SANCTUARY_CAMERA_MODES.OVERVIEW;
    this._view = normalizeSanctuaryCameraView(view);
    this._minZoom = 1;
    this._cameraBounds = null;
    this._destroyed = false;
    this._clickSuppressed = false;
    this._transitioning = false;
    this._transitionToken = 0;
    this._transitionPromise = Promise.resolve(true);
    this._finishViewTransition = null;
    this._transitionError = null;
    this.pan = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      movedBy: 0,
    };
    // Left-drag orbits the view continuously (yaw + tilt) around the current
    // focus. A stationary left-click is left untouched so world selection/
    // interaction still works via the shared click-suppression handshake.
    this.orbit = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      movedBy: 0,
    };

    this._bindInput();
    this.refit({ reset: true });
  }

  get mode() {
    return this._mode;
  }

  get view() {
    return { ...this._view };
  }

  get yawDeg() {
    return this._view.yawDeg;
  }

  get elevationStep() {
    return this._view.elevationStep;
  }

  get transitioning() {
    return this._transitioning;
  }

  /** Resolves when the accepted view change finishes or the controller is destroyed. */
  get transitionPromise() {
    return this._transitionPromise;
  }

  get minZoom() {
    return this._minZoom;
  }

  get maxZoom() {
    return SANCTUARY.zoom.max;
  }

  get isDragging() {
    return this.pan.active;
  }

  get clickSuppressed() {
    return this._clickSuppressed;
  }

  get dragDistance() {
    return this.pan.movedBy;
  }

  _bindInput() {
    const { input } = this.scene;
    input.mouse?.disableContextMenu();

    // Bindings live in input/keyboardActions.js.
    this.panModifierKeys = addActionKeys(input.keyboard, KeyboardAction.SanctuaryCameraPanModifier);
    this.followBinding = onActionDown(input.keyboard, KeyboardAction.SanctuaryCameraToggleFollow, () => {
      if (!this._transitioning) this.toggleFollow();
    });
    this.homeBinding = onActionDown(input.keyboard, KeyboardAction.SanctuaryCameraHome, () => {
      if (!this._transitioning) this.reset();
    });
    this.yawLeftBinding = onActionDown(input.keyboard, KeyboardAction.SanctuaryCameraYawLeft, () => {
      this.stepYaw(-1, { reason: 'keyboard' });
    });
    this.yawRightBinding = onActionDown(input.keyboard, KeyboardAction.SanctuaryCameraYawRight, () => {
      this.stepYaw(1, { reason: 'keyboard' });
    });
    this.elevationDownBinding = onActionDown(input.keyboard, KeyboardAction.SanctuaryCameraTiltDown, () => {
      this.stepElevation(-1, { reason: 'keyboard' });
    });
    this.elevationUpBinding = onActionDown(input.keyboard, KeyboardAction.SanctuaryCameraTiltUp, () => {
      this.stepElevation(1, { reason: 'keyboard' });
    });

    this._onPointerDown = (pointer) => {
      if (this._transitioning) {
        // World interaction input shares this release guard. A pointer press
        // while geometry is changing must never become an activation.
        this._clickSuppressed = true;
        return;
      }
      // A fresh gesture releases suppression left over from the preceding one.
      this._clickSuppressed = false;
      const right = pointerButtonDown(pointer, 'right', 2, 2);
      const middle = pointerButtonDown(pointer, 'middle', 4, 1);
      if (right || middle || isActionDown(this.panModifierKeys)) this._beginPan(pointer);
      else this._beginOrbit(pointer);
    };
    this._onPointerMove = (pointer) => {
      if (this.pan.active && this._matchesGesturePointer(pointer, this.pan.pointerId)) {
        this._dragPan(pointer);
      } else if (this.orbit.active
        && this._matchesGesturePointer(pointer, this.orbit.pointerId)) {
        this._dragOrbit(pointer);
      }
    };
    this._onPointerUp = (pointer) => {
      if (this.pan.active && this._matchesGesturePointer(pointer, this.pan.pointerId)) {
        this._measurePan(pointer);
        this._clickSuppressed ||= this.pan.movedBy > SANCTUARY.dragClickSlop;
        this.pan.active = false;
        this.pan.pointerId = null;
      } else if (this.orbit.active
        && this._matchesGesturePointer(pointer, this.orbit.pointerId)) {
        this._measureOrbit(pointer);
        this._clickSuppressed ||= this.orbit.movedBy > SANCTUARY.dragClickSlop;
        this.orbit.active = false;
        this.orbit.pointerId = null;
      }
    };
    this._onGameOut = () => {
      this.pan.active = false;
      this.pan.pointerId = null;
      this.orbit.active = false;
      this.orbit.pointerId = null;
    };
    this._onWheel = (pointer, objects, deltaX, deltaY) => {
      if (this._transitioning) return;
      // Touchpad: a horizontal two-finger swipe rotates (yaw), a vertical swipe
      // zooms. Dominant axis wins so a diagonal glide never does both. A mouse
      // wheel only reports deltaY, so it always zooms — consistent with drag.
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.orbitBy(deltaX * WHEEL_YAW_SENS, 0);
        return;
      }
      if (deltaY === 0) return;
      const factor = deltaY < 0 ? SANCTUARY.zoom.step : 1 / SANCTUARY.zoom.step;
      this.zoomAt(pointer, factor);
    };

    input.on('pointerdown', this._onPointerDown);
    input.on('pointermove', this._onPointerMove);
    input.on('pointerup', this._onPointerUp);
    input.on('pointerupoutside', this._onPointerUp);
    input.on('gameout', this._onGameOut);
    input.on('wheel', this._onWheel);

    this._onSceneShutdown = () => this.destroy();
    this.scene.events?.once('shutdown', this._onSceneShutdown);
    this.scene.events?.once('destroy', this._onSceneShutdown);
  }

  _matchesGesturePointer(pointer, gesturePointerId) {
    return gesturePointerId === null
      || pointer?.id === undefined
      || pointer.id === gesturePointerId;
  }

  _beginPan(pointer) {
    if (this._transitioning) return false;
    // Manual pan takes ownership from follow/overview before the gesture state
    // is marked active; setMode() intentionally cancels any previous pan.
    this.setMode(SANCTUARY_CAMERA_MODES.SURVEY);
    this.pan.active = true;
    this.pan.pointerId = pointer?.id ?? null;
    this.pan.startX = pointer.x;
    this.pan.startY = pointer.y;
    this.pan.lastX = pointer.x;
    this.pan.lastY = pointer.y;
    this.pan.movedBy = 0;
    return true;
  }

  _measurePan(pointer) {
    const distance = Math.hypot(
      pointer.x - this.pan.startX,
      pointer.y - this.pan.startY,
    );
    this.pan.movedBy = Math.max(this.pan.movedBy, distance);
  }

  _dragPan(pointer) {
    const dx = pointer.x - this.pan.lastX;
    const dy = pointer.y - this.pan.lastY;
    this.camera.scrollX -= dx / this.camera.zoom;
    this.camera.scrollY -= dy / this.camera.zoom;
    this.pan.lastX = pointer.x;
    this.pan.lastY = pointer.y;
    this._measurePan(pointer);
    this._clickSuppressed ||= this.pan.movedBy > SANCTUARY.dragClickSlop;
    this._clampCamera();
  }

  _beginOrbit(pointer) {
    if (this._transitioning) return false;
    this.orbit.active = true;
    this.orbit.pointerId = pointer?.id ?? null;
    this.orbit.startX = pointer.x;
    this.orbit.startY = pointer.y;
    this.orbit.lastX = pointer.x;
    this.orbit.lastY = pointer.y;
    this.orbit.movedBy = 0;
    return true;
  }

  _measureOrbit(pointer) {
    const distance = Math.hypot(
      pointer.x - this.orbit.startX,
      pointer.y - this.orbit.startY,
    );
    this.orbit.movedBy = Math.max(this.orbit.movedBy, distance);
  }

  _dragOrbit(pointer) {
    const dx = pointer.x - this.orbit.lastX;
    const dy = pointer.y - this.orbit.lastY;
    this.orbit.lastX = pointer.x;
    this.orbit.lastY = pointer.y;
    this._measureOrbit(pointer);
    this._clickSuppressed ||= this.orbit.movedBy > SANCTUARY.dragClickSlop;
    // Drag right → yaw increases; drag up → tilt up (higher elevation step).
    this.orbitBy(dx * ORBIT_YAW_SENS, -dy * ORBIT_TILT_SENS);
  }

  /**
   * Continuously nudge yaw (deg) and tilt (elevation steps), clamped to the
   * rig's supported range. This is the lightweight path used by drag orbit: it
   * updates the view and notifies `onOrbit` without the fade/reproject the
   * discrete `setView` transition performs.
   */
  orbitBy(deltaYawDeg, deltaElevationStep) {
    if (this._destroyed || this._transitioning) return false;
    const rig = cameraRigTuning();
    // Yaw is unclamped so drag/step can orbit a full turn to view the front;
    // tilt stays bounded to the rig's supported pitch range.
    const yawDeg = this._view.yawDeg + finite(deltaYawDeg, 0);
    const elevationStep = clamp(
      this._view.elevationStep + finite(deltaElevationStep, 0),
      rig.elevation.minStep,
      rig.elevation.maxStep,
    );
    if (yawDeg === this._view.yawDeg && elevationStep === this._view.elevationStep) {
      return false;
    }
    const previous = this._view;
    this._view = Object.freeze({ yawDeg, elevationStep });
    this.onOrbit?.(this.view, { ...previous });
    return true;
  }

  /** Return and clear whether the current/most recent gesture became a drag. */
  consumeClickSuppression() {
    if (this._transitioning) {
      this._clickSuppressed = true;
      return true;
    }
    const suppressed = this._clickSuppressed;
    this._clickSuppressed = false;
    return suppressed;
  }

  /**
   * Apply one clamped, stepped rig endpoint. `onViewChange` may update the
   * projected world synchronously, return a Promise, or accept the third
   * completion argument and invoke it when its tween/fade is finished.
   */
  setView(view, {
    immediate = false,
    reason = 'api',
  } = {}) {
    if (this._destroyed) return false;
    const next = normalizeSanctuaryCameraView({ ...this._view, ...view });
    if (viewsEqual(next, this._view) || this._transitioning) return false;

    const previous = this._view;
    this._view = next;
    this.pan.active = false;
    this.pan.pointerId = null;
    this._clickSuppressed = true;
    this._transitioning = true;
    const token = ++this._transitionToken;
    let resolveTransition;
    let finished = false;
    this._transitionError = null;
    this._transitionPromise = new Promise((resolve) => {
      resolveTransition = resolve;
    });

    const finish = (accepted = true) => {
      if (finished) return;
      finished = true;
      resolveTransition(Boolean(accepted));
      if (token !== this._transitionToken) return;
      this._transitioning = false;
      this._finishViewTransition = null;
    };
    const fail = (error) => {
      if (finished) return;
      finished = true;
      this._transitionError = error;
      resolveTransition(false);
      if (token !== this._transitionToken) return;
      this._view = previous;
      this._transitioning = false;
      this._finishViewTransition = null;
    };
    // A function is compatible with callback-style consumers, while these
    // properties give transition orchestrators useful context without adding
    // another required parameter shape.
    finish.complete = finish;
    finish.durationMs = cameraRigTuning().transitionMs;
    finish.immediate = Boolean(immediate);
    finish.reason = reason;
    this._finishViewTransition = finish;

    if (!this.onViewChange) {
      finish();
      return true;
    }

    let result;
    try {
      result = this.onViewChange(this.view, { ...previous }, finish);
    } catch (error) {
      this._view = previous;
      fail(error);
      throw error;
    }

    if (isPromiseLike(result)) {
      Promise.resolve(result).then(() => finish(), fail);
    } else if (result === false) {
      this._view = previous;
      finish(false);
    } else if (immediate || this.onViewChange.length < 3) {
      finish();
    }
    return true;
  }

  setYawDeg(yawDeg, options) {
    return this.setView({ yawDeg }, options);
  }

  setElevationStep(elevationStep, options) {
    return this.setView({ elevationStep }, options);
  }

  stepYaw(direction, options) {
    if (!Number.isFinite(direction) || direction === 0) return false;
    const step = cameraRigTuning().yaw.step * Math.sign(direction);
    return this.setYawDeg(this.yawDeg + step, options);
  }

  stepElevation(direction, options) {
    if (!Number.isFinite(direction) || direction === 0) return false;
    const step = cameraRigTuning().elevation.step * Math.sign(direction);
    return this.setElevationStep(this.elevationStep + step, options);
  }

  /**
   * Recompute fitted zoom and bounded survey space. By default this re-seats
   * the fitted overview; pass `reset: false` to preserve a follow/survey view
   * across an in-place world rebuild while still clamping it to new bounds.
   */
  refit({
    bounds = this.bounds,
    panelCollapsed = this.panelCollapsed,
    reset = true,
  } = {}) {
    this.bounds = copyBounds(bounds);
    this.panelCollapsed = Boolean(panelCollapsed);

    const mapWidth = this.bounds.maxX - this.bounds.minX;
    const mapHeight = this.bounds.maxY - this.bounds.minY;
    const viewportWidth = this.camera.width || GAME.width;
    const viewportHeight = this.camera.height || GAME.height;
    const panelBias = this._panelBias();
    const availableWidth = Math.max(1, viewportWidth - SANCTUARY.cameraMargin * 2 - panelBias);
    const availableHeight = Math.max(1, viewportHeight - SANCTUARY.cameraMargin * 2);

    // Sanctuary's previous fitted diorama never enlarged above 1x. Retaining
    // that cap keeps the opening overview visually unchanged while zoom.max
    // remains available for follow/inspect distances.
    this._minZoom = Math.max(0.01, Math.min(
      1,
      SANCTUARY.zoom.max,
      availableWidth / mapWidth,
      availableHeight / mapHeight,
    ));

    this._applyCameraBounds();
    if (reset || this._mode === SANCTUARY_CAMERA_MODES.OVERVIEW) {
      this._resetFraming();
    } else {
      this.camera.setZoom(clamp(this.camera.zoom, this._minZoom, SANCTUARY.zoom.max));
      this._clampCamera();
    }
    return this._minZoom;
  }

  setBounds(bounds, { reset = this._mode === SANCTUARY_CAMERA_MODES.OVERVIEW } = {}) {
    return this.refit({ bounds, reset });
  }

  setPanelCollapsed(collapsed) {
    return this.refit({ panelCollapsed: collapsed, reset: true });
  }

  _panelBias() {
    return this.panelCollapsed ? 0 : SANCTUARY.panelBias;
  }

  _applyCameraBounds() {
    const viewportWidth = (this.camera.width || GAME.width) / this._minZoom;
    const viewportHeight = (this.camera.height || GAME.height) / this._minZoom;
    const mapWidth = this.bounds.maxX - this.bounds.minX;
    const mapHeight = this.bounds.maxY - this.bounds.minY;
    const biasWorld = this._panelBias() / this._minZoom;

    // Padding must contain both the configured pan slack and the fitted view.
    // The extra horizontal bias keeps Phaser from force-centering a view that
    // is deliberately shifted away from an expanded panel.
    const padX = Math.max(
      SANCTUARY.panMargin + biasWorld,
      Math.max(0, (viewportWidth - mapWidth) / 2) + biasWorld / 2,
    );
    const padY = Math.max(
      SANCTUARY.panMargin,
      Math.max(0, (viewportHeight - mapHeight) / 2),
    );

    this._cameraBounds = {
      x: this.bounds.minX - padX,
      y: this.bounds.minY - padY,
      width: mapWidth + padX * 2,
      height: mapHeight + padY * 2,
    };
    this.camera.setBounds(
      this._cameraBounds.x,
      this._cameraBounds.y,
      this._cameraBounds.width,
      this._cameraBounds.height,
    );
  }

  _resetFraming() {
    this.pan.active = false;
    this.pan.pointerId = null;
    this.camera.setZoom(this._minZoom);
    const biasWorld = this._panelBias() / this._minZoom;
    this.camera.centerOn(
      (this.bounds.minX + this.bounds.maxX) / 2 - biasWorld / 2,
      (this.bounds.minY + this.bounds.maxY) / 2,
    );
    this._clampCamera();
    this._changeMode(SANCTUARY_CAMERA_MODES.OVERVIEW);
  }

  /** Home/reset restores both view axes as well as overview zoom/framing. */
  reset(options = {}) {
    if (this._transitioning) return false;
    const defaultView = normalizeSanctuaryCameraView();
    const changed = this.setView(defaultView, {
      reason: 'reset',
      ...options,
    });
    this._resetFraming();
    return changed;
  }

  zoomAt(pointer, factor) {
    if (this._transitioning
      || !Number.isFinite(pointer?.x) || !Number.isFinite(pointer?.y)
      || !Number.isFinite(factor) || factor <= 0) return false;

    const oldZoom = this.camera.zoom;
    const nextZoom = clamp(
      oldZoom * factor,
      this._minZoom,
      SANCTUARY.zoom.max,
    );
    if (nextZoom === oldZoom) return false;

    // Phaser rebuilds the camera transform matrix during preRender, so calling
    // getWorldPoint() immediately after setZoom() reads a stale matrix. Derive
    // the scroll delta instead: a screen offset from the camera's zoom origin
    // represents offset / zoom world units. Rotate it back into world axes so
    // this stays correct if the camera is ever given a non-zero rotation.
    const originX = (this.camera.width || GAME.width) * (this.camera.originX ?? 0.5);
    const originY = (this.camera.height || GAME.height) * (this.camera.originY ?? 0.5);
    const screenX = pointer.x - (this.camera.x ?? 0) - originX;
    const screenY = pointer.y - (this.camera.y ?? 0) - originY;
    const rotation = this.camera.rotation ?? 0;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const worldOffsetX = screenX * cosine + screenY * sine;
    const worldOffsetY = -screenX * sine + screenY * cosine;
    const inverseZoomDelta = 1 / oldZoom - 1 / nextZoom;

    this.camera.setZoom(nextZoom);
    this.camera.scrollX += worldOffsetX * inverseZoomDelta;
    this.camera.scrollY += worldOffsetY * inverseZoomDelta;
    this._clampCamera();
    if (this._mode === SANCTUARY_CAMERA_MODES.OVERVIEW) {
      this._changeMode(SANCTUARY_CAMERA_MODES.SURVEY);
    }
    return true;
  }

  setFollowTarget(target, { follow = false, snap = false } = {}) {
    this.followTarget = target;
    const valid = Boolean(resolveFollowPoint(this.followTarget));
    if (follow && valid) this.setMode(SANCTUARY_CAMERA_MODES.FOLLOW, { snap });
    else if (snap && valid) this.snapToFollow();
    else if (!valid && this._mode === SANCTUARY_CAMERA_MODES.FOLLOW) this._resetFraming();
    return valid;
  }

  setMode(mode, { snap = false } = {}) {
    if (!Object.values(SANCTUARY_CAMERA_MODES).includes(mode)) {
      throw new TypeError(`Unknown sanctuary camera mode: ${mode}`);
    }
    if (mode === SANCTUARY_CAMERA_MODES.OVERVIEW) {
      this._resetFraming();
      return true;
    }
    if (mode === SANCTUARY_CAMERA_MODES.FOLLOW && !resolveFollowPoint(this.followTarget)) {
      return false;
    }

    this.pan.active = false;
    this.pan.pointerId = null;
    this._changeMode(mode);
    if (snap && mode === SANCTUARY_CAMERA_MODES.FOLLOW) this.snapToFollow();
    return true;
  }

  toggleFollow() {
    return this.setMode(
      this._mode === SANCTUARY_CAMERA_MODES.FOLLOW
        ? SANCTUARY_CAMERA_MODES.SURVEY
        : SANCTUARY_CAMERA_MODES.FOLLOW,
    );
  }

  _changeMode(mode) {
    if (this._mode === mode) return;
    const previous = this._mode;
    this._mode = mode;
    this.onModeChange?.(mode, previous);
  }

  _followCenter() {
    const point = resolveFollowPoint(this.followTarget);
    if (!point) return null;
    return {
      x: point.x - this._panelBias() / this.camera.zoom / 2,
      y: point.y,
    };
  }

  snapToFollow() {
    const center = this._followCenter();
    if (!center) return false;
    this.camera.centerOn(center.x, center.y);
    this._clampCamera();
    return true;
  }

  /** Advance follow. Supports `update(delta)` and Phaser-style `(time, delta)`. */
  update(deltaOrTime = FRAME_MS, maybeDelta) {
    if (this._destroyed || this._transitioning
      || this._mode !== SANCTUARY_CAMERA_MODES.FOLLOW) return;
    const center = this._followCenter();
    if (!center) {
      this._resetFraming();
      return;
    }

    const suppliedDelta = maybeDelta ?? deltaOrTime;
    const deltaMs = Number.isFinite(suppliedDelta) && suppliedDelta > 0
      ? suppliedDelta
      : FRAME_MS;
    const baseLerp = clamp(SANCTUARY.followLerp, 0, 1);
    const lerp = 1 - ((1 - baseLerp) ** (deltaMs / FRAME_MS));
    // Phaser scroll is the camera midpoint minus the UNZOOMED viewport half,
    // not the top-left of worldView (which does account for zoom).
    const desiredX = center.x - (this.camera.width || GAME.width) / 2;
    const desiredY = center.y - (this.camera.height || GAME.height) / 2;

    this.camera.scrollX += (desiredX - this.camera.scrollX) * lerp;
    this.camera.scrollY += (desiredY - this.camera.scrollY) * lerp;
    this._clampCamera();
  }

  _clampCamera() {
    if (!this._cameraBounds) return;
    // BaseCamera's clamp methods account for its unusual scroll convention,
    // current display size, zoom, and bounds smaller than the viewport.
    const scrollX = typeof this.camera.clampX === 'function'
      ? this.camera.clampX(this.camera.scrollX)
      : this.camera.scrollX;
    const scrollY = typeof this.camera.clampY === 'function'
      ? this.camera.clampY(this.camera.scrollY)
      : this.camera.scrollY;

    if (typeof this.camera.setScroll === 'function') this.camera.setScroll(scrollX, scrollY);
    else {
      this.camera.scrollX = scrollX;
      this.camera.scrollY = scrollY;
    }
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    const { input } = this.scene;
    input.off('pointerdown', this._onPointerDown);
    input.off('pointermove', this._onPointerMove);
    input.off('pointerup', this._onPointerUp);
    input.off('pointerupoutside', this._onPointerUp);
    input.off('gameout', this._onGameOut);
    input.off('wheel', this._onWheel);
    this.followBinding.dispose();
    this.homeBinding.dispose();
    this.yawLeftBinding.dispose();
    this.yawRightBinding.dispose();
    this.elevationDownBinding.dispose();
    this.elevationUpBinding.dispose();
    this.scene.events?.off('shutdown', this._onSceneShutdown);
    this.scene.events?.off('destroy', this._onSceneShutdown);
    this.pan.active = false;
    this.orbit.active = false;
    this.followTarget = null;
    this._finishViewTransition?.(false);
    this._finishViewTransition = null;
    this._transitioning = false;
  }
}

export function createSanctuaryCamera(scene, options) {
  return new SanctuaryCameraController(scene, options);
}
