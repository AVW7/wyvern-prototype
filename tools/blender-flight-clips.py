# Derives the flight clips the Drogon source never shipped, and exports the
# intermediate GLB that tools/prep-drogon.mjs then compresses.
#
# The source (Sketchfab "Drogon - Game of Thrones Dragon") has 52 clips and not
# one of them is level flight. It has two banked sky manoeuvres, SkyMoveL and
# SkyMoveR, and the game used to fake level flight by holding both at once and
# cross-weighting them so their opposing banks cancel.
#
# That cross-blend costs no wing amplitude — per wingbeat on Bip002-L/R-UpperArm
# the sources swing 70.0/71.0 and 71.0/70.0 deg, and the 0.42 mix keeps
# 70.6/70.4. What it does not do is cancel the bank it was meant to cancel.
# Measured in world space on the posed rig, as the roll of the shoulder line:
# SkyMoveL sits at +40.63 deg mean, SkyMoveR at -40.19, and the mix lands at
# +5.24 deg, sweeping -4.86 to +10.94 every beat. Cruise leaned 5 deg left and
# rocked through 16 deg. Blending two steeply banked poses averages the poses,
# not the bank. The derived level clip holds -0.58 deg, range -0.97 to -0.13.
#
# Nothing here is hand-keyed. Every clip is a transformation of existing curves
# — window, splice, retime, layer — so the result stays in the original
# animator's style.
#
# The splice is the load-bearing idea. SkyMoveL and SkyMoveR are exact mirrors
# of each other and, measured by cross-correlating the driving wing's angular
# track, they are in phase to 0 frames. So a symmetric level cycle does not
# need a bone-to-bone mirror map (this rig will not give you one — two thirds of
# its bones are named Bone0NN with no side suffix, and a geometric matcher pairs
# them wrongly). It needs only the *side* of each bone: take left-side bones
# from SkyMoveL, where the left wing drives, take right-side bones from
# SkyMoveR, where the right one does, and average the centreline chain, which
# cancels the two clips' opposing spine bank (+2.63 deg / -2.23 deg).
#
# Headless:
#   blender --background --python tools/blender-flight-clips.py -- \
#       ~/Downloads/drogon-game-of-thrones-dragon/source/Dragon.fbx out.glb
#
# Interactively (rig already imported), to iterate on the clips alone:
#   exec(open("tools/blender-flight-clips.py").read()); derive_all(arm)

import math
import sys

try:
    import bpy  # type: ignore[import-not-found,import]
    from mathutils import Quaternion  # type: ignore[import-not-found,import]
except ImportError:
    bpy = None  # Script executes inside Blender's embedded Python interpreter
    Quaternion = None

ARMATURE = "SKM_DaenerysDragon"

SKY_L = "DaenerysDragon_Battle_SkyMoveL"
SKY_R = "DaenerysDragon_Battle_SkyMoveR"
CLIMB = "DaenerysDragon_Battle_Up"
DESCEND = "DaenerysDragon_Battle_Down"
STAND = "AA_DaenerysDragon_Battle_Stand"
BREATH = "DaenerysDragon_Battle_Skill08"

# The wingbeat window. The sky clips are 201 frames of the same 25-frame beat
# repeated eight times (mid-crossings at 6, 31, 55, 81, 106, 131, 156, 181), so
# a cycle can be cut anywhere. 113 is where it cuts most seamlessly: summed over
# all 2199 channels, frame 113 differs from frame 138 by 17.4, against 108.3 for
# the beat-crossing frame 108. Everything derived from the beat shares this
# window, which is what keeps the level and bank loops phase-aligned — the
# engine blends them at a common `time`, so a phase difference would show up as
# the wings fighting each other mid-turn.
CYCLE_START = 113
CYCLE_LEN = 25

# Frame of the cycle where the wings reach flattest and widest — the glide hold.
# Measured, see glide_cycle().
GLIDE_HOLD = 124

# A bone counts as left or right if its midpoint sits this far off the
# centreline; anything nearer is spine/neck/tail and gets the average.
SIDE_EPS = 1.0

# The rider. 61 bones of Daenerys and her cloak, with zero vertex groups on the
# mesh — animated and exported for nothing.
RIDER_PREFIXES = ("Bip001", "Cloak_")

