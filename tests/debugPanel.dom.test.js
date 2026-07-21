// Lifecycle cover for the debug panel. BaseScene.buildWorld() destroys and
// recreates the panel on every recruit, so a leaked interval or an orphaned
// root is not a one-off — it accumulates for as long as the session runs. That
// exact leak already happened once to the 3D layer itself (see the rebuild note
// in BaseScene.buildWorld), which is why this is worth a test.
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { createDragonDebugPanel } from '../src/ui/debugPanel.js';
import { SANCTUARY } from '../src/config.js';

const SLOTS = Object.keys(SANCTUARY.dragon3D.clips);

function fakeSanctuary3D(overrides = {}) {
  return {
    setTuning: vi.fn(),
    setMotion: vi.fn(),
    triggerAction: vi.fn(() => true),
    listMotionSlots: () => SLOTS,
    listClips: () => SLOTS,
    getMotionState: () => ({
      current: 'idle',
      base: 'idle',
      pending: null,
      override: null,
      action: null,
      timeScale: 1,
      speed: 0,
      airborne: false,
      headingDeg: 0,
      rollDeg: 0,
      pitchDeg: 0,
    }),
    getRenderStats: () => ({
      calls: 42, triangles: 120000, geometries: 8, textures: 6, programs: 3,
    }),
    ...overrides,
  };
}

function fakeScene(overrides = {}) {
  return {
    selectedWyvernId: 'w1',
    movement: {
      getLogicalFootprint: () => ({ col: 4, row: 7 }),
      getAltitude: () => 0,
      getTargetAltitude: () => 0,
    },
    dracarysFromPanel: vi.fn(),
    buildWorld: vi.fn(),
    captureCameraView: () => null,
    ...overrides,
  };
}

// Stats draws its graph into a 2D canvas, which jsdom does not implement —
// getContext() returns null and Stats dies on the first property write. The
// panel is not the right place to defend against that (every real browser has
// a 2D context), so the environment gap is filled here instead.
function stubCanvas2D() {
  const context = new Proxy({}, {
    get: (target, prop) => (prop in target ? target[prop] : () => ({ data: [] })),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  return vi
    .spyOn(window.HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context);
}

describe('createDragonDebugPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubCanvas2D();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('mounts exactly one panel root and one stats overlay', () => {
    const panel = createDragonDebugPanel(fakeScene(), fakeSanctuary3D());

    expect(document.querySelectorAll('.wyvern-debug-panel').length).toBe(1);
    expect(document.querySelectorAll('.wyvern-debug-stats').length).toBe(1);

    panel.destroy();
  });

  it('removes both roots on destroy', () => {
    const panel = createDragonDebugPanel(fakeScene(), fakeSanctuary3D());
    panel.destroy();

    expect(document.querySelectorAll('.wyvern-debug-panel').length).toBe(0);
    expect(document.querySelectorAll('.wyvern-debug-stats').length).toBe(0);
  });

  it('leaves nothing behind across a destroy/recreate cycle', () => {
    // The buildWorld() pattern: tear the old one down, stand a new one up.
    const scene = fakeScene();
    const first = createDragonDebugPanel(scene, fakeSanctuary3D());
    first.destroy();
    const second = createDragonDebugPanel(scene, fakeSanctuary3D());

    expect(document.querySelectorAll('.wyvern-debug-panel').length).toBe(1);
    expect(document.querySelectorAll('.wyvern-debug-stats').length).toBe(1);

    second.destroy();
  });

  it('stops polling the 3D layer after destroy', () => {
    const sanctuary3D = fakeSanctuary3D();
    const spy = vi.spyOn(sanctuary3D, 'getRenderStats');
    const panel = createDragonDebugPanel(fakeScene(), sanctuary3D);

    vi.advanceTimersByTime(1000);
    expect(spy.mock.calls.length).toBeGreaterThan(0);

    panel.destroy();
    const afterDestroy = spy.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(spy.mock.calls.length).toBe(afterDestroy);
  });

  it('renders a button for every motion slot, not a hand-picked few', () => {
    const panel = createDragonDebugPanel(fakeScene(), fakeSanctuary3D());
    const labels = [...document.querySelectorAll('.wyvern-debug-panel .controller.function .name')]
      .map((node) => node.textContent);

    SLOTS.forEach((slot) => expect(labels, slot).toContain(slot));

    panel.destroy();
  });

  it('holds a loop through setMotion and fires a one-shot through triggerAction', () => {
    // Finding A: routing a base loop down the one-shot channel made Walk play
    // once and stop. The two channels must stay separate.
    const sanctuary3D = fakeSanctuary3D();
    const panel = createDragonDebugPanel(fakeScene(), sanctuary3D);

    // lil-gui nests the label inside the button that carries the listener.
    const click = (label) => {
      const button = [...document.querySelectorAll('.wyvern-debug-panel .controller.function button')]
        .find((node) => node.querySelector('.name')?.textContent === label);
      expect(button, label).toBeTruthy();
      button.click();
    };

    click('walk');
    expect(sanctuary3D.setMotion).toHaveBeenCalledWith('walk');
    expect(sanctuary3D.triggerAction).not.toHaveBeenCalled();

    click('attack');
    expect(sanctuary3D.triggerAction).toHaveBeenCalledWith('attack');

    click('gameplay state (auto)');
    expect(sanctuary3D.setMotion).toHaveBeenLastCalledWith(null);

    panel.destroy();
  });

  it('waits for the model before building slot buttons', () => {
    // The GLTF loads asynchronously, so the first listMotionSlots() call
    // returns nothing. The panel has to fill in once the model arrives.
    let loaded = false;
    const sanctuary3D = fakeSanctuary3D({
      listMotionSlots: () => (loaded ? SLOTS : []),
    });
    const panel = createDragonDebugPanel(fakeScene(), sanctuary3D);

    const slotButtons = () => [...document.querySelectorAll(
      '.wyvern-debug-panel .controller.function .name',
    )].filter((node) => SLOTS.includes(node.textContent)).length;

    expect(slotButtons()).toBe(0);

    loaded = true;
    vi.advanceTimersByTime(1000);
    expect(slotButtons()).toBe(SLOTS.length);

    panel.destroy();
  });

  it('survives a scene with no movement controller yet', () => {
    // buildWorld() creates the panel before createSanctuaryMovement().
    const panel = createDragonDebugPanel(
      fakeScene({ movement: null }),
      fakeSanctuary3D(),
    );
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    panel.destroy();
  });
});
