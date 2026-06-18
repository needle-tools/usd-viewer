// Thin, fail-safe wrapper around Rybbit analytics (analytics-2.needle.tools).
//
// The Rybbit script is loaded in index.html and, on its own, auto-tracks
// pageviews, outbound-link clicks and — because of data-track-errors="true" —
// uncaught JS errors and unhandled promise rejections.
//
// This helper adds the things Rybbit can't see by itself:
//   - explicit click events for in-app interactions (loading a sample,
//     exporting glTF, opening About, dropping a file)
//   - caught errors that we handle ourselves (USD module / file load failures),
//     which never bubble up as uncaught errors
//
// Analytics must never break the viewer, so every call is guarded.

/**
 * Send a custom event to Rybbit. No-ops silently if the script hasn't loaded
 * (blocked, offline, still deferred) so callers never need to null-check.
 * @param {string} name
 * @param {Record<string, unknown>} [props]
 */
export function track(name, props = {}) {
  try {
    window.rybbit?.event?.(name, props);
  } catch {
    // Swallow: a failing analytics call must not affect the viewer.
  }
}

/**
 * Report an error we caught and handled ourselves. Rybbit's automatic error
 * tracking only sees *uncaught* errors, so caught failures (e.g. a USD file
 * that fails to load) have to be sent explicitly.
 * @param {string} context  short label for where it happened, e.g. "load_file"
 * @param {unknown} error
 * @param {Record<string, unknown>} [props]
 */
export function trackError(context, error, props = {}) {
  const message = error && error.message ? error.message : String(error);
  track("viewer_error", { context, message: message.slice(0, 500), ...props });
}
