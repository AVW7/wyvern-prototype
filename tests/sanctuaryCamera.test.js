import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { GAME, SANCTUARY } from '../src/config.js';
import {
  SANCTUARY_CAMERA_MODES,
  createSanctuaryCamera,
  normalizeSanctuaryCameraView,
} from '../src/systems/sanctuaryCamera.js';
import { coverSanctuaryCamera } from '../src/systems/sanctuaryRender.js';

const WORLD_BOUNDS = {
  minX: 0,
  maxX: 1600,
  minY: 0,
  maxY: 900,
};

class MockKey extends EventEmitter {
  constructor() {
    super();
    this.isDown = false;
  }
}

class MockInput extends EventEmitter {
  constructor() {
    super();
    this.keys = new Map();
    this.contextMenuDisabled = false;
    this.mouse = {
      disableContextMenu: () => { this.contextMenuDisabled = true; },
    };
    this.keyboard = {
      addKey: (name) => {
        if (!this.keys.has(name)) this.keys.set(name, new MockKey());
        return this.keys.get(name);
      },
    };
  }
}

class MockCamera {
  constructor() {
    this.width = GAME.width;
    this.height = GAME.height;
    this.zoom = 1;
    this.scrollX = 0;
    this.scrollY = 0;
    this.x = 0;
    this.y = 0;
    this.originX = 0.5;
    this.originY = 0.5;
    this.rotation = 0;
    this.bounds = null;
    this.useBounds = false;
    // Phaser's matrix only picks up camera changes during preRender.
    this.matrixZoom = 1;
  }

  setZoom(zoom) {
    this.zoom = zoom;
    return this;
  }

  setBounds(x, y, width, height) {
    this.bounds = {
      x, y, width, height,
    };
    this.useBounds = true;
    this.scrollX = this.clampX(this.scrollX);
    this.scrollY = this.clampY(this.scrollY);
    return this;
  }

  centerOn(x, y) {
    // BaseCamera scroll values are not worldView's zoomed top-left.
    this.scrollX = x - this.width / 2;
    this.scrollY = y - this.height / 2;
    if (this.useBounds) {
      this.scrollX = this.clampX(this.scrollX);
      this.scrollY = this.clampY(this.scrollY);
    }
    return this;
  }

  getWorldPoint(x, y) {
    const originX = this.width * this.originX;
    const originY = this.height * this.originY;
    // Rotation stays zero in this fixture. The important Phaser behavior is
    // that the inverse matrix uses matrixZoom from the last preRender while
    // the scroll contribution uses the camera's current zoom.
    return {
      x: originX + (x - this.x - originX) / this.matrixZoom
        + this.scrollX * this.zoom / this.matrixZoom,
      y: originY + (y - this.y - originY) / this.matrixZoom
        + this.scrollY * this.zoom / this.matrixZoom,
    };
  }

  setScroll(x, y) {
    this.scrollX = x;
    this.scrollY = y;
    return this;
  }

  preRender() {
    if (this.useBounds) {
      this.scrollX = this.clampX(this.scrollX);
      this.scrollY = this.clampY(this.scrollY);
    }
    this.matrixZoom = this.zoom;
  }

  get displayWidth() {
    return this.width / this.zoom;
  }

  get displayHeight() {
    return this.height / this.zoom;
  }

  clampX(x) {
    const min = this.bounds.x + (this.displayWidth - this.width) / 2;
    const max = Math.max(min, min + this.bounds.width - this.displayWidth);
    return Math.min(max, Math.max(min, x));
  }

  clampY(y) {
    const min = this.bounds.y + (this.displayHeight - this.height) / 2;
    const max = Math.max(min, min + this.bounds.height - this.displayHeight);
    return Math.min(max, Math.max(min, y));
  }

  get center() {
    return {
      x: this.scrollX + this.width / 2,
      y: this.scrollY + this.height / 2,
    };
  }
}

function makeScene() {
  const camera = new MockCamera();
  const input = new MockInput();
  const events = new EventEmitter();
  return {
    scene: { cameras: { main: camera }, input, events },
    camera,
    input,
    events,
  };
}

function makePointer({
  id = 1,
  x = GAME.width / 2,
  y = GAME.height / 2,
  button = 0,
  buttons = 1,
  right = false,
  middle = false,
} = {}) {
  return {
    id,
    x,
    y,
    button,
    buttons,
    rightButtonDown: () => right,
    middleButtonDown: () => middle,
  };
}

