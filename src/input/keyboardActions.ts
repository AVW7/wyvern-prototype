// Single source of truth for every rebindable keyboard action in the game.
// Consumers resolve an action's physical key(s) here instead of hardcoding
// Phaser key names/codes inline, so a rebind only ever touches this file.

export type KeyBinding = string | number;

export const KeyboardAction = {
  // Mission flight control — src/entities/Wyvern.js
  MissionMoveUp: 'mission.moveUp',
  MissionMoveDown: 'mission.moveDown',
  MissionMoveLeft: 'mission.moveLeft',
  MissionMoveRight: 'mission.moveRight',
  MissionAttack: 'mission.attack',

  // Sanctuary resident movement — src/systems/sanctuaryMovement.js
  SanctuaryMoveUp: 'sanctuary.moveUp',
  SanctuaryMoveDown: 'sanctuary.moveDown',
  SanctuaryMoveLeft: 'sanctuary.moveLeft',
  SanctuaryMoveRight: 'sanctuary.moveRight',
  SanctuaryFlyAscend: 'sanctuary.flyAscend',
  SanctuaryFlyDescend: 'sanctuary.flyDescend',

  // Sanctuary resident interaction — src/systems/sanctuaryInteractions.js
  SanctuaryInteract: 'sanctuary.interact',

  // Sanctuary camera rig — src/systems/sanctuaryCamera.js
  SanctuaryCameraPanModifier: 'sanctuaryCamera.panModifier',
  SanctuaryCameraToggleFollow: 'sanctuaryCamera.toggleFollow',
  SanctuaryCameraHome: 'sanctuaryCamera.home',
  SanctuaryCameraYawLeft: 'sanctuaryCamera.yawLeft',
  SanctuaryCameraYawRight: 'sanctuaryCamera.yawRight',
  SanctuaryCameraTiltDown: 'sanctuaryCamera.tiltDown',
  SanctuaryCameraTiltUp: 'sanctuaryCamera.tiltUp',

  // Vault camera rig — src/scenes/VaultScene.js (mirrors the sanctuary rig)
  VaultCameraPanModifier: 'vaultCamera.panModifier',
  VaultCameraHome: 'vaultCamera.home',
  VaultCameraYawLeft: 'vaultCamera.yawLeft',
  VaultCameraYawRight: 'vaultCamera.yawRight',
  VaultCameraTiltDown: 'vaultCamera.tiltDown',
  VaultCameraTiltUp: 'vaultCamera.tiltUp',

  // Atlas camera — src/scenes/AtlasScene.js
  AtlasCameraPanModifier: 'atlasCamera.panModifier',

  // BaseScene debug/experimental actions — src/scenes/BaseScene.js
  DebugToggleFlight: 'debug.toggleFlight',
  Dracarys: 'debug.dracarys', // Shift is checked at the call site
} as const;

export type KeyboardAction = (typeof KeyboardAction)[keyof typeof KeyboardAction];

// Each action lists every physical key that satisfies it; more than one entry
// means any one of them works (e.g. WASD alongside arrow keys). Numeric codes
// are used for punctuation/nav keys to avoid browser/keyboard-layout aliases
// (see sanctuaryCamera's original comment on the bracket keys).
const BINDINGS: Record<KeyboardAction, readonly KeyBinding[]> = {
  [KeyboardAction.MissionMoveUp]: ['W', 'UP'],
  [KeyboardAction.MissionMoveDown]: ['S', 'DOWN'],
  [KeyboardAction.MissionMoveLeft]: ['A', 'LEFT'],
  [KeyboardAction.MissionMoveRight]: ['D', 'RIGHT'],
  [KeyboardAction.MissionAttack]: ['SPACE'],

  [KeyboardAction.SanctuaryMoveUp]: ['W', 'UP'],
  [KeyboardAction.SanctuaryMoveDown]: ['S', 'DOWN'],
  [KeyboardAction.SanctuaryMoveLeft]: ['A', 'LEFT'],
  [KeyboardAction.SanctuaryMoveRight]: ['D', 'RIGHT'],
  [KeyboardAction.SanctuaryFlyAscend]: ['R'],
  [KeyboardAction.SanctuaryFlyDescend]: ['Q'],

  [KeyboardAction.SanctuaryInteract]: ['E'],

  [KeyboardAction.SanctuaryCameraPanModifier]: ['SPACE'],
  [KeyboardAction.SanctuaryCameraToggleFollow]: ['F'],
  [KeyboardAction.SanctuaryCameraHome]: ['HOME'],
  [KeyboardAction.SanctuaryCameraYawLeft]: [219], // [
  [KeyboardAction.SanctuaryCameraYawRight]: [221], // ]
  [KeyboardAction.SanctuaryCameraTiltDown]: [34], // PageDown
  [KeyboardAction.SanctuaryCameraTiltUp]: [33], // PageUp

  [KeyboardAction.VaultCameraPanModifier]: ['SHIFT'],
  [KeyboardAction.VaultCameraHome]: ['HOME'],
  [KeyboardAction.VaultCameraYawLeft]: [219],
  [KeyboardAction.VaultCameraYawRight]: [221],
  [KeyboardAction.VaultCameraTiltDown]: [34],
  [KeyboardAction.VaultCameraTiltUp]: [33],

  [KeyboardAction.AtlasCameraPanModifier]: ['SPACE'],

  [KeyboardAction.DebugToggleFlight]: ['G'],
  [KeyboardAction.Dracarys]: ['D'],
};

