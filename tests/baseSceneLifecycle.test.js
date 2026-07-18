import {
  afterAll, beforeAll, describe, expect, it, vi,
} from 'vitest';
import { interactionGroundDepth } from '../src/systems/sanctuaryInteractions.js';
import { projectFootprint } from '../src/systems/sanctuaryProjection.js';

let BaseScene;
let targetFootprint;

beforeAll(async () => {
  globalThis.Phaser = {
    Scene: class Scene {
      constructor(key) {
        this.sceneKey = key;
      }
    },
  };
  ({ default: BaseScene, targetFootprint } = await import('../src/scenes/BaseScene.js'));
});

afterAll(() => {
  delete globalThis.Phaser;
});

describe('BaseScene world teardown', () => {
  it('lets a Phaser Layer destroy its own children during a rebuild', () => {
    const scene = new BaseScene();
    const layer = {
      destroy: vi.fn(),
      removeAll: vi.fn(),
    };
    const backdrop = { destroy: vi.fn() };
    const shadow = { destroy: vi.fn() };
    scene.world = { layer, backdrop, shadow };
    scene.residents = [{ id: 'resident' }];
    scene.selectedResident = scene.residents[0];

    scene.destroyWorldDisplay();

    expect(layer.destroy).toHaveBeenCalledOnce();
    expect(layer.removeAll).not.toHaveBeenCalled();
    expect(shadow.destroy).toHaveBeenCalledOnce();
    expect(backdrop.destroy).toHaveBeenCalledOnce();
    expect(scene.world).toBeNull();
    expect(scene.residents).toEqual([]);
    expect(scene.selectedResident).toBeNull();
  });

  it('preserves logical coordinates when resolving a projected action target', () => {
    const view = { yawDeg: 45, elevationStep: 1 };
    const logicalFootprint = { col: 20, row: 14 };
    const projected = projectFootprint(
      logicalFootprint.col,
      logicalFootprint.row,
      view,
    );
    const resolved = targetFootprint({
      footprint: projected,
      logicalFootprint,
    }, view);

    expect(resolved).toEqual({ ...projected, ...logicalFootprint });
    expect(interactionGroundDepth(resolved, view)).toBeCloseTo(
      interactionGroundDepth(logicalFootprint, view),
    );
  });
});
