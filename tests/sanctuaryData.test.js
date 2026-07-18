import { describe, expect, it } from 'vitest';
import {
  buildSanctuaryExterior,
  buildSanctuaryInterior,
  INTERACTIONS,
  RESIDENT_SPOTS,
} from '../src/data/sanctuary.js';
import { sanctuaryBounds } from '../src/systems/sanctuaryRender.js';
import { createWalkableMask } from '../src/systems/sanctuaryMovement.js';

describe('sanctuary free-roam data', () => {
  it('keeps stable, unique interaction ids on reachable exterior cells', () => {
    const world = buildSanctuaryExterior();
    const ids = world.interactions.map((target) => target.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(world.interactions).toEqual(INTERACTIONS.outside);
    expect(world.interactions.length).toBeGreaterThanOrEqual(5);

    world.interactions.forEach((target) => {
      const cell = world.tiles[target.row]?.[target.col];
      expect(cell, target.id).toBeTruthy();
      expect(cell.blocked, target.id).toBe(false);
      expect(cell.walkable, target.id).not.toBe(false);
      if (target.propType) expect(cell.decor?.type, target.id).toBe(target.propType);
    });
  });

  it('seats every exterior resident on a walkable authored cell', () => {
    const { tiles } = buildSanctuaryExterior();

    RESIDENT_SPOTS.outside.forEach(({ col, row }) => {
      expect(tiles[row]?.[col]).toBeTruthy();
      expect(tiles[row][col].blocked).toBe(false);
      expect(tiles[row][col].walkable).not.toBe(false);
    });
  });

  it('keeps every initial resident and landmark on one reachable component', () => {
    const world = buildSanctuaryExterior();
    const mask = createWalkableMask(world.tiles);
    const start = RESIDENT_SPOTS.outside[0];
    const queue = [start];
    const visited = new Set([`${start.col},${start.row}`]);

    while (queue.length > 0) {
      const current = queue.shift();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
        const col = current.col + dc;
        const row = current.row + dr;
        const key = `${col},${row}`;
        if (!mask[row]?.[col] || visited.has(key)) return;
        visited.add(key);
        queue.push({ col, row });
      });
    }

    RESIDENT_SPOTS.outside.forEach((spot, index) => {
      expect(visited.has(`${spot.col},${spot.row}`), `resident spot ${index}`).toBe(true);
    });
    world.interactions.forEach((target) => {
      expect(visited.has(`${target.col},${target.row}`), target.id).toBe(true);
    });
  });

  it('exports finite camera bounds without changing the Vault data contract', () => {
    const outside = buildSanctuaryExterior();
    const inside = buildSanctuaryInterior();
    const bounds = sanctuaryBounds(outside.tiles);

    expect(bounds.minX).toBeLessThan(bounds.maxX);
    expect(bounds.minY).toBeLessThan(bounds.maxY);
    Object.values(bounds).forEach((value) => expect(Number.isFinite(value)).toBe(true));
    expect(inside.interactions).toEqual([]);
    expect(inside.tiles).toHaveLength(inside.rows);
  });
});
