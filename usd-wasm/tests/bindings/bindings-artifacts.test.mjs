import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { tmpdir } from "node:os";

const bindingsDir = resolve("src/bindings");
const jsPath = resolve(bindingsDir, "emHdBindings.js");
const wasmPath = resolve(bindingsDir, "emHdBindings.wasm");
const buildInfoPath = resolve(bindingsDir, "openusd-build-info.json");
const require = createRequire(import.meta.url);
const tempModuleDirs = new Set();

process.once("exit", () => {
    for (const tempDir of tempModuleDirs) {
        rmSync(tempDir, { recursive: true, force: true });
    }
});

async function loadUsdModuleFromTempCopy() {
    const tempDir = await mkdtemp(join(tmpdir(), "usd-bindings-"));
    tempModuleDirs.add(tempDir);
    const cjsPath = join(tempDir, "emHdBindings.cjs");
    await writeFile(cjsPath, await readFile(jsPath));

    const getUsdModule = require(cjsPath);
    return getUsdModule({
        locateFile(file) {
            return resolve(bindingsDir, file);
        },
        print() {},
        printErr(message) {
            const text = String(message);
            if (!text.includes("warning:")) {
                console.error(text);
            }
        },
    });
}

describe("OpenUSD wasm binding artifacts", () => {
    it("ships the JS and wasm artifacts used by getUsdModule", async () => {
        const [js, wasm] = await Promise.all([
            stat(jsPath),
            stat(wasmPath),
            stat(buildInfoPath),
        ]);

        assert.ok(js.size > 100_000, "emHdBindings.js should be a generated Emscripten bundle");
        assert.ok(wasm.size > 1_000_000, "emHdBindings.wasm should be a real side module");
        assert.equal(existsSync(resolve(bindingsDir, "emHdBindings.data")), false, "USD resources should be embedded in the bundle, not shipped as a stale data sidecar");
    });

    it("keeps the generated JS wired to the expected global, runtime helpers, and sidecar files", async () => {
        const js = await readFile(jsPath, "utf8");

        assert.match(js, /globalThis\["NEEDLE:USD:GET"\]\s*=\s*getUsdModule/);
        assert.match(js, /Module\["ready"\]\s*=\s*Promise\.resolve\(Module\)/);
        assert.doesNotMatch(js, /Module\["ready"\]\s*=\s*readyPromise/);
        assert.match(js, /Module\["FS_readdir"\]\s*=\s*FS\.readdir/);
        assert.match(js, /Module\["FS_rmdir"\]\s*=\s*FS\.rmdir/);
        assert.match(js, /Module\["FS_analyzePath"\]\s*=\s*FS\.analyzePath/);
        assert.match(js, /emHdBindings\.wasm/);
        assert.doesNotMatch(js, /emHdBindings\.data/);
        assert.doesNotMatch(js, /remote_package_size/);
    });

    it("uses a wasm32-compatible imported shared-memory ceiling", async () => {
        const js = await readFile(jsPath, "utf8");

        assert.doesNotMatch(js, /MAX_MEMORY_DESKTOP\s*=\s*4\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024/);
        assert.match(js, /MAX_MEMORY_DESKTOP\s*=\s*2\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024/);
        assert.match(js, /typeof navigator\s*===\s*"undefined"/);
    });

    it("has a valid wasm magic header", async () => {
        const wasm = await readFile(wasmPath);

        assert.deepEqual([...wasm.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d]);
    });

    it("loads in Node with the runtime APIs used by usd-viewer", async () => {
        const USD = await loadUsdModuleFromTempCopy();

        assert.equal(typeof USD.HdWebSyncDriver, "function");
        assert.equal(typeof USD.HdWebSyncDriver.prototype.HasStage, "function");
        assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStageUpAxis, "function");
        assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStage, "function");
        assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStageStartTimeCode, "function");
        assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStageEndTimeCode, "function");
        assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStageTimeCodesPerSecond, "function");
        assert.equal(typeof USD.HdWebSyncDriver.prototype.Repopulate, "function");
        assert.equal(typeof USD.CreateStage, "function");
        assert.equal(typeof USD.OpenStage, "function");
        assert.equal(typeof USD.ReleaseStage, "function");
        assert.equal(typeof USD.CreateUsdzPackage, "function");
        assert.equal(typeof USD.GetBuildInfoJson, "function");
        assert.equal(typeof USD.ReadFile, "function");
        assert.equal(typeof USD.Stage.prototype.TraverseAll, "function");
        assert.equal(typeof USD.Stage.prototype.GetLayerStack, "function");
        assert.equal(typeof USD.Stage.prototype.GetUsedLayers, "function");
        assert.equal(typeof USD.Stage.prototype.GetCompositionErrors, "function");
        assert.equal(typeof USD.Stage.prototype.RegisterObjectsChanged, "function");
        assert.equal(typeof USD.Stage.prototype.RevokeObjectsChanged, "function");
        assert.equal(typeof USD.Layer.prototype.GetRealPath, "function");
        assert.equal(typeof USD.Prim.prototype.GetAttributes, "function");
        assert.equal(typeof USD.Prim.prototype.GetRelationships, "function");
        assert.equal(typeof USD.Prim.prototype.GetPrimStack, "function");
        assert.equal(typeof USD.Prim.prototype.GetPrimStackWithLayerOffsets, "function");
        assert.equal(typeof USD.Prim.prototype.GetPrimIndex, "function");
        assert.equal(typeof USD.Prim.prototype.GetCompositionArcs, "function");
        assert.equal(typeof USD.Prim.prototype.GetAllMetadata, "function");
        assert.equal(typeof USD.Attribute.prototype.GetResolveInfo, "function");
        assert.equal(typeof USD.Attribute.prototype.GetPropertyStackWithLayerOffsets, "function");
        assert.equal(typeof USD.Attribute.prototype.GetTimeSamples, "function");
        assert.equal(typeof USD.Relationship.prototype.GetPropertyStackWithLayerOffsets, "function");
        assert.equal(typeof USD.Attribute.prototype.SetVec3f, "function");
        assert.equal(typeof USD.Attribute.prototype.SetVec3d, "function");
        assert.equal(typeof USD.Attribute.prototype.SetMatrix4d, "function");
        assert.equal(typeof USD.Attribute.prototype.AddConnection, "function");
        assert.equal(typeof USD.Prim.prototype.ApplyAPI, "function");
        assert.equal(typeof USD.Prim.prototype.GetVariantSetNames, "function");
        assert.equal(typeof USD.Prim.prototype.CreateRelationship, "function");
        assert.equal(typeof USD.Prim.prototype.HasAuthoredPayloads, "function");
        assert.equal(typeof USD.Prim.prototype.AddPayload, "function");
        assert.equal(typeof USD.Prim.prototype.Load, "function");
        assert.equal(typeof USD.Prim.prototype.Unload, "function");
        assert.equal(typeof USD.Relationship.prototype.AddTarget, "function");
        assert.equal(typeof USD.Relationship.prototype.ClearTargets, "function");
        assert.equal(typeof USD.FS_createDataFile, "function");
        assert.equal(typeof USD.FS_createPath, "function");
        assert.equal(typeof USD.FS_analyzePath, "function");
        assert.equal(typeof USD.FS_readdir, "function");
        assert.equal(typeof USD.FS_rmdir, "function");
        assert.equal(typeof USD.FS_unlink, "function");
        assert.equal(typeof USD.ready?.then, "function");

        const buildInfo = JSON.parse(USD.GetBuildInfoJson());
        const shippedBuildInfo = JSON.parse(await readFile(buildInfoPath, "utf8"));
        assert.deepEqual(buildInfo, shippedBuildInfo);
        assert.equal(buildInfo.openusd.version, "0.26.5");
        assert.equal(typeof buildInfo.openusd.gitDirty, "boolean");
        assert.equal(buildInfo.modules.usdImaging, true);
        assert.equal(buildInfo.modules.hydraBridge, true);
        assert.equal(buildInfo.modules.materialX, true);
        assert.equal(buildInfo.modules.openSubdiv, true);
        assert.equal(buildInfo.modules.usdDraco, true);
        assert.equal(buildInfo.modules.usdGltf, true);
        assert.equal(buildInfo.modules.usdGltfDraco, true);
        assert.match(buildInfo.toolchain.emscripten, /Emscripten/);
        assert.equal(buildInfo.dependencies.openSubdiv.version, "3.6.1");
        assert.equal(buildInfo.dependencies.usdGltf.draco, true);

        const usda = `#usda 1.0
(
    upAxis = "Z"
    startTimeCode = 1
    endTimeCode = 12
    timeCodesPerSecond = 24
)

def Xform "Root" {
    custom string userProperties:test = "ok"
}
`;
        USD.FS_createDataFile("/", "stage-api.usda", new TextEncoder().encode(usda), true, true, true);
        const delegate = { createRPrim() {}, createSPrim() {}, createBPrim() {}, CommitResources() {} };
        const driver = new USD.HdWebSyncDriver(delegate, "stage-api.usda");
        assert.equal(driver.HasStage(), true);
        driver.Repopulate();
        const stage = driver.GetStage();
        const root = stage.GetPrimAtPath("/Root");

        assert.equal(String.fromCharCode(stage.GetUpAxis()), "z");
        assert.equal(stage.GetStartTimeCode(), 1);
        assert.equal(stage.GetEndTimeCode(), 12);
        assert.equal(stage.GetTimeCodesPerSecond(), 24);
        assert.equal(root.IsValid(), true);
        assert.equal(root.GetPath(), "/Root");
        assert.equal(root.GetTypeName(), "Xform");
        assert.equal(stage.GetPseudoRoot().GetChildren().size(), 1);
        const allPrims = stage.TraverseAll();
        try {
            assert.equal(allPrims.size(), 1);
        } finally {
            allPrims.delete();
        }
        assert.match(stage.GetRootLayer().ExportToString(), /def Xform "Root"/);
        driver.delete();
    });

    it("imports the public ESM package entrypoints in Node", async () => {
        const usd = await import("@needle-tools/usd");
        const three = await import("@needle-tools/usd/three");
        const plugins = await import("@needle-tools/usd/plugins");
        const vite = await import("@needle-tools/usd/vite");

        assert.equal(typeof usd.getUsdModule, "function");
        assert.equal(typeof usd.loadOpenUsdBuildInfo, "function");
        assert.equal(typeof usd.createThreeHydra, "function");
        assert.equal(typeof three.createThreeHydra, "function");
        assert.equal(typeof plugins.addPluginForNeedleEngine, "function");
        assert.equal(typeof plugins.getHydraHandleFromNeedleEngineAsset, "function");
        assert.equal(typeof vite.needleUSD, "function");

        const buildInfo = await usd.loadOpenUsdBuildInfo({
            print() {},
            printErr(message) {
                const text = String(message);
                if (!text.includes("warning:")) {
                    console.error(text);
                }
            },
        });
        assert.equal(buildInfo.openusd.version, "0.26.5");
        assert.equal(buildInfo.modules.hydraBridge, true);
        assert.equal(buildInfo.modules.materialX, true);
        assert.equal(buildInfo.modules.usdDraco, true);
        assert.equal(buildInfo.modules.usdGltfDraco, true);
    });

    it("resolves parent-folder references from mounted file trees", async () => {
        const USD = await loadUsdModuleFromTempCopy();
        const rootPath = "/resolver-parent/assets/models/parent_ref_root.usda";
        const referencedPath = "/resolver-parent/shared/geometry/referenced_cube.usda";

        USD.FS_createPath("/", "resolver-parent/assets/models", true, true);
        USD.FS_createPath("/", "resolver-parent/shared/geometry", true, true);
        USD.FS_createDataFile(
            "/resolver-parent/assets/models",
            "parent_ref_root.usda",
            await readFile("tests/fixtures/resolver-parent/assets/models/parent_ref_root.usda"),
            true,
            true,
            true,
        );
        USD.FS_createDataFile(
            "/resolver-parent/shared/geometry",
            "referenced_cube.usda",
            await readFile("tests/fixtures/resolver-parent/shared/geometry/referenced_cube.usda"),
            true,
            true,
            true,
        );

        const stage = await USD.OpenStage(rootPath);
        assert.deepEqual(stage.GetCompositionErrors(), []);
        assert.equal(stage.GetPrimAtPath("/World/Shape").IsValid(), true);
        assert.equal(stage.GetPrimAtPath("/World/Looks/Green").IsValid(), true);
        const world = stage.GetPrimAtPath("/World");
        assert.equal(world.HasAuthoredReferences(), true);
        assert.ok(world.GetCompositionArcs().some(arc =>
            arc.arcType === "PcpArcTypeReference" &&
            arc.targetLayer.realPath === referencedPath &&
            arc.introducingLayer.realPath === rootPath
        ));
        assert.ok(stage.GetUsedLayers(false).some(layer => layer.realPath === referencedPath));

        USD.ReleaseStage(stage);
    });

    it("opens a Draco-compressed glTF through the embedded usdGltf plugin", async () => {
        const USD = await loadUsdModuleFromTempCopy();
        const rootPath = "/gltf-draco/Box/Box.gltf";

        USD.FS_createPath("/", "gltf-draco/Box", true, true);
        USD.FS_createDataFile(
            "/gltf-draco/Box",
            "Box.gltf",
            await readFile("tests/fixtures/gltf-draco/Box/Box.gltf"),
            true,
            true,
            true,
        );
        USD.FS_createDataFile(
            "/gltf-draco/Box",
            "Box.bin",
            await readFile("tests/fixtures/gltf-draco/Box/Box.bin"),
            true,
            true,
            true,
        );

        const stage = await USD.OpenStage(rootPath);
        try {
            assert.deepEqual(stage.GetCompositionErrors(), []);
            assert.ok(stage.GetUsedLayers(false).some(layer => layer.realPath === rootPath));

            const meshPrims = vectorToArray(stage.TraverseAll()).filter(prim => prim.GetTypeName() === "Mesh");
            assert.equal(meshPrims.length, 1);
            const mesh = meshPrims[0];
            assert.equal(mesh.GetAttribute("points").HasAuthoredValue(), true);
            assert.equal(mesh.GetAttribute("primvars:normals").HasAuthoredValue(), true);
            assert.match(mesh.GetAttribute("points").GetValueString(), /\[/);
            assert.match(mesh.GetAttribute("primvars:normals").GetValueString(), /\[/);
        } finally {
            USD.ReleaseStage(stage);
        }
    });

    it("opens a native usdDraco mesh reference", async () => {
        const USD = await loadUsdModuleFromTempCopy();
        const rootPath = "/usd-draco/CubeCompressedTriangles.usda";
        const dracoPath = "/usd-draco/CubeCompressedTriangles.usda.draco/Cube_Geom_Cube.drc";

        USD.FS_createPath("/", "usd-draco/CubeCompressedTriangles.usda.draco", true, true);
        USD.FS_createDataFile(
            "/usd-draco",
            "CubeCompressedTriangles.usda",
            await readFile("tests/fixtures/draco/CubeCompressedTriangles.usda"),
            true,
            true,
            true,
        );
        USD.FS_createDataFile(
            "/usd-draco/CubeCompressedTriangles.usda.draco",
            "Cube_Geom_Cube.drc",
            await readFile("tests/fixtures/draco/CubeCompressedTriangles.usda.draco/Cube_Geom_Cube.drc"),
            true,
            true,
            true,
        );

        const stage = await USD.OpenStage(rootPath);
        try {
            assert.deepEqual(stage.GetCompositionErrors(), []);
            assert.ok(stage.GetUsedLayers(false).some(layer => layer.realPath === dracoPath));

            const mesh = stage.GetPrimAtPath("/Cube/Geom/Cube");
            assert.equal(mesh.IsValid(), true);
            assert.equal(mesh.GetTypeName(), "Mesh");
            assert.equal(mesh.GetAttribute("points").HasAuthoredValue(), true);
            assert.equal(mesh.GetAttribute("faceVertexCounts").HasAuthoredValue(), true);
            assert.equal(mesh.GetAttribute("faceVertexIndices").HasAuthoredValue(), true);
            assert.equal(mesh.GetAttribute("primvars:displayColor").GetValueString(), "[(0.217638, 0.217638, 0.217638)]");
            assert.match(mesh.GetAttribute("points").GetValueString(), /\[/);
            assert.match(mesh.GetAttribute("faceVertexIndices").GetValueString(), /\[/);
        } finally {
            USD.ReleaseStage(stage);
        }
    });

    it("exposes usdview-style composed inspection APIs and ObjectsChanged notices", async () => {
        const USD = await loadUsdModuleFromTempCopy();
        const encoder = new TextEncoder();

        const baseLayer = `#usda 1.0
(
    defaultPrim = "Base"
)

def Xform "Base" (
    kind = "component"
)
{
    double size = 2
    custom string userProperties:baseNote = "from-base"
}
`;
        const rootLayer = `#usda 1.0
(
    defaultPrim = "World"
)

def Xform "World" (
    prepend references = @inspect-base.usda@</Base>
    variants = {
        string look = "warm"
    }
    prepend variantSets = "look"
)
{
    custom string userProperties:rootNote = "from-root"
    rel material:binding = </Looks/Warm>

    variantSet "look" = {
        "cool" {
            custom token userProperties:look = "cool"
        }
        "warm" {
            custom token userProperties:look = "warm"
        }
    }
}

def Scope "Looks"
{
    def Material "Warm"
    {
    }
}
`;

        USD.FS_createDataFile("/", "inspect-base.usda", encoder.encode(baseLayer), true, true, true);
        USD.FS_createDataFile("/", "inspect-root.usda", encoder.encode(rootLayer), true, true, true);
        const stage = await USD.OpenStage("inspect-root.usda");
        const world = stage.GetPrimAtPath("/World");

        assert.equal(world.IsValid(), true);
        assert.equal(world.GetTypeName(), "Xform");
        assert.equal(world.GetSpecifier(), "SdfSpecifierDef");
        assert.equal(world.HasAuthoredReferences(), true);
        assert.equal(world.GetVariantSelection("look"), "warm");

        const variantSetNames = vectorToArray(world.GetVariantSetNames());
        assert.deepEqual(variantSetNames, ["look"]);
        assert.deepEqual(vectorToArray(world.GetVariantNames("look")).sort(), ["cool", "warm"]);

        const attributes = vectorToArray(world.GetAttributes());
        assert.ok(attributes.some(attribute => attribute.GetName() === "size"), "composed referenced attributes should be inspectable");
        const size = world.GetAttribute("size");
        assert.equal(size.IsValid(), true);
        assert.equal(size.GetValueString(), "2");
        assert.equal(size.GetResolveInfo(Number.NaN).source, "Default");
        assert.equal(size.GetPropertyStackWithLayerOffsets(Number.NaN).length, 1);

        const rootNote = world.GetAttribute("userProperties:rootNote");
        assert.equal(rootNote.GetAllMetadata().custom, "1");

        const relationships = vectorToArray(world.GetRelationships());
        assert.ok(relationships.some(relationship => relationship.GetName() === "material:binding"));
        const binding = world.GetRelationship("material:binding");
        assert.deepEqual(vectorToArray(binding.GetTargets()), ["/Looks/Warm"]);
        assert.equal(binding.GetPropertyStackWithLayerOffsets(Number.NaN).length, 1);

        const primStack = world.GetPrimStackWithLayerOffsets();
        assert.ok(primStack.length >= 2, "referenced prim should expose root and referenced specs");
        assert.ok(primStack.some(spec => spec.layer.displayName === "inspect-root.usda"));
        assert.ok(primStack.some(spec => spec.layer.displayName === "inspect-base.usda"));

        const primIndex = world.GetPrimIndex();
        assert.equal(primIndex.isValid, true);
        assert.equal(primIndex.rootNode.path, "/World");
        assert.ok(primIndex.rootNode.children.some(node => node.arcType === "PcpArcTypeReference"));

        const compositionArcs = world.GetCompositionArcs();
        assert.ok(compositionArcs.some(arc => arc.arcType === "PcpArcTypeReference" && arc.targetPrimPath === "/Base"));

        const layerStack = stage.GetLayerStack(true);
        assert.ok(layerStack.some(layer => layer.displayName === "inspect-root.usda"));
        const usedLayers = stage.GetUsedLayers(false);
        assert.ok(usedLayers.some(layer => layer.displayName === "inspect-base.usda"));
        assert.deepEqual(stage.GetCompositionErrors(), []);

        const notices = [];
        const listenerId = stage.RegisterObjectsChanged(notice => notices.push(notice));
        assert.equal(typeof listenerId, "number");

        assert.equal(await world.SetVariantSelection("look", "cool"), true);
        await microtask();
        assert.ok(notices.length > 0, "variant selection should send an ObjectsChanged notice");
        assert.ok(notices.some(notice => notice.resyncedPaths.includes("/World") || notice.changedInfoOnlyPaths.includes("/World")));

        assert.equal(stage.RevokeObjectsChanged(listenerId), true);
        const noticeCountAfterRevoke = notices.length;
        assert.equal(await world.SetVariantSelection("look", "warm"), true);
        await microtask();
        assert.equal(notices.length, noticeCountAfterRevoke, "revoked listeners should stop receiving ObjectsChanged notices");

        USD.ReleaseStage(stage);
    });

    it("authors stages, variants, animated values, and USDZ packages through the generated API", async () => {
        const USD = await loadUsdModuleFromTempCopy();

        try {
            USD.FS_createPath("/", "tmp", true, true);
        } catch {
            // Repeated test runs may reuse an existing MEMFS path.
        }

        const usdPath = "/tmp/generated-authoring.usda";
        const usdzPath = "/tmp/generated-authoring.usdz";
        const stage = USD.CreateStage(usdPath);

        assert.equal(typeof stage.DefinePrim, "function");
        assert.equal(stage.SetUpAxis("Z"), true);
        stage.SetStartTimeCode(1);
        stage.SetEndTimeCode(24);
        stage.SetTimeCodesPerSecond(24);

        const root = stage.DefinePrim("/World", "Xform");
        assert.equal(root.IsValid(), true);
        assert.equal(root.GetTypeName(), "Xform");

        const color = root.CreateAttribute("primvars:displayColor", "color3f", true);
        assert.equal(color.IsValid(), true);
        assert.equal(color.SetColor3f(1, 0.25, 0.5, Number.NaN), true);
        assert.equal(color.GetValueString(), "(1, 0.25, 0.5)");

        const spin = root.CreateAttribute("userProperties:spin", "float", true);
        assert.equal(spin.SetFloat(0, 1), true);
        assert.equal(spin.SetFloat(90, 24), true);
        assert.equal(spin.GetValueStringAtTime(24), "90");

        const translate = root.CreateAttribute("xformOp:translate", "double3", false);
        assert.equal(translate.SetVec3d(1, 2, 3, Number.NaN), true);
        assert.equal(translate.GetValueString(), "(1, 2, 3)");

        const transform = root.CreateAttribute("xformOp:transform", "matrix4d", false);
        assert.equal(transform.SetMatrix4d(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            4, 5, 6, 1,
            Number.NaN,
        ), true);
        assert.match(transform.GetValueString(), /\(4, 5, 6, 1\)/);

        const material = stage.DefinePrim("/Looks/Preview", "Material");
        const shader = stage.DefinePrim("/Looks/Preview/Shader", "Shader");
        assert.equal(shader.CreateAttribute("outputs:surface", "token", false).IsValid(), true);
        const surface = material.CreateAttribute("outputs:surface", "token", false);
        assert.equal(surface.AddConnection("/Looks/Preview/Shader.outputs:surface"), true);
        assert.equal(root.ApplyAPI("MaterialBindingAPI"), true);
        const binding = root.CreateRelationship("material:binding", false);
        assert.equal(binding.IsValid(), true);
        assert.equal(binding.AddTarget("/Looks/Preview"), true);
        const targets = binding.GetTargets();
        try {
            assert.equal(targets.size(), 1);
            assert.equal(targets.get(0), "/Looks/Preview");
        } finally {
            targets.delete();
        }
        assert.equal(material.IsValid(), true);

        assert.equal(root.AddVariant("lod", "low"), true);
        assert.equal(root.DefinePrimInVariant("lod", "high", "/World/HighGeom", "Scope").IsValid(), true);
        assert.equal(root.SetVariantSelection("lod", "high"), true);
        assert.equal(root.GetVariantSelection("lod"), "high");

        const variantSetNames = root.GetVariantSetNames();
        try {
            assert.deepEqual([variantSetNames.get(0)], ["lod"]);
        } finally {
            variantSetNames.delete();
        }

        const variantNames = root.GetVariantNames("lod");
        try {
            assert.equal(variantNames.size(), 2);
            assert.deepEqual([variantNames.get(0), variantNames.get(1)].sort(), ["high", "low"]);
        } finally {
            variantNames.delete();
        }

        const exported = stage.ExportToString();
        assert.match(exported, /custom color3f primvars:displayColor = \(1, 0\.25, 0\.5\)/);
        assert.match(exported, /float userProperties:spin\.timeSamples = \{/);
        assert.match(exported, /apiSchemas = \["MaterialBindingAPI"\]/);
        assert.match(exported, /token outputs:surface\.connect = <\/Looks\/Preview\/Shader.outputs:surface>/);
        assert.match(exported, /rel material:binding = <\/Looks\/Preview>/);
        assert.match(exported, /def Scope "HighGeom"/);

        const rootLayerExport = stage.GetRootLayer().ExportToString();
        assert.match(rootLayerExport, /variants = \{/);
        assert.match(rootLayerExport, /variantSet "lod" = \{/);

        assert.equal(stage.GetRootLayer().Export(usdPath), true);
        assert.equal(USD.FS_analyzePath(usdPath).exists, true);
        assert.equal(USD.CreateUsdzPackage(usdPath, usdzPath), true);

        const usdz = USD.ReadFile(usdzPath);
        assert.ok(usdz instanceof Uint8Array);
        assert.ok(usdz.length > 100);
        assert.deepEqual([...usdz.subarray(0, 2)], [0x50, 0x4b]);

        const reopened = USD.OpenStage(usdPath);
        const reopenedRoot = reopened.GetPrimAtPath("/World");
        assert.equal(reopenedRoot.IsValid(), true);
        assert.equal(reopenedRoot.GetVariantSelection("lod"), "high");
        assert.equal(reopened.GetPrimAtPath("/World/HighGeom").IsValid(), true);
        assert.equal(reopenedRoot.GetAttribute("userProperties:spin").GetValueStringAtTime(24), "90");
        assert.match(reopened.GetRootLayer().ExportToString(), /variantSet "lod" = \{/);

        const payloadPath = "/tmp/generated-payload.usda";
        const payloadStage = USD.CreateStage(payloadPath);
        payloadStage.DefinePrim("/PayloadRoot", "Xform");
        payloadStage.DefinePrim("/PayloadRoot/PayloadSphere", "Sphere");
        assert.equal(payloadStage.Export(payloadPath), true);
        USD.ReleaseStage(payloadStage);

        const payloadHolder = stage.DefinePrim("/World/PayloadHolder", "Xform");
        assert.equal(payloadHolder.AddPayload("generated-payload.usda", "/PayloadRoot"), true);
        assert.equal(payloadHolder.HasAuthoredPayloads(), true);
        assert.equal(payloadHolder.IsLoaded(), true);
        payloadHolder.Unload();
        assert.equal(payloadHolder.IsLoaded(), false);
        payloadHolder.Load();
        assert.equal(payloadHolder.IsLoaded(), true);
        assert.match(stage.GetRootLayer().ExportToString(), /prepend payload = @generated-payload\.usda@<\/PayloadRoot>/);

        USD.ReleaseStage(reopened);
        USD.ReleaseStage(stage);
    });
});

function vectorToArray(vector) {
    const values = [];
    try {
        for (let i = 0; i < vector.size(); i++) {
            values.push(vector.get(i));
        }
    } finally {
        vector.delete();
    }
    return values;
}

function microtask() {
    return new Promise(resolve => setTimeout(resolve, 0));
}
