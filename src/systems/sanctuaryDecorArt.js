// Base-only procedural prop art for the rotatable sanctuary exterior.
//
// The generic decorArt drawers remain single-view assets shared by Mission,
// Atlas, and Vault. These drawers instead construct each exterior prop from
// logical ground-plane and vertical pieces using the active sanctuary basis.
// Ground spreads therefore follow pitch/yaw through basis.col/basis.row while
// trunks, posts, and shards follow basis.height independently.
import { ISO } from '../config.js';
import {
  mixColor,
  polygon,
} from './draw.js';
import { projectionBasis } from './sanctuaryProjection.js';

const GROUND_ART_UNIT = ISO.tileWidth / 2;
const TAU = Math.PI * 2;

export const EXTERIOR_SANCTUARY_DECOR_TYPES = Object.freeze([
  'barredDoor',
  'tree',
  'flowers',
  'rock',
  'crystal',
  'glow',
  'arena',
  'nest',
  'obelisk',
]);

const EXTERIOR_TYPE_SET = new Set(EXTERIOR_SANCTUARY_DECOR_TYPES);

function createGeometry(x, y, s, basis) {
  const ground = (col, row) => ({
    x: (col * basis.col.x + row * basis.row.x) * s / GROUND_ART_UNIT,
    y: (col * basis.col.y + row * basis.row.y) * s / GROUND_ART_UNIT,
  });
  const vertical = (height) => ({
    x: basis.height.x * height * s / ISO.elevation,
    y: basis.height.y * height * s / ISO.elevation,
  });

  return {
    basis,
    s,
    point(col = 0, row = 0, height = 0) {
      const floor = ground(col, row);
      const lift = vertical(height);
      return { x: x + floor.x + lift.x, y: y + floor.y + lift.y };
    },
  };
}

function ellipseWorldPoints(
  geometry,
  col,
  row,
  radiusCol,
  radiusRow,
  rotation = 0,
  height = 0,
  segments = 16,
) {
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = i / segments * TAU;
    const localCol = Math.cos(angle) * radiusCol;
    const localRow = Math.sin(angle) * radiusRow;
    points.push(geometry.point(
      col + localCol * cosRotation - localRow * sinRotation,
      row + localCol * sinRotation + localRow * cosRotation,
      height,
    ));
  }
  return points;
}

function fillWorldEllipse(
  ctx,
  geometry,
  col,
  row,
  radiusCol,
  radiusRow,
  rotation,
  height,
  fill,
  stroke = null,
  lineWidth = 1,
) {
  polygon(
    ctx,
    ellipseWorldPoints(
      geometry,
      col,
      row,
      radiusCol,
      radiusRow,
      rotation,
      height,
    ),
    fill,
    stroke,
    lineWidth,
  );
}

function strokeWorldLoop(ctx, points, color, lineWidth) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function screenBar(ctx, from, to, width, fill) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ox = -dy / length * width / 2;
  const oy = dx / length * width / 2;
  polygon(ctx, [
    { x: from.x + ox, y: from.y + oy },
    { x: to.x + ox, y: to.y + oy },
    { x: to.x - ox, y: to.y - oy },
    { x: from.x - ox, y: from.y - oy },
  ], fill);
}

function diamondMark(ctx, center, radius, fill, stroke = null) {
  polygon(ctx, [
    { x: center.x, y: center.y - radius },
    { x: center.x + radius, y: center.y },
    { x: center.x, y: center.y + radius },
    { x: center.x - radius, y: center.y },
  ], fill, stroke);
}

function drawProjectedShadow(
  ctx,
  geometry,
  radiusCol,
  radiusRow,
  rotation = 0,
  alpha = 0.24,
  offsetCol = 2.4,
  offsetRow = -1.4,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  fillWorldEllipse(
    ctx,
    geometry,
    offsetCol,
    offsetRow,
    radiusCol,
    radiusRow,
    rotation,
    0,
    '#05070b',
  );
  ctx.restore();
}

function prismCorners(col, row, halfCol, halfRow) {
  return [
    { col: col - halfCol, row: row - halfRow },
    { col: col + halfCol, row: row - halfRow },
    { col: col + halfCol, row: row + halfRow },
    { col: col - halfCol, row: row + halfRow },
  ];
}

function visibleEdges(geometry, corners) {
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    const midpoint = geometry.point(
      (corner.col + next.col) / 2,
      (corner.row + next.row) / 2,
      0,
    );
    return { index, corner, next, screenY: midpoint.y };
  }).sort((a, b) => b.screenY - a.screenY || a.index - b.index).slice(0, 2);
}

