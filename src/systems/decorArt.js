// Procedural world props, ported from the isometric-world-builder HD prototype.
//
// Every drawer shares the signature (ctx, x, y, s, variant, colors) where
// (x, y) is the prop's BASE — the point where it meets the ground — so a prop
// is placed by its feet, not its bounding box. `variant` (0-3) selects color /
// offset alternates so repeated props don't read as clones.
//
// To add a prop: write a drawer, register it in DECOR_DRAWERS, and list its key
// in a biome's `decor` array in data/biomes.js. Preload bakes it automatically.
import { rect, polygon, mixColor, alphaColor, drawObjectShadow } from './draw.js';

// Bounding box every prop is baked into, in unscaled px. Sized for the widest
// drawer (the sleeping dragon spans ~x-32..x+32) and the deepest one (the
// chest reaches 7px below its base); glow bloom gets margin too. Sprite
// origins derive from baseX/width ratios, so resizing this stays safe.
// Bumping a drawer bigger than this means bumping these too.
export const DECOR_BOX = { width: 72, height: 56, baseX: 36, baseY: 47 };

// Texture key for a baked prop. Baked per biome as well as per type, because
// `rock` picks up the local stone color from the palette.
export function decorTextureKey(biome, type, variant) {
  return `iso-decor-${biome}-${type}-${variant}`;
}

function drawTree(ctx, x, y, s, variant) {
  drawObjectShadow(ctx, x, y, s, 12);
  rect(ctx, x - 3 * s, y - 16 * s, 6 * s, 18 * s, '#3e2b21');
  rect(ctx, x - 2 * s, y - 16 * s, 2 * s, 17 * s, '#79513a');
  rect(ctx, x + 1 * s, y - 14 * s, 2 * s, 14 * s, '#2a211c');
  const layers = [
    { yy: -34, w: 12, c: '#1e5133' },
    { yy: -28, w: 16, c: '#296b3e' },
    { yy: -21, w: 18, c: '#347d47' },
    { yy: -15, w: 15, c: '#285f3a' },
  ];
  layers.forEach((layer, i) => {
    const offset = ((variant + i) % 3 - 1) * 2 * s;
    polygon(ctx, [
      { x: x + offset, y: y + layer.yy * s },
      { x: x + layer.w * s + offset, y: y + (layer.yy + 10) * s },
      { x: x + 3 * s + offset, y: y + (layer.yy + 9) * s },
      { x: x + offset, y: y + (layer.yy + 13) * s },
      { x: x - 3 * s + offset, y: y + (layer.yy + 9) * s },
      { x: x - layer.w * s + offset, y: y + (layer.yy + 10) * s },
    ], layer.c, '#153421', Math.max(1, s));
  });
  rect(ctx, x - 6 * s, y - 29 * s, 4 * s, 3 * s, '#78b95b');
  rect(ctx, x + 4 * s, y - 23 * s, 5 * s, 3 * s, '#5da54f');
  rect(ctx, x - 9 * s, y - 18 * s, 3 * s, 2 * s, '#8cca67');
}

function drawPine(ctx, x, y, s, variant) {
  drawObjectShadow(ctx, x, y, s, 10, 0.24);
  rect(ctx, x - 2 * s, y - 13 * s, 4 * s, 15 * s, '#57402d');
  const snow = ['#dff7f1', '#bde8e7', '#e9ffff'];
  for (let i = 0; i < 3; i++) {
    const yy = y - (31 - i * 8) * s;
    const w = (10 + i * 4) * s;
    polygon(ctx, [
      { x, y: yy }, { x: x + w, y: yy + 15 * s }, { x, y: yy + 11 * s },
      { x: x - w, y: yy + 15 * s },
    ], '#286476', '#143c4e', Math.max(1, s));
    rect(ctx, x - (5 + i * 2) * s, yy + 8 * s, (7 + i * 3) * s, 2 * s, snow[(variant + i) % 3]);
  }
}

