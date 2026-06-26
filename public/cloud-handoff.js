// /cloud-handoff — top-level bridge that hands the USD file set to Needle Cloud.
//
// The viewer (cross-origin isolated, for SharedArrayBuffer) can't postMessage a
// cross-origin window, so it stashes the asset in IndexedDB and navigates here.
// This page is same-origin + TOP-LEVEL (so it shares the viewer's storage — a
// cross-site iframe would get PARTITIONED storage and see nothing) and non-isolated
// (so it can open + postMessage the cloud popup). It opens cloud /connect and sends
// the asset up.
//
// NOTE on completion: the cloud upload runs on an ISOLATED page (it needs SAB for the
// engine), and isolation severs that page's opener — so it can't message us back
// reliably. Our terminal state is therefore "sent" (the cloud popup has the asset);
// the actual upload result + the editor open in the cloud popup. The DONE handler
// below is best-effort in case the opener survives.
import { loadHandoffPayload, clearHandoffPayload } from "./cloud-handoff-store.js";

const READY = "needle-cloud-connect-ready";
const RECEIVED = "needle-cloud-connect-received";
const DONE = "needle-cloud-connect-done";

const titleEl = document.getElementById("title");
const statusEl = document.getElementById("status");
const detailEl = document.getElementById("detail");
const spinnerEl = document.getElementById("spinner");
const checkEl = document.getElementById("check");
const viewLink = document.getElementById("view-link");
const backLink = document.getElementById("back-link");

function setTitle(t) { if (titleEl) titleEl.textContent = t; }
function setStatus(t) { if (statusEl) statusEl.textContent = t; }
function setStatusLines(...lines) { if (statusEl) statusEl.innerHTML = lines.map(escapeHtml).join("<br>"); }
function setDetail(t) { if (detailEl) detailEl.textContent = t || ""; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function markFinished(ok) {
  if (spinnerEl) spinnerEl.style.display = "none";
  if (checkEl) { checkEl.textContent = ok ? "✓" : "✗"; checkEl.style.display = "block"; checkEl.classList.toggle("error", !ok); }
}

// Restore the viewer's original URL (?file=… etc.) for the "Back to the viewer"
// link — same-origin only (no open-redirect to an arbitrary URL).
(function setBackLink() {
  try {
    const ret = new URLSearchParams(location.search).get("return");
    if (ret && backLink) {
      const u = new URL(ret, location.origin);
      if (u.origin === location.origin) backLink.href = u.href;
    }
  } catch { /* keep the default "/" */ }
})();

function cloudBaseUrl() {
  const stored = sessionStorage.getItem("needle_cloud_base");
  return (stored || "https://cloud.needle.tools").replace(/\/+$/, "");
}

// Open a popup centered on the current monitor, with a comfortable margin from the
// screen edges (never flush against a border).
function openCentered(url, name, w, h) {
  const availW = screen.availWidth || screen.width;
  const availH = screen.availHeight || screen.height;
  const baseLeft = typeof screen.availLeft === "number" ? screen.availLeft : 0;
  const baseTop = typeof screen.availTop === "number" ? screen.availTop : 0;
  const left = Math.round(baseLeft + Math.max(100, (availW - w) / 2));
  const top = Math.round(baseTop + Math.max(100, (availH - h) / 2));
  return window.open(url, name, `popup,width=${w},height=${h},left=${left},top=${top}`);
}

let popup = null;

async function run() {
  const payload = await loadHandoffPayload();
  if (!payload || !payload.files || !payload.files.length) {
    setStatus("There's nothing to upload — head back to the viewer and try again.");
    return;
  }
  setDetail(payload.rootFilename || "");

  const base = cloudBaseUrl();
  const cloudOrigin = new URL(base).origin;
  const buffers = payload.files.map((f) => f.bytes);
  let sent = false;

  function send(target) {
    if (sent || !target) return;
    sent = true;
    try {
      target.postMessage(payload, cloudOrigin, buffers); // transfer (zero-copy)
    } catch (err) {
      console.error("[needle-cloud handoff] postMessage failed", err);
      setStatus("Couldn't reach the Needle Cloud window.");
    }
  }

  window.addEventListener("message", async (event) => {
    if (event.origin !== cloudOrigin) return; // only trust the cloud popup
    const data = event.data || {};
    if (data.type === READY) {
      send(event.source || popup);
    } else if (data.type === RECEIVED) {
      // The cloud popup has the asset — that's as far as we can reliably track
      // (its upload page is isolated and can't message us back). Terminal "sent".
      await clearHandoffPayload();
      markFinished(true);
      setTitle("Sent to Needle Cloud");
      setStatusLines("Continue in the Needle Cloud window.", "Sign in there if prompted.");
    } else if (data.type === DONE) {
      // Best-effort upgrade if the opener happens to survive isolation.
      await clearHandoffPayload();
      markFinished(!!data.success);
      if (data.success) {
        setTitle("Uploaded to Needle Cloud");
        setStatus("Your model is now on Needle Cloud.");
        if (viewLink && data.url) { viewLink.href = data.url; viewLink.style.display = "inline-block"; }
      } else {
        setTitle("Upload failed");
        setStatus((data.error || "Something went wrong") + " — you can try again from the viewer.");
      }
    }
  });

  const url = base + "/connect?from=" + encodeURIComponent(location.origin) + "&source=usd-viewer";
  popup = openCentered(url, "needle-cloud-connect", 520, 860);
  if (!popup) {
    setStatus("Please allow pop-ups for this site, then return to the viewer and try again.");
    return;
  }
  setStatus("Opening Needle Cloud…");
  // Safety net if the popup's READY ping is missed.
  setTimeout(() => { if (!sent && !popup.closed) send(popup); }, 2500);
}

run().catch((err) => {
  console.error("[needle-cloud handoff] failed", err);
  setStatus("Something went wrong preparing the upload. Please return to the viewer and try again.");
});
