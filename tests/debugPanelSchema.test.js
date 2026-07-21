import { describe, expect, it } from 'vitest';
import {
  TUNING_CONTROLS,
  TUNING_FOLDERS,
  SESSION_TUNING,
  controlsForFolder,
  partitionMotionSlots,
  resetTuning,
  applyTuning,
  serializeTuning,
  isOneShot,
} from '../src/ui/debugPanelSchema.js';
import { SANCTUARY } from '../src/config.js';

// Every `param` the schema names is passed straight to sanctuary3D.setTuning().
// That function is one long if-chain over string literals, so a typo in the
// schema produces a slider that moves and does nothing — silently, forever.
// Rather than import the 2,300-line Three.js module (it touches WebGL at
// import time), read the parameter names back out of its source.
import { readFileSync } from 'node:fs';

// Resolved from the repo root rather than import.meta.url: the suite runs in
// the jsdom environment, where import.meta.url is an http:// URL that
// readFileSync rejects.
const SANCTUARY_3D_SOURCE = readFileSync('src/systems/sanctuary3D.js', 'utf8');

function paramsHandledBySetTuning() {
  const body = SANCTUARY_3D_SOURCE.slice(
    SANCTUARY_3D_SOURCE.indexOf('setTuning(param, value) {'),
  );
  const end = body.indexOf('\n    },');
  const handled = new Set();
  for (const match of body.slice(0, end).matchAll(/param === '([a-zA-Z]+)'/g)) {
    handled.add(match[1]);
  }
  return handled;
}

describe('tuning schema', () => {
  it('names only parameters setTuning() actually handles', () => {
    const handled = paramsHandledBySetTuning();
    // Guard the guard: if the parse breaks, every assertion below passes
    // vacuously and the test becomes decoration.
    expect(handled.size).toBeGreaterThan(5);

    const unknown = TUNING_CONTROLS
      .map((control) => control.param)
      .filter((param) => !handled.has(param));
    expect(unknown).toEqual([]);
  });

  it('has no duplicate parameters', () => {
    const params = TUNING_CONTROLS.map((control) => control.param);
    expect(new Set(params).size).toBe(params.length);
  });

  it('places every control in a declared folder', () => {
    const declared = new Set(TUNING_FOLDERS);
    TUNING_CONTROLS.forEach((control) => {
      expect(declared.has(control.folder), control.param).toBe(true);
    });
    // And every declared folder has something in it.
    TUNING_FOLDERS.forEach((folder) => {
      expect(controlsForFolder(folder).length, folder).toBeGreaterThan(0);
    });
  });

  it('gives numeric controls a range their default sits inside', () => {
    TUNING_CONTROLS.filter((control) => control.kind !== 'boolean').forEach((control) => {
      expect(Number.isFinite(control.min), control.param).toBe(true);
      expect(Number.isFinite(control.max), control.param).toBe(true);
      expect(control.max, control.param).toBeGreaterThan(control.min);
      expect(control.default, control.param).toBeGreaterThanOrEqual(control.min);
      expect(control.default, control.param).toBeLessThanOrEqual(control.max);
    });
  });

  it('gives boolean controls a boolean default and no range', () => {
    TUNING_CONTROLS.filter((control) => control.kind === 'boolean').forEach((control) => {
      expect(typeof control.default, control.param).toBe('boolean');
      expect(control.min, control.param).toBeUndefined();
    });
  });
});

