<script lang="ts">
  import { usdViewState, type USDAttributeLike, type USDCompositionArc, type USDLayerInfo, type USDPrimLike, type USDPcpNode, type USDRelationshipLike, type USDStageLike, type USDVectorLike, type USDSpecStackEntry } from "./usdViewStore.svelte";

  type TreeNode = {
    name: string;
    path: string;
    typeName: string;
    children: TreeNode[];
  };

  type AttributeRow = {
    name: string;
    path: string;
    typeName: string;
    value: string;
    resolveSource: string;
    timeSamples: number[];
    connections: string[];
    metadata: Record<string, string>;
    stack: USDSpecStackEntry[];
  };

  type RelationshipRow = {
    name: string;
    path: string;
    targets: string[];
    metadata: Record<string, string>;
    stack: USDSpecStackEntry[];
  };

  type VariantRow = {
    setName: string;
    selection: string;
    names: string[];
  };

  type InspectorModel = {
    tree: TreeNode | null;
    selectedPrim: PrimDetails | null;
    attributes: AttributeRow[];
    relationships: RelationshipRow[];
    variants: VariantRow[];
    primStack: USDSpecStackEntry[];
    primIndex: USDPcpNode | null;
    compositionArcs: USDCompositionArc[];
    layerStack: LayerRow[];
    usedLayers: LayerRow[];
    compositionErrors: string[];
  };

  type PrimDetails = {
    path: string;
    name: string;
    displayName: string;
    typeName: string;
    specifier: string;
    isActive: boolean;
    isDefined: boolean;
    isAbstract: boolean;
    isInstance: boolean;
    isInPrototype: boolean;
    isPrototype: boolean;
    isLoaded: boolean;
    hasPayloads: boolean;
    hasReferences: boolean;
    hasInherits: boolean;
    hasSpecializes: boolean;
    hasInstanceable: boolean;
    metadata: Record<string, string>;
  };

  type LayerRow = {
    identifier: string;
    displayName: string;
    realPath: string;
  };

  const emptyModel: InspectorModel = {
    tree: null,
    selectedPrim: null,
    attributes: [],
    relationships: [],
    variants: [],
    primStack: [],
    primIndex: null,
    compositionArcs: [],
    layerStack: [],
    usedLayers: [],
    compositionErrors: [],
  };

  const state = usdViewState;
  let model = $derived(buildModel(state.stage, state.selectedPath, state.revision));
  let lastNotice = $derived(state.notice);

  function buildModel(stage: USDStageLike | null, selectedPath: string, revision: number): InspectorModel {
    void revision;
    if (!stage) return emptyModel;

    const pseudoRoot = stage.GetPseudoRoot();
    const selectedPrim = selectedPath === "/" ? pseudoRoot : stage.GetPrimAtPath(selectedPath);
    return {
      tree: buildTreeNode(pseudoRoot),
      selectedPrim: readPrimDetails(selectedPrim),
      attributes: readAttributes(selectedPrim),
      relationships: readRelationships(selectedPrim),
      variants: readVariants(selectedPrim),
      primStack: safe(() => selectedPrim.GetPrimStackWithLayerOffsets(), []),
      primIndex: safe(() => selectedPrim.GetPrimIndex().rootNode ?? null, null),
      compositionArcs: safe(() => selectedPrim.GetCompositionArcs(), []),
      layerStack: readLayers(stage.GetLayerStack(true)),
      usedLayers: readLayers(stage.GetUsedLayers(false)),
      compositionErrors: safe(() => stage.GetCompositionErrors(), []),
    };
  }

  function buildTreeNode(prim: USDPrimLike): TreeNode {
    return {
      name: prim.GetPath() === "/" ? "PseudoRoot" : prim.GetName(),
      path: prim.GetPath(),
      typeName: prim.GetTypeName(),
      children: vectorToArray(prim.GetChildren()).map(buildTreeNode),
    };
  }

  function readPrimDetails(prim: USDPrimLike): PrimDetails | null {
    if (!prim?.IsValid?.()) return null;
    return {
      path: prim.GetPath(),
      name: prim.GetName(),
      displayName: prim.GetDisplayName(),
      typeName: prim.GetTypeName(),
      specifier: prim.GetSpecifier(),
      isActive: prim.IsActive(),
      isDefined: prim.IsDefined(),
      isAbstract: prim.IsAbstract(),
      isInstance: prim.IsInstance(),
      isInPrototype: prim.IsInPrototype(),
      isPrototype: prim.IsPrototype(),
      isLoaded: prim.IsLoaded(),
      hasPayloads: prim.HasAuthoredPayloads(),
      hasReferences: prim.HasAuthoredReferences(),
      hasInherits: prim.HasAuthoredInherits(),
      hasSpecializes: prim.HasAuthoredSpecializes(),
      hasInstanceable: prim.HasAuthoredInstanceable(),
      metadata: prim.GetAllMetadata(),
    };
  }

  function readAttributes(prim: USDPrimLike): AttributeRow[] {
    if (!prim?.IsValid?.()) return [];
    return vectorToArray(prim.GetAttributes()).map((attribute: USDAttributeLike) => ({
      name: attribute.GetName(),
      path: attribute.GetPath(),
      typeName: attribute.GetTypeName(),
      value: safe(() => attribute.GetValueString(), ""),
      resolveSource: safe(() => attribute.GetResolveInfo(Number.NaN).source, ""),
      timeSamples: vectorToArray(attribute.GetTimeSamples()),
      connections: vectorToArray(attribute.GetConnections()),
      metadata: attribute.GetAllMetadata(),
      stack: safe(() => attribute.GetPropertyStackWithLayerOffsets(Number.NaN), []),
    }));
  }

  function readRelationships(prim: USDPrimLike): RelationshipRow[] {
    if (!prim?.IsValid?.()) return [];
    return vectorToArray(prim.GetRelationships()).map((relationship: USDRelationshipLike) => ({
      name: relationship.GetName(),
      path: relationship.GetPath(),
      targets: vectorToArray(relationship.GetTargets()),
      metadata: relationship.GetAllMetadata(),
      stack: safe(() => relationship.GetPropertyStackWithLayerOffsets(Number.NaN), []),
    }));
  }

  function readVariants(prim: USDPrimLike): VariantRow[] {
    if (!prim?.IsValid?.()) return [];
    return vectorToArray(prim.GetVariantSetNames()).map((setName: string) => ({
      setName,
      selection: prim.GetVariantSelection(setName),
      names: vectorToArray(prim.GetVariantNames(setName)),
    }));
  }

  function readLayers(layers: USDLayerInfo[]): LayerRow[] {
    return layers.map((layer) => ({
      identifier: layer.identifier,
      displayName: layer.displayName,
      realPath: layer.realPath,
    }));
  }

  function vectorToArray<T>(vector: USDVectorLike<T> | null | undefined): T[] {
    if (!vector) return [];
    const values: T[] = [];
    try {
      for (let i = 0; i < vector.size(); i++) {
        values.push(vector.get(i));
      }
    } finally {
      vector.delete();
    }
    return values;
  }

  function safe<T>(callback: () => T, fallback: T): T {
    try {
      return callback();
    } catch (error) {
      console.warn("USD inspector query failed", error);
      return fallback;
    }
  }

  function metadataEntries(metadata: Record<string, string>) {
    return Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b));
  }

  function changedFieldEntries(fields: Record<string, string[]>) {
    return Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  }
