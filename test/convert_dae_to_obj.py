#!/usr/bin/env python3
"""
Convert a COLLADA (.dae) brain model to per-region OBJ meshes.
Each geometry in the scene becomes a separate OBJ file in models/.
Outputs a regions.json with metadata for the viewer.
"""

import os
import json
import trimesh
import numpy as np

# ─── Color palette (HSL-based, visually distinct) ───────────────────────────
PALETTE = [
    "#e07a8e", "#7ab8e0", "#8ee07a", "#e0c87a", "#b07ae0", "#7ae0c8", "#e0a07a",
    "#7a9ee0", "#c8e07a", "#e07ac8", "#7ae0a0", "#e0e07a", "#7acce0", "#c87ae0",
    "#e08a7a", "#7ae0e0", "#a0e07a", "#e07ab0", "#7ab0e0", "#d8e07a", "#9a7ae0",
    "#7ae08a", "#e0b87a", "#7a7ae0", "#e07a7a",
]

# Region names for brain.dae instances
# In brain.dae, node geometries might just be named instance_0, instance_1, etc.
# But we can try to extract names from the scene graphs or materials if available.
# We'll just call them "Region {i}" if unknown.

def main():
    dae_path = "brain.dae"
    output_dir = "models"
    
    # We will export to `output_dir`
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"[1/4] Loading COLLADA file: {dae_path}")
    
    try:
        # Load the scene using trimesh
        # force='scene' ensures we get a Scene graphic
        scene = trimesh.load(dae_path, force='scene')
    except Exception as e:
        print(f"Failed to load DAE: {e}")
        return
        
    print(f"       Loaded scene with {len(scene.geometry)} geometries.")
    
    # Optional: we can get the total bounds to center/scale it similarly
    # to what convert_nii_to_obj.py did, or we can just leave it as is if 
    # the viewer handles centering. The frontend viewer might expect the
    # model to be centered. Let's compute a scale and center.
    bounds = scene.bounds
    extents = scene.extents
    global_center = scene.centroid
    scale_factor = 100.0 / (np.max(extents) / 2.0) if np.max(extents) > 0 else 1.0

    print(f"[2/4] Normalizing scene coords (Center: {global_center.round(2)}, Extents: {extents.round(2)}, Scale factor: {scale_factor:.2f})")
    
    # ── Step 3: Extract and generate per-region OBJ ─────────────────────────
    print(f"\n[3/4] Generating per-region OBJ meshes...")
    
    regions_meta = []
    
    # Some Sketchup models export nodes instead of individual geometries,
    # so scene.dump() might be easier to get instances with applied transforms.
    meshes = scene.dump()
    
    print(f"       Total flat meshes found: {len(meshes)}")

    for i, mesh in enumerate(meshes):
        # We need to center and scale each mesh
        # mesh.vertices -= global_center
        # mesh.vertices *= scale_factor
        
        # In case the scene was already correctly transformed but we just want to match NIfTI scaling:
        mesh.apply_translation(-global_center)
        mesh.apply_scale(scale_factor)
        
        # Name
        region_name = mesh.metadata.get('name', f"Region {i+1}")
        if not region_name or region_name.lower() == 'unnamed':
            region_name = f"Region {i+1}"
            
        color = PALETTE[i % len(PALETTE)]
        filename = f"region_{i}.obj"
        filepath = os.path.join(output_dir, filename)
        
        # Export
        try:
            # We must output as OBJ format. trimesh export can do this.
            mesh.export(filepath, file_type='obj', include_normals=True)
            
            # Record metadata
            m_verts = len(mesh.vertices)
            m_faces = len(mesh.faces)
            file_size = os.path.getsize(filepath) / (1024 * 1024)
            
            regions_meta.append({
                "id": i,
                "name": region_name,
                "color": color,
                "file": filename,
                "vertices": m_verts,
                "faces": m_faces,
            })
            
            print(f"       ✓ {region_name}: {m_verts:,} verts, {m_faces:,} faces ({file_size:.2f} MB)")
            
        except Exception as e:
            print(f"       ⚠ Failed to export region {i}: {e}")

    # ── Step 4: Write regions.json ──────────────────────────────────────────
    print(f"\n[4/4] Writing regions.json...")
    meta_path = os.path.join(output_dir, "regions.json")
    with open(meta_path, 'w') as f:
        json.dump({
            "regions": regions_meta,
            "total_regions": len(regions_meta),
            "source": dae_path,
        }, f, indent=2)

    print(f"\n✅ Done! Generated {len(regions_meta)} region meshes in {output_dir}/")
    print(f"   Metadata: {meta_path}")

if __name__ == "__main__":
    main()