describe('session tuning store', () => {
  it('seeds one entry per control from the config defaults', () => {
    resetTuning();
    expect(Object.keys(SESSION_TUNING).sort())
      .toEqual(TUNING_CONTROLS.map((control) => control.param).sort());
    expect(SESSION_TUNING.exposure).toBe(SANCTUARY.terrain3D.exposure);
    expect(SESSION_TUNING.lavaGlow).toBe(SANCTUARY.terrain3D.lava.emissiveMax);
  });

  it('restores defaults after being changed', () => {
    resetTuning();
    SESSION_TUNING.exposure = 1.87;
    SESSION_TUNING.fogEnabled = !SANCTUARY.terrain3D.fog.enabled;
    resetTuning();
    expect(SESSION_TUNING.exposure).toBe(SANCTUARY.terrain3D.exposure);
    expect(SESSION_TUNING.fogEnabled).toBe(SANCTUARY.terrain3D.fog.enabled);
  });

  it('pushes every stored value at a rebuilt 3D layer', () => {
    resetTuning();
    SESSION_TUNING.exposure = 1.4;
    const applied = [];
    applyTuning({ setTuning: (param, value) => applied.push([param, value]) });

    expect(applied.length).toBe(TUNING_CONTROLS.length);
    expect(applied).toContainEqual(['exposure', 1.4]);
  });

  it('is a no-op against a layer that has already been torn down', () => {
    expect(() => applyTuning(null)).not.toThrow();
    expect(() => applyTuning({})).not.toThrow();
  });
});

describe('serializeTuning', () => {
  it('emits the changed values into config.js-shaped source', () => {
    resetTuning();
    SESSION_TUNING.exposure = 1.4;
    SESSION_TUNING.aoStrength = 0.6;
    SESSION_TUNING.fogNear = 800;
    const text = serializeTuning();

    expect(text).toContain('exposure: 1.4,');
    expect(text).toContain('aoStrength: 0.6,');
    expect(text).toContain('near: 800');
    // The fog colour is not tunable, so it has to survive from config
    // untouched — a paste that drops it would band the horizon.
    expect(text).toContain(`color: '${SANCTUARY.terrain3D.fog.color}'`);
  });

  it('derives the second water scroll rate from the first', () => {
    resetTuning();
    SESSION_TUNING.waterSpeed = 0.05;
    expect(serializeTuning()).toContain('scrollX: 0.05, scrollY: 0.03');
  });

  it('records runtime-only knobs in a comment rather than dropping them', () => {
    resetTuning();
    SESSION_TUNING.scale = 2.5;
    const text = serializeTuning();
    expect(text).toContain('scale 2.5');
    // ...and does not pretend they belong to a config block.
    expect(text).not.toMatch(/^\s*scale: /m);
  });

  it('reads the passed-in tuning rather than only the module store', () => {
    resetTuning();
    expect(serializeTuning({ ...SESSION_TUNING, exposure: 0.9 })).toContain('exposure: 0.9,');
  });
});

describe('partitionMotionSlots', () => {
  it('splits the configured slots by the oneShotClips list', () => {
    const slots = Object.keys(SANCTUARY.dragon3D.clips);
    const { loops, oneShots } = partitionMotionSlots(slots);

    expect(loops.length + oneShots.length).toBe(slots.length);
    // Both channels must be non-empty or the panel shows an empty folder.
    expect(loops.length).toBeGreaterThan(0);
    expect(oneShots.length).toBeGreaterThan(0);

    expect(oneShots).toContain('attack');
    expect(oneShots).toContain('dracarys');
    expect(loops).toContain('idle');
    expect(loops).toContain('walk');
    expect(loops).toContain('fly');
  });

  it('never routes a looping slot down the one-shot channel', () => {
    // sanctuary3D.triggerAction() only builds LoopOnce actions for the slots in
    // oneShotClips; firing anything else leaves the model frozen on that clip
    // because the mixer's `finished` event never arrives.
    const { loops } = partitionMotionSlots(Object.keys(SANCTUARY.dragon3D.clips));
    loops.forEach((slot) => expect(isOneShot(slot), slot).toBe(false));
  });

  it('tolerates an empty list, which is what a still-loading model reports', () => {
    expect(partitionMotionSlots([])).toEqual({ loops: [], oneShots: [] });
    expect(partitionMotionSlots()).toEqual({ loops: [], oneShots: [] });
  });
});

describe('config clip table', () => {
  it('binds every one-shot slot to a real clip entry', () => {
    const clips = SANCTUARY.dragon3D.clips;
    SANCTUARY.dragon3D.oneShotClips.forEach((slot) => {
      expect(clips[slot], slot).toBeTruthy();
    });
  });
});
