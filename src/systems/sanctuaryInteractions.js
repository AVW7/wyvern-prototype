// Sanctuary interaction registry + input/presentation controller. This stays
// deliberately ignorant of scene transitions and roster mutations: authored
// targets name an action, while BaseScene supplies the callback for that
// action. All distance and pointer hit tests use ground footprints, never a
// visually lifted sprite position.
import { SANCTUARY } from '../config.js';
import {
  normalizeView,
  projectFootprint,
  unprojectGround,
  unprojectVector,
} from './sanctuaryProjection.js';
import { applyGroundPlaneTransform } from './sanctuaryGroundPlane.js';
import { findPath, nearestWalkable } from './sanctuaryMovement.js';

const DEFAULT_VIEW = Object.freeze({ yawDeg: 0, elevationStep: 0 });

const DEFAULT_TUNING = Object.freeze({
  defaultRange: 58,
  cooldownMs: 450,
  markerScale: 1,
  promptOffset: 34,
  labelMinScale: 0.7,
  labelMaxScale: 1.6,
  hoverRadius: 28,
  clickSlop: 6,
});

const MARKER = Object.freeze({
  width: 44,
  height: 16,
  nearbyColor: 0x8fd8ff,
  hoverColor: 0xffd782,
  hoverTint: 0xffe6ad,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finitePoint(value) {
  if (!value) return null;
  const x = value.x ?? value.worldX ?? value.groundX;
  const y = value.y ?? value.worldY ?? value.groundY;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function finiteLogicalPoint(value) {
  if (!value) return null;
  const source = value.logicalFootprint ?? value;
  const col = source.col ?? source.gridCol;
  const row = source.row ?? source.gridRow;
  return Number.isFinite(col) && Number.isFinite(row) ? { col, row } : null;
}

function logicalFromDefaultPoint(point) {
  const projected = finitePoint(point);
  if (!projected) return null;
  const corner = unprojectGround(projected.x, projected.y, DEFAULT_VIEW);
  return { col: corner.col - 0.5, row: corner.row - 0.5 };
}

function logicalFromValue(value) {
  return finiteLogicalPoint(value) ?? logicalFromDefaultPoint(value);
}

function defaultPointFromLogical(logical) {
  return logical ? projectFootprint(logical.col, logical.row, DEFAULT_VIEW) : null;
}

function logicalWithDefaultOffset(col, row, offsetX = 0, offsetY = 0) {
  const logical = { col, row };
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)
    || (offsetX === 0 && offsetY === 0)) return logical;
  const offset = unprojectVector(offsetX, offsetY, DEFAULT_VIEW);
  return { col: col + offset.col, row: row + offset.row };
}

function invokeFootprint(value, owner) {
  return typeof value === 'function' ? value.call(owner, owner) : value;
}

/**
 * Resolves a target's ground-plane world point. Moving targets should expose
 * `getFootprint()` or a function-valued `footprint`; authored targets may use
 * `{ col, row }`, which resolves to the centre of that cell's ground diamond.
 */
export function targetGroundFootprint(target) {
  if (!target) return null;

  const direct = finitePoint(invokeFootprint(target.footprint, target));
  if (direct) return direct;

  if (typeof target.getFootprint === 'function') {
    const point = finitePoint(target.getFootprint());
    if (point) return point;
  }

  const spriteFootprint = target.sprite?.getData
    ? finitePoint(target.sprite.getData('footprint'))
    : null;
  if (spriteFootprint) return spriteFootprint;

  if (Number.isFinite(target.col) && Number.isFinite(target.row)) {
    return defaultPointFromLogical(logicalWithDefaultOffset(
      target.col,
      target.row,
      target.footprintOffsetX ?? 0,
      target.footprintOffsetY ?? 0,
    ));
  }

  // Explicit x/y on a descriptor is still a footprint. A sprite's rendered
  // x/y is intentionally not a fallback because airborne residents and tall
  // props do not render at their interaction point.
  return finitePoint(target) ?? defaultPointFromLogical(targetLogicalFootprint(target));
}

/** Resolve a target to stable continuous grid coordinates. */
export function targetLogicalFootprint(target) {
  if (!target) return null;

  const declared = logicalFromValue(invokeFootprint(target.logicalFootprint, target));
  if (declared) return declared;

  if (typeof target.getLogicalFootprint === 'function') {
    const point = logicalFromValue(target.getLogicalFootprint());
    if (point) return point;
  }

  const direct = logicalFromValue(invokeFootprint(target.footprint, target));
  if (direct) return direct;

  if (typeof target.getFootprint === 'function') {
    const point = logicalFromValue(target.getFootprint());
    if (point) return point;
  }

  const spriteFootprint = target.sprite?.getData
    ? logicalFromValue(target.sprite.getData('footprint'))
    : null;
  if (spriteFootprint) return spriteFootprint;

  if (Number.isFinite(target.col) && Number.isFinite(target.row)) {
    return logicalWithDefaultOffset(
      target.col,
      target.row,
      target.footprintOffsetX ?? 0,
      target.footprintOffsetY ?? 0,
    );
  }

  return logicalFromValue(target);
}

/** Resolves the controlled actor's dynamic ground footprint. */
export function actorGroundFootprint(actor) {
  if (!actor) return null;
  if (typeof actor === 'function') {
    const value = actor();
    return finitePoint(value) ?? defaultPointFromLogical(logicalFromValue(value));
  }
  if (typeof actor.getFootprint === 'function') {
    const value = actor.getFootprint();
    return finitePoint(value) ?? defaultPointFromLogical(logicalFromValue(value));
  }
  const footprint = invokeFootprint(actor.footprint, actor);
  return finitePoint(footprint)
    ?? finitePoint(actor)
    ?? defaultPointFromLogical(logicalFromValue(footprint) ?? logicalFromValue(actor));
}

/** Resolve the controlled actor to stable continuous grid coordinates. */
export function actorLogicalFootprint(actor) {
  if (!actor) return null;
  if (typeof actor === 'function') return logicalFromValue(actor());
  if (typeof actor.getLogicalFootprint === 'function') {
    const logical = logicalFromValue(actor.getLogicalFootprint());
    if (logical) return logical;
  }
  const declared = logicalFromValue(invokeFootprint(actor.logicalFootprint, actor))
    ?? logicalFromValue(actor.logical);
  if (declared) return declared;
  if (typeof actor.getFootprint === 'function') return logicalFromValue(actor.getFootprint());
  return logicalFromValue(invokeFootprint(actor.footprint, actor)) ?? logicalFromValue(actor);
}

// Affordances belong just above the floor that owns their continuous
// footprint. Raw footprint.y can sit in the upper half of that diamond, where
// it would sort before (and be hidden by) the opaque tile top.
export function interactionGroundDepth(footprint, view = DEFAULT_VIEW) {
  const logical = logicalFromValue(footprint);
  if (!logical) return 0;
  const normalizedView = normalizeView(view);
  const point = projectFootprint(logical.col, logical.row, normalizedView);
  const floor = projectFootprint(
    Math.round(logical.col),
    Math.round(logical.row),
    normalizedView,
  );
  return Math.max(point.y, floor.y);
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function primaryPointerDown(pointer) {
  if (!pointer) return false;
  if (typeof pointer.leftButtonDown === 'function' && pointer.leftButtonDown()) return true;
  // Phaser reports button 0 for both a left mouse press and a primary touch.
  return pointer.button === 0 || (pointer.isDown && !pointer.mousePointer);
}

function pointerId(pointer) {
  return pointer?.id ?? pointer?.pointerId ?? 0;
}

function displayObjectAlive(object) {
  return object && object.scene && object.active !== false;
}

/**
 * Creates the interaction controller used by BaseScene.
 *
 * Target rows use:
 * `{ id, type, label, action, range?, cooldownMs?, once?, available?,
 *    col?, row?, footprint?, getFootprint?, sprite?, animal? }`.
 *
 * `callbacks[action]` receives `(target, { source, actor, controller })` and
 * may return `false` to reject the activation without consuming cooldown or
 * one-shot state.
 */
export function createSanctuaryInteractions({
  scene,
  layer,
  targets = [],
  actor = null,
  callbacks = {},
  camera = null,
  view = null,
  getView = null,
  tuning = {},
} = {}) {
  if (!scene?.add || !scene?.input) {
    throw new TypeError('createSanctuaryInteractions requires a Phaser scene.');
  }

  return new SanctuaryInteractionController({
    scene, layer, targets, actor, callbacks, camera, view, getView, tuning,
  });
}

class SanctuaryInteractionController {
  constructor({
    scene, layer, targets, actor, callbacks, camera, view, getView, tuning,
  }) {
    this.scene = scene;
    this.layer = layer;
    this.actor = actor;
    this.callbacks = callbacks;
    // `camera` is normally systems/sanctuaryCamera's controller. It owns
    // click suppression and exposes its Phaser camera as `.camera`.
    this.cameraController = camera;
    this.viewCamera = camera?.camera ?? (
      typeof camera?.getWorldPoint === 'function' ? camera : scene.cameras?.main
    );
    this.viewProvider = typeof getView === 'function'
      ? getView
      : (typeof view === 'function' ? view : null);
    this.followCameraView = !this.viewProvider && view == null;
    this._view = normalizeView(
      (view && typeof view === 'object' ? view : null)
      ?? camera?.view
      ?? DEFAULT_VIEW,
    );
    this.tuning = {
      ...DEFAULT_TUNING,
      ...(SANCTUARY.interaction ?? {}),
      ...tuning,
    };

    this.targets = [];
    this.targetsById = new Map();
    this.completed = new Set();
    this.readyAt = new Map();
    this.globalReadyAt = 0;
    this.hovered = null;
    this.nearest = null;
    this.pointerPress = null;
    this.tintedSprite = null;
    this.previousTint = null;
    this.lastUpdateTime = 0;
    this.destroyed = false;
    this.enabledInteractives = new Set();

    this.createAffordances();
    this.bindInput();
    this.setTargets(targets);

    this.onShutdown = () => this.destroy();
    scene.events?.once('shutdown', this.onShutdown);
  }

  activeView() {
    if (this.viewProvider) return normalizeView(this.viewProvider() ?? this._view);
    if (this.followCameraView && this.cameraController?.view) {
      return normalizeView(this.cameraController.view);
    }
    return normalizeView(this._view);
  }

  get view() {
    return { ...this.activeView() };
  }

  getView() {
    return this.view;
  }

  setView(view) {
    this._view = normalizeView(view);
    this.viewProvider = null;
    this.followCameraView = false;
    if (!this.destroyed) this.update();
    return this.view;
  }

  inputTransitionBlocked(source = null) {
    if (!this.cameraController?.transitioning) return false;
    return source == null || source === 'key' || source === 'pointer';
  }

  projectLogicalFootprint(logical, view = this.activeView()) {
    return logical ? projectFootprint(logical.col, logical.row, view) : null;
  }

  hideAffordances() {
    this.nearbyMarker?.setVisible(false);
    this.hoverMarker?.setVisible(false);
    this.prompt?.setVisible(false);
    this.applyHoverTint(null);
    this.scene.input.setDefaultCursor?.('default');
  }

  createAffordances() {
    this.nearbyMarker = this.scene.add.ellipse(
      0, 0, MARKER.width, MARKER.height, MARKER.nearbyColor, 0.08,
    );
    this.nearbyMarker.setStrokeStyle(2, MARKER.nearbyColor, 0.85);
    this.nearbyMarker.setVisible(false);
    this.nearbyMarker.setData('depth', 0);

    this.hoverMarker = this.scene.add.ellipse(
      0, 0, MARKER.width, MARKER.height, MARKER.hoverColor, 0.13,
    );
    this.hoverMarker.setStrokeStyle(2, MARKER.hoverColor, 1);
    this.hoverMarker.setVisible(false);
    this.hoverMarker.setData('depth', 0);

    this.prompt = this.scene.add.text(0, 0, '', {
      font: '12px monospace',
      color: '#f7fbff',
      backgroundColor: 'rgba(7, 13, 22, 0.82)',
      padding: { x: 7, y: 4 },
      align: 'center',
    });
    this.prompt.setOrigin(0.5, 1);
    this.prompt.setVisible(false);
    this.prompt.setData('depth', 10000);

    if (this.layer?.add) {
      this.layer.add([this.nearbyMarker, this.hoverMarker, this.prompt]);
    }
  }

  bindInput() {
    this.onPointerDown = (pointer) => this.handlePointerDown(pointer);
    this.onPointerMove = (pointer) => this.handlePointerMove(pointer);
    this.onPointerUp = (pointer) => this.handlePointerUp(pointer);
    this.onPointerCancel = () => this.cancelPointerPress();
    this.scene.input.on('pointerdown', this.onPointerDown);
    this.scene.input.on('pointermove', this.onPointerMove);
    this.scene.input.on('pointerup', this.onPointerUp);
    this.scene.input.on('pointerupoutside', this.onPointerCancel);
    this.scene.input.on('gameout', this.onPointerCancel);

    this.interactKey = this.scene.input.keyboard?.addKey('E') ?? null;
    this.onInteractKey = (key, event) => {
      if (event?.repeat || key?.repeat || this.inputTransitionBlocked('key')) return;
      this.activateNearest('key');
    };
    this.interactKey?.on?.('down', this.onInteractKey);
  }

  refreshActor(actor) {
    this.actor = actor;
    this.update();
    return this;
  }

  setTargets(targets = []) {
    this.clearHoverTint();
    this.disableOwnedInteractives();
    const rows = Array.isArray(targets)
      ? targets
      : [...(targets?.authored ?? []), ...(targets?.residents ?? [])];
    const seen = new Set();

    this.targets = rows.map((source) => {
      if (!source?.id) throw new TypeError('Sanctuary interaction targets require a stable id.');
      if (seen.has(source.id)) {
        throw new Error(`Duplicate sanctuary interaction id "${source.id}".`);
      }
      seen.add(source.id);

      const target = {
        ...source,
        action: source.action ?? source.type,
        label: source.label ?? source.name ?? source.type ?? source.id,
        source,
      };
      this.enableTargetInteractive(target);
      return target;
    });
    this.targetsById = new Map(this.targets.map((target) => [target.id, target]));

    if (!this.targetsById.has(this.hovered?.target.id)) this.hovered = null;
    if (!this.targetsById.has(this.nearest?.target.id)) this.nearest = null;
    this.update();
    return this;
  }

  enableTargetInteractive(target) {
    const { sprite } = target;
    if (!sprite?.setInteractive || sprite.input?.enabled) return;
    // Object interactivity is used only for reversible tint support. Cursor
    // feedback is driven from the same ground-footprint hover test as clicks,
    // avoiding a misleading hand cursor over tall art outside its hit radius.
    sprite.setInteractive();
    this.enabledInteractives.add(sprite);
  }

  disableOwnedInteractives() {
    this.enabledInteractives.forEach((sprite) => {
      if (displayObjectAlive(sprite)) sprite.disableInteractive?.();
    });
    this.enabledInteractives.clear();
  }

  targetAvailable(target) {
    if (!target || (target.once && this.completed.has(target.id))) return false;
    const sourceValue = target.source?.available;
    const available = sourceValue ?? target.available ?? true;
    if (typeof available === 'function') {
      return available({
        target: target.source,
        actor: this.actor,
        controller: this,
      }) !== false;
    }
    return available !== false;
  }

  resolveTarget(targetOrId) {
    if (typeof targetOrId === 'string') return this.targetsById.get(targetOrId) ?? null;
    if (!targetOrId) return null;
    return this.targetsById.get(targetOrId.id) ?? null;
  }

  targetResolution(target) {
    const actorLogical = actorLogicalFootprint(this.actor);
    const logicalFootprint = targetLogicalFootprint(target);
    if (!actorLogical || !logicalFootprint) return null;
    const actorPoint = defaultPointFromLogical(actorLogical);
    const targetPoint = defaultPointFromLogical(logicalFootprint);
    const footprint = this.projectLogicalFootprint(logicalFootprint);
    const range = Number.isFinite(target.range) ? target.range : this.tuning.defaultRange;
    const distance = distanceBetween(actorPoint, targetPoint);
    return {
      target,
      footprint,
      logicalFootprint,
      distance,
      range,
      inRange: distance <= range,
    };
  }

  resolveNearest() {
    let nearest = null;
    this.targets.forEach((target) => {
      if (!this.targetAvailable(target)) return;
      const resolution = this.targetResolution(target);
      if (!resolution?.inRange) return;
      if (!nearest || resolution.distance < nearest.distance) nearest = resolution;
    });
    return nearest;
  }

  pointerLogicalPoint(pointer) {
    if (!pointer || !this.viewCamera?.getWorldPoint) return null;
    const projected = finitePoint(this.viewCamera.getWorldPoint(pointer.x, pointer.y));
    if (!projected) return null;
    const corner = unprojectGround(projected.x, projected.y, this.activeView());
    return { col: corner.col - 0.5, row: corner.row - 0.5 };
  }

  // Backward-compatible public shape: the returned x/y belong to the stable
  // default-view metric, even when the pointer came from a rotated view.
  pointerWorldPoint(pointer) {
    return defaultPointFromLogical(this.pointerLogicalPoint(pointer));
  }

  resolveHover(pointer) {
    if (this.inputTransitionBlocked('pointer')) return null;
    const pointerLogical = this.pointerLogicalPoint(pointer);
    const world = defaultPointFromLogical(pointerLogical);
    if (!pointerLogical || !world) return null;
    let hovered = null;

    this.targets.forEach((target) => {
      if (!this.targetAvailable(target)) return;
      const logicalFootprint = targetLogicalFootprint(target);
      if (!logicalFootprint) return;
      const targetPoint = defaultPointFromLogical(logicalFootprint);
      const footprint = this.projectLogicalFootprint(logicalFootprint);
      const distance = distanceBetween(world, targetPoint);
      const hitRadius = Number.isFinite(target.hitRadius)
        ? target.hitRadius
        : this.tuning.hoverRadius;
      if (distance > hitRadius || (hovered && distance >= hovered.pointerDistance)) return;
      const actorResolution = this.targetResolution(target);
      hovered = {
        target,
        footprint,
        logicalFootprint,
        pointerDistance: distance,
        distance: actorResolution?.distance ?? Infinity,
        range: actorResolution?.range ?? (
          Number.isFinite(target.range) ? target.range : this.tuning.defaultRange
        ),
        inRange: actorResolution?.inRange ?? false,
      };
    });
    return hovered;
  }

  handlePointerDown(pointer) {
    if (this.destroyed) return;
    if (this.inputTransitionBlocked('pointer')) {
      this.pointerPress = null;
      this.hovered = null;
      this.hideAffordances();
      return;
    }
    if (!primaryPointerDown(pointer)) return;
    const hover = this.resolveHover(pointer);
    this.pointerPress = {
      pointerId: pointerId(pointer),
      x: pointer.x,
      y: pointer.y,
      targetId: hover?.target.id ?? null,
      movedBy: 0,
    };
    this.hovered = hover;
    this.renderAffordances();
  }

  handlePointerMove(pointer) {
    if (this.destroyed) return;
    if (this.inputTransitionBlocked('pointer')) {
      this.pointerPress = null;
      this.hovered = null;
      this.hideAffordances();
      return;
    }
    if (this.pointerPress && this.pointerPress.pointerId === pointerId(pointer)) {
      const dx = pointer.x - this.pointerPress.x;
      const dy = pointer.y - this.pointerPress.y;
      this.pointerPress.movedBy = Math.hypot(dx, dy);
    }
    this.hovered = this.resolveHover(pointer);
    this.renderAffordances();
  }

  consumeCameraClickSuppression() {
    const consume = this.cameraController?.consumeClickSuppression;
    return typeof consume === 'function' ? Boolean(consume.call(this.cameraController)) : false;
  }

  cancelPointerPress() {
    this.pointerPress = null;
    this.hovered = null;
    // A camera drag may end outside the canvas; consume its one-release guard
    // here so it cannot suppress an unrelated click after the pointer returns.
    this.consumeCameraClickSuppression();
    this.renderAffordances();
  }

  handlePointerUp(pointer) {
    if (this.inputTransitionBlocked('pointer')) {
      this.pointerPress = null;
      this.hovered = null;
      this.consumeCameraClickSuppression();
      this.hideAffordances();
      return;
    }
    const press = this.pointerPress;
    if (!press || press.pointerId !== pointerId(pointer)) return;
    this.pointerPress = null;
    press.movedBy = Math.max(
      press.movedBy,
      Math.hypot(pointer.x - press.x, pointer.y - press.y),
    );

    const cameraSuppressed = this.consumeCameraClickSuppression();
    const releaseHover = this.resolveHover(pointer);
    this.hovered = releaseHover;
    const dragged = press.movedBy > this.tuning.clickSlop;
    if (dragged || cameraSuppressed) {
      this.renderAffordances();
      return;
    }

    // A valid click starts and ends on the same target. For touch, Phaser can
    // occasionally omit an initial hover; accepting the release target keeps
    // taps reliable without turning a drag ending over a target into a click.
    const releasedId = releaseHover?.target.id ?? null;
    if (releasedId && (!press.targetId || press.targetId === releasedId)) {
      const activated = this.activate(releasedId, 'pointer');
      if (!activated) {
        const target = this.resolveTarget(releasedId);
        if (target && this.targetAvailable(target) && this.cooldownRemaining(target) === 0) {
          const actorLogical = actorLogicalFootprint(this.actor);
          const targetLogical = targetLogicalFootprint(target);
          if (actorLogical && targetLogical && this.actor.mask && this.actor.setPath) {
            const range = Number.isFinite(target.range) ? target.range : this.tuning.defaultRange;
            const path = findPath(this.actor.mask, this.actor.heights, actorLogical, targetLogical, { range, climbStep: this.actor.climbStep ?? 1 });
            if (path && path.length > 0) {
              this.actor.setPath(path);
              this.pendingTarget = target;
            }
          }
        }
      }
    } else if (!dragged && !cameraSuppressed) {
      const pointerLogical = this.pointerLogicalPoint(pointer);
      const actorLogical = actorLogicalFootprint(this.actor);
      if (pointerLogical && actorLogical && this.actor.mask && this.actor.setPath) {
        let dest = pointerLogical;
        if (!this.actor.mask[Math.round(dest.row)]?.[Math.round(dest.col)]) {
          dest = nearestWalkable(this.actor.mask, dest.col, dest.row);
        }
        if (dest) {
          const path = findPath(this.actor.mask, this.actor.heights, actorLogical, dest, { climbStep: this.actor.climbStep ?? 1 });
          if (path && path.length > 0) {
            this.actor.setPath(path);
            this.pendingTarget = null;
          } else {
            const dist = distanceBetween(defaultPointFromLogical(actorLogical), defaultPointFromLogical(dest));
            if (dist > 2) {
              this.actor.setPath([{ col: dest.col, row: dest.row }]);
              this.pendingTarget = null;
            }
          }
        }
      }
    }
    this.renderAffordances();
  }

  cooldownRemaining(target, time = this.now()) {
    return Math.max(
      0,
      this.globalReadyAt - time,
      (this.readyAt.get(target.id) ?? 0) - time,
    );
  }

  now() {
    const sceneTime = this.scene.time?.now;
    return Number.isFinite(sceneTime) ? sceneTime : this.lastUpdateTime;
  }

  activateNearest(source = 'key') {
    if (this.inputTransitionBlocked(source)) return false;
    this.nearest = this.resolveNearest();
    if (!this.nearest) return false;
    return this.activate(this.nearest.target, source);
  }

  activate(targetOrId, source = 'api') {
    if (this.inputTransitionBlocked(source)) return false;
    const target = this.resolveTarget(targetOrId);
    if (!target || !this.targetAvailable(target)) return false;
    const resolution = this.targetResolution(target);
    if (!resolution?.inRange || this.cooldownRemaining(target) > 0) return false;

    const callback = this.callbacks[target.action]
      ?? this.callbacks[target.type]
      ?? this.callbacks.onAction;
    if (typeof callback !== 'function') return false;

    const result = callback(target.source, {
      source,
      actor: this.actor,
      controller: this,
    });
    if (result === false) return false;

    const cooldownMs = Number.isFinite(target.cooldownMs)
      ? Math.max(0, target.cooldownMs)
      : Math.max(0, this.tuning.cooldownMs);
    const readyAt = this.now() + cooldownMs;
    this.readyAt.set(target.id, readyAt);
    this.globalReadyAt = readyAt;
    if (target.once) this.completed.add(target.id);

    this.nearest = this.resolveNearest();
    this.hovered = this.hovered?.target.id === target.id && !this.targetAvailable(target)
      ? null
      : this.hovered;
    this.renderAffordances();
    return true;
  }

  promptText(resolution) {
    if (!resolution) return '';
    const { target } = resolution;
    if (!resolution.inRange) return `Move closer · ${target.label}`;
    const remaining = this.cooldownRemaining(target);
    if (remaining > 0) return `Wait ${(remaining / 1000).toFixed(1)}s · ${target.label}`;
    return `E / Click · ${target.label}`;
  }

  update(time) {
    if (this.destroyed) return;
    if (Number.isFinite(time)) this.lastUpdateTime = time;
    if (this.inputTransitionBlocked()) {
      this.pointerPress = null;
      this.hovered = null;
      this.nearest = null;
      this.pendingTarget = null;
      this.hideAffordances();
      return;
    }

    if (this.pendingTarget) {
      const resolution = this.targetResolution(this.pendingTarget);
      if (resolution?.inRange) {
        this.activate(this.pendingTarget, 'pointer');
        this.pendingTarget = null;
        if (this.actor?.setPath) {
          this.actor.setPath(null);
        }
      } else if (!this.actor?.path || this.actor.path.length === 0) {
        this.pendingTarget = null;
      }
    }

    this.nearest = this.resolveNearest();
    const pointer = this.scene.input.activePointer;
    if (pointer && !this.pointerPress) this.hovered = this.resolveHover(pointer);
    this.renderAffordances();
  }

  renderAffordances() {
    if (this.destroyed) return;
    if (this.inputTransitionBlocked()) {
      this.hideAffordances();
      return;
    }
    const activeView = this.activeView();
    const zoom = this.viewCamera?.zoom || 1;
    const inverseScale = clamp(
      1 / zoom,
      this.tuning.labelMinScale,
      this.tuning.labelMaxScale,
    );
    const markerScale = this.tuning.markerScale * inverseScale;

    if (this.nearest) {
      const footprint = this.projectLogicalFootprint(
        this.nearest.logicalFootprint,
        activeView,
      );
      this.nearest.footprint = footprint;
      const depth = interactionGroundDepth(this.nearest.logicalFootprint, activeView);
      this.nearbyMarker
        .setPosition(footprint.x, footprint.y)
        .setVisible(true)
        .setData('depth', depth + 0.02);
      applyGroundPlaneTransform(this.nearbyMarker, activeView, { scale: markerScale });
    } else {
      this.nearbyMarker.setVisible(false);
    }

    if (this.hovered) {
      const footprint = this.projectLogicalFootprint(
        this.hovered.logicalFootprint,
        activeView,
      );
      this.hovered.footprint = footprint;
      const depth = interactionGroundDepth(this.hovered.logicalFootprint, activeView);
      this.hoverMarker
        .setPosition(footprint.x, footprint.y)
        .setVisible(true)
        .setData('depth', depth + 0.03);
      applyGroundPlaneTransform(
        this.hoverMarker,
        activeView,
        { scale: markerScale * 1.08 },
      );
    } else {
      this.hoverMarker.setVisible(false);
    }
    this.applyHoverTint(this.hovered?.target ?? null);
    this.scene.input.setDefaultCursor?.(
      this.hovered ? (this.hovered.inRange ? 'pointer' : 'not-allowed') : 'default',
    );

    // Hover takes precedence so an out-of-range landmark explains why it
    // cannot be clicked; otherwise the prompt follows the nearest valid target.
    const focus = this.hovered ?? this.nearest;
    if (!focus) {
      this.prompt.setVisible(false);
      return;
    }
    const focusFootprint = this.projectLogicalFootprint(
      focus.logicalFootprint,
      activeView,
    );
    focus.footprint = focusFootprint;
    this.prompt
      .setText(this.promptText(focus))
      .setPosition(
        focusFootprint.x,
        focusFootprint.y - this.tuning.promptOffset * inverseScale,
      )
      .setScale(inverseScale)
      .setVisible(true)
      .setData('depth', interactionGroundDepth(focus.logicalFootprint, activeView) + 10000);
  }

  applyHoverTint(target) {
    const sprite = target?.sprite;
    const canTint = sprite?.input?.enabled && sprite.setTint && sprite.clearTint;
    if (!canTint) {
      this.clearHoverTint();
      return;
    }
    if (this.tintedSprite === sprite) return;
    this.clearHoverTint();

    this.tintedSprite = sprite;
    this.previousTint = {
      isTinted: Boolean(sprite.isTinted),
      tintFill: Boolean(sprite.tintFill),
      topLeft: sprite.tintTopLeft,
      topRight: sprite.tintTopRight,
      bottomLeft: sprite.tintBottomLeft,
      bottomRight: sprite.tintBottomRight,
    };
    sprite.setTint(target.hoverTint ?? MARKER.hoverTint);
  }

  clearHoverTint() {
    const sprite = this.tintedSprite;
    const previous = this.previousTint;
    this.tintedSprite = null;
    this.previousTint = null;
    if (!displayObjectAlive(sprite) || !sprite.clearTint) return;

    if (!previous?.isTinted) {
      sprite.clearTint();
      return;
    }
    const colors = [
      previous.topLeft,
      previous.topRight,
      previous.bottomLeft,
      previous.bottomRight,
    ];
    if (previous.tintFill && sprite.setTintFill) sprite.setTintFill(...colors);
    else sprite.setTint(...colors);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.events?.off('shutdown', this.onShutdown);
    this.scene.input?.off('pointerdown', this.onPointerDown);
    this.scene.input?.off('pointermove', this.onPointerMove);
    this.scene.input?.off('pointerup', this.onPointerUp);
    this.scene.input?.off('pointerupoutside', this.onPointerCancel);
    this.scene.input?.off('gameout', this.onPointerCancel);
    this.interactKey?.off?.('down', this.onInteractKey);
    this.scene.input?.setDefaultCursor?.('default');
    this.clearHoverTint();
    this.disableOwnedInteractives();
    this.nearbyMarker?.destroy();
    this.hoverMarker?.destroy();
    this.prompt?.destroy();
    this.targets = [];
    this.targetsById.clear();
    this.hovered = null;
    this.nearest = null;
    this.pointerPress = null;
  }
}