function drawColumn(
  ctx,
  geometry,
  {
    col = 0,
    row = 0,
    halfCol = 2,
    halfRow = 2,
    height = 12,
    faceColors = ['#665044', '#49362f', '#352923', '#7a5a47'],
    topColor = '#8e6a52',
    outline = '#211916',
  } = {},
) {
  const corners = prismCorners(col, row, halfCol, halfRow);
  const faces = visibleEdges(geometry, corners).reverse();
  faces.forEach(({ index, corner, next }) => {
    polygon(ctx, [
      geometry.point(corner.col, corner.row, height),
      geometry.point(next.col, next.row, height),
      geometry.point(next.col, next.row, 0),
      geometry.point(corner.col, corner.row, 0),
    ], faceColors[index % faceColors.length], outline, Math.max(1, geometry.s));
  });
  polygon(
    ctx,
    corners.map(({ col: c, row: r }) => geometry.point(c, r, height)),
    topColor,
    outline,
    Math.max(1, geometry.s),
  );
}

function drawBarredDoor(ctx, geometry) {
  // This gate separates its cell from row - 1, so its authored plane runs
  // along the world's col axis. It turns from a receding diagonal at yaw 0 to
  // a broad horizontal face at yaw +45 instead of behaving like a billboard.
  drawProjectedShadow(ctx, geometry, 13, 4.5, 0, 0.2, 2.2, -1.8);
  const left = -10;
  const right = 10;
  const bottomLeft = geometry.point(left, 0, 1);
  const bottomRight = geometry.point(right, 0, 1);
  const topLeft = geometry.point(left, 0, 29);
  const topRight = geometry.point(right, 0, 29);

  polygon(ctx, [topLeft, topRight, bottomRight, bottomLeft], '#17191c', '#291e1b', 2);
  // A real back edge gives the frame visible thickness when the view turns.
  polygon(ctx, [
    geometry.point(left, -2.4, 32),
    geometry.point(right, -2.4, 32),
    topRight,
    topLeft,
  ], '#8d563b', '#3d2b25');
  drawColumn(ctx, geometry, {
    col: left,
    halfCol: 1.7,
    halfRow: 2.1,
    height: 31,
    faceColors: ['#8d563b', '#6e422f', '#3d2b25', '#a46a48'],
    topColor: '#b57950',
  });
  drawColumn(ctx, geometry, {
    col: right,
    halfCol: 1.7,
    halfRow: 2.1,
    height: 31,
    faceColors: ['#8d563b', '#6e422f', '#3d2b25', '#a46a48'],
    topColor: '#b57950',
  });

  for (let col = -7; col <= 7; col += 3.5) {
    screenBar(ctx, geometry.point(col, 0.35, 2), geometry.point(col, 0.35, 27), 1.7, '#647078');
  }
  screenBar(ctx, geometry.point(-8.5, 0.4, 14), geometry.point(8.5, 0.4, 14), 2, '#424c53');
  diamondMark(ctx, geometry.point(5.5, 0.5, 12), 1.8, '#d59d58', '#61462c');
}

function drawTree(ctx, geometry, variant) {
  drawProjectedShadow(ctx, geometry, 14, 8, 0.36, 0.28, 3.2, -1.7);
  drawColumn(ctx, geometry, {
    col: -0.5,
    row: 0.8,
    halfCol: 2.2,
    halfRow: 1.8,
    height: 18,
    faceColors: ['#79513a', '#3e2b21', '#2a211c', '#5b3d2d'],
    topColor: '#8b6044',
  });

  const shift = (variant % 3) - 1;
  const clusters = [
    { col: -3 + shift, row: 1, h: 18, rc: 15, rr: 9, rot: 0.2, color: '#285f3a' },
    { col: 3, row: -1 - shift, h: 25, rc: 13, rr: 8, rot: -0.45, color: '#347d47' },
    { col: -2, row: -3, h: 31, rc: 10, rr: 7, rot: 0.65, color: '#296b3e' },
    { col: 2 + shift, row: 1, h: 36, rc: 7, rr: 5, rot: -0.2, color: '#1e5133' },
  ];
  clusters.forEach((cluster) => {
    fillWorldEllipse(
      ctx,
      geometry,
      cluster.col,
      cluster.row,
      cluster.rc,
      cluster.rr,
      cluster.rot,
      cluster.h,
      cluster.color,
      '#153421',
      1,
    );
  });
  fillWorldEllipse(ctx, geometry, -5, -2, 4, 2, 0.4, 31, '#78b95b');
  fillWorldEllipse(ctx, geometry, 6, 0, 3.5, 2, -0.3, 24, '#5da54f');
}

