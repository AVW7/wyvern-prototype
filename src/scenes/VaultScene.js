// VaultScene: a focused 3D chamber. The authored sanctuary interior is the backdrop
// rendered in Three.js. This scene owns only the 3D diorama and the exit.
import { SANCTUARY } from '../config.js';
import {
  buildSanctuaryView,
} from '../systems/sanctuaryRender.js';
import { buildSanctuaryInterior } from '../data/sanctuary.js';
import { buildVaultOverlay } from '../ui/vaultPanel.js';
import { createSanctuary3D } from '../systems/sanctuary3D.js';
import { KeyboardAction, addActionKeys, isActionDown } from '../input/keyboardActions.js';

// Degrees of yaw per unit of horizontal wheel delta (touchpad two-finger swipe).
const WHEEL_YAW_SENS = 0.2;

export default class VaultScene extends Phaser.Scene {
  constructor() {
    super('Vault');
  }

  create() {
    this.world = null;
    this.sanctuary3D = null;

    this.buildWorld();
    this.buildOverlay();

    this.bindCameraInput();

    this.events.once('shutdown', () => this.cleanUp());
  }

  // Free-orbit camera controls sharing the sanctuary's interaction feel:
  // left-drag orbits, right/middle/Shift-drag pans, wheel zooms, and a plain
  // click (no drag) still selects the exit tile. Keyboard mirrors the
  // sanctuary rig keys: [ ] rotate, PageUp/PageDown tilt, Home reset.
  bindCameraInput() {
    this.input.mouse?.disableContextMenu();

    this.drag = {
      active: false, mode: null, lastX: 0, lastY: 0, startX: 0, startY: 0, movedBy: 0,
    };

    this.input.on('pointerdown', (pointer) => {
      this.drag.active = true;
      this.drag.startX = pointer.x;
      this.drag.startY = pointer.y;
      this.drag.lastX = pointer.x;
      this.drag.lastY = pointer.y;
      this.drag.movedBy = 0;
      const panning = pointer.rightButtonDown?.() || pointer.middleButtonDown?.()
        || isActionDown(this.panModifierKeys);
      this.drag.mode = panning ? 'pan' : 'orbit';
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.drag.active || !this.sanctuary3D) return;
      const dx = pointer.x - this.drag.lastX;
      const dy = pointer.y - this.drag.lastY;
      this.drag.lastX = pointer.x;
      this.drag.lastY = pointer.y;
      this.drag.movedBy = Math.max(
        this.drag.movedBy,
        Math.hypot(pointer.x - this.drag.startX, pointer.y - this.drag.startY),
      );
      if (this.drag.mode === 'pan') {
        this.sanctuary3D.panBy(dx, dy);
      } else {
        this.sanctuary3D.orbitBy(dx * 0.4, -dy * 0.3);
      }
    });

    const endDrag = (pointer) => {
      if (!this.drag.active) return;
      this.drag.active = false;
      // A gesture that never moved past the slop is a click: test the exit tile.
      if (this.drag.movedBy <= SANCTUARY.dragClickSlop && this.sanctuary3D) {
        const cell = this.sanctuary3D.unprojectClick(pointer.x, pointer.y);
        if (cell) {
          const exit = this.world.placed.decor.find((decor) => decor.type === 'glow');
          if (exit && cell.col === exit.col && cell.row === exit.row) {
            this.stepOutside();
          }
        }
      }
    };
    this.input.on('pointerup', endDrag);
    this.input.on('pointerupoutside', endDrag);
    this.input.on('gameout', () => { this.drag.active = false; });

