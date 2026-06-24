import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { tmpdir } from "node:os";

const bindingsDir = resolve("src/bindings");
const jsPath = resolve(bindingsDir, "emHdBindings.js");
const wasmPath = resolve(bindingsDir, "emHdBindings.wasm");
const dataPath = resolve(bindingsDir, "emHdBindings.data");
const require = createRequire(import.meta.url);

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
        const tempDir = await mkdtemp(join(tmpdir(), "usd-bindings-"));
        const cjsPath = join(tempDir, "emHdBindings.cjs");

        try {
            await writeFile(cjsPath, await readFile(jsPath));
            const getUsdModule = require(cjsPath);
            const USD = await getUsdModule({
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

            assert.equal(typeof USD.HdWebSyncDriver, "function");
            assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStageUpAxis, "function");
            assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStage, "function");
            assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStageStartTimeCode, "function");
            assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStageEndTimeCode, "function");
            assert.equal(typeof USD.HdWebSyncDriver.prototype.GetStageTimeCodesPerSecond, "function");
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
            assert.match(stage.GetRootLayer().ExportToString(), /def Xform "Root"/);
            driver.delete();
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });
});
