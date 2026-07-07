<script lang="ts">
  import { buildUsdPrimTree, safeUsdQuery, type TreeNode, type USDStageLike } from "./usdViewModel";

  let {
    stage = null,
    tree = null,
    selectedPath = "/",
    revision = 0,
    onSelectPath = undefined,
  } = $props<{
    stage?: USDStageLike | null;
    tree?: TreeNode | null;
    selectedPath?: string;
    revision?: number;
    onSelectPath?: (path: string) => void;
  }>();

  let root = $derived(resolveTree(stage, tree, revision));

  function resolveTree(stage: USDStageLike | null, tree: TreeNode | null, revision: number) {
    void revision;
    if (tree) return tree;
    if (!stage) return null;
    return safeUsdQuery(() => buildUsdPrimTree(stage.GetPseudoRoot()), null);
  }
</script>

{#if root}
  <div class="tree-header">
    <span>Name</span>
    <span>Type</span>
  </div>
  {@render TreeView({ node: root, selectedPath })}
{:else}
  <p class="empty">No prims.</p>
{/if}

{#snippet TreeView({ node, selectedPath }: { node: TreeNode; selectedPath: string })}
  <button class:selected={node.path === selectedPath} class="tree-row" type="button" onclick={() => onSelectPath?.(node.path)}>
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

<style>
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

  .tree-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 0 4px 3px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 11px;
  }

  .tree-row:hover,
  .tree-row.selected {
    background: rgba(94, 151, 246, 0.35);
  }

  .tree-row span,
  .tree-row small,
  .tree-header span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .tree-children {
    margin-left: 12px;
    padding-left: 8px;
    border-left: 1px solid rgba(255, 255, 255, 0.12);
  }

  small,
  .empty {
    color: rgba(255, 255, 255, 0.58);
  }

  p {
    margin: 0;
  }
</style>