# Clips kept alongside the derived ones. The sky manoeuvres, Up and Down are
# *not* here: they are inputs now, superseded by what they produce.
KEEP_SOURCE = (
    "DaenerysDragon_Neutural_Watch",
    "DaenerysDragon_Neutural_Roar",
    "AA_DaenerysDragon_Battle_Stand",
    "DaenerysDragon_Battle_Walk",
    "DaenerysDragon_Battle_WalkL",
    "DaenerysDragon_Battle_WalkR",
    "DaenerysDragon_Battle_TurnL20",
    "DaenerysDragon_Battle_TurnR20",
    "DaenerysDragon_Battle_TurnL90",
    "DaenerysDragon_Battle_TurnR90",
    "DaenerysDragon_Battle_TurnL180",
    "DaenerysDragon_Battle_TurnR180",
    "DaenerysDragon_Battle_Attack01",
    "DaenerysDragon_Battle_Attack04",
    "DaenerysDragon_Battle_Skill08",
    "DaenerysDragon_Battle_Skill10_L",
    "DaenerysDragon_Battle_Skill10_R",
)


# ── Reading the source curves ─────────────────────────────────────────────────

def channelbag(action):
    """The one channelbag of a layered (4.4+) action."""
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag = strip.channelbag(slot)
                if bag:
                    return bag
    return None


def source_action(name):
    """A source clip by name, tolerating the FBX importer's object prefix.

    A fresh import_scene.fbx names actions "SKM_DaenerysDragon|<clip>"; a rig
    imported and tidied by hand carries the bare name. Accept either, so the
    headless path and an interactive session resolve the same clips.
    """
    action = bpy.data.actions.get(name)
    if action:
        return action
    found = [a for a in bpy.data.actions if a.name.split("|")[-1] == name]
    if len(found) != 1:
        raise KeyError("%s: matched %d actions" % (name, len(found)))
    return found[0]


def channels(action):
    """{(data_path, array_index): fcurve} for every channel in `action`."""
    return {(f.data_path, f.array_index): f for f in channelbag(action).fcurves}


def bone_of(data_path):
    return data_path.split('"')[1] if '"' in data_path else None


def side_map(arm):
    """Bone name -> 'L' | 'R' | 'C', from where the bone sits laterally.

    X is the lateral axis on this rig (Bip002-L-UpperArm at +385, the R one at
    -385). Using the head/tail midpoint rather than the head alone keeps bones
    that start on the centreline and reach outward on the correct side.
    """
    sides = {}
    for bone in arm.data.bones:
        x = (bone.head_local.x + bone.tail_local.x) / 2
        sides[bone.name] = "L" if x > SIDE_EPS else ("R" if x < -SIDE_EPS else "C")
    return sides


def wing_bones(arm):
    """Everything hanging off either clavicle — the wings."""
    out = set()
    for bone in arm.data.bones:
        node = bone
        while node:
            if node.name.endswith("-Clavicle"):
                out.add(bone.name)
                break
            node = node.parent
    return out


# ── Writing a derived action ──────────────────────────────────────────────────

def write_action(name, template, n_frames, values):
    """Build an action by copying `template`'s channel layout and overwriting it.

    Copying is deliberate: it inherits the slot/layer/channelbag structure and
    every channel's data path, so the derivation only has to supply numbers.
    `values` is {(data_path, index): [v0 .. v(n-1)]}. A channel the derivation
    did not supply is flattened to a hold rather than left alone — the template
    is a 201-frame clip, and anything not overwritten would otherwise smuggle
    its whole curve into a 25-frame one.
    """
    if name in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[name])
    action = template.copy()
    action.name = name
    action.use_fake_user = True

    for fcurve in channelbag(action).fcurves:
        series = values.get((fcurve.data_path, fcurve.array_index))
        if series is None:
            series = [fcurve.evaluate(CYCLE_START)] * n_frames
        points = fcurve.keyframe_points
        while len(points) > n_frames:
            points.remove(points[len(points) - 1], fast=True)
        if len(points) < n_frames:
            points.add(n_frames - len(points))
        for i, value in enumerate(series):
            point = points[i]
            point.co = (i + 1, value)
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
        fcurve.update()

    action.frame_start = 1
    action.frame_end = n_frames
    action.use_frame_range = True
    return action


def seal(values):
    """Force the last frame to equal the first, so the clip loops without a pop.

    The window is chosen to make this correction tiny (17.4 summed over 2199
    channels), but "tiny" still reads as a twitch once a second at 24 fps.
    """
    for series in values.values():
        series[-1] = series[0]
    return values


# ── Quaternion helpers ────────────────────────────────────────────────────────
#
# Bone rotation has to be treated as a quaternion, not four independent floats:
# scaling a stroke or blending two poses component-wise takes the pose off the
# unit sphere and skews it. Channels that are not rotation_quaternion (location,
# scale, the handful of rotation_euler channels) are plain scalars and are
# interpolated linearly.

