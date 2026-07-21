// Decides how the 3D dragon should be posed, from what the movement controller
// is doing. Pure: no `three` import, no DOM, no Phaser — it takes numbers and
// returns numbers, so the whole steering feel is unit-testable and tunable
// without a browser. systems/sanctuary3D.js is the only consumer; it turns the
// returned motion slot into an AnimationAction and the returned angles into
// model rotation.
//
// The problem this exists to solve: the model used to be posed by an if-chain
// in BaseScene.update and steered by `rotation.y = atan2(moveVector)` — an
// instant snap to the input heading every frame, with a walk clip playing at a
// fixed rate regardless of speed. That reads as a sprite being dragged around,
// not an animal turning. Here, heading is rate-limited, large heading errors
// play a turn clip, the walk cycle's playback rate is matched to ground speed,
// and altitude changes go through takeoff/land instead of teleporting.

const DEG = Math.PI / 180;

const DEFAULTS = {
  maxYawRateDeg: 150,
  turnClipThresholdDeg: 35,
  turnClipBigDeg: 70,
  walkClipSpeed: 96,
  walkTimeScale: { min: 0.55, max: 1.9 },
  walkTurnRateDeg: 55,
  // Airborne turning is its own regime: a flying dragon carries momentum
  // through a much wider arc than a walking one pivoting on its feet, so the
  // yaw rate that counts as "hard over" is higher than walkTurnRateDeg.
  flightTurnRateDeg: 90,
  bankBlendResponseHz: 2.2,
  bankMaxDeg: 32,
  bankGain: 0.16,
  bankResponseHz: 3.2,
  pitchMaxDeg: 18,
  pitchGain: 0.22,
  pitchResponseHz: 2.6,
  // Degrees of nose-up per height-level-per-tile of ground slope, while
  // walking. Without this a climb reads as sliding up a ramp with the body
  // held flat.
  slopePitchDeg: 26,
  takeoffAltitude: 24,
  landAltitude: 6,
  idleBreakAfterSec: 14,
  idleBreakChance: 0.12,
};

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Shortest signed angular distance from `from` to `to`, in (-π, π]. Without
 * this a heading crossing ±π unwinds the long way round — the same reason
 * sanctuary3D eases its camera yaw through atan2 rather than a raw difference.
 */
export function shortestAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Split an airborne turn across the level clip and the two banked ones.
 *
 * This used to cross-weight bankLeft against bankRight alone, with level
 * defined as the mix where their opposing banks cancel. They do not cancel:
 * measured on the posed rig, that mix sits 5.2° left and rocks through 16° of
 * roll every wingbeat, because blending two steeply banked poses averages the
 * poses and not the bank. tools/blender-flight-clips.py derives a real level
 * cycle (-0.6° across the beat), so level is a clip to hold, not a ratio to
 * find, and the banks are only what a turn leans *into*.
 *
 * All three share one wingbeat window, so they stay phase-locked and the
 * weights below never blend a downstroke into an upstroke.
 *
 * @param {number} blend - -1 hard right .. 0 level .. +1 hard left
 * @returns {{level: number, left: number, right: number}} weights summing to 1
 */
export function bankWeights(blend) {
  const b = clamp(finite(blend, 0), -1, 1);
  return {
    level: 1 - Math.abs(b),
    left: Math.max(b, 0),
    right: Math.max(-b, 0),
  };
}

/**
 * Create a motion state machine for one dragon.
 *
 * @param {object} options
 * @param {object} [options.motion] - SANCTUARY.dragon3D.motion
 * @param {number} [options.heading] - initial world heading in radians
 * @param {() => number} [options.random] - injectable RNG (tests pin it)
 */
