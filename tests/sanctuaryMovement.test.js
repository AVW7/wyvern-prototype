import { describe, expect, it, vi } from 'vitest';
import { ISO, SANCTUARY, TERRAIN } from '../src/config.js';
import { gridToScreen } from '../src/systems/iso.js';
import { createDragonMotion } from '../src/systems/dragonMotion.js';
import {
  canOccupy,
  createSanctuaryMovement,
  createSanctuaryWanderers,
  createWalkableMask,
  findPath,
} from '../src/systems/sanctuaryMovement.js';
import {
  projectFootprint,
  projectVector,
  viewDirectionForWorldVector,
} from '../src/systems/sanctuaryProjection.js';

function cell(height = 1, extra = {}) {
  return { height, blocked: false, ...extra };
}

function display(x, y) {
  const data = new Map();
  return {
    x,
    y,
    active: true,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    setPosition(nextX, nextY) { this.x = nextX; this.y = nextY; return this; },
    setData(key, value) { data.set(key, value); return this; },
    getData(key) { return data.get(key); },
    setScale(xScale, yScale = xScale) {
      this.scaleX = xScale;
      this.scaleY = yScale;
      return this;
    },
    setAlpha(nextAlpha) { this.alpha = nextAlpha; return this; },
    play: vi.fn(),
  };
}

function footprint(col, row) {
  const point = gridToScreen(col, row);
  return { col, row, x: point.x, y: point.y + ISO.tileHeight / 2 };
}

function residentAt(col, row, id = 'wyv-test') {
  const base = footprint(col, row);
  return {
    animal: { id, assetKey: `wyvern-${id}` },
    footprint: { ...base, homeX: base.x, homeY: base.y },
    sprite: display(base.x, base.y),
    label: display(base.x, base.y - 60),
    shadow: display(base.x, base.y + 2),
    aura: display(base.x, base.y + 1),
    selectionRing: display(base.x, base.y + 2),
  };
}

function sceneWith(keys = {}) {
  return {
    anims: { exists: () => true },
    input: { keyboard: { addKeys: () => keys } },
    tweens: { killTweensOf: vi.fn() },
  };
}

function openTiles(size = 5) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => cell()));
}

