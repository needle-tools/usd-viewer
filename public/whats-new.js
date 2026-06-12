// "What's New" banner — small, subtle, bottom-right card that rotates through
// announcements served by the Needle marketer feed:
//   https://marketer.needle.tools/api/whats-new
//
// The feed is public, read-only, login-free and CORS-open. We render the
// `banner` variant (themed background + WCAG-readable text colour baked into
// `banner.css`) as text only — we deliberately skip `media` images because the
// viewer is served with COEP: require-corp, under which cross-origin images
// need CORP/crossorigin handling and would otherwise be blocked.
//
// Frequency and dismissal are the consumer's responsibility (the API is
// stateless on exposure), so this module owns rotation + dismissal.

const FEED_ENDPOINT = "https://marketer.needle.tools/api/whats-new";

// Dismissal is per-item and time-limited: clicking × on a card hides only that
// item, for 12 hours. We persist an { id: dismissedAtMs } map; an item is
// filtered out of the feed while its dismissal is still within the TTL, and
// reappears once the window passes.
const DISMISSED_KEY = "needle-whats-new-dismissed";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

// How long each item stays on screen before rotating to the next one.
const ROTATE_INTERVAL_MS = 9000;

// Tags describing what this surface is about — drives feed ranking
// (tag overlap first, then priority). Vocabulary is defined by the feed.
const SURFACE_TAGS = ["3d-design", "rendering", "hosting", "compression"];

// Fallback theme used when an item provides no colour hints of its own:
// a subtle USD blue (soft sky-blue gradient + readable dark-navy text),
// mirroring the feed's own 20° gradient style.
const FALLBACK_CSS =
  "background: linear-gradient(20deg, #d6eaf8, #b6d8f2); color: #103a52;";

// Convert a #rgb / #rrggbb hex colour to OKLab {L, a, b} (Björn Ottosson).
function hexToOklab(hex) {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.replace(/(.)/g, "$1$1") : c;
  const lin = (i) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin(0),
    g = lin(2),
    b = lin(4);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

// Build the card's inline theme from the item's `colors` hints (0–2 hex).
// We deliberately ignore the feed's pre-baked `banner.css`. With no usable
// colours, fall back to the subtle USD blue. The text colour is derived in
// OKLCH from the average of the background hint(s): same hue, but lightness
// pushed to a readable extreme (dark text on light backgrounds, light on dark).
function themeFromColors(colors) {
  const valid = (Array.isArray(colors) ? colors : []).filter((c) =>
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)
  );
  if (valid.length === 0) return FALLBACK_CSS;

  const bg =
    valid.length >= 2
      ? `linear-gradient(20deg, ${valid[0]}, ${valid[1]})`
      : valid[0];

  // Average the background hint(s) in OKLab, then read off lightness/chroma/hue.
  const lab = valid.map(hexToOklab);
  const avg = lab.reduce(
    (s, p) => ({ L: s.L + p.L, a: s.a + p.a, b: s.b + p.b }),
    { L: 0, a: 0, b: 0 }
  );
  avg.L /= lab.length;
  avg.a /= lab.length;
  avg.b /= lab.length;

  const chroma = Math.sqrt(avg.a * avg.a + avg.b * avg.b);
  let hue = (Math.atan2(avg.b, avg.a) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  if (chroma < 0.0001) hue = 0; // near-grey: hue is meaningless

  // Light background → dark, faintly-tinted text; dark background → light text.
  const isLightBg = avg.L > 0.6;
  const textL = isLightBg ? 0.28 : 0.97;
  const textC = Math.min(chroma, isLightBg ? 0.06 : 0.03);
  const text = `oklch(${textL} ${textC.toFixed(3)} ${hue.toFixed(1)})`;

  return `background: ${bg}; color: ${text};`;
}

// Reads the dismissal map and drops entries whose 12h window has passed,
// persisting the pruned map back. Returns a Set of ids still dismissed.
function getActiveDismissedIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const now = Date.now();
    const pruned = {};
    for (const [id, at] of Object.entries(map)) {
      if (typeof at === "number" && now - at < DISMISS_TTL_MS) pruned[id] = at;
    }
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(pruned));
    return new Set(Object.keys(pruned));
  } catch {
    return new Set();
  }
}

function markItemDismissed(id) {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[id] = Date.now();
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
  } catch {
    // localStorage may be unavailable (private mode / blocked); dismissal
    // simply won't persist across reloads. Not worth surfacing.
  }
}

async function fetchItems() {
  const url = new URL(FEED_ENDPOINT);
  // hostname keeps this correct on staging / preview domains too.
  url.searchParams.set("surface", location.hostname || "usd-viewer.needle.tools");
  url.searchParams.set("tags", SURFACE_TAGS.join(","));
  // This is a free public viewer — unlicensed — so it should see upsell hints.
  url.searchParams.set("license", "none");
  url.searchParams.set("limit", "8");

  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`whats-new feed responded ${res.status}`);
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const dismissed = getActiveDismissedIds();
  // Only items that can be rendered as a banner and haven't been dismissed.
  return items.filter(
    (it) => it && it.banner && it.banner.title && !dismissed.has(it.id)
  );
}

