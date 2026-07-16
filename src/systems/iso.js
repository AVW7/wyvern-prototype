// Isometric coordinate helpers + depth sorting.
// Phaser's world is screen-space; these convert grid <-> screen so you can think
// in tile coordinates (col, row) and let the math place things on the diamond.
import { ISO } from '../config.js';

// Grid cell (col, row) -> screen pixel (x, y) at the tile's top-center.
export function gridToScreen(col, row) {
  const x = ISO.originX + (col - row) * (ISO.tileWidth / 2);
  const y = ISO.originY + (col + row) * (ISO.tileHeight / 2);
  return { x, y };
}

// Screen pixel -> nearest grid cell. Handy for click-to-move later.
export function screenToGrid(x, y) {
  const dx = x - ISO.originX;
  const dy = y - ISO.originY;
  const col = Math.round((dx / (ISO.tileWidth / 2) + dy / (ISO.tileHeight / 2)) / 2);
  const row = Math.round((dy / (ISO.tileHeight / 2) - dx / (ISO.tileWidth / 2)) / 2);
  return { col, row };
}

// Painter's-algorithm depth sort: order children by their 'depth' data value
// (fall back to y). Objects lower on screen draw on top, so a wyvern in front
// of a raised tile correctly overlaps it. Call this after anything moves.
function depthOf(obj) {
  const d = obj.getData ? obj.getData('depth') : null;
  return d != null ? d : obj.y;
}

export function sortByDepth(layer) {
  layer.sort('_none', (a, b) => depthOf(a) - depthOf(b));
}
