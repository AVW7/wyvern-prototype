// Shared grid ↔ Three.js world transform for the 3D sanctuary diorama.
//
// The logical map is a grid of (col, row) cells, each with an integer height
// level. sanctuary3D.js renders it as a voxel diorama: this module is the one
// place that turns grid coordinates into world positions, so the tile mesh,
// decor, residents, and camera never drift apart from copy-pasted math.

// Voxel dimensions. TILE_SIZE is the footprint of one cell in world units;
// HEIGHT_SCALE is how many world units one height level adds vertically.
export const TILE_SIZE = 24;
export const HEIGHT_SCALE = 12;

/**
 * Grid cell → Three.js world position of the tile's *top surface*.
 * This is where things standing on the tile sit (decor, residents, camera
 * focus). `altitude` lifts above that surface (world units) for flight; 0 rests
 * on the ground.
 *
 * @param {number} col
 * @param {number} row
 * @param {number} height - tile height level
 * @param {number} cols - grid width (used to centre the map on the origin)
 * @param {number} rows - grid height
 * @param {number} [altitude=0] - world units above the tile surface
 * @returns {{x: number, y: number, z: number}}
 */
export function gridToWorld3D(col, row, height, cols, rows, altitude = 0) {
  return {
    x: (col - cols / 2) * TILE_SIZE,
    y: height * HEIGHT_SCALE + altitude,
    z: (row - rows / 2) * TILE_SIZE,
  };
}

/**
 * Y of a tile mesh's *centre*. BoxGeometry is centred on its origin, so a tile
 * of `height` levels sits with its centre at half its extruded height. Distinct
 * from gridToWorld3D's surface Y, which is the top face.
 * @param {number} height - tile height level
 */
export function tileCenterY(height) {
  return (height * HEIGHT_SCALE) / 2;
}

/** Inverse of the X mapping: world X → fractional grid column. */
export function worldToGridCol(x, cols) {
  return x / TILE_SIZE + cols / 2;
}

/** Inverse of the Z mapping: world Z → fractional grid row. */
export function worldToGridRow(z, rows) {
  return z / TILE_SIZE + rows / 2;
}
