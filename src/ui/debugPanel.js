// The 3D wyvern debug panel: drive every motion the model has, watch what the
// state machine is actually doing, and tune the scene live. Development
// instrument, not player UI — see docs/WYVERN_DEBUG_PANEL_PLAN.md.
//
// lil-gui and Stats are imported from `three/addons/libs/`, where they ship
// inside the already-approved `three` dependency. Do not add either to
// package.json: it would trip CLAUDE.md's no-new-dependency guardrail for a
// file the project already has on disk.
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import Stats from 'three/addons/libs/stats.module.js';
import { SANCTUARY } from '../config.js';
import {
  TUNING_FOLDERS,
  SESSION_TUNING,
  controlsForFolder,
  partitionMotionSlots,
  resetTuning,
  applyTuning,
  serializeTuning,
} from './debugPanelSchema.js';

// How often the readouts refresh. Polled rather than pushed so the render loop
// stays free of DOM writes — 4 Hz is enough to read and cheap enough to ignore.
const POLL_MS = 250;

/**
 * Mount the panel. One per sanctuary3D instance; BaseScene destroys and
 * recreates both together on every buildWorld().
 *
 * @param {Phaser.Scene} scene - the BaseScene, for movement/resident access
 * @param {object} sanctuary3D - the live 3D layer
 * @returns {{destroy: () => void}}
 */
