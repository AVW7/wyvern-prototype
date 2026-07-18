import { describe, expect, it, vi } from 'vitest';
import { ISO } from '../src/config.js';
import { gridToScreen } from '../src/systems/iso.js';
import {
  actorGroundFootprint,
  actorLogicalFootprint,
  createSanctuaryInteractions,
  interactionGroundDepth,
  targetGroundFootprint,
  targetLogicalFootprint,
} from '../src/systems/sanctuaryInteractions.js';
import { groundPlaneTransform } from '../src/systems/sanctuaryGroundPlane.js';
import { projectFootprint } from '../src/systems/sanctuaryProjection.js';

function emitter() {
  const listeners = new Map();
  return {
    on(event, fn) {
      const rows = listeners.get(event) ?? [];
      rows.push(fn);
      listeners.set(event, rows);
      return this;
    },
    once(event, fn) { return this.on(event, fn); },
    off(event, fn) {
      listeners.set(event, (listeners.get(event) ?? []).filter((row) => row !== fn));
      return this;
    },
    emit(event, ...args) {
      (listeners.get(event) ?? []).forEach((fn) => fn(...args));
    },
  };
}

function displayObject() {
  return {
    scene: {},
    active: true,
    visible: true,
    input: null,
    setStrokeStyle() { return this; },
    setVisible(value) { this.visible = value; return this; },
    setData(key, value) { this[key] = value; return this; },
    setOrigin() { return this; },
    setPosition(x, y) { this.x = x; this.y = y; return this; },
    setScale(x, y = x) {
      this.scale = x;
      this.scaleX = x;
      this.scaleY = y;
      return this;
    },
    setRotation(value) { this.rotation = value; return this; },
    setText(value) { this.text = value; return this; },
    setInteractive() { this.input = { enabled: true }; return this; },
    disableInteractive() { this.input.enabled = false; return this; },
    setTint(value) { this.tint = value; this.isTinted = true; return this; },
    clearTint() { this.tint = null; this.isTinted = false; return this; },
    destroy() { this.active = false; },
  };
}

function makeScene() {
  const input = emitter();
  const events = emitter();
  const key = emitter();
  input.activePointer = null;
  input.cursor = 'default';
  input.setDefaultCursor = (value) => { input.cursor = value; };
  input.keyboard = { addKey: () => key };
  const camera = {
    zoom: 1,
    getWorldPoint: (x, y) => ({ x, y }),
  };
  return {
    add: {
      ellipse: () => displayObject(),
      text: () => displayObject(),
    },
    input,
    events,
    cameras: { main: camera },
    time: { now: 0 },
    key,
    camera,
  };
}

function pointer(x, y) {
  return {
    id: 1,
    x,
    y,
    button: 0,
    isDown: true,
    leftButtonDown: () => true,
  };
}

describe('sanctuary interaction footprints', () => {
  it('derives authored targets from cell ground centres, not sprite art positions', () => {
    const projected = gridToScreen(4, 7);
    const footprint = targetGroundFootprint({
      col: 4,
      row: 7,
      sprite: { x: 999, y: -999 },
    });

    expect(footprint).toEqual({ x: projected.x, y: projected.y + ISO.tileHeight / 2 });
    expect(actorGroundFootprint({ getFootprint: () => ({ groundX: 12, groundY: 34 }) }))
      .toEqual({ x: 12, y: 34 });
  });

  it('resolves stable logical coordinates from grid and legacy footprint shapes', () => {
    const projected = projectFootprint(2.25, 3.75, { yawDeg: 0, elevationStep: 0 });

    expect(targetLogicalFootprint({ footprint: projected })).toEqual({
      col: expect.closeTo(2.25, 10),
      row: expect.closeTo(3.75, 10),
    });
    expect(targetLogicalFootprint({
      col: 4,
      row: 7,
      footprintOffsetX: 8,
      footprintOffsetY: -4,
    })).toEqual({
      col: expect.closeTo(4, 10),
      row: expect.closeTo(6.75, 10),
    });
    expect(actorLogicalFootprint({ getFootprint: () => ({
      ...projected,
      col: 2.25,
      row: 3.75,
    }) })).toEqual({ col: 2.25, row: 3.75 });
    expect(targetLogicalFootprint({
      logicalFootprint: { col: 6, row: 5 },
      footprint: projectFootprint(6, 5, { yawDeg: 45, elevationStep: 1 }),
    })).toEqual({ col: 6, row: 5 });
    expect(actorLogicalFootprint({
      getLogicalFootprint: () => ({ col: 1.5, row: 2.5 }),
      getFootprint: () => projectFootprint(1.5, 2.5, { yawDeg: -45, elevationStep: -1 }),
    })).toEqual({ col: 1.5, row: 2.5 });
  });

  it('sorts an upper-half marker after its owning floor tile', () => {
    const projected = gridToScreen(4, 7);
    const floorDepth = projected.y + ISO.tileHeight / 2;
    const upperHalf = { x: projected.x, y: floorDepth - 8 };

    expect(interactionGroundDepth(upperHalf)).toBe(floorDepth);
  });
});

