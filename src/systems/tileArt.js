// Procedural isometric tile renderer, ported from the isometric-world-builder
// HD prototype. Pure canvas drawing: every function takes an explicit ctx and
// returns nothing, so Preload can bake the output into a Phaser texture.
//
// The original redrew tiles live each frame and keyed its detail off world
// coordinates. We bake instead, so one texture is shared by every tile of the
// same biome — detail keys off the *variant* index via the `rand(salt)`
// closure, and terrain.js scatters variants across the map to hide repeats.
//
// Layer order (back to front) — each pass assumes the previous one ran:
//   sidewalls -> strata -> top face -> surface texture -> lit rim
import { BIOMES } from '../data/biomes.js';
import {
  rect, polygon, mixColor, alphaColor, pixelSize, topDiamond, clipDiamond,
  randomPointInDiamond, lerp, clamp,
} from './draw.js';

// Texture key for a baked tile. Preload bakes under these keys and MissionScene
// looks them up — keep both sides going through this function.
export function tileTextureKey(biome, variant, height) {
  return `iso-tile-${biome}-${variant}-h${height}`;
}

// Canvas size needed to hold one tile at the given height. Raised tiles grow
// downward: the top face stays put and the sidewalls extend below it.
export function tileTextureSize({
  tileWidth, tileHeight, elevation, height, scale = 1,
}) {
  return {
    width: Math.ceil(tileWidth * scale),
    height: Math.ceil(tileHeight * scale + height * elevation * scale),
  };
}

// Draws one complete tile. The top face's top vertex lands at local y=0 and
// its center at (width/2, tileHeight*scale/2), so callers can place the sprite
// with origin (0.5, 0) at the grid point regardless of height.
export function drawIsoTile(ctx, {
  biome, variant = 0, height = 0, tileWidth, tileHeight, elevation, scale = 1, rand, overlay = null,
}) {
  const colors = BIOMES[biome];
  if (!colors) throw new Error(`drawIsoTile: unknown biome "${biome}"`);

  const tw = tileWidth * scale;
  const th = tileHeight * scale;
  const depth = height * elevation * scale;
  const d = topDiamond(tw / 2, th / 2, tw, th);
  const stroke = Math.max(1, scale);

  if (depth > 0) {
    drawSidewalls(ctx, d, depth, colors, stroke, scale);
    drawSideStrata(ctx, d, depth, colors, scale, rand);
  }

  const topGradient = ctx.createLinearGradient(d.l.x, d.t.y, d.r.x, d.b.y);
  topGradient.addColorStop(0, mixColor(colors.top, colors.light, 0.26));
  topGradient.addColorStop(0.5, variant % 2 ? colors.top : mixColor(colors.top, colors.light, 0.08));
  topGradient.addColorStop(1, mixColor(colors.top, colors.dark, 0.18));
  polygon(ctx, [d.t, d.r, d.b, d.l], topGradient, colors.outline, stroke);

  drawTopTexture(ctx, { biome, d, colors, tw, th, scale, rand });
  drawTopRim(ctx, { biome, d, colors, scale, rand });

  if (overlay) {
    const drawOverlay = TILE_OVERLAYS[overlay];
    if (!drawOverlay) throw new Error(`drawIsoTile: unknown overlay "${overlay}"`);
    drawOverlay(ctx, { d, depth, s: scale });
  }
}

const PROJECTED_EPSILON = 1e-7;

function lerpPoint(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

function clipPolygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.clip();
}

function clipTopFace(ctx, d) {
  if (d.points) clipPolygon(ctx, d.points);
  else clipDiamond(ctx, d);
}

function randomPointOnTop(rand, d, tileWidth, tileHeight, salt, inset) {
  if (!d.points) {
    return randomPointInDiamond(rand, d, tileWidth, tileHeight, salt, inset);
  }
  // Bilinear sampling respects endpoint rectangles as well as the default
  // diamond/parallelogram. `inset` retains the old meaning: maximum distance
  // from the face centre as a share of the full face extent.
  const requestedInset = Number.isFinite(inset) ? inset : 0.43;
  const extent = Math.min(0.49, Math.max(0, requestedInset));
  const u = 0.5 + (rand(salt) * 2 - 1) * extent;
  const v = 0.5 + (rand(salt + 1) * 2 - 1) * extent;
  const [top, right, bottom, left] = d.points;
  const upper = lerpPoint(top, right, u);
  const lower = lerpPoint(left, bottom, u);
  return lerpPoint(upper, lower, v);
}

function finiteProjectedPoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must be a finite projected point.`);
  }
  return { x: point.x, y: point.y };
}

function projectedQuadPoints(quad) {
  const source = Array.isArray(quad) ? quad : quad?.points;
  if (!Array.isArray(source) || source.length !== 4) {
    throw new TypeError('A projected tile quad requires exactly four points.');
  }
  return source.map((point, index) => finiteProjectedPoint(point, `quad[${index}]`));
}

function signedDoubleArea(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - point.y * next.x;
  }, 0);
}

function projectedShapeKey(points, wallOffset) {
  const origin = points[0];
  const values = points.flatMap((point) => [
    Math.round((point.x - origin.x) * 1000),
    Math.round((point.y - origin.y) * 1000),
  ]).concat([
    Math.round(wallOffset.x * 1000),
    Math.round(wallOffset.y * 1000),
  ]);
  // FNV-1a keeps translation-equivalent projected cells on one short cache
  // key without depending on browser-specific floating-point string output.
  let hash = 0x811c9dc5;
  for (const char of values.join(',')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Resolve the canvas and visible-side geometry for an arbitrary projected cell
 * quad. Points must follow projectCellQuad's stable corner order. The return
 * offsets place the canvas relative to the quad's first/reference corner.
 *
 * A side is visible only when its outward normal faces the downward block
 * extrusion. This naturally produces two walls for the default diamond and
 * one wall at either +/-45 degree endpoint; edge-on faces are omitted.
 */
export function projectedTileGeometry(quad, wallOffset = { x: 0, y: 0 }) {
  const points = projectedQuadPoints(quad);
  const wall = finiteProjectedPoint(wallOffset, 'wallOffset');
  const area = signedDoubleArea(points);
  if (Math.abs(area) <= PROJECTED_EPSILON) {
    throw new RangeError('A projected tile quad must have non-zero area.');
  }

  const winding = Math.sign(area);
  const visibleWalls = [];
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const outward = winding > 0
      ? { x: edge.y, y: -edge.x }
      : { x: -edge.y, y: edge.x };
    const facing = outward.x * wall.x + outward.y * wall.y;
    if (facing <= PROJECTED_EPSILON) return;

    const lowerA = { x: a.x + wall.x, y: a.y + wall.y };
    const lowerB = { x: b.x + wall.x, y: b.y + wall.y };
    // The same cross product measures the screen area of the extruded face.
    const faceArea = Math.abs(edge.x * wall.y - edge.y * wall.x);
    if (faceArea <= PROJECTED_EPSILON) return;
    visibleWalls.push({
      index, a, b, lowerA, lowerB, outward, faceArea,
    });
  });

  const boundsPoints = points.concat(visibleWalls.flatMap(({ lowerA, lowerB }) => (
    [lowerA, lowerB]
  )));
  const reference = points[0];
  const relative = (point) => ({
    x: point.x - reference.x,
    y: point.y - reference.y,
  });
  const relativeBounds = boundsPoints.map(relative);
  const minX = Math.floor(Math.min(...relativeBounds.map((point) => point.x)));
  const maxX = Math.ceil(Math.max(...relativeBounds.map((point) => point.x)));
  const minY = Math.floor(Math.min(...relativeBounds.map((point) => point.y)));
  const maxY = Math.ceil(Math.max(...relativeBounds.map((point) => point.y)));
  const localize = (point) => {
    const relativePoint = relative(point);
    return { x: relativePoint.x - minX, y: relativePoint.y - minY };
  };
  const localPoints = points.map(localize);

  return {
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    offsetX: minX,
    offsetY: minY,
    originX: 0,
    originY: 0,
    shapeKey: projectedShapeKey(points, wall),
    wallOffset: { ...wall },
    quad: {
      top: localPoints[0],
      right: localPoints[1],
      bottom: localPoints[2],
      left: localPoints[3],
      points: localPoints,
    },
    visibleWalls: visibleWalls.map((face) => ({
      ...face,
      a: localize(face.a),
      b: localize(face.b),
      lowerA: localize(face.lowerA),
      lowerB: localize(face.lowerB),
    })),
  };
}

function projectedFaceDescriptor(quad) {
  const points = quad.points;
  return {
    t: quad.top,
    r: quad.right,
    b: quad.bottom,
    l: quad.left,
    c: {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    },
    points,
  };
}

function drawProjectedSidewall(ctx, face, colors, s, rand) {
  const isLeft = face.outward.x < -PROJECTED_EPSILON;
  const side = isLeft ? colors.left : colors.right;
  const endTone = isLeft ? '#07090d' : '#05070a';
  const gradient = ctx.createLinearGradient(
    face.a.x, face.a.y, face.lowerA.x, face.lowerA.y,
  );
  gradient.addColorStop(0, mixColor(side, colors.soil, isLeft ? 0.25 : 0.16));
  gradient.addColorStop(0.18, side);
  gradient.addColorStop(1, mixColor(side, endTone, isLeft ? 0.46 : 0.52));
  polygon(ctx, [face.a, face.b, face.lowerB, face.lowerA], gradient,
    colors.outline, Math.max(1, s));

  const depth = Math.hypot(
    face.lowerA.x - face.a.x,
    face.lowerA.y - face.a.y,
  );
  if (depth < 8 * s) return;

  const bandT = Math.min(0.23, (8 * s) / depth);
  const bandA = lerpPoint(face.a, face.lowerA, bandT);
  const bandB = lerpPoint(face.b, face.lowerB, bandT);
  polygon(ctx, [face.a, face.b, bandB, bandA], alphaColor(
    isLeft ? colors.soil : mixColor(colors.soil, colors.right, 0.45),
    isLeft ? 0.72 : 0.68,
  ));

  const seamCount = clamp(Math.floor(depth / (10 * s)), 1, 7);
  ctx.lineWidth = Math.max(1, s);
  for (let i = 1; i <= seamCount; i++) {
    const t = i / (seamCount + 1);
    const wobble = (rand(4000 + face.index * 97 + i) - 0.5) * 0.04;
    const a = lerpPoint(face.a, face.lowerA, clamp(t + wobble, 0, 1));
    const b = lerpPoint(face.b, face.lowerB, clamp(t + wobble, 0, 1));
    ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,.075)' : 'rgba(0,0,0,.19)';
    ctx.beginPath();
    ctx.moveTo(Math.round(a.x), Math.round(a.y));
    ctx.lineTo(Math.round(b.x), Math.round(b.y));
    ctx.stroke();
  }

  const p = pixelSize(s, 2);
  const blockCount = 6 + Math.floor(rand(4100 + face.index * 101) * 7);
  for (let i = 0; i < blockCount; i++) {
    const edgeT = 0.08 + rand(4200 + face.index * 113 + i) * 0.83;
    const depthT = 0.18 + rand(4300 + face.index * 127 + i) * 0.76;
    const upper = lerpPoint(face.a, face.b, edgeT);
    const lower = lerpPoint(face.lowerA, face.lowerB, edgeT);
    const point = lerpPoint(upper, lower, depthT);
    const tones = [colors.rock, 'rgba(255,255,255,.10)', 'rgba(0,0,0,.24)'];
    rect(ctx, point.x, point.y, p * (1 + (i % 2)), p, tones[i % tones.length]);
  }

  if (colors.decor.includes('tree') || biomeHasRoots(colors)) {
    ctx.strokeStyle = alphaColor(colors.dark, 0.8);
    const roots = 2 + Math.floor(rand(4900 + face.index * 131) * 3);
    for (let i = 0; i < roots; i++) {
      const edgeT = 0.15 + rand(4910 + face.index * 139 + i) * 0.7;
      const start = lerpPoint(face.a, face.b, edgeT);
      const finish = lerpPoint(start, lerpPoint(face.lowerA, face.lowerB, edgeT), 0.36);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(finish.x + (rand(4920 + face.index * 149 + i) - 0.5) * 4 * s, finish.y);
      ctx.stroke();
    }
  }
}

function drawProjectedTopRim(ctx, {
  d, colors, scale: s, rand, visibleWallIndexes,
}) {
  ctx.save();
  ctx.lineCap = 'square';
  ctx.lineWidth = Math.max(1, s);
  d.points.forEach((point, index) => {
    const next = d.points[(index + 1) % d.points.length];
    const foreground = visibleWallIndexes.has(index);
    ctx.strokeStyle = foreground
      ? 'rgba(0,0,0,.24)'
      : alphaColor(colors.light, 0.45);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();

    if (!foreground || !(biomeHasRoots(colors) || colors.decor.includes('tree'))) return;
    const edgeLength = Math.hypot(next.x - point.x, next.y - point.y);
    const fringe = Math.max(2, Math.min(10, Math.floor(edgeLength / (7 * s))));
    for (let i = 0; i < fringe; i++) {
      const t = (i + 0.5) / fringe;
      const base = lerpPoint(point, next, t);
      const len = (2 + rand(5920 + index * 31 + i) * 4) * s;
      ctx.strokeStyle = colors.dark;
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(base.x, base.y + len);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawProjectedMonolithNiche(ctx, geometry, s) {
  if (geometry.visibleWalls.length === 0) return;
  // Prefer the familiar front-right face at the default view. Endpoint views
  // have one valid wall, so the niche follows that wall instead of spilling
  // onto an edge-on or hidden face.
  const face = geometry.visibleWalls.reduce((best, candidate) => (
    !best || candidate.outward.x > best.outward.x ? candidate : best
  ), null);
  const wallDepth = Math.hypot(
    face.lowerA.x - face.a.x,
    face.lowerA.y - face.a.y,
  );
  if (wallDepth <= PROJECTED_EPSILON) return;

  const topT = Math.min(0.72, (16 * s) / wallDepth);
  const bottomT = Math.min(0.94, topT + (17 * s) / wallDepth);
  const topA = lerpPoint(lerpPoint(face.a, face.b, 0.18), lerpPoint(face.lowerA, face.lowerB, 0.18), topT);
  const topB = lerpPoint(lerpPoint(face.a, face.b, 0.78), lerpPoint(face.lowerA, face.lowerB, 0.78), topT);
  const bottomA = lerpPoint(lerpPoint(face.a, face.b, 0.18), lerpPoint(face.lowerA, face.lowerB, 0.18), bottomT);
  const bottomB = lerpPoint(lerpPoint(face.a, face.b, 0.78), lerpPoint(face.lowerA, face.lowerB, 0.78), bottomT);

  ctx.save();
  clipPolygon(ctx, [face.a, face.b, face.lowerB, face.lowerA]);
  polygon(ctx, [topA, topB, bottomB, bottomA], '#050518', '#191a58', Math.max(1, s));
  ctx.strokeStyle = '#49b528';
  ctx.lineWidth = Math.max(1, s);
  ctx.beginPath();
  ctx.moveTo(topA.x, topA.y);
  ctx.lineTo(topB.x, topB.y);
  ctx.stroke();
  const rune = lerpPoint(topA, bottomA, 0.22);
  rect(ctx, rune.x + 2 * s, rune.y, 3 * s, 3 * s, '#2a17bd');
  ctx.restore();
}

/** Draw a complete view-projected sanctuary tile into its resolved canvas. */
export function drawProjectedIsoTile(ctx, {
  biome,
  variant = 0,
  height = 0,
  quad,
  wallOffset = { x: 0, y: 0 },
  scale = 1,
  rand,
  overlay = null,
  geometry = null,
}) {
  const colors = BIOMES[biome];
  if (!colors) throw new Error(`drawProjectedIsoTile: unknown biome "${biome}"`);
  if (typeof rand !== 'function') {
    throw new TypeError('drawProjectedIsoTile requires a deterministic rand(salt) function.');
  }

  const resolved = geometry ?? projectedTileGeometry(quad, wallOffset);
  const d = projectedFaceDescriptor(resolved.quad);
  const width = Math.max(1, Math.max(...d.points.map((point) => point.x))
    - Math.min(...d.points.map((point) => point.x)));
  const faceHeight = Math.max(1, Math.max(...d.points.map((point) => point.y))
    - Math.min(...d.points.map((point) => point.y)));

  resolved.visibleWalls.forEach((face) => {
    drawProjectedSidewall(ctx, face, colors, scale, rand);
  });

  const topGradient = ctx.createLinearGradient(d.l.x, d.t.y, d.r.x, d.b.y);
  topGradient.addColorStop(0, mixColor(colors.top, colors.light, 0.26));
  topGradient.addColorStop(0.5, variant % 2
    ? colors.top
    : mixColor(colors.top, colors.light, 0.08));
  topGradient.addColorStop(1, mixColor(colors.top, colors.dark, 0.18));
  polygon(ctx, d.points, topGradient, colors.outline, Math.max(1, scale));
  drawTopTexture(ctx, {
    biome, d, colors, tw: width, th: faceHeight, scale, rand,
  });
  drawProjectedTopRim(ctx, {
    biome,
    d,
    colors,
    scale,
    rand,
    visibleWallIndexes: new Set(resolved.visibleWalls.map((face) => face.index)),
  });

  if (overlay) {
    if (!TILE_OVERLAYS[overlay]) {
      throw new Error(`drawProjectedIsoTile: unknown overlay "${overlay}"`);
    }
    if (overlay === 'monolithNiche') {
      drawProjectedMonolithNiche(ctx, resolved, scale);
    }
  }
}

// Position-specific one-off details baked onto a single tile. Shared tile
// textures can't hold these (one texture serves every tile of that biome +
// variant), so a cell that names an overlay gets its own unique baked key —
// see ensureTileTexture in textureBake.js.
export const TILE_OVERLAYS = {
  // The monolith's signature shadowed niche: a dark recess on the front-right
  // face with a moss-green lintel and a blue rune block. Ported from the
  // Mossy Monolith design's drawSideStrata special case at cell (6,4).
  monolithNiche(ctx, { d, s }) {
    const a = { x: lerp(d.b.x, d.r.x, 0.18), y: lerp(d.b.y, d.r.y, 0.18) + 16 * s };
    const b = { x: lerp(d.b.x, d.r.x, 0.78), y: lerp(d.b.y, d.r.y, 0.78) + 16 * s };
    polygon(ctx, [
      a, b,
      { x: b.x, y: b.y + 17 * s },
      { x: a.x, y: a.y + 17 * s },
    ], '#050518', '#191a58', Math.max(1, s));
    ctx.strokeStyle = '#49b528';
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - 2 * s);
    ctx.lineTo(b.x, b.y - 2 * s);
    ctx.stroke();
    rect(ctx, a.x + 3 * s, a.y + 2 * s, 3 * s, 3 * s, '#2a17bd');
  },
};

// The two visible faces. Left catches the light; right falls off to near-black.
function drawSidewalls(ctx, d, depth, colors, stroke) {
  const leftBottom = { x: d.l.x, y: d.l.y + depth };
  const bottomBottom = { x: d.b.x, y: d.b.y + depth };
  const rightBottom = { x: d.r.x, y: d.r.y + depth };

  const leftGradient = ctx.createLinearGradient(d.l.x, d.l.y, bottomBottom.x, bottomBottom.y);
  leftGradient.addColorStop(0, mixColor(colors.left, colors.soil, 0.25));
  leftGradient.addColorStop(0.18, colors.left);
  leftGradient.addColorStop(1, mixColor(colors.left, '#07090d', 0.46));
  polygon(ctx, [d.l, d.b, bottomBottom, leftBottom], leftGradient, colors.outline, stroke);

  const rightGradient = ctx.createLinearGradient(d.r.x, d.r.y, bottomBottom.x, bottomBottom.y);
  rightGradient.addColorStop(0, mixColor(colors.right, colors.soil, 0.16));
  rightGradient.addColorStop(1, mixColor(colors.right, '#05070a', 0.52));
  polygon(ctx, [d.b, d.r, rightBottom, bottomBottom], rightGradient, colors.outline, stroke);
}

// Geology pass: a soil band under the lip, horizontal seams, embedded stones,
// cracks, and roots for the soft biomes. This is what sells the tile as a dug
// block of earth rather than a flat shape.
function drawSideStrata(ctx, d, depth, colors, s, rand) {
  if (depth < 8) return;
  const soilBand = Math.min(depth * 0.23, 8 * s);

  ctx.save();
  polygon(ctx, [
    d.l, d.b,
    { x: d.b.x, y: d.b.y + soilBand },
    { x: d.l.x, y: d.l.y + soilBand },
  ], alphaColor(colors.soil, 0.72));
  polygon(ctx, [
    d.b, d.r,
    { x: d.r.x, y: d.r.y + soilBand },
    { x: d.b.x, y: d.b.y + soilBand },
  ], alphaColor(mixColor(colors.soil, colors.right, 0.45), 0.68));

  const seamCount = clamp(Math.floor(depth / (10 * s)), 1, 7);
  ctx.lineWidth = Math.max(1, s);
  for (let i = 1; i <= seamCount; i++) {
    const t = i / (seamCount + 1);
    const wobble = (rand(4000 + i) - 0.5) * 3 * s;
    const dy = depth * t + wobble;
    ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,.075)' : 'rgba(0,0,0,.19)';
    ctx.beginPath();
    ctx.moveTo(Math.round(d.l.x), Math.round(d.l.y + dy));
    ctx.lineTo(Math.round(d.b.x), Math.round(d.b.y + dy));
    ctx.lineTo(Math.round(d.r.x), Math.round(d.r.y + dy));
    ctx.stroke();
  }

  const blockCount = 9 + Math.floor(rand(4100) * 9);
  const p = pixelSize(s, 2);
  for (let i = 0; i < blockCount; i++) {
    const sideRight = rand(4200 + i) > 0.48;
    const t = 0.08 + rand(4300 + i) * 0.83;
    const depthT = 0.18 + rand(4400 + i) * 0.76;
    const start = sideRight ? d.b : d.l;
    const end = sideRight ? d.r : d.b;
    const px = lerp(start.x, end.x, t);
    const py = lerp(start.y, end.y, t) + depth * depthT;
    let tone = 'rgba(0,0,0,.24)';
    if (i % 3 === 0) tone = colors.rock;
    else if (i % 3 === 1) tone = 'rgba(255,255,255,.10)';
    rect(ctx, px, py, p * (1 + (i % 2)), p, tone);
  }

  const crackCount = 1 + Math.floor(rand(4600) * 3);
  ctx.strokeStyle = 'rgba(0,0,0,.38)';
  ctx.lineWidth = Math.max(1, s);
  for (let i = 0; i < crackCount; i++) {
    const sideRight = rand(4700 + i) > 0.5;
    const a = sideRight ? d.b : d.l;
    const b = sideRight ? d.r : d.b;
    const t = 0.22 + rand(4800 + i) * 0.56;
    const sx = lerp(a.x, b.x, t);
    const sy = lerp(a.y, b.y, t) + soilBand;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (sideRight ? 2 : -2) * s, sy + depth * 0.22);
    ctx.lineTo(sx + (sideRight ? -1 : 1) * s, sy + depth * 0.37);
    ctx.stroke();
  }

  if (colors.decor.includes('tree') || biomeHasRoots(colors)) {
    ctx.strokeStyle = alphaColor(colors.dark, 0.8);
    const roots = 2 + Math.floor(rand(4900) * 3);
    for (let i = 0; i < roots; i++) {
      const t = 0.15 + rand(4910 + i) * 0.7;
      const sx = lerp(d.l.x, d.b.x, t);
      const sy = lerp(d.l.y, d.b.y, t) + soilBand;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (rand(4920 + i) - 0.5) * 5 * s, sy + Math.min(depth * 0.36, 17 * s));
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Roots hang from biomes with living growth. Derived from the palette's decor
// list rather than a hardcoded biome-name check, so new biomes opt in for free.
function biomeHasRoots(colors) {
  return colors.decor.some((type) => ['reeds', 'mushroom', 'deadTree', 'flowers'].includes(type));
}

// Per-biome surface detail, clipped to the top face. Every biome first gets a
// universal micro-noise scatter that gives the whole map a handmade finish.
function drawTopTexture(ctx, {
  biome, d, colors, tw, th, scale: s, rand,
}) {
  ctx.save();
  clipTopFace(ctx, d);
  const px = pixelSize(s, 1.6);
  const point = (salt, inset) => randomPointOnTop(rand, d, tw, th, salt, inset);

  scatter(ctx, [colors.light, colors.mid, colors.dark], 28, 5000, 1.35, 0.24,
    { d, tw, th, s, rand });

  const detail = TOP_TEXTURES[biome];
  if (detail) detail(ctx, { d, colors, s, px, rand, point, tw, th });

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// Deterministic pixel dust in the given colors.
function scatter(ctx, colors, count, salt, size, alpha, { d, tw, th, s, rand }) {
  const p = pixelSize(s, size);
  for (let i = 0; i < count; i++) {
    const point = randomPointOnTop(rand, d, tw, th, salt + i * 5, 0.44);
    const fill = colors[i % colors.length];
    ctx.globalAlpha = alpha * (0.65 + rand(salt + i * 5 + 2) * 0.55);
    rect(ctx, point.x, point.y, p * (i % 5 === 0 ? 2 : 1), p, fill);
  }
  ctx.globalAlpha = 1;
}

// One entry per biome. Add a key here to give a new biome custom ground detail;
// omit it and the biome still renders with the gradient + micro-noise base.
const TOP_TEXTURES = {
  grass(ctx, { d, colors, s, rand, point }) {
    const patch = point(5100, 0.30);
    ctx.fillStyle = alphaColor(colors.dark, 0.22);
    ctx.beginPath();
    ctx.ellipse(patch.x, patch.y, 13 * s, 5 * s, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1, s);
    for (let i = 0; i < 12; i++) {
      const p = point(5120 + i * 4, 0.40);
      ctx.strokeStyle = i % 3 === 0 ? colors.accent : colors.dark;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 2 * s);
      ctx.lineTo(p.x + (i % 2 ? 2 : -2) * s, p.y - (3 + i % 3) * s);
      ctx.stroke();
    }
  },

  sand(ctx, { d, colors, s, rand, point, tw, th }) {
    ctx.lineWidth = Math.max(1, s);
    for (let i = 0; i < 4; i++) {
      const p = point(5200 + i * 7, 0.34);
      ctx.strokeStyle = i % 2 ? alphaColor(colors.light, 0.45) : alphaColor(colors.dark, 0.38);
      ctx.beginPath();
      ctx.moveTo(p.x - 11 * s, p.y + 1 * s);
      ctx.quadraticCurveTo(p.x, p.y - 4 * s, p.x + 12 * s, p.y);
      ctx.stroke();
    }
    scatter(ctx, [colors.accent, colors.dark, colors.rock], 14, 5240, 1.2, 0.32,
      { d, tw, th, s, rand });
  },

  ice(ctx, { d, colors, s, px, point }) {
    polygon(ctx, [
      { x: d.t.x, y: d.t.y + 1 * s }, { x: d.c.x, y: d.c.y }, { x: d.l.x + 6 * s, y: d.l.y },
    ], alphaColor(colors.light, 0.15));
    polygon(ctx, [
      { x: d.c.x, y: d.c.y }, { x: d.r.x - 5 * s, y: d.r.y }, { x: d.b.x, y: d.b.y - 1 * s },
    ], alphaColor(colors.dark, 0.14));
    ctx.strokeStyle = alphaColor(colors.accent, 0.72);
    ctx.lineWidth = Math.max(1, s);
    for (let i = 0; i < 4; i++) {
      const p = point(5310 + i * 6, 0.32);
      ctx.beginPath();
      ctx.moveTo(p.x - 8 * s, p.y - 1 * s);
      ctx.lineTo(p.x, p.y + 2 * s);
      ctx.lineTo(p.x + 5 * s, p.y - 4 * s);
      ctx.stroke();
    }
    const facet = point(5300, 0.25);
    rect(ctx, facet.x, facet.y, px * 3, px, alphaColor(colors.accent, 0.7));
  },

  lava(ctx, { d, s, rand, point, tw, th }) {
    const nodes = [point(5400, 0.30), point(5404, 0.30), point(5408, 0.30), point(5412, 0.30)];
    ctx.shadowColor = '#ff4f22';
    ctx.shadowBlur = Math.max(2, 5 * s);
    ctx.lineWidth = Math.max(2, 2 * s);
    ctx.strokeStyle = '#d94725';
    ctx.beginPath();
    ctx.moveTo(nodes[0].x, nodes[0].y);
    ctx.lineTo(d.c.x, d.c.y);
    ctx.lineTo(nodes[1].x, nodes[1].y);
    ctx.moveTo(d.c.x, d.c.y);
    ctx.lineTo(nodes[2].x, nodes[2].y);
    ctx.moveTo(nodes[2].x, nodes[2].y);
    ctx.lineTo(nodes[3].x, nodes[3].y);
    ctx.stroke();
    // Second pass with no glow paints the bright molten core over the bloom.
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffae46';
    ctx.lineWidth = Math.max(1, s);
    ctx.stroke();
    scatter(ctx, ['#180f13', '#2a171a', '#7a2e25'], 18, 5440, 2, 0.55, { d, tw, th, s, rand });
  },

  swamp(ctx, { d, colors, s, rand, point, tw, th }) {
    const pool = point(5500, 0.24);
    ctx.fillStyle = 'rgba(31,69,55,.55)';
    ctx.beginPath();
    ctx.ellipse(pool.x, pool.y, 13 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(143,178,104,.38)';
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath();
    ctx.moveTo(pool.x - 8 * s, pool.y);
    ctx.lineTo(pool.x + 7 * s, pool.y - 1 * s);
    ctx.stroke();
    scatter(ctx, [colors.light, '#273c2f', '#7f8243'], 20, 5520, 1.5, 0.36, { d, tw, th, s, rand });
  },

  crystal(ctx, { d, colors, s, rand, point, tw, th }) {
    ctx.strokeStyle = alphaColor(colors.accent, 0.56);
    ctx.lineWidth = Math.max(1, s);
    for (let i = 0; i < 5; i++) {
      const a = point(5600 + i * 6, 0.35);
      const b = point(5602 + i * 6, 0.35);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    scatter(ctx, [colors.accent, '#7cf5ff', colors.light], 12, 5650, 1.5, 0.58,
      { d, tw, th, s, rand });
  },

  mushroom(ctx, { d, colors, s, rand, point, tw, th }) {
    ctx.strokeStyle = alphaColor(colors.accent, 0.34);
    ctx.lineWidth = Math.max(1, s);
    for (let i = 0; i < 3; i++) {
      const p = point(5700 + i * 8, 0.30);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (4 + i * 2) * s, Math.PI * 0.2, Math.PI * 1.4);
      ctx.stroke();
    }
    scatter(ctx, ['#e6a9ff', '#c96fcf', colors.dark], 18, 5740, 1.5, 0.42, { d, tw, th, s, rand });
  },

  void(ctx, { d, colors, s, rand, point, tw, th }) {
    ctx.strokeStyle = alphaColor(colors.accent, 0.47);
    ctx.lineWidth = Math.max(1, s);
    const a = point(5800, 0.25);
    ctx.beginPath();
    ctx.moveTo(a.x - 9 * s, a.y - 2 * s);
    ctx.lineTo(a.x, a.y + 2 * s);
    ctx.lineTo(a.x + 7 * s, a.y - 5 * s);
    ctx.moveTo(a.x, a.y + 2 * s);
    ctx.lineTo(a.x + 2 * s, a.y + 8 * s);
    ctx.stroke();
    scatter(ctx, [colors.accent, '#5d4b83', '#0c0c13'], 18, 5840, 1.5, 0.5, { d, tw, th, s, rand });
  },

  // Sanctuary exterior: golden/dark grass blades over the Krog moss palette,
  // plus the design's signature gold-and-mint confetti flecks.
  moss(ctx, { d, colors, s, rand, point, tw, th }) {
    ctx.lineWidth = Math.max(1, s);
    for (let i = 0; i < 9; i++) {
      const p = point(5120 + i * 4, 0.40);
      ctx.strokeStyle = i % 3 === 0 ? colors.accent : colors.dark;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 2 * s);
      ctx.lineTo(p.x + (i % 2 ? 2 : -2) * s, p.y - (3 + i % 3) * s);
      ctx.stroke();
    }
    scatter(ctx, [colors.accent, '#64f0a1', colors.mid], 10, 5160, 1.3, 0.5, { d, tw, th, s, rand });
  },

  // Sanctuary spring: layered pixel wave bands + bright ripple scatter.
  springwater(ctx, { d, colors, s, rand, point, tw, th }) {
    const wave = (salt, width, color) => {
      const p = point(salt, 0.28);
      rect(ctx, p.x - width * s, p.y, width * 2 * s, Math.max(1, s), color);
      rect(ctx, p.x - (width - 2) * s, p.y - 2 * s, (width - 2) * 2 * s, Math.max(1, s), color);
    };
    wave(5260, 8, colors.dark);
    wave(5270, 6, colors.light);
    wave(5280, 4, colors.accent);
    scatter(ctx, [colors.light, colors.mid, '#25a6d8'], 14, 5290, 1.5, 0.72, { d, tw, th, s, rand });
  },

  // Interior floors share one treatment: a faint mortar seam just inside the
  // tile edge plus a chip crack, which gives the vault its laid-slab read
  // (the design got the same effect from its editor grid overlay).
  flagstone: groutTexture,
  masonry: groutTexture,
  warmstone: groutTexture,
};

// The atlas biomes (data/biomes.js) reuse the treatments above rather than
// define their own — each one's palette already carries its character, and the
// atlas is viewed zoomed out where surface detail reads as texture, not shape.
// Assigned after the literal because these alias methods defined inside it.
// A biome with no entry here is still valid: drawTopTexture falls back to the
// base scatter, which is why `ocean` needs nothing.
TOP_TEXTURES.badlands = TOP_TEXTURES.sand;
TOP_TEXTURES.taiga = TOP_TEXTURES.grass;
TOP_TEXTURES.darkwood = TOP_TEXTURES.grass;
TOP_TEXTURES.jungle = TOP_TEXTURES.grass;
TOP_TEXTURES.snow = TOP_TEXTURES.ice;
TOP_TEXTURES.atoll = TOP_TEXTURES.springwater;
TOP_TEXTURES.ocean = TOP_TEXTURES.springwater;

// Shared slab/grout detail for the vault's stone materials. Not in the
// TOP_TEXTURES literal because three keys reference the same drawer.
function groutTexture(ctx, { d, colors, s, rand, point }) {
  const inset = (v) => ({ x: lerp(v.x, d.c.x, 0.10), y: lerp(v.y, d.c.y, 0.10) });
  polygon(ctx, [inset(d.t), inset(d.r), inset(d.b), inset(d.l)], null,
    alphaColor(colors.dark, 0.5), Math.max(1, s));

  ctx.strokeStyle = alphaColor(colors.dark, 0.55);
  ctx.lineWidth = Math.max(1, s);
  const crackCount = 1 + Math.floor(rand(5950) * 2);
  for (let i = 0; i < crackCount; i++) {
    const p = point(5960 + i * 6, 0.30);
    ctx.beginPath();
    ctx.moveTo(p.x - 4 * s, p.y - 1 * s);
    ctx.lineTo(p.x, p.y + 1 * s);
    ctx.lineTo(p.x + 5 * s, p.y - 2 * s);
    ctx.stroke();
  }
}

// Edge lighting: the two far edges catch light, the two near edges sit in
// shadow. Living biomes also grow a fringe of blades over the front lip, which
// breaks the hard diamond silhouette.
function drawTopRim(ctx, { biome, d, colors, scale: s, rand }) {
  ctx.save();
  ctx.lineCap = 'square';
  ctx.lineWidth = Math.max(1, s);
  ctx.strokeStyle = alphaColor(colors.light, 0.45);
  ctx.beginPath();
  ctx.moveTo(d.l.x + 1 * s, d.l.y - 1 * s);
  ctx.lineTo(d.t.x, d.t.y + 1 * s);
  ctx.lineTo(d.r.x - 1 * s, d.r.y - 1 * s);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,.24)';
  ctx.beginPath();
  ctx.moveTo(d.r.x, d.r.y + 1 * s);
  ctx.lineTo(d.b.x, d.b.y - 1 * s);
  ctx.lineTo(d.l.x, d.l.y + 1 * s);
  ctx.stroke();

  if (biomeHasRoots(colors) || colors.decor.includes('tree')) {
    ctx.strokeStyle = colors.dark;
    const fringe = 5 + Math.floor(rand(5900) * 5);
    for (let i = 0; i < fringe; i++) {
      const t = (i + 0.4) / (fringe + 0.5);
      const baseX = lerp(d.l.x, d.b.x, t);
      const baseY = lerp(d.l.y, d.b.y, t);
      const len = (2 + rand(5910 + i) * 4) * s;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX + (rand(5920 + i) - 0.5) * 2 * s, baseY + len);
      ctx.stroke();
    }
  }
  ctx.restore();
}