export function createDragonDebugPanel(scene, sanctuary3D) {
  const gui = new GUI({ title: '🐉 3D Wyvern Debug', width: 300 });
  gui.domElement.classList.add('wyvern-debug-panel');

  const timers = [];
  const poll = (fn) => {
    fn();
    timers.push(setInterval(fn, POLL_MS));
  };

  // ── Status ───────────────────────────────────────────────────────────
  // The motion is decided across three places — the state machine, the
  // one-shot queue, and the override — so without this readout a wrong pose
  // gives no clue which of them produced it.
  const status = gui.addFolder('Status');
  const readout = {
    motion: '—',
    base: '—',
    oneShot: '—',
    override: '—',
    action: '—',
    attitude: '—',
    speed: '—',
    position: '—',
    render: '—',
  };
  // lil-gui has no read-only text row; a disabled string controller is the
  // closest thing, and `.listen()` makes it track the object we poll into.
  const rows = [
    ['motion', 'playing'], ['base', 'base'], ['oneShot', 'one-shot'],
    ['override', 'override'], ['action', 'action'], ['attitude', 'attitude'],
    ['speed', 'speed'], ['position', 'position'], ['render', 'render'],
  ];
  rows.forEach(([key, label]) => {
    status.add(readout, key).name(label).listen().disable();
  });

  poll(() => {
    const motion = sanctuary3D.getMotionState?.() ?? {};
    const movement = scene.movement;
    const footprint = movement?.getLogicalFootprint?.();

    readout.motion = motion.current ?? '—';
    readout.base = motion.timeScale !== 1
      ? `${motion.base ?? '—'} ×${motion.timeScale}`
      : (motion.base ?? '—');
    readout.oneShot = motion.pending ?? '—';
    readout.override = motion.override ?? '—';
    readout.action = motion.action ?? '—';
    readout.attitude = `y${motion.headingDeg}° r${motion.rollDeg}° p${motion.pitchDeg}°`;
    // Altitude is shown as current→target because they differ during a climb,
    // and that gap is exactly what the takeoff/land bracket keys off.
    const altitude = Math.round(movement?.getAltitude?.() ?? 0);
    const target = Math.round(movement?.getTargetAltitude?.() ?? 0);
    readout.speed = `${motion.speed ?? 0} u/s  alt ${altitude}→${target}`
      + `${motion.airborne ? '  air' : ''}`;
    readout.position = footprint
      ? `${Math.round(footprint.col)}, ${Math.round(footprint.row)}`
      : '—';

    const stats = sanctuary3D.getRenderStats?.();
    readout.render = stats
      ? `${stats.calls} calls  ${(stats.triangles / 1000).toFixed(0)}k tris  ${stats.textures} tex`
      : '—';
  });

  // ── Actions ──────────────────────────────────────────────────────────
  // Every slot the model has, not a hand-picked six. Loops are held through
  // setMotion() until cleared; one-shots fire once through triggerAction().
  // Mixing the two channels is Finding A in the plan.
  const actionsFolder = gui.addFolder('Actions');
  const held = { slot: null };

  function forceLoop(slot) {
    held.slot = slot;
    sanctuary3D.setMotion(slot);
  }

  function releaseLoop() {
    held.slot = null;
    sanctuary3D.setMotion(null);
  }

  // The model loads asynchronously, so the slot list may not exist yet.
  let slotsBuilt = false;
  function buildSlotButtons() {
    if (slotsBuilt) return true;
    const slots = sanctuary3D.listMotionSlots?.() ?? [];
    if (!slots.length) return false;
    slotsBuilt = true;

    const { loops, oneShots } = partitionMotionSlots(slots);

    const loopFolder = actionsFolder.addFolder(`Hold a loop (${loops.length})`);
    loops.forEach((slot) => {
      loopFolder.add({ [slot]: () => forceLoop(slot) }, slot);
    });

    const shotFolder = actionsFolder.addFolder(`Fire once (${oneShots.length})`);
    oneShots.forEach((slot) => {
      shotFolder.add({
        [slot]: () => {
          // Dracarys also owns a particle burst that lives on the scene, so the
          // panel fires the same path the roster button does.
          if (slot === 'dracarys') scene.dracarysFromPanel?.(scene.selectedWyvernId);
          else sanctuary3D.triggerAction(slot);
        },
      }, slot);
    });
    return true;
  }

  actionsFolder.add({ 'gameplay state (auto)': releaseLoop }, 'gameplay state (auto)');
  if (!buildSlotButtons()) {
    const slotTimer = setInterval(() => {
      if (buildSlotButtons()) clearInterval(slotTimer);
    }, POLL_MS);
    timers.push(slotTimer);
  }

  // ── Flight ───────────────────────────────────────────────────────────
  // Altitude is a movement-controller concern, not a `setTuning` knob, so it
  // is wired directly rather than through the schema. Everything here drives
  // the eased target — never movement.setAltitude(), which snaps and so skips
  // the takeoff and landing clips entirely (Finding B in the plan).
  const flightCfg = SANCTUARY.movement.flight;
  const flightFolder = gui.addFolder('Flight');
  const flight = {
    altitude: flightCfg.minAltitude,
    climb: () => setAltitude(flightCfg.takeoffAltitude),
    ceiling: () => setAltitude(flightCfg.maxAltitude),
    land: () => setAltitude(flightCfg.minAltitude),
  };

  function setAltitude(value) {
    flight.altitude = value;
    scene.movement?.setTargetAltitude?.(value);
    altitudeSlider.updateDisplay();
  }

  const altitudeSlider = flightFolder
    .add(flight, 'altitude', flightCfg.minAltitude, flightCfg.maxAltitude, 1)
    .name('altitude')
    .onChange((value) => scene.movement?.setTargetAltitude?.(value));
  flightFolder.add(flight, 'climb').name(`take off (${flightCfg.takeoffAltitude})`);
  flightFolder.add(flight, 'ceiling').name(`ceiling (${flightCfg.maxAltitude})`);
  flightFolder.add(flight, 'land').name('land (0)');

  // The wyvern also climbs and dives on the R/Q keys, so the slider has to
  // follow the controller rather than own the value outright.
  poll(() => {
    const target = scene.movement?.getTargetAltitude?.();
    if (!Number.isFinite(target) || target === flight.altitude) return;
    flight.altitude = target;
    altitudeSlider.updateDisplay();
  });

  // ── Tuning folders ───────────────────────────────────────────────────
  // Schema-driven, so a knob is one row in debugPanelSchema.js rather than a
  // slider here plus a listener there plus a readout somewhere else.
  const folders = {};
  TUNING_FOLDERS.forEach((name) => {
    const folder = gui.addFolder(name);
    folders[name] = folder;
    controlsForFolder(name).forEach((control) => {
      const binding = control.kind === 'boolean'
        ? folder.add(SESSION_TUNING, control.param)
        : folder.add(SESSION_TUNING, control.param, control.min, control.max, control.step);
      binding
        .name(control.label)
        .onChange((value) => sanctuary3D.setTuning(control.param, value));
    });
  });

  // ── Session ──────────────────────────────────────────────────────────
  const sessionFolder = gui.addFolder('Session');
  const session = {
    'copy tuning': async () => {
      const text = serializeTuning();
      try {
        await navigator.clipboard.writeText(text);
        session.status = 'copied to clipboard';
      } catch {
        // Clipboard access needs a secure context and a user gesture; a button
        // click qualifies, but a file:// page or a denied permission does not.
        // Falling back to the console still gets the values out.
        console.info('[debugPanel] clipboard blocked, tuning follows:\n' + text);
        session.status = 'blocked — see console';
      }
    },
    'reset tuning': () => {
      resetTuning();
      applyTuning(sanctuary3D);
      gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
      session.status = 'reset to config defaults';
    },
    'rebuild world': () => {
      // buildWorld() destroys this panel and builds a new one, so nothing after
      // this call may touch `gui`.
      scene.buildWorld({ restoreView: scene.captureCameraView() });
    },
    status: '—',
  };
  sessionFolder.add(session, 'copy tuning');
  sessionFolder.add(session, 'reset tuning');
  sessionFolder.add(session, 'rebuild world');
  sessionFolder.add(session, 'status').name('').listen().disable();

  // ── Stats overlay ────────────────────────────────────────────────────
  // Driven off its own rAF rather than the Phaser loop: the panel must not
  // depend on being stepped, and it has to keep reading while the game is
  // paused on a breakpoint.
  const stats = new Stats();
  stats.dom.classList.add('wyvern-debug-stats');
  stats.dom.style.position = 'fixed';
  stats.dom.style.left = '';
  stats.dom.style.right = '316px';
  stats.dom.style.top = '0';
  stats.dom.style.zIndex = '20';
  document.body.appendChild(stats.dom);

  let rafId = requestAnimationFrame(function tick() {
    stats.update();
    rafId = requestAnimationFrame(tick);
  });

  return {
    destroy() {
      timers.forEach(clearInterval);
      timers.length = 0;
      cancelAnimationFrame(rafId);
      stats.dom.remove();
      gui.destroy();
    },
  };
}
