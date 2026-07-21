import { describe, expect, it } from 'vitest';
import { bankWeights, createDragonMotion, shortestAngle } from '../src/systems/dragonMotion.js';
import { SANCTUARY } from '../src/config.js';

const MOTION = SANCTUARY.dragon3D.motion;
const DEG = Math.PI / 180;

// Drive the machine for `ms` of simulated time in fixed steps, so a test does
// not depend on the size of a single frame.
function run(machine, input, ms, stepMs = 16) {
  let last = null;
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    last = machine.update({ dtMs: stepMs, ...input });
  }
  return last;
}

describe('shortestAngle', () => {
  it('takes the short way across the ±π seam', () => {
    // 170° → -170° is a 20° turn left, not a 340° turn right.
    expect(shortestAngle(170 * DEG, -170 * DEG)).toBeCloseTo(20 * DEG, 6);
    expect(shortestAngle(-170 * DEG, 170 * DEG)).toBeCloseTo(-20 * DEG, 6);
  });

  it('is zero for identical headings', () => {
    expect(shortestAngle(1.2, 1.2)).toBeCloseTo(0, 9);
  });
});

describe('bankWeights', () => {
  const LEVEL = MOTION.levelBankBlend;

  it('always sums to one, so the blend never gains or loses energy', () => {
    for (let b = -1; b <= 1.0001; b += 0.1) {
      const { left, right } = bankWeights(b, LEVEL);
      expect(left + right).toBeCloseTo(1, 9);
    }
  });

  it('sits at the level mix when flying straight', () => {
    // Not 0.5: the two clips' banks are +11.9 and -8.7, so cancelling them
    // needs an uneven mix.
    expect(bankWeights(0, LEVEL).left).toBeCloseTo(LEVEL, 9);
  });

  it('reaches a pure clip at either extreme', () => {
    expect(bankWeights(1, LEVEL).left).toBeCloseTo(1, 9);
    expect(bankWeights(-1, LEVEL).left).toBeCloseTo(0, 9);
  });

  it('moves monotonically from right to left across the range', () => {
    let previous = -Infinity;
    for (let b = -1; b <= 1.0001; b += 0.05) {
      const { left } = bankWeights(b, LEVEL);
      expect(left).toBeGreaterThan(previous);
      previous = left;
    }
  });

  it('stays inside 0..1 for out-of-range and junk input', () => {
    for (const b of [5, -5, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      const { left, right } = bankWeights(b, LEVEL);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(1);
      expect(left + right).toBeCloseTo(1, 9);
    }
  });

  it('degrades to an even split when the level mix is junk', () => {
    expect(bankWeights(0, Number.NaN).left).toBeCloseTo(0.5, 9);
  });
});

describe('createDragonMotion heading', () => {
  it('never turns faster than the configured yaw rate', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const before = machine.heading;
    const pose = machine.update({ dtMs: 100, desiredHeading: Math.PI });
    const turnedDeg = Math.abs(pose.heading - before) / DEG;
    // 100 ms at the configured deg/sec, plus a hair of float slack.
    expect(turnedDeg).toBeLessThanOrEqual(MOTION.maxYawRateDeg * 0.1 + 1e-6);
    expect(turnedDeg).toBeGreaterThan(0);
  });

  it('eventually arrives at the requested heading', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const pose = run(machine, { desiredHeading: 2 }, 4000);
    expect(pose.heading).toBeCloseTo(2, 3);
  });

  it('holds its heading when the input asks for nothing', () => {
    const machine = createDragonMotion({ motion: MOTION, heading: 1.1 });
    const pose = machine.update({ dtMs: 16, desiredHeading: null });
    expect(pose.heading).toBeCloseTo(1.1, 9);
  });

  it('crosses the seam the short way rather than unwinding', () => {
    const machine = createDragonMotion({ motion: MOTION, heading: 3.0 });
    const pose = machine.update({ dtMs: 16, desiredHeading: -3.0 });
    // Short path is +0.28 rad, so the heading must increase past π, not fall.
    expect(pose.heading).toBeGreaterThan(3.0);
  });
});