function drawDeadTree(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 10, 0.25);
  ctx.strokeStyle = '#30261f';
  ctx.lineWidth = Math.max(3, 4 * s);
  ctx.beginPath();
  ctx.moveTo(x, y + 1 * s);
  ctx.lineTo(x - 1 * s, y - 25 * s);
  ctx.stroke();
  ctx.lineWidth = Math.max(2, 2 * s);
  ctx.strokeStyle = '#5e4732';
  ctx.beginPath();
  ctx.moveTo(x - 1 * s, y - 20 * s);
  ctx.lineTo(x - 10 * s, y - 29 * s);
  ctx.lineTo(x - 13 * s, y - 34 * s);
  ctx.moveTo(x, y - 15 * s);
  ctx.lineTo(x + 10 * s, y - 24 * s);
  ctx.lineTo(x + 12 * s, y - 30 * s);
  ctx.moveTo(x - 1 * s, y - 11 * s);
  ctx.lineTo(x - 8 * s, y - 17 * s);
  ctx.stroke();
  rect(ctx, x - 2 * s, y - 24 * s, 2 * s, 12 * s, '#8a6645');
}

function drawCactus(ctx, x, y, s, variant) {
  drawObjectShadow(ctx, x, y, s, 9, 0.22);
  rect(ctx, x - 3 * s, y - 23 * s, 7 * s, 25 * s, '#397544');
  rect(ctx, x - 2 * s, y - 22 * s, 2 * s, 22 * s, '#69aa5b');
  rect(ctx, x - 9 * s, y - 16 * s, 7 * s, 5 * s, '#397544');
  rect(ctx, x - 9 * s, y - 22 * s, 4 * s, 11 * s, '#397544');
  rect(ctx, x + 3 * s, y - 13 * s, 8 * s, 5 * s, '#397544');
  rect(ctx, x + 8 * s, y - 18 * s, 4 * s, 10 * s, '#397544');
  for (let i = 0; i < 5; i++) rect(ctx, x + (i % 2 ? 2 : -2) * s, y - (5 + i * 4) * s, 1 * s, 1 * s, '#e6d29a');
  if (variant === 3) rect(ctx, x - 2 * s, y - 26 * s, 4 * s, 4 * s, '#e97878');
}

function drawCrystalCluster(ctx, x, y, s, variant, light, dark) {
  drawObjectShadow(ctx, x, y, s, 12, 0.26);
  ctx.save();
  ctx.shadowColor = light;
  ctx.shadowBlur = Math.max(2, 4 * s);
  const shards = [
    { ox: 0, h: 31, w: 7 }, { ox: -10, h: 20, w: 6 },
    { ox: 10, h: 18, w: 6 }, { ox: 4, h: 14, w: 5 },
  ];
  shards.forEach((shard, i) => {
    const ox = (shard.ox + ((variant + i) % 2)) * s;
    polygon(ctx, [
      { x: x + ox, y: y - shard.h * s },
      { x: x + (shard.ox + shard.w) * s, y: y - 4 * s },
      { x: x + (shard.ox + 1) * s, y: y + 2 * s },
      { x: x + (shard.ox - shard.w) * s, y: y - 4 * s },
    ], i % 2 ? dark : mixColor(dark, light, 0.25), '#10212b', Math.max(1, s));
    // Lit facet down one side of each shard.
    polygon(ctx, [
      { x: x + ox, y: y - shard.h * s },
      { x: x + (shard.ox + shard.w) * s, y: y - 4 * s },
      { x: x + (shard.ox + 1) * s, y: y - 8 * s },
    ], light);
  });
  ctx.shadowBlur = 0;
  rect(ctx, x - 1 * s, y - 27 * s, 2 * s, 6 * s, '#f1ffff');
  ctx.restore();
}

