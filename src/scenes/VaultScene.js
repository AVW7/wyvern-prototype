// VaultScene: the Emberkeep Dragon Vault showcase. The authored sanctuary
// interior remains a canvas-rendered diorama; profile selection and controls
// are HTML/CSS, while the selected wyvern is previewed on the central dais.
import {
  ISO, SANCTUARY, WYVERN_STATES, WYVERN_ART,
} from '../config.js';
import { gridToScreen, sortByDepth } from '../systems/iso.js';
import {
  buildSanctuaryView, animateSanctuaryProps,
} from '../systems/sanctuaryRender.js';
import { buildSanctuaryInterior, VAULT_PREVIEW_SPOT } from '../data/sanctuary.js';
import { wyvernAnimationKey } from '../data/wyverns.js';
import { getShowcaseWyverns } from '../systems/roster.js';
import { buildVaultOverlay, VAULT_ACTIONS } from '../ui/vaultPanel.js';

const ONE_SHOT_ACTIONS = new Set([
  WYVERN_STATES.ATTACK,
  WYVERN_STATES.HURT,
  WYVERN_STATES.DEATH,
]);
const PLACEHOLDER_ACTION_MS = {
  [WYVERN_STATES.ATTACK]: 560,
  [WYVERN_STATES.HURT]: 620,
  [WYVERN_STATES.DEATH]: 900,
};

export default class VaultScene extends Phaser.Scene {
  constructor() {
    super('Vault');
  }

  create() {
    this.world = null;
    this.wyverns = getShowcaseWyverns();
    this.selectedWyvernId = this.wyverns[0]?.id;
    this.activeAction = WYVERN_STATES.IDLE;
    this.previewToken = 0;
    this.previewTimer = null;

    this.buildWorld();
    this.spawnPreview();
    this.buildOverlay();

    this.events.once('shutdown', () => this.cleanUp());
  }

  buildWorld() {
    const { tiles } = buildSanctuaryInterior();
    this.world = buildSanctuaryView(this, SANCTUARY.VIEWS.INSIDE, tiles);
    sortByDepth(this.world.layer);
    animateSanctuaryProps(this, this.world.placed);
    this.wireExit();
  }

  // The daylight glow over the entry bridge remains the in-world way outside.
  wireExit() {
    const exit = this.world.placed.decor.find((decor) => decor.type === 'glow');
    if (!exit) return;
    exit.sprite.setInteractive({ useHandCursor: true });
    exit.sprite.on('pointerdown', () => this.stepOutside());
  }

  selectedWyvern() {
    return this.wyverns.find((wyvern) => wyvern.id === this.selectedWyvernId);
  }

  selectWyvern(id) {
    if (!this.wyverns.some((wyvern) => wyvern.id === id)) return;
    this.selectedWyvernId = id;
    this.spawnPreview();
    this.buildOverlay();
  }

  spawnPreview() {
    this.cancelPendingPreview();
    if (this.previewSprite) this.previewSprite.destroy();

    const wyvern = this.selectedWyvern();
    if (!wyvern) return;

    const { x, y } = gridToScreen(VAULT_PREVIEW_SPOT.col, VAULT_PREVIEW_SPOT.row);
    const baseY = y + ISO.tileHeight / 2;
    this.previewBase = { x, y: baseY };
    this.previewSprite = this.add.sprite(
      x, baseY, wyvern.assetKey, wyvern.atlas?.animations.idle[0],
    );
    this.previewSprite.setOrigin(0.5, 0.85);
    this.previewScale = WYVERN_ART.placeholderPreviewScale;
    this.previewSprite.setScale(this.previewScale);
    this.previewSprite.setData('depth', baseY + 2);
    this.world.layer.add(this.previewSprite);

    sortByDepth(this.world.layer);
    this.playPreviewAction(WYVERN_STATES.IDLE, false);
  }

  buildOverlay() {
    buildVaultOverlay({
      wyverns: this.wyverns,
      selectedId: this.selectedWyvernId,
      activeAction: this.activeAction,
      onSelect: (id) => this.selectWyvern(id),
      onAction: (action) => this.playPreviewAction(action),
      onTravel: () => this.stepOutside(),
    });
  }

