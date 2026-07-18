// VaultScene: a focused dragon-rendering laboratory. The authored sanctuary
// interior remains the backdrop; this scene owns only asset inspection,
// animation preview, presentation tuning, and the existing exit.
import {
  ISO, SANCTUARY, WYVERN_STATES, WYVERN_ART,
} from '../config.js';
import { gridToScreen, sortByDepth } from '../systems/iso.js';
import {
  buildSanctuaryView, animateSanctuaryProps,
} from '../systems/sanctuaryRender.js';
import { buildSanctuaryInterior, VAULT_PREVIEW_SPOT } from '../data/sanctuary.js';
import {
  firstUsableWyvernFrame,
  ONE_SHOT_WYVERN_STATES,
} from '../systems/wyvernAtlas.js';
import {
  resolveWyvernVisual, scaleWyvernVisual, wyvernAccentColor,
} from '../systems/wyvernPresentation.js';
import {
  wyvernAnimationKey, wyvernAtlasDataKey,
} from '../data/wyverns.js';
import { getShowcaseWyverns } from '../systems/roster.js';
import {
  buildVaultOverlay, updateVaultDiagnostics, VAULT_ACTIONS,
} from '../ui/vaultPanel.js';

const ONE_SHOT_ACTIONS = new Set(ONE_SHOT_WYVERN_STATES);
const PLACEHOLDER_ACTION_MS = {
  [WYVERN_STATES.ATTACK]: 560,
  [WYVERN_STATES.SPECIAL]: 760,
  [WYVERN_STATES.HURT]: 620,
  [WYVERN_STATES.DEATH]: 900,
};

