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
const rawArgs = process.argv.slice(2);
const args = parseMatrixArgs(rawArgs);
const matrixScope = resolveMatrixScope(rawArgs);
const sharedCacheRoot = getDefaultCacheRoot({ cacheRoot: args.cacheRoot, cwd: repoRoot });
const threeCacheRoot = path.join(sharedCacheRoot, "three-versions");
const pagesRoot = path.join(repoRoot, ".cache", "usd-three-matrix-pages");
const fixtureCacheRoot = path.join(repoRoot, ".cache", "usd-three-matrix-assets");
const examplesPackageJson = JSON.parse(await fs.readFile(path.join(examplesRoot, "package.json"), "utf8"));
const localThreeVersion = examplesPackageJson.dependencies?.three ?? "three";

const versions = resolveRequestedVersions({
    versions: args.versions,
    fromRevision: args.fromRevision,
    defaultVersions: matrixScope === "full" ? [...defaultThreeVersions] : [defaultThreeVersions.at(-1)],
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

const fixtures = selectFixtures(await prepareFixtures({
    cacheRoot: fixtureCacheRoot,
    refresh: args.refresh,
}), matrixScope);
const selectedRendererModes = resolveRendererModes(rawArgs, matrixScope);

const pagesManifest = await writeUsdThreeMatrixPages({
    pagesRoot,
    runtimes,
    rendererModes: selectedRendererModes,
    fixtures,
    createPage: ({ runtime, rendererMode, fixture }) => createCompatPage({ runtime, rendererMode, fixture }),
});

console.log(`Wrote USD Three matrix manifest for ${pagesManifest.pages.length} cases to ${path.join(pagesRoot, "manifest.json")}`);
console.log(`Using Three cache at ${threeCacheRoot}`);
console.log(`Using USD fixture cache at ${fixtureCacheRoot}`);
console.log(`Using matrix scope: ${matrixScope}`);
console.log(`Using renderer modes: ${selectedRendererModes.join(", ")}`);

function resolveMatrixScope(rawArgs) {
    if (rawArgs.includes("--full") || rawArgs.includes("--exhaustive")) return "full";
    const argIndex = rawArgs.findIndex(arg => arg === "--scope" || arg === "--matrix-scope");
    const rawValue = argIndex >= 0 ? rawArgs[argIndex + 1] : process.env.USD_THREE_MATRIX_SCOPE;
    if (!rawValue) return "representative";

    const scope = rawValue.trim().toLowerCase();
    if (scope === "representative" || scope === "full") return scope;
    throw new Error(`Unknown USD Three matrix scope: ${rawValue}. Expected "representative" or "full".`);
}

function resolveRendererModes(rawArgs, scope) {
    const argIndex = rawArgs.findIndex(arg => arg === "--renderer-modes" || arg === "--rendererModes");
    const rawValue = argIndex >= 0 ? rawArgs[argIndex + 1] : process.env.USD_THREE_MATRIX_RENDERER_MODES;
    if (!rawValue) return scope === "full" ? rendererModes : rendererModes.filter(mode => mode !== "webgpu-force-webgl2");

    const requested = rawValue.split(",").map(mode => mode.trim()).filter(Boolean);
    const unknown = requested.filter(mode => !rendererModes.includes(mode));
    if (unknown.length) {
        throw new Error(`Unknown renderer mode(s): ${unknown.join(", ")}. Expected one of: ${rendererModes.join(", ")}`);
    }
    return rendererModes.filter(mode => requested.includes(mode));
}

function selectFixtures(fixtures, scope) {
    if (scope === "full") return fixtures;

    const representativeFixtures = new Set([
        "local-test-usdz",
        "local-materialx-procedural-brick-usda",
        "local-binding-override-variants-usda",
        "local-catmull-clark-subdivision-usda",
        "local-reference-override-usda",
        "local-usdz-nested-material",
        "local-damaged-helmet-raw-glb",
    ]);
    return fixtures.filter(fixture => representativeFixtures.has(fixture.name));
}

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
                fixtureComplexity: fixture.complexity ?? null,
                pagePath: path.join(pageDir, "index.html"),
            });
            }
        }
    }

    const manifest = { scope: matrixScope, pages };
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
        name: "local-materialx-external-usda",
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
    }, {
        name: "local-materialx-nested-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_nested_reference.usda")}`,
        files: [{
            path: "materialx_nested_reference.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_nested_reference.usda")}`,
        }, {
            path: "mtlxFiles/standard_surface_default.mtlx",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "mtlxFiles", "standard_surface_default.mtlx")}`,
        }],
        source: "usd-wasm/tests/fixtures/materialx/materialx_nested_reference.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 1,
    }, {
        name: "local-materialx-variants-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_variant_bindings.usda")}`,
        files: [{
            path: "materialx_variant_bindings.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_variant_bindings.usda")}`,
        }, {
            path: "mtlxFiles/standard_surface_default.mtlx",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "mtlxFiles", "standard_surface_default.mtlx")}`,
        }],
        source: "usd-wasm/tests/fixtures/materialx/materialx_variant_bindings.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 1,
    }, {
        name: "local-preview-materialx-peer-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "usdshade_preview_with_mtlx_peer.usda")}`,
        files: [{
            path: "usdshade_preview_with_mtlx_peer.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "usdshade_preview_with_mtlx_peer.usda")}`,
        }, {
            path: "mtlxFiles/standard_surface_default.mtlx",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "mtlxFiles", "standard_surface_default.mtlx")}`,
        }],
        source: "usd-wasm/tests/fixtures/materialx/usdshade_preview_with_mtlx_peer.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 1,
    }, {
        name: "local-materialx-texture-noise-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_texture_noise.usda")}`,
        files: [{
            path: "materialx_texture_noise.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_texture_noise.usda")}`,
        }, {
            path: "mtlxFiles/texture_noise_surface.mtlx",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "mtlxFiles", "texture_noise_surface.mtlx")}`,
        }, {
            path: "textures/checker.png",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "checker.png")}`,
        }],
        source: "usd-wasm/tests/fixtures/materialx/materialx_texture_noise.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 1,
    }, {
        name: "local-materialx-marble-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_marble.usda")}`,
        files: [{
            path: "materialx_marble.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_marble.usda")}`,
        }, {
            path: "mtlxFiles/standard_surface_marble_solid.mtlx",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "mtlxFiles", "standard_surface_marble_solid.mtlx")}`,
        }],
        source: "usd-wasm/tests/fixtures/materialx/materialx_marble.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 1,
    }, {
        name: "local-materialx-procedural-brick-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_procedural_brick.usda")}`,
        files: [{
            path: "materialx_procedural_brick.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "materialx_procedural_brick.usda")}`,
        }, {
            path: "mtlxFiles/standard_surface_brick_procedural.mtlx",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "mtlxFiles", "standard_surface_brick_procedural.mtlx")}`,
        }, {
            path: "textures/brick_base_gray.jpg",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "brick_base_gray.jpg")}`,
        }, {
            path: "textures/brick_dirt_mask.jpg",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "brick_dirt_mask.jpg")}`,
        }, {
            path: "textures/brick_mask.jpg",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "brick_mask.jpg")}`,
        }, {
            path: "textures/brick_normal.jpg",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "brick_normal.jpg")}`,
        }, {
            path: "textures/brick_roughness.jpg",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "brick_roughness.jpg")}`,
        }, {
            path: "textures/brick_variation_mask.jpg",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "brick_variation_mask.jpg")}`,
        }],
        source: "usd-wasm/tests/fixtures/materialx/materialx_procedural_brick.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 1,
    }, {
        name: "local-payload-root-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "payloads", "payload_root.usda")}`,
        files: [{
            path: "payload_root.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "payloads", "payload_root.usda")}`,
        }, {
            path: "payload_payload.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "payloads", "payload_payload.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/payloads/payload_root.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-nested-variants-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "variants", "nested_variants.usda")}`,
        files: [{
            path: "nested_variants.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "variants", "nested_variants.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/variants/nested_variants.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-binding-override-variants-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "variants", "material_binding_overrides.usda")}`,
        files: [{
            path: "material_binding_overrides.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "variants", "material_binding_overrides.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/variants/material_binding_overrides.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-catmull-clark-subdivision-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "subdivision", "catmull_clark_cube.usda")}`,
        files: [{
            path: "catmull_clark_cube.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "subdivision", "catmull_clark_cube.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/subdivision/catmull_clark_cube.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
        complexity: "high",
    }, {
        name: "local-native-instances-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "native_instances.usda")}`,
        files: [{
            path: "native_instances.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "native_instances.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/native_instances.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-point-instancer-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "point_instancer.usda")}`,
        files: [{
            path: "point_instancer.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "point_instancer.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/point_instancer.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-reference-override-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "reference_override.usda")}`,
        files: [{
            path: "reference_override.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "reference_override.usda")}`,
        }, {
            path: "reference_base.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "reference_base.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/reference_override.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-inherits-specializes-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "inherits_specializes.usda")}`,
        files: [{
            path: "inherits_specializes.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "inherits_specializes.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/inherits_specializes.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-collection-binding-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "collection_binding.usda")}`,
        files: [{
            path: "collection_binding.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "collection_binding.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/collection_binding.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-visibility-purpose-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "visibility_purpose.usda")}`,
        files: [{
            path: "visibility_purpose.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "visibility_purpose.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/visibility_purpose.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-purpose-render-intent-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "purpose_render_intent.usda")}`,
        files: [{
            path: "purpose_render_intent.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "purpose_render_intent.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/purpose_render_intent.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-camera-light-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "camera_light.usda")}`,
        files: [{
            path: "camera_light.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "camera_light.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/camera_light.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-time-samples-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "time_samples.usda")}`,
        files: [{
            path: "time_samples.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "time_samples.usda")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/time_samples.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-preview-separate-metal-rough-usda",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "preview_separate_metal_rough.usda")}`,
        files: [{
            path: "usd-concepts/preview_separate_metal_rough.usda",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usd-concepts", "preview_separate_metal_rough.usda")}`,
        }, {
            path: "materialx/textures/brick_dirt_mask.jpg",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "brick_dirt_mask.jpg")}`,
        }, {
            path: "materialx/textures/brick_roughness.jpg",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "brick_roughness.jpg")}`,
        }, {
            path: "materialx/textures/brick_mask.jpg",
            url: `/@fs${path.join(repoRoot, "tests", "fixtures", "materialx", "textures", "brick_mask.jpg")}`,
        }],
        source: "usd-wasm/tests/fixtures/usd-concepts/preview_separate_metal_rough.usda",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }, {
        name: "local-usdz-nested-material",
        url: `/@fs${path.join(repoRoot, "tests", "fixtures", "usdz-nested-material.usdz")}`,
        source: "usd-wasm/tests/fixtures/usdz-nested-material.usdz",
        expectedRenderable: true,
        expectedRenderableReason: null,
        expectedMaterialXMaterials: 0,
    }];

    const localAssetFixtures = [
        { slug: "BoomBox", name: "local-boombox" },
        { slug: "CesiumMan", name: "local-cesium-man", usdzFile: "CesiumMan.glb.openusd.usdz" },
        { slug: "DamagedHelmet", name: "local-damaged-helmet" },
    ];

    await fs.mkdir(cacheRoot, { recursive: true });

    for (const fixture of localAssetFixtures) {
        const usdzFile = fixture.usdzFile ?? `${fixture.slug}.glb.three.usdz`;
        const filePath = path.join(repoRoot, "tests", "fixtures", "asset-explorer", usdzFile);
        fixtures.push({
            name: fixture.name,
            url: `/@fs${filePath}`,
            source: `usd-wasm/tests/fixtures/asset-explorer/${usdzFile}`,
            expectedRenderable: fixture.expectedRenderable ?? true,
            expectedRenderableReason: fixture.expectedRenderableReason ?? null,
            expectedMaterialXMaterials: 0,
        });

        const glbFilePath = path.join(repoRoot, "tests", "fixtures", "asset-explorer", `${fixture.slug}.glb`);
        fixtures.push({
            name: `${fixture.name}-raw-glb`,
            url: `/@fs${glbFilePath}`,
            files: [{
                path: `${fixture.slug}.glb`,
                url: `/@fs${glbFilePath}`,
            }],
            source: `usd-wasm/tests/fixtures/asset-explorer/${fixture.slug}.glb`,
            expectedRenderable: true,
            expectedRenderableReason: null,
            expectedMaterialXMaterials: 0,
        });
    }

    return fixtures;
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
                fixtureComplexity: ${JSON.stringify(fixture.complexity ?? null)},
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