  playPreviewAction(action, rebuildOverlay = true) {
    if (!this.previewSprite || !VAULT_ACTIONS.includes(action)) return;
    const wyvern = this.selectedWyvern();
    const animationKey = wyvernAnimationKey(wyvern, action);
    const animation = this.anims.get(animationKey);
    if (!animation) return;

    this.cancelPendingPreview();
    this.previewScale = this.previewScaleFor(animation, wyvern);
    this.resetPreviewSprite();
    this.activeAction = action;
    const token = ++this.previewToken;
    this.previewSprite.play(animationKey);

    const usesPlaceholder = animation.frames.length <= 1;
    if (usesPlaceholder) this.playPlaceholderEffect(action);

    if (ONE_SHOT_ACTIONS.has(action)) {
      if (usesPlaceholder) {
        this.previewTimer = this.time.delayedCall(PLACEHOLDER_ACTION_MS[action], () => {
          if (token === this.previewToken) this.playPreviewAction(WYVERN_STATES.IDLE);
        });
      } else {
        this.previewSprite.once('animationcomplete', (completedAnimation) => {
          if (completedAnimation.key === animationKey && token === this.previewToken) {
            this.playPreviewAction(WYVERN_STATES.IDLE);
          }
        });
      }
    }

    if (rebuildOverlay) this.buildOverlay();
  }

  previewScaleFor(animation, wyvern) {
    if (!wyvern.atlas) return WYVERN_ART.placeholderPreviewScale;
    const firstFrame = animation.frames[0]?.frame;
    const frameHeight = firstFrame?.realHeight || firstFrame?.height || 1;
    return WYVERN_ART.vaultPreviewHeight / frameHeight;
  }

  // Generated one-frame textures still communicate the action. These tweens
  // stop being used automatically once a real multi-frame atlas is registered.
  playPlaceholderEffect(action) {
    const sprite = this.previewSprite;
    const { x, y } = this.previewBase;
    if (action === WYVERN_STATES.IDLE) {
      this.tweens.add({
        targets: sprite, y: y - 5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else if (action === WYVERN_STATES.FLY) {
      this.tweens.add({
        targets: sprite, x: x + 8, y: y - 22, duration: 560, yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (action === WYVERN_STATES.GUARD) {
      sprite.setTint(0xb9ddff);
      this.tweens.add({
        targets: sprite,
        scaleX: this.previewScale * 1.08,
        scaleY: this.previewScale * 0.94,
        duration: 480,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (action === WYVERN_STATES.ATTACK) {
      this.tweens.add({
        targets: sprite,
        x: x + 34,
        scaleX: this.previewScale * 1.12,
        duration: 160,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    } else if (action === WYVERN_STATES.HURT) {
      sprite.setTint(0xff6b6b);
      this.tweens.add({
        targets: sprite, x: x + 7, duration: 55, yoyo: true, repeat: 4, ease: 'Sine.easeInOut',
      });
    } else if (action === WYVERN_STATES.DEATH) {
      this.tweens.add({
        targets: sprite, angle: 82, alpha: 0.22, y: y + 20, duration: 720, ease: 'Quad.easeIn',
      });
    }
  }

  resetPreviewSprite() {
    this.tweens.killTweensOf(this.previewSprite);
    this.previewSprite.removeAllListeners('animationcomplete');
    this.previewSprite.stop();
    this.previewSprite.clearTint();
    this.previewSprite.setPosition(this.previewBase.x, this.previewBase.y);
    this.previewSprite.setScale(this.previewScale);
    this.previewSprite.setAngle(0);
    this.previewSprite.setAlpha(1);
  }

  cancelPendingPreview() {
    if (this.previewTimer) {
      this.previewTimer.remove(false);
      this.previewTimer = null;
    }
    this.previewToken += 1;
  }

  cleanUp() {
    this.cancelPendingPreview();
    const overlay = document.getElementById('ui-overlay');
    if (overlay) overlay.innerHTML = '';
  }

  stepOutside() {
    this.cleanUp();
    this.scene.start('Base');
  }
}
