#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://usd-assets.needle.tools/__data.json";
const RAW_BASE_URL = "https://raw.githubusercontent.com/usd-wg/assets/main/";
const THUMBNAIL_BASE_URL = "https://usd-assets.needle.tools/";
const OUT_FILE = path.resolve("public/data/usd-wg-assets.json");

function decodeSvelteKitData(value, table, seen = new Map()) {
  if (typeof value === "number") {
    if (seen.has(value)) return seen.get(value);
    const child = table[value];
    if (Array.isArray(child)) {
      const result = [];
      seen.set(value, result);
      result.push(...child.map((item) => decodeSvelteKitData(item, table, seen)));
      return result;
    }
    if (child && typeof child === "object") {
      const result = {};
      seen.set(value, result);
      for (const [key, grandchild] of Object.entries(child)) {
        result[key] = decodeSvelteKitData(grandchild, table, seen);
      }
      return result;
    }
    seen.set(value, child);
    return child;
  }
  if (Array.isArray(value)) {
    return value.map((item) => decodeSvelteKitData(item, table, seen));
  }
  if (!value || typeof value !== "object") return value;

  const result = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = decodeSvelteKitData(child, table, seen);
  }
  return result;
}

function encodeUrlPath(value) {
  return String(value || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function projectItem(item) {
  const assetPath = `${item.path}${item.ext}`;
  return {
    name: item.filename,
    path: item.path,
    ext: item.ext,
    assetPath,
    thumbnailPath: item.src,
    url: RAW_BASE_URL + encodeUrlPath(assetPath),
    thumbnail: THUMBNAIL_BASE_URL + encodeUrlPath(item.src),
  };
}

function projectEntry(entry) {
  return {
    name: entry.name,
    path: entry.path,
    totalChildren: entry.totalChildren,
    items: (entry.items || []).map(projectItem),
    children: (entry.children || []).map(projectEntry),
  };
}

const response = await fetch(SOURCE_URL);
if (!response.ok) {
  throw new Error(`Failed to fetch ${SOURCE_URL}: HTTP ${response.status}`);
}

const payload = await response.json();
const layoutNode = payload.nodes?.find((node) => node?.type === "data" && Array.isArray(node.data));
if (!layoutNode) {
  throw new Error("Could not find SvelteKit data node in usd-assets payload.");
}

const decoded = decodeSvelteKitData(layoutNode.data[0], layoutNode.data);
const root = decoded.posts;
if (!root?.children?.length) {
  throw new Error("USD-WG catalog payload did not contain a hierarchy.");
}

const manifest = {
  source: SOURCE_URL,
  assetBaseUrl: RAW_BASE_URL,
  thumbnailBaseUrl: THUMBNAIL_BASE_URL,
  root: projectEntry(root),
};

await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
await fs.writeFile(OUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${OUT_FILE}`);