describe('createDragonMotion ground locomotion', () => {
  it('idles when stationary and walks when moving', () => {
    const machine = createDragonMotion({ motion: MOTION });
    expect(machine.update({ dtMs: 16, speed: 0 }).base).toBe('idle');
    expect(machine.update({ dtMs: 16, speed: 100 }).base).toBe('walk');
  });

  it('scales walk playback with ground speed', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const slow = machine.update({ dtMs: 16, speed: MOTION.walkClipSpeed * 0.7 });
    const fast = machine.update({ dtMs: 16, speed: MOTION.walkClipSpeed * 1.4 });
    expect(slow.baseTimeScale).toBeCloseTo(0.7, 5);
    expect(fast.baseTimeScale).toBeCloseTo(1.4, 5);
    expect(fast.baseTimeScale).toBeGreaterThan(slow.baseTimeScale);
  });

  it('clamps playback rate so the cycle never crawls or blurs', () => {
    const machine = createDragonMotion({ motion: MOTION });
    expect(machine.update({ dtMs: 16, speed: 1 }).baseTimeScale)
      .toBeCloseTo(MOTION.walkTimeScale.min, 5);
    expect(machine.update({ dtMs: 16, speed: 10000 }).baseTimeScale)
      .toBeCloseTo(MOTION.walkTimeScale.max, 5);
  });

  it('uses the turning walk variants while curving', () => {
    const machine = createDragonMotion({ motion: MOTION });
    // A large heading error at full yaw rate while moving.
    const left = machine.update({ dtMs: 16, speed: 100, desiredHeading: Math.PI });
    expect(left.base).toBe('walkLeft');

    const other = createDragonMotion({ motion: MOTION });
    const right = other.update({ dtMs: 16, speed: 100, desiredHeading: -Math.PI / 2 });
    expect(right.base).toBe('walkRight');
  });
});

describe('createDragonMotion turn clips', () => {
  it('plays a turn clip when a standing dragon is asked to face far away', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const pose = machine.update({ dtMs: 16, speed: 0, desiredHeading: Math.PI });
    expect(pose.oneShot).toBe('turnLeft');
  });

  it('uses the small variant for a modest correction', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const half = (MOTION.turnClipThresholdDeg + MOTION.turnClipBigDeg) / 2;
    const pose = machine.update({ dtMs: 16, speed: 0, desiredHeading: half * DEG });
    expect(pose.oneShot).toBe('turnLeftSmall');
  });

  it('does not re-request a turn while one is still playing', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const first = machine.update({ dtMs: 16, speed: 0, desiredHeading: Math.PI });
    expect(first.oneShot).toBe('turnLeft');
    const second = machine.update({ dtMs: 16, speed: 0, desiredHeading: Math.PI });
    expect(second.oneShot).toBeNull();
  });

  it('leaves small heading errors to the silent damping', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const small = (MOTION.turnClipThresholdDeg - 10) * DEG;
    expect(machine.update({ dtMs: 16, speed: 0, desiredHeading: small }).oneShot).toBeNull();
  });

  it('does not play turn clips while walking', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const pose = machine.update({ dtMs: 16, speed: 120, desiredHeading: Math.PI });
    expect(pose.oneShot).toBeNull();
  });
});

