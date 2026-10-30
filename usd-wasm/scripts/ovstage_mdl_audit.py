"""Read-only OVStage 0.2.1 material audit; no renderer or scene mutations.

Call audit_mdl_stage(stage) after population and advance_write_floor().
This records runtime graph data, not proof of the renderer's chosen terminal.

API references (NVIDIA primary sources, release-pinned):
https://github.com/NVIDIA-Omniverse/ovrtx/blob/v0.5.1/tests/docs/python/test_stage_query.py
https://github.com/NVIDIA-Omniverse/ovstage/blob/v0.2.1/examples/python/queries/main.py
https://github.com/NVIDIA-Omniverse/ovstage/blob/v0.2.1/python/ovstage/_src/types.py
https://github.com/NVIDIA-Omniverse/ovstage/blob/v0.2.1/python/ovstage/_src/bindings.py
"""


DEFAULT_ATTRIBUTES = (
    "usd-prim-type", "usd-path", "material:binding", "material:binding:full",
    "material:binding:preview", "outputs:mdl:surface.connect",
    "outputs:surface.connect", "outputs:mtlx:surface.connect",
    "info:implementationSource", "info:mdl:sourceAsset",
    "info:mdl:sourceAsset:subIdentifier", "info:id",
    "inputs:base_color_factor", "inputs:base_alpha", "inputs:metallic_factor",
    "inputs:roughness_factor", "inputs:diffuse_color_constant",
    "inputs:reflection_roughness_constant", "inputs:metallic_constant",
    "inputs:base_color_texture.connect", "inputs:normal_texture.connect",
    "inputs:metallic_roughness_texture.connect", "inputs:texture",
    "inputs:diffuse_texture", "inputs:reflectionroughness_texture",
)


def _decode_values(values, semantic, paths):
    """Decode the public semantic ABI, preserving all array elements."""
    flat = values.reshape(-1)
    token = lambda value: paths.token_to_string(int(value)) if int(value) else None
    path = lambda value: paths.path_to_string(int(value)) if int(value) else None
    if semantic == 13:  # STRING: ragged UTF-8 bytes, not interned tokens.
        return bytes(flat.astype("uint8").tolist()).decode("utf-8", errors="replace")
    if semantic == 1:  # ASSET_PATH_ID: authored token, resolved token.
        return [{"authored": token(a), "resolved": token(b)}
                for a, b in flat.reshape(-1, 2)]
    if semantic == 12:  # CONNECTION_PATH_ID: prim path, property token.
        return [{"primPath": path(a), "property": token(b)}
                for a, b in flat.reshape(-1, 2)]
    if semantic == 4:  # RELATIONSHIP_PATH_ID
        return [path(value) for value in flat]
    if semantic in (2, 3):  # TOKEN_ID / PATH_EXPRESSION_STRING
        return [token(value) for value in flat]
    return flat.tolist()


def audit_mdl_stage(stage, *, end_ordinal=(1 << 64) - 1, extra_attributes=()):
    """Return JSON-serializable runtime rows and direct MDL binding chains.

    Missing columns remain absent. Failures are recorded explicitly, never
    treated as evidence that a graph or binding is missing. Direct bindings
    do not resolve USD collection/inheritance precedence. Renderer selection
    must be established separately (e.g. an MDL-only input A/B render).
    """
    import ovstage

    names = tuple(dict.fromkeys(DEFAULT_ATTRIBUTES + tuple(extra_attributes)))
    result = {"schema": 1, "evidenceKind": "loaded-runtime-material-graph",
              "rendererSelectionProven": False, "endOrdinal": end_ordinal,
              "rows": [], "directMdlBindingChains": [], "errors": []}
    rows = {}
    with ovstage.PathDictionary(stage) as paths:
        tokens = [paths.intern_token(name) for name in names]
        selected = ovstage.Filter([ovstage.Predicate(
            "usd-prim-type", ovstage.FilterOp.IN,
            ["Mesh", "GeomSubset", "Xform", "Scope", "Material", "Shader", "NodeGraph"])])
        with stage.query(filter=selected, attrs=tokens) as query:
            query.wait()
            summary = query.result()
            result["matchedPrimCount"] = summary.total_prim_count
            result["reportedAttributes"] = [paths.token_to_string(t) for t in summary.attributes]
            # Separate reads ensure one unsupported column cannot hide others.
            for name, token_id in zip(names, tokens):
                try:
                    with stage.read_attributes(query, [token_id],
                            ovstage.OrdinalRange.latest(end_ordinal)) as read:
                        read.wait()
                        for group in read.groups():
                            with group:
                                if group.is_delete:
                                    continue
                                prim_paths = paths.get_path_strings(group.prim_list)
                                semantic = int(group.raw.semantic)
                                for local in range(group.prim_count):
                                    prim_path = prim_paths[group.prim_index(local)]
                                    row_index = group.data_row_index(local)
                                    if group.is_array:
                                        values = group.array(row_index).copy()
                                    else:
                                        tensor = group.tensor(0)
                                        lanes = int(tensor.dtype.lanes)
                                        values = group.array(0).reshape(-1, lanes)[row_index].copy()
                                    value = _decode_values(values, semantic, paths)
                                    row = rows.setdefault(prim_path, {"path": prim_path, "attributes": {}})
                                    row["attributes"][name] = {"semantic": semantic,
                                        "isArray": bool(group.is_array), "value": value}
                except Exception as error:
                    result["errors"].append({"attribute": name,
                        "error": f"{type(error).__name__}: {error}"})
    result["rows"] = [rows[path] for path in sorted(rows)]
    for row in result["rows"]:
        attrs = row["attributes"]
        for binding in ("material:binding", "material:binding:full", "material:binding:preview"):
            for material_path in attrs.get(binding, {}).get("value", []):
                material = rows.get(material_path, {}).get("attributes", {})
                for connection in material.get("outputs:mdl:surface.connect", {}).get("value", []):
                    if not isinstance(connection, dict):
                        continue
                    shader_path = connection.get("primPath")
                    shader = rows.get(shader_path, {}).get("attributes", {})
                    result["directMdlBindingChains"].append({
                        "boundPrim": row["path"], "bindingProperty": binding,
                        "materialPath": material_path, "shaderPath": shader_path,
                        "shaderOutput": connection.get("property"),
                        "sourceAsset": shader.get("info:mdl:sourceAsset", {}).get("value"),
                        "subIdentifier": shader.get("info:mdl:sourceAsset:subIdentifier", {}).get("value"),
                    })
    return result
