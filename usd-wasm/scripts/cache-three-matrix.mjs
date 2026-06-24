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
} from "@needle-tools/three-test-matrix";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const examplesRoot = path.join(repoRoot, "examples");
const args = parseMatrixArgs(process.argv.slice(2));
const sharedCacheRoot = getDefaultCacheRoot({ cacheRoot: args.cacheRoot, cwd: repoRoot });
const threeCacheRoot = path.join(sharedCacheRoot, "three-versions");
const pagesRoot = path.join(repoRoot, ".cache", "usd-three-matrix-pages");
const fixtureCacheRoot = path.join(repoRoot, ".cache", "usd-three-matrix-assets");
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

const fixtures = await prepareFixtures({
    cacheRoot: fixtureCacheRoot,
    refresh: args.refresh,
});

const pagesManifest = await writeUsdThreeMatrixPages({
    pagesRoot,
    runtimes,
    rendererModes,
    fixtures,
    createPage: ({ runtime, rendererMode, fixture }) => createCompatPage({ runtime, rendererMode, fixture }),
});

console.log(`Wrote USD Three matrix manifest for ${pagesManifest.pages.length} cases to ${path.join(pagesRoot, "manifest.json")}`);
console.log(`Using Three cache at ${threeCacheRoot}`);
console.log(`Using USD fixture cache at ${fixtureCacheRoot}`);

async function writeUsdThreeMatrixPages(options) {
    const root = path.resolve(options.pagesRoot);
    const pages = [];
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(root, { recursive: true });

    for (const runtime of options.runtimes) {
        for (const rendererMode of options.rendererModes) {
            for (const fixture of options.fixtures) {
                const pageDir = path.join(
                    root,
                    sanitizePathPart(runtime.id),
                    sanitizePathPart(rendererMode),
                    sanitizePathPart(fixture.name),
                );
                await fs.mkdir(pageDir, { recursive: true });
                await fs.writeFile(path.join(pageDir, "index.html"), options.createPage({ runtime, rendererMode, fixture }));
                pages.push({
                    id: `${runtime.id}:${rendererMode}:${fixture.name}`,
                    version: runtime.id,
                    rendererMode,
                    fixtureName: fixture.name,
                    fixtureUrl: fixture.url,
                    fixtureFiles: fixture.files ?? null,
                    fixtureSource: fixture.source,
                    fixtureExpectedRenderable: fixture.expectedRenderable,
                    fixtureExpectedRenderableReason: fixture.expectedRenderableReason,
                    fixtureExpectedMaterialXMaterials: fixture.expectedMaterialXMaterials ?? 0,
                    pagePath: path.join(pageDir, "index.html"),
                });
            }
        }
    }

    const manifest = { pages };
    await fs.writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
}

async function prepareFixtures({ cacheRoot, refresh }) {
    const fixtures = [{
        name: "local-test-usdz",
        url: `/@fs${path.join(repoRoot, "examples", "public", "test.usdz")}`,
        source: "examples/public/test.usdz",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-materialx-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "mxSimple.usda")}`,
        files: [{
            path: "mxSimple.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "mxSimple.usda")}`,
        }, {
            path: "mtlxFiles/standard_surface_default.mtlx",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "mtlxFiles", "standard_surface_default.mtlx")}`,
        }],
        source: "usd-wasm/tests/fixtures/materialx/mxSimple.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 1,
    }];

    const catalogFixtures = [
        { slug: "BoomBox", name: "asset-explorer-boombox" },
        {
            slug: "CesiumMan",
            name: "asset-explorer-cesium-man",
            expectedRenderable: false,
            expectedRenderableReason: "Asset Explorer generated Three USDZ currently contains no Mesh prims for CesiumMan.",
        },
        { slug: "DamagedHelmet", name: "asset-explorer-damaged-helmet" },
    ];

    await fs.mkdir(cacheRoot, { recursive: true });
    const catalog = await readNeedleAssetCatalog();

    for (const fixture of catalogFixtures) {
        const entry = catalog.find(item => item.slug === fixture.slug);
        const sourceUrl = entry?.assets?.usdz?.three;
        if (!sourceUrl) {
            throw new Error(`Asset explorer catalog did not include a generated Three USDZ URL for ${fixture.slug}.`);
        }

        const filePath = path.join(cacheRoot, `${fixture.slug}.three.usdz`);
        await downloadIfNeeded(sourceUrl, filePath, refresh);
        fixtures.push({
            name: fixture.name,
            url: `/@fs${filePath}`,
            source: sourceUrl,
            expectedRenderable: fixture.expectedRenderable ?? true,
            expectedRenderableReason: fixture.expectedRenderableReason ?? null,
            expectedMaterialXMaterials: 0,
        });

        const glbSourceUrl = entry?.assets?.glb;
        if (!glbSourceUrl) {
            throw new Error(`Asset explorer catalog did not include a raw GLB URL for ${fixture.slug}.`);
        }

        const glbFilePath = path.join(cacheRoot, `${fixture.slug}.glb`);
        await downloadIfNeeded(glbSourceUrl, glbFilePath, refresh);
        fixtures.push({
            name: `${fixture.name}-raw-glb`,
            url: `/@fs${glbFilePath}`,
            files: [{
                path: `${fixture.slug}.glb`,
                url: `/@fs${glbFilePath}`,
            }],
            source: glbSourceUrl,
            expectedRenderable: true,
            expectedRenderableReason: null,
            expectedMaterialXMaterials: 0,
        });
    }

    return fixtures;
}

async function readNeedleAssetCatalog() {
    const response = await fetch("https://asset-explorer.needle.tools/api/models.json");
    if (!response.ok) {
        throw new Error(`Failed to fetch Needle asset catalog: ${response.status} ${response.statusText}`);
    }
    const catalog = await response.json();
    return catalog.models || catalog.items || catalog.results || catalog;
}

async function downloadIfNeeded(url, filePath, refresh) {
    if (!refresh) {
        try {
            const stat = await fs.stat(filePath);
            if (stat.size > 0) return;
        }
        catch {
            // Cache miss; download below.
        }
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await fs.writeFile(filePath, bytes);
}

function sanitizePathPart(value) {
    return String(value).replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function createCompatPage({ runtime, rendererMode, fixture }) {
    const importMap = createThreeImportMap(runtime, rendererMode);
    importMap.imports["@needle-tools/materialx"] = rawFsUrl(path.join(repoRoot, "node_modules", "@needle-tools", "materialx", "index.js"));
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
                fixtureName: ${JSON.stringify(fixture.name)},
                fixtureUrl: ${JSON.stringify(fixture.url)},
                fixtureFiles: ${JSON.stringify(fixture.files ?? null)},
                fixtureSource: ${JSON.stringify(fixture.source)},
                fixtureExpectedRenderable: ${JSON.stringify(fixture.expectedRenderable ?? true)},
                fixtureExpectedRenderableReason: ${JSON.stringify(fixture.expectedRenderableReason ?? null)},
                fixtureExpectedMaterialXMaterials: ${JSON.stringify(fixture.expectedMaterialXMaterials ?? 0)},
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