describe('sanctuary movement', () => {
  it('marks holes and no-go cells unwalkable but keeps raised cells on the mask', () => {
    // Raised/`blocked` cells stay walkable — elevation is gated per step by the
    // climb rule, so the actor can walk up a hill; only holes and explicit
    // no-go cells are removed from the mask.
    const mask = createWalkableMask([[
      cell(),
      null,
      cell(3, { blocked: true }),
      cell(1, { noGo: true }),
    ]]);

    expect(mask).toEqual([[true, false, true, false]]);
    expect(canOccupy(mask, 0.49, 0)).toBe(true);
    expect(canOccupy(mask, 1, 0)).toBe(false);
    expect(canOccupy(mask, { col: Number.NaN, row: 0 })).toBe(false);
  });

  it('walks up a gentle hill but is stopped by a taller cliff', () => {
    const climbTuning = {
      speed: 1280, maxDeltaMs: 100, collisionRadius: 0, collisionStep: 4, climbStep: 1,
    };
    // Flat home area on cols 0-2; everything at col >= 3 is raised terrain.
    const region = (obstacleHeight) => {
      const tiles = openTiles(6);
      for (let row = 0; row < 6; row += 1) {
        for (let col = 3; col < 6; col += 1) tiles[row][col] = cell(obstacleHeight);
      }
      return tiles;
    };

    const climber = residentAt(2, 2);
    createSanctuaryMovement({
      scene: sceneWith({ RIGHT: { isDown: true } }),
      layer: { sort: vi.fn() },
      tiles: region(2), // +1 rise — a hill the actor climbs onto
      resident: climber,
      tuning: climbTuning,
    }).update(0, 100);
    expect(Math.round(climber.footprint.col)).toBeGreaterThanOrEqual(3);

    const stopped = residentAt(2, 2);
    createSanctuaryMovement({
      scene: sceneWith({ RIGHT: { isDown: true } }),
      layer: { sort: vi.fn() },
      tiles: region(3), // +2 rise — a cliff it can't climb, so it never enters
      resident: stopped,
      tuning: climbTuning,
    }).update(0, 100);
    expect(Math.round(stopped.footprint.col)).toBeLessThanOrEqual(2);
  });

  it('normalizes diagonal input and publishes one continuous footprint', () => {
    const keys = { D: { isDown: true }, DOWN: { isDown: true } };
    const actor = residentAt(2, 2);
    const start = { ...actor.footprint };
    const controller = createSanctuaryMovement({
      scene: sceneWith(keys),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      resident: actor,
      tuning: { speed: 100, maxDeltaMs: 100, collisionRadius: 0 },
    });

    expect(controller.update(0, 100)).toBe(true);
    expect(Math.hypot(
      controller.footprint.x - start.x,
      controller.footprint.y - start.y,
    )).toBeCloseTo(10);
    expect(actor.footprint).toBe(controller.footprint);
    expect(controller.getFootprint()).toMatchObject({
      x: controller.footprint.x,
      y: controller.footprint.y,
      surfaceLift: 0,
    });
    expect(controller.state).toBe('fly');
  });

  it('keeps movement logical and maps input relative to the active camera view', () => {
    const keys = { RIGHT: { isDown: true } };
    const actor = residentAt(2, 2);
    const controller = createSanctuaryMovement({
      scene: sceneWith(keys),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      resident: actor,
      tuning: { speed: 100, maxDeltaMs: 100, collisionRadius: 0 },
    });
    const view = { yawDeg: 45, elevationStep: 0 };
    controller.setView(view);
    const start = controller.getLogicalFootprint();

    expect(controller.update(0, 100)).toBe(true);

    const logical = controller.getLogicalFootprint();
    const worldDelta = {
      col: logical.col - start.col,
      row: logical.row - start.row,
    };
    const defaultMetric = projectVector(worldDelta.col, worldDelta.row);
    const activeProjection = projectVector(worldDelta.col, worldDelta.row, view);
    const expected = projectFootprint(logical.col, logical.row, TERRAIN.baseHeight, view);

    expect(Math.hypot(defaultMetric.x, defaultMetric.y)).toBeCloseTo(10);
    expect(activeProjection.x).toBeGreaterThan(0);
    expect(activeProjection.y).toBeCloseTo(0);
    expect(controller.footprint).toMatchObject({
      col: logical.col,
      row: logical.row,
    });
    expect(controller.footprint.x).toBeCloseTo(expected.x);
    expect(controller.footprint.y).toBeCloseTo(expected.y);
    expect(actor.logicalFootprint).toEqual(logical);
  });

  it('reprojects an idle actor and recomputes view-facing without moving it', () => {
    const keys = { RIGHT: { isDown: true } };
    const actor = residentAt(2, 2);
    const controller = createSanctuaryMovement({
      scene: sceneWith(keys),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      resident: actor,
      tuning: { speed: 100, maxDeltaMs: 100, collisionRadius: 0 },
    });
    const start = controller.getLogicalFootprint();
    controller.update(0, 100);
    const moved = controller.getLogicalFootprint();
    const lastWorldVector = {
      col: moved.col - start.col,
      row: moved.row - start.row,
    };
    keys.RIGHT.isDown = false;
    controller.update(100, 16);
    expect(controller.state).toBe('idle');

    const view = { yawDeg: 45, elevationStep: 1 };
    expect(controller.setView(view)).toBe(true);

    const expectedDirection = viewDirectionForWorldVector(
      lastWorldVector.col,
      lastWorldVector.row,
      view,
    );
    const expectedProjection = projectFootprint(
      moved.col,
      moved.row,
      TERRAIN.baseHeight,
      view,
    );
    expect(controller.getLogicalFootprint()).toEqual(moved);
    expect(controller.footprint.x).toBeCloseTo(expectedProjection.x);
    expect(controller.footprint.y).toBeCloseTo(expectedProjection.y);
    expect(controller.direction).toBe(expectedDirection);
    expect(actor.sprite.play.mock.lastCall[0]).toContain(`-idle-${expectedDirection}`);
    expect(controller.setView(view)).toBe(false);
  });

  it('keeps a never-moved idle actor on a stable world heading across yaw', () => {
    const actor = residentAt(2, 2);
    const controller = createSanctuaryMovement({
      scene: sceneWith(),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      resident: actor,
    });
    const start = controller.getLogicalFootprint();
    const view = { yawDeg: 45, elevationStep: 0 };
    const expectedDirection = viewDirectionForWorldVector(1, -1, view);

    expect(controller.direction).toBe('e');
    expect(controller.setView(view)).toBe(true);
    expect(controller.getLogicalFootprint()).toEqual(start);
    expect(controller.direction).toBe(expectedDirection);
    expect(actor.sprite.play.mock.lastCall[0]).toContain(`-idle-${expectedDirection}`);
  });

  it('honors transition gating and refreshes a camera view accessor before input', () => {
    const keys = { RIGHT: { isDown: true } };
    const actor = residentAt(2, 2);
    let blocked = true;
    let activeView = { yawDeg: 0, elevationStep: 0 };
    const controller = createSanctuaryMovement({
      scene: sceneWith(keys),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      resident: actor,
      getView: () => activeView,
      inputBlocked: () => blocked,
      tuning: { speed: 100, maxDeltaMs: 100, collisionRadius: 0 },
    });
    const start = controller.getLogicalFootprint();

    expect(controller.update(0, 100)).toBe(false);
    expect(controller.getLogicalFootprint()).toEqual(start);

    activeView = { yawDeg: -45, elevationStep: -1 };
    blocked = false;
    expect(controller.update(100, 100)).toBe(true);

    const logical = controller.getLogicalFootprint();
    const activeDelta = projectVector(
      logical.col - start.col,
      logical.row - start.row,
      activeView,
    );
    expect(controller.view).toEqual(activeView);
    expect(activeDelta.x).toBeGreaterThan(0);
    expect(activeDelta.y).toBeCloseTo(0);
  });

  it('sweeps long movement instead of tunnelling across blocked cells', () => {
    const tiles = Array.from({ length: 5 }, () => Array(5).fill(null));
    tiles[2][2] = cell();
    tiles[0][4] = cell(); // reachable only by crossing the no-go gap at (3, 1)
    const actor = residentAt(2, 2);
    const keys = { RIGHT: { isDown: true } };
    const controller = createSanctuaryMovement({
      scene: sceneWith(keys),
      layer: { sort: vi.fn() },
      tiles,
      resident: actor,
      tuning: {
        speed: 1280, maxDeltaMs: 100, collisionRadius: 0, collisionStep: 4,
      },
    });

    controller.update(0, 100);

    expect(Math.round(controller.footprint.col)).toBe(2);
    expect(Math.round(controller.footprint.row)).toBe(2);
    expect(canOccupy(controller.mask, controller.footprint)).toBe(true);
  });

  it('renders walkable raised cells at surface lift while depth stays grounded', () => {
    const tiles = openTiles(3);
    tiles[1][1] = cell(2);
    const actor = residentAt(1, 1);
    const controller = createSanctuaryMovement({
      scene: sceneWith(),
      layer: { sort: vi.fn() },
      tiles,
      resident: actor,
    });

    controller.update(0, 16);

    const expectedLift = (2 - TERRAIN.baseHeight) * ISO.elevation;
    expect(controller.footprint.surfaceLift).toBe(expectedLift);
    expect(actor.sprite.y).toBeCloseTo(controller.footprint.y - expectedLift);
    expect(actor.shadow.y).toBeCloseTo(controller.footprint.y - expectedLift + 2);
    expect(actor.sprite.getData('depth')).toBeCloseTo(controller.footprint.y + 0.2);
    expect(actor.label.y).toBeCloseTo(controller.footprint.y - expectedLift - 60);
  });

  it('sorts an actor after its floor tile in the upper half of the owning cell', () => {
    const tiles = openTiles(5);
    const actor = residentAt(2, 2);
    const upperHalf = footprint(1.75, 2);
    actor.footprint = { ...upperHalf };
    actor.sprite.setPosition(upperHalf.x, upperHalf.y);
    actor.label.setPosition(upperHalf.x, upperHalf.y - 60);
    actor.shadow.setPosition(upperHalf.x, upperHalf.y + 2);
    actor.aura.setPosition(upperHalf.x, upperHalf.y + 1);
    actor.selectionRing.setPosition(upperHalf.x, upperHalf.y + 2);

    const controller = createSanctuaryMovement({
      scene: sceneWith(),
      layer: { sort: vi.fn() },
      tiles,
      resident: actor,
    });
    controller.update(0, 16);

    // sanctuaryRender's owning floor tile uses this exact center-ground depth.
    const owningFloorDepth = footprint(2, 2).y;
    const depths = [
      actor.aura.getData('depth'),
      actor.selectionRing.getData('depth'),
      actor.shadow.getData('depth'),
      actor.sprite.getData('depth'),
      actor.label.getData('depth'),
    ];
    expect(controller.footprint.y).toBeLessThan(owningFloorDepth);
    expect(depths).toEqual([
      owningFloorDepth + 0.05,
      owningFloorDepth + 0.1,
      owningFloorDepth + 0.15,
      owningFloorDepth + 0.2,
      owningFloorDepth + 0.25,
    ]);
    expect(depths.every((depth) => depth > owningFloorDepth)).toBe(true);
    expect(depths.at(-1)).toBeLessThan(owningFloorDepth + 1);
  });

  it('lands and restores the previous actor when a controller changes residents', () => {
    const keys = { RIGHT: { isDown: true } };
    const first = residentAt(2, 2, 'first');
    const second = residentAt(1, 1, 'second');
    const controller = createSanctuaryMovement({
      scene: sceneWith(keys),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      resident: first,
      tuning: { speed: 100, maxDeltaMs: 100, collisionRadius: 0 },
    });

    controller.update(0, 100);
    expect(first.sprite.y).toBeLessThan(first.footprint.y);
    expect(first.shadow.scaleX).toBeLessThan(1);

    const handedOffFootprint = { ...first.footprint };
    controller.setResident(second);

    expect(first.footprint).toMatchObject(handedOffFootprint);
    expect(first.sprite.y).toBeCloseTo(handedOffFootprint.y);
    expect(first.label.y).toBeCloseTo(handedOffFootprint.y - 60);
    expect(first.shadow.scaleX).toBeCloseTo(1);
    expect(first.shadow.alpha).toBeCloseTo(1);
    expect(first.sprite.play.mock.lastCall[0]).toContain('-idle-');
    expect(controller.resident).toBe(second);
  });

  it('moves only non-excluded wanderers and stays bounded around home', () => {
    const selected = residentAt(1, 1, 'selected');
    const neighbour = residentAt(2, 2, 'neighbour');
    const selectedStart = { ...selected.footprint };
    const neighbourStart = { ...neighbour.footprint };
    const wanderers = createSanctuaryWanderers({
      scene: sceneWith(),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      residents: [selected, neighbour],
      excludeId: 'selected',
      tuning: {
        radius: 20,
        speed: 20,
        pauseMinMs: 0,
        pauseMaxMs: 0,
        maxDeltaMs: 1000,
        collisionRadius: 0,
        random: () => 0.25,
      },
    });

    expect(wanderers.update(0, 1000)).toBe(true);
    expect(selected.footprint).toMatchObject({ x: selectedStart.x, y: selectedStart.y });
    expect(Math.hypot(
      neighbour.footprint.x - neighbourStart.homeX,
      neighbour.footprint.y - neighbourStart.homeY,
    )).toBeLessThanOrEqual(20);
    expect(neighbour.footprint.y).not.toBe(neighbourStart.y);

    wanderers.destroy();
    expect(() => wanderers.destroy()).not.toThrow();
    expect(wanderers.update(1000, 16)).toBe(false);
  });

  it('keeps wander homes in logical space across views and transition gates', () => {
    const resident = residentAt(2, 2, 'wanderer');
    let blocked = true;
    const wanderers = createSanctuaryWanderers({
      scene: sceneWith(),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      residents: [resident],
      inputBlocked: () => blocked,
      tuning: {
        radius: 20,
        speed: 20,
        pauseMinMs: 0,
        pauseMaxMs: 0,
        maxDeltaMs: 1000,
        collisionRadius: 0,
        random: () => 0.25,
      },
    });
    const record = wanderers.records[0];
    const start = wanderers.getLogicalFootprint('wanderer');

    expect(wanderers.update(0, 1000)).toBe(false);
    expect(wanderers.getLogicalFootprint('wanderer')).toEqual(start);

    blocked = false;
    expect(wanderers.update(1000, 1000)).toBe(true);
    const moved = wanderers.getLogicalFootprint('wanderer');
    const homeOffset = projectVector(
      moved.col - record.home.col,
      moved.row - record.home.row,
    );
    expect(Math.hypot(homeOffset.x, homeOffset.y)).toBeLessThanOrEqual(20);

    const view = { yawDeg: -45, elevationStep: 1 };
    expect(wanderers.setView(view)).toBe(true);
    const expected = projectFootprint(moved.col, moved.row, TERRAIN.baseHeight, view);
    const expectedDirection = viewDirectionForWorldVector(
      record.lastWorldVector.col,
      record.lastWorldVector.row,
      view,
    );
    expect(wanderers.getLogicalFootprint('wanderer')).toEqual(moved);
    expect(record.footprint.x).toBeCloseTo(expected.x);
    expect(record.footprint.y).toBeCloseTo(expected.y);
    expect(record.direction).toBe(expectedDirection);
    expect(resident.logicalFootprint).toEqual(moved);
  });

  it('adopts the live controlled footprint when a wandered resident is unexcluded', () => {
    const first = residentAt(2, 2, 'first');
    const second = residentAt(3, 3, 'second');
    const wanderers = createSanctuaryWanderers({
      scene: sceneWith(),
      layer: { sort: vi.fn() },
      tiles: openTiles(7),
      residents: [first, second],
      excludeId: 'second',
      tuning: {
        radius: 20,
        speed: 20,
        pauseMinMs: 0,
        pauseMaxMs: 0,
        maxDeltaMs: 1000,
        collisionRadius: 0,
        random: () => 0.25,
      },
    });

    // `first` gets a presentation record, then direct control takes ownership
    // and publishes a different footprint object while that record is paused.
    wanderers.update(0, 1000);
    wanderers.setExcludedId('first');
    const liveLogical = {
      col: first.footprint.col + 0.125,
      row: first.footprint.row - 0.125,
    };
    const liveProjection = projectFootprint(
      liveLogical.col,
      liveLogical.row,
      TERRAIN.baseHeight,
    );
    const liveControlled = {
      ...first.footprint,
      ...liveLogical,
      ...liveProjection,
    };
    first.footprint = liveControlled;

    wanderers.setExcludedId('second');

    const resumed = wanderers.records.find((record) => record.resident === first);
    expect(resumed.footprint).toMatchObject({
      x: liveProjection.x,
      y: liveProjection.y,
      col: liveLogical.col,
      row: liveLogical.row,
    });
    expect(resumed.logical).toEqual(liveLogical);
    expect(first.footprint).toBe(resumed.footprint);
    expect(first.sprite.x).toBeCloseTo(liveProjection.x);
    const owningDepth = footprint(
      Math.round(resumed.footprint.col),
      Math.round(resumed.footprint.row),
    ).y;
    expect(first.sprite.getData('depth')).toBeCloseTo(
      Math.max(liveProjection.y, owningDepth) + 0.2,
    );
  });

  describe('A* pathfinding', () => {
    it('finds a direct path on a simple open grid', () => {
      const mask = [
        [true, true, true],
        [true, true, true],
        [true, true, true],
      ];
      const heights = [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ];
      const start = { col: 0, row: 0 };
      const end = { col: 2, row: 2 };
      const path = findPath(mask, heights, start, end);
      expect(path).toBeDefined();
      expect(path).not.toBeNull();
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual({ col: 1, row: 1 });
      expect(path[path.length - 1]).toEqual({ col: 2, row: 2 });
    });

    it('respects climb constraints (cliffs) and finds alternate path', () => {
      const mask = [
        [true, true, true],
        [true, true, true],
        [true, true, true],
      ];
      const heights = [
        [1, 1, 1],
        [1, 5, 1],
        [1, 1, 1],
      ];
      const start = { col: 0, row: 1 };
      const end = { col: 2, row: 1 };
      const path = findPath(mask, heights, start, end, { climbStep: 1 });
      expect(path).toBeDefined();
      expect(path).not.toBeNull();
      path.forEach(node => {
        expect(node).not.toEqual({ col: 1, row: 1 });
      });
      expect(path[path.length - 1]).toEqual({ col: 2, row: 1 });
    });

    it('returns null for unreachable targets', () => {
      const mask = [
        [true, false, true],
        [true, false, true],
        [true, false, true],
      ];
      const heights = [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ];
      const start = { col: 0, row: 1 };
      const end = { col: 2, row: 1 };
      const path = findPath(mask, heights, start, end);
      expect(path).toBeNull();
    });

    it('prevents corner cutting on diagonals', () => {
      const mask = [
        [true, false],
        [false, true],
      ];
      const heights = [
        [1, 1],
        [1, 1],
      ];
      const start = { col: 0, row: 0 };
      const end = { col: 1, row: 1 };
      const path = findPath(mask, heights, start, end);
      expect(path).toBeNull();
    });

    it('supports target range resolution', () => {
      const mask = [
        [true, true, true],
        [true, true, true],
        [true, true, true],
      ];
      const heights = [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ];
      const start = { col: 0, row: 0 };
      const end = { col: 2, row: 2 };
      const p1 = projectFootprint(1, 1, TERRAIN.baseHeight);
      const p2 = projectFootprint(2, 2, TERRAIN.baseHeight);
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);

      const path = findPath(mask, heights, start, end, { range: dist + 0.1 });
      expect(path).toBeDefined();
      expect(path).not.toBeNull();
      const lastNode = path[path.length - 1];
      const pLast = projectFootprint(lastNode.col, lastNode.row, TERRAIN.baseHeight);
      const finalDist = Math.hypot(pLast.x - p2.x, pLast.y - p2.y);
      expect(finalDist).toBeLessThanOrEqual(dist + 0.1);
    });
  });
});

