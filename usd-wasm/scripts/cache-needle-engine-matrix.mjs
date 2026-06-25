#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
    cacheNeedleEngineVersions,
    createCachedNeedleEngineRuntimes,
    createNeedleEngineImportMap,
    createNpmPackageImports,
    getDefaultCacheRoot,
    parseMatrixArgs,
    rawFsUrl,
    resolveNeedleEngineVersions,
    writeMatrixPages,
} from "@needle-tools/three-test-matrix";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const rawArgs = process.argv.slice(2);
const args = parseMatrixArgs(rawArgs);
const sharedCacheRoot = getDefaultCacheRoot({ cacheRoot: args.cacheRoot, cwd: repoRoot });
const engineCacheRoot = path.join(sharedCacheRoot, "needle-engine-versions");
const pagesRoot = path.join(repoRoot, ".cache", "usd-needle-engine-pages");

const versions = resolveNeedleEngineVersions({
    versions: args.versions,
    versionRanges: ["5.1.x"],
    includeFutureFrom: null,
    cwd: repoRoot,
});

await cacheNeedleEngineVersions({
    cacheRoot: engineCacheRoot,
    versions,
    refresh: args.refresh,
    cwd: repoRoot,
});

const runtimes = await createCachedNeedleEngineRuntimes({
    cacheRoot: engineCacheRoot,
    versions,
});

const usdImports = await createNpmPackageImports({
    packageName: "@needle-tools/usd",
    packageRoot: repoRoot,
});
usdImports["@needle-tools/usd/three"] = rawFsUrl(path.join(repoRoot, "src", "create.three.js"));
usdImports["@needle-tools/usd/plugins"] = rawFsUrl(path.join(repoRoot, "src", "plugins", "index.js"));
usdImports["@needle-tools/usd/vite"] = rawFsUrl(path.join(repoRoot, "src", "vite", "index.js"));

const manifest = await writeMatrixPages({
    pagesRoot,
    clean: true,
    axes: [{
        name: "runtime",
        values: runtimes,
        pathPart: runtime => runtime.id,
        idPart: runtime => runtime.id,
    }],
    createPage: ({ runtime }) => createNeedleEngineUsdPage({ runtime, usdImports }),
    createEntry({ runtime, id, pagePath }) {
        return {
            id,
            version: runtime.id,
            runtimeShape: runtime.runtimeShape,
            runtimeVersion: runtime.versionLabel,
            pagePath,
        };
    },
});

console.log(`Wrote USD Needle Engine matrix manifest for ${manifest.pages.length} cases to ${path.join(pagesRoot, "manifest.json")}`);
console.log(`Using Needle Engine cache at ${engineCacheRoot}`);

function createNeedleEngineUsdPage({ runtime, usdImports }) {
    const importMap = createNeedleEngineImportMap(runtime, {
        baseImportMap: { imports: usdImports },
    });
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${runtime.id}</title>
    <script type="importmap">
      ${JSON.stringify(importMap, null, 2)}
    </script>
    <script>
      window.__USD_NEEDLE_ENGINE_MATRIX_CONFIG__ = {
        runtimeVersion: ${JSON.stringify(runtime.versionLabel)},
        runtimeShape: ${JSON.stringify(runtime.runtimeShape)},
        fixtureUrl: ${JSON.stringify(`/@fs${path.join(repoRoot, "examples", "public", "test.usdz")}`)},
        staticMainUrl: ${JSON.stringify(rawFsUrl(path.join(repoRoot, "tests", "needle-engine-matrix", "static", "main.js")))},
      };
    </script>
  </head>
  <body>
    <script type="module">
      import(window.__USD_NEEDLE_ENGINE_MATRIX_CONFIG__.staticMainUrl);
    </script>
  </body>
</html>`;
}
