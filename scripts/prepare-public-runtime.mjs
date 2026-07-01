import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const copies = [
  {
    from: join(root, "usd-wasm", "src"),
    to: join(root, "public", "usd"),
    label: "/usd",
  },
  {
    from: join(root, "node_modules", "@needle-tools", "materialx"),
    to: join(root, "public", "materialx"),
    label: "/materialx",
  },
  {
    from: join(root, "usd-wasm", "tests", "fixtures"),
    to: join(root, "public", "test-fixtures"),
    label: "/test-fixtures",
  },
];

for (const copy of copies) {
  if (!existsSync(copy.from)) {
    throw new Error(`Missing ${copy.from}. Run npm install before preparing ${copy.label}.`);
  }
  rmSync(copy.to, { recursive: true, force: true });
  cpSync(copy.from, copy.to, {
    recursive: true,
    dereference: true,
    filter(source) {
      return !source.includes(`${copy.from}/node_modules/`)
        && !source.endsWith("/dist")
        && !source.endsWith("/.DS_Store");
    },
  });
  console.log(`Prepared ${copy.label}: ${copy.to}`);
}
