import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { createHash } from 'node:crypto';
import { createPxrFacade } from "../../examples/src/repl/pxr.js";
import { replExamples } from "../../examples/src/repl/examples.js";
import { testAssetLibrary } from "../fixtures/test-asset-library.js";
import { apiExampleAssets } from '../fixtures/api/examples.js';
import { executeExample } from '../fixtures/api/execute.js';
import { createApiStage } from '../fixtures/api/create-api-stage.js';
import { createSceneHelpers } from '../fixtures/api/scene-helpers.js';

const bindingsDir = resolve("src/bindings");
const fixturesDir = resolve("tests/fixtures");
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
  it('keeps existing saved drafts executable after the helper rename', async () => {
    const USD = await loadUsdModuleFromTempCopy();
    const result = await executeExample(USD, {code: 'stage = USD.CreateStage("/tmp/legacy-draft.usda"); sceneKit.box(stage, "/Box");'}, {
      fixtureCatalog: [], readFixture: async () => { throw new Error('Unexpected fixture read'); },
    });
    assert.equal(result.hasGeometry, true);
    assert.ok(new TextDecoder().decode(result.files[0].bytes).includes('def Cube "Box"'));
  });
  it('maps scene geometry into the native stage up axis', async () => {
    const USD = await loadUsdModuleFromTempCopy(), kit = createSceneHelpers(USD);
    for (const axis of ['Y', 'Z']) {
      const stage = USD.CreateStage(`/tmp/scene-helpers-${axis}.usda`); stage.SetUpAxis(axis);
      const box = kit.box(stage, '/Box', [1, 2, 3], [4, 5, 6]);
      assert.equal(box.GetAttribute('xformOp:translate').GetValueString(), axis === 'Z' ? '(1, -3, 2)' : '(1, 2, 3)');
      assert.equal(box.GetAttribute('xformOp:scale').GetValueString(), axis === 'Z' ? '(4, 6, 5)' : '(4, 5, 6)');
    }
  });
  it('batches box details with outward normals in both stage up axes', async () => {
    const USD=await loadUsdModuleFromTempCopy(), kit=createSceneHelpers(USD);
    const numbers=text=>text.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
    for(const axis of ['Y','Z']) {
      const stage=USD.CreateStage(`/tmp/batched-boxes-${axis}.usda`);stage.SetUpAxis(axis);
      const mesh=kit.boxes(stage,'/Boxes',[[[0,0,0],[2,4,6]]],kit.colors.gold);
      const points=numbers(mesh.GetAttribute('points').GetValueString());
      const normals=numbers(mesh.GetAttribute('normals').GetValueString());
      assert.equal(points.length,normals.length);
      for(let i=0;i<points.length;i+=3) {
        const normal=normals.slice(i,i+3), point=points.slice(i,i+3);
        assert.ok(Math.abs(Math.hypot(...normal)-1)<1e-6,'unit face normal');
        assert.ok(point.reduce((dot,value,j)=>dot+value*normal[j],0)>0,'box normals face outward');
      }
      const counts=numbers(mesh.GetAttribute('faceVertexCounts').GetValueString());
      assert.equal(counts.reduce((a,b)=>a+b,0),points.length/3,'each quad has its own flat normals');
      USD.ReleaseStage(stage);
    }
  });
  it('has a current distinct native Storm thumbnail for every executable scene', async () => {
    const capture = JSON.parse(await readFile(join(fixturesDir, 'api/native-captures.json'), 'utf8'));
    const kit = await readFile(join(fixturesDir, 'api/scene-helpers.js'), 'utf8');
    const authoring = await readFile(join(fixturesDir, 'api/create-api-stage.js'), 'utf8');
    const hashes = new Set();
    assert.equal(capture.results.length, replExamples.length);
    for (const [index, example] of replExamples.entries()) {
      const asset = apiExampleAssets[index], record = capture.results.find(record => record.id === `api-${asset.executable}`);
      assert.ok(asset.thumbnail, `${example.title}: missing thumbnail`);
      assert.equal(record?.status, 'rendered', example.title);
      assert.equal(record?.renderer, 'Storm', example.title);
      assert.equal(record?.sourceFingerprint, createHash('sha256').update(JSON.stringify([example.code, kit, authoring])).digest('hex'), `${example.title}: stale scene capture`);
      const hash = createHash('sha256').update(await readFile(join(fixturesDir, asset.thumbnail))).digest('hex');
      assert.equal(record.imageSha256, hash, `${example.title}: capture image changed`);
      assert.ok(!hashes.has(hash), `${example.title}: duplicate thumbnail`); hashes.add(hash);
    }
  });
  it('executes the catalog sources and preserves generated stages and dependencies for the viewer', async () => {
    const USD = await loadUsdModuleFromTempCopy();
    assert.equal(apiExampleAssets.length, replExamples.length);
    assert.equal(new Set(apiExampleAssets.map(asset => asset.root)).size, replExamples.length);
    for (const [index, example] of replExamples.entries()) {
      const asset = testAssetLibrary.find(asset => asset.executable === apiExampleAssets[index].executable);
      assert.equal(asset.label, example.title);
      const phases = [];
      const result = await executeExample(USD, example, {
        fixtureCatalog: testAssetLibrary,
        readFixture: async path => new Uint8Array(await readFile(join(fixturesDir, path))),
        onExecute: value => phases.push(value),
      });
      assert.deepEqual(phases, [true, false], `${example.title}: exclude preview serialization from call measurement`);
      assert.ok(result.output.length || result.files.length, example.title);
      assert.ok(result.hasGeometry && result.files.length, `${example.title}: must produce a visible scene`);
      if (result.files.length) {
        const text = new TextDecoder().decode(result.files[0].bytes);
        assert.match(text, /^#usda 1.0/, example.title);
        assert.ok(!text.includes('@/tmp/repl-fixtures/'), `${example.title}: dependencies are portable`);
        if (example.title === 'Mesh From Arrays') assert.match(text, /int\[\] faceVertexCounts = \[3\]/);
        if (example.title === 'Texture Shader Network') {
          assert.match(text, /rel material:binding = <\/World\/Looks\/Textured>/);
          assert.ok(!/rel material:binding = \[/.test(text), 'replacing a material leaves exactly one binding target');
        }
        if (example.title === 'Variant Switch') assert.match(text, /variantSet "look"/);
        if (example.title === 'Referenced Layer') {
          assert.match(text, /references = @reference-base.usda@/);
          assert.ok(result.files.some(file => file.path.endsWith('/reference-base.usda')));
        }
        if (example.title === 'Fixture: MaterialX Texture + Noise') {
          assert.ok(result.files.some(file => file.path.endsWith('checker.png')));
          assert.ok(result.files.some(file => file.path.endsWith('.mtlx')));
        }
      }
    }
    const phases = [];
    await assert.rejects(executeExample(USD, { code: 'throw new Error("fixture failed")' }, {
      fixtureCatalog: testAssetLibrary, readFixture: async () => { throw new Error('Unexpected fetch'); },
      onExecute: value => phases.push(value),
    }), /fixture failed/);
    assert.deepEqual(phases, [true, false], 'a failed fixture must close its execution phase');
  });
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

    function mountBytes(path, bytes) {
      ensureParentPath(path);
      try {
        USD.FS_unlink(path);
      }
      catch {}
      const parts = path.split("/");
      const file = parts.pop();
      const parent = parts.join("/") || "/";
      USD.FS_createDataFile(parent, file, bytes, true, true, true);
      return path;
    }

    function findFixture(query) {
      const normalized = String(query).toLowerCase();
      return testAssetLibrary.find((asset) => (
        asset.label.toLowerCase() === normalized ||
        asset.root.toLowerCase() === normalized
      ));
    }

    async function openFixture(rootOrLabel, files) {
      const fixture = findFixture(rootOrLabel);
      const root = fixture?.root ?? rootOrLabel;
      const paths = files ?? fixture?.files ?? [root];
      const orderedPaths = [root, ...paths.filter((path) => path !== root)];

      for (const path of orderedPaths) {
        const bytes = await readFile(join(fixturesDir, path));
        mountBytes(`/tmp/repl-fixtures/${path}`, bytes);
      }

      const opened = await pxr.Usd.Stage.Open(`/tmp/repl-fixtures/${root}`);
      context.stage = opened;
      return opened;
    }

    const logs = [];
    const context = {
      USD,
      ...pxr,
      createApiStage,
      sceneHelpers: createSceneHelpers(USD),
      stage: null,
      print(value) {
        logs.push(value);
      },
      vectorToArray,
      listPrims,
      inspectPrim,
      mountText,
      mountBytes,
      openFixture,
      fixtureCatalog: testAssetLibrary,
      findFixture,
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
