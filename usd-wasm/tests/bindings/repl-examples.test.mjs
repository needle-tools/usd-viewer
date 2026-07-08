import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { createPxrFacade } from "../../examples/src/repl/pxr.js";
import { replExamples } from "../../examples/src/repl/examples.js";
import { testAssetLibrary } from "../fixtures/test-asset-library.js";

const bindingsDir = resolve("src/bindings");
const require = createRequire(import.meta.url);

async function loadUsdModuleFromTempCopy() {
  const tempDir = await mkdtemp(join(tmpdir(), "usd-repl-bindings-"));
  const cjsPath = join(tempDir, "emHdBindings.cjs");
  await writeFile(cjsPath, await readFile(resolve(bindingsDir, "emHdBindings.js")));
  const getUsdModule = require(cjsPath);
  return getUsdModule({
    locateFile(file) {
      return resolve(bindingsDir, file);
    },
    print() {},
    printErr(message) {
      const text = String(message);
      if (!text.includes("warning:")) console.error(text);
    },
  });
}

describe("OpenUSD browser REPL examples", () => {
  it("ships at least 30 examples", () => {
    assert.ok(replExamples.length >= 30);
  });

  it("executes every example against the pxr-shaped facade", async () => {
    const USD = await loadUsdModuleFromTempCopy();
    const pxr = createPxrFacade(USD);
    const encoder = new TextEncoder();

    function vectorToArray(vector) {
      return pxr.vectorToArray(vector);
    }

    function listPrims(stage = context.stage) {
      if (!stage) return [];
      return vectorToArray(stage.TraverseAll()).map((prim) => prim.GetPath());
    }

    function inspectPrim(prim) {
      if (!prim?.IsValid?.()) return null;
      return {
        path: prim.GetPath(),
        typeName: prim.GetTypeName(),
        attributes: vectorToArray(prim.GetAttributes()).map((attr) => ({
          name: attr.GetName(),
          typeName: attr.GetTypeName(),
          value: attr.GetValueString(),
        })),
        relationships: vectorToArray(prim.GetRelationships()).map((rel) => ({
          name: rel.GetName(),
          targets: vectorToArray(rel.GetTargets()),
        })),
      };
    }

    function ensureParentPath(path) {
      const parts = path.split("/").filter(Boolean);
      parts.pop();
      let current = "/";
      for (const part of parts) {
        const next = `${current}${current.endsWith("/") ? "" : "/"}${part}`;
        try {
          USD.FS_createPath(current, part, true, true);
        }
        catch {}
        current = next;
      }
    }

    function mountText(path, text) {
      ensureParentPath(path);
      try {
        USD.FS_unlink(path);
      }
      catch {}
      const parts = path.split("/");
      const file = parts.pop();
      const parent = parts.join("/") || "/";
      USD.FS_createDataFile(parent, file, encoder.encode(text), true, true, true);
      return path;
    }

    const logs = [];
    const context = {
      USD,
      ...pxr,
      stage: null,
      print(value) {
        logs.push(value);
      },
      vectorToArray,
      listPrims,
      inspectPrim,
      mountText,
    };

    const runner = new Function("context", "code", `
      return (async () => {
        with (context) {
          return await eval("(async () => {\\n" + code + "\\n})()");
        }
      })();
    `);

    for (const example of replExamples) {
      context.stage = null;
      logs.length = 0;
      await assert.doesNotReject(
        () => runner(context, example.code),
        `Example failed: ${example.title}`,
      );
      assert.ok(logs.length > 0 || context.stage, `Example produced no visible result: ${example.title}`);
      if (example.title === "Mesh From Arrays") {
        const exported = logs.join("\n");
        assert.match(exported, /int\[\] faceVertexCounts = \[3\]/);
        assert.match(exported, /int\[\] faceVertexIndices = \[0, 1, 2\]/);
        assert.match(exported, /point3f\[\] points = \[\(-1, 0, 0\), \(1, 0, 0\), \(0, 1.5, 0\)\]/);
      }
    }
  });
});
