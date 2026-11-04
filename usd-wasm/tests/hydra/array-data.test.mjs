import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findArrays,
  parseArrayLiteral,
  serializeArray,
  arrayLayout,
  fromRows,
  findDataBlocks,
} from "../../src/viewer/arrayData.js";

test("recognizes typed USD arrays and leaves expression/string/comment contents alone", () => {
  const source = `# point3f[] fake = [(1,2,3),(4,5,6),(7,8,9)]
 def Xform "World" (customData = {string note = "[1,2,3,4,5,6,7,8]"}) {
 def Mesh "Part" {
 point3f[] points = [(1,2,3),(4,5,6),(7,8,9)]
 texCoord2f[] primvars:st = [(0,0),(1,0),(1,1),(0,1)]
 int[] faceVertexIndices = [0,1,2,3,4,5,6,7]
 }
 }`;
  const arrays = findArrays(source, "usda");
  assert.equal(arrays.length, 3);
  assert.deepEqual(arrays[0].property, {
    primPath: "/World/Part",
    name: "points",
    type: "point3f[]",
    time: NaN,
  });
  assert.deepEqual(
    arrayLayout(arrays[1].value, arrays[1].type, arrays[1].name).columns,
    ["U", "V"],
  );
  for (const a of arrays)
    assert.deepEqual(
      parseArrayLiteral(source.slice(a.start, a.end), "usda"),
      a.value,
    );
  assert.equal(
    findArrays(
      'const x="[1,2,3,4,5,6,7,8]"; /* [1,2,3,4,5,6,7,8] */ let a=[foo(), ...other];',
    ).length,
    0,
  );
});
test("recognizes sample times and keeps variants from being authored in the wrong context", () => {
  const source = `def Mesh "Mesh" {
 point3f[] points.timeSamples = { 2: [(1,2,3),(4,5,6),(7,8,9)], 4: [(2,3,4),(5,6,7),(8,9,10)] }
 variantSet "look" = { "wide" { point3f[] points = [(1,2,3),(4,5,6),(7,8,9)] } }
 }`;
  const a = findArrays(source, "usda");
  assert.equal(a.length, 3);
  assert.equal(a[0].property.time, 2);
  assert.equal(a[1].property.time, 4);
  assert.equal(a[2].property, null);
});
test("round trips matrices, quaternions, strings and scientific values without evaluation", () => {
  for (const s of [
    "[[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,2,0,1]]]",
    "[[1,0,0,0],[0.707,0,0,0.707]]",
    '["a", "b\\nline", "c"]',
    "[1e-8,-2.5,+3]",
  ]) {
    const value = parseArrayLiteral(s);
    for (const language of ["javascript", "usda"])
      assert.deepEqual(
        parseArrayLiteral(serializeArray(value, language), language),
        value,
      );
    const layout = arrayLayout(value);
    assert.deepEqual(fromRows(layout.rows, layout.dims), value);
  }
  assert.deepEqual(arrayLayout([[1, 0, 0, 0]], "quatf[]").columns, [
    "W",
    "X",
    "Y",
    "Z",
  ]);
  for (const s of [
    "[alert(1)]",
    "[1,,2]",
    "[[1,2],[3]]",
    "[NaN]",
    "[Infinity]",
  ])
    assert.throws(() => parseArrayLiteral(s));
  assert.equal(
    findArrays("int64[] ids = [9007199254740993,1,2,3,4,5,6,7]", "usda").length,
    0,
  );
});
test("large point buffers retain bounded descriptors and source offsets", () => {
  const source =
    "point3f[] points = [" +
    Array.from({ length: 30000 }, (_, i) => `(${i}, 0, 1)`).join(",") +
    "]";
  const arrays = findArrays(source, "usda");
  assert.equal(arrays.length, 1);
  assert.equal(arrays[0].value.length, 30000);
  assert.equal(arrays[0].end, source.length);
});

test("empty typed arrays retain their vector or matrix row shape", () => {
  for (const [type, dims, columns] of [
    ["point3f[]", [0, 3], ["X", "Y", "Z"]],
    ["texCoord2f[]", [0, 2], ["U", "V"]],
    ["quatf[]", [0, 4], ["W", "X", "Y", "Z"]],
    ["matrix4d[]", [0, 4, 4], null],
  ]) {
    const layout = arrayLayout([], type);
    assert.deepEqual(layout.dims, dims);
    if (columns) assert.deepEqual(layout.columns, columns);
  }
});

test('sample dictionaries retain fractional times, native scalar types and varying array lengths', () => {
  const source = `def Xform "World" {
    quatf xformOp:orient.timeSamples = {-0.5: (1,0,0,0), 1.25e2: (0,1,0,0)}
    double3 xformOp:translate.timeSamples = {0: (0,0,0), 1: (1,2,3)}
    float size.timeSamples = {0: 0.25, 1: 2}
    point3f[] points.timeSamples = {0: [(0,0,0)], 1: [(0,0,0),(1,1,1)]}
    token visibility.timeSamples = {0: "inherited", 1: "invisible"}
    custom matrix4d frames.timeSamples = {0: ((1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,0,1))}
  }`;
  const blocks = findDataBlocks(source, 'usda');
  assert.equal(blocks.length, 6);
  assert.ok(blocks.every(block => block.sampled && block.property.primPath === '/World'));
  assert.deepEqual(blocks[0].samples.map(sample => sample.time), [-0.5, 125]);
  assert.equal(blocks[0].property.type, 'quatf');
  assert.deepEqual(arrayLayout(blocks[0].value, blocks[0].type).columns, ['W','X','Y','Z']);
  assert.equal(blocks[3].samples[0].value.length, 1);
  assert.equal(blocks[3].samples[1].value.length, 2);
  assert.equal(blocks[4].samples[1].value, 'invisible');
  assert.deepEqual(arrayLayout(blocks[5].value, blocks[5].type).dims, [1,4,4]);
  for (const block of blocks) {
    assert.equal(source[block.start], '{'); assert.equal(source[block.end - 1], '}');
    for (const sample of block.samples) assert.ok(source.slice(sample.start,sample.end).length);
  }
});