describe('createDragonMotion flight', () => {
  const climbing = { isFlying: true, altitude: 40, targetAltitude: 80 };

  it('fires takeoff exactly once on the ground→air transition', () => {
    const machine = createDragonMotion({ motion: MOTION });
    expect(machine.update({ dtMs: 16, ...climbing }).oneShot).toBe('takeoff');
    machine.oneShotFinished();
    expect(machine.update({ dtMs: 16, ...climbing }).oneShot).toBeNull();
    expect(machine.airborne).toBe(true);
  });

  it('fires land on the way back down, once the descent has committed', () => {
    const machine = createDragonMotion({ motion: MOTION });
    machine.update({ dtMs: 16, ...climbing });
    machine.oneShotFinished();

    // Still high with flight off: the landing has not committed yet.
    const midair = machine.update({
      dtMs: 16, isFlying: false, altitude: 90, targetAltitude: 0,
    });
    expect(midair.oneShot).toBeNull();
    expect(machine.airborne).toBe(true);

    const landing = machine.update({
      dtMs: 16, isFlying: false, altitude: 4, targetAltitude: 0,
    });
    expect(landing.oneShot).toBe('land');
    expect(machine.airborne).toBe(false);
  });

  it('stays on the blended flight loop instead of switching clips to turn', () => {
    // Airborne turning is a weighted blend of the two banked sky clips, so the
    // base motion is `fly` throughout and the turn shows up in bankBlend.
    // Switching between three separate loops is what this replaced.
    const machine = createDragonMotion({ motion: MOTION });
    machine.update({ dtMs: 16, ...climbing });
    machine.oneShotFinished();
    expect(machine.update({ dtMs: 16, ...climbing }).base).toBe('fly');

    const turning = run(machine, { ...climbing, desiredHeading: Math.PI }, 400);
    expect(turning.base).toBe('fly');
  });

  describe('airborne bank blend', () => {
    it('is level when flying straight', () => {
      const machine = createDragonMotion({ motion: MOTION });
      machine.update({ dtMs: 16, ...climbing });
      machine.oneShotFinished();
      const straight = run(machine, climbing, 600);
      expect(straight.bankBlend).toBeCloseTo(0, 2);
    });

    it('leans toward the left clip on a left turn and the right on a right', () => {
      const left = createDragonMotion({ motion: MOTION });
      left.update({ dtMs: 16, ...climbing });
      left.oneShotFinished();
      // Positive yaw rate is a left turn, matching the heading convention.
      expect(run(left, { ...climbing, desiredHeading: Math.PI / 2 }, 500).bankBlend)
        .toBeGreaterThan(0.2);

      const right = createDragonMotion({ motion: MOTION });
      right.update({ dtMs: 16, ...climbing });
      right.oneShotFinished();
      expect(run(right, { ...climbing, desiredHeading: -Math.PI / 2 }, 500).bankBlend)
        .toBeLessThan(-0.2);
    });

    it('never leaves the -1..+1 the weighting expects', () => {
      const machine = createDragonMotion({ motion: MOTION });
      machine.update({ dtMs: 16, ...climbing });
      machine.oneShotFinished();
      // Hard alternating input, far past what the yaw limiter can follow.
      for (let i = 0; i < 60; i += 1) {
        const pose = machine.update({
          dtMs: 16, ...climbing, desiredHeading: i % 2 ? Math.PI : -Math.PI,
        });
        expect(pose.bankBlend).toBeGreaterThanOrEqual(-1);
        expect(pose.bankBlend).toBeLessThanOrEqual(1);
      }
    });

    it('eases rather than snapping, so the lean has weight', () => {
      const machine = createDragonMotion({ motion: MOTION });
      machine.update({ dtMs: 16, ...climbing });
      machine.oneShotFinished();

      const first = machine.update({ dtMs: 16, ...climbing, desiredHeading: Math.PI / 2 });
      const settled = run(machine, { ...climbing, desiredHeading: Math.PI / 2 }, 800);
      // One frame in it has barely moved; held, it commits.
      expect(first.bankBlend).toBeLessThan(0.2);
      expect(settled.bankBlend).toBeGreaterThan(first.bankBlend);
    });

    it('relaxes back to level when the turn stops', () => {
      const machine = createDragonMotion({ motion: MOTION });
      machine.update({ dtMs: 16, ...climbing });
      machine.oneShotFinished();
      const turned = run(machine, { ...climbing, desiredHeading: Math.PI / 2 }, 600);
      expect(Math.abs(turned.bankBlend)).toBeGreaterThan(0.2);

      // desiredHeading null means "hold whatever heading you have".
      const levelled = run(machine, { ...climbing, desiredHeading: null }, 1500);
      expect(Math.abs(levelled.bankBlend)).toBeLessThan(0.1);
    });

    it('treats the air as a wider arc than the ground', () => {
      // The same yaw rate should read as a smaller share of a full turn in the
      // air than on foot, which is what flightTurnRateDeg encodes.
      expect(MOTION.flightTurnRateDeg).toBeGreaterThan(MOTION.walkTurnRateDeg);
    });
  });

  it('rolls opposite the turn and levels out again', () => {
    const machine = createDragonMotion({ motion: MOTION });
    machine.update({ dtMs: 16, ...climbing });
    machine.oneShotFinished();

    const turning = run(machine, { ...climbing, desiredHeading: Math.PI }, 400);
    expect(turning.roll).toBeLessThan(0);
    expect(Math.abs(turning.roll)).toBeLessThanOrEqual(MOTION.bankMaxDeg * DEG + 1e-6);

    // Once the turn is finished the body returns to level.
    const settled = run(machine, { ...climbing, desiredHeading: machine.heading }, 2000);
    expect(Math.abs(settled.roll)).toBeLessThan(1 * DEG);
  });

  it('keeps the body level on the ground no matter the turn', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const pose = run(machine, { speed: 120, desiredHeading: Math.PI }, 500);
    expect(pose.roll).toBeCloseTo(0, 6);
    expect(pose.pitch).toBeCloseTo(0, 6);
  });

  it('pitches from the measured climb rate, not the gap to the target', () => {
    const machine = createDragonMotion({ motion: MOTION });
    // A large remaining gap with no actual movement must not tip the nose.
    machine.update({ dtMs: 16, isFlying: true, altitude: 10, targetAltitude: 140 });
    machine.oneShotFinished();
    const stalled = run(
      machine,
      { isFlying: true, altitude: 10, targetAltitude: 140 },
      500,
    );
    expect(Math.abs(stalled.pitch)).toBeLessThan(1 * DEG);
  });
});

