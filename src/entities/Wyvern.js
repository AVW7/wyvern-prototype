// Wyvern: a sprite with an animation state machine and keyboard control.
// This is the piece you'll iterate on most. States gate transitions (e.g. you
// can't move mid-attack), and each state maps to a registered animation.
import {
  WYVERN_STATES, WYVERN_ORDERS, ORDER_EFFECTS, WYVERN_ART,
} from '../config.js';
import { DEMO_WYVERNS, wyvernAnimationKey } from '../data/wyverns.js';
import { resolveWyvernVisual, scaleWyvernVisual } from '../systems/wyvernPresentation.js';

const SPEED = 0.12; // px per ms

export default class Wyvern extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y, profile = DEMO_WYVERNS[0]) {
    const visual = resolveWyvernVisual(scene.textures, profile);
    super(scene, x, y, profile.assetKey, visual.frameName);
    scene.add.existing(this);
    this.setOrigin(visual.origin.x, visual.origin.y);

    this.profileId = profile.id;
    this.profile = profile;
    this.assetKey = profile.assetKey;
    this.visual = visual;
    this.atlasScale = visual.usesAtlas
      ? scaleWyvernVisual(visual, WYVERN_ART.missionHeight)
      : null;
    this.hp = profile.hp ?? 100;
    this.stateName = null;
    this.locked = false; // true during one-shot states (attack/hurt/death)
    this.order = WYVERN_ORDERS.ATTACK; // standing behavior mode; see config.js ORDER_EFFECTS
    this.groundY = y;
    this.flightLift = 0;
    this.flightPhase = 0;

    // A ground-locked shadow keeps the entity's footprint readable while its
    // sprite lifts into the air. MissionScene adds it to the sortable layer.
    this.shadow = scene.add.ellipse(
      x,
      y + 2,
      WYVERN_ART.missionShadow.width,
      WYVERN_ART.missionShadow.height,
      0x05070a,
      WYVERN_ART.missionShadow.alpha,
    );
    this.shadow.setData('depth', y - 0.25);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      if (this.shadow?.active) this.shadow.destroy();
    });

    // Input: arrows + WASD + space. Rebind here when you add a settings screen.
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE');

    // Return to idle automatically when a one-shot animation finishes.
    this.on('animationcomplete', (anim) => {
      if (anim.key.endsWith(WYVERN_STATES.ATTACK) || anim.key.endsWith(WYVERN_STATES.HURT)) {
        this.locked = false;
        this.setState(WYVERN_STATES.IDLE);
      }
    });

    this.setState(WYVERN_STATES.IDLE);
  }

  // Central state transition. Ignores redundant sets and plays the matching anim.
  setState(next) {
    if (this.stateName === next) return this;
    this.stateName = next;
    const animationKey = wyvernAnimationKey(this.assetKey, next);
    const scale = this.visual.usesAtlas && this.atlasScale
      ? this.atlasScale
      : WYVERN_ART.placeholderMissionScale;
    this.setScale(scale);
    this.play(animationKey, true);
    return this;
  }

  // Called by the on-screen order bar (see MissionScene.setOrder).
  setOrder(order) {
    this.order = order;
  }

  update(delta) {
    // Depth and combat stay on the ground footprint; only the rendered sprite
    // rises. This avoids flight changing attack/contact distances.
    this.setData('depth', this.groundY);
    this.shadow.setData('depth', this.groundY - 0.25);

    if (this.locked) {
      this.updateFlightPose(delta, false);
      return; // mid attack/hurt/death — no movement or restate
    }

    const k = this.keys;
    const effects = ORDER_EFFECTS[this.order];

    // Attack takes priority and locks movement until the anim completes.
    // Gated by the current order (Scout/Recon can't fight). MissionScene
    // listens for 'attack' to resolve hit detection.
    if (effects.canAttack && Phaser.Input.Keyboard.JustDown(k.SPACE)) {
      this.locked = true;
      this.setState(WYVERN_STATES.ATTACK);
      this.emit('attack');
      return;
    }

    // Movement vector from arrows/WASD. Guard holds position (speedMultiplier 0).
    let dx = 0;
    let dy = 0;
    if (effects.speedMultiplier > 0) {
      if (k.LEFT.isDown || k.A.isDown) dx -= 1;
      if (k.RIGHT.isDown || k.D.isDown) dx += 1;
      if (k.UP.isDown || k.W.isDown) dy -= 1;
      if (k.DOWN.isDown || k.S.isDown) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      this.x += (dx / len) * SPEED * effects.speedMultiplier * delta;
      this.groundY += (dy / len) * SPEED * effects.speedMultiplier * delta;
      if (dx !== 0) this.setFlipX(dx < 0); // face travel direction
      this.setState(WYVERN_STATES.FLY);
      this.updateFlightPose(delta, true);
    } else {
      this.setState(WYVERN_STATES.IDLE);
      this.updateFlightPose(delta, false);
    }
  }

  updateFlightPose(delta, flying) {
    const response = 1 - Math.exp(-delta / WYVERN_ART.flightLiftResponseMs);
    const targetLift = flying ? WYVERN_ART.missionFlightLift : 0;
    this.flightLift += (targetLift - this.flightLift) * response;
    this.flightPhase += delta * 0.008;
    const bob = flying ? Math.sin(this.flightPhase) * WYVERN_ART.flightBobAmplitude : 0;
    this.y = this.groundY - this.flightLift - bob;

    this.shadow.setPosition(this.x, this.groundY + 2);
    const flightRatio = Phaser.Math.Clamp(
      this.flightLift / WYVERN_ART.missionFlightLift, 0, 1,
    );
    this.shadow.setScale(1 - flightRatio * 0.22);
    this.shadow.setAlpha(WYVERN_ART.missionShadow.alpha * (1 - flightRatio * 0.44));
  }

  // Applies damage, plays hurt or death, and returns true if this killed it.
  takeHit(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.locked = true;
    this.setState(this.hp <= 0 ? WYVERN_STATES.DEATH : WYVERN_STATES.HURT);
    return this.hp <= 0;
  }
}