function defaultPreviewTuning() {
  return {
    height: WYVERN_ART.vaultPreviewHeight,
    flightLift: WYVERN_ART.vaultFlightLift,
    shadowAlpha: WYVERN_ART.vaultShadow.alpha,
    playbackRate: 1,
  };
}

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
    this.previewFlightLift = 0;
    this.previewFlightPhase = 0;
    this.previewTuning = defaultPreviewTuning();
    this.uiVisibility = {
      roster: true,
      profile: true,
      actions: true,
      navigation: true,
    };
    this.fallbackMotion = { offsetY: 0 };
    this.lastDiagnosticUpdate = 0;

    this.buildWorld();
    this.spawnPreview();
    this.buildOverlay();

    this.events.once('shutdown', () => this.cleanUp());
  }

  update(time, delta) {
    this.updatePreviewPose(delta);
    if (time - this.lastDiagnosticUpdate >= 100) {
      updateVaultDiagnostics(this.previewDiagnostics());
      this.lastDiagnosticUpdate = time;
    }
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
    this.destroyPreview();

    const wyvern = this.selectedWyvern();
    if (!wyvern) return;

    const { x, y } = gridToScreen(VAULT_PREVIEW_SPOT.col, VAULT_PREVIEW_SPOT.row);
    const groundY = y + ISO.tileHeight / 2;
    this.previewBase = { x, y: groundY };
    this.previewFlightLift = 0;
    this.previewFlightPhase = 0;
    this.fallbackMotion.offsetY = 0;

    const atlasData = wyvern.atlas
      ? this.cache.json.get(wyvernAtlasDataKey(wyvern))
      : null;
    const usableFrame = firstUsableWyvernFrame(wyvern, atlasData);
    this.previewVisual = resolveWyvernVisual(this.textures, wyvern, usableFrame);
    const auraColor = wyvernAccentColor(wyvern);

    this.previewAura = this.add.ellipse(
      x,
      groundY + 1,
      WYVERN_ART.vaultAura.width,
      WYVERN_ART.vaultAura.height,
      auraColor,
      WYVERN_ART.vaultAura.alpha,
    );
    this.previewAura.setStrokeStyle(1, auraColor, 0.26);
    this.previewAura.setBlendMode(Phaser.BlendModes.ADD);
    this.previewAura.setData('depth', groundY + 0.5);

    this.previewShadow = this.add.ellipse(
      x,
      groundY + 2,
      WYVERN_ART.vaultShadow.width,
      WYVERN_ART.vaultShadow.height,
      0x05070a,
      this.previewTuning.shadowAlpha,
    );
    this.previewShadow.setData('depth', groundY + 1);

    this.previewSprite = this.add.sprite(
      x,
      groundY,
      this.previewVisual.textureKey,
      this.previewVisual.frameName,
    );
    this.previewSprite.setOrigin(this.previewVisual.origin.x, this.previewVisual.origin.y);
    this.previewScale = scaleWyvernVisual(
      this.previewVisual,
      this.previewTuning.height,
      WYVERN_ART.placeholderPreviewScale,
      WYVERN_ART.vaultPreviewHeight,
    );
    this.previewSprite.setScale(this.previewScale);
    this.previewSprite.setData('depth', groundY + 2);
    this.world.layer.add([this.previewAura, this.previewShadow, this.previewSprite]);

    sortByDepth(this.world.layer);
    this.playPreviewAction(WYVERN_STATES.IDLE, false);
  }

  destroyPreview() {
    if (this.previewSprite) {
      this.tweens.killTweensOf(this.previewSprite);
      this.previewSprite.destroy();
      this.previewSprite = null;
    }
    if (this.previewShadow) {
      this.previewShadow.destroy();
      this.previewShadow = null;
    }
    if (this.previewAura) {
      this.previewAura.destroy();
      this.previewAura = null;
    }
    this.previewVisual = null;
  }

  buildOverlay() {
    buildVaultOverlay({
      wyverns: this.wyverns,
      selectedId: this.selectedWyvernId,
      activeAction: this.activeAction,
      diagnostics: this.previewDiagnostics(),
      tuning: this.previewTuning,
      tuningRanges: WYVERN_ART.previewTuning,
      onSelect: (id) => this.selectWyvern(id),
      onAction: (action) => this.playPreviewAction(action),
      onTune: (name, value) => this.setPreviewTuning(name, value),
      onResetTuning: () => this.resetPreviewTuning(),
      onTravel: () => this.stepOutside(),
      onAtlas: () => { this.cleanUp(); this.scene.start('Atlas'); },
      visibility: this.uiVisibility,
      onToggleVisibility: (section) => this.toggleUiVisibility(section),
    });
  }

  toggleUiVisibility(section) {
    if (!(section in this.uiVisibility)) return;
    this.uiVisibility[section] = !this.uiVisibility[section];
    this.buildOverlay();
  }

  playPreviewAction(action, rebuildOverlay = true) {
    if (!this.previewSprite || !VAULT_ACTIONS.includes(action)) return;
    const wyvern = this.selectedWyvern();
    const animationKey = wyvernAnimationKey(wyvern, action);
    const animation = this.anims.get(animationKey);
    if (!animation) return;

    this.cancelPendingPreview();
    this.previewScale = this.previewScaleFor();
    this.resetPreviewAppearance();
    this.activeAction = action;
    const token = ++this.previewToken;
    this.previewSprite.play(animationKey);
    this.previewSprite.anims.timeScale = this.previewTuning.playbackRate;

    const usesFallbackMotion = !this.previewVisual?.usesAtlas || animation.frames.length <= 1;
    if (usesFallbackMotion) this.playPlaceholderEffect(action);

    if (ONE_SHOT_ACTIONS.has(action)) {
      if (usesFallbackMotion) {
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

  previewScaleFor() {
    return scaleWyvernVisual(
      this.previewVisual,
      this.previewTuning.height,
      WYVERN_ART.placeholderPreviewScale,
      WYVERN_ART.vaultPreviewHeight,
    );
  }

  // Generated one-frame textures still communicate the action. Vertical
  // position is owned by updatePreviewPose so flight and the ground shadow use
  // exactly the same elevation model as real atlases.
  playPlaceholderEffect(action) {
    const sprite = this.previewSprite;
    const { x } = this.previewBase;
    if (action === WYVERN_STATES.IDLE) {
      this.tweens.add({
        targets: this.fallbackMotion,
        offsetY: -5,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (action === WYVERN_STATES.FLY) {
      this.tweens.add({
        targets: sprite, x: x + 8, duration: 560, yoyo: true, repeat: -1,
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
    } else if (action === WYVERN_STATES.SPECIAL) {
      sprite.setTint(0xffd27a);
      this.tweens.add({
        targets: sprite,
        scaleX: this.previewScale * 1.14,
        scaleY: this.previewScale * 1.14,
        alpha: 0.82,
        duration: 190,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeInOut',
      });
    } else if (action === WYVERN_STATES.HURT) {
      sprite.setTint(0xff6b6b);
      this.tweens.add({
        targets: sprite, x: x + 7, duration: 55, yoyo: true, repeat: 4, ease: 'Sine.easeInOut',
      });
    } else if (action === WYVERN_STATES.DEATH) {
      this.tweens.add({
        targets: sprite, angle: 82, alpha: 0.22, duration: 720, ease: 'Quad.easeIn',
      });
    }
  }

  updatePreviewPose(delta) {
    if (!this.previewSprite || !this.previewShadow || !this.previewAura) return;

    const flying = this.activeAction === WYVERN_STATES.FLY;
    const response = 1 - Math.exp(-delta / WYVERN_ART.flightLiftResponseMs);
    const targetLift = flying ? this.previewTuning.flightLift : 0;
    this.previewFlightLift += (targetLift - this.previewFlightLift) * response;
    this.previewFlightPhase += delta * 0.008;
    const bob = flying
      ? Math.sin(this.previewFlightPhase) * WYVERN_ART.flightBobAmplitude
      : 0;

    this.previewSprite.y = this.previewBase.y
      - this.previewFlightLift
      - bob
      + this.fallbackMotion.offsetY;
    this.previewShadow.setPosition(this.previewBase.x, this.previewBase.y + 2);
    this.previewAura.setPosition(this.previewBase.x, this.previewBase.y + 1);

    const denominator = Math.max(this.previewTuning.flightLift, 1);
    const flightRatio = Phaser.Math.Clamp(this.previewFlightLift / denominator, 0, 1);
    this.previewShadow.setScale(1 - flightRatio * 0.28);
    this.previewShadow.setAlpha(this.previewTuning.shadowAlpha * (1 - flightRatio * 0.5));
    const auraPulse = 1 + Math.sin(this.previewFlightPhase * 0.45) * 0.035;
    this.previewAura.setScale(auraPulse * (1 - flightRatio * 0.08));
    this.previewAura.setAlpha(WYVERN_ART.vaultAura.alpha * (1 - flightRatio * 0.34));
  }

  resetPreviewAppearance() {
    this.tweens.killTweensOf(this.previewSprite);
    this.tweens.killTweensOf(this.fallbackMotion);
    this.fallbackMotion.offsetY = 0;
    this.previewSprite.removeAllListeners('animationcomplete');
    this.previewSprite.stop();
    this.previewSprite.clearTint();
    this.previewSprite.setPosition(this.previewBase.x, this.previewSprite.y);
    this.previewSprite.setScale(this.previewScale);
    this.previewSprite.setAngle(0);
    this.previewSprite.setAlpha(1);
  }

  setPreviewTuning(name, rawValue) {
    const range = WYVERN_ART.previewTuning[name];
    const value = Number(rawValue);
    if (!range || !Number.isFinite(value)) return;
    this.previewTuning[name] = Phaser.Math.Clamp(value, range.min, range.max);

    if (name === 'playbackRate' && this.previewSprite) {
      this.previewSprite.anims.timeScale = this.previewTuning.playbackRate;
    } else if (name === 'height') {
      this.playPreviewAction(this.activeAction, false);
    }
    updateVaultDiagnostics(this.previewDiagnostics());
  }

  resetPreviewTuning() {
    this.previewTuning = defaultPreviewTuning();
    this.playPreviewAction(this.activeAction, false);
    this.buildOverlay();
  }

  previewDiagnostics() {
    const wyvern = this.selectedWyvern();
    const report = wyvern ? this.registry.get(`wyvernAsset:${wyvern.id}`) : null;
    const animation = this.previewSprite?.anims?.currentAnim;
    const animationFrame = this.previewSprite?.anims?.currentFrame;
    const textureFrame = this.previewSprite?.frame;
    const sourceWidth = textureFrame?.realWidth || textureFrame?.width || 0;
    const sourceHeight = textureFrame?.realHeight || textureFrame?.height || 0;
    const currentFrameNumber = animationFrame?.index || 1;

    return {
      assetMode: report?.mode || (wyvern?.atlas ? 'atlas' : 'placeholder'),
      valid: report?.valid ?? true,
      issueCount: (report?.errors?.length || 0) + (report?.warnings?.length || 0),
      state: this.activeAction,
      frameName: textureFrame?.name || '__BASE',
      framePosition: `${currentFrameNumber}/${animation?.frames?.length || 1}`,
      frameRate: animation?.frameRate || 0,
      lifecycle: ONE_SHOT_ACTIONS.has(this.activeAction) ? 'one-shot → idle' : 'looping',
      sourceSize: sourceWidth && sourceHeight ? `${sourceWidth}×${sourceHeight}` : '—',
      displayHeight: Math.round((textureFrame?.height || 0) * (this.previewSprite?.scaleY || 0)),
      altitude: Math.round(this.previewFlightLift),
      atlasSize: report?.atlasSize
        ? `${report.atlasSize.w}×${report.atlasSize.h}`
        : 'generated',
      maxTextureSize: report?.maxTextureSize || '—',
    };
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
    this.tweens.killTweensOf(this.fallbackMotion);
    const overlay = document.getElementById('ui-overlay');
    if (overlay) overlay.innerHTML = '';
  }

  stepOutside() {
    this.cleanUp();
    this.scene.start('Base');
  }
}
