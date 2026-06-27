// Tiny IndexedDB store that carries the "upload to Needle Cloud" payload across the
// same-origin navigation from the (cross-origin-isolated) viewer to the
// non-isolated /cloud-handoff page. In-memory state can't survive that navigation,
// and the handoff page must be non-isolated so it can postMessage a cross-origin
// popup — hence IndexedDB as the per-origin, navigation-proof handoff buffer.
//
// Shared by viewer-app.js (writes) and cloud-handoff.js (reads).

const DB_NAME = "needle-cloud-handoff";
const STORE = "handoff";
const KEY = "payload";
const VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function stashHandoffPayload(payload) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(payload, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadHandoffPayload() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearHandoffPayload() {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
