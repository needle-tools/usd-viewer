#!/usr/bin/env python3
"""
bake_instances.py  –  pre-process USD files that use scene-graph instancing.

USD files exported from Isaac Sim / Omniverse mark rigid-body links as
  instanceable = true
  add references = </Flattened_Prototype_N>
The geometry lives in prototype prims at the root level; the viewer's Hydra
web delegate does not propagate per-instance world transforms, so all prototype
meshes render at the origin.

This script bakes every prototype mesh's vertex positions into world space and
writes a new file with the suffix _baked.usda that any USD viewer can load.

Usage:
    python tools/bake_instances.py <input.usd[a|c|z]> [output.usda]

Requirements:
    pip install usd-core
"""

import sys
import os
from pxr import Usd, UsdGeom, Sdf, Gf, Vt


def get_proto_prim(instance_prim, stage):
    """Return the prototype prim referenced by an instanceable prim, or None."""
    for spec in instance_prim.GetPrimStack():
        for ref in spec.referenceList.GetAddedOrExplicitItems():
            pp = str(ref.primPath)
            for root_child in stage.GetPseudoRoot().GetAllChildren():
                if str(root_child.GetPath()) == pp:
                    return root_child
    return None


def has_scene_graph_instances(stage):
    """Return True if the stage contains any instanceable prims."""
    for prim in stage.TraverseAll():
        if prim.IsInstance():
            return True
    return False


def copy_attrs_no_xform(src_prim, dst_prim):
    for attr in src_prim.GetAttributes():
        name = attr.GetName()
        if name.startswith("xformOp") or name == "xformOpOrder":
            continue
        val = attr.Get()
        if val is None:
            continue
        try:
            dst_prim.CreateAttribute(name, attr.GetTypeName(), attr.IsCustom()).Set(val)
        except Exception:
            pass


def copy_rels(src_prim, dst_prim, old_prefix, new_prefix):
    for rel in src_prim.GetRelationships():
        targets = rel.GetTargets()
        if not targets:
            continue
        try:
            dst_rel = dst_prim.CreateRelationship(rel.GetName(), rel.IsCustom())
            dst_rel.SetTargets([
                Sdf.Path(new_prefix + str(t)[len(old_prefix):]
                         if str(t).startswith(old_prefix) else str(t))
                for t in targets
            ])
        except Exception:
            pass


def bake_points(points, matrix):
    """Transform each point into world space using matrix.Transform()."""
    return Vt.Vec3fArray([
        Gf.Vec3f(*matrix.Transform(Gf.Vec3d(p[0], p[1], p[2])))
        for p in points
    ])


def bake_normals(normals, matrix):
    """Transform normals by the inverse-transpose of matrix."""
    inv_t = matrix.GetInverse().GetTranspose()
    out = []
    for n in normals:
        v = inv_t.TransformDir(Gf.Vec3d(n[0], n[1], n[2]))
        length = (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5
        if length > 1e-8:
            v = Gf.Vec3d(v[0] / length, v[1] / length, v[2] / length)
        out.append(Gf.Vec3f(v[0], v[1], v[2]))
    return Vt.Vec3fArray(out)


def copy_geometry_baked(proto_prim, instance_world, dst_parent_path, dst_stage,
                        old_prefix, new_prefix, xfc):
    """
    Recursively copy prototype geometry under dst_parent_path, baking vertex
    positions into world space so no transform needs to be applied at render time.
    """
    for child in proto_prim.GetAllChildren():
        dst_path = dst_parent_path.AppendChild(child.GetName())
        tn = child.GetTypeName()

        child_local, _ = xfc.GetLocalTransformation(child)
        child_world = child_local * instance_world

        if tn == "Mesh":
            dst_prim = dst_stage.DefinePrim(dst_path, "Mesh")
            copy_attrs_no_xform(child, dst_prim)
            copy_rels(child, dst_prim, old_prefix, new_prefix)

            pts = child.GetAttribute("points").Get()
            if pts is not None:
                dst_prim.GetAttribute("points").Set(bake_points(pts, child_world))

            norms_attr = child.GetAttribute("normals")
            if norms_attr:
                norms = norms_attr.Get()
                if norms is not None:
                    dst_prim.GetAttribute("normals").Set(
                        bake_normals(norms, child_world))

        else:
            dst_prim = (dst_stage.DefinePrim(dst_path, tn)
                        if tn else dst_stage.DefinePrim(dst_path))
            copy_attrs_no_xform(child, dst_prim)
            copy_rels(child, dst_prim, old_prefix, new_prefix)
            copy_geometry_baked(child, child_world, dst_path, dst_stage,
                                old_prefix, new_prefix, xfc)


def bake(input_path, output_path):
    src = Usd.Stage.Open(input_path)
    if not has_scene_graph_instances(src):
        print(f"No scene-graph instances found in {input_path} – no baking needed.")
        return False

    print(f"Scene-graph instances detected. Baking to {output_path} …")

    if os.path.exists(output_path):
        os.remove(output_path)

    dst = Usd.Stage.CreateNew(output_path)
    UsdGeom.SetStageUpAxis(dst, UsdGeom.GetStageUpAxis(src))
    xfc = UsdGeom.XformCache()

    UsdGeom.Xform.Define(dst, "/spot")

    spot_src = src.GetPrimAtPath("/spot")
    if not spot_src or not spot_src.IsValid():
        # Fall back: process the whole stage root
        spot_src = src.GetPseudoRoot()

    for body_prim in spot_src.GetChildren():
        body_name = body_prim.GetName()
        UsdGeom.Xform.Define(dst, f"/spot/{body_name}")

        for child in body_prim.GetChildren():
            if not child.IsInstance():
                continue

            child_name = child.GetName()
            dst_child_path = Sdf.Path(f"/spot/{body_name}/{child_name}")
            UsdGeom.Xform.Define(dst, dst_child_path)

            proto = get_proto_prim(child, src)
            if not proto:
                print(f"  WARNING: no prototype found for {child.GetPath()}")
                continue

            instance_world = xfc.GetLocalToWorldTransform(child)
            old_prefix = str(proto.GetPath())
            new_prefix = str(dst_child_path)
            copy_geometry_baked(proto, instance_world, dst_child_path, dst,
                                old_prefix, new_prefix, xfc)

    dst.GetRootLayer().Save()
    print(f"Done → {output_path}")
    return True


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    input_path = sys.argv[1]
    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        sys.exit(1)

    if len(sys.argv) >= 3:
        output_path = sys.argv[2]
    else:
        base = os.path.splitext(input_path)[0]
        output_path = base + "_baked.usda"

    bake(input_path, output_path)


if __name__ == "__main__":
    main()
