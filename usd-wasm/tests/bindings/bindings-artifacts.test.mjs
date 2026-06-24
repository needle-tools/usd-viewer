import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { tmpdir } from "node:os";

const bindingsDir = resolve("src/bindings");
const jsPath = resolve(bindingsDir, "emHdBindings.js");
const wasmPath = resolve(bindingsDir, "emHdBindings.wasm");
const dataPath = resolve(bindingsDir, "emHdBindings.data");
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
    it("ship the JS, wasm, and data sidecars used by getUsdModule", async () => {
        const [js, wasm, data] = await Promise.all([
            stat(jsPath),
            stat(wasmPath),
            stat(dataPath),
        ]);

        assert.ok(js.size > 100_000, "emHdBindings.js should be a generated Emscripten bundle");
        assert.ok(wasm.size > 1_000_000, "emHdBindings.wasm should be a real side module");
        assert.ok(data.size > 1_000, "emHdBindings.data should contain preloaded USD resources");
    });

    it("keeps the generated JS wired to the expected global, runtime helpers, and sidecar files", async () => {
        const js = await readFile(jsPath, "utf8");

        assert.match(js, /globalThis\["NEEDLE:USD:GET"\]\s*=\s*getUsdModule/);
        assert.match(js, /Module\["ready"\]\s*=\s*readyPromise/);
        assert.match(js, /Module\["FS_readdir"\]\s*=\s*FS\.readdir/);
        assert.match(js, /Module\["FS_rmdir"\]\s*=\s*FS\.rmdir/);
        assert.match(js, /Module\["FS_analyzePath"\]\s*=\s*FS\.analyzePath/);
        assert.match(js, /emHdBindings\.wasm/);
        assert.match(js, /emHdBindings\.data/);
    });

    it("keeps the preloaded data size in sync with the .data sidecar", async () => {
        const js = await readFile(jsPath, "utf8");
        const data = await stat(dataPath);
        const match = js.match(/remote_package_size:\s*(\d+)/);

        assert.ok(match, "emHdBindings.js should declare remote_package_size");
        assert.equal(Number(match[1]), data.size);
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
        assert.equal(typeof USD.ReadFile, "function");
        assert.equal(typeof USD.Stage.prototype.TraverseAll, "function");
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