function drawMushroom(ctx, x, y, s, variant) {
  drawObjectShadow(ctx, x, y, s, 12, 0.23);
  const caps = ['#d6547b', '#8d5ec5', '#ee826e', '#b94b9e'];
  const positions = [{ ox: 0, oy: 0, k: 1 }, { ox: -9, oy: 2, k: 0.7 }, { ox: 9, oy: 3, k: 0.62 }];
  positions.forEach((m, i) => {
    const k = m.k * s;
    rect(ctx, x + (m.ox - 2) * s, y - (12 - m.oy) * s, 4 * k, 13 * k, '#eadbc8');
    polygon(ctx, [
      { x: x + (m.ox - 11 * m.k) * s, y: y - (12 - m.oy) * s },
      { x: x + (m.ox - 6 * m.k) * s, y: y - (21 - m.oy) * s },
      { x: x + (m.ox + 6 * m.k) * s, y: y - (21 - m.oy) * s },
      { x: x + (m.ox + 11 * m.k) * s, y: y - (12 - m.oy) * s },
    ], caps[(variant + i) % caps.length], '#522641', Math.max(1, s));
    rect(ctx, x + (m.ox - 5 * m.k) * s, y - (19 - m.oy) * s, 2 * k, 2 * k, '#ffe9db');
    rect(ctx, x + (m.ox + 3 * m.k) * s, y - (17 - m.oy) * s, 2 * k, 2 * k, '#ffe9db');
  });
}

function drawRock(ctx, x, y, s, base, moss) {
  drawObjectShadow(ctx, x, y, s, 10, 0.22);
  const hi = mixColor(base, '#ffffff', 0.22);
  const lo = mixColor(base, '#000000', 0.32);
  polygon(ctx, [
    { x: x - 10 * s, y: y - 2 * s }, { x: x - 8 * s, y: y - 11 * s }, { x: x - 1 * s, y: y - 17 * s },
    { x: x + 8 * s, y: y - 12 * s }, { x: x + 11 * s, y: y - 4 * s }, { x: x + 5 * s, y: y + 2 * s },
    { x: x - 3 * s, y: y + 3 * s },
  ], base, '#151820', Math.max(1, s));
  polygon(ctx, [
    { x: x - 8 * s, y: y - 11 * s }, { x: x - 1 * s, y: y - 17 * s },
    { x: x + 2 * s, y: y - 8 * s }, { x: x - 4 * s, y: y - 5 * s },
  ], hi);
  polygon(ctx, [
    { x: x + 2 * s, y: y - 8 * s }, { x: x + 8 * s, y: y - 12 * s },
    { x: x + 11 * s, y: y - 4 * s }, { x: x + 5 * s, y: y + 2 * s },
  ], lo);
  ctx.strokeStyle = alphaColor('#ffffff', 0.16);
  ctx.beginPath();
  ctx.moveTo(x - 4 * s, y - 5 * s);
  ctx.lineTo(x + 2 * s, y - 8 * s);
  ctx.lineTo(x + 5 * s, y + 2 * s);
  ctx.stroke();
  if (moss) {
    rect(ctx, x - 5 * s, y - 13 * s, 6 * s, 2 * s, '#719456');
    rect(ctx, x + 1 * s, y - 10 * s, 4 * s, 2 * s, '#4f7b43');
  }
}

