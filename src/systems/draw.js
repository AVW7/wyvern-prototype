// Low-level 2D canvas helpers shared by tileArt.js and decorArt.js.
// Every function takes an explicit ctx — no module-level canvas state — so the
// same code can bake a texture in Preload or draw to any other surface.
import { lerp, clamp } from './noise.js';

// Pixel-snapped fill. Rounding keeps edges crisp under pixelArt rendering.
export function rect(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

export function polygon(ctx, points, fill, stroke = null, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(Math.round(points[0].x), Math.round(points[0].y));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(Math.round(points[i].x), Math.round(points[i].y));
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

// Accepts '#rgb', '#rrggbb' or 'rgb(...)' so mixed colors can be re-mixed.
export function colorToRgb(color) {
  if (color.startsWith('rgb')) {
    const parts = color.match(/[\d.]+/g).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2] };
  }
  const c = color.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((v) => v + v).join('') : c, 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
}

export function mixColor(a, b, t) {
  const ca = colorToRgb(a);
  const cb = colorToRgb(b);
  return `rgb(${Math.round(lerp(ca.r, cb.r, t))}, ${Math.round(lerp(ca.g, cb.g, t))}, `
    + `${Math.round(lerp(ca.b, cb.b, t))})`;
}

export function alphaColor(color, alpha) {
  const c = colorToRgb(color);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

// One "art pixel" at the current scale. Never smaller than a real pixel.
export function pixelSize(scale, multiplier = 1) {
  return Math.max(1, Math.round(scale * multiplier));
}

// The four vertices of a tile's top face, given its center point.
export function topDiamond(cx, cy, tileWidth, tileHeight) {
  return {
    c: { x: cx, y: cy },
    t: { x: cx, y: cy - tileHeight / 2 },
    r: { x: cx + tileWidth / 2, y: cy },
    b: { x: cx, y: cy + tileHeight / 2 },
    l: { x: cx - tileWidth / 2, y: cy },
  };
}

export function clipDiamond(ctx, d) {
  ctx.beginPath();
  ctx.moveTo(d.t.x, d.t.y);
  ctx.lineTo(d.r.x, d.r.y);
  ctx.lineTo(d.b.x, d.b.y);
  ctx.lineTo(d.l.x, d.l.y);
  ctx.closePath();
  ctx.clip();
}

// A deterministic point inside the diamond, so scattered detail never spills
// past the tile edge. `rand(salt) -> [0,1)` supplies the randomness.
export function randomPointInDiamond(rand, d, tileWidth, tileHeight, salt, inset = 0.43) {
  const rx = (rand(salt) * 2 - 1) * tileWidth * inset;
  const maxY = (tileHeight * inset) * (1 - Math.abs(rx) / (tileWidth * 0.5));
  const ry = (rand(salt + 1) * 2 - 1) * maxY;
  return { x: d.c.x + rx, y: d.c.y + ry };
}

// Soft contact shadow under a standing prop, grounding it to the tile.
export function drawObjectShadow(ctx, x, y, s, width = 12, alpha = 0.28) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#05070b';
  ctx.beginPath();
  ctx.ellipse(x + 4 * s, y + 1 * s, width * s, Math.max(2, width * 0.28 * s), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export { lerp, clamp };