</script>

<aside class="usdview-panel" data-testid="usdview-panel">
  <header>
    <h2>Usdview</h2>
    <span>{state.stage ? `rev ${state.revision}` : "no stage"}</span>
  </header>

  {#if !state.stage || !model.tree}
    <p class="empty">Load a USD stage.</p>
  {:else}
    <div class="panel-grid">
      <section class="hierarchy">
        <h3>Prim Browser</h3>
        {@render TreeView({ node: model.tree, selectedPath: state.selectedPath })}
      </section>

      <section>
        <h3>Prim</h3>
        {#if model.selectedPrim}
          <dl class="kv">
            <dt>Path</dt><dd>{model.selectedPrim.path}</dd>
            <dt>Type</dt><dd>{model.selectedPrim.typeName || "typeless"}</dd>
            <dt>Specifier</dt><dd>{model.selectedPrim.specifier}</dd>
            <dt>Display Name</dt><dd>{model.selectedPrim.displayName || model.selectedPrim.name}</dd>
          </dl>
          <div class="chips">
            {#each ([
              ["active", model.selectedPrim.isActive],
              ["defined", model.selectedPrim.isDefined],
              ["abstract", model.selectedPrim.isAbstract],
              ["instance", model.selectedPrim.isInstance],
              ["prototype", model.selectedPrim.isPrototype],
              ["in prototype", model.selectedPrim.isInPrototype],
              ["loaded", model.selectedPrim.isLoaded],
              ["payloads", model.selectedPrim.hasPayloads],
              ["references", model.selectedPrim.hasReferences],
              ["inherits", model.selectedPrim.hasInherits],
              ["specializes", model.selectedPrim.hasSpecializes],
              ["instanceable", model.selectedPrim.hasInstanceable],
            ] as [string, boolean][]) as chip}
              <span class:off={!chip[1]}>{chip[0]}</span>
            {/each}
          </div>
        {/if}
      </section>

      <section>
        <h3>Properties</h3>
        {#if model.attributes.length === 0 && model.relationships.length === 0}
          <p class="empty">No authored or built-in properties.</p>
        {/if}
        {#each model.attributes as attribute}
          <details class="property">
            <summary>{attribute.name} <small>{attribute.typeName}</small></summary>
            <dl class="kv">
              <dt>Value</dt><dd>{attribute.value}</dd>
              <dt>Resolve</dt><dd>{attribute.resolveSource}</dd>
              <dt>Connections</dt><dd>{attribute.connections.join(", ") || "-"}</dd>
              <dt>Samples</dt><dd>{attribute.timeSamples.join(", ") || "-"}</dd>
            </dl>
            {@render SpecStack({ stack: attribute.stack })}
          </details>
        {/each}
        {#each model.relationships as relationship}
          <details class="property">
            <summary>{relationship.name} <small>relationship</small></summary>
            <dl class="kv">
              <dt>Targets</dt><dd>{relationship.targets.join(", ") || "-"}</dd>
            </dl>
            {@render SpecStack({ stack: relationship.stack })}
          </details>
        {/each}
      </section>

      <section>
        <h3>Variants</h3>
        {#if model.variants.length === 0}
          <p class="empty">No variant sets.</p>
        {:else}
          {#each model.variants as variant}
            <dl class="kv">
              <dt>{variant.setName}</dt>
              <dd>{variant.selection || "(none)"} of {variant.names.join(", ")}</dd>
            </dl>
          {/each}
        {/if}
      </section>

      <section>
        <h3>Composition</h3>
        {@render SpecStack({ stack: model.primStack })}
        {#if model.compositionArcs.length}
          <h4>Arcs</h4>
          {#each model.compositionArcs as arc}
            <p class="arc">{arc.arcType}: {arc.targetPrimPath} <small>{arc.targetLayer.displayName}</small></p>
          {/each}
        {/if}
        {#if model.primIndex}
          <h4>Prim Index</h4>
          {@render PcpNodeView({ node: model.primIndex })}
        {/if}
        {#if model.compositionErrors.length}
          <h4>Errors</h4>
          {#each model.compositionErrors as error}
            <p class="error">{error}</p>
          {/each}
        {/if}
      </section>

      <section>
        <h3>Layer Stack</h3>
        {@render LayerList({ layers: model.layerStack })}
        <h3>Used Layers</h3>
        {@render LayerList({ layers: model.usedLayers })}
      </section>

      <section>
        <h3>Metadata</h3>
        {#if model.selectedPrim && metadataEntries(model.selectedPrim.metadata).length}
          {#each metadataEntries(model.selectedPrim.metadata) as [key, value]}
            <dl class="kv"><dt>{key}</dt><dd>{value}</dd></dl>
          {/each}
        {:else}
          <p class="empty">No metadata.</p>
        {/if}
      </section>

      <section>
        <h3>Objects Changed</h3>
        {#if lastNotice}
          <dl class="kv">
            <dt>Resynced</dt><dd>{lastNotice.resyncedPaths.join(", ") || "-"}</dd>
            <dt>Info Only</dt><dd>{lastNotice.changedInfoOnlyPaths.join(", ") || "-"}</dd>
            <dt>Assets</dt><dd>{lastNotice.resolvedAssetPathsResyncedPaths.join(", ") || "-"}</dd>
          </dl>
          {#each changedFieldEntries(lastNotice.changedFields) as [path, fields]}
            <p class="arc">{path}: {fields.join(", ")}</p>
          {/each}
        {:else}
          <p class="empty">No notices yet.</p>
        {/if}
      </section>
    </div>
  {/if}
</aside>

{#snippet TreeView({ node, selectedPath }: { node: TreeNode; selectedPath: string })}
  <button class:selected={node.path === selectedPath} class="tree-row" type="button" onclick={() => state.selectPath(node.path)}>
    <span>{node.name}</span>
    <small>{node.typeName}</small>
  </button>
  {#if node.children.length}
    <div class="tree-children">
      {#each node.children as child}
        {@render TreeView({ node: child, selectedPath })}
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet SpecStack({ stack }: { stack: USDSpecStackEntry[] })}
  {#if stack.length === 0}
    <p class="empty">No spec stack.</p>
  {:else}
    <ol class="stack">
      {#each stack as spec}
        <li>
          <strong>{spec.path}</strong>
          <small>{spec.layer.displayName}</small>
          {#if spec.layerOffset && !spec.layerOffset.isIdentity}
            <small>offset {spec.layerOffset.offset}, scale {spec.layerOffset.scale}</small>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
{/snippet}

{#snippet LayerList({ layers }: { layers: LayerRow[] })}
  {#if layers.length === 0}
    <p class="empty">No layers.</p>
  {:else}
    <ol class="layers">
      {#each layers as layer}
        <li>
          <strong>{layer.displayName}</strong>
          <small>{layer.realPath || layer.identifier}</small>
        </li>
      {/each}
    </ol>
  {/if}
{/snippet}

{#snippet PcpNodeView({ node }: { node: USDPcpNode })}
  <div class="pcp-node">
    <span>{node.arcType || "Root"}</span>
    <small>{node.path || ""}</small>
    {#if node.children?.length}
      <div class="tree-children">
        {#each node.children as child}
          {@render PcpNodeView({ node: child })}
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<style>
  .usdview-panel {
    position: absolute;
    top: 0;
    right: 0;
    z-index: 1000;
    width: min(460px, calc(100vw - 24px));
    max-height: calc(100vh - 20px);
    margin: 10px;
    overflow: auto;
    color: rgb(234, 236, 238);
    background: rgba(20, 22, 24, 0.86);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 6px;
    font: 12px/1.35 system-ui, sans-serif;
  }

  header {
    position: sticky;
    top: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    background: rgba(20, 22, 24, 0.94);
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }

  h2,
  h3,
  h4,
  p,
  ol,
  dl {
    margin: 0;
  }

  h2 {
    font-size: 13px;
  }

  h3 {
    margin-bottom: 6px;
    font-size: 12px;
    color: rgb(255, 255, 255);
  }

  h4 {
    margin: 8px 0 4px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.78);
  }

  .panel-grid {
    display: grid;
    gap: 8px;
    padding: 8px;
  }

  section {
    min-width: 0;
    padding: 8px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 4px;
  }

  .hierarchy {
    max-height: 260px;
    overflow: auto;
  }

  .tree-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin: 1px 0;
    padding: 3px 4px;
    color: inherit;
    text-align: left;
    background: transparent;
    border: 0;
    border-radius: 3px;
    font: inherit;
    cursor: pointer;
  }

  .tree-row:hover,
  .tree-row.selected {
    background: rgba(94, 151, 246, 0.35);
  }

  .tree-row span,
  .tree-row small,
  dd,
  .arc,
  .error,
  .stack li,
  .layers li {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tree-children {
    margin-left: 12px;
    padding-left: 8px;
    border-left: 1px solid rgba(255, 255, 255, 0.12);
  }

  .kv {
    display: grid;
    grid-template-columns: minmax(88px, 0.34fr) minmax(0, 1fr);
    gap: 3px 8px;
    margin-bottom: 5px;
  }

  dt {
    color: rgba(255, 255, 255, 0.56);
  }

  dd {
    color: rgba(255, 255, 255, 0.9);
  }

  small,
  header span,
  .empty {
    color: rgba(255, 255, 255, 0.58);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chips span {
    padding: 2px 5px;
    background: rgba(106, 161, 255, 0.28);
    border-radius: 3px;
  }

  .chips span.off {
    color: rgba(255, 255, 255, 0.42);
    background: rgba(255, 255, 255, 0.07);
  }

  .property {
    margin-top: 4px;
    padding: 5px;
    background: rgba(0, 0, 0, 0.18);
    border-radius: 3px;
  }

  summary {
    cursor: pointer;
  }

  .stack,
  .layers {
    display: grid;
    gap: 4px;
    padding-left: 18px;
  }

  .stack li,
  .layers li {
    display: grid;
    gap: 1px;
  }

  .arc,
  .error,
  .pcp-node {
    margin-top: 4px;
  }

  .error {
    color: rgb(255, 184, 184);
  }
</style>
