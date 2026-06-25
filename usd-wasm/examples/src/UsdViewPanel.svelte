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
    selectedProperty: AttributeRow | RelationshipRow | null;
    selectedPropertyStack: USDSpecStackEntry[];
    primIndex: USDPcpNode | null;
    compositionArcs: USDCompositionArc[];
    layerStack: LayerRow[];
    usedLayers: LayerRow[];
    layerRows: LayerTableRow[];
    selectedLayer: LayerTableRow | null;
    stageTime: StageTimeInfo;
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

  type LayerTableRow = LayerRow & {
    source: "Layer Stack" | "Used Layers" | "Prim Stack" | "Property Stack";
    path?: string;
    value?: string;
    metadata?: Record<string, string>;
    offset?: string;
  };

  type StageTimeInfo = {
    startTimeCode: number;
    endTimeCode: number;
    timeCodesPerSecond: number;
    currentTime: number;
    hasRange: boolean;
    step: number;
  };

  const emptyModel: InspectorModel = {
    tree: null,
    selectedPrim: null,
    attributes: [],
    relationships: [],
    variants: [],
    primStack: [],
    selectedProperty: null,
    selectedPropertyStack: [],
    primIndex: null,
    compositionArcs: [],
    layerStack: [],
    usedLayers: [],
    layerRows: [],
    selectedLayer: null,
    stageTime: {
      startTimeCode: 0,
      endTimeCode: 0,
      timeCodesPerSecond: 24,
      currentTime: 0,
      hasRange: false,
      step: 1,
    },
    compositionErrors: [],
  };

  const state = usdViewState;
  let model = $derived(buildModel(state.stage, state.selectedPath, state.revision, state.currentTime, state.selectedPropertyPath, state.selectedLayerIdentifier, state.selectedLayerSource));
  let lastNotice = $derived(state.notice);

  function buildModel(stage: USDStageLike | null, selectedPath: string, revision: number, currentTime: number, selectedPropertyPath: string, selectedLayerIdentifier: string, selectedLayerSource: string): InspectorModel {
    void revision;
    if (!stage) return { ...emptyModel, stageTime: readStageTime(currentTime) };

    const pseudoRoot = stage.GetPseudoRoot();
    const selectedPrim = selectedPath === "/" ? pseudoRoot : stage.GetPrimAtPath(selectedPath);
    const attributes = readAttributes(selectedPrim, currentTime);
    const relationships = readRelationships(selectedPrim, currentTime);
    const selectedProperty = [...attributes, ...relationships].find((property) => property.path === selectedPropertyPath) ?? null;
    const selectedPropertyStack = selectedProperty?.stack ?? [];
    const primStack = safe(() => selectedPrim.GetPrimStackWithLayerOffsets(), []);
    const layerStack = readLayers(safe(() => stage.GetLayerStack?.(true) ?? [], []));
    const usedLayers = readLayers(safe(() => stage.GetUsedLayers?.(false) ?? [], []));
    const stageTime = readStageTime(currentTime);
    const layerRows = [
      ...layerStack.map((layer): LayerTableRow => ({ ...layer, source: "Layer Stack" })),
      ...usedLayers.map((layer): LayerTableRow => ({ ...layer, source: "Used Layers" })),
      ...primStack.map(specToLayerRow("Prim Stack")),
      ...selectedPropertyStack.map(specToLayerRow("Property Stack")),
    ];
    const selectedLayer = layerRows.find((row) =>
      row.identifier === selectedLayerIdentifier && row.source === selectedLayerSource) ?? null;

    return {
      tree: buildTreeNode(pseudoRoot),
      selectedPrim: readPrimDetails(selectedPrim),
      attributes,
      relationships,
      variants: readVariants(selectedPrim),
      primStack,
      selectedProperty,
      selectedPropertyStack,
      primIndex: safe(() => selectedPrim.GetPrimIndex().rootNode ?? null, null),
      compositionArcs: safe(() => selectedPrim.GetCompositionArcs(), []),
      layerStack,
      usedLayers,
      layerRows,
      selectedLayer,
      stageTime,
      compositionErrors: safe(() => stage.GetCompositionErrors?.() ?? [], []),
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

  function readAttributes(prim: USDPrimLike, currentTime: number): AttributeRow[] {
    if (!prim?.IsValid?.()) return [];
    return vectorToArray(prim.GetAttributes()).map((attribute: USDAttributeLike) => ({
      name: attribute.GetName(),
      path: attribute.GetPath(),
      typeName: attribute.GetTypeName(),
      value: safe(() => attribute.GetValueStringAtTime?.(currentTime) ?? attribute.GetValueString(), ""),
      resolveSource: safe(() => attribute.GetResolveInfo(currentTime).source, ""),
      timeSamples: vectorToArray(attribute.GetTimeSamples()),
      connections: vectorToArray(attribute.GetConnections()),
      metadata: attribute.GetAllMetadata(),
      stack: safe(() => attribute.GetPropertyStackWithLayerOffsets(currentTime), []),
    }));
  }

  function readRelationships(prim: USDPrimLike, currentTime: number): RelationshipRow[] {
    if (!prim?.IsValid?.()) return [];
    return vectorToArray(prim.GetRelationships()).map((relationship: USDRelationshipLike) => ({
      name: relationship.GetName(),
      path: relationship.GetPath(),
      targets: vectorToArray(relationship.GetTargets()),
      metadata: relationship.GetAllMetadata(),
      stack: safe(() => relationship.GetPropertyStackWithLayerOffsets(currentTime), []),
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

  function readStageTime(currentTime: number): StageTimeInfo {
    const metadata = state.handle?.stageMetadata?.();
    const startTimeCode = metadata?.startTimeCode ?? 0;
    const endTimeCode = metadata?.endTimeCode ?? startTimeCode;
    const timeCodesPerSecond = metadata?.timeCodesPerSecond ?? 24;
    const hasRange = endTimeCode > startTimeCode;
    return {
      startTimeCode,
      endTimeCode,
      timeCodesPerSecond,
      currentTime: Number.isFinite(currentTime) ? currentTime : startTimeCode,
      hasRange,
      step: 1,
    };
  }

  function specToLayerRow(source: LayerTableRow["source"]) {
    return (spec: USDSpecStackEntry): LayerTableRow => ({
      identifier: spec.layer.identifier,
      displayName: spec.layer.displayName,
      realPath: spec.layer.realPath,
      source,
      path: spec.path,
      value: spec.typeName || spec.specifier || "",
      metadata: spec.metadata,
      offset: formatLayerOffset(spec.layerOffset),
    });
  }

  function formatLayerOffset(offset: USDSpecStackEntry["layerOffset"]) {
    if (!offset || offset.isIdentity) return "";
    return `${offset.offset}, scale ${offset.scale}`;
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

  function selectProperty(path: string) {
    state.selectProperty(path);
  }

  function selectLayer(row: LayerTableRow) {
    state.selectLayer(row.identifier, row.source);
  }

  async function setTimelineValue(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    state.setPlaying(false);
    await state.setTime(Number(input.value));
  }

  function togglePlayback() {
    state.setPlaying(!state.isPlaying);
  }

  async function copyText(text: string) {
    if (!text) return;
    await navigator.clipboard?.writeText(text);
  }
</script>

<aside class="usdview-panel" data-testid="usdview-panel">
  <header>
    <h2>Usdview</h2>
    <span>{state.stage ? `rev ${state.revision}` : "no stage"}</span>
  </header>

  {#if !state.stage}
    <p class="empty">Load a USD stage.</p>
  {:else}
    <div class="panel-grid">
      <section class="hierarchy">
        <h3>Prim Browser</h3>
        {@render TreeView({ node: model.tree, selectedPath: state.selectedPath })}
      </section>

      <section>
        <h3>Timeline</h3>
        <div class="timeline">
          <button type="button" onclick={togglePlayback} data-testid="usdview-timeline-play">
            {state.isPlaying ? "Pause" : "Play"}
          </button>
          <input
            data-testid="usdview-timeline-slider"
            type="range"
            min={model.stageTime.startTimeCode}
            max={model.stageTime.endTimeCode}
            step={model.stageTime.step}
            value={model.stageTime.currentTime}
            disabled={!model.stageTime.hasRange}
            oninput={setTimelineValue}
          />
          <input
            data-testid="usdview-timeline-frame"
            type="number"
            min={model.stageTime.startTimeCode}
            max={model.stageTime.endTimeCode}
            step={model.stageTime.step}
            value={Number(model.stageTime.currentTime.toFixed(3))}
            disabled={!model.stageTime.hasRange}
            onchange={setTimelineValue}
          />
        </div>
        <dl class="kv">
          <dt>Range</dt><dd>{model.stageTime.startTimeCode} - {model.stageTime.endTimeCode}</dd>
          <dt>FPS</dt><dd>{model.stageTime.timeCodesPerSecond}</dd>
        </dl>
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
            <button
              class:selected={state.selectedPropertyPath === attribute.path}
              class="select-property"
              type="button"
              onclick={() => selectProperty(attribute.path)}
            >
              {attribute.path}
            </button>
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
            <button
              class:selected={state.selectedPropertyPath === relationship.path}
              class="select-property"
              type="button"
              onclick={() => selectProperty(relationship.path)}
            >
              {relationship.path}
            </button>
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
        {@render LayerTable({ rows: model.layerRows })}
        {#if model.selectedLayer}
          <h4>Layer Details</h4>
          <dl class="kv">
            <dt>Layer</dt><dd>{model.selectedLayer.displayName}</dd>
            <dt>Source</dt><dd>{model.selectedLayer.source}</dd>
            <dt>Identifier</dt><dd>{model.selectedLayer.identifier}</dd>
            <dt>Path</dt><dd>{model.selectedLayer.realPath || "-"}</dd>
            <dt>Spec Path</dt><dd>{model.selectedLayer.path || "-"}</dd>
            <dt>Offset</dt><dd>{model.selectedLayer.offset || "-"}</dd>
          </dl>
          <div class="layer-actions">
            <button type="button" onclick={() => copyText(model.selectedLayer?.identifier ?? "")}>Copy Identifier</button>
            <button type="button" onclick={() => copyText(model.selectedLayer?.realPath ?? "")}>Copy Path</button>
            <button type="button" onclick={() => copyText(model.selectedLayer?.path ?? "")}>Copy Spec</button>
          </div>
          {#if model.selectedLayer.metadata && metadataEntries(model.selectedLayer.metadata).length}
            <h4>Layer Opinion Metadata</h4>
            {#each metadataEntries(model.selectedLayer.metadata) as [key, value]}
              <dl class="kv"><dt>{key}</dt><dd>{value}</dd></dl>
            {/each}
          {/if}
        {/if}
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

{#snippet LayerTable({ rows }: { rows: LayerTableRow[] })}
  {#if rows.length === 0}
    <p class="empty">No layers.</p>
  {:else}
    <div class="layer-table">
      <div class="layer-table-header">
        <span>Layer</span>
        <span>Source</span>
        <span>Offset</span>
        <span>Path</span>
        <span>Value</span>
      </div>
      {#each rows as row}
        <button
          class:selected={state.selectedLayerIdentifier === row.identifier && state.selectedLayerSource === row.source}
          class="layer-row"
          data-testid="usdview-layer-row"
          type="button"
          onclick={() => selectLayer(row)}
        >
          <span>{row.displayName}</span>
          <span>{row.source}</span>
          <span>{row.offset || "-"}</span>
          <span>{row.path || row.realPath || row.identifier}</span>
          <span>{row.value || "-"}</span>
        </button>
      {/each}
    </div>
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

  .timeline {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 72px;
    gap: 6px;
    align-items: center;
    margin-bottom: 6px;
  }

  .timeline button,
  .timeline input,
  .select-property,
  .layer-actions button,
  .layer-row {
    color: inherit;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 3px;
    font: inherit;
  }

  .timeline button,
  .select-property,
  .layer-actions button,
  .layer-row {
    cursor: pointer;
  }

  .timeline input[type="number"] {
    width: 100%;
    min-width: 0;
    padding: 2px 4px;
  }

  .tree-row:hover,
  .tree-row.selected,
  .select-property:hover,
  .select-property.selected,
  .layer-row:hover,
  .layer-row.selected {
    background: rgba(94, 151, 246, 0.35);
  }

  .tree-row span,
  .tree-row small,
  dd,
  .arc,
  .error,
  .stack li,
  .layers li,
  .layer-row span,
  .layer-table-header span {
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

  .select-property {
    width: 100%;
    margin: 5px 0;
    padding: 3px 5px;
    text-align: left;
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

  .layer-table {
    display: grid;
    gap: 3px;
    margin-bottom: 8px;
  }

  .layer-table-header,
  .layer-row {
    display: grid;
    grid-template-columns: minmax(72px, 1.1fr) minmax(68px, 0.8fr) minmax(38px, 0.45fr) minmax(86px, 1.35fr) minmax(42px, 0.45fr);
    gap: 5px;
    align-items: center;
    padding: 3px 4px;
    text-align: left;
  }

  .layer-table-header {
    color: rgba(255, 255, 255, 0.58);
    font-size: 11px;
  }

  .layer-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 4px;
  }

  .layer-actions button,
  .timeline button {
    padding: 3px 6px;
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
