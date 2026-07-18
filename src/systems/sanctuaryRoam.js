// Idle roaming for sanctuary residents. Given the hand-authored grid and the
// resident handles from sanctuaryRender, each resident hops from tile to tile:
// pick a random walkable neighbour, glide onto it (riding the step's elevation
// up or down), pause, repeat. Cliffs taller than climbStep, holes (null cells)
// and the grid edge are simply never chosen as targets, so a resident turns
// back and wanders around them — no pathing or collision resolution needed.
//
// Sanctuary-only, like the rest of sanctuaryRender: the mission layer keeps its
// own movement. Depth stays on the ground-plane footprint (matching the tiles),
// so riding a step never breaks occlusion.
import { ISO, TERRAIN } from '../config.js';
import { gridToScreen } from './iso.js';

// Props a resident won't stand on, so it doesn't end up inside a tree trunk or
// clipped through the vault gate. Flat scatter (flowers, glow) stays walkable.
const SOLID_DECOR = new Set(['tree', 'rock', 'crystal', 'barredDoor', 'obelisk', 'pillar']);

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const easeInOut = (t) => t * t * (3 - 2 * t);

// Ground-plane footprint (diamond centre) of a cell, and the pixels its top
// face rises above that plane — same math the tiles and mission wyvern use.
const footprint = (col, row) => {
  const s = gridToScreen(col, row);
  return { x: s.x, y: s.y + ISO.tileHeight / 2 };
};
const liftOf = (cell) => (cell.height - TERRAIN.baseHeight) * ISO.elevation;

/**
 * @param tiles      the sanctuary grid ({tiles[row][col]}, cells may be null)
 * @param residents  handles from spawnSanctuaryResidents (each has col/row/
 *                   phase and place(gx, footY, lift, bob, faceLeft))
 * @param opts       SANCTUARY.roam plus bobAmplitude
 * @returns {{ update(delta) }}
 */
export function createSanctuaryRoam(tiles, residents, opts) {
  const {
    tileMoveMs, pauseMinMs, pauseMaxMs, climbStep, bobSpeed, bobAmplitude,
  } = opts;

  const inBounds = (c, r) => r >= 0 && r < tiles.length && c >= 0 && c < tiles[r].length;
  const cellAt = (c, r) => (inBounds(c, r) ? tiles[r][c] : null);
  const walkable = (c, r) => {
    const cell = cellAt(c, r);
    return !!cell && !(cell.decor && SOLID_DECOR.has(cell.decor.type));
  };
  const randPause = () => pauseMinMs + Math.random() * (pauseMaxMs - pauseMinMs);

  const state = residents.map((res) => ({
    res,
    fromCol: res.col,
    fromRow: res.row,
    toCol: res.col,
    toRow: res.row,
    t: 1, // 1 = arrived / idle at `to`
    pause: randPause(),
  }));

  // Choose a reachable neighbour: walkable and within one climbStep of the
  // current top face (both up and down, so a resident doesn't leap off ledges).
  const pickTarget = (s) => {
    const here = cellAt(s.toCol, s.toRow);
    const options = NEIGHBORS
      .map(([dc, dr]) => [s.toCol + dc, s.toRow + dr])
      .filter(([c, r]) => walkable(c, r)
        && Math.abs(cellAt(c, r).height - here.height) <= climbStep);
    if (!options.length) return false;
    const [c, r] = options[Math.floor(Math.random() * options.length)];
    s.fromCol = s.toCol;
    s.fromRow = s.toRow;
    s.toCol = c;
    s.toRow = r;
    s.t = 0;
    return true;
  };

  return {
    update(delta) {
      for (const s of state) {
        s.res.phase += delta * bobSpeed;
        const bob = Math.sin(s.res.phase) * bobAmplitude;

        if (s.t < 1) {
          s.t = Math.min(1, s.t + delta / tileMoveMs);
          const a = footprint(s.fromCol, s.fromRow);
          const b = footprint(s.toCol, s.toRow);
          const la = liftOf(cellAt(s.fromCol, s.fromRow));
          const lb = liftOf(cellAt(s.toCol, s.toRow));
          const e = easeInOut(s.t);
          const gx = a.x + (b.x - a.x) * e;
          const gy = a.y + (b.y - a.y) * e;
          s.res.place(gx, gy, la + (lb - la) * e, bob, b.x < a.x);
          if (s.t >= 1) {
            s.res.col = s.toCol;
            s.res.row = s.toRow;
            s.pause = randPause();
          }
        } else {
          const p = footprint(s.toCol, s.toRow);
          s.res.place(p.x, p.y, liftOf(cellAt(s.toCol, s.toRow)), bob, null);
          s.pause -= delta;
          if (s.pause <= 0 && !pickTarget(s)) s.pause = pauseMinMs;
        }
      }
    },
  };
}