def quat_keys(data_path):
    return [(data_path, i) for i in range(4)]


def align(reference, quat):
    """Flip `quat` onto `reference`'s hemisphere; q and -q are the same pose."""
    return -quat if reference.dot(quat) < 0 else quat


def mean_quat(series):
    total = Quaternion((0, 0, 0, 0))
    first = series[0]
    for quat in series:
        aligned = align(first, quat)
        total = Quaternion((total.w + aligned.w, total.x + aligned.x,
                            total.y + aligned.y, total.z + aligned.z))
    total.normalize()
    return total


def scale_about(reference, quat, factor):
    """Push `quat` further from (or nearer to) `reference` along the same arc."""
    delta = reference.inverted() @ align(reference, quat)
    angle = delta.angle
    if angle < 1e-6:
        return quat
    return reference @ Quaternion(delta.axis, angle * factor)


def blend(a, b, t):
    return a.slerp(align(a, b), t)


# ── The clips ─────────────────────────────────────────────────────────────────

def sample_spliced(chan_l, chan_r, sides, key, frame):
    """One channel of the level cycle: left from SkyMoveL, right from SkyMoveR.

    The centreline chain averages the two, which is where the residual bank
    goes. Averaging quaternion channels component-wise would be wrong, so the
    caller re-normalises per bone; see level_cycle().
    """
    bone = bone_of(key[0])
    side = sides.get(bone, "C") if bone else "C"
    left, right = chan_l.get(key), chan_r.get(key)
    if left is None and right is None:
        return None
    if side == "L":
        return (left or right).evaluate(frame)
    if side == "R":
        return (right or left).evaluate(frame)
    if left is None:
        return right.evaluate(frame)
    if right is None:
        return left.evaluate(frame)
    return (left.evaluate(frame) + right.evaluate(frame)) / 2


def level_cycle(arm, frames=None):
    """Fly_Level_Loop — the clip the source never had.

    Both wings at their authored ~70 deg per beat, symmetric to 0.1 deg,
    seamless, 25 frames instead of 201.
    """
    chan_l = channels(source_action(SKY_L))
    chan_r = channels(source_action(SKY_R))
    sides = side_map(arm)
    frames = frames or [CYCLE_START + i for i in range(CYCLE_LEN + 1)]

    values = {}
    for key in set(chan_l) | set(chan_r):
        series = [sample_spliced(chan_l, chan_r, sides, key, f) for f in frames]
        if series[0] is not None:
            values[key] = series

    # Re-normalise the centreline quaternions the average above pulled inside
    # the unit sphere. The sided bones came from one clip each and are already
    # unit, so this only touches spine, neck, head and tail.
    for bone, side in sides.items():
        if side != "C":
            continue
        keys = quat_keys('pose.bones["%s"].rotation_quaternion' % bone)
        if keys[0] not in values:
            continue
        for i in range(len(frames)):
            quat = Quaternion([values[k][i] for k in keys])
            if quat.magnitude < 1e-9:
                continue
            quat.normalize()
            for k, component in zip(keys, quat):
                values[k][i] = component
    return seal(values)


def bank_cycle(source_name, frames=None):
    """Fly_BankL_Loop / Fly_BankR_Loop — the same window, unmirrored.

    Full authored bank, inside wing held and outside wing driving, cut on the
    level cycle's window so the two stay phase-locked when blended.
    """
    chan = channels(source_action(source_name))
    frames = frames or [CYCLE_START + i for i in range(CYCLE_LEN + 1)]
    return seal({key: [fc.evaluate(f) for f in frames] for key, fc in chan.items()})


def hover_cycle(arm, n_frames=36, stroke=1.18, climb_bias=0.0):
    """Fly_Hover_Loop — slower, deeper wingbeats on a level body.

    Airborne-and-stationary currently plays the cruise, which reads as the
    dragon coasting on nothing. Hovering is the level cycle stretched, with a
    deeper stroke. The earlier climb-pose blend made the body visibly dive at
    rest, so stationary flight now retains the level cycle's centreline pose.
    """
    level = level_cycle(arm)
    sides = side_map(arm)
    wings = wing_bones(arm)
    climb = channels(source_action(CLIMB))
    # A single beat of the climb, matched to the hover's own length.
    climb_frames = [115 + i * (35 / (n_frames - 1)) for i in range(n_frames)]

    def at(series, t):
        """Level cycle resampled to the stretched timeline."""
        span = (len(series) - 1) * t
        i = min(int(span), len(series) - 2)
        return series[i] + (series[i + 1] - series[i]) * (span - i)

    values = {}
    for key, series in level.items():
        values[key] = [at(series, i / (n_frames - 1)) for i in range(n_frames)]

    for bone, side in sides.items():
        keys = quat_keys('pose.bones["%s"].rotation_quaternion' % bone)
        if keys[0] not in values:
            continue
        series = [Quaternion([values[k][i] for k in keys]) for i in range(n_frames)]
        if bone in wings and side != "C":
            reference = mean_quat(series)
            series = [scale_about(reference, q, stroke) for q in series]
        elif side == "C" and keys[0] in climb:
            for i, frame in enumerate(climb_frames):
                target = Quaternion([climb[k].evaluate(frame) for k in keys])
                series[i] = blend(series[i], target, climb_bias)
        for i, quat in enumerate(series):
            for k, component in zip(keys, quat):
                values[k][i] = component
    return seal(values)


