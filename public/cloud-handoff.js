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
// reliably. Our terminal state is "sent" (the cloud popup has the asset). If the user
// closes that window before finishing, we offer "Try again" (we keep the asset in
// memory — we copy rather than transfer it — so we can re-send without re-reading).
import { loadHandoffPayload, clearHandoffPayload } from "./cloud-handoff-store.js";
import { track } from "./analytics.js";

const READY = "needle-cloud-connect-ready";
const RECEIVED = "needle-cloud-connect-received";
const DONE = "needle-cloud-connect-done";

const titleEl = document.getElementById("title");
const statusEl = document.getElementById("status");
const detailEl = document.getElementById("detail");
const spinnerEl = document.getElementById("spinner");
const checkSvg = document.getElementById("check-svg");
const crossSvg = document.getElementById("cross-svg");
const viewLink = document.getElementById("view-link");
const backLink = document.getElementById("back-link");
const retryLink = document.getElementById("retry-link");

function setTitle(t) { if (titleEl) titleEl.textContent = t; }
function setStatus(t) { if (statusEl) statusEl.textContent = t; }
function setStatusLines(...lines) { if (statusEl) statusEl.innerHTML = lines.map(escapeHtml).join("<br>"); }
function setDetail(t) { if (detailEl) detailEl.textContent = t || ""; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function markFinished(ok) {
  if (spinnerEl) spinnerEl.style.display = "none";
  if (checkSvg) checkSvg.style.display = ok ? "block" : "none";
  if (crossSvg) crossSvg.style.display = ok ? "none" : "block";
}

// Restore the viewer's original URL (?file=… etc.) for "Back to the viewer" —
// same-origin only (no open-redirect to an arbitrary URL).
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

// Open a popup centered on the current monitor, with a comfortable margin from the edges.
function openCentered(url, name, w, h) {
  const availW = screen.availWidth || screen.width;
  const availH = screen.availHeight || screen.height;
  const baseLeft = typeof screen.availLeft === "number" ? screen.availLeft : 0;
  const baseTop = typeof screen.availTop === "number" ? screen.availTop : 0;
  const left = Math.round(baseLeft + Math.max(100, (availW - w) / 2));
  const top = Math.round(baseTop + Math.max(100, (availH - h) / 2));
  return window.open(url, name, `popup,width=${w},height=${h},left=${left},top=${top}`);
}

let payload = null;
let cloudOrigin = "";
let connectUrl = "";
let popup = null;
let sent = false;
let succeeded = false;
let closeTimer = null;

function send() {
  if (sent || !popup) return;
  sent = true;
  try {
    // Copy (NOT transfer) so the buffers survive for a retry.
    popup.postMessage(payload, cloudOrigin);
  } catch (err) {
    console.error("[needle-cloud handoff] postMessage failed", err);
    setStatus("Couldn't reach the Needle Cloud window.");
  }
}

// Poll for the cloud window closing. If it closes before we know it succeeded,
// offer a retry (it may have failed, or the user closed it early).
function watchForClose() {
  if (closeTimer) clearInterval(closeTimer);
  closeTimer = setInterval(() => {
    if (succeeded) { clearInterval(closeTimer); return; }
    if (popup && popup.closed) {
      clearInterval(closeTimer);
      if (!succeeded) showRetry();
    }
  }, 1000);
}

function showRetry() {
  track("cloud_handoff_window_closed");
  setStatusLines("The Needle Cloud window closed.", "If your upload didn't finish, you can try again.");
  if (viewLink) viewLink.style.display = "none";
  if (retryLink) retryLink.style.display = "inline-block";
}

function openAndSend() {
  sent = false;
  if (retryLink) retryLink.style.display = "none";
  popup = openCentered(connectUrl, "needle-cloud-connect", 520, 860);
  if (!popup) {
    setStatus("Please allow pop-ups for this site, then try again.");
    if (retryLink) retryLink.style.display = "inline-block";
    return;
  }
  setStatus("Opening Needle Cloud…");
  // Safety net if the popup's READY ping is missed.
  setTimeout(() => { if (!sent && popup && !popup.closed) send(); }, 2500);
  watchForClose();
}

if (retryLink) retryLink.addEventListener("click", (e) => { e.preventDefault(); track("cloud_handoff_retry"); openAndSend(); });

async function run() {
  payload = await loadHandoffPayload();
  if (!payload || !payload.files || !payload.files.length) {
    setStatus("There's nothing to upload — head back to the viewer and try again.");
    return;
  }
  setDetail(payload.rootFilename || "");

  const base = cloudBaseUrl();
  cloudOrigin = new URL(base).origin;
  connectUrl = base + "/connect?from=" + encodeURIComponent(location.origin) + "&source=usd-viewer";

  window.addEventListener("message", async (event) => {
    if (event.origin !== cloudOrigin) return; // only trust the cloud popup
    const data = event.data || {};
    if (data.type === READY) {
      send();
    } else if (data.type === RECEIVED) {
      track("cloud_handoff_sent");
      markFinished(true);
      setTitle("Sent to Needle Cloud");
      setStatusLines("Continue in the Needle Cloud window.", "Sign in there if prompted.");
    } else if (data.type === DONE) {
      succeeded = !!data.success;
      track(data.success ? "cloud_handoff_uploaded" : "cloud_handoff_failed");
      if (closeTimer) clearInterval(closeTimer);
      await clearHandoffPayload();
      if (data.success) {
        setTitle("Uploaded to Needle Cloud");
        setStatus("Your model is now on Needle Cloud.");
        markFinished(true);
        if (retryLink) retryLink.style.display = "none";
        if (viewLink && data.url) { viewLink.href = data.url; viewLink.style.display = "inline-block"; }
      } else {
        setTitle("Upload failed");
        setStatus((data.error || "Something went wrong") + " — you can try again.");
        markFinished(false);
        if (retryLink) retryLink.style.display = "inline-block";
      }
    }
  });

  openAndSend();
}

run().catch((err) => {
  console.error("[needle-cloud handoff] failed", err);
  setStatus("Something went wrong preparing the upload. Please return to the viewer and try again.");
});