describe('sanctuary interaction controller', () => {
  it('keeps range in the default world metric while projecting active-view markers', () => {
    const scene = makeScene();
    const view = { yawDeg: 45, elevationStep: 1 };
    const controller = createSanctuaryInteractions({
      scene,
      view,
      actor: { getFootprint: () => ({ col: 2, row: 2 }) },
      targets: [{
        id: 'east-cell',
        type: 'gate',
        action: 'gate',
        range: 40,
        footprint: { col: 3, row: 2 },
      }],
      callbacks: { gate: vi.fn() },
    });

    // One +col step is sqrt(32^2 + 16^2) in the compatibility metric,
    // although it projects to 32*sqrt(2) pixels at yaw +45.
    expect(controller.nearest.distance).toBeCloseTo(Math.hypot(32, 16));
    expect(controller.nearest.inRange).toBe(true);
    const projected = projectFootprint(3, 2, view);
    expect(controller.nearbyMarker).toMatchObject({
      x: expect.closeTo(projected.x, 10),
      y: expect.closeTo(projected.y, 10),
      visible: true,
      depth: expect.closeTo(interactionGroundDepth({ col: 3, row: 2 }, view) + 0.02, 10),
    });
    const firstGroundTransform = groundPlaneTransform(view);
    expect(controller.nearbyMarker.scaleX).toBeCloseTo(firstGroundTransform.scaleX);
    expect(controller.nearbyMarker.scaleY).toBeCloseTo(firstGroundTransform.scaleY);
    expect(controller.nearbyMarker.rotation).toBeCloseTo(firstGroundTransform.rotation);

    controller.setView({ yawDeg: -45, elevationStep: -1 });
    expect(controller.nearest.distance).toBeCloseTo(Math.hypot(32, 16));
    const reprojected = projectFootprint(3, 2, controller.view);
    expect(controller.nearbyMarker.x).toBeCloseTo(reprojected.x);
    expect(controller.nearbyMarker.y).toBeCloseTo(reprojected.y);
    const secondGroundTransform = groundPlaneTransform(controller.view);
    expect(controller.nearbyMarker.scaleX).toBeCloseTo(secondGroundTransform.scaleX);
    expect(controller.nearbyMarker.scaleY).toBeCloseTo(secondGroundTransform.scaleY);
    controller.destroy();
  });

  it('foreshortens nearby and hover rings while keeping the prompt upright', () => {
    const scene = makeScene();
    const view = { yawDeg: 45, elevationStep: 1 };
    const target = { col: 2, row: 3 };
    const projected = projectFootprint(target.col, target.row, view);
    const controller = createSanctuaryInteractions({
      scene,
      view,
      actor: { getFootprint: () => ({ ...target }) },
      targets: [{
        id: 'spring', type: 'spring', action: 'spring', range: 20, hitRadius: 20,
        footprint: { ...target },
      }],
      callbacks: { spring: vi.fn() },
    });

    scene.input.emit('pointermove', pointer(projected.x, projected.y));
    const transform = groundPlaneTransform(view);
    expect(controller.nearbyMarker.scaleX).toBeCloseTo(transform.scaleX);
    expect(controller.nearbyMarker.scaleY).toBeCloseTo(transform.scaleY);
    expect(controller.hoverMarker.scaleX).toBeCloseTo(transform.scaleX * 1.08);
    expect(controller.hoverMarker.scaleY).toBeCloseTo(transform.scaleY * 1.08);
    expect(controller.prompt.rotation).toBeUndefined();
    controller.destroy();
  });

  it('follows a supplied active-view provider and inverts pointer hover through it', () => {
    const scene = makeScene();
    let view = { yawDeg: 45, elevationStep: 1 };
    const callback = vi.fn();
    const target = { col: 4.25, row: 2.5 };
    const controller = createSanctuaryInteractions({
      scene,
      getView: () => view,
      actor: { getFootprint: () => ({ ...target }) },
      targets: [{
        id: 'rotated-target',
        type: 'gate',
        action: 'gate',
        range: 10,
        hitRadius: 4,
        footprint: { ...target },
      }],
      callbacks: { gate: callback },
      tuning: { cooldownMs: 0 },
    });
    const firstAnchor = projectFootprint(target.col, target.row, view);

    scene.input.emit('pointerdown', pointer(firstAnchor.x, firstAnchor.y));
    scene.input.emit('pointerup', pointer(firstAnchor.x, firstAnchor.y));
    expect(callback).toHaveBeenCalledOnce();
    expect(controller.pointerWorldPoint(pointer(firstAnchor.x, firstAnchor.y))).toEqual({
      x: expect.closeTo(projectFootprint(target.col, target.row).x, 9),
      y: expect.closeTo(projectFootprint(target.col, target.row).y, 9),
    });

    view = { yawDeg: -45, elevationStep: -1 };
    scene.time.now = 1;
    controller.update();
    const secondAnchor = projectFootprint(target.col, target.row, view);
    expect(controller.nearbyMarker.x).toBeCloseTo(secondAnchor.x);
    expect(controller.nearbyMarker.y).toBeCloseTo(secondAnchor.y);
    controller.destroy();
  });

  it('gates key and pointer activation while the camera rig is transitioning', () => {
    const scene = makeScene();
    const callback = vi.fn();
    const cameraController = {
      camera: scene.camera,
      view: { yawDeg: 0, elevationStep: 0 },
      transitioning: true,
      consumeClickSuppression: vi.fn(() => true),
    };
    const target = projectFootprint(1, 1);
    const controller = createSanctuaryInteractions({
      scene,
      camera: cameraController,
      actor: { getFootprint: () => ({ col: 1, row: 1 }) },
      targets: [{
        id: 'gate', type: 'gate', action: 'gate', range: 20, hitRadius: 20,
        footprint: { col: 1, row: 1 },
      }],
      callbacks: { gate: callback },
      tuning: { cooldownMs: 0 },
    });

    scene.key.emit('down', scene.key, { repeat: false });
    scene.input.emit('pointerdown', pointer(target.x, target.y));
    scene.input.emit('pointerup', pointer(target.x, target.y));
    expect(callback).not.toHaveBeenCalled();
    expect(controller.nearbyMarker.visible).toBe(false);
    expect(controller.hoverMarker.visible).toBe(false);
    expect(controller.prompt.visible).toBe(false);
    expect(cameraController.consumeClickSuppression).toHaveBeenCalledOnce();

    cameraController.transitioning = false;
    controller.update();
    scene.key.emit('down', scene.key, { repeat: false });
    expect(callback).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it('uses one action path while enforcing availability, range, cooldown, and once', () => {
    const scene = makeScene();
    const activated = [];
    const controller = createSanctuaryInteractions({
      scene,
      layer: { add: vi.fn() },
      actor: { getFootprint: () => ({ x: 0, y: 0 }) },
      targets: [
        {
          id: 'used-once', type: 'spring', label: 'Drink', action: 'spring',
          range: 50, once: true, footprint: { x: 10, y: 0 },
        },
        {
          id: 'training', type: 'training', label: 'Train', action: 'train',
          range: 50, footprint: { x: 20, y: 0 },
        },
        {
          id: 'closed', type: 'gate', label: 'Closed', action: 'gate',
          range: 50, available: false, footprint: { x: 1, y: 0 },
        },
      ],
      callbacks: {
        spring: (target, context) => activated.push([target.id, context.source]),
        train: (target, context) => activated.push([target.id, context.source]),
      },
      tuning: { cooldownMs: 100 },
    });

    expect(controller.activateNearest('key')).toBe(true);
    expect(activated).toEqual([['used-once', 'key']]);
    expect(controller.activateNearest('key')).toBe(false);

    scene.time.now = 101;
    expect(controller.activateNearest('key')).toBe(true);
    expect(activated).toEqual([['used-once', 'key'], ['training', 'key']]);
    controller.destroy();
  });

  it('does not consume one-shot state when an action callback rejects', () => {
    const scene = makeScene();
    const callback = vi.fn(() => false);
    const controller = createSanctuaryInteractions({
      scene,
      actor: { getFootprint: () => ({ x: 0, y: 0 }) },
      targets: [{
        id: 'spring', type: 'spring', action: 'spring', label: 'Drink',
        range: 50, once: true, footprint: { x: 0, y: 0 },
      }],
      callbacks: { spring: callback },
    });

    expect(controller.activate('spring')).toBe(false);
    expect(controller.activate('spring')).toBe(false);
    expect(callback).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it('suppresses a target click after camera drag and accepts the next tap', () => {
    const scene = makeScene();
    const callback = vi.fn();
    let suppressed = true;
    const cameraController = {
      camera: scene.camera,
      consumeClickSuppression: () => {
        const value = suppressed;
        suppressed = false;
        return value;
      },
    };
    const controller = createSanctuaryInteractions({
      scene,
      camera: cameraController,
      actor: { getFootprint: () => ({ x: 10, y: 10 }) },
      targets: [{
        id: 'gate', type: 'gate', action: 'gate', label: 'Enter',
        range: 50, footprint: { x: 10, y: 10 },
      }],
      callbacks: { gate: callback },
      tuning: { cooldownMs: 0 },
    });

    scene.input.emit('pointerdown', pointer(10, 10));
    scene.input.emit('pointerup', pointer(10, 10));
    expect(callback).not.toHaveBeenCalled();

    scene.input.emit('pointerdown', pointer(10, 10));
    scene.input.emit('pointerup', pointer(10, 10));
    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][1].source).toBe('pointer');
    controller.destroy();
  });

  it('does not activate when a press leaves its target before release', () => {
    const scene = makeScene();
    const callback = vi.fn();
    const controller = createSanctuaryInteractions({
      scene,
      actor: { getFootprint: () => ({ x: 10, y: 10 }) },
      targets: [{
        id: 'gate', type: 'gate', action: 'gate', label: 'Enter',
        range: 50, hitRadius: 3, footprint: { x: 10, y: 10 },
      }],
      callbacks: { gate: callback },
      tuning: { cooldownMs: 0 },
    });

    scene.input.emit('pointerdown', pointer(10, 10));
    scene.input.emit('pointerup', pointer(15, 10));

    expect(callback).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('restores hover tint and cancels a press that leaves the game canvas', () => {
    const scene = makeScene();
    const callback = vi.fn();
    const sprite = displayObject();
    const controller = createSanctuaryInteractions({
      scene,
      actor: { getFootprint: () => ({ x: 10, y: 10 }) },
      targets: [{
        id: 'resident', type: 'resident', action: 'resident', label: 'Talk',
        range: 50, hitRadius: 40, footprint: { x: 10, y: 10 }, sprite,
      }],
      callbacks: { resident: callback },
      tuning: { cooldownMs: 0 },
    });

    scene.input.emit('pointermove', pointer(10, 10));
    expect(sprite.isTinted).toBe(true);
    scene.input.emit('pointerdown', pointer(10, 10));
    scene.input.emit('gameout');
    scene.input.emit('pointerup', pointer(10, 10));
    expect(callback).not.toHaveBeenCalled();
    expect(sprite.isTinted).toBe(false);
    controller.destroy();
  });
});
