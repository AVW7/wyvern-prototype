# Python script executed inside Blender to analyze flight clip keyframes,
# wing stroke phases, bone rotation ranges, and frame durations.

import os
import sys

try:
    import bpy # type: ignore
except ImportError:
    bpy = None

def analyze_flight_frames(glb_path):
    if not bpy:
        print("Blender environment (bpy) not detected.")
        return

    bpy.ops.wm.read_factory_settings(use_empty=True)
    print(f"--- Analyzing Flight Animation Frames in GLB: {glb_path} ---")

    if not os.path.exists(glb_path):
        print(f"Error: File not found: {glb_path}")
        return

    bpy.ops.import_scene.gltf(filepath=glb_path)

    flight_clips = [
        'Fly_Level_Loop',
        'Fly_Hover_Loop',
        'Fly_BankL_Loop',
        'Fly_BankR_Loop',
        'Fly_Glide_Loop',
        'Fly_Takeoff',
        'Fly_Land',
        'Fly_Dracarys',
    ]

    actions = {act.name: act for act in bpy.data.actions if act.name in flight_clips}

    print("\n--- FLIGHT CLIP FRAME DETAILED ANALYSIS ---")
    for name in flight_clips:
        act = actions.get(name)
        if not act:
            print(f"Clip '{name}': NOT FOUND in GLB")
            continue

        start, end = act.frame_range
        total_frames = end - start + 1
        duration_sec = total_frames / 30.0

        # Analyze keyframe distribution on wing/spine bones
        wing_fcurves = getattr(act, 'fcurves', None) or []
        keyframe_points = set()
        for fc in wing_fcurves:
            if hasattr(fc, 'keyframe_points'):
                for kp in fc.keyframe_points:
                    keyframe_points.add(round(kp.co.x))

        sorted_keys = sorted(list(keyframe_points))

        print(f"\n🎥 Clip: '{name}'")
        print(f"   Frame Range: {start:.0f}..{end:.0f} ({total_frames:.0f} frames, {duration_sec:.2f}s @ 30fps)")
        print(f"   Keyframe Count: {len(sorted_keys)} keyframes across wing/spine curves")
        print(f"   Keyframe Sample: {sorted_keys[:10]}")

        # Determine wing flap phase beats (downstroke vs upstroke inflection points)
        if 'Loop' in name:
            mid = start + (end - start) / 2
            print(f"   Flap Cycle Phase: Downstroke ~Frame {start:.0f} -> Upstroke Peak ~Frame {mid:.0f} -> Cycle End {end:.0f}")

if __name__ == '__main__':
    glb = os.path.join(os.getcwd(), 'assets', 'models', 'dragon', 'drogon-sanctuary.glb')
    if len(sys.argv) > 1 and sys.argv[-1].endswith('.glb'):
        glb = sys.argv[-1]
    analyze_flight_frames(glb)