function drawVent(ctx, x, y, s, variant) {
  drawRock(ctx, x, y, s, '#251b20', false);
  ctx.save();
  ctx.shadowColor = '#ff552d';
  ctx.shadowBlur = Math.max(3, 7 * s);
  rect(ctx, x - 5 * s, y - 9 * s, 10 * s, 4 * s, '#ee5429');
  rect(ctx, x - 2 * s, y - 12 * s, 5 * s, 4 * s, '#ffb34c');
  ctx.shadowBlur = 0;
  // Rising smoke puffs, fading as they climb.
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = 0.20 - i * 0.04;
    ctx.fillStyle = '#b59aa1';
    ctx.beginPath();
    ctx.arc(x + (i - 1) * 3 * s, y - (20 + i * 7) * s, (4 + i * 2) * s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFlowers(ctx, x, y, s, variant) {
  drawObjectShadow(ctx, x, y, s, 8, 0.14);
  const petals = ['#ffd1e8', '#fff0a6', '#cdb7ff', '#ef8aa8'];
  for (let i = 0; i < 7; i++) {
    const ox = (i - 3) * 3 * s;
    const oy = (i % 3) * 2 * s;
    rect(ctx, x + ox, y - oy, 1 * s, 5 * s, '#326f3b');
    rect(ctx, x + ox - 1 * s, y - oy - 3 * s, 3 * s, 3 * s, petals[(variant + i) % petals.length]);
    rect(ctx, x + ox, y - oy - 2 * s, 1 * s, 1 * s, '#fff4c8');
  }
}

function drawReeds(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 8, 0.15);
  ctx.lineWidth = Math.max(1, 1.4 * s);
  for (let i = -3; i <= 3; i++) {
    ctx.strokeStyle = i % 2 ? '#a9a35b' : '#75814b';
    ctx.beginPath();
    ctx.moveTo(x + i * 3 * s, y + 1 * s);
    ctx.lineTo(x + i * 2 * s, y - (12 + Math.abs(i)) * s);
    ctx.stroke();
    if (i % 2 === 0) rect(ctx, x + i * 2 * s - 1 * s, y - (16 + Math.abs(i)) * s, 3 * s, 5 * s, '#61472d');
  }
}

function drawBones(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 9, 0.16);
  ctx.strokeStyle = '#eadcb8';
  ctx.lineWidth = Math.max(2, 2 * s);
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y);
  ctx.lineTo(x + 9 * s, y - 7 * s);
  ctx.moveTo(x - 7 * s, y - 9 * s);
  ctx.lineTo(x + 8 * s, y + 2 * s);
  ctx.stroke();
  polygon(ctx, [
    { x: x - 4 * s, y: y - 12 * s }, { x: x + 3 * s, y: y - 13 * s }, { x: x + 7 * s, y: y - 7 * s },
    { x: x + 3 * s, y: y - 3 * s }, { x: x - 4 * s, y: y - 5 * s },
  ], '#e8d8b2', '#655c4e', Math.max(1, s));
  rect(ctx, x - 1 * s, y - 10 * s, 2 * s, 2 * s, '#463f36');
  rect(ctx, x + 3 * s, y - 8 * s, 2 * s, 2 * s, '#463f36');
}