describe('sanctuary flight altitude', () => {
  // High settleHz + large maxDeltaMs make altitude snap to its target in one
  // update, so assertions read clearly. climbSpeed/max are set per-test.
  const flightTuning = (overrides = {}) => ({
    speed: 0,
    maxDeltaMs: 1000,
    flight: {
      minAltitude: 0,
      maxAltitude: 100,
      takeoffAltitude: 40,
      climbSpeed: 60,
      settleHz: 1000,
      ...overrides,
    },
  });

  function flyer(keys) {
    return createSanctuaryMovement({
      scene: sceneWith(keys),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      resident: residentAt(2, 2),
      tuning: flightTuning(),
    });
  }

  it('starts grounded at zero altitude', () => {
    const controller = flyer({ R: { isDown: false }, Q: { isDown: false } });
    expect(controller.getAltitude()).toBe(0);
  });

  it('lifts off when flight is toggled, then climbs while ascending is held', () => {
    const keys = { R: { isDown: false }, Q: { isDown: false } };
    const controller = flyer(keys);

    controller.setFlying(true);
    controller.update(0, 1000);
    // Seeded take-off makes it leave the ground with no key pressed.
    expect(controller.getAltitude()).toBeCloseTo(40);

    keys.R.isDown = true;
    controller.update(1000, 1000);
    // Rises above take-off and clamps at the configured ceiling.
    expect(controller.getAltitude()).toBeGreaterThan(40);
    expect(controller.getAltitude()).toBeLessThanOrEqual(100);

    controller.update(2000, 1000);
    expect(controller.getAltitude()).toBeCloseTo(100);
  });

  it('descends while the descend key is held, clamped at the floor', () => {
    const keys = { R: { isDown: false }, Q: { isDown: false } };
    const controller = flyer(keys);
    controller.setFlying(true);
    keys.R.isDown = true;
    controller.update(0, 1000);
    controller.update(1000, 1000); // up at the ceiling

    keys.R.isDown = false;
    keys.Q.isDown = true;
    controller.update(2000, 1000);
    expect(controller.getAltitude()).toBeLessThan(100);
    controller.update(3000, 1000);
    controller.update(4000, 1000);
    expect(controller.getAltitude()).toBeCloseTo(0);
  });

  it('ignores altitude keys while grounded', () => {
    const keys = { R: { isDown: true }, Q: { isDown: false } };
    const controller = flyer(keys);
    controller.update(0, 1000);
    expect(controller.getAltitude()).toBe(0);
  });

  it('eases back to the ground when flight is toggled off', () => {
    const keys = { R: { isDown: true }, Q: { isDown: false } };
    const controller = flyer(keys);
    controller.setFlying(true);
    controller.update(0, 1000);
    expect(controller.getAltitude()).toBeGreaterThan(0);

    keys.R.isDown = false;
    controller.setFlying(false);
    controller.update(1000, 1000);
    expect(controller.getAltitude()).toBeCloseTo(0);
  });

  describe('setTargetAltitude', () => {
    // Slow settle so the climb takes several frames, which is the whole point
    // of asking for a target rather than snapping to it.
    function slowFlyer() {
      return createSanctuaryMovement({
        scene: sceneWith({ R: { isDown: false }, Q: { isDown: false } }),
        layer: { sort: vi.fn() },
        tiles: openTiles(),
        resident: residentAt(2, 2),
        tuning: { ...flightTuning(), flight: { ...flightTuning().flight, settleHz: 2.5 } },
      });
    }

    it('opens a gap between current and target, rather than closing it', () => {
      // setAltitude() teleports: both values land on the target in the same
      // frame, so nothing downstream ever sees a climb in progress.
      const snapped = slowFlyer();
      snapped.setAltitude(60);
      expect(snapped.getAltitude()).toBe(60);
      expect(snapped.getTargetAltitude()).toBe(60);

      const eased = slowFlyer();
      eased.setTargetAltitude(60);
      expect(eased.getTargetAltitude()).toBe(60);
      expect(eased.getAltitude()).toBe(0);
    });

    it('takes several frames to arrive, and gets there', () => {
      const controller = slowFlyer();
      controller.setTargetAltitude(60);

      controller.update(0, 100);
      const afterOneFrame = controller.getAltitude();
      expect(afterOneFrame).toBeGreaterThan(0);
      expect(afterOneFrame).toBeLessThan(60);

      for (let t = 100; t <= 4000; t += 100) controller.update(t, 100);
      expect(controller.getAltitude()).toBeCloseTo(60, 0);
    });

    it('marks the wyvern as flying so update() does not reset the target', () => {
      // update() forces targetAltitude back to the floor on every frame the
      // controller is not flying, so a climb requested from the ground has to
      // set isFlying or it is undone before it is ever seen.
      const controller = slowFlyer();
      controller.setTargetAltitude(60);
      expect(controller.isFlying).toBe(true);

      controller.update(0, 100);
      expect(controller.getTargetAltitude()).toBe(60);
    });

    it('lands, and stops flying, when asked for the floor', () => {
      const controller = slowFlyer();
      controller.setTargetAltitude(60);
      for (let t = 0; t <= 4000; t += 100) controller.update(t, 100);

      controller.setTargetAltitude(0);
      expect(controller.isFlying).toBe(false);
      for (let t = 4000; t <= 8000; t += 100) controller.update(t, 100);
      expect(controller.getAltitude()).toBeCloseTo(0, 0);
    });

    it('clamps to the configured ceiling and floor', () => {
      const controller = slowFlyer();
      controller.setTargetAltitude(9999);
      expect(controller.getTargetAltitude()).toBe(100);
      controller.setTargetAltitude(-50);
      expect(controller.getTargetAltitude()).toBe(0);
      controller.setTargetAltitude(Number.NaN);
      expect(controller.getTargetAltitude()).toBe(0);
    });
  });
});

