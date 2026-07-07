<script lang="ts">
  import UsdHierarchy from "./UsdHierarchy.svelte";
  import { usdViewState, type UsdViewState } from "./usdViewStore.svelte";
  import { buildUsdViewModel, type AttributeRow, type LayerRow, type LayerTableRow, type RelationshipRow, type USDPcpNode, type USDSpecStackEntry } from "./usdViewModel";

  let { state = usdViewState } = $props<{ state?: UsdViewState }>();
  let model = $derived(buildUsdViewModel({
    stage: state.stage,
    selectedPath: state.selectedPath,
    revision: state.revision,
    currentTime: state.currentTime,
    selectedPropertyPath: state.selectedPropertyPath,
    selectedLayerIdentifier: state.selectedLayerIdentifier,
    selectedLayerSource: state.selectedLayerSource,
    stageMetadata: state.handle?.stageMetadata?.() ?? null,
  }));
  let lastNotice = $derived(state.notice);

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

  function propertyType(property: AttributeRow | RelationshipRow) {
    return property.kind === "attribute" ? property.typeName : "relationship";
  }

  function propertyValue(property: AttributeRow | RelationshipRow) {
    return property.kind === "attribute" ? property.value : property.targets.join(", ");
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
        <UsdHierarchy
          tree={model.tree}
          selectedPath={state.selectedPath}
          revision={state.revision}
          onSelectPath={(path) => state.selectPath(path)}
        />
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
        <h3>Property View</h3>
        {@render PropertyTable({ properties: [...model.attributes, ...model.relationships] })}
        {#if model.attributes.length === 0 && model.relationships.length === 0}
          <p class="empty">No authored or built-in properties.</p>
        {/if}
      </section>

      <section>
        <h3>Value</h3>
        {#if model.selectedProperty}
          <dl class="kv">
            <dt>Property Name</dt><dd>{model.selectedProperty.name}</dd>
            <dt>Type</dt><dd>{propertyType(model.selectedProperty)}</dd>
            <dt>Value</dt><dd>{propertyValue(model.selectedProperty) || "-"}</dd>
            {#if model.selectedProperty.kind === "attribute"}
              <dt>Resolve</dt><dd>{model.selectedProperty.resolveSource || "-"}</dd>
              <dt>Connections</dt><dd>{model.selectedProperty.connections.join(", ") || "-"}</dd>
              <dt>Samples</dt><dd>{model.selectedProperty.timeSamples.join(", ") || "-"}</dd>
            {:else}
              <dt>Targets</dt><dd>{model.selectedProperty.targets.join(", ") || "-"}</dd>
            {/if}
          </dl>
          {@render SpecStack({ stack: model.selectedPropertyStack })}
        {:else}
          <p class="empty">Select a property.</p>
        {/if}
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
        <h3>Meta Data</h3>
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

{#snippet PropertyTable({ properties }: { properties: Array<AttributeRow | RelationshipRow> })}
  <div class="property-table">
    <div class="property-table-header">
      <span>Type</span>
      <span>Property Name</span>
      <span>Value</span>
    </div>
    {#each properties as property}
      <button
        class:selected={state.selectedPropertyPath === property.path}
        class="property-row"
        type="button"
        onclick={() => selectProperty(property.path)}
      >
        <span>{propertyType(property)}</span>
        <span>{property.name}</span>
        <span>{propertyValue(property) || "-"}</span>
      </button>
    {/each}
  </div>
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

  .timeline {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 72px;
    gap: 6px;
    align-items: center;
    margin-bottom: 6px;
  }

  .timeline button,
  .timeline input,
  .layer-actions button,
  .layer-row,
  .property-row {
    color: inherit;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 3px;
    font: inherit;
  }

  .timeline button,
  .layer-actions button,
  .layer-row,
  .property-row {
    cursor: pointer;
  }

  .timeline input[type="number"] {
    width: 100%;
    min-width: 0;
    padding: 2px 4px;
  }

  .layer-row:hover,
  .layer-row.selected,
  .property-row:hover,
  .property-row.selected {
    background: rgba(94, 151, 246, 0.35);
  }

  dd,
  .arc,
  .error,
  .stack li,
  .layers li,
  .property-row span,
  .property-table-header span,
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

  .property-table,
  .layer-table {
    display: grid;
    gap: 3px;
    margin-bottom: 8px;
  }

  .property-table-header,
  .property-row {
    display: grid;
    grid-template-columns: minmax(70px, 0.75fr) minmax(110px, 1.1fr) minmax(120px, 1.4fr);
    gap: 5px;
    align-items: center;
    padding: 3px 4px;
    text-align: left;
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

  .property-table-header,
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