function drawGlow(ctx, x, y, s, variant) {
  drawObjectShadow(ctx, x, y, s, 7, 0.12);
  ctx.save();
  const glow = variant % 2 ? '#9bf8ff' : '#c995ff';
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.27;
  ctx.beginPath();
  ctx.arc(x, y - 10 * s, 14 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(x, y - 10 * s, 8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  rect(ctx, x - 2 * s, y - 12 * s, 4 * s, 4 * s, '#f7ecff');
  rect(ctx, x - 1 * s, y - 15 * s, 2 * s, 2 * s, '#ffffff');
  ctx.restore();
}

function drawObelisk(ctx, x, y, s, variant) {
  drawObjectShadow(ctx, x, y, s, 12, 0.28);
  polygon(ctx, [
    { x, y: y - 35 * s }, { x: x + 8 * s, y: y - 26 * s }, { x: x + 7 * s, y },
    { x, y: y + 5 * s }, { x: x - 7 * s, y }, { x: x - 8 * s, y: y - 26 * s },
  ], '#27243a', '#0c0b13', Math.max(1, s));
  polygon(ctx, [
    { x, y: y - 35 * s }, { x: x + 8 * s, y: y - 26 * s }, { x, y: y - 22 * s },
    { x: x - 8 * s, y: y - 26 * s },
  ], '#6f5a94');
  polygon(ctx, [
    { x, y: y - 22 * s }, { x: x + 8 * s, y: y - 26 * s }, { x: x + 7 * s, y },
    { x, y: y + 5 * s },
  ], '#171725');
  const rune = variant % 2 ? '#8ff4ff' : '#af8cff';
  ctx.save();
  ctx.shadowColor = rune;
  ctx.shadowBlur = Math.max(2, 4 * s);
  rect(ctx, x - 1 * s, y - 20 * s, 3 * s, 10 * s, rune);
  rect(ctx, x - 4 * s, y - 15 * s, 9 * s, 2 * s, rune);
  ctx.restore();
}

function drawRuin(ctx, x, y, s, variant) {
  drawObjectShadow(ctx, x, y, s, 13, 0.24);
  const stone = '#77766f';
  const hi = '#aaa79b';
  const lo = '#474943';
  rect(ctx, x - 13 * s, y - 8 * s, 26 * s, 9 * s, lo);
  rect(ctx, x - 11 * s, y - 14 * s, 8 * s, 14 * s, stone);
  rect(ctx, x + 3 * s, y - 18 * s, 8 * s, 18 * s, stone);
  rect(ctx, x - 10 * s, y - 13 * s, 6 * s, 3 * s, hi);
  rect(ctx, x + 4 * s, y - 17 * s, 6 * s, 3 * s, hi);
  rect(ctx, x - 3 * s, y - 6 * s, 7 * s, 6 * s, '#292d2b');
  rect(ctx, x + 8 * s, y - 10 * s, 4 * s, 3 * s, lo);
  if (variant % 2 === 0) {
    rect(ctx, x - 11 * s, y - 16 * s, 4 * s, 2 * s, '#7fa35b');
    rect(ctx, x + 4 * s, y - 20 * s, 5 * s, 2 * s, '#668b4d');
  }
}

function drawBasaltSpires(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 13, 0.29);
  const heights = [25, 18, 31, 15];
  const offs = [-8, 7, 0, 13];
  heights.forEach((h, i) => {
    const ox = offs[i] * s;
    polygon(ctx, [
      { x: x + ox, y: y - h * s },
      { x: x + (offs[i] + 5) * s, y: y - (h - 5) * s },
      { x: x + (offs[i] + 4) * s, y },
      { x: x + (offs[i] - 4) * s, y },
    ], i === 2 ? '#26222c' : '#322b32', '#100e13', Math.max(1, s));
    polygon(ctx, [
      { x: x + ox, y: y - h * s },
      { x: x + (offs[i] + 5) * s, y: y - (h - 5) * s },
      { x: x + (offs[i] - 1) * s, y: y - (h - 7) * s },
    ], '#5a4650');
  });
}

// ---- Interior props (Emberkeep Dragonvault) ------------------------------
// Ported from the dragonvault design's drawInteriorProp(). These are placed
// by hand in data/sanctuary.js rather than rolled from a biome decor list.

function drawBarredDoor(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 11, 0.2);
  rect(ctx, x - 11 * s, y - 30 * s, 22 * s, 31 * s, '#291e1b');
  rect(ctx, x - 9 * s, y - 28 * s, 18 * s, 27 * s, '#17191c');
  rect(ctx, x - 11 * s, y - 31 * s, 22 * s, 4 * s, '#8d563b');
  rect(ctx, x - 12 * s, y - 29 * s, 4 * s, 31 * s, '#6e422f');
  rect(ctx, x + 8 * s, y - 29 * s, 4 * s, 31 * s, '#3d2b25');
  for (let i = -6; i <= 6; i += 4) rect(ctx, x + i * s, y - 27 * s, 2 * s, 26 * s, '#647078');
  rect(ctx, x - 8 * s, y - 16 * s, 17 * s, 2 * s, '#424c53');
  rect(ctx, x + 5 * s, y - 14 * s, 3 * s, 3 * s, '#d59d58');
}

function drawChest(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 13, 0.25);
  polygon(ctx, [
    { x: x - 13 * s, y: y - 11 * s }, { x, y: y - 18 * s },
    { x: x + 13 * s, y: y - 11 * s }, { x, y: y - 4 * s },
  ], '#a45f39', '#3b251e', Math.max(1, s));
  polygon(ctx, [
    { x: x - 13 * s, y: y - 11 * s }, { x, y: y - 4 * s },
    { x, y: y + 7 * s }, { x: x - 13 * s, y },
  ], '#70412e', '#33221e', Math.max(1, s));
  polygon(ctx, [
    { x, y: y - 4 * s }, { x: x + 13 * s, y: y - 11 * s },
    { x: x + 13 * s, y }, { x, y: y + 7 * s },
  ], '#4e3028', '#2a1d1a', Math.max(1, s));
  rect(ctx, x - 13 * s, y - 4 * s, 26 * s, 3 * s, '#3b2924');
  rect(ctx, x - 2 * s, y - 5 * s, 4 * s, 6 * s, '#d2a05e');
}