const FLOWER_OFFSETS = Object.freeze([
  [-8, -2], [-5, 4], [-2, -5], [1, 2], [4, -3], [7, 3], [9, -1],
]);

function drawFlowers(ctx, geometry, variant) {
  drawProjectedShadow(ctx, geometry, 10, 5, -0.28, 0.13, 1.5, -0.8);
  const petals = ['#ffd1e8', '#fff0a6', '#cdb7ff', '#ef8aa8'];
  FLOWER_OFFSETS.forEach(([col, row], index) => {
    const height = 4 + index % 3;
    screenBar(ctx, geometry.point(col, row, 0), geometry.point(col, row, height), 1, '#326f3b');
    const head = geometry.point(col, row, height);
    const colPetal = geometry.point(col + 1.5, row, height);
    const rowPetal = geometry.point(col, row + 1.5, height);
    polygon(ctx, [
      { x: head.x * 2 - colPetal.x, y: head.y * 2 - colPetal.y },
      rowPetal,
      colPetal,
      { x: head.x * 2 - rowPetal.x, y: head.y * 2 - rowPetal.y },
    ], petals[(variant + index) % petals.length]);
    diamondMark(ctx, head, 0.8, '#fff4c8');
  });
}

function drawRock(ctx, geometry, colors) {
  drawProjectedShadow(ctx, geometry, 12, 7, 0.18, 0.23, 2.8, -1.2);
  const base = [
    { col: -10, row: -3 }, { col: -5, row: -8 }, { col: 3, row: -7 },
    { col: 10, row: -1 }, { col: 8, row: 6 }, { col: -2, row: 8 },
    { col: -9, row: 4 },
  ];
  const stone = colors.rock;
  const light = mixColor(stone, '#ffffff', 0.28);
  const dark = mixColor(stone, '#000000', 0.38);
  const peak = geometry.point(-2, -1, 16);
  const facets = base.map((corner, index) => {
    const next = base[(index + 1) % base.length];
    const midpoint = geometry.point(
      (corner.col + next.col) / 2,
      (corner.row + next.row) / 2,
      0,
    );
    return { corner, next, index, screenY: midpoint.y };
  }).sort((a, b) => a.screenY - b.screenY);
  facets.forEach(({ corner, next, index }) => {
    polygon(ctx, [
      geometry.point(corner.col, corner.row, 0),
      geometry.point(next.col, next.row, 0),
      peak,
    ], index % 3 === 0 ? light : index % 2 ? stone : dark, '#151820');
  });
  polygon(ctx, [
    peak,
    geometry.point(2, -3, 9),
    geometry.point(7, 1, 4),
    geometry.point(1, 4, 7),
  ], mixColor(stone, '#ffffff', 0.12), '#151820');
  if (colors.decor.some((type) => ['tree', 'reeds', 'flowers'].includes(type))) {
    screenBar(ctx, geometry.point(-5, -2, 11), geometry.point(2, -2, 9), 2, '#719456');
    screenBar(ctx, geometry.point(1, 0, 8), geometry.point(5, 1, 5), 1.5, '#4f7b43');
  }
}

function drawCrystalShard(ctx, geometry, shard, index) {
  const { col, row, height, width, leanCol = 0, leanRow = 0 } = shard;
  const base = [
    geometry.point(col - width, row, 0),
    geometry.point(col, row - width * 0.7, 0),
    geometry.point(col + width, row, 0),
    geometry.point(col, row + width * 0.7, 0),
  ];
  const tip = geometry.point(col + leanCol, row + leanRow, height);
  const tones = ['#2e91a8', '#45b7c4', '#9affef', '#246f88'];
  base.forEach((point, faceIndex) => {
    polygon(ctx, [point, base[(faceIndex + 1) % base.length], tip],
      tones[(faceIndex + index) % tones.length], '#10212b');
  });
  polygon(ctx, [
    tip,
    base[(index + 1) % base.length],
    geometry.point(col + leanCol * 0.25, row + leanRow * 0.25, height * 0.62),
  ], '#d7ffff');
}