def glide_cycle(arm, hold_frame, n_frames=48, breathe=0.07):
    """Fly_Glide_Loop — wings held out, with enough life not to read as a freeze.

    `hold_frame` is the frame of the level cycle where the wings are spread
    flattest. Picked by measurement, not by eye: pose the rig at each frame of
    the cycle and take the wingtip's horizontal reach from the clavicle. Frame
    124 reaches 2361 units out and sits 170 off horizontal; the two mid-stroke
    frames are not interchangeable, and the obvious guess of CYCLE_START + 6
    lands at 353 units, i.e. wings nearly folded.
    """
    level = level_cycle(arm)
    index = hold_frame - CYCLE_START
    sides = side_map(arm)

    values = {}
    for key, series in level.items():
        values[key] = [series[index]] * n_frames

    for bone in sides:
        keys = quat_keys('pose.bones["%s"].rotation_quaternion' % bone)
        if keys[0] not in values:
            continue
        held = Quaternion([level[k][index] for k in keys])
        for i in range(n_frames):
            phase = breathe * math.sin(2 * math.pi * i / (n_frames - 1))
            source_i = (index + i) % (len(level[keys[0]]) - 1)
            live = Quaternion([level[k][source_i] for k in keys])
            quat = blend(held, live, abs(phase)) if phase else held
            for k, component in zip(keys, quat):
                values[k][i] = component
    return seal(values)


def retimed(source_name, n_frames, first=None, last=None):
    """Resample a clip onto a shorter timeline."""
    chan = channels(source_action(source_name))
    action = source_action(source_name)
    start = first if first is not None else int(action.frame_range[0])
    end = last if last is not None else int(action.frame_range[1])
    step = (end - start) / (n_frames - 1)
    frames = [start + i * step for i in range(n_frames)]
    return {key: [fc.evaluate(f) for f in frames] for key, fc in chan.items()}


def resolve_into(arm, values, target, n_frames, over):
    """Ease a clip's tail onto `target` so it ends on a pose, not mid-move.

    `target` is {key: value}. Used to land Fly_Takeoff on the level cycle's
    first frame and Fly_Land on the standing pose — the source's Battle_Down
    starts *and* ends in the flight pose, so landing never actually landed.
    """
    sides = side_map(arm)
    for key, series in values.items():
        if key not in target or key[0].endswith("rotation_quaternion"):
            continue
        for i in range(n_frames - over, n_frames):
            t = (i - (n_frames - over - 1)) / over
            series[i] = series[i] * (1 - t) + target[key] * t

    for bone in sides:
        keys = quat_keys('pose.bones["%s"].rotation_quaternion' % bone)
        if keys[0] not in values or keys[0] not in target:
            continue
        goal = Quaternion([target[k] for k in keys])
        for i in range(n_frames - over, n_frames):
            t = (i - (n_frames - over - 1)) / over
            quat = blend(Quaternion([values[k][i] for k in keys]), goal, t)
            for k, component in zip(keys, quat):
                values[k][i] = component
    return values


def pose_at(action_name, frame):
    return {key: fc.evaluate(frame)
            for key, fc in channels(source_action(action_name)).items()}


def dracarys_cycle(arm, n_frames=50):
    """Fly_Dracarys — breathing fire on the wing.

    Skill08 is the only fire breath in the source and it is grounded: its
    UpperArms swing 111 deg and its legs and toes are keyed against the floor.
    Only its neck and head carry the gesture (Neck 35 deg, Neck1 25 deg,
    Neck2 51 deg, Head 73 deg, peaking around frames 35-55), so that chain is
    layered over two turns of the level cycle and the rest is discarded. The
    rig has no jaw bone; the flame stays the particle effect
    createDracarysParticles() already spawns.
    """
    level = level_cycle(arm)
    cycle = len(level[next(iter(level))]) - 1
    values = {key: [series[i % cycle] for i in range(n_frames)]
              for key, series in level.items()}

    breath = channels(source_action(BREATH))
    breath_frames = [13 + i * (49 / (n_frames - 1)) for i in range(n_frames)]
    for bone in ("Bip002-Neck", "Bip002-Neck1", "Bip002-Neck2", "Bip002-Head"):
        for key in quat_keys('pose.bones["%s"].rotation_quaternion' % bone):
            if key not in breath or key not in values:
                continue
            values[key] = [breath[key].evaluate(f) for f in breath_frames]
    return values


