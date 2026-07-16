// Wyvern: a sprite with an animation state machine and keyboard control.
// This is the piece you'll iterate on most. States gate transitions (e.g. you
// can't move mid-attack), and each state maps to a registered animation.
import { WYVERN_STATES, WYVERN_ORDERS, ORDER_EFFECTS } from '../config.js';

const SPEED = 0.12; // px per ms

export default class Wyvern extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y, hp = 100) {
    super(scene, x, y, 'wyvern-placeholder');
    scene.add.existing(this);
    this.setOrigin(0.5, 0.85); // feet-ish anchor so it sits on the tile

    this.hp = hp;
    this.stateName = null;
    this.locked = false; // true during one-shot states (attack/hurt/death)
    this.order = WYVERN_ORDERS.ATTACK; // standing behavior mode; see config.js ORDER_EFFECTS

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
    this.play(`wyvern-${next}`, true);
    return this;
  }

  // Called by the on-screen order bar (see MissionScene.setOrder).
  setOrder(order) {
    this.order = order;
  }

  update(delta) {
    // Depth for iso sorting follows the sprite down the screen as it moves.
    this.setData('depth', this.y);

    if (this.locked) return; // mid attack/hurt/death — no movement or restate

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
      this.y += (dy / len) * SPEED * effects.speedMultiplier * delta;
      if (dx !== 0) this.setFlipX(dx < 0); // face travel direction
      this.setState(WYVERN_STATES.FLY);
    } else {
      this.setState(WYVERN_STATES.IDLE);
    }
  }

  // Applies damage, plays hurt or death, and returns true if this killed it.
  takeHit(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.locked = true;
    this.setState(this.hp <= 0 ? WYVERN_STATES.DEATH : WYVERN_STATES.HURT);
    return this.hp <= 0;
  }
}