function drawCrystal(ctx, geometry, variant) {
  drawProjectedShadow(ctx, geometry, 13, 7, -0.35, 0.26, 2.5, -1.5);
  ctx.save();
  ctx.shadowColor = '#9affef';
  ctx.shadowBlur = Math.max(2, 4 * geometry.s);
  [
    { col: -1, row: 0, height: 31, width: 4, leanCol: variant % 2 ? 2 : -1, leanRow: -1 },
    { col: -8, row: 3, height: 20, width: 3, leanCol: -1, leanRow: 1 },
    { col: 7, row: -2, height: 18, width: 3, leanCol: 2, leanRow: 0 },
    { col: 4, row: 5, height: 14, width: 2.5, leanCol: 0, leanRow: 1 },
  ].forEach((shard, index) => drawCrystalShard(ctx, geometry, shard, index));
  ctx.restore();
  diamondMark(ctx, geometry.point(-1, 0, 27), 1.2, '#f1ffff');
}

function drawGlow(ctx, geometry, variant) {
  drawProjectedShadow(ctx, geometry, 9, 5, 0.5, 0.11, 1.4, -0.9);
  const glow = variant % 2 ? '#9bf8ff' : '#c995ff';
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = Math.max(4, 8 * geometry.s);
  ctx.globalAlpha = 0.22;
  fillWorldEllipse(ctx, geometry, -1, 1, 11, 7, 0.3, 7, glow);
  ctx.globalAlpha = 0.46;
  fillWorldEllipse(ctx, geometry, -1, 1, 6, 4, 0.3, 10, glow);
  ctx.globalAlpha = 1;
  diamondMark(ctx, geometry.point(-1, 1, 12), 3, '#f7ecff');
  diamondMark(ctx, geometry.point(4, -3, 17), 1.3, '#ffffff');
  diamondMark(ctx, geometry.point(-5, 2, 9), 1, glow);
  ctx.restore();
}

function drawArena(ctx, geometry) {
  drawProjectedShadow(ctx, geometry, 16, 11, 0.12, 0.22, 2.6, -1.3);
  fillWorldEllipse(ctx, geometry, 0, 0, 14, 10, 0.12, 0, '#434b5c', '#9aa7b8', 1.4);
  fillWorldEllipse(ctx, geometry, 0, 0, 8, 5.5, 0.12, 0.5, '#5a6478', '#303746');
  // Fixed world-space gate/broken tiers make the arena visibly turn with yaw.
  for (let index = 0; index < 10; index++) {
    if (index === 2 || index === 3) continue;
    const angle = index / 10 * TAU + 0.12;
    const col = Math.cos(angle) * 12;
    const row = Math.sin(angle) * 8.5;
    drawColumn(ctx, geometry, {
      col,
      row,
      halfCol: 1.3,
      halfRow: 1.3,
      height: 3 + index % 3,
      faceColors: ['#77766f', '#555861', '#464953', '#8d8c83'],
      topColor: '#9aa7b8',
      outline: '#343842',
    });
  }
  screenBar(ctx, geometry.point(2, 7, 0.8), geometry.point(8, 5, 0.8), 1.5, '#b6bec9');
}

function drawNest(ctx, geometry) {
  drawProjectedShadow(ctx, geometry, 16, 9, -0.18, 0.2, 2.2, -1.2);
  const tones = ['#4b3127', '#644431', '#7a5337', '#9e6b3d'];
  for (let index = 0; index < 6; index++) {
    const points = ellipseWorldPoints(
      geometry,
      0,
      0,
      15 - index * 1.25,
      8 - index * 0.65,
      -0.18 + index * 0.035,
      index * 0.45,
      18,
    );
    strokeWorldLoop(ctx, points, tones[index % tones.length], Math.max(1, (3 - index * 0.2) * geometry.s));
  }
  [
    [-12, -2, 9, 4], [-8, 6, 10, -5], [-4, -7, 12, 1],
    [-10, 2, 7, -6],
  ].forEach(([fromCol, fromRow, toCol, toRow], index) => {
    screenBar(
      ctx,
      geometry.point(fromCol, fromRow, 2 + index * 0.2),
      geometry.point(toCol, toRow, 2 + index * 0.2),
      1.4,
      index % 2 ? '#c28c50' : '#9e6b3d',
    );
  });
}