function drawTorch(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 5, 0.16);
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffb452';
  ctx.beginPath();
  ctx.arc(x, y - 10 * s, 16 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  rect(ctx, x - 2 * s, y - 7 * s, 4 * s, 8 * s, '#8c765c');
  polygon(ctx, [
    { x, y: y - 20 * s }, { x: x + 5 * s, y: y - 12 * s },
    { x, y: y - 7 * s }, { x: x - 5 * s, y: y - 12 * s },
  ], '#f08a38', '#6b3422', Math.max(1, s));
  rect(ctx, x - 1 * s, y - 16 * s, 3 * s, 6 * s, '#ffe08a');
}

function drawRailing(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 12, 0.12);
  rect(ctx, x - 13 * s, y - 18 * s, 3 * s, 20 * s, '#5b382c');
  rect(ctx, x + 10 * s, y - 18 * s, 3 * s, 20 * s, '#342824');
  ctx.strokeStyle = '#8f573b';
  ctx.lineWidth = Math.max(2, 3 * s);
  ctx.beginPath();
  ctx.moveTo(x - 12 * s, y - 16 * s);
  ctx.lineTo(x + 12 * s, y - 16 * s);
  ctx.moveTo(x - 12 * s, y - 5 * s);
  ctx.lineTo(x + 12 * s, y - 5 * s);
  ctx.stroke();
  ctx.strokeStyle = '#302420';
  ctx.lineWidth = Math.max(1, s);
  ctx.beginPath();
  ctx.moveTo(x - 7 * s, y - 15 * s);
  ctx.lineTo(x - 7 * s, y - 3 * s);
  ctx.moveTo(x, y - 15 * s);
  ctx.lineTo(x, y - 3 * s);
  ctx.moveTo(x + 7 * s, y - 15 * s);
  ctx.lineTo(x + 7 * s, y - 3 * s);
  ctx.stroke();
}

function drawPillar(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 12, 0.24);
  rect(ctx, x - 8 * s, y - 35 * s, 16 * s, 35 * s, '#53616b');
  rect(ctx, x - 8 * s, y - 35 * s, 5 * s, 35 * s, '#78838a');
  rect(ctx, x + 4 * s, y - 35 * s, 4 * s, 35 * s, '#2d3a44');
  rect(ctx, x - 11 * s, y - 39 * s, 22 * s, 6 * s, '#8b918e');
  rect(ctx, x - 11 * s, y - 3 * s, 22 * s, 5 * s, '#34424c');
  for (let yy = -28; yy < -5; yy += 8) rect(ctx, x - 8 * s, y + yy * s, 16 * s, 1 * s, '#26333c');
}

function drawTable(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 14, 0.22);
  polygon(ctx, [
    { x: x - 15 * s, y: y - 10 * s }, { x, y: y - 18 * s },
    { x: x + 15 * s, y: y - 10 * s }, { x, y: y - 2 * s },
  ], '#8f5537', '#3b2923', Math.max(1, s));
  rect(ctx, x - 12 * s, y - 4 * s, 4 * s, 11 * s, '#4d3229');
  rect(ctx, x + 8 * s, y - 4 * s, 4 * s, 11 * s, '#352925');
  rect(ctx, x - 5 * s, y - 13 * s, 10 * s, 2 * s, '#c77b4c');
}

function drawHoard(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 16, 0.25);
  const coins = [
    [-13, -2], [-9, -7], [-4, -3], [1, -8], [6, -4],
    [11, -1], [-1, 0], [8, -10], [-7, -11], [3, -14],
  ];
  coins.forEach((coin, i) => {
    let tone = '#b96e28';
    if (i % 3 === 0) tone = '#ffe07a';
    else if (i % 3 === 1) tone = '#d99b32';
    rect(ctx, x + coin[0] * s, y + coin[1] * s, (5 + i % 3) * s, 3 * s, tone);
    rect(ctx, x + (coin[0] + 1) * s, y + (coin[1] - 1) * s, 2 * s, 1 * s, '#fff2a3');
  });
  // A single ruby crowning the pile.
  polygon(ctx, [
    { x: x - 5 * s, y: y - 12 * s }, { x, y: y - 22 * s },
    { x: x + 6 * s, y: y - 12 * s }, { x, y: y - 7 * s },
  ], '#b83d32', '#4e2524', Math.max(1, s));
}

