# Python script executed inside Blender to inspect the Drogon Wyvern GLB model:
# - Direction facing vector (+Z, -Z, +Y, -Y)
# - Bounding box dimensions (Length, Wingspan, Height)
# - Armature bone structure & root bone name
# - Animation action list & track lengths

import sys
import os

try:
    import bpy # type: ignore
    import mathutils # type: ignore
except ImportError:
    bpy = None
    mathutils = None

def inspect_wyvern(glb_path):
    if not bpy:
        print("Blender environment (bpy) not detected.")
        return

    # Reset scene
    bpy.ops.wm.read_factory_settings(use_empty=True)

    print(f"--- Inspecting Wyvern GLB: {glb_path} ---")
    if not os.path.exists(glb_path):
        print(f"Error: File not found: {glb_path}")
        return

    # Import GLB
    bpy.ops.import_scene.gltf(filepath=glb_path)

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE']

    print(f"Found {len(meshes)} meshes, {len(armatures)} armatures.")

    # Calculate combined bounding box
    min_x = min_y = min_z = float('inf')
    max_x = max_y = max_z = float('-inf')

    for obj in meshes:
        for corner in obj.bound_box:
            world_corner = obj.matrix_world @ mathutils.Vector(corner)
            min_x = min(min_x, world_corner.x)
            max_x = max(max_x, world_corner.x)
            min_y = min(min_y, world_corner.y)
            max_y = max(max_y, world_corner.y)
            min_z = min(min_z, world_corner.z)
            max_z = max(max_z, world_corner.z)

    width_x = max_x - min_x
    length_y = max_y - min_y
    height_z = max_z - min_z

    print("\n--- BODY SHAPE & BOUNDING BOX ---")
    print(f"X-Span (Wingspan): {width_x:.3f} units")
    print(f"Y-Span (Head-to-Tail Length): {length_y:.3f} units")
    print(f"Z-Span (Height): {height_z:.3f} units")
    print(f"Min Bounds: ({min_x:.2f}, {min_y:.2f}, {min_z:.2f})")
    print(f"Max Bounds: ({max_x:.2f}, {max_y:.2f}, {max_z:.2f})")

    # Armature & Orientation Analysis
    print("\n--- ARMATURE & FORWARD DIRECTION ANALYSIS ---")
    if armatures:
        arm = armatures[0]
        print(f"Armature Name: {arm.name}")
        print(f"Armature Scale: {arm.scale}")
        print(f"Armature Rotation: {arm.rotation_euler}")
        
        root_bones = [b.name for b in arm.data.bones if b.parent is None]
        print(f"Root Bone(s): {root_bones}")
        print(f"Total Bones: {len(arm.data.bones)}")

        # Check spine / head / tail bones for facing vector
        spine_bones = [b.name for b in arm.data.bones if 'head' in b.name.lower() or 'neck' in b.name.lower() or 'tail' in b.name.lower()]
        print(f"Key Spine/Neck/Tail Bones: {spine_bones[:8]}")

        # Check forward facing orientation based on head vs tail position
        head_bones = [b for b in arm.data.bones if 'head' in b.name.lower()]
        tail_bones = [b for b in arm.data.bones if 'tail' in b.name.lower()]
        
        if head_bones and tail_bones:
            head_pos = arm.matrix_world @ head_bones[0].head_local
            tail_pos = arm.matrix_world @ tail_bones[-1].head_local
            diff = head_pos - tail_pos
            print(f"Head Position: ({head_pos.x:.2f}, {head_pos.y:.2f}, {head_pos.z:.2f})")
            print(f"Tail Position: ({tail_pos.x:.2f}, {tail_pos.y:.2f}, {tail_pos.z:.2f})")
            print(f"Head-to-Tail Vector: ({diff.x:.2f}, {diff.y:.2f}, {diff.z:.2f})")
            if abs(diff.y) > abs(diff.x) and abs(diff.y) > abs(diff.z):
                facing = "+Y (Forward)" if diff.y > 0 else "-Y (Forward)"
            elif abs(diff.z) > abs(diff.x):
                facing = "+Z (Forward)" if diff.z > 0 else "-Z (Forward)"
            else:
                facing = "+X (Forward)" if diff.x > 0 else "-X (Forward)"
            print(f"Primary Facing Orientation: {facing}")

    # Animations
    print("\n--- ANIMATIONS ---")
    actions = bpy.data.actions
    print(f"Total Animations/Actions: {len(actions)}")
    for act in actions:
        start, end = act.frame_range
        fps = 30
        duration = (end - start) / fps
        print(f" - Clip: '{act.name}' ({end - start + 1:.0f} frames, {duration:.2f}s)")

if __name__ == '__main__':
    glb = os.path.join(os.getcwd(), 'assets', 'models', 'dragon', 'drogon-sanctuary.glb')
    if len(sys.argv) > 1 and sys.argv[-1].endswith('.glb'):
        glb = sys.argv[-1]
    inspect_wyvern(glb)
