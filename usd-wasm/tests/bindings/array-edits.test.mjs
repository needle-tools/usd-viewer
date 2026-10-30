import { test } from "node:test";
import assert from "node:assert/strict";
import { getUsdModule } from "../../src/bindings/index.js";
import { createArrayEdits } from "../../../public/viewer-array-edits.js";
const USD = await getUsdModule({ print() {}, printErr() {} });
if (!USD.FS_analyzePath("/tmp").exists)
  USD.FS_createPath("/", "tmp", true, true);
function setup(name) {
  const stage = USD.CreateStage("/tmp/" + name + ".usda"),
    prim = stage.DefinePrim("/Mesh", "Mesh"),
    attribute = prim.GetAttribute("points");
  attribute.Set(
    [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
    NaN,
  );
  const array = {
      property: {
        primPath: "/Mesh",
        name: "points",
        type: "point3f[]",
        time: NaN,
      },
    },
    layer = stage.GetRootLayer().GetIdentifier();
  return { stage, attribute, array, layer };
}
test("array commands preserve exact authored values across undo, redo and external conflicts", async () => {
  const { stage, attribute, array, layer } = setup("array-command");
  const owner = createArrayEdits({
    usd: USD,
    stage,
    edit: (fn) => fn(),
    isCurrent: () => true,
  });
  try {
    const before = await attribute.Get(NaN),
      after = [
        [0, 0, 1],
        [1, 0, 1],
        [0, 1, 1],
      ];
    await owner.apply(
      layer,
      array,
      stage.GetRootLayer().ExportToString(),
      after,
    );
    assert.deepEqual(await attribute.Get(NaN), after);
    assert.equal(owner.canUndo, true);
    await owner.undo();
    assert.deepEqual(await attribute.Get(NaN), before);
    assert.equal(owner.canRedo, true);
    await owner.redo();
    assert.deepEqual(await attribute.Get(NaN), after);
    attribute.Set([[9, 9, 9]], NaN);
    await assert.rejects(owner.undo(), /elsewhere/);
    assert.deepEqual(await attribute.Get(NaN), [[9, 9, 9]]);
    assert.equal(owner.canUndo, true);
  } finally {
    owner.dispose();
    USD.ReleaseStage(stage);
  }
});
test("failed array commits restore authored state and stale documents cannot mutate", async () => {
  const { stage, attribute, array, layer } = setup("array-failure");
  let live = true,
    fail = true;
  const owner = createArrayEdits({
    usd: USD,
    stage,
    isCurrent: () => live,
    edit: async (fn) => {
      await fn();
      if (fail) {
        fail = false;
        throw new Error("render failed");
      }
    },
  });
  try {
    const before = await attribute.Get(NaN),
      baseline = stage.GetRootLayer().ExportToString();
    await assert.rejects(
      owner.apply(layer, array, baseline, [[2, 3, 4]]),
      /render failed/,
    );
    assert.deepEqual(await attribute.Get(NaN), before);
    assert.equal(owner.canUndo, false);
    await assert.rejects(
      owner.apply(layer, array, baseline + "\n", [[2, 3, 4]]),
      /Layer changed/,
    );
    assert.deepEqual(await attribute.Get(NaN), before);
    live = false;
    await assert.rejects(
      owner.apply(layer, array, baseline, [[2, 3, 4]]),
      /document/,
    );
    assert.deepEqual(await attribute.Get(NaN), before);
  } finally {
    owner.dispose();
    USD.ReleaseStage(stage);
  }
});

test("sparse array undo preserves unrelated row edits and insertion undo restores length", async () => {
  const { stage, attribute, array, layer } = setup("array-sparse");
  const owner = createArrayEdits({
    usd: USD,
    stage,
    edit: (fn) => fn(),
    isCurrent: () => true,
  });
  try {
    const before = await attribute.Get(NaN),
      after = structuredClone(before);
    after[0][2] = 2;
    await owner.apply(
      layer,
      array,
      stage.GetRootLayer().ExportToString(),
      after,
    );
    const external = await attribute.Get(NaN);
    external[1][0] = 7;
    attribute.Set(external, NaN);
    await owner.undo();
    const expected = structuredClone(before);
    expected[1][0] = 7;
    assert.deepEqual(await attribute.Get(NaN), expected);
    await owner.redo();
    expected[0][2] = 2;
    assert.deepEqual(await attribute.Get(NaN), expected);
    await owner.apply(layer, array, stage.GetRootLayer().ExportToString(), [
      ...expected,
      [9, 9, 9],
    ]);
    assert.equal((await attribute.Get(NaN)).length, 4);
    await owner.undo();
    assert.deepEqual(await attribute.Get(NaN), expected);
    await owner.redo();
    assert.equal((await attribute.Get(NaN)).length, 4);
  } finally {
    owner.dispose();
    USD.ReleaseStage(stage);
  }
});