function drawDragonEggs(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 13, 0.2);
  [[-8, 1], [2, 0.9], [10, 0.7]].forEach(([ox, k], i) => {
    ctx.fillStyle = i === 1 ? '#6d8179' : '#88917b';
    ctx.beginPath();
    ctx.ellipse(x + ox * s, y - (11 * k) * s, 6 * k * s, 11 * k * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#293943';
    ctx.stroke();
    rect(ctx, x + (ox - 1) * s, y - (15 * k) * s, 2 * s, 2 * s, '#b7c49a');
  });
}

function drawNest(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 16, 0.2);
  ctx.strokeStyle = '#644431';
  ctx.lineWidth = Math.max(2, 3 * s);
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y - 3 * s, (15 - i) * s, (7 - i * 0.5) * s, -0.08, Math.PI * 0.1, Math.PI * 1.8);
    ctx.stroke();
  }
  rect(ctx, x - 7 * s, y - 7 * s, 4 * s, 2 * s, '#c28c50');
  rect(ctx, x + 4 * s, y - 5 * s, 6 * s, 2 * s, '#9e6b3d');
}

function drawSleepingDragon(ctx, x, y, s) {
  drawObjectShadow(ctx, x, y, s, 25, 0.32);
  ctx.save();
  // Tail curling out to the right.
  ctx.strokeStyle = '#502b31';
  ctx.lineWidth = Math.max(3, 5 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 12 * s, y - 4 * s);
  ctx.quadraticCurveTo(x + 30 * s, y + 2 * s, x + 25 * s, y - 13 * s);
  ctx.quadraticCurveTo(x + 22 * s, y - 21 * s, x + 32 * s, y - 19 * s);
  ctx.stroke();
  ctx.restore();
  // Body, folded wing, head with horns and a half-open golden eye.
  polygon(ctx, [
    { x: x - 19 * s, y: y - 8 * s }, { x: x - 10 * s, y: y - 20 * s }, { x: x + 8 * s, y: y - 21 * s },
    { x: x + 20 * s, y: y - 10 * s }, { x: x + 13 * s, y: y + 2 * s }, { x: x - 8 * s, y: y + 4 * s },
  ], '#733c43', '#2a2026', Math.max(1, s));
  polygon(ctx, [
    { x: x - 3 * s, y: y - 18 * s }, { x: x + 5 * s, y: y - 34 * s }, { x: x + 11 * s, y: y - 17 * s },
    { x: x + 21 * s, y: y - 30 * s }, { x: x + 17 * s, y: y - 8 * s },
  ], '#4a3039', '#251d24', Math.max(1, s));
  polygon(ctx, [
    { x: x - 25 * s, y: y - 11 * s }, { x: x - 17 * s, y: y - 20 * s }, { x: x - 8 * s, y: y - 15 * s },
    { x: x - 11 * s, y: y - 5 * s }, { x: x - 22 * s, y: y - 3 * s },
  ], '#86464a', '#2a2026', Math.max(1, s));
  polygon(ctx, [
    { x: x - 19 * s, y: y - 19 * s }, { x: x - 16 * s, y: y - 27 * s }, { x: x - 12 * s, y: y - 18 * s },
  ], '#d1b082', '#45352e');
  polygon(ctx, [
    { x: x - 25 * s, y: y - 13 * s }, { x: x - 31 * s, y: y - 10 * s }, { x: x - 24 * s, y: y - 7 * s },
  ], '#b98663', '#45352e');
  rect(ctx, x - 21 * s, y - 14 * s, 2 * s, 2 * s, '#ffd263');
  rect(ctx, x - 10 * s, y - 2 * s, 9 * s, 3 * s, '#3d2930');
  rect(ctx, x + 6 * s, y - 3 * s, 8 * s, 3 * s, '#3d2930');
}

