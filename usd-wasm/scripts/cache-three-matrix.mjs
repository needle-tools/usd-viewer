#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
    cacheThreeVersions,
    createCachedThreeRuntime,
    createLocalThreeRuntime,
    createThreeImportMap,
    defaultThreeVersions,
    getDefaultCacheRoot,
    parseMatrixArgs,
    rawFsUrl,
    rendererModes,
    resolveRequestedVersions,
    writeThreeMatrixPages,
} from "@needle-tools/three-test-matrix";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const examplesRoot = path.join(repoRoot, "examples");
const args = parseMatrixArgs(process.argv.slice(2));
const sharedCacheRoot = getDefaultCacheRoot({ cacheRoot: args.cacheRoot, cwd: repoRoot });
const threeCacheRoot = path.join(sharedCacheRoot, "three-versions");
const pagesRoot = path.join(repoRoot, ".cache", "usd-three-matrix-pages");
const examplesPackageJson = JSON.parse(await fs.readFile(path.join(examplesRoot, "package.json"), "utf8"));
const localThreeVersion = examplesPackageJson.dependencies?.three ?? "three";

const versions = resolveRequestedVersions({
    versions: args.versions,
    fromRevision: args.fromRevision,
    defaultVersions: [...defaultThreeVersions],
    cwd: repoRoot,
});

await cacheThreeVersions({
    cacheRoot: threeCacheRoot,
    versions,
    refresh: args.refresh,
    cwd: repoRoot,
});

const runtimes = [
    await createLocalThreeRuntime({
        repoRoot: examplesRoot,
        packageRoot: path.join(examplesRoot, "node_modules", "three"),
        id: `local:${localThreeVersion}`,
        versionLabel: localThreeVersion,
        threeUrl: rawFsUrl(path.join(examplesRoot, "node_modules", "three", "build", "three.module.js")),
        addonsUrl: `${rawFsUrl(path.join(examplesRoot, "node_modules", "three", "examples", "jsm"))}/`,
        webgpuUrl: null,
        nodesUrl: null,
        forceWebGLSupported: false,
        preferWebGPUAsThree: false,
    }),
    ...await Promise.all(versions.map(version => createCachedThreeRuntime({
        cacheRoot: threeCacheRoot,
        version,
    }))),
];

const pagesManifest = await writeThreeMatrixPages({
    pagesRoot,
    runtimes,
    rendererModes,
    createPage: ({ runtime, rendererMode }) => createCompatPage({ runtime, rendererMode }),
});

console.log(`Wrote USD Three matrix manifest for ${pagesManifest.pages.length} cases to ${path.join(pagesRoot, "manifest.json")}`);
console.log(`Using Three cache at ${threeCacheRoot}`);

function createCompatPage({ runtime, rendererMode }) {
    const importMap = createThreeImportMap(runtime, rendererMode);
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
            window.__USD_THREE_MATRIX_CONFIG__ = {
                runtimeVersion: ${JSON.stringify(runtime.versionLabel)},
                rendererMode: ${JSON.stringify(rendererMode)},
                createThreeUrl: ${JSON.stringify(rawFsUrl(path.join(repoRoot, "src", "create.three.js")))},
                getUsdModuleUrl: ${JSON.stringify(`/@fs${path.join(repoRoot, "src", "bindings", "index.js")}`)},
                staticMainUrl: ${JSON.stringify(rawFsUrl(path.join(repoRoot, "tests", "three-matrix", "static", "main.js")))},
                fixtureUrl: ${JSON.stringify("/@fs" + path.join(repoRoot, "examples", "public", "test.usdz"))},
                webgpuConfigured: ${Boolean(runtime.webgpuUrl)},
                forceWebGLSupported: ${Boolean(runtime.forceWebGLSupported)}
            };
        </script>
    </head>
    <body>
        <canvas id="c" width="256" height="256"></canvas>
        <script type="module">
            import(window.__USD_THREE_MATRIX_CONFIG__.staticMainUrl);
        </script>
    </body>
</html>`;
}
