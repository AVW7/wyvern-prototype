// The debug panel's control surface, as data. Pure: no DOM, no lil-gui, no
// `three`, no Phaser — so tests/debugPanelSchema.test.js can check every
// descriptor against the systems it drives without a browser.
//
// The problem this exists to solve: the previous testPanel.js hand-wired each
// slider to a `sanctuary3D.setTuning()` call through a global element id. There
// was no list of what knobs existed, nothing stopped a slider naming a `param`
// setTuning() had never heard of, and nothing survived a world rebuild. Every
// knob is one row here instead, `defaults` are read from config.js rather than
// retyped, and the whole thing serialises back into config.js shape.

import { SANCTUARY } from '../config.js';

const TERRAIN = SANCTUARY.terrain3D;

/**
 * One row per knob. `param` is the name passed to `sanctuary3D.setTuning()` —
 * the test asserts each one is a param that function actually handles, which is
 * what stops a typo here from becoming a slider that silently does nothing.
 *
 * `kind` is 'number' unless stated. Numbers carry min/max/step; `digits` is how
 * many decimals the readout shows.
 */
export const TUNING_CONTROLS = [
  // ── Dragon ───────────────────────────────────────────────────────────
  { folder: 'Dragon', param: 'scale', label: 'Model scale', min: 0.5, max: 3, step: 0.1, digits: 1, default: 1 },
  { folder: 'Dragon', param: 'animationSpeed', label: 'Animation speed', min: 0.1, max: 2.5, step: 0.1, digits: 1, default: 1 },
  { folder: 'Dragon', param: 'wireframe', label: 'Wireframe', kind: 'boolean', default: false },

  // ── Environment ──────────────────────────────────────────────────────
  // Sun and ambient have no config.js home — they are built into the light rig
  // in sanctuary3D.js, so these defaults are the rig's own starting values.
  { folder: 'Environment', param: 'sunIntensity', label: 'Sun intensity', min: 0, max: 3, step: 0.05, digits: 2, default: 0.95 },
  { folder: 'Environment', param: 'ambientIntensity', label: 'Ambient light', min: 0, max: 3, step: 0.05, digits: 2, default: 1.2 },
  { folder: 'Environment', param: 'exposure', label: 'Exposure', min: 0.4, max: 2, step: 0.05, digits: 2, default: TERRAIN.exposure },

  // ── Terrain ──────────────────────────────────────────────────────────
  { folder: 'Terrain', param: 'aoStrength', label: 'Occlusion', min: 0, max: 1, step: 0.02, digits: 2, default: TERRAIN.aoStrength },
  { folder: 'Terrain', param: 'colorJitter', label: 'Tile jitter', min: 0, max: 0.4, step: 0.01, digits: 2, default: TERRAIN.colorJitter },
  { folder: 'Terrain', param: 'fogEnabled', label: 'Distance haze', kind: 'boolean', default: TERRAIN.fog.enabled },
  { folder: 'Terrain', param: 'fogNear', label: 'Haze start', min: 100, max: 2000, step: 20, digits: 0, default: TERRAIN.fog.near },
  { folder: 'Terrain', param: 'fogFar', label: 'Haze end', min: 400, max: 4000, step: 50, digits: 0, default: TERRAIN.fog.far },
  { folder: 'Terrain', param: 'waterSpeed', label: 'Water speed', min: 0, max: 0.2, step: 0.005, digits: 3, default: TERRAIN.water.scrollX },
  { folder: 'Terrain', param: 'lavaGlow', label: 'Lava glow', min: 0.5, max: 6, step: 0.1, digits: 1, default: TERRAIN.lava.emissiveMax },
];

/** Folder order in the panel. Anything not listed sorts to the end. */
export const TUNING_FOLDERS = ['Dragon', 'Environment', 'Terrain'];

export function controlsForFolder(folder) {
  return TUNING_CONTROLS.filter((control) => control.folder === folder);
}

// ── Session tuning store ─────────────────────────────────────────────────
// Module-level so it outlives any one panel or sanctuary3D instance, the same
// reason BaseScene keeps SANCTUARY_SESSION at module scope. buildWorld() tears
// the 3D layer down and builds a fresh one on every recruit; without this,
// every rebuild threw away whatever had just been dialled in.

