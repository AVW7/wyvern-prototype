# Blender Python script for generating low-poly 3D sanctuary props
# Driven by blender-toolkit standards and automated GLTF export.
#
# Usage:
#   /Applications/Blender.app/Contents/MacOS/Blender --background --python tools/generate-sanctuary-props.py -- out_dir

import sys
import os
import math
try:
    import bpy  # type: ignore[import-not-found,import]
except ImportError:
    bpy = None  # Script executes inside Blender's embedded Python interpreter

def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def create_material(name, color, roughness=0.4, metallic=0.1, emission_color=None, emission_strength=1.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs['Base Color'].default_value = color
        bsdf.inputs['Roughness'].default_value = roughness
        bsdf.inputs['Metallic'].default_value = metallic
        if emission_color:
            if 'Emission Color' in bsdf.inputs:
                bsdf.inputs['Emission Color'].default_value = emission_color
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = emission_strength
    return mat

def export_glb(filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=False
    )
    print(f"✅ Exported 3D asset to {filepath}")

def build_crystal_pylon(out_path):
    clear_scene()
    
    # Base pedestal (Cylinder)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.8, depth=0.4, vertices=8, location=(0, 0, 0.2))
    pedestal = bpy.context.active_object
    pedestal.name = "Pylon_Base"
    mat_stone = create_material("Stone_Dark", (0.15, 0.17, 0.22, 1.0), roughness=0.8, metallic=0.2)
    pedestal.data.materials.append(mat_stone)

    # Main Crystal (Cylinder tapered into pylon)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.4, depth=2.2, vertices=6, location=(0, 0, 1.4))
    crystal = bpy.context.active_object
    crystal.name = "Resonance_Crystal"
    crystal.rotation_euler = (0, 0, math.radians(15))
    mat_crystal = create_material(
        "Crystal_Glow",
        (0.1, 0.7, 0.9, 1.0),
        roughness=0.1,
        metallic=0.1,
        emission_color=(0.2, 0.8, 1.0, 1.0),
        emission_strength=2.5
    )
    crystal.data.materials.append(mat_crystal)

    # Secondary shard
    bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=1.1, vertices=5, location=(0.4, 0.2, 0.85))
    shard = bpy.context.active_object
    shard.name = "Crystal_Shard"
    shard.rotation_euler = (math.radians(12), math.radians(-15), math.radians(45))
    shard.data.materials.append(mat_crystal)

    export_glb(out_path)

def build_dragon_brazier(out_path):
    clear_scene()

    # Stone Base
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0.25))
    base = bpy.context.active_object
    base.name = "Brazier_Base"
    base.scale = (0.9, 0.9, 0.5)
    mat_basalt = create_material("Basalt_Stone", (0.1, 0.1, 0.12, 1.0), roughness=0.9, metallic=0.0)
    base.data.materials.append(mat_basalt)

    # Iron Bowl (Cone inverted)
    bpy.ops.mesh.primitive_cone_add(radius1=0.75, radius2=0.45, depth=0.6, vertices=12, location=(0, 0, 0.8))
    bowl = bpy.context.active_object
    bowl.name = "Iron_Bowl"
    mat_iron = create_material("Wrought_Iron", (0.2, 0.2, 0.22, 1.0), roughness=0.4, metallic=0.8)
    bowl.data.materials.append(mat_iron)

    # Ember Core (Sphere)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.35, segments=12, ring_count=8, location=(0, 0, 0.95))
    ember = bpy.context.active_object
    ember.name = "Fire_Embers"
    mat_fire = create_material(
        "Dragon_Fire",
        (1.0, 0.35, 0.05, 1.0),
        roughness=0.2,
        emission_color=(1.0, 0.45, 0.1, 1.0),
        emission_strength=4.0
    )
    ember.data.materials.append(mat_fire)

    export_glb(out_path)

def build_sanctuary_pedestal(out_path):
    clear_scene()

    # Lower Tier
    bpy.ops.mesh.primitive_cylinder_add(radius=1.2, depth=0.3, vertices=12, location=(0, 0, 0.15))
    tier1 = bpy.context.active_object
    tier1.name = "Pedestal_Tier1"
    mat_gold_accent = create_material("Gold_Trim", (0.85, 0.65, 0.2, 1.0), roughness=0.3, metallic=0.9)
    mat_obsidian = create_material("Obsidian_Tile", (0.08, 0.08, 0.1, 1.0), roughness=0.2, metallic=0.3)
    tier1.data.materials.append(mat_obsidian)

    # Upper Pillar
    bpy.ops.mesh.primitive_cylinder_add(radius=0.85, depth=0.8, vertices=12, location=(0, 0, 0.7))
    pillar = bpy.context.active_object
    pillar.name = "Pedestal_Pillar"
    pillar.data.materials.append(mat_gold_accent)

    export_glb(out_path)

def main():
    argv = sys.argv
    if "--" in argv:
        args = argv[argv.index("--") + 1:]
        out_dir = args[0] if len(args) > 0 else "assets/models/props"
    else:
        out_dir = "assets/models/props"

    print(f"🔨 Generating sanctuary 3D props using blender-toolkit standards...")
    os.makedirs(out_dir, exist_ok=True)
    
    build_crystal_pylon(os.path.join(out_dir, "crystal-pylon.glb"))
    build_dragon_brazier(os.path.join(out_dir, "dragon-brazier.glb"))
    build_sanctuary_pedestal(os.path.join(out_dir, "sanctuary-pedestal.glb"))
    
    print("✨ All sanctuary 3D props generated successfully!")

if __name__ == "__main__":
    main()