function buildDom() {
  const root = document.createElement("aside");
  root.className = "whats-new";
  root.setAttribute("aria-label", "What's new at Needle");
  root.hidden = true;

  const link = document.createElement("a");
  link.className = "whats-new-link";
  link.target = "_blank";
  link.rel = "noopener";

  const kicker = document.createElement("span");
  kicker.className = "whats-new-kicker";

  const title = document.createElement("strong");
  title.className = "whats-new-title";

  const subtitle = document.createElement("span");
  subtitle.className = "whats-new-subtitle";

  const cta = document.createElement("span");
  cta.className = "whats-new-cta";

  link.append(kicker, title, subtitle, cta);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "whats-new-dismiss";
  dismiss.title = "Dismiss";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

  const dots = document.createElement("div");
  dots.className = "whats-new-dots";

  root.append(link, dismiss, dots);
  document.body.appendChild(root);

  return { root, link, kicker, title, subtitle, cta, dots, dismiss };
}

const KICKER_BY_KIND = {
  promo: "Offer",
  feature: "What's new",
  event: "Event",
  crosspromo: "From Needle",
};

function start(initialItems, dom) {
  const { root, link, kicker, title, subtitle, cta, dots, dismiss } = dom;

  // Mutable copy — dismissing an item removes it from the live rotation.
  const items = [...initialItems];
  let index = 0;
  let timer = null;

  // Rotation dots — one per item, only shown when there's more than one.
  // Rebuilt whenever an item is dismissed so the count stays in sync.
  let dotEls = [];
  function rebuildDots() {
    dots.innerHTML = "";
    dotEls = [];
    if (items.length > 1) {
      items.forEach(() => {
        const d = document.createElement("span");
        d.className = "whats-new-dot";
        dots.appendChild(d);
        dotEls.push(d);
      });
    }
  }

  function render(i) {
    const item = items[i];
    const b = item.banner;
    // Theme the card from the item's `colors` hints (ignoring the feed's
    // pre-baked banner.css); falls back to subtle USD blue when absent.
    link.style.cssText = themeFromColors(item.colors);
    link.href = item.url || "#";
    if (!item.url) link.removeAttribute("target");
    else link.target = "_blank";

    kicker.textContent = KICKER_BY_KIND[item.kind] || "What's new";
    title.textContent = b.title || "";
    subtitle.textContent = b.subtitle || "";
    cta.textContent = (b.cta || "Learn more") + " →";
    subtitle.hidden = !b.subtitle;

    dotEls.forEach((d, di) => d.classList.toggle("is-active", di === i));
  }

  function show(i) {
    // brief fade for the swap
    root.classList.remove("is-visible");
    window.requestAnimationFrame(() => {
      render(i);
      window.requestAnimationFrame(() => root.classList.add("is-visible"));
    });
  }

  function advance() {
    index = (index + 1) % items.length;
    show(index);
  }

  function startTimer() {
    if (timer || items.length < 2) return;
    timer = window.setInterval(advance, ROTATE_INTERVAL_MS);
  }
  function stopTimer() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  // Dismiss only the item currently on screen: remember its id, drop it from
  // the rotation, and either show the next remaining item or remove the banner.
  function dismissCurrent() {
    const removed = items[index];
    if (removed) markItemDismissed(removed.id);
    items.splice(index, 1);

    if (items.length === 0) {
      stopTimer();
      root.classList.remove("is-visible");
      window.setTimeout(() => root.remove(), 250);
      return;
    }

    if (index >= items.length) index = 0;
    rebuildDots();
    render(index);
    // restart the rotation cadence from this fresh card
    stopTimer();
    startTimer();
  }

  // Click the card through — record an outbound event in Plausible if present.
  link.addEventListener("click", () => {
    if (typeof window.plausible === "function" && items[index]?.url) {
      window.plausible("whats-new:click", { props: { id: items[index].id } });
    }
  });

  dismiss.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dismissCurrent();
  });

  // Pause rotation while the user is hovering / focused on the card.
  root.addEventListener("mouseenter", stopTimer);
  root.addEventListener("mouseleave", startTimer);
  root.addEventListener("focusin", stopTimer);
  root.addEventListener("focusout", startTimer);

  // First paint.
  rebuildDots();
  root.hidden = false;
  render(0);
  // next frame so the slide/fade-in transition runs from the hidden state
  window.requestAnimationFrame(() => root.classList.add("is-visible"));
  startTimer();
}

async function initWhatsNew() {
  let items;
  try {
    items = await fetchItems();
  } catch (err) {
    // Surface the failure for debugging, but never block the viewer on an ad.
    console.warn("[whats-new] feed unavailable:", err);
    return;
  }
  if (!items.length) return;

  start(items, buildDom());
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWhatsNew);
} else {
  initWhatsNew();
}