function createFixture(options = {}) {
  const mocks = makeScene();
  const controller = createSanctuaryCamera(mocks.scene, {
    bounds: WORLD_BOUNDS,
    ...options,
  });
  // Camera input occurs after at least one rendered frame in the real scene.
  mocks.camera.preRender();
  return { ...mocks, controller };
}

describe('sanctuary camera controller', () => {
  it('normalizes rig endpoints and preserves them through ordinary refits', () => {
    const requested = { yawDeg: 999, elevationStep: -999 };
    const expected = normalizeSanctuaryCameraView(requested);
    const { controller } = createFixture({ view: requested });

    expect(controller.view).toEqual(expected);
    expect(controller.yawDeg).toBe(expected.yawDeg);
    expect(controller.elevationStep).toBe(expected.elevationStep);
    expect(controller.transitioning).toBe(false);

    controller.refit({ reset: true });
    controller.setPanelCollapsed(true);

    expect(controller.view).toEqual(expected);
    // Getter callers receive a serializable copy, not mutable controller state.
    const copy = controller.view;
    copy.yawDeg = 0;
    expect(controller.view).toEqual(expected);
  });

  it('fits the expanded panel view, applies its bias, and refits when collapsed', () => {
    const { camera, controller } = createFixture();
    const expectedExpandedZoom = Math.min(
      1,
      SANCTUARY.zoom.max,
      (GAME.width - SANCTUARY.cameraMargin * 2 - SANCTUARY.panelBias)
        / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX),
      (GAME.height - SANCTUARY.cameraMargin * 2)
        / (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY),
    );
    const mapCenterX = (WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX) / 2;
    const mapCenterY = (WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY) / 2;

    expect(controller.mode).toBe(SANCTUARY_CAMERA_MODES.OVERVIEW);
    expect(controller.minZoom).toBeCloseTo(expectedExpandedZoom);
    expect(camera.zoom).toBeCloseTo(expectedExpandedZoom);
    expect(camera.center.x).toBeCloseTo(
      mapCenterX - SANCTUARY.panelBias / expectedExpandedZoom / 2,
    );
    expect(camera.center.y).toBeCloseTo(mapCenterY);
    expect(camera.bounds.x).toBeLessThan(WORLD_BOUNDS.minX);
    expect(camera.bounds.x + camera.bounds.width).toBeGreaterThan(WORLD_BOUNDS.maxX);

    controller.setPanelCollapsed(true);
    const expectedCollapsedZoom = Math.min(
      1,
      SANCTUARY.zoom.max,
      (GAME.width - SANCTUARY.cameraMargin * 2)
        / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX),
      (GAME.height - SANCTUARY.cameraMargin * 2)
        / (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY),
    );

    expect(controller.mode).toBe(SANCTUARY_CAMERA_MODES.OVERVIEW);
    expect(controller.minZoom).toBeCloseTo(expectedCollapsedZoom);
    expect(camera.center.x).toBeCloseTo(mapCenterX);
    expect(camera.center.y).toBeCloseTo(mapCenterY);
  });

  it('keeps the pointer world point anchored while wheel-zooming', () => {
    const { camera, controller, input } = createFixture();
    // Deliberately off-center: zooming at the origin would not exercise the
    // scroll correction and allowed the stale-matrix bug to pass previously.
    const pointer = makePointer({ x: 930, y: 210 });
    const before = camera.getWorldPoint(pointer.x, pointer.y);

    input.emit('wheel', pointer, [], 0, -120);
    camera.preRender();

    expect(camera.zoom).toBeCloseTo(controller.minZoom * SANCTUARY.zoom.step);
    expect(camera.getWorldPoint(pointer.x, pointer.y)).toEqual({
      x: expect.closeTo(before.x, 8),
      y: expect.closeTo(before.y, 8),
    });
    expect(controller.mode).toBe(SANCTUARY_CAMERA_MODES.SURVEY);
  });

  it('steps yaw/elevation from keyboard and supports callback completion', async () => {
    const changes = [];
    const { controller, input } = createFixture({
      onViewChange: (next, previous, complete) => {
        changes.push({ next, previous, reason: complete.reason });
        complete();
      },
    });
    const defaultView = normalizeSanctuaryCameraView();

    input.keys.get(221).emit('down', input.keys.get(221), { repeat: false });
    await controller.transitionPromise;
    expect(controller.yawDeg).toBeGreaterThan(defaultView.yawDeg);
    expect(changes.at(-1).reason).toBe('keyboard');

    input.keys.get(33).emit('down', input.keys.get(33), { repeat: false });
    await controller.transitionPromise;
    expect(controller.elevationStep).toBeGreaterThan(defaultView.elevationStep);

    input.keys.get(219).emit('down', input.keys.get(219), { repeat: false });
    input.keys.get(34).emit('down', input.keys.get(34), { repeat: false });
    await controller.transitionPromise;
    expect(controller.view).toEqual(defaultView);
    expect(controller.transitioning).toBe(false);
  });

  it('waits for Promise transitions and gates pan, zoom, and further rig input', async () => {
    let finishTransition;
    const transition = new Promise((resolve) => { finishTransition = resolve; });
    const { camera, controller, input } = createFixture({
      onViewChange: () => transition,
    });
    const zoomBefore = camera.zoom;

    expect(controller.stepYaw(1)).toBe(true);
    expect(controller.transitioning).toBe(true);
    expect(controller.stepElevation(1)).toBe(false);
    const pendingView = controller.view;
    input.keys.get('HOME').emit('down', input.keys.get('HOME'), { repeat: false });
    expect(controller.reset()).toBe(false);
    expect(controller.view).toEqual(pendingView);
    expect(controller.transitioning).toBe(true);

    input.keys.get('SPACE').isDown = true;
    input.emit('pointerdown', makePointer({ x: 400, y: 300 }));
    input.emit('wheel', makePointer({ x: 900, y: 200 }), [], 0, -120);

    expect(controller.isDragging).toBe(false);
    expect(controller.zoomAt(makePointer(), SANCTUARY.zoom.step)).toBe(false);
    expect(camera.zoom).toBe(zoomBefore);
    expect(controller.consumeClickSuppression()).toBe(true);

    finishTransition();
    await controller.transitionPromise;
    expect(controller.transitioning).toBe(false);
  });

  it('interpolates toward a lazily resolved footprint with panel bias', () => {
    let footprint = { x: 700, y: 450 };
    const { camera, controller } = createFixture({
      followTarget: () => footprint,
    });
    expect(controller.setMode(SANCTUARY_CAMERA_MODES.FOLLOW)).toBe(true);

    footprint = { x: 1200, y: 600 };
    const before = { x: camera.scrollX, y: camera.scrollY };
    const desired = {
      x: footprint.x - SANCTUARY.panelBias / camera.zoom / 2
        - camera.width / 2,
      y: footprint.y - camera.height / 2,
    };

    controller.update(1000 / 60);

    expect(camera.scrollX).toBeCloseTo(
      before.x + (desired.x - before.x) * SANCTUARY.followLerp,
    );
    expect(camera.scrollY).toBeCloseTo(
      before.y + (desired.y - before.y) * SANCTUARY.followLerp,
    );
    expect(controller.mode).toBe(SANCTUARY_CAMERA_MODES.FOLLOW);
  });

  it('reserves normal left-click and suppresses activation after a pan drag', () => {
    const { camera, controller, input } = createFixture();
    const start = makePointer({ x: 500, y: 320 });

    input.emit('pointerdown', start);
    expect(controller.isDragging).toBe(false);

    input.keys.get('SPACE').isDown = true;
    input.emit('pointerdown', start);
    expect(controller.isDragging).toBe(true);
    expect(controller.mode).toBe(SANCTUARY_CAMERA_MODES.SURVEY);
    const scrollBefore = camera.scrollX;

    const moved = makePointer({
      id: start.id,
      x: start.x + SANCTUARY.dragClickSlop + 12,
      y: start.y + 8,
    });
    input.emit('pointermove', moved);
    input.emit('pointerup', moved);

    expect(camera.scrollX).not.toBeCloseTo(scrollBefore);
    expect(controller.isDragging).toBe(false);
    expect(controller.clickSuppressed).toBe(true);
    expect(controller.consumeClickSuppression()).toBe(true);
    expect(controller.consumeClickSuppression()).toBe(false);
  });

  it.each([
    ['right', { button: 2, buttons: 2, right: true }],
    ['middle', { button: 1, buttons: 4, middle: true }],
  ])('recognizes %s-button survey drags', (name, buttons) => {
    const { controller, input } = createFixture();
    const pointer = makePointer(buttons);

    input.emit('pointerdown', pointer);

    expect(controller.isDragging).toBe(true);
    expect(controller.mode).toBe(SANCTUARY_CAMERA_MODES.SURVEY);
  });

  it('supports F toggling, Home reset, and rejects unknown modes', () => {
    const followTarget = { footprint: { x: 1000, y: 550 } };
    const { camera, controller, input } = createFixture({ followTarget });
    const followKey = input.keys.get('F');
    const homeKey = input.keys.get('HOME');

    followKey.emit('down', followKey, { repeat: false });
    expect(controller.mode).toBe(SANCTUARY_CAMERA_MODES.FOLLOW);
    followKey.emit('down', followKey, { repeat: false });
    expect(controller.mode).toBe(SANCTUARY_CAMERA_MODES.SURVEY);

    controller.stepYaw(1);
    controller.stepElevation(1);
    expect(controller.view).not.toEqual(normalizeSanctuaryCameraView());
    controller.zoomAt(makePointer(), SANCTUARY.zoom.step);
    expect(camera.zoom).toBeGreaterThan(controller.minZoom);
    homeKey.emit('down', homeKey, { repeat: false });
    expect(controller.mode).toBe(SANCTUARY_CAMERA_MODES.OVERVIEW);
    expect(camera.zoom).toBeCloseTo(controller.minZoom);
    expect(controller.view).toEqual(normalizeSanctuaryCameraView());

    expect(() => controller.setMode('cinematic')).toThrow(/Unknown sanctuary camera mode/);
    expect(createFixture().controller.setMode(SANCTUARY_CAMERA_MODES.FOLLOW)).toBe(false);
  });

  it('removes input, key, and scene lifecycle listeners on shutdown', () => {
    const { controller, events, input } = createFixture({
      followTarget: { x: 800, y: 450 },
    });
    const followKey = input.keys.get('F');
    const homeKey = input.keys.get('HOME');
    const yawLeftKey = input.keys.get(219);
    const yawRightKey = input.keys.get(221);
    const elevationDownKey = input.keys.get(34);
    const elevationUpKey = input.keys.get(33);

    expect(input.listenerCount('wheel')).toBe(1);
    expect(input.listenerCount('pointerdown')).toBe(1);
    expect(followKey.listenerCount('down')).toBe(1);
    expect(homeKey.listenerCount('down')).toBe(1);
    expect(yawLeftKey.listenerCount('down')).toBe(1);
    expect(yawRightKey.listenerCount('down')).toBe(1);
    expect(elevationDownKey.listenerCount('down')).toBe(1);
    expect(elevationUpKey.listenerCount('down')).toBe(1);

    events.emit('shutdown');

    expect(input.listenerCount('wheel')).toBe(0);
    expect(input.listenerCount('pointerdown')).toBe(0);
    expect(input.listenerCount('pointermove')).toBe(0);
    expect(input.listenerCount('pointerup')).toBe(0);
    expect(followKey.listenerCount('down')).toBe(0);
    expect(homeKey.listenerCount('down')).toBe(0);
    expect(yawLeftKey.listenerCount('down')).toBe(0);
    expect(yawRightKey.listenerCount('down')).toBe(0);
    expect(elevationDownKey.listenerCount('down')).toBe(0);
    expect(elevationUpKey.listenerCount('down')).toBe(0);
    expect(events.listenerCount('shutdown')).toBe(0);
    expect(events.listenerCount('destroy')).toBe(0);
    expect(() => controller.destroy()).not.toThrow();
  });

  it('keeps the sanctuary backdrop centered on Phaser scroll coordinates', () => {
    const camera = new MockCamera();
    camera.setZoom(1.6);
    camera.setScroll(240, 90);
    const backdrop = {
      active: true,
      setPosition(x, y) { this.position = { x, y }; },
      setDisplaySize(width, height) { this.size = { width, height }; },
    };

    coverSanctuaryCamera(backdrop, camera);

    expect(backdrop.position).toEqual({
      x: camera.scrollX + camera.width / 2,
      y: camera.scrollY + camera.height / 2,
    });
    expect(backdrop.size).toEqual({
      width: camera.width / camera.zoom + 2,
      height: camera.height / camera.zoom + 2,
    });
  });
});
