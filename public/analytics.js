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

/**
 * Append Needle campaign-attribution params to an outbound URL so the
 * destination's analytics can credit this viewer. Existing query params are
 * preserved; we never overwrite a utm_* value the link already carries.
 * Returns the original string unchanged if it isn't a valid absolute URL.
 * @param {string} rawUrl
 * @param {{ campaign?: string, content?: string }} [opts]
 */
export function withUtm(rawUrl, opts = {}) {
  try {
    const url = new URL(rawUrl);
    const defaults = {
      utm_source: "usd-viewer",
      utm_medium: "referral",
      utm_campaign: opts.campaign || "whats-new",
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    if (opts.content && !url.searchParams.has("utm_content")) {
      url.searchParams.set("utm_content", opts.content);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}