def derive_all(arm, glide_hold=None):
    """Build every derived clip. Returns {name: action}."""
    template = source_action(SKY_L)
    made = {}

    level = level_cycle(arm)
    made["Fly_Level_Loop"] = write_action(
        "Fly_Level_Loop", template, CYCLE_LEN + 1, level)
    made["Fly_BankL_Loop"] = write_action(
        "Fly_BankL_Loop", template, CYCLE_LEN + 1, bank_cycle(SKY_L))
    made["Fly_BankR_Loop"] = write_action(
        "Fly_BankR_Loop", template, CYCLE_LEN + 1, bank_cycle(SKY_R))
    made["Fly_Hover_Loop"] = write_action(
        "Fly_Hover_Loop", template, 36, hover_cycle(arm))
    made["Fly_Glide_Loop"] = write_action(
        "Fly_Glide_Loop", template, 48,
        glide_cycle(arm, glide_hold if glide_hold else GLIDE_HOLD))

    # Takeoff: Battle_Up is 8.2 s, which is a long time to watch a dragon
    # decide. Retimed to 2.5 s and resolved onto the level cycle's first frame
    # so the loop it hands off to starts from the pose it ended on.
    level_first = {key: series[0] for key, series in level.items()}
    takeoff = resolve_into(arm, retimed(CLIMB, 60), level_first, 60, 8)
    made["Fly_Takeoff"] = write_action("Fly_Takeoff", template, 60, takeoff)

    # Landing: Battle_Down is a descent *loop* — it starts and ends in the
    # flight pose, so bound as `land` it never put the dragon on the ground.
    # Its opening drop is the usable part; the rest is a flare onto the pose
    # the idle clips start from.
    land = resolve_into(arm, retimed(DESCEND, 45, first=1, last=40),
                        pose_at(STAND, 1), 45, 15)
    made["Fly_Land"] = write_action("Fly_Land", template, 45, land)

    made["Fly_Dracarys"] = write_action(
        "Fly_Dracarys", template, 50, dracarys_cycle(arm))
    return made


# ── Export ────────────────────────────────────────────────────────────────────

def strip_rider(arm):
    """Delete the Daenerys/cloak chain — 61 bones with no vertex groups."""
    mesh = next((c for c in arm.children if c.type == "MESH"), None)
    skinned = {g.name for g in mesh.vertex_groups} if mesh else set()
    doomed = [b.name for b in arm.data.bones
              if b.name.startswith(RIDER_PREFIXES) and b.name not in skinned]
    if not doomed:
        return 0

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    for name in doomed:
        bone = arm.data.edit_bones.get(name)
        if bone:
            arm.data.edit_bones.remove(bone)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Their channels outlive the bones and would still be exported.
    for action in bpy.data.actions:
        bag = channelbag(action)
        if not bag:
            continue
        for fcurve in list(bag.fcurves):
            if bone_of(fcurve.data_path) in doomed:
                bag.fcurves.remove(fcurve)
    return len(doomed)


def prune_actions(keep):
    """Drop every action not in `keep`, matching past the FBX object prefix."""
    dropped = 0
    for action in list(bpy.data.actions):
        if action.name.split("|")[-1] not in keep:
            bpy.data.actions.remove(action)
            dropped += 1
    return dropped


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) < 2:
        raise SystemExit("usage: ... -- <Dragon.fbx> <out.glb>")
    src, dst = argv[0], argv[1]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)
    arm = bpy.data.objects[ARMATURE]

    made = derive_all(arm)
    print("derived %d clips: %s" % (len(made), ", ".join(sorted(made))))
    print("stripped %d rider bones" % strip_rider(arm))
    print("dropped %d source clips" % prune_actions(set(KEEP_SOURCE) | set(made)))

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=dst, export_format="GLB",
        export_animations=True, export_animation_mode="ACTIONS",
        export_bake_animation=False, export_optimize_animation_size=True,
        export_apply=False,
    )
    print("wrote", dst)


if __name__ == "__main__" and bpy.app.background:
    main()
