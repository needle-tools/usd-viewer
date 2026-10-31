// Keep source inspection and authoring out of the viewing module graph.
export function mountLazyCodePane(container, {isVisible = () => true, load = () => import('./viewer-code.js'), ...options} = {}) {
  let pane, loading, binding = null, disposed = false, selection;
  async function ensure() {
    if (disposed || !isVisible()) return;
    try {
      const {mountCodePane} = await (loading ||= load());
      // Visibility and binding can both change while the module is in flight.
      if (disposed || !isVisible() || pane) return;
      pane = mountCodePane(container, {...options, isVisible});
      pane.show(binding?.isCurrent && !binding.isCurrent() ? null : binding);
      if (selection !== undefined) pane.select(selection);
      pane.refreshVisibility();
    } catch (error) {
      loading = null;
      if (!disposed) console.warn('Code pane could not load', error);
    }
  }
  return {
    show(next) {
      if (disposed) return;
      binding = next; selection = undefined;
      if (pane) pane.show(next); else void ensure();
    },
    invalidate() { if (!disposed) pane?.invalidate(); },
    refreshVisibility() { if (disposed) return; if (pane) pane.refreshVisibility(); else void ensure(); },
    select(key) { if (disposed) return false; if (pane) return pane.select(key); selection = key; void ensure(); return false; },
    get sources() { return pane?.sources || []; },
    get selected() { return pane?.selected || ''; },
    get text() { return pane?.text || ''; },
    dispose() { if (disposed) return; disposed = true; binding = null; selection = undefined; pane?.dispose(); pane = null; },
  };
}