function drawObelisk(ctx, geometry, variant) {
  drawProjectedShadow(ctx, geometry, 11, 7, 0.42, 0.29, 3, -1.5);
  drawColumn(ctx, geometry, {
    halfCol: 7,
    halfRow: 5,
    height: 4,
    faceColors: ['#27243a', '#171725', '#0f0e18', '#393149'],
    topColor: '#554568',
    outline: '#0c0b13',
  });

  const base = prismCorners(0, 0, 5.5, 4);
  const shoulder = prismCorners(0, 0, 4.3, 3.1);
  const faces = visibleEdges(geometry, base).reverse();
  const faceColors = ['#3b334d', '#171725', '#10101b', '#27243a'];
  faces.forEach(({ index, corner, next }) => {
    const shoulderCorner = shoulder[index];
    const shoulderNext = shoulder[(index + 1) % shoulder.length];
    polygon(ctx, [
      geometry.point(corner.col, corner.row, 3),
      geometry.point(next.col, next.row, 3),
      geometry.point(shoulderNext.col, shoulderNext.row, 29),
      geometry.point(shoulderCorner.col, shoulderCorner.row, 29),
    ], faceColors[index], '#0c0b13');
  });
  const tip = geometry.point(variant % 2 ? 1 : -1, -0.5, 37);
  shoulder.forEach((corner, index) => {
    const next = shoulder[(index + 1) % shoulder.length];
    polygon(ctx, [
      geometry.point(corner.col, corner.row, 29),
      geometry.point(next.col, next.row, 29),
      tip,
    ], index % 2 ? '#3b3150' : '#6f5a94', '#0c0b13');
  });

  const rune = variant % 2 ? '#8ff4ff' : '#af8cff';
  const front = visibleEdges(geometry, base)[0];
  const midCol = (front.corner.col + front.next.col) / 2;
  const midRow = (front.corner.row + front.next.row) / 2;
  ctx.save();
  ctx.shadowColor = rune;
  ctx.shadowBlur = Math.max(2, 4 * geometry.s);
  screenBar(ctx, geometry.point(midCol, midRow, 10), geometry.point(midCol, midRow, 21), 2.2, rune);
  const edgeCol = (front.next.col - front.corner.col) * 0.28;
  const edgeRow = (front.next.row - front.corner.row) * 0.28;
  screenBar(
    ctx,
    geometry.point(midCol - edgeCol, midRow - edgeRow, 15),
    geometry.point(midCol + edgeCol, midRow + edgeRow, 15),
    1.8,
    rune,
  );
  ctx.restore();
}

const EXTERIOR_DRAWERS = Object.freeze({
  barredDoor: (ctx, geometry) => drawBarredDoor(ctx, geometry),
  tree: (ctx, geometry, variant) => drawTree(ctx, geometry, variant),
  flowers: (ctx, geometry, variant) => drawFlowers(ctx, geometry, variant),
  rock: (ctx, geometry, variant, colors) => drawRock(ctx, geometry, colors),
  crystal: (ctx, geometry, variant) => drawCrystal(ctx, geometry, variant),
  glow: (ctx, geometry, variant) => drawGlow(ctx, geometry, variant),
  arena: (ctx, geometry) => drawArena(ctx, geometry),
  nest: (ctx, geometry) => drawNest(ctx, geometry),
  obelisk: (ctx, geometry, variant) => drawObelisk(ctx, geometry, variant),
});

/**
 * Draw an exterior sanctuary prop from active-view ground and height pieces.
 * This intentionally has a separate name/registry from drawDecor so Base can
 * rotate without changing any generic scene's established raster contract.
 */
export function drawProjectedSanctuaryDecor(
  ctx,
  type,
  x,
  y,
  s,
  variant,
  colors,
  view = {},
) {
  if (!EXTERIOR_TYPE_SET.has(type)) {
    throw new Error(`drawProjectedSanctuaryDecor: no exterior drawer for "${type}"`);
  }
  if (!colors) {
    throw new Error(`drawProjectedSanctuaryDecor: missing biome colors for "${type}"`);
  }

  const basis = view?.col && view?.row && view?.height
    ? view
    : projectionBasis(view);
  const geometry = createGeometry(x, y, s, basis);
  ctx.save();
  ctx.lineWidth = Math.max(1, s);
  ctx.lineJoin = 'miter';
  EXTERIOR_DRAWERS[type](ctx, geometry, variant, colors);
  ctx.restore();

  return {
    type,
    yawDeg: basis.yawDeg,
    elevationStep: basis.elevationStep,
    groundYScale: basis.groundYScale,
    heightScale: basis.heightScale,
  };
}