/** @type {Record<string, number|boolean>} */
export const SESSION_TUNING = {};

/** Restore every knob to its config.js default. */
export function resetTuning() {
  for (const key of Object.keys(SESSION_TUNING)) delete SESSION_TUNING[key];
  TUNING_CONTROLS.forEach(({ param, default: value }) => {
    SESSION_TUNING[param] = value;
  });
  return SESSION_TUNING;
}
resetTuning();

/**
 * Push every stored value at a freshly built 3D layer. Called by BaseScene
 * after createSanctuary3D() so a rebuild resumes where the last one left off.
 */
export function applyTuning(sanctuary3D) {
  if (!sanctuary3D?.setTuning) return;
  TUNING_CONTROLS.forEach(({ param }) => {
    sanctuary3D.setTuning(param, SESSION_TUNING[param]);
  });
}

// ── Export ───────────────────────────────────────────────────────────────

function round(value, digits) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

/**
 * The current tuning as a `config.js`-shaped source fragment, ready to paste
 * over the matching blocks in SANCTUARY. Deliberately source text rather than
 * bare JSON: the destination is a JavaScript literal with comments around it,
 * and a paste that needs hand-editing to compile is a paste that gets fumbled.
 *
 * Only knobs that *have* a config.js home appear. `scale`, `animationSpeed`,
 * `wireframe`, `sunIntensity` and `ambientIntensity` drive the runtime light
 * rig and model transform directly and have nowhere to be written back to, so
 * they are listed in a trailing comment instead of silently dropped.
 */
export function serializeTuning(tuning = SESSION_TUNING) {
  const digitsFor = (param) => TUNING_CONTROLS.find((c) => c.param === param)?.digits ?? 2;
  const n = (param) => round(tuning[param], digitsFor(param));
  const waterScrollX = n('waterSpeed');

  return `// SANCTUARY.terrain3D — paste over the matching keys in src/config.js
exposure: ${n('exposure')},
colorJitter: ${n('colorJitter')},
aoStrength: ${n('aoStrength')},
fog: { enabled: ${tuning.fogEnabled}, color: '${TERRAIN.fog.color}', near: ${n('fogNear')}, far: ${n('fogFar')} },
water: { scrollX: ${waterScrollX}, scrollY: ${round(waterScrollX * 0.6, 3)}, lift: ${TERRAIN.water.lift}, opacity: ${TERRAIN.water.opacity}, roughness: ${TERRAIN.water.roughness} },
lava: { emissiveMin: ${TERRAIN.lava.emissiveMin}, emissiveMax: ${n('lavaGlow')}, breatheHz: ${TERRAIN.lava.breatheHz}, lightIntensity: ${TERRAIN.lava.lightIntensity}, lightRange: ${TERRAIN.lava.lightRange} },

// Runtime-only, no config.js home — set these in sanctuary3D.js if you want them kept:
// scale ${n('scale')}  animationSpeed ${n('animationSpeed')}  wireframe ${tuning.wireframe}
// sunIntensity ${n('sunIntensity')}  ambientIntensity ${n('ambientIntensity')}`;
}

// ── Motion slots ─────────────────────────────────────────────────────────

/**
 * Split the motion slots into the two channels the panel drives them through.
 * A one-shot plays once and hands back (`triggerAction`); everything else is a
 * looping base motion that stays until cleared (`setMotion`). Sending a base
 * loop down the one-shot channel is the bug this split exists to prevent — see
 * Finding A in docs/WYVERN_DEBUG_PANEL_PLAN.md.
 *
 * @param {string[]} slots - from sanctuary3D.listMotionSlots()
 */
export function partitionMotionSlots(slots = []) {
  const oneShots = new Set(SANCTUARY.dragon3D?.oneShotClips || []);
  return {
    loops: slots.filter((slot) => !oneShots.has(slot)),
    oneShots: slots.filter((slot) => oneShots.has(slot)),
  };
}

export function isOneShot(slot) {
  return (SANCTUARY.dragon3D?.oneShotClips || []).includes(slot);
}