    // Touchpad: horizontal two-finger swipe rotates (yaw), vertical swipe zooms;
    // dominant axis wins. A mouse wheel only reports deltaY, so it always zooms.
    this.input.on('wheel', (pointer, objects, deltaX, deltaY) => {
      if (!this.sanctuary3D) return;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        this.sanctuary3D.orbitBy(deltaX * WHEEL_YAW_SENS, 0);
        return;
      }
      if (deltaY === 0) return;
      this.sanctuary3D.zoomBy(deltaY < 0 ? SANCTUARY.zoom.step : 1 / SANCTUARY.zoom.step);
    });

    // Keyboard rig — mirrors sanctuaryCamera's bracket / PageUp / PageDown /
    // Home. Bindings live in input/keyboardActions.js.
    this.panModifierKeys = addActionKeys(this.input.keyboard, KeyboardAction.VaultCameraPanModifier);
    this.yawLeftKeys = addActionKeys(this.input.keyboard, KeyboardAction.VaultCameraYawLeft);
    this.yawRightKeys = addActionKeys(this.input.keyboard, KeyboardAction.VaultCameraYawRight);
    this.tiltUpKeys = addActionKeys(this.input.keyboard, KeyboardAction.VaultCameraTiltUp);
    this.tiltDownKeys = addActionKeys(this.input.keyboard, KeyboardAction.VaultCameraTiltDown);
    this.homeKeys = addActionKeys(this.input.keyboard, KeyboardAction.VaultCameraHome);
    this.yawLeftKeys.forEach((key) => key.on('down', () => this.sanctuary3D?.stepYaw(-1)));
    this.yawRightKeys.forEach((key) => key.on('down', () => this.sanctuary3D?.stepYaw(1)));
    this.tiltUpKeys.forEach((key) => key.on('down', () => this.sanctuary3D?.stepTilt(1)));
    this.tiltDownKeys.forEach((key) => key.on('down', () => this.sanctuary3D?.stepTilt(-1)));
    this.homeKeys.forEach((key) => key.on('down', () => this.sanctuary3D?.resetCamera()));
  }

  update(time, delta) {
    if (this.sanctuary3D) {
      this.sanctuary3D.update(delta);
    }
  }

  buildWorld() {
    const { tiles } = buildSanctuaryInterior();
    this.world = buildSanctuaryView(this, SANCTUARY.VIEWS.INSIDE, tiles);

    // Instantiate 3D diorama (empty of residents)
    this.sanctuary3D = createSanctuary3D({
      scene: this,
      tiles,
      interactions: [],
      residents: [],
      selectedWyvernId: null,
    });

    if (this.sanctuary3D) {
      this.sanctuary3D.show();
      this.sanctuary3D.enableFreeCamera();
    }
  }

  buildOverlay() {
    buildVaultOverlay({
      onTravel: () => this.stepOutside(),
      onAtlas: () => { this.cleanUp(); this.scene.start('Atlas'); },
      onCameraRig: (action) => this.handleCameraRig(action),
    });
  }

  handleCameraRig(action) {
    if (!this.sanctuary3D) return;
    if (action === 'yaw-left') this.sanctuary3D.stepYaw(-1);
    else if (action === 'yaw-right') this.sanctuary3D.stepYaw(1);
    else if (action === 'tilt-up') this.sanctuary3D.stepTilt(1);
    else if (action === 'tilt-down') this.sanctuary3D.stepTilt(-1);
    else if (action === 'reset') this.sanctuary3D.resetCamera();
  }

  cleanUp() {
    // Detach rig keys from the global keyboard plugin; pointer/wheel listeners
    // are released with the scene's input on shutdown.
    [
      ...this.yawLeftKeys, ...this.yawRightKeys, ...this.tiltUpKeys,
      ...this.tiltDownKeys, ...this.homeKeys,
    ].forEach((key) => key?.removeAllListeners?.('down'));
    if (this.sanctuary3D) {
      this.sanctuary3D.destroy();
      this.sanctuary3D = null;
    }
    const overlay = document.getElementById('ui-overlay');
    if (overlay) overlay.innerHTML = '';
  }

  stepOutside() {
    this.cleanUp();
    this.scene.start('Base');
  }
}