export function keyBindingsFor(action: KeyboardAction): readonly KeyBinding[] {
  return BINDINGS[action];
}

/**
 * Flattens the string-named bindings of several actions into a Phaser
 * `addKeys()`-compatible comma list. For consumers whose internal logic
 * addresses individual Phaser key names directly (e.g. legacy WASD checks
 * shared with vitest mocks), keeping this in the source of truth still means
 * a rebind only ever adds/removes a key name here.
 */
export function keyNameList(...actions: KeyboardAction[]): string {
  const names = new Set<string>();
  for (const action of actions) {
    for (const binding of BINDINGS[action]) {
      if (typeof binding === 'string') names.add(binding);
    }
  }
  return [...names].join(',');
}

/**
 * Registers every physical key backing `action` on a Phaser keyboard plugin.
 * `isActionDown`/`isActionJustDown` below treat the result as "any bound key
 * is active", matching how the existing WASD/arrow pairs already behave.
 */
export function addActionKeys(
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin | undefined,
  action: KeyboardAction,
): Phaser.Input.Keyboard.Key[] {
  const keys: Phaser.Input.Keyboard.Key[] = [];
  for (const binding of BINDINGS[action]) {
    const key = keyboard?.addKey(binding);
    if (key) keys.push(key);
  }
  return keys;
}

export function isActionDown(keys: readonly Phaser.Input.Keyboard.Key[]): boolean {
  return keys.some((key) => key.isDown);
}

export function isActionJustDown(keys: readonly Phaser.Input.Keyboard.Key[]): boolean {
  return keys.some((key) => Phaser.Input.Keyboard.JustDown(key));
}

export interface ActionKeyBinding {
  keys: Phaser.Input.Keyboard.Key[];
  dispose: () => void;
}

/**
 * Registers a 'down' listener for a discrete action, applying the repeat
 * guard used throughout the camera rigs and the interaction system. Returns
 * a disposer that removes the listener from every bound key.
 */
export function onActionDown(
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin | undefined,
  action: KeyboardAction,
  handler: () => void,
): ActionKeyBinding {
  const keys = addActionKeys(keyboard, action);
  // Only the native event carries a `repeat` flag; Key has no such property.
  const listener = (_key: Phaser.Input.Keyboard.Key, event?: KeyboardEvent) => {
    if (event?.repeat) return;
    handler();
  };
  keys.forEach((key) => key.on('down', listener));
  return {
    keys,
    dispose: () => keys.forEach((key) => key.off('down', listener)),
  };
}

/**
 * Registers a scene-level `keydown-<NAME>` listener (Phaser's global key
 * event form) for actions whose call sites need the raw KeyboardEvent, e.g.
 * to read modifier keys. Only string key names support this event form.
 */
export function onKeydown(
  keyboard: Phaser.Input.Keyboard.KeyboardPlugin | undefined,
  action: KeyboardAction,
  handler: (event: KeyboardEvent) => void,
): void {
  for (const binding of BINDINGS[action]) {
    if (typeof binding === 'string') keyboard?.on(`keydown-${binding}`, handler);
  }
}