// The prop registry. Keys here are what biomes list in their `decor` array.
// `colors` is the owning biome's palette, so rocks pick up local stone tone.
export const DECOR_DRAWERS = {
  tree: (ctx, x, y, s, v) => drawTree(ctx, x, y, s, v),
  pine: (ctx, x, y, s, v) => drawPine(ctx, x, y, s, v),
  deadTree: (ctx, x, y, s, v) => drawDeadTree(ctx, x, y, s, v),
  cactus: (ctx, x, y, s, v) => drawCactus(ctx, x, y, s, v),
  crystal: (ctx, x, y, s, v) => drawCrystalCluster(ctx, x, y, s, v, '#9affef', '#2e91a8'),
  spire: (ctx, x, y, s, v) => drawCrystalCluster(ctx, x, y, s * 1.12, v, '#d7ffff', '#367a91'),
  ice: (ctx, x, y, s, v) => drawCrystalCluster(ctx, x, y, s, v, '#f1ffff', '#64bcd3'),
  mushroom: (ctx, x, y, s, v) => drawMushroom(ctx, x, y, s, v),
  // Rock borrows the biome's own stone color; only soft biomes grow moss.
  rock: (ctx, x, y, s, v, colors) => drawRock(ctx, x, y, s, colors.rock,
    colors.decor.some((t) => ['tree', 'reeds', 'flowers'].includes(t))),
  obsidian: (ctx, x, y, s) => drawRock(ctx, x, y, s, '#211d2c', false),
  vent: (ctx, x, y, s, v) => drawVent(ctx, x, y, s, v),
  flowers: (ctx, x, y, s, v) => drawFlowers(ctx, x, y, s, v),
  reeds: (ctx, x, y, s, v) => drawReeds(ctx, x, y, s, v),
  bones: (ctx, x, y, s, v) => drawBones(ctx, x, y, s, v),
  glow: (ctx, x, y, s, v) => drawGlow(ctx, x, y, s, v),
  obelisk: (ctx, x, y, s, v) => drawObelisk(ctx, x, y, s, v),
  ruin: (ctx, x, y, s, v) => drawRuin(ctx, x, y, s, v),
  spires: (ctx, x, y, s) => drawBasaltSpires(ctx, x, y, s),
  // Interior props (hand-placed by data/sanctuary.js, not rolled from biomes).
  barredDoor: (ctx, x, y, s) => drawBarredDoor(ctx, x, y, s),
  chest: (ctx, x, y, s) => drawChest(ctx, x, y, s),
  torch: (ctx, x, y, s) => drawTorch(ctx, x, y, s),
  railing: (ctx, x, y, s) => drawRailing(ctx, x, y, s),
  pillar: (ctx, x, y, s) => drawPillar(ctx, x, y, s),
  table: (ctx, x, y, s) => drawTable(ctx, x, y, s),
  hoard: (ctx, x, y, s) => drawHoard(ctx, x, y, s),
  dragonEgg: (ctx, x, y, s) => drawDragonEggs(ctx, x, y, s),
  crystalProp: (ctx, x, y, s, v) => drawCrystalCluster(ctx, x, y, s * 0.85, v, '#72f0e8', '#2c7180'),
  nest: (ctx, x, y, s) => drawNest(ctx, x, y, s),
  sleepingDragon: (ctx, x, y, s) => drawSleepingDragon(ctx, x, y, s),
};

// Draws a prop with its base at (x, y). Unknown types are a programming error
// (a biome listed a decor key with no drawer), so fail loudly at bake time.
export function drawDecor(ctx, type, x, y, s, variant, colors) {
  const drawer = DECOR_DRAWERS[type];
  if (!drawer) throw new Error(`drawDecor: no drawer registered for "${type}"`);
  ctx.save();
  ctx.lineWidth = Math.max(1, s);
  ctx.lineJoin = 'miter';
  drawer(ctx, x, y, s, variant, colors);
  ctx.restore();
}
