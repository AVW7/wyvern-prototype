// Wyvern: a sprite with an animation state machine and keyboard control.
// This is the piece you'll iterate on most. States gate transitions (e.g. you
// can't move mid-attack), and each state maps to a registered animation.
import {
  WYVERN_STATES, WYVERN_ORDERS, ORDER_EFFECTS, WYVERN_ART,
} from '../config.js';
import { DEMO_WYVERNS, wyvernAnimationKey } from '../data/wyverns.js';
import { resolveWyvernVisual, scaleWyvernVisual } from '../systems/wyvernPresentation.js';
import {
  KeyboardAction, addActionKeys, isActionDown, isActionJustDown,
} from '../input/keyboardActions.js';

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
    this.hp = profile.hp ?? 100;
    this.stateName = null;
    this.locked = false; // true during one-shot states (attack/hurt/death)
    this.order = WYVERN_ORDERS.ATTACK; // standing behavior mode; see config.js ORDER_EFFECTS
    this.groundY = y;
    this.flightLift = 0;
    this.terrainLift = 0; // eased lift so the sprite rides raised terrain tiles
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

    // Input: arrows + WASD + space. Bindings live in input/keyboardActions.js.
    this.moveUpKeys = addActionKeys(scene.input.keyboard, KeyboardAction.MissionMoveUp);
    this.moveDownKeys = addActionKeys(scene.input.keyboard, KeyboardAction.MissionMoveDown);
    this.moveLeftKeys = addActionKeys(scene.input.keyboard, KeyboardAction.MissionMoveLeft);
    this.moveRightKeys = addActionKeys(scene.input.keyboard, KeyboardAction.MissionMoveRight);
    this.attackKeys = addActionKeys(scene.input.keyboard, KeyboardAction.MissionAttack);

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
    const scale = WYVERN_ART.placeholderMissionScale;
    this.setScale(scale);
    this.play(animationKey, true);
    return this;
  }

  // Called by the on-screen order bar (see MissionScene.setOrder).
  setOrder(order) {
    this.order = order;
  }

  // `terrain` (from MissionScene) is an optional { liftAt, passable } query
  // interface. When absent the wyvern still runs as flat free flight.
  update(delta, terrain = null) {
    // Depth and combat stay on the ground footprint; only the rendered sprite
    // rises. This avoids flight/terrain lift changing attack/contact distances.
    this.setData('depth', this.groundY);
    this.shadow.setData('depth', this.groundY - 0.25);

    // Height of the tile top face the wyvern is currently over, read after any
    // movement below so it reflects the cell just stepped onto.
    const terrainTarget = () => (terrain ? terrain.liftAt(this.x, this.groundY) : 0);

    if (this.locked) {
      this.updateFlightPose(delta, false, terrainTarget());
      return; // mid attack/hurt/death — no movement or restate
    }

    const effects = ORDER_EFFECTS[this.order];

    // Attack takes priority and locks movement until the anim completes.
    // Gated by the current order (Scout/Recon can't fight). MissionScene
    // listens for 'attack' to resolve hit detection.
    if (effects.canAttack && isActionJustDown(this.attackKeys)) {
      this.locked = true;
      this.setState(WYVERN_STATES.ATTACK);
      this.emit('attack');
      return;
    }

    // Movement vector from arrows/WASD. Guard holds position (speedMultiplier 0).
    let dx = 0;
    let dy = 0;
    if (effects.speedMultiplier > 0) {
      if (isActionDown(this.moveLeftKeys)) dx -= 1;
      if (isActionDown(this.moveRightKeys)) dx += 1;
      if (isActionDown(this.moveUpKeys)) dy -= 1;
      if (isActionDown(this.moveDownKeys)) dy += 1;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      const step = SPEED * effects.speedMultiplier * delta;
      const nx = this.x + (dx / len) * step;
      const ny = this.groundY + (dy / len) * step;
      // Resolve against terrain: take the full step when passable, else slide
      // along whichever axis is clear so the wyvern skirts a cliff face.
      if (!terrain) {
        this.x = nx;
        this.groundY = ny;
      } else if (terrain.passable(this.x, this.groundY, nx, ny)) {
        this.x = nx;
        this.groundY = ny;
      } else {
        if (terrain.passable(this.x, this.groundY, nx, this.groundY)) this.x = nx;
        if (terrain.passable(this.x, this.groundY, this.x, ny)) this.groundY = ny;
      }
      if (dx !== 0) this.setFlipX(dx < 0); // face travel direction
      this.setState(WYVERN_STATES.FLY);
      this.updateFlightPose(delta, true, terrainTarget());
    } else {
      this.setState(WYVERN_STATES.IDLE);
      this.updateFlightPose(delta, false, terrainTarget());
    }
  }

  updateFlightPose(delta, flying, targetTerrainLift = 0) {
    const response = 1 - Math.exp(-delta / WYVERN_ART.flightLiftResponseMs);
    const targetLift = flying ? WYVERN_ART.missionFlightLift : 0;
    this.flightLift += (targetLift - this.flightLift) * response;
    this.terrainLift += (targetTerrainLift - this.terrainLift) * response;
    this.flightPhase += delta * 0.008;
    const bob = flying ? Math.sin(this.flightPhase) * WYVERN_ART.flightBobAmplitude : 0;
    this.y = this.groundY - this.terrainLift - this.flightLift - bob;

    this.shadow.setPosition(this.x, this.groundY - this.terrainLift + 2);
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
