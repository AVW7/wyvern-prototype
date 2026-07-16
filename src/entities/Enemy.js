// Enemy: a minimal sprite state machine, mirroring Wyvern.js but with no
// movement or input — just idle/hurt/death so combat has something to hit.
import { ENEMY_STATES } from '../config.js';

export default class Enemy extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y, hp) {
    super(scene, x, y, 'enemy-placeholder');
    scene.add.existing(this);
    this.setOrigin(0.5, 0.85);

    this.hp = hp;
    this.stateName = null;
    this.locked = false;
    this.lastContactAt = 0; // throttles contact damage against the wyvern

    // Return to idle after the hurt animation; death stays locked.
    this.on('animationcomplete', (anim) => {
      if (anim.key.endsWith(ENEMY_STATES.HURT)) {
        this.locked = false;
        this.setState(ENEMY_STATES.IDLE);
      }
    });

    this.setState(ENEMY_STATES.IDLE);
  }

  setState(next) {
    if (this.stateName === next) return this;
    this.stateName = next;
    this.play(`enemy-${next}`, true);
    return this;
  }

  update() {
    this.setData('depth', this.y);
  }

  // Applies damage, plays hurt or death, and returns true if this killed it.
  takeHit(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.locked = true;
    this.setState(this.hp <= 0 ? ENEMY_STATES.DEATH : ENEMY_STATES.HURT);
    return this.hp <= 0;
  }
}