export function createDragonMotion({ motion = {}, heading = 0, random = Math.random } = {}) {
  const config = { ...DEFAULTS, ...motion };
  config.walkTimeScale = { ...DEFAULTS.walkTimeScale, ...(motion.walkTimeScale || {}) };

  return {
    /** Current damped world heading (radians). Lags the input heading. */
    heading,
    /** Current body roll / pitch (radians), eased toward their targets. */
    roll: 0,
    pitch: 0,
    /**
     * Where the airborne turn sits between the two banked sky clips:
     * -1 hard right, 0 level, +1 hard left. Eased, so it lags the input the
     * way a body with mass does.
     */
    bankBlend: 0,
    /** Degrees/sec the body turned on the last update; drives banking. */
    yawRateDeg: 0,
    /** Motion slot the base (looping) layer should be playing. */
    base: 'idle',
    /** Motion slot to fire once, or null. Set on the frame it should start. */
    oneShot: null,
    /** True between a takeoff and the matching landing. */
    airborne: false,
    /** Seconds the dragon has been idle and untouched. */
    idleSec: 0,
    lastAltitude: 0,
    // Set while a one-shot the machine itself requested (turn/takeoff/land) is
    // still playing, so it is not re-requested every frame.
    pendingOneShot: null,
    lastAction: null,

    /**
     * Report that the currently playing one-shot finished. sanctuary3D wires
     * this to the AnimationMixer's `finished` event.
     */
    oneShotFinished() {
      this.pendingOneShot = null;
      return this;
    },

    /**
     * Advance one frame.
     *
     * @param {object} input
     * @param {number} input.dtMs - frame delta in ms
     * @param {number} input.speed - ground speed, world units/sec
     * @param {number} input.desiredHeading - heading the input asks for (rad)
     * @param {boolean} input.isFlying - flight mode toggled on
     * @param {number} input.altitude - current altitude, world units
     * @param {number} input.targetAltitude - altitude being eased toward
     * @param {string|null} input.action - 'attack' | 'dracarys' | 'special'
     * @param {number} [input.groundSlope] - ground rise along the direction of
     *   travel, in height levels per tile. Positive is uphill. Ignored while
     *   airborne. See slopeAlong() in systems/terrainHeightField.js.
     * @returns {{base: string, baseTimeScale: number, oneShot: string|null,
     *   heading: number, roll: number, pitch: number, airborne: boolean}}
     */
    update({
      dtMs = 0,
      speed = 0,
      desiredHeading = null,
      isFlying = false,
      altitude = 0,
      targetAltitude = 0,
      action = null,
      groundSlope = 0,
    } = {}) {
      const dt = clamp(finite(dtMs, 0), 0, 100) / 1000;
      this.oneShot = null;

      // ── Heading ────────────────────────────────────────────────────────
      // Rate-limited rotation toward the requested heading. A stationary
      // dragon still turns, which is what lets the turn clips read.
      const target = Number.isFinite(desiredHeading) ? desiredHeading : this.heading;
      const error = shortestAngle(this.heading, target);
      const maxStep = config.maxYawRateDeg * DEG * dt;
      const step = clamp(error, -maxStep, maxStep);
      this.heading += step;
      this.yawRateDeg = dt > 0 ? (step / DEG) / dt : 0;

      const moving = speed > 0.001;
      const errorDeg = Math.abs(error) / DEG;

      // ── One-shot arbitration ───────────────────────────────────────────
      // Player actions outrank everything, and only fire on the frame the
      // action first appears so holding the key does not restart the clip.
      const wantsAir = isFlying && targetAltitude > config.landAltitude;
      if (action && action !== this.lastAction) {
        let resolvedAction = action;
        if (this.airborne) {
          if (action === 'dracarys') resolvedAction = 'flyDracarys';
          else if (action === 'attack') resolvedAction = this.yawRateDeg < -10 ? 'flyAttackRight' : 'flyAttackLeft';
          else if (action === 'attackAlt') resolvedAction = 'flyAttackRight';
        }
        this.oneShot = resolvedAction;
        this.pendingOneShot = resolvedAction;
      }
      this.lastAction = action;

      // Takeoff / landing bracket the airborne state. `takeoffAltitude` is the
      // altitude the climb must pass before the dragon counts as flying, so a
      // twitch on the ascend key does not trigger a full takeoff.
      if (!this.airborne && wantsAir) {
        this.airborne = true;
        if (!this.oneShot) {
          this.oneShot = 'takeoff';
          this.pendingOneShot = 'takeoff';
        }
      } else if (this.airborne && !wantsAir && altitude <= config.takeoffAltitude) {
        this.airborne = false;
        if (!this.oneShot) {
          this.oneShot = 'land';
          this.pendingOneShot = 'land';
        }
      }

      // A standing dragon facing far from where it is asked to face turns on
      // the spot with a clip rather than pivoting silently.
      if (!this.oneShot && !this.pendingOneShot && !this.airborne && !moving
        && errorDeg >= config.turnClipThresholdDeg) {
        const big = errorDeg >= config.turnClipBigDeg;
        const left = error > 0;
        this.oneShot = big
          ? (left ? 'turnLeft' : 'turnRight')
          : (left ? 'turnLeftSmall' : 'turnRightSmall');
        this.pendingOneShot = this.oneShot;
      }

      // ── Base motion ────────────────────────────────────────────────────
      let base;
      let baseTimeScale = 1;
      if (this.airborne) {
        // Airborne turning is a continuous blend, not a switch between loops:
        // hold the level cycle and both banked ones at once and weight them.
        // At rest that is the level clip alone; a turn slides weight onto the
        // clip that leans into it. `bankBlend` is -1 (hard right) .. 0 (level)
        // .. +1 (hard left) and sanctuary3D turns it into the action weights.
        //
        // The three clips are derived from one wingbeat of the source's sky
        // moves, so they are phase-locked and can be summed at any ratio. Before
        // they existed this had to cross-weight the two banked clips alone and
        // call the cancelling mix "level", which left cruise leaning 5.2°.
        base = moving ? 'fly' : 'flyHover';
        const turnRatio = clamp(this.yawRateDeg / config.flightTurnRateDeg, -1, 1);
        // Eased rather than assigned, or the blend snaps as hard as the switch
        // it replaces — this is what makes a turn read as the body leaning in.
        this.bankBlend += (turnRatio - this.bankBlend)
          * (1 - Math.exp(-dt * config.bankBlendResponseHz));
      } else if (moving) {
        // Blend the straight walk into its turning variants by how hard the
        // body is rotating, so a curving path is not a straight-line shuffle.
        const turnRatio = clamp(this.yawRateDeg / config.walkTurnRateDeg, -1, 1);
        if (turnRatio > 0.45) base = 'walkLeft';
        else if (turnRatio < -0.45) base = 'walkRight';
        else base = 'walk';
        // Speed-matched playback: this is the fix for foot sliding.
        baseTimeScale = clamp(
          speed / Math.max(1, config.walkClipSpeed),
          config.walkTimeScale.min,
          config.walkTimeScale.max,
        );
      } else {
        base = 'idle';
      }

      // ── Idle break ─────────────────────────────────────────────────────
      // A 15-second idle loop with nothing on top reads as a paused video.
      if (base === 'idle' && !this.oneShot && !this.pendingOneShot) {
        this.idleSec += dt;
        if (this.idleSec >= config.idleBreakAfterSec
          && random() < config.idleBreakChance * dt) {
          this.oneShot = 'idleBreak';
          this.pendingOneShot = 'idleBreak';
          this.idleSec = 0;
        }
      } else {
        this.idleSec = 0;
      }
      this.base = base;

      // ── Body attitude ──────────────────────────────────────────────────
      // Bank into turns while airborne and level out otherwise; nose up or down
      // with vertical speed. Both eased so they never pop.
      //
      // This rides on top of whatever bank the blended sky clips already carry,
      // so `bankGain` is deliberately small: the clips supply the pose and this
      // supplies the crispness the clips' slow wingbeat cycle cannot. Turning
      // it up past about 0.2 reads as the model pivoting inside its own
      // animation.
      const bankTarget = this.airborne
        ? clamp(
          -this.yawRateDeg * config.bankGain,
          -config.bankMaxDeg,
          config.bankMaxDeg,
        ) * DEG
        : 0;
      // Measured climb rate, not the gap to the target: the movement controller
      // eases altitude, so the remaining gap is large on the first frame of a
      // climb and would peg the nose to its limit instantly.
      const verticalSpeed = dt > 0 ? (altitude - this.lastAltitude) / dt : 0;
      this.lastAltitude = altitude;
      // Airborne postures: hovering holds a slight +8° nose-up tilt so wings beat
      // horizontally over mass center; forward flight pitches -10° forward into travel
      // plus climb/descent pitch. On ground, pitch follows walking terrain slope.
      const pitchTarget = this.airborne
        ? clamp(verticalSpeed * config.pitchGain, -config.pitchMaxDeg, config.pitchMaxDeg) * DEG
        : clamp(
          (moving ? finite(groundSlope, 0) : 0) * config.slopePitchDeg,
          -config.pitchMaxDeg,
          config.pitchMaxDeg,
        ) * DEG;
      this.roll += (bankTarget - this.roll)
        * (1 - Math.exp(-dt * config.bankResponseHz));
      this.pitch += (pitchTarget - this.pitch)
        * (1 - Math.exp(-dt * config.pitchResponseHz));

      return {
        base: this.base,
        baseTimeScale,
        oneShot: this.oneShot,
        heading: this.heading,
        roll: this.roll,
        pitch: this.pitch,
        airborne: this.airborne,
        bankBlend: this.bankBlend,
      };
    },
  };
}