describe('createDragonMotion actions', () => {
  it('fires a player action once per request, not once per frame', () => {
    const machine = createDragonMotion({ motion: MOTION });
    expect(machine.update({ dtMs: 16, action: 'dracarys' }).oneShot).toBe('dracarys');
    expect(machine.update({ dtMs: 16, action: 'dracarys' }).oneShot).toBeNull();
    machine.update({ dtMs: 16, action: null });
    expect(machine.update({ dtMs: 16, action: 'dracarys' }).oneShot).toBe('dracarys');
  });

  it('lets an action outrank a takeoff on the same frame', () => {
    const machine = createDragonMotion({ motion: MOTION });
    const pose = machine.update({
      dtMs: 16, action: 'attack', isFlying: true, altitude: 40, targetAltitude: 80,
    });
    expect(pose.oneShot).toBe('attack');
  });
});

describe('createDragonMotion idle breaks', () => {
  it('never breaks before the idle threshold', () => {
    const machine = createDragonMotion({ motion: MOTION, random: () => 0 });
    const pose = run(machine, { speed: 0 }, (MOTION.idleBreakAfterSec - 2) * 1000);
    expect(pose.oneShot).toBeNull();
  });

  it('breaks once the dragon has been still long enough', () => {
    const machine = createDragonMotion({ motion: MOTION, random: () => 0 });
    let fired = false;
    for (let i = 0; i < 2000 && !fired; i++) {
      if (machine.update({ dtMs: 16, speed: 0 }).oneShot === 'idleBreak') fired = true;
    }
    expect(fired).toBe(true);
  });

  it('resets the idle timer as soon as the dragon moves', () => {
    const machine = createDragonMotion({ motion: MOTION, random: () => 0 });
    run(machine, { speed: 0 }, (MOTION.idleBreakAfterSec + 5) * 1000);
    machine.update({ dtMs: 16, speed: 100 });
    expect(machine.idleSec).toBe(0);
  });
});