describe('flight altitude drives the 3D takeoff/land bracket', () => {
  // The seam that was broken: the panel could set an altitude, but the model
  // never played takeoff or land because the value snapped. This drives the
  // real movement controller into the real state machine, which is the only
  // place the two agree on what "airborne" means.
  const MOTION = SANCTUARY.dragon3D.motion;

  function rig() {
    const controller = createSanctuaryMovement({
      scene: sceneWith({ R: { isDown: false }, Q: { isDown: false } }),
      layer: { sort: vi.fn() },
      tiles: openTiles(),
      resident: residentAt(2, 2),
      tuning: {
        speed: 0,
        maxDeltaMs: 100,
        flight: {
          minAltitude: 0, maxAltitude: 140, takeoffAltitude: 42, climbSpeed: 90, settleHz: 2.5,
        },
      },
    });
    const machine = createDragonMotion({ motion: MOTION, random: () => 1 });
    // One frame of the loop sanctuary3D.update() runs.
    const step = (ms = 16, time = 0) => {
      controller.update(time, ms);
      return machine.update({
        dtMs: ms,
        speed: 0,
        isFlying: controller.isFlying,
        altitude: controller.getAltitude(),
        targetAltitude: controller.getTargetAltitude(),
      });
    };
    return { controller, machine, step };
  }

  it('plays takeoff after an eased climb is requested', () => {
    const { controller, step } = rig();
    expect(step(16, 0).oneShot).toBe(null);

    controller.setTargetAltitude(80);
    const shots = [];
    for (let t = 0; t < 2000; t += 16) shots.push(step(16, t).oneShot);

    expect(shots).toContain('takeoff');
    expect(shots.filter((s) => s === 'takeoff').length).toBe(1);
  });

  it('climbs through the takeoff instead of arriving before it', () => {
    // Finding B, stated precisely: a snap still *fires* takeoff, but the model
    // is already at altitude on the frame the clip starts, so the climb it
    // animates has nothing left to cover. What the eased path buys is frames
    // spent actually travelling, which is what reads as a takeoff on screen.
    const snapped = rig();
    snapped.controller.setAltitude(80);
    let snappedClimbFrames = 0;
    for (let t = 0; t < 2000; t += 16) {
      const before = snapped.controller.getAltitude();
      snapped.step(16, t);
      if (snapped.controller.getAltitude() - before > 0.5) snappedClimbFrames += 1;
    }
    expect(snappedClimbFrames).toBe(0);

    const eased = rig();
    eased.controller.setTargetAltitude(80);
    let easedClimbFrames = 0;
    for (let t = 0; t < 2000; t += 16) {
      const before = eased.controller.getAltitude();
      eased.step(16, t);
      if (eased.controller.getAltitude() - before > 0.5) easedClimbFrames += 1;
    }
    // Roughly a second of climb at the configured settle rate.
    expect(easedClimbFrames).toBeGreaterThan(20);
  });

  it('plays land on the way back down', () => {
    const { controller, machine, step } = rig();
    controller.setTargetAltitude(80);
    for (let t = 0; t < 3000; t += 16) step(16, t);
    expect(machine.airborne).toBe(true);

    controller.setTargetAltitude(0);
    const shots = [];
    for (let t = 3000; t < 8000; t += 16) shots.push(step(16, t).oneShot);

    expect(shots).toContain('land');
    expect(machine.airborne).toBe(false);
  });
});
