import { apiPreviewIds } from './previews.js';

// Every example authors a small, visible scene with the OpenUSD bindings.
// `sceneHelpers` (scene-helpers.js) supplies short helpers for the decorative geometry,
// so each example's own API calls stay in the foreground.
export const replExamples = [
  {
    title: "Hello World",
    group: "Scene Building",
    code: `// Put a sphere under /hello, then add an orbit as a sibling. Moving /hello
// moves the whole model because the children inherit its transform.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/hello-world.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);

// A Sphere schema supplies a radius attribute with the correct USD type.
// Change 1.0 below to resize the planet without scaling its orbit.
UsdGeom.Xform.Define(stage, "/hello");
const planet = UsdGeom.Sphere.Define(stage, "/hello/world");
planet.CreateRadiusAttr(1.0);
kit.color(planet, colors.teal);

// A tilted orbit plane carries a ring and a moon; children inherit its rotation.
kit.group(stage, "/hello/Orbit", [0, 0, 0], [-68, 0, 18]);
kit.torus(stage, "/hello/Orbit/Path", [0, 0, 0], 1.7, 0.05, colors.gold);
kit.sphere(stage, "/hello/Orbit/Moon", [1.2, 1.2, 0], 0.24, colors.coral);

print(stage.GetRootLayer().ExportToString());`,
  },
  {
    title: "Stage Metadata",
    group: "Scene Building",
    code: `// Describe a 40-frame shot at 24 frames per second. The clock below reads
// those settings back: its ticks represent frames and its hand marks the duration.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/stage-metadata.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
stage.SetStartTimeCode(1001);
stage.SetEndTimeCode(1040);
stage.SetTimeCodesPerSecond(24);

// Read the metadata back and draw it as a clock: one tick per frame of a
// second, and a hand showing where the 40-frame shot ends on its second lap.
const fps = stage.GetTimeCodesPerSecond();
const frameCount = stage.GetEndTimeCode() - stage.GetStartTimeCode() + 1;
const center = [0, 1.65, 0];
function onDial(turns, radius, depth = 0) {
  const angle = Math.PI / 2 - turns * 2 * Math.PI;   // clockwise from 12 o'clock
  return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle), depth];
}

kit.torus(stage, "/World/Clock/Rim", center, 1.45, 0.09, colors.teal);
const ticks = [];
for (let frame = 0; frame < fps; frame++) {
  const inner = frame % 6 === 0 ? 1.02 : 1.18;      // quarter-second ticks are longer
  ticks.push([onDial(frame / fps, inner), onDial(frame / fps, 1.32)]);
}
// One mesh holds the gold tick marks; the coral hand has its own colour.
kit.beams(stage, "/World/Clock/Ticks", ticks, 0.03, colors.gold);
kit.beam(stage, "/World/Clock/Hand", onDial(0, 0, 0.08), onDial(frameCount / fps, 0.95, 0.08), 0.05, colors.coral);
kit.sphere(stage, "/World/Clock/Axle", [center[0], center[1], 0.1], 0.12, colors.cream);
kit.box(stage, "/World/Clock/Base", [0, 0.05, 0], [1.4, 0.1, 0.6], colors.ink);

print({
  // GetUpAxis returns the axis as a character code.
  upAxis: String.fromCharCode(stage.GetUpAxis()).toUpperCase(),
  start: stage.GetStartTimeCode(),
  end: stage.GetEndTimeCode(),
  fps,
});`,
  },
  {
    title: "Generic Prims",
    group: "Scene Building",
    code: `// Build a hanging mobile with ordinary prims and two lights. DefinePrim takes
// a USD type name, so the same authoring pattern works for shapes and lights.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/generic-prims.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
const world = stage.DefinePrim("/World", "Xform");
const props = stage.DefinePrim("/World/Props", "Scope");
const light = stage.DefinePrim("/World/KeyLight", "DistantLight");
const sky = stage.DefinePrim("/World/SkyLight", "DomeLight");

// Generic attributes take a name, a value type and custom = false for schema inputs.
// With normalize on, a DistantLight's intensity is the illuminance it delivers,
// independent of its angular size. Without it, intensity is the luminance of a
// 0.53 degree sun disc and needs values in the tens of thousands.
light.CreateAttribute("inputs:normalize", Sdf.ValueTypeNames.Bool, false).Set(true);
light.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(2.5);
light.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(1, 0.95, 0.88));
// A stage with its own lights replaces the viewer's default lighting, so a dim
// untextured dome adds the soft fill that keeps the shadow sides readable.
sky.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(0.4);
sky.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(0.75, 0.85, 1));
// XformCommonAPI works on any xformable prim, lights included.
UsdGeom.XformCommonAPI(light).SetRotate(Gf.Vec3f(-35, -25, 0));

// A hanging mobile: each arm holds a paddle on one end and the next, smaller
// arm on the other, turned a little further around the vertical.
const paddleColors = [colors.coral, colors.teal, colors.gold, colors.blue];
let pivot = [0, 2.45, 0];
kit.beam(stage, "/World/Props/Hook", [0, 2.95, 0], pivot, 0.012, colors.ink);
for (let level = 0; level < 4; level++) {
  const span = 1.5 - level * 0.28, turn = level * 0.95;
  const direction = [Math.cos(turn), 0, Math.sin(turn)];
  const paddleEnd = pivot.map((value, i) => value - direction[i] * span * 0.6);
  const armEnd = pivot.map((value, i) => value + direction[i] * span * 0.4);
  const radius = 0.3 - level * 0.035, name = "/World/Props/Arm" + level;

  kit.beam(stage, name, paddleEnd, armEnd, 0.018, colors.ink);
  const paddleCenter = [paddleEnd[0], paddleEnd[1] - radius - 0.12, paddleEnd[2]];
  kit.beam(stage, "/World/Props/String" + level, paddleEnd, [paddleEnd[0], paddleCenter[1] + radius, paddleEnd[2]], 0.01, colors.ink);
  kit.sphere(stage, "/World/Props/Paddle" + level, paddleCenter, radius, paddleColors[level], [1, 1, 0.18]);

  pivot = [armEnd[0], armEnd[1] - 0.5, armEnd[2]];
  kit.beam(stage, "/World/Props/Drop" + level, armEnd, pivot, 0.01, colors.ink);
}
kit.sphere(stage, "/World/Props/Weight", pivot, 0.12, colors.violet);

print([world.GetTypeName(), props.GetTypeName(), light.GetTypeName(), sky.GetTypeName()]);`,
    authoredLighting: true,
  },
  {
    title: "Schema Shapes",
    group: "Scene Building",
    code: `// Balance a sphere and a cube on a seesaw. Radius and size change the shapes
// themselves; the parent transform tips the whole assembly together.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/schema-shapes.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
UsdGeom.Xform.Define(stage, "/World");
const ball = UsdGeom.Sphere.Define(stage, "/World/Ball");
const box = UsdGeom.Cube.Define(stage, "/World/Box");

ball.CreateRadiusAttr(0.5);
box.CreateSizeAttr(0.85);
ball.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(0.95, 0.2, 0.15)]));
box.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(0.05, 0.25, 0.9)]));

// Balance both shapes on a seesaw that tips toward the box.
const tilt = -11, radians = tilt * Math.PI / 180;
const plankCenter = [0, 0.72, 0];
const along = [Math.cos(radians), Math.sin(radians), 0];   // direction of the plank
const up = [-Math.sin(radians), Math.cos(radians), 0];     // the plank's surface normal
const onPlank = (distance, lift) => plankCenter.map((value, i) => value + along[i] * distance + up[i] * (0.06 + lift));
UsdGeom.XformCommonAPI(ball).SetTranslate(Gf.Vec3d(...onPlank(-1.2, 0.5)));
UsdGeom.XformCommonAPI(box).SetTranslate(Gf.Vec3d(...onPlank(1.15, 0.425)));
UsdGeom.XformCommonAPI(box).SetRotate(Gf.Vec3f(0, 0, tilt));

kit.box(stage, "/World/Plank", plankCenter, [3.4, 0.12, 0.7], colors.cream, [0, 0, tilt]);
kit.lathe(stage, "/World/Fulcrum", [0, 0, 0], [[0.01, 0], [0.45, 0], [0.04, 0.66], [0.01, 0.66]], colors.gold);
kit.box(stage, "/World/Ground", [0, -0.06, 0], [4, 0.12, 1.4], colors.ink);

print(listPrims(stage));`,
  },
  {
    title: "Mesh From Arrays",
    group: "Scene Building",
    code: `// A mesh is three arrays: points, the vertex count of each face, and the
// point indices each face uses, in order.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/mesh-arrays.usda");
stage.SetUpAxis("Y");
const mesh = UsdGeom.Mesh.Define(stage, "/World/Triangle");

mesh.CreatePointsAttr(Vt.Vec3fArray([
  Gf.Vec3f(-1, 0, 0),
  Gf.Vec3f(1, 0, 0),
  Gf.Vec3f(0, 1.5, 0),
]));
mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3]));          // one face with three corners
mesh.CreateFaceVertexIndicesAttr(Vt.IntArray([0, 1, 2]));   // ...made from points 0, 1 and 2
mesh.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(0.2, 0.8, 0.55)]));
// A sail is seen from both sides, so turn off back-face culling.
kit.attr(mesh, "doubleSided", "bool", true);

// The triangle becomes the sail of a small boat.
kit.beam(stage, "/World/Mast", [0, -0.5, -0.03], [0, 1.85, -0.03], 0.045, colors.gold);
kit.beam(stage, "/World/Boom", [-1.1, -0.05, 0], [1.1, -0.05, 0], 0.035, colors.cream);
kit.mesh(stage, "/World/Pennant", [[0, 1.85, -0.03], [0, 1.65, -0.03], [0.42, 1.75, -0.03]], [3], [0, 1, 2], colors.coral);
// The hull uses the same three arrays: six points, three quads (two sides and the deck).
const hullPoints = [
  [-1.4, -0.2, 0.3], [1.4, -0.2, 0.3], [0.9, -0.65, 0],
  [-0.9, -0.65, 0], [-1.4, -0.2, -0.3], [1.4, -0.2, -0.3],
];
kit.mesh(stage, "/World/Hull", hullPoints, [4, 4, 4], [0, 1, 2, 3, 4, 3, 2, 5, 0, 4, 5, 1], colors.blue);

print(await stage.ExportToString());`,
  },
  {
    title: "Xform Ops",
    group: "Transforms",
    code: `// Place the plane with separate translate, rotate and scale operations. In
// this stack, scaling and rotation happen around its local origin before placement.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/xform-ops.usda");
stage.SetUpAxis("Y");
const model = UsdGeom.Xform.Define(stage, "/World/Model");

model.AddTranslateOp().Set(Gf.Vec3d(1, 2, 3));
model.AddRotateXYZOp().Set(Gf.Vec3f(0, 45, 0));
model.AddScaleOp().Set(Gf.Vec3f(1.5, 1.5, 1.5));

// A toy plane modelled around the origin, nose along +X. The op stack lifts
// it to (1, 2, 3), yaws it 45 degrees and enlarges it by half.
kit.group(stage, "/World/Model/Fuselage", [0, 0, 0], [0, 0, -90]);   // lay the lathe's Y axis along +X
kit.lathe(stage, "/World/Model/Fuselage/Body", [0, 0, 0], [[0.01, -0.75], [0.14, -0.7], [0.18, -0.2], [0.16, 0.45], [0.01, 0.8]], colors.cream);
kit.box(stage, "/World/Model/Wing", [0.08, 0, 0], [0.38, 0.04, 1.6], colors.coral);
kit.box(stage, "/World/Model/Tailplane", [-0.62, 0.02, 0], [0.2, 0.03, 0.6], colors.coral);
kit.box(stage, "/World/Model/Fin", [-0.62, 0.2, 0], [0.22, 0.34, 0.03], colors.teal);

// World-space guides: the origin and the translate vector.
kit.torus(stage, "/World/Origin", [0, 0, 0], 0.4, 0.04, colors.ink, "y");
kit.beam(stage, "/World/Translate", [0, 0, 0], [1, 2, 3], 0.03, colors.gold);

print(await inspectPrim(model.GetPrim()));`,
  },
  {
    title: "Xform Common API",
    group: "Transforms",
    code: `// Lean and stretch a tower as one object. Its windows are built in the
// tower's local space, so they inherit the same translation, rotation and scale.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/xform-common.usda");
stage.SetUpAxis("Y");
const tower = UsdGeom.Cube.Define(stage, "/World/Tower");
tower.CreateSizeAttr(1);
kit.color(tower, colors.cream);

const xform = UsdGeom.XformCommonAPI(tower);
xform.SetTranslate(Gf.Vec3d(0, 1.55, 0));
xform.SetRotate(Gf.Vec3f(0, 0, 8));
xform.SetScale(Gf.Vec3f(0.55, 3, 0.55));

// Children live in the tower's unit-cube space and inherit its lean and stretch.
const cornices = [], windows = [];
for (let floor = 1; floor < 7; floor++) {
  const y = -0.5 + floor / 7;
  cornices.push([[0, y, 0], [1.12, 0.012, 1.12]]);
  windows.push([[0, y + 0.07, 0.505], [0.3, 0.05, 0.02]]);
}
kit.boxes(stage, "/World/Tower/Cornices", cornices, colors.gold);
kit.boxes(stage, "/World/Tower/Windows", windows, colors.ink);
kit.box(stage, "/World/Tower/Belfry", [0, 0.56, 0], [0.8, 0.12, 0.8], colors.coral);

// A plinth and a true vertical make the 8 degree lean readable.
kit.box(stage, "/World/Plinth", [0, -0.08, 0], [2.4, 0.16, 1.8], colors.teal);
kit.beam(stage, "/World/Vertical", [0.85, 0, -0.55], [0.85, 3.3, -0.55], 0.02, colors.coral);

print(await stage.ExportToString());`,
  },
  {
    title: "Matrix Transform",
    group: "Transforms",
    code: `// Move a desk lamp by setting one transform matrix on its parent. The lamp
// is modelled around that parent's origin; the three coloured axes mark its new location.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/matrix-transform.usda");
stage.SetUpAxis("Y");
const rig = UsdGeom.Xform.Define(stage, "/World/Rig");
const matrix = Gf.Matrix4d.Identity().SetTranslate(Gf.Vec3d(4, 5, 6));
rig.AddTransformOp().Set(matrix);

// A desk lamp modelled around the rig's local origin; the matrix carries it all.
kit.lathe(stage, "/World/Rig/Base", [0, 0, 0], [[0.01, 0], [0.55, 0], [0.55, 0.06], [0.4, 0.12], [0.01, 0.14]], colors.ink);
const elbow = [0.45, 1.3, 0], head = [-0.35, 2.05, 0];
kit.beam(stage, "/World/Rig/LowerArm", [0, 0.12, 0], elbow, 0.06, colors.teal);
kit.sphere(stage, "/World/Rig/Elbow", elbow, 0.11, colors.gold);
kit.beam(stage, "/World/Rig/UpperArm", elbow, head, 0.05, colors.teal);
kit.group(stage, "/World/Rig/Head", head, [0, 0, 35]);
kit.lathe(stage, "/World/Rig/Head/Shade", [0, 0, 0], [[0.08, 0.12], [0.11, 0.02], [0.36, -0.36], [0.38, -0.4]], colors.coral);
kit.sphere(stage, "/World/Rig/Head/Bulb", [0, -0.18, 0], 0.1, colors.cream);

// Local axes mark where the matrix placed the rig's origin: X red, Y green-blue, Z blue.
kit.beam(stage, "/World/Rig/AxisX", [0, 0, 0], [1.2, 0, 0], 0.02, colors.coral);
kit.beam(stage, "/World/Rig/AxisY", [0, 0, 0], [0, 1.2, 0], 0.02, colors.teal);
kit.beam(stage, "/World/Rig/AxisZ", [0, 0, 0], [0, 0, 1.2], 0.02, colors.blue);

print(await rig.GetPrim().GetAttribute("xformOp:transform").GetValueString());`,
  },
  {
    title: "Animated Radius",
    group: "Animation",
    code: `// Make a sphere beat like a heart by keying its radius. The points behind it
// plot the keyed values; USD interpolates the radius between them as the timeline plays.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/animated-radius.usda");
stage.SetUpAxis("Y");
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(49);   // a two-second loop at 24 fps: frame 49 repeats frame 1

const sphere = UsdGeom.Sphere.Define(stage, "/World/Pulse");
const radius = sphere.CreateRadiusAttr(0.72);   // the default value, used when no time is given
// [frame, radius]: a strong beat, a softer echo, then a slow rest. The rest keys
// on either side of the loop seam lie on one line, so the wrap keeps its speed.
const keys = [[1, 0.72], [9, 0.7], [13, 1.3], [17, 0.88], [20, 1.06], [26, 0.7], [41, 0.74], [49, 0.72]];
for (const [frame, value] of keys) radius.Set(value, frame);
kit.color(sphere, colors.coral);
kit.pose(stage, sphere, [0, 1.4, 0]);

// The largest keyed radius as a ring around the pulse, over a plate it never touches...
kit.torus(stage, "/World/PeakRadius", [0, 1.4, 0], 1.34, 0.03, colors.gold, "y");
kit.lathe(stage, "/World/Plate", [0, 0, 0], [[0.01, 0], [0.95, 0], [0.9, 0.06], [0.01, 0.06]], colors.ink);
// ...and the keys plotted behind it like a curve editor: x is time, y is radius.
const plot = ([frame, value]) => [-1.6 + (frame - 1) / 48 * 3.2, 0.75 + (value - 0.7) * 1.6, -1.9];
kit.box(stage, "/World/Graph/Backdrop", [0, 1.15, -1.98], [3.6, 1.4, 0.05], colors.ink);
kit.beams(stage, "/World/Graph/Curve", keys.slice(1).map((key, i) => [plot(keys[i]), plot(key)]), 0.022, colors.cream);
kit.spheres(stage, "/World/Graph/Keys", keys.map(plot), 0.06, colors.gold);

print(await sphere.GetPrim().GetAttribute("radius").GetValueStringAtTime(24));`,
  },
  {
    title: "Animated Transform",
    group: "Animation",
    code: `// Tumble a cube along the track and back by keying its translation and rotation.
// The viewer plays these time samples; no JavaScript render loop moves the cube.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/animated-transform.usda");
stage.SetUpAxis("Y");
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(97);   // a four-second loop at 24 fps: frame 97 repeats frame 1

const size = 0.8, half = size / 2, rail = -0.4;   // the cube rests on the rails
const cube = UsdGeom.Cube.Define(stage, "/World/MovingCube");
cube.CreateSizeAttr(size);
kit.color(cube, colors.coral);
// Op order matters: rotate about the cube's centre, then move that centre.
const translate = cube.AddTranslateOp();
const rotate = cube.AddRotateXYZOp();

// A cube rolls by tipping over its leading bottom edge. Each roll turns it a
// quarter turn and moves it one cube width, easing in and settling flat.
function rollPose(start, direction, amount) {
  const eased = amount * amount * (3 - 2 * amount);
  const angle = -direction * eased * Math.PI / 2;            // clockwise when rolling toward +X
  const pivot = [start + direction * half, rail];
  const [x, y] = [-direction * half, half];                  // centre relative to the pivot
  const round = (value) => Math.round(value * 1e6) / 1e6;
  return {
    center: [round(pivot[0] + x * Math.cos(angle) - y * Math.sin(angle)), round(pivot[1] + x * Math.sin(angle) + y * Math.cos(angle)), 0],
    degrees: round(angle * 180 / Math.PI),
  };
}
// Choreography in frames: pause, five rolls to the gate, pause, five rolls back.
// Both ends are at rest, so the loop wraps without a jump in position or speed.
const rolls = 5, framesPerRoll = 8, startX = -2;
function poseAt(frame) {
  let t = frame - 1, x = startX, turned = 0;
  const legs = [[4, 0], [rolls * framesPerRoll, 1], [8, 0], [rolls * framesPerRoll, -1], [4, 0]];
  for (const [frames, direction] of legs) {
    const done = Math.min(t, frames); t -= done;
    if (!direction) continue;
    const progress = done / framesPerRoll, whole = Math.floor(Math.min(progress, rolls - 1e-9));
    const roll = rollPose(x + direction * whole * size, direction, Math.min(1, progress - whole));
    if (t <= 0) return { center: roll.center, degrees: turned + direction * -90 * whole + roll.degrees };
    x += direction * rolls * size; turned += direction * -90 * rolls;
  }
  return { center: [x, rail + half, 0], degrees: turned };
}
for (let frame = 1; frame <= 97; frame++) {
  const pose = poseAt(frame);
  translate.Set(Gf.Vec3d(...pose.center), frame);
  rotate.Set(Gf.Vec3f(0, 0, pose.degrees), frame);
}
// Default values for still previews: frame 25, tipped onto an edge mid-track.
const still = poseAt(25);
translate.Set(Gf.Vec3d(...still.center));
rotate.Set(Gf.Vec3f(0, 0, still.degrees));

// A short rail track, with an arch the cube rolls under before it turns back.
kit.box(stage, "/World/Track/Bed", [0, -0.55, 0], [5.5, 0.1, 1.1], colors.ink);
const sleepers = Array.from({length: 9}, (_, i) => [[-2.4 + i * 0.6, -0.47, 0], [0.09, 0.05, 1]]);
kit.boxes(stage, "/World/Track/Sleepers", sleepers, colors.cream);
for (const side of [-1, 1]) {
  kit.beam(stage, "/World/Track/Rail" + (side < 0 ? "Left" : "Right"), [-2.6, -0.43, side * 0.4], [2.6, -0.43, side * 0.4], 0.03, colors.gold);
}
// A rolling cube's corners sweep up to size * sqrt(2) above the rail, so the arch clears that.
kit.group(stage, "/World/Track/FinishGate", [2, rail, 0], [0, 90, 0]);
kit.torus(stage, "/World/Track/FinishGate/Hoop", [0, 0, 0], 1.25, 0.05, colors.teal, "z", 0.5);
kit.boxes(stage, "/World/Track/FinishGate/Feet", [-1, 1].map((side) => [[side * 1.25, -0.08, 0], [0.24, 0.16, 0.24]]), colors.teal);

print((await cube.GetPrim().GetAttribute("xformOp:translate").GetTimeSamples()).size());`,
  },
  {
    title: "Shader Color Inputs",
    group: "Scene Building",
    code: `// Give two links separate surface colours, then read their shader inputs back.
// A Material connects each link to its shader through the surface output.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/shader-color-inputs.usda");
stage.SetUpAxis("Y");
const red = UsdShade.Shader.Define(stage, "/World/Looks/Red/PreviewSurface");
const blue = UsdShade.Shader.Define(stage, "/World/Looks/Blue/PreviewSurface");

red.CreateIdAttr("UsdPreviewSurface");
blue.CreateIdAttr("UsdPreviewSurface");
red.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(1, 0.05, 0.05));
blue.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.05, 0.2, 1));

// Wrap each shader in a Material whose surface output reads the shader's output.
function materialFor(shader, path) {
  shader.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.25);
  const material = UsdShade.Material.Define(stage, path);
  material.CreateSurfaceOutput().ConnectToSource(shader.CreateOutput("surface", Sdf.ValueTypeNames.Token));
  return material;
}
const redMaterial = materialFor(red, "/World/Looks/Red");
const blueMaterial = materialFor(blue, "/World/Looks/Blue");

// Two interlocking chain links, one per material.
kit.bind(kit.torus(stage, "/World/RedLink", [-0.65, 0, 0], 1, 0.24, colors.coral), redMaterial);
kit.bind(kit.torus(stage, "/World/BlueLink", [0.65, 0, 0], 1, 0.24, colors.blue, "y"), blueMaterial);

print(await stage.ExportToString());`,
  },
  {
    title: "Visibility",
    group: "Inspection",
    code: `// visibility is inherited: "invisible" hides a prim and all of its descendants.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/visibility.usda");
stage.SetUpAxis("Y");
const shown = UsdGeom.Cube.Define(stage, "/World/VisibleCube");
const hidden = UsdGeom.Sphere.Define(stage, "/World/HiddenSphere");

shown.MakeVisible();
hidden.MakeInvisible();

kit.pose(stage, shown, [-0.95, 0.55, 0], [0.55, 0.55, 0.55], [0, 25, 0]);
kit.color(shown, colors.teal);
kit.pose(stage, hidden, [0.95, 0.75, 0], [0.75, 0.75, 0.75]);
kit.color(hidden, colors.coral);

// A dotted outline marks where the hidden sphere still exists in the scene graph.
const dots = Array.from({length: 16}, (_, i) => {
  const angle = i * 2 * Math.PI / 16;
  return [0.95 + 0.75 * Math.cos(angle), 0.75 + 0.75 * Math.sin(angle), 0];
});
kit.spheres(stage, "/World/HiddenOutline", dots, 0.045, colors.gold);
kit.box(stage, "/World/Stage", [0, -0.06, 0], [3.8, 0.12, 1.4], colors.ink);

print(await Promise.all(listPrims(stage).map((path) => inspectPrim(stage.GetPrimAtPath(path)))));`,
  },
  {
    title: "Purpose",
    group: "Inspection",
    code: `// Purpose picks a representation: "render" geometry is the detailed final
// look, "proxy" is a light stand-in for interactive work. Viewers choose which to draw.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/purpose.usda");
stage.SetUpAxis("Y");
const renderMesh = UsdGeom.Cube.Define(stage, "/World/RenderMesh");
const proxyMesh = UsdGeom.Cube.Define(stage, "/World/ProxyMesh");

renderMesh.CreatePurposeAttr(UsdGeom.Tokens.render);
proxyMesh.CreatePurposeAttr(UsdGeom.Tokens.proxy);

// The render crate carries banding and corner posts; the proxy is one plain
// box with the same outer bounds. A size-2 cube spans -1..1 before scaling.
kit.pose(stage, renderMesh, [-0.9, 0, 0], [0.48, 0.68, 0.48]);
kit.color(renderMesh, colors.coral);
const trim = [];
for (const y of [-0.45, 0, 0.45]) trim.push([[-0.9, y, 0], [1.02, 0.1, 1.02]]);
for (const x of [-1, 1]) for (const z of [-1, 1]) trim.push([[-0.9 + x * 0.45, 0, z * 0.45], [0.14, 1.4, 0.14]]);
const detail = kit.boxes(stage, "/World/RenderDetail", trim, colors.cream);
kit.attr(detail, "purpose", "token", UsdGeom.Tokens.render);
kit.pose(stage, proxyMesh, [0.9, 0, 0], [0.51, 0.7, 0.51]);
kit.color(proxyMesh, colors.teal);

// The plinth keeps the default purpose: it belongs to neither representation.
kit.box(stage, "/World/Plinth", [0, -0.76, 0], [3.2, 0.12, 1.5], colors.ink);

print(await stage.ExportToString());`,
  },
  {
    title: "Custom Properties",
    group: "Authoring",
    code: `// Store an approval flag on a tool case and use it to choose the status-lamp
// colour. The userProperties: namespace keeps this pipeline data separate from geometry.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/custom-properties.usda");
stage.SetUpAxis("Y");
const prim = stage.DefinePrim("/World/Asset", "Xform");

prim.CreateAttribute("userProperties:assetId", Sdf.ValueTypeNames.String, true).Set("asset-042");
prim.CreateAttribute("userProperties:massKg", Sdf.ValueTypeNames.Float, true).Set(12.5);
prim.CreateAttribute("userProperties:approved", Sdf.ValueTypeNames.Bool, true).Set(true);

// Read the approval as a boolean and use it to choose the status-lamp colour.
const approved = await prim.GetAttribute("userProperties:approved").Get();

// A tool case; its parts are children of /World/Asset and share its turn.
kit.pose(stage, prim, [0, 0, 0], [1, 1, 1], [0, 15, 0]);
kit.box(stage, "/World/Asset/Case", [0, 0.6, 0], [2, 1.2, 1], colors.coral);
kit.box(stage, "/World/Asset/Seam", [0, 0.95, 0], [2.04, 0.08, 1.04], colors.ink);
kit.torus(stage, "/World/Asset/Handle", [0, 1.2, 0], 0.36, 0.06, colors.gold, "z", 0.5);
for (const x of [-0.65, 0.65]) {
  kit.box(stage, "/World/Asset/Latch" + (x < 0 ? "Left" : "Right"), [x, 0.95, 0.52], [0.18, 0.26, 0.06], colors.cream);
}
kit.sphere(stage, "/World/Asset/StatusLamp", [0, 0.6, 0.52], 0.11, approved ? colors.teal : colors.coral);

print(await inspectPrim(prim));`,
  },
  {
    title: "Relationships",
    group: "Authoring",
    code: `// Link a controller to two receivers with a relationship. Reading its targets
// back tells us which receivers need a visible cable, without duplicating that list.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/relationships.usda");
stage.SetUpAxis("Y");
const controller = stage.DefinePrim("/World/Controller", "Xform");
stage.DefinePrim("/World/TargetA", "Xform");
stage.DefinePrim("/World/TargetB", "Xform");

const rel = controller.CreateRelationship("targets", true);
rel.AddTarget("/World/TargetA");
rel.AddTarget("/World/TargetB");

// Give every prim a shape, then draw the links by reading the targets back.
const hub = [0, 1.4, 0];
kit.sphere(stage, "/World/Controller/Hub", hub, 0.45, colors.gold);
kit.torus(stage, "/World/Controller/Halo", hub, 0.68, 0.05, colors.cream, "y");
const receivers = {
  "/World/TargetA": { position: [-1.6, 0.4, 0.3], color: colors.teal },
  "/World/TargetB": { position: [1.6, 0.5, -0.3], color: colors.violet },
};
kit.box(stage, "/World/TargetA/Receiver", receivers["/World/TargetA"].position, [0.8, 0.8, 0.8], colors.teal, [0, 25, 0]);
kit.sphere(stage, "/World/TargetB/Receiver", receivers["/World/TargetB"].position, 0.5, colors.violet);
vectorToArray(rel.GetTargets()).forEach((target, i) => {
  kit.beam(stage, "/World/Link" + i, hub, receivers[target].position, 0.05, receivers[target].color);
});
kit.box(stage, "/World/Floor", [0, -0.06, 0], [4.4, 0.12, 1.8], colors.ink);

print(vectorToArray(rel.GetTargets()));`,
  },
  {
    title: "Preview Material",
    group: "Materials",
    code: `// A polished pitcher and a matte slate need different surfaces. Each Material
// exposes a surface output connected to the shader that computes that appearance.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/preview-material.usda");
stage.SetUpAxis("Y");
const material = UsdShade.Material.Define(stage, "/World/Looks/Gold");
const shader = UsdShade.Shader.Define(stage, "/World/Looks/Gold/PreviewSurface");

shader.CreateIdAttr("UsdPreviewSurface");
shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(1.0, 0.72, 0.2));
shader.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(1.0);
shader.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.28);
const surfaceOutput = shader.CreateOutput("surface", Sdf.ValueTypeNames.Token);
material.CreateSurfaceOutput().ConnectToSource(surfaceOutput);

// A polished pitcher and its handle share the gold; the slate stays matte.
const pitcherProfile = [[0.01, -1], [0.6, -1], [0.8, -0.6], [0.65, 0.2], [0.3, 0.65], [0.4, 1], [0.32, 1.05]];   // [radius, height]
kit.bind(kit.lathe(stage, "/World/Pitcher", [0, 0, 0], pitcherProfile, colors.gold), material);
kit.bind(kit.torus(stage, "/World/Handle", [0.7, 0.1, 0], 0.5, 0.085, colors.gold), material);
kit.box(stage, "/World/Slate", [0, -1.09, 0], [2.1, 0.18, 1.8], colors.ink, [0, 20, 0]);

print(await stage.ExportToString());`,
  },
  {
    title: "Bind Material",
    group: "Materials",
    code: `// Bind a painted box and the paint inside its can to the same Material.
// Updating that material changes both surfaces while their geometry stays independent.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/bind-material.usda");
stage.SetUpAxis("Y");
const cube = UsdGeom.Cube.Define(stage, "/World/Box");
const material = UsdShade.Material.Define(stage, "/World/Looks/BluePaint");
const shader = UsdShade.Shader.Define(stage, "/World/Looks/BluePaint/PreviewSurface");

shader.CreateIdAttr("UsdPreviewSurface");
shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.1, 0.25, 1));
const surfaceOutput = shader.CreateOutput("surface", Sdf.ValueTypeNames.Token);
material.CreateSurfaceOutput().ConnectToSource(surfaceOutput);
// Apply the schema before binding: the relationship alone is not the API.
cube.GetPrim().ApplyAPI("MaterialBindingAPI");
UsdShade.MaterialBindingAPI(cube).Bind(material);

// The freshly painted box beside an open can; the paint inside uses the same material.
kit.pose(stage, cube, [-0.6, 0.05, 0], [0.55, 0.55, 0.55], [0, 25, 0]);
kit.lathe(stage, "/World/PaintCan", [0.95, -0.5, 0.25], [[0.01, 0], [0.46, 0], [0.46, 0.95], [0.42, 0.95], [0.42, 0.1]], colors.cream);
kit.torus(stage, "/World/PaintCanRim", [0.95, 0.45, 0.25], 0.44, 0.03, colors.gold, "y");
kit.bind(kit.lathe(stage, "/World/Paint", [0.95, -0.5, 0.25], [[0.01, 0.82], [0.43, 0.82]], colors.blue), material);
kit.box(stage, "/World/DropCloth", [0.1, -0.53, 0.1], [3.2, 0.06, 2.1], colors.cream);
kit.bind(kit.box(stage, "/World/Drip", [0.35, -0.49, 0.75], [0.9, 0.02, 0.22], colors.blue, [0, -20, 0]), material);

print(cube.GetPrim().GetRelationship("material:binding").GetTargets().get(0));`,
  },
  {
    title: "Texture Shader Network",
    group: "Materials",
    code: `// A textured material is a small shader network:
// primvar reader (UVs) -> UsdUVTexture -> UsdPreviewSurface -> Material.
const kit = sceneHelpers, colors = kit.colors;
stage = await openFixture("MaterialX Texture + Noise");
const material = UsdShade.Material.Define(stage, "/World/Looks/Textured");
const surface = UsdShade.Shader.Define(stage, "/World/Looks/Textured/PreviewSurface");
const texture = UsdShade.Shader.Define(stage, "/World/Looks/Textured/DiffuseTexture");
const uv = UsdShade.Shader.Define(stage, "/World/Looks/Textured/UVReader");
surface.CreateIdAttr("UsdPreviewSurface");
texture.CreateIdAttr("UsdUVTexture");
uv.CreateIdAttr("UsdPrimvarReader_float2");

// 1. Read the "st" texture coordinates from the mesh.
uv.CreateInput("varname", Sdf.ValueTypeNames.Token).Set("st");
const uvOutput = uv.CreateOutput("result", "float2");
// 2. Sample the image at those coordinates. The path resolves next to the fixture layer.
texture.CreateInput("st", "float2").ConnectToSource(uvOutput);
texture.CreateInput("file", Sdf.ValueTypeNames.Asset).Set("textures/checker.png");
texture.CreateInput("sourceColorSpace", Sdf.ValueTypeNames.Token).Set("sRGB");
const textureRgb = texture.CreateOutput("rgb", Sdf.ValueTypeNames.Color3f);
// 3. Feed the texture colour into the surface, and the surface into the material.
surface.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(textureRgb);
surface.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.35);
const surfaceOutput = surface.CreateOutput("surface", Sdf.ValueTypeNames.Token);
material.CreateSurfaceOutput().ConnectToSource(surfaceOutput);

// Rebind the fixture's quad (replacing its MaterialX binding) and frame it as a sign.
const quad = stage.GetPrimAtPath("/World/TexturedQuad");
kit.bind(quad, material);
kit.pose(stage, quad, [0, 0.2, 0], [0.75, 1.2, 1]);
for (const x of [-1.05, 1.05]) kit.box(stage, "/World/Sign/Side" + (x < 0 ? "Left" : "Right"), [x, 0.2, 0], [0.16, 2.25, 0.24], colors.coral);
kit.box(stage, "/World/Sign/Top", [0, 1.3, 0], [2.3, 0.16, 0.24], colors.coral);
kit.beam(stage, "/World/Sign/Pole", [0, -0.7, 0], [0, -2, 0], 0.09, colors.ink);
kit.torus(stage, "/World/Sign/Foot", [0, -2, 0], 0.65, 0.09, colors.teal, "y");

print(await stage.ExportToString());`,
  },
  {
    title: "Variant Set",
    group: "Composition",
    code: `// Offer a sphere and a cube at the same prim path. The selected shape variant
// determines its type and size; switching variants keeps the surrounding stand.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/variant-set.usda");
stage.SetUpAxis("Y");
const model = UsdGeom.Xform.Define(stage, "/World/Model").GetPrim();
const variants = model.GetVariantSets().AddVariantSet("shape");

variants.AddVariant("sphere");
variants.AddVariant("cube");
// Both variants define /World/Model/Geom, each with a different schema type.
await kit.withVariant(stage, variants, "sphere", () => {
  UsdGeom.Sphere.Define(stage, "/World/Model/Geom").CreateRadiusAttr(0.9);
});
await kit.withVariant(stage, variants, "cube", () => {
  UsdGeom.Cube.Define(stage, "/World/Model/Geom").CreateSizeAttr(1.4);
});
await variants.SetVariantSelection("cube");

// The chosen shape rests in a socket between the two option tokens.
kit.color(stage.GetPrimAtPath("/World/Model/Geom"), colors.coral);
kit.torus(stage, "/World/ChoiceSocket", [0, -0.85, 0], 1, 0.16, colors.ink, "y");
kit.beam(stage, "/World/SphereOptionStem", [-1.8, -0.85, 0], [-1.8, 0.8, 0], 0.06, colors.teal);
kit.sphere(stage, "/World/SphereOption", [-1.8, 1.1, 0], 0.28, colors.teal);
kit.beam(stage, "/World/CubeOptionStem", [1.8, -0.85, 0], [1.8, 0.8, 0], 0.06, colors.gold);
kit.box(stage, "/World/CubeOption", [1.8, 1.1, 0], [0.48, 0.48, 0.48], colors.gold, [0, 25, 0]);

print({ selection: variants.GetVariantSelection(), names: variants.GetVariantNames() });`,
  },
  {
    title: "Variant Switch",
    group: "Composition",
    code: `const kit = sceneHelpers;
const colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/variant-switch.usda");
stage.SetUpAxis("Y");
const product = stage.DefinePrim("/World/Product", "Xform");
const look = product.GetVariantSets().AddVariantSet("look");

// Author each look inside its variant edit target. Definitions, colours and
// transforms then switch together, without leaving stronger values on the root.
for (const [name, color, scale] of [
  ["warm", colors.coral, [0.9, 1.25, 0.75]],
  ["cool", colors.blue, [1.05, 0.85, 1.05]],
]) {
  look.AddVariant(name);
  const path = "/World/Product/" + (name === "warm" ? "WarmSwatch" : "CoolSwatch");
  await kit.withVariant(stage, look, name, () => {
  const swatch = stage.DefinePrim(path, "Sphere");
  swatch.CreateAttribute("userProperties:look", Sdf.ValueTypeNames.Token, true).Set(name);
  kit.color(swatch, color);
  kit.pose(stage, swatch, [0, 0, 0], scale);
  });
}

// The collar and crown are shared: they remain outside the variant set.
kit.torus(stage, "/World/Product/Collar", [0, -0.85, 0], 0.7, 0.12, colors.ink, "y");
kit.torus(stage, "/World/Product/Crown", [0, 0.9, 0], 0.62, 0.07, colors.gold, "y");
kit.sphere(stage, "/World/WarmChip", [-1.6, -0.4, 0], 0.3, colors.coral);
kit.sphere(stage, "/World/CoolChip", [1.6, -0.4, 0], 0.3, colors.blue);

await look.SetVariantSelection("cool");
print(await stage.GetPrimAtPath("/World/Product/CoolSwatch").GetAttribute("userProperties:look").GetValueString());
await look.SetVariantSelection("warm");
print(await stage.GetPrimAtPath("/World/Product/WarmSwatch").GetAttribute("userProperties:look").GetValueString());`,
  },
  {
    title: "Payload",
    group: "Composition",
    code: `// Deliver a sphere into a shipping crate through a payload. The holder owns
// placement and local overrides; the payload keeps the delivered asset in its own file.
const kit = sceneHelpers, colors = kit.colors;
const payloadStage = Usd.Stage.CreateNew("/tmp/payload-asset.usda");
payloadStage.DefinePrim("/PayloadRoot", "Xform");
payloadStage.DefinePrim("/PayloadRoot/Sphere", "Sphere");
await payloadStage.Export("/tmp/payload-asset.usda");

stage = Usd.Stage.CreateNew("/tmp/payload-root.usda");
stage.SetUpAxis("Y");
const holder = stage.DefinePrim("/World/PayloadHolder", "Xform");
await holder.GetPayloads().AddPayload("payload-asset.usda", "/PayloadRoot");

// The payload's sphere now appears under the holder; colour it from the root layer.
kit.color(stage.GetPrimAtPath("/World/PayloadHolder/Sphere"), colors.gold);

// A shipping-crate frame around the delivered content: the cube's 12 edges.
const s = 1.3;
const edges = [];
for (const a of [-s, s]) for (const b of [-s, s]) {
  edges.push([[-s, a, b], [s, a, b]], [[a, -s, b], [a, s, b]], [[a, b, -s], [a, b, s]]);
}
kit.beams(stage, "/World/Crate/Edges", edges, 0.07, colors.teal);

print(await inspectPrim(holder));`,
  },
  {
    title: "Payload Load State",
    group: "Composition",
    code: `// Unload the drawer's payload and inspect the remaining holder, then load it
// again. Unloading removes the payload's composed contents while keeping the arc.
const kit = sceneHelpers, colors = kit.colors;
const payloadStage = Usd.Stage.CreateNew("/tmp/payload-load-asset.usda");
payloadStage.DefinePrim("/PayloadRoot", "Xform");
payloadStage.DefinePrim("/PayloadRoot/Cube", "Cube");
await payloadStage.Export("/tmp/payload-load-asset.usda");

stage = Usd.Stage.CreateNew("/tmp/payload-load.usda");
stage.SetUpAxis("Y");
const holder = stage.DefinePrim("/World/Holder", "Xform");
await holder.GetPayloads().AddPayload("payload-load-asset.usda", "/PayloadRoot");

// The loaded cube sits in an open drawer that "stores" the payload.
const cube = stage.GetPrimAtPath("/World/Holder/Cube");
kit.pose(stage, cube, [0, 0, 0], [0.55, 0.55, 0.55], [0, 30, 0]);
kit.color(cube, colors.coral);
kit.box(stage, "/World/Drawer/Bottom", [0, -0.62, 0.3], [2.2, 0.15, 2.4], colors.ink);
kit.box(stage, "/World/Drawer/Front", [0, -0.35, 1.5], [2.2, 0.7, 0.12], colors.teal);
kit.torus(stage, "/World/Drawer/Pull", [0, -0.3, 1.6], 0.23, 0.045, colors.gold);
kit.box(stage, "/World/Drawer/Back", [0, 0, -1.25], [2.4, 1.8, 0.2], colors.cream);

print({ before: holder.IsLoaded() });
holder.Unload();
print({ unloaded: holder.IsLoaded() });
holder.Load();
print({ loaded: holder.IsLoaded() });`,
  },
  {
    title: "Open Text Layer",
    group: "Composition",
    code: `// Open a small USDA document from text. This is useful for imported snippets:
// write the text into the virtual filesystem, then let USD parse and compose it.
const kit = sceneHelpers, colors = kit.colors;
mountText("/tmp/from-text.usda", \`#usda 1.0

def Xform "World"
{
    def Sphere "Loaded"
    {
        double radius = 2
    }
}
\`);

stage = await Usd.Stage.Open("/tmp/from-text.usda");
stage.SetUpAxis("Y");

// The loaded sphere becomes a marble resting on an open book.
const marble = stage.GetPrimAtPath("/World/Loaded");
kit.pose(stage, marble, [0.45, 0.8, 0.1], [0.12, 0.12, 0.12]);
kit.color(marble, colors.teal);
kit.beam(stage, "/World/Book/Spine", [0, 0, -1], [0, 0, 1], 0.09, colors.ink);
for (const side of [-1, 1]) {
  const name = side < 0 ? "Left" : "Right";
  kit.box(stage, "/World/Book/Cover" + name, [side * 0.7, 0.2, 0], [1.5, 0.08, 2.05], colors.coral, [0, 0, side * 22]);
  for (let page = 0; page < 5; page++) {
    kit.box(stage, "/World/Book/Page" + name + page, [side * 0.68, 0.27 + page * 0.025, 0], [1.4, 0.018, 1.9], colors.cream, [0, 0, side * (22 + page * 3)]);
  }
}
kit.mesh(stage, "/World/Book/FoldedCorner", [[0.9, 0.75, 0.7], [1.2, 0.86, 0.7], [1.2, 0.86, 0.35]], [3], [0, 1, 2], colors.gold);

print(listPrims(stage));`,
  },
  {
    title: "Referenced Layer",
    group: "Composition",
    code: `// Author one mushroom asset and reference it twice. Give the smaller copy a
// different cap colour through a local opinion, leaving the source asset intact.
const kit = sceneHelpers, colors = kit.colors;
const asset = Usd.Stage.CreateNew("/tmp/reference-base.usda");
UsdGeom.SetStageUpAxis(asset, UsdGeom.Tokens.y);
asset.DefinePrim("/Mushroom", "Xform");
const stem = asset.DefinePrim("/Mushroom/Stem", "Cylinder");
kit.attr(stem, "axis", "token", "Y");
kit.attr(stem, "height", "double", 0.8);
kit.attr(stem, "radius", "double", 0.16);
kit.color(stem, colors.cream);
kit.pose(asset, stem, [0, 0.4, 0]);
kit.sphere(asset, "/Mushroom/Cap", [0, 0.8, 0], 0.5, colors.coral, [1, 0.55, 1]);
asset.GetRootLayer().Export("/tmp/reference-base.usda");

// Reference the same mushroom at two paths. Each holder can place its own
// copy and override properties without changing the source asset.
stage = Usd.Stage.CreateNew("/tmp/reference-root.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
await stage.DefinePrim("/World", "Xform").GetReferences().AddReference("reference-base.usda", "/Mushroom");
await stage.DefinePrim("/World/Neighbour", "Xform").GetReferences().AddReference("reference-base.usda", "/Mushroom");

// Local opinions in the root layer are stronger than referenced ones: the
// neighbour gets its own place, size and cap colour without editing the asset.
kit.pose(stage, stage.GetPrimAtPath("/World/Neighbour"), [0.95, 0, 0.4], [0.62, 0.62, 0.62], [0, 30, 0]);
kit.color(stage.GetPrimAtPath("/World/Neighbour/Cap"), colors.gold);
kit.lathe(stage, "/World/Moss", [0.35, 0, 0.15], [[0.01, -0.08], [1.5, -0.08], [1.35, 0.01], [0.01, 0.04]], [0.3, 0.5, 0.32]);

print(await inspectPrim(stage.GetPrimAtPath("/World")));`,
  },
  {
    title: "Layer Stack",
    group: "Inspection",
    code: `// Read the stage's local layer stack and draw one slab per layer. The session
// layer holds temporary opinions above the root; referenced layers are listed separately.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/layer-stack.usda");
stage.SetUpAxis("Y");
stage.DefinePrim("/World", "Xform");

// One slab per layer, fanned like a deck of cards; the opinion rests on top.
const layers = stage.GetLayerStack(true);
layers.forEach((layer, i) => {
  const slab = kit.box(stage, "/World/Layers/Layer" + i, [i * 0.25, i * 0.55, 0], [2.8, 0.18, 1.8], i ? colors.teal : colors.ink, [0, i * 12, 0]);
  kit.attr(slab, "userProperties:identifier", "string", layer.identifier);
});
kit.box(stage, "/World/Opinion", [0.25, 0.94, 0], [0.8, 0.6, 0.8], colors.coral, [0, 24, 0]);
kit.beam(stage, "/World/StackPin", [-1.1, -0.2, 0.5], [-1.1, 1.5, 0.5], 0.045, colors.gold);

print(stage.GetLayerStack(true).map((layer) => ({
  identifier: layer.identifier,
  displayName: layer.displayName,
  realPath: layer.realPath,
})));`,
  },
  {
    title: "Used Layers",
    group: "Inspection",
    code: `// Reference a library layer, then list the layers used to compose the stage.
// Each book is labelled with one layer's name, including the referenced file.
const kit = sceneHelpers, colors = kit.colors;
const asset = Usd.Stage.CreateNew("/tmp/used-base.usda");
const base = asset.DefinePrim("/Library", "Scope");
asset.GetRootLayer().Export("/tmp/used-base.usda");
stage = Usd.Stage.CreateNew("/tmp/used-root.usda");
stage.SetUpAxis("Y");
const world = stage.DefinePrim("/World", "Xform");
await world.GetReferences().AddReference("used-base.usda", "/Library");

// One book per used layer on a shelf, each tagged with its layer name.
const used = stage.GetUsedLayers(false);
used.forEach((layer, i) => {
  const x = (i - (used.length - 1) / 2) * 1.4;
  const book = kit.box(stage, "/World/Library/Volume" + i, [x, 0, 0], [0.8, 1.8, 1.1], i % 2 ? colors.teal : colors.coral, [0, 0, i * 8 - 4]);
  kit.attr(book, "userProperties:layer", "string", layer.displayName);
  for (let band = 0; band < 3; band++) {
    kit.box(stage, "/World/Library/Band" + i + "_" + band, [x, -0.5 + band * 0.5, 0.57], [0.82, 0.045, 0.03], colors.gold);
  }
});
kit.box(stage, "/World/Shelf", [0, -1.05, 0], [used.length * 1.4, 0.12, 1.4], colors.ink);

print(stage.GetUsedLayers(false).map((layer) => layer.displayName));`,
  },
  {
    title: "Traverse",
    group: "Inspection",
    code: `// Draw the prim hierarchy as a tree. Traversal visits parents before children,
// letting each node find its parent's position before drawing the connecting branch.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/traverse.usda");
stage.SetUpAxis("Y");
stage.DefinePrim("/World", "Xform");
stage.DefinePrim("/World/A", "Sphere");
stage.DefinePrim("/World/B", "Cube");
stage.DefinePrim("/World/B/Child", "Scope");

// Record the traversal before adding diagram geometry, then lay out the tree:
// depth moves down a row, siblings spread out under their parent.
const order = listPrims(stage);
const layout = new Map();
for (const path of order) {
  const parent = stage.GetPrimAtPath(path).GetParent();
  const siblings = vectorToArray(parent.GetChildren()).map((child) => child.GetPath());
  const depth = path.split("/").length - 2;
  const parentX = layout.get(parent.GetPath())?.[0] ?? 0;
  layout.set(path, [parentX + (siblings.indexOf(path) - (siblings.length - 1) / 2) * 2.4, 2.4 - depth * 1.3, 0]);
}

// A and B are gprims, so they become their own nodes.
kit.pose(stage, stage.GetPrimAtPath("/World/A"), layout.get("/World/A"), [0.42, 0.42, 0.42]);
kit.color(stage.GetPrimAtPath("/World/A"), colors.teal);
kit.pose(stage, stage.GetPrimAtPath("/World/B"), layout.get("/World/B"), [0.36, 0.36, 0.36], [0, 20, 0]);
kit.color(stage.GetPrimAtPath("/World/B"), colors.coral);
// The Xform and the Scope draw nothing, so mark them with spheres in a separate tree.
kit.sphere(stage, "/Diagram/WorldNode", layout.get("/World"), 0.3, colors.gold);
kit.sphere(stage, "/Diagram/ChildNode", layout.get("/World/B/Child"), 0.24, colors.violet);
order.slice(1).forEach((path, i) => {
  const parentPath = path.slice(0, path.lastIndexOf("/"));
  kit.beam(stage, "/Diagram/Edge" + i, layout.get(parentPath), layout.get(path), 0.035, colors.cream);
});

print(order);`,
  },
  {
    title: "Property Names",
    group: "Inspection",
    code: `// A Sphere exposes schema properties even before we write values. The card
// catalogue lists them alongside authored properties; a listed name alone does not mean a value was authored.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/property-names.usda");
stage.SetUpAxis("Y");
const cube = UsdGeom.Cube.Define(stage, "/World/Cabinet");
cube.CreateSizeAttr(2);
cube.GetPrim().CreateAttribute("userProperties:label", Sdf.ValueTypeNames.String, true).Set("inspection target");
const names = vectorToArray(cube.GetPrim().GetPropertyNames());

// A card catalog with one drawer per property name, filed in three columns.
const columns = 3, rows = Math.ceil(names.length / columns), drawerHeight = 0.3;
const width = columns * 0.7 + 0.2, height = rows * drawerHeight + 0.2;
kit.pose(stage, cube, [0, height / 2, 0], [width / 2, height / 2, 0.45]);   // the size-2 cube spans -1..1
kit.color(cube, colors.ink);
names.forEach((name, i) => {
  const column = i % columns, row = Math.floor(i / columns);
  const center = [(column - (columns - 1) / 2) * 0.7, 0.1 + drawerHeight * (row + 0.5), 0.47];
  const drawer = kit.box(stage, "/World/Drawers/Drawer" + i, center, [0.62, drawerHeight - 0.05, 0.08], (row + column) % 2 ? colors.cream : colors.teal);
  kit.attr(drawer, "userProperties:propertyName", "string", name);
  kit.sphere(stage, "/World/Drawers/Knob" + i, [center[0], center[1], center[2] + 0.06], 0.035, colors.gold);
});

print(names);`,
  },
  {
    title: "Attribute Resolve Info",
    group: "Inspection",
    code: `// The sphere's radius is an authored default. Resolve info distinguishes it
// from a time sample or schema fallback when diagnosing where a value came from.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/resolve-info.usda");
stage.SetUpAxis("Y");
const sphere = UsdGeom.Sphere.Define(stage, "/World/Sphere");
sphere.CreateRadiusAttr(1.25);
const attr = sphere.GetPrim().GetAttribute("radius");

// A measuring gantry holds the sample; the gauge gets one tick per eighth of the radius.
kit.color(sphere, colors.coral);
kit.pose(stage, sphere, [0, 0.35, 0], [0.28, 0.28, 0.28]);
kit.box(stage, "/World/Probe/Foot", [0, -0.65, 0], [2.8, 0.16, 1.2], colors.ink);
for (const x of [-1, 1]) kit.box(stage, "/World/Probe/Column" + (x < 0 ? "Left" : "Right"), [x, 0.25, 0], [0.18, 1.7, 0.45], colors.teal);
kit.box(stage, "/World/Probe/Bridge", [0, 1.1, 0], [2.2, 0.22, 0.5], colors.teal);
kit.beam(stage, "/World/Probe/Stylus", [0, 0.7, 0], [0, 1.4, 0], 0.06, colors.gold);
kit.box(stage, "/World/Probe/Readout", [0.7, 1.4, 0], [0.65, 0.48, 0.2], colors.blue);
const measuredRadius = await attr.Get();
const gaugeTicks = Array.from({length: Math.round(measuredRadius * 8)}, (_, i) =>
  [[-0.8 + i * 0.17, -0.53, 0.35], [0.025, 0.025, i % 2 ? 0.12 : 0.24]]);
kit.boxes(stage, "/World/Probe/Ticks", gaugeTicks, colors.cream);

print({
  value: await attr.GetValueString(),
  resolve: await attr.GetResolveInfo(Usd.TimeCode.Default()),
});`,
  },
  {
    title: "Prim Stack",
    group: "Inspection",
    code: `// Write a source label in an asset, then override it in the referencing layer.
// The prim stack shows both specs in strength order, explaining why the root value wins.
const kit = sceneHelpers, colors = kit.colors;
const asset = Usd.Stage.CreateNew("/tmp/stack-base.usda");
const base = asset.DefinePrim("/Asset", "Xform");
base.CreateAttribute("userProperties:source", Sdf.ValueTypeNames.String, true).Set("base");
asset.GetRootLayer().Export("/tmp/stack-base.usda");
stage = Usd.Stage.CreateNew("/tmp/stack-root.usda");
stage.SetUpAxis("Y");
const world = stage.DefinePrim("/World", "Xform");
await world.GetReferences().AddReference("stack-base.usda", "/Asset");
world.CreateAttribute("userProperties:source", Sdf.ValueTypeNames.String, true).Set("root");
const specs = stage.GetPrimAtPath("/World").GetPrimStackWithLayerOffsets();

// Stack one disc per spec, weakest at the bottom, with the resolved prim on top.
const discColors = [colors.ink, colors.teal, colors.coral];
specs.slice().reverse().forEach((spec, i) => {
  const radius = 1.1 - i * 0.18, y = i * 0.3;
  const disc = kit.lathe(stage, "/World/Spec" + i, [i * 0.12, y, 0], [[0.01, 0], [radius, 0], [radius, 0.24], [0.01, 0.24]], discColors[i % discColors.length]);
  kit.attr(disc, "userProperties:layer", "string", spec.layer.displayName);
});
kit.sphere(stage, "/World/Resolved", [specs.length * 0.12, specs.length * 0.3 + 0.3, 0], 0.3, colors.gold);

print(specs);`,
  },
  {
    title: "Composition Arcs",
    group: "Inspection",
    code: `// Inspect how a reference brings /Asset into /World. Composition arcs record
// the source layer and prim path; the little aqueduct gives each arc its own arch.
const kit = sceneHelpers, colors = kit.colors;
const asset = Usd.Stage.CreateNew("/tmp/arcs-base.usda");
const base = asset.DefinePrim("/Asset", "Xform");
asset.GetRootLayer().Export("/tmp/arcs-base.usda");
stage = Usd.Stage.CreateNew("/tmp/arcs-root.usda");
stage.SetUpAxis("Y");
const world = stage.DefinePrim("/World", "Xform");
await world.GetReferences().AddReference("arcs-base.usda", "/Asset");
const arcs = stage.GetPrimAtPath("/World").GetCompositionArcs();

// A small aqueduct with one arch per composition arc.
const pierColors = [colors.teal, colors.coral, colors.blue, colors.gold];
for (let i = 0; i <= arcs.length; i++) {
  kit.box(stage, "/World/Pier" + i, [(i - arcs.length / 2) * 1.3, -0.7, 0], [0.35, 0.65, 0.8], pierColors[i % pierColors.length]);
}
arcs.forEach((arc, i) => {
  const x = (i - arcs.length / 2 + 0.5) * 1.3;
  kit.torus(stage, "/World/Arch" + i, [x, -0.4, 0], 0.65, 0.12, i % 2 ? colors.gold : colors.cream, "z", 0.5);
  kit.sphere(stage, "/World/Keystone" + i, [x, 0.38, 0], 0.13, colors.coral);
});

print(arcs);`,
  },
  {
    title: "Fixture: Unmaterialed Empty Subset",
    group: "Fixture Smoke",
    code: `// Load a triangle with no material and keep it unbound. A dark plinth makes
// the renderer's fallback surface visible, so an empty subset cannot hide a missing face.
const kit = sceneHelpers, colors = kit.colors;
stage = await openFixture("Unmaterialed Empty Subset");

// /World/PlainTriangle has no material binding and no displayColor, so every
// renderer draws it with its own fallback surface: a plain light grey. It is
// single-sided (doubleSided defaults to false) and faces up, the stage's +Z.
const triangle = stage.GetPrimAtPath("/World/PlainTriangle");
const hasBinding = triangle.GetRelationship("material:binding").IsValid();
const hasDisplayColor = triangle.GetAttribute("primvars:displayColor").HasAuthoredValueOpinion();

// A dark slate plinth under the triangle makes the pale fallback surface stand
// out. The helpers work in Y-up design space and convert to this Z-up stage.
kit.box(stage, "/World/Plinth", [0, -0.08, -0.55], [2.9, 0.12, 2.4], colors.ink);

// Outline the triangle with survey edges and corner markers.
const corners = [[-1, 0, 0], [1, 0, 0], [0, 0, -1.5]];
corners.forEach((corner, i) => {
  kit.beam(stage, "/World/Survey/Edge" + i, corner, corners[(i + 1) % 3], 0.035, colors.teal);
  kit.sphere(stage, "/World/Survey/Vertex" + i, corner, 0.09, colors.gold);
});

print({
  hasBinding,
  hasDisplayColor,
  mesh: await inspectPrim(triangle),
});`,
  },
  {
    title: "Fixture: Face-Varying Normals Matrix",
    group: "Fixture Smoke",
    code: `// Keep the fixture's authored points and normals; re-arrange its meshes on a rack.
const kit = sceneHelpers, colors = kit.colors;
stage = await openFixture("Face-Varying Normals Matrix");

// Read points as arrays of [x, y, z]. Their bounds tell us where to centre
// each authored mesh without changing its points or normal interpolation.
const cells = vectorToArray(stage.TraverseAll()).filter((prim) => prim.GetTypeName() === "Mesh");
for (const [i, cell] of cells.entries()) {
  // Centre each mesh in its rack slot using the middle of its point bounds.
  const points = await cell.GetAttribute("points").Get();
  const center = [0, 1, 2].map((axis) => {
    const coords = points.map(point => point[axis]);
    return (Math.min(...coords) + Math.max(...coords)) / 2;
  });
  const x = (i % 4 - 1.5) * 1.3, y = Math.floor(i / 4) * 1.4, scale = 0.32;
  kit.pose(stage, cell, [x - scale * center[0], y - scale * center[1], -scale * center[2]], [scale, scale, scale], [90, 0, 0]);
  kit.color(cell, i % 2 ? colors.coral : colors.teal);

  kit.box(stage, "/World/Rack/Back" + i, [x, y, -0.12], [1.12, 1.12, 0.12], colors.cream);
  for (const dx of [-0.59, 0.59]) {
    kit.beam(stage, "/World/Rack/Frame" + i + (dx < 0 ? "Left" : "Right"), [x + dx, y - 0.6, 0], [x + dx, y + 0.6, 0], 0.035, colors.ink);
  }
  // Draw the first authored normal as a short gold needle.
  const normals = cell.GetAttribute("primvars:normals");
  const normal = normals.IsValid() ? ((await normals.Get())?.[0] ?? []) : [];
  if (normal.length === 3) {
    const length = Math.hypot(...normal) || 1;
    kit.beam(stage, "/World/Rack/Normal" + i, [x, y, 0.15], [x + normal[0] / length * 0.4, y + normal[1] / length * 0.4, 0.15 + normal[2] / length * 0.4], 0.025, colors.gold);
  }
}

print(listPrims(stage).filter((path) => {
  return stage.GetPrimAtPath(path).GetTypeName() === "Mesh";
}));`,
  },
  {
    title: "Fixture: Parent Folder Reference",
    group: "Fixture Smoke",
    code: `// The fixture references a cube through a "../" asset path; it resolves relative to the layer.
const kit = sceneHelpers, colors = kit.colors;
stage = await openFixture("Parent Folder References");

kit.color(stage.GetPrimAtPath("/World/Shape"), colors.teal);
// A folder with a tab, and a link up to the shared asset in the parent folder.
kit.box(stage, "/World/ParentFolder", [0, -1.1, 0], [2.6, 0.12, 1.8], colors.gold);
kit.box(stage, "/World/ParentTab", [-0.7, -0.8, -0.85], [0.9, 0.5, 0.12], colors.gold);
kit.beam(stage, "/World/RelativeLink", [1.4, -0.9, 0], [1.4, 0.8, 0], 0.045, colors.coral);
kit.sphere(stage, "/World/SharedAsset", [1.4, 1.1, 0], 0.24, colors.coral);

print({
  usedLayers: stage.GetUsedLayers(false).map((layer) => layer.displayName),
  world: await inspectPrim(stage.GetPrimAtPath("/World")),
  referencedCube: await inspectPrim(stage.GetPrimAtPath("/World/Shape")),
});`,
  },
  {
    title: "Fixture: Payload Root",
    group: "Fixture Smoke",
    code: `// Payloads in a fixture load automatically when the stage opens.
const kit = sceneHelpers, colors = kit.colors;
stage = await openFixture("Payload Root");
const payloadPrim = stage.GetPrimAtPath("/World/PayloadHolder");

// A round container around the loaded payload: base rim, four ribs and a top rim.
kit.torus(stage, "/World/Container/Base", [0, -0.75, 0], 1.35, 0.15, colors.blue, "y");
for (let i = 0; i < 4; i++) {
  const angle = i * Math.PI / 2, x = 1.3 * Math.cos(angle), z = 1.3 * Math.sin(angle);
  kit.beam(stage, "/World/Container/Rib" + i, [x, -0.75, z], [x, 0.9, z], 0.055, colors.gold);
}
kit.torus(stage, "/World/Container/Top", [0, 0.9, 0], 1.3, 0.055, colors.gold, "y");

print({
  loaded: payloadPrim.IsLoaded(),
  prims: listPrims(stage),
});`,
  },
  {
    title: "Fixture: Native Instances",
    group: "Fixture Smoke",
    code: `// Native instancing: instanceable prims that reference the same source share
// one prototype. The fixture already has two instances of its /Prototype class.
const kit = sceneHelpers, colors = kit.colors;
stage = await openFixture("usd-concepts/native_instances.usda");

// All seven copies reference the same prim in this layer. Marking them
// instanceable lets USD share the prototype while keeping placement editable.
for (let i = 0; i < 7; i++) {
  const instance = stage.DefinePrim("/Spiral/Instance" + i, "Xform");
  await instance.GetReferences().AddReference("", "/Prototype");
  await instance.SetInstanceable(true);
}

// An instance root still takes ordinary local opinions: wind the copies up a spiral.
for (let i = 0; i < 7; i++) {
  const angle = i * 0.85;
  kit.pose(stage, stage.GetPrimAtPath("/Spiral/Instance" + i), [Math.cos(angle) * 1.2, 0.6 + i * 0.34, Math.sin(angle) * 1.2], [1, 1, 1], [0, -angle * 180 / Math.PI, 0]);
}
kit.beam(stage, "/Spiral/Spindle", [0, -0.5, 0], [0, 3, 0], 0.045, colors.gold);

print(listPrims(stage).map((path) => {
  const prim = stage.GetPrimAtPath(path);
  return { path, typeName: prim.GetTypeName(), instance: prim.IsInstance?.() ?? false };
}));`,
  },
  {
    title: "Fixture: Point Instancer",
    group: "Fixture Smoke",
    code: `// Arrange thirty copies along a rising spiral. Positions, prototype indices,
// scales and rotations use the same instance order; each index chooses a cube or sphere.
const kit = sceneHelpers, colors = kit.colors;
stage = await openFixture("usd-concepts/point_instancer.usda");
const scatter = stage.GetPrimAtPath("/World/Scatter");

// Rebuild the arrays: a rising spiral of 30 instances alternating between the
// cube (index 0) and sphere (index 1) prototypes, growing toward the top.
const count = 30, positions = [], protoIndices = [], scales = [];
for (let i = 0; i < count; i++) {
  const angle = i * 2.4, radius = 0.3 + Math.sqrt(i) * 0.22, size = 0.7 + 0.7 * i / count;
  positions.push(kit.point(stage, [Math.cos(angle) * radius, 0.12 * i, Math.sin(angle) * radius]));
  protoIndices.push(i % 2);
  scales.push([size, size, size]);
}
kit.attr(scatter, "positions", "point3f[]", positions);
kit.attr(scatter, "protoIndices", "int[]", protoIndices);
kit.attr(scatter, "scales", "float3[]", scales);

// Keep the rotation array aligned with the new positions. USD quaternions
// store the real component first; [1, 0, 0, 0] leaves a prototype unrotated.
scatter.GetAttribute("orientations").Set(Array.from({length: count}, () => [1, 0, 0, 0]));
kit.torus(stage, "/World/ScatterFoot", [0, -0.3, 0], 1.3, 0.055, colors.teal, "y");

print(await inspectPrim(stage.GetPrimAtPath("/World/Scatter")));`,
  },
  {
    title: "Fixture: Camera + Light",
    group: "Fixture Smoke",
    code: `// Re-aim the fixture's shot camera and retune one of its lights.
const kit = sceneHelpers, colors = kit.colors;
stage = await openFixture("Camera + Light");

// Camera prims are xformable and carry lens attributes such as focalLength.
// This fixture is Z-up, so the raw camera values below are in Z-up space.
const shot = stage.GetPrimAtPath("/World/ShotCam");
kit.attr(shot, "xformOp:translate", "double3", [5, -6, 3]);
kit.attr(shot, "xformOp:rotateXYZ", "float3", [70, 0, 40]);
kit.attr(shot, "xformOpOrder", "token[]", ["xformOp:translate", "xformOp:rotateXYZ"]);
kit.attr(shot, "focalLength", "float", 40);

// The fixture already has an orange key and a blue fill (SphereLights), a dim
// dome and an Xform with LightAPI applied. Its SunLight is unnormalized with
// intensity 10, which is the luminance of a tiny sun disc: almost no light.
// Turning on normalize makes intensity mean illuminance, so 2 is a soft sun.
const sun = stage.GetPrimAtPath("/World/SunLight");
kit.attr(sun, "inputs:normalize", "bool", true);
kit.attr(sun, "inputs:intensity", "float", 2);
kit.attr(sun, "inputs:color", "color3f", [1, 0.95, 0.88]);

// Stage a vessel next to the fixture's cube on a dark studio floor.
kit.pose(stage, stage.GetPrimAtPath("/World/LitCube"), [-0.6, 0.2, 0], [1, 1, 1], [0, 25, 0]);
kit.bind(kit.lathe(stage, "/World/LitVessel", [0.55, 0, 0], [[0.01, -0.4], [0.4, -0.4], [0.5, 0], [0.25, 0.6], [0.3, 0.9]], colors.cream), "/Looks/Neutral");
kit.box(stage, "/World/StudioFloor", [0, -0.55, 0], [2.8, 0.1, 1.8], colors.ink);

print({
  camera: await inspectPrim(shot),
  lights: await Promise.all(["KeyLight", "FillLight", "SunLight", "SkyLight", "ApiLight"].map(async (name) => {
    const light = stage.GetPrimAtPath("/World/" + name);
    return { name, type: light.GetTypeName(), intensity: await light.GetAttribute("inputs:intensity").GetValueString() };
  })),
});`,
    authoredLighting: true,
  },
  {
    title: "Fixture: MaterialX Texture + Noise",
    group: "Fixture Smoke",
    code: `// The fixture's MaterialX-bound quad stays as authored: stretch it on a loom.
const kit = sceneHelpers, colors = kit.colors;
stage = await openFixture("MaterialX Texture + Noise");

for (const x of [-1.4, 1.4]) kit.beam(stage, "/World/Loom/Post" + (x < 0 ? "Left" : "Right"), [x, -1.1, 0], [x, 1.1, 0], 0.055, colors.gold);
for (const y of [-0.95, 0.95]) kit.beam(stage, "/World/Loom/Rail" + (y < 0 ? "Bottom" : "Top"), [-1.4, y, 0], [1.4, y, 0], 0.06, colors.teal);
for (let i = 0; i < 9; i++) {
  const x = -1.1 + i * 0.275;
  kit.beam(stage, "/World/Loom/Fringe" + i, [x, -0.8, 0], [x, -1.15 - (i % 2) * 0.12, 0], 0.018, colors.cream);
}

print({
  fixture: findFixture("MaterialX Texture + Noise"),
  usedLayers: stage.GetUsedLayers(false).map((layer) => layer.displayName),
  prims: listPrims(stage),
});`,
  },
  {
    title: "Objects Changed",
    group: "Inspection",
    code: `// Listen for one size edit and inspect the paths in its notice. A real tool
// can refresh only the affected controls, then revoke the listener when it closes.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/notices.usda");
stage.SetUpAxis("Y");
const prim = stage.DefinePrim("/World/Thing", "Xform");
const notices = [];

// Listen, make one edit, give the notice a tick to arrive, then stop listening.
const listener = stage.RegisterObjectsChanged((notice) => notices.push(notice));
await prim.SetActive(false);
await new Promise((resolve) => setTimeout(resolve, 0));
stage.RevokeObjectsChanged(listener);

// The edit as a switch thrown off, a cable carrying the notice, and the
// listener as a bell that rings once. /World/Thing itself is now inactive.
kit.box(stage, "/World/Base", [0.05, -0.06, 0], [3.2, 0.12, 1.3], colors.ink);
kit.box(stage, "/World/Switch/Housing", [-1.05, 0.15, 0], [0.7, 0.3, 0.6], colors.blue);
kit.beam(stage, "/World/Switch/Lever", [-1.05, 0.3, 0], [-1.4, 0.82, 0], 0.045, colors.cream);
kit.sphere(stage, "/World/Switch/Knob", [-1.4, 0.82, 0], 0.1, colors.coral);
kit.beam(stage, "/World/Cable", [-0.7, 0.08, 0], [0.62, 0.08, 0], 0.03, colors.gold);
kit.lathe(stage, "/World/Listener/Bell", [1, 0, 0], [[0.01, 0], [0.42, 0], [0.42, 0.06], [0.34, 0.14], [0.24, 0.42], [0.2, 0.8], [0.1, 0.92], [0.01, 0.94]], colors.teal);
kit.sphere(stage, "/World/Listener/Clapper", [1, 1.02, 0], 0.07, colors.gold);
// Three arcs above the bell: a 72 degree sweep, turned to centre on the vertical.
kit.group(stage, "/World/Listener/Ring", [1, 0.55, 0], [0, 0, 54]);
for (let i = 0; i < 3; i++) kit.torus(stage, "/World/Listener/Ring/Wave" + i, [0, 0, 0], 0.62 + i * 0.22, 0.028, colors.gold, "z", 0.2);

print(notices);`,
  },
  {
    title: "Active State",
    group: "Authoring",
    code: `// Deactivating a prim removes it (and its children) from the composed stage
// without deleting its data.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/active-state.usda");
stage.SetUpAxis("Y");
const keep = stage.DefinePrim("/World/Keep", "Cube");
const mute = stage.DefinePrim("/World/Mute", "Cube");

await mute.SetActive(false);

// A switch panel: the active cube stands lit; the muted one leaves an empty slot.
kit.pose(stage, keep, [-0.65, 0, 0], [0.45, 0.7, 0.45]);
kit.color(keep, colors.teal);
kit.box(stage, "/World/SwitchBody", [0, -0.9, 0], [2.7, 0.25, 1.2], colors.ink);
kit.box(stage, "/World/MutedSlot", [0.85, -0.76, 0], [0.75, 0.04, 0.75], colors.cream);
kit.sphere(stage, "/World/ActiveLamp", [-0.65, 0.95, 0], 0.18, colors.gold);

print({
  keep: keep.IsActive(),
  mute: mute.IsActive(),
  traverse: listPrims(stage),
});`,
  },
  {
    title: "Apply API Schema",
    group: "Authoring",
    code: `// Apply MaterialBindingAPI before assigning the band's material. An applied
// schema adds a capability to a prim without changing its underlying geometry type.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/apply-api.usda");
stage.SetUpAxis("Y");
const prim = stage.DefinePrim("/World/BoundThing", "Cube");

prim.ApplyAPI("MaterialBindingAPI");
prim.CreateRelationship("material:binding", false).AddTarget("/World/Looks/Preview");

// The relationship target exists below; a band and clasp share the same violet look.
const appliedMaterial = kit.material(stage, "/World/Looks/Preview", colors.violet, 0.5, 0.25);
kit.pose(stage, prim, [0, 0, 0], [0.6, 0.8, 0.5], [0, 30, 0]);
kit.bind(kit.torus(stage, "/World/BindingBand", [0, 0, 0], 1.15, 0.12, colors.violet, "y"), appliedMaterial);
kit.sphere(stage, "/World/BindingClasp", [1.1, 0, 0], 0.23, colors.gold);

print(await stage.ExportToString());`,
  },
  {
    title: "Cameras And Lights",
    group: "Scene Building",
    code: `// Frame a ceramic jug and light it with a warm sun, a cool rim and sky fill.
// Camera lens settings control the shot; light inputs control how the surfaces respond.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/cameras-lights.usda");
stage.SetUpAxis("Y");
const camera = UsdGeom.Camera.Define(stage, "/World/Camera");
camera.CreateFocalLengthAttr(35);
UsdGeom.XformCommonAPI(camera).SetTranslate(Gf.Vec3d(0, 2, 6));
UsdGeom.XformCommonAPI(camera).SetRotate(Gf.Vec3f(-15, 0, 0));

// Light inputs are ordinary attributes. A small helper keeps the rig readable.
function setInput(prim, name, type, value) {
  prim.CreateAttribute("inputs:" + name, type, false).Set(value);
}

// Key: a normalized DistantLight, so intensity is illuminance (a few lux here).
const key = stage.DefinePrim("/World/Lights/Key", "DistantLight");
setInput(key, "normalize", Sdf.ValueTypeNames.Bool, true);
setInput(key, "intensity", Sdf.ValueTypeNames.Float, 3);
setInput(key, "color", Sdf.ValueTypeNames.Color3f, Gf.Vec3f(1, 0.94, 0.86));
UsdGeom.XformCommonAPI(key).SetRotate(Gf.Vec3f(-40, -35, 0));

// Rim: a small SphereLight behind the jug picks out its silhouette in cool blue.
// Sphere and area lights use luminance; their output grows with their size.
const rim = stage.DefinePrim("/World/Lights/Rim", "SphereLight");
setInput(rim, "radius", Sdf.ValueTypeNames.Float, 0.2);
setInput(rim, "intensity", Sdf.ValueTypeNames.Float, 200);
setInput(rim, "color", Sdf.ValueTypeNames.Color3f, Gf.Vec3f(0.55, 0.75, 1));
UsdGeom.XformCommonAPI(rim).SetTranslate(Gf.Vec3d(-1.4, 1.6, -1.6));

// Fill: an untextured DomeLight lights the scene evenly from every direction.
// Authored lights replace the viewer's default lighting, so the stage needs one.
const fill = stage.DefinePrim("/World/Lights/Fill", "DomeLight");
setInput(fill, "intensity", Sdf.ValueTypeNames.Float, 0.35);

// A ceramic jug on a blue backdrop: what the camera frames and the lights fall on.
const ceramic = kit.material(stage, "/World/Looks/Ceramic", colors.cream, 0, 0.2);
kit.bind(kit.lathe(stage, "/World/Subject", [0, 0, 0], [[0.01, -0.8], [0.6, -0.8], [0.7, -0.4], [0.35, 0.5], [0.15, 1.1], [0.01, 1.1]], colors.cream), ceramic);
kit.torus(stage, "/World/SubjectHandle", [0.55, 0.2, 0], 0.35, 0.09, colors.teal);
kit.box(stage, "/World/Backdrop", [0, -1.05, 0], [3.3, 0.15, 2.6], colors.blue);

print(await stage.ExportToString());`,
    authoredLighting: true,
  },
  {
    title: "USDZ Package",
    group: "Export",
    code: `// Package this scene as USDZ, including its dependencies, and read the bytes
// back for download. USDZ packaging also applies the archive layout USD readers expect.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/package-source.usda");
stage.SetUpAxis("Y");
UsdGeom.Sphere.Define(stage, "/World/Sphere").CreateRadiusAttr(1.5);

// A coral ball inside an open parcel.
const ball = stage.GetPrimAtPath("/World/Sphere");
kit.pose(stage, ball, [0, 0.2, 0], [0.4, 0.4, 0.4]);
kit.color(ball, colors.coral);
kit.box(stage, "/World/Parcel/Bottom", [0, -0.65, 0], [2, 0.2, 1.6], colors.teal);
for (const x of [-0.95, 0.95]) kit.box(stage, "/World/Parcel/Side" + (x < 0 ? "Left" : "Right"), [x, -0.15, 0], [0.12, 0.85, 1.6], colors.teal);
kit.box(stage, "/World/Parcel/OpenLid", [0, 0.7, -0.9], [2, 1.5, 0.12], colors.gold, [-25, 0, 0]);

stage.GetRootLayer().Export("/tmp/package-source.usda");
const ok = await USD.CreateUsdzPackage("/tmp/package-source.usda", "/tmp/package.usdz");
const bytes = USD.ReadFile("/tmp/package.usdz");

// A .usdz is a zip archive: it starts with the bytes "PK" (80, 75).
print({ ok, byteLength: bytes.byteLength, zipMagic: [bytes[0], bytes[1]] });`,
  },
  {
    title: "Reopen Verification",
    group: "Export",
    code: `// Export a stage, open the file again and check the value survived the round trip.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/reopen.usda");
stage.SetUpAxis("Y");
const sphere = UsdGeom.Sphere.Define(stage, "/World/Sphere");
sphere.CreateRadiusAttr(4.2);

// The exported sphere, held in a caliper.
kit.pose(stage, sphere, [0.1, 0.5, 0], [0.13, 0.13, 0.13]);
kit.color(sphere, colors.blue);
kit.box(stage, "/World/Caliper/Scale", [0, 1.4, 0], [3, 0.18, 0.35], colors.cream);
kit.box(stage, "/World/Caliper/FixedJaw", [-0.75, 0.55, 0], [0.16, 1.6, 0.4], colors.gold);
kit.box(stage, "/World/Caliper/MovingJaw", [0.86, 0.55, 0], [0.17, 1.6, 0.4], colors.teal);
kit.box(stage, "/World/Caliper/Slider", [0.86, 1.4, 0], [0.48, 0.45, 0.55], colors.teal);
kit.box(stage, "/World/Caliper/Stop", [-0.45, -0.2, 0], [0.8, 0.16, 0.4], colors.gold);
for (let i = 0; i < 15; i++) {
  kit.box(stage, "/World/Caliper/Tick" + i, [-1.2 + i * 0.16, 1.51, 0.2], [0.025, i % 5 ? 0.08 : 0.18, 0.025], colors.ink);
}
kit.sphere(stage, "/World/Caliper/Lock", [0.86, 1.72, 0], 0.12, colors.coral);

await stage.Export("/tmp/reopen.usda");
const reopened = await Usd.Stage.Open("/tmp/reopen.usda");
print(await reopened.GetPrimAtPath("/World/Sphere").GetAttribute("radius").GetValueString());`,
  },
  {
    title: "Build Info",
    group: "Runtime",
    code: `// Check which optional modules were linked into this runtime. Each chip
// represents a module; a flat stub marks one that the build reports as unavailable.
const kit = sceneHelpers, colors = kit.colors;
const info = JSON.parse(USD.GetBuildInfoJson());
stage = Usd.Stage.CreateNew("/tmp/build-info.usda");
stage.SetUpAxis("Y");

// A circuit board with one chip per module; a missing module is a flat stub.
kit.box(stage, "/World/Board", [0, -0.35, 0], [3.4, 0.18, 2.5], colors.ink);
const modules = [info.modules.materialX, info.modules.usdGltf, info.modules.hydraBridge];
modules.forEach((module, i) => {
  const x = (i - 1) * 1.05;
  const chip = kit.box(stage, "/World/Module" + i, [x, 0.05, 0], [0.7, module ? 0.7 : 0.2, 0.85], [colors.teal, colors.coral, colors.blue][i]);
  kit.attr(chip, "userProperties:buildModule", "string", JSON.stringify(module));
  for (let pin = 0; pin < 4; pin++) for (const z of [-0.55, 0.55]) {
    kit.box(stage, "/World/Pin" + i + "_" + pin + (z < 0 ? "Back" : "Front"), [x - 0.25 + pin / 6, -0.15, z], [0.07, 0.07, 0.3], colors.gold);
  }
});
kit.attr(stage.GetPrimAtPath("/World"), "userProperties:openusdVersion", "string", String(info.openusd.version));

print({
  openusd: info.openusd.version,
  materialX: info.modules.materialX,
  usdGltf: info.modules.usdGltf,
  hydraBridge: info.modules.hydraBridge,
});`,
  },
  {
    title: "Virtual Filesystem",
    group: "Runtime",
    code: `// Write a note into the virtual filesystem, read it back and list its folder.
// The same filesystem holds layers and image bytes that USD resolves by path.
const kit = sceneHelpers, colors = kit.colors;
mountText("/tmp/fs-note.txt", "hello from MEMFS");

stage = Usd.Stage.CreateNew("/tmp/virtual-filesystem.usda");
stage.SetUpAxis("Y");
const entries = USD.FS_readdir("/tmp").filter((name) => name !== "." && name !== "..").sort();

// A folder of file cards: up to seven are drawn, each tagged with a real filename.
entries.slice(0, 7).forEach((entry, i) => {
  const card = kit.box(stage, "/World/Files/File" + i, [i * 0.22 - 0.7, i * 0.12, 0], [1.6, 0.065, 1.25], i % 2 ? colors.cream : colors.teal, [0, i * 3, 0]);
  kit.attr(card, "userProperties:fileName", "string", entry);
});
kit.box(stage, "/World/FolderBack", [0, 0.45, -0.7], [2.3, 1.4, 0.08], colors.gold);
kit.box(stage, "/World/FolderTab", [-0.65, 1.25, -0.7], [0.9, 0.3, 0.08], colors.gold);
kit.box(stage, "/World/FolderFront", [0, -0.15, 0.75], [2.3, 0.65, 0.08], colors.coral, [-12, 0, 0]);

print({
  tmpEntries: USD.FS_readdir("/tmp"),
  exists: USD.FS_analyzePath("/tmp/fs-note.txt").exists,
  text: new TextDecoder().decode(USD.ReadFile("/tmp/fs-note.txt")),
});`,
  },
  {
    title: "Sdf Paths",
    group: "Runtime",
    code: `// Start with /World, append a child name, then address that child's translate
// attribute. Child paths use a slash; property paths use a dot after the prim path.
const kit = sceneHelpers, colors = kit.colors;
const root = new Sdf.Path("/World");
const child = root.AppendChild("Geom");                  // /World/Geom
const prop = child.AppendProperty("xformOp:translate");  // /World/Geom.xformOp:translate

stage = Usd.Stage.CreateNew("/tmp/sdf-paths.usda");
stage.SetUpAxis("Y");
UsdGeom.Xform.Define(stage, child);                      // schema Define accepts an Sdf.Path
const geom = stage.GetPrimAtPath(child.GetString());
geom.CreateAttribute("xformOp:translate", Sdf.ValueTypeNames.Double3, false).Set(Gf.Vec3d(1, 2, 3));
kit.attr(geom, "xformOpOrder", "token[]", ["xformOp:translate"]);

// The path as a model: /World at the origin, /World/Geom at (1, 2, 3), and its
// property shown as a socket on top of the Geom node.
kit.sphere(stage, "/World/RootNode", [0, 0, 0], 0.4, colors.gold);
kit.beam(stage, "/World/PathSegment", [0, 0, 0], [1, 2, 3], 0.055, colors.cream);
kit.box(stage, child.GetString() + "/Node", [0, 0, 0], [1, 0.8, 0.7], colors.teal);
kit.torus(stage, child.GetString() + "/PropertySocket", [0, 0.65, 0], 0.28, 0.07, colors.coral);

print({ child: child.GetString(), property: prop.GetString() });`,
  },
  {
    title: "Three-Point Light Rig",
    group: "Lighting",
    code: `// A classic three-point rig: warm key, soft cool fill, bright rim from behind.
// Lights are prims; every setting is an "inputs:" attribute on the light.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/three-point-rig.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);

// Ivory chess pieces on a dark board: neutral surfaces show the light colours.
const ivory = [0.9, 0.88, 0.82];
kit.box(stage, "/World/Board", [0, -0.08, 0], [3.2, 0.16, 3.2], colors.ink);
kit.lathe(stage, "/World/Pieces/Queen", [0, 0, 0], [[0.01, 0], [0.46, 0], [0.46, 0.1], [0.34, 0.2], [0.2, 0.55], [0.15, 1.15], [0.28, 1.25], [0.16, 1.33], [0.2, 1.55], [0.3, 1.72], [0.01, 1.68]], ivory);
kit.sphere(stage, "/World/Pieces/QueenFinial", [0, 1.8, 0], 0.09, ivory);
kit.lathe(stage, "/World/Pieces/Rook", [-0.95, 0, 0.45], [[0.01, 0], [0.42, 0], [0.42, 0.1], [0.32, 0.2], [0.26, 0.8], [0.36, 0.9], [0.36, 1.1], [0.28, 1.1], [0.28, 1.0], [0.01, 1.0]], ivory);
kit.lathe(stage, "/World/Pieces/Pawn", [0.85, 0, 0.6], [[0.01, 0], [0.36, 0], [0.36, 0.08], [0.24, 0.16], [0.15, 0.5], [0.24, 0.56], [0.12, 0.62], [0.01, 0.62]], ivory);
kit.sphere(stage, "/World/Pieces/PawnHead", [0.85, 0.78, 0.6], 0.2, ivory);
const target = [0, 0.8, 0];   // every light aims at the queen's waist

// Key: a warm rectangular softbox, front right and above.
const key = stage.DefinePrim("/World/Lights/Key", "RectLight");
key.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(40);
key.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(1, 0.78, 0.55));
key.CreateAttribute("inputs:width", Sdf.ValueTypeNames.Float, false).Set(1.5);
key.CreateAttribute("inputs:height", Sdf.ValueTypeNames.Float, false).Set(1.5);
kit.aim(stage, key, [2.4, 2.6, 2.0], target);   // lights shine down their -Z axis

// Fill: a large, dim, cool sphere light on the opposite side lifts the shadows.
const fill = stage.DefinePrim("/World/Lights/Fill", "SphereLight");
fill.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(25);
fill.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(0.55, 0.7, 1));
fill.CreateAttribute("inputs:radius", Sdf.ValueTypeNames.Float, false).Set(0.6);
kit.aim(stage, fill, [-2.6, 1.4, 1.6], target);

// Rim: a disk behind the pieces. exposure is in stops: 1 doubles the intensity.
const rim = stage.DefinePrim("/World/Lights/Rim", "DiskLight");
rim.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(60);
rim.CreateAttribute("inputs:exposure", Sdf.ValueTypeNames.Float, false).Set(1);
rim.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(1, 0.96, 0.9));
rim.CreateAttribute("inputs:radius", Sdf.ValueTypeNames.Float, false).Set(0.5);
kit.aim(stage, rim, [-0.6, 2.8, -2.6], target);

// A faint dome keeps the unlit sides from going black.
const dome = stage.DefinePrim("/World/Lights/Ambient", "DomeLight");
dome.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(0.25);
dome.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(0.6, 0.65, 0.8));

// A 38 mm lens on a 36-by-27 film back keeps all three pieces in the shot.
// Cameras look along local -Z, so aim rotates that axis toward the pieces.
const camera = UsdGeom.Camera.Define(stage, "/World/Camera");
camera.CreateFocalLengthAttr(38);
kit.attr(camera, "horizontalAperture", "float", 36);
kit.attr(camera, "verticalAperture", "float", 27);
kit.aim(stage, camera.GetPrim(), [4, 3.3, 5], [0, 0.75, 0]);

print(await Promise.all(vectorToArray(stage.GetPrimAtPath("/World/Lights").GetChildren()).map((light) => inspectPrim(light))));`,
  },
  {
    title: "Shaped Spotlights",
    group: "Lighting",
    code: `// ShapingAPI turns a light into a spotlight with a cone angle and a soft edge.
// Three coloured spots overlap on a pale stage and mix additively.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/shaped-spotlights.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);

// A white sphere on a slim column: its curved surface shows each colour from
// its own side and the additive mixes where the beams overlap.
const white = [0.92, 0.92, 0.92], grey = [0.72, 0.72, 0.74];
kit.lathe(stage, "/World/Stage", [0, 0, 0], [[0.01, -0.15], [1.7, -0.15], [1.7, 0], [0.01, 0]], grey);
kit.lathe(stage, "/World/Plinth", [0, 0, 0], [[0.01, 0], [0.32, 0], [0.3, 0.06], [0.11, 0.12], [0.08, 0.7], [0.16, 0.78], [0.01, 0.78]], white);
kit.sphere(stage, "/World/Performer", [0, 1.18, 0], 0.4, white);
// The truss ring stands on three legs placed between the spots.
const trussHeight = 2.8, trussRadius = 1.8;
kit.torus(stage, "/World/Truss", [0, trussHeight, 0], trussRadius, 0.05, colors.ink, "y");
kit.beams(stage, "/World/TrussLegs", [30, 150, 270].map((degrees) => {
  const angle = degrees * Math.PI / 180, foot = [1.65 * Math.cos(angle), 0, 1.65 * Math.sin(angle)];
  return [foot, [trussRadius * Math.cos(angle), trussHeight, trussRadius * Math.sin(angle)]];
}), 0.04, colors.ink);

const spots = [
  { name: "Red", color: [1, 0.12, 0.1], degrees: 90 },
  { name: "Green", color: [0.1, 1, 0.2], degrees: 210 },
  { name: "Blue", color: [0.15, 0.3, 1], degrees: 330 },
];
for (const spot of spots) {
  const light = stage.DefinePrim("/World/Spots/" + spot.name, "SphereLight");
  light.ApplyAPI("ShapingAPI");   // adds the inputs:shaping:* attributes
  // Intensity is luminance (nits). A small emitter needs high luminance:
  // 1500 * pi * 0.08² gives roughly 30 candela in the point approximation:
  // about 3 lux on the floor three metres away, like the other lessons' keys.
  light.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(1500);
  light.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(...spot.color));
  light.CreateAttribute("inputs:radius", Sdf.ValueTypeNames.Float, false).Set(0.08);
  light.CreateAttribute("inputs:shaping:cone:angle", Sdf.ValueTypeNames.Float, false).Set(18);    // degrees off the axis
  light.CreateAttribute("inputs:shaping:cone:softness", Sdf.ValueTypeNames.Float, false).Set(0.25);

  // Hang each spot under the truss and aim it at the near side of the performer.
  // Each beam grazes the sphere, then crosses the centre so the floor pools overlap.
  const angle = spot.degrees * Math.PI / 180, ring = [Math.cos(angle), 0, Math.sin(angle)];
  const position = [trussRadius * ring[0], trussHeight - 0.15, trussRadius * ring[2]];
  kit.aim(stage, light, position, [0.2 * ring[0], 0.7, 0.2 * ring[2]]);
  kit.sphere(stage, "/World/Truss/Can" + spot.name, [position[0], trussHeight + 0.05, position[2]], 0.1, spot.color);
}

// A dim dome keeps the truss and the unlit floor readable. Authored lights
// replace the viewer's default lighting, so without it they would be black.
const house = stage.DefinePrim("/World/HouseLight", "DomeLight");
house.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(0.08);
house.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(0.7, 0.75, 0.9));

// Frame the truss and the overlapping light pools together. Lens and aperture
// set the field of view; moving the camera changes the perspective.
const camera = UsdGeom.Camera.Define(stage, "/World/Camera");
camera.CreateFocalLengthAttr(40);
kit.attr(camera, "horizontalAperture", "float", 36);
kit.attr(camera, "verticalAperture", "float", 27);
kit.aim(stage, camera.GetPrim(), [4.2, 3.4, 5.2], [0, 1.15, 0]);

print(await Promise.all(spots.map((spot) => inspectPrim(stage.GetPrimAtPath("/World/Spots/" + spot.name)))));`,
  },
  {
    title: "Sun Cycle",
    group: "Lighting",
    code: `// Lights animate like any other prim: time-sample a sun's rotation, colour
// and intensity across a day and night. Still previews show the default (golden hour).
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/sun-cycle.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(97);   // one day in four seconds at 24 fps: frame 97 repeats frame 1

// A lighthouse on a rock in a round patch of sea.
kit.lathe(stage, "/World/Sea", [0, 0, 0], [[0.01, -0.1], [2.4, -0.1], [2.4, 0], [0.01, 0]], [0.12, 0.4, 0.62]);
kit.sphere(stage, "/World/Rock", [0, 0, 0], 0.9, [0.42, 0.4, 0.38], [1, 0.45, 0.85]);
const towerRadius = (height) => 0.34 - 0.1 * height / 1.5;   // tapers toward the top
kit.lathe(stage, "/World/Lighthouse/Tower", [0, 0.3, 0], [[towerRadius(0), 0], [towerRadius(1.5), 1.5]], colors.cream);
for (const [i, from, to] of [[0, 0.4, 0.65], [1, 0.95, 1.2]]) {
  kit.lathe(stage, "/World/Lighthouse/Band" + i, [0, 0.3, 0], [[towerRadius(from) + 0.01, from], [towerRadius(to) + 0.01, to]], colors.coral);
}
kit.torus(stage, "/World/Lighthouse/Gallery", [0, 1.82, 0], 0.3, 0.035, colors.ink, "y");
kit.lathe(stage, "/World/Lighthouse/Roof", [0, 2.1, 0], [[0.27, 0], [0.01, 0.3]], colors.coral);
// The lamp's glass glows through an animated emissive input, and a sphere light
// just outside the glass lights the rock and sea at night. Sphere-light intensity
// is luminance (nits): 30 * pi * 0.2² is about 4 candela, a gentle harbour light.
const glass = kit.material(stage, "/World/Looks/LampGlass", [1, 0.86, 0.55], 0, 0.15);
const glow = kit.attr(stage.GetPrimAtPath("/World/Looks/LampGlass/Surface"), "inputs:emissiveColor", "color3f", [0, 0, 0]);
kit.bind(kit.sphere(stage, "/World/Lighthouse/Lamp", [0, 1.98, 0], 0.15, colors.gold), glass);
const beacon = stage.DefinePrim("/World/Lighthouse/Beacon", "SphereLight");
beacon.CreateAttribute("inputs:radius", Sdf.ValueTypeNames.Float, false).Set(0.2);
beacon.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(1, 0.78, 0.45));
const beaconIntensity = beacon.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false);
kit.pose(stage, beacon, [0, 1.98, 0]);

// The sun and moon ride opposite ends of one orbit, tilted toward the back.
// Rotating the orbit interpolates an angle, so two keys trace a true circle;
// lights and discs are children, so their direction turns with it.
kit.group(stage, "/World/Sky", [0, 0, 0], [-30, 20, 0]);
kit.torus(stage, "/World/Sky/Arc", [0, 0, 0], 3.2, 0.015, colors.gold, "z", 0.5);
const orbit = UsdGeom.Xform.Define(stage, "/World/Sky/Orbit");
const turn = orbit.AddRotateXYZOp();
turn.Set(Gf.Vec3f(0, 0, 0), 1);       // sunrise on the right
turn.Set(Gf.Vec3f(0, 0, 360), 97);    // a full turn: the same pose as frame 1
turn.Set(Gf.Vec3f(0, 0, 35));         // still previews: golden hour

function body(name, side, radius, rgb) {
  const disc = UsdGeom.Sphere.Define(stage, "/World/Sky/Orbit/" + name + "Disc");
  disc.CreateRadiusAttr(radius);
  kit.color(disc, rgb);
  kit.pose(stage, disc, [side * 3.2, 0, 0]);
  // A DistantLight only uses its rotation: point it from the disc at the island.
  const light = stage.DefinePrim("/World/Sky/Orbit/" + name, "DistantLight");
  kit.aim(stage, light, [side * 3.2, 0, 0], [0, 0, 0]);
  // Normalized distant intensity is illuminance (lux), independent of sun angle.
  light.CreateAttribute("inputs:normalize", Sdf.ValueTypeNames.Bool, false).Set(true);
  return {
    visibility: disc.GetPrim().GetAttribute("visibility"),
    color: light.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false),
    intensity: light.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false),
  };
}
const sunLight = body("Sun", 1, 0.22, colors.gold), moonLight = body("Moon", -1, 0.15, [0.85, 0.88, 0.95]);
const sunColor = sunLight.color;
moonLight.color.Set(Gf.Vec3f(0.62, 0.72, 1));

// The sky dome tints the shadow side, from day blue to night indigo.
const sky = stage.DefinePrim("/World/Sky/Dome", "DomeLight");
const skyIntensity = sky.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false);
const skyColor = sky.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false);

// Everything else follows the sun's height. Smoothstep keeps each curve's
// slope continuous through dawn and dusk, and the angle repeats after a full turn.
const smooth = (from, to, value) => { const t = Math.min(1, Math.max(0, (value - from) / (to - from))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
function light(time, degrees) {
  const height = Math.sin(degrees * Math.PI / 180);   // 0 at the horizon, 1 at noon, -1 at midnight
  const day = smooth(-0.08, 0.3, height), night = smooth(-0.08, 0.3, -height);
  // Low sun is warm and dim, high sun white and bright; moonlight is cool and faint.
  sunColor.Set(Gf.Vec3f(...mix([1, 0.45, 0.25], [1, 0.97, 0.9], Math.max(0, height))), time);
  sunLight.intensity.Set(3 * day * (0.25 + 0.75 * Math.max(0, height)), time);
  moonLight.intensity.Set(0.3 * night, time);
  // Hide each disc once it has set below the sea; visibility samples are held, not blended.
  sunLight.visibility.Set(height < -0.08 ? "invisible" : "inherited", time);
  moonLight.visibility.Set(height > 0.08 ? "invisible" : "inherited", time);
  skyIntensity.Set(0.06 + 0.24 * day, time);
  skyColor.Set(Gf.Vec3f(...mix([0.22, 0.26, 0.5], [0.55, 0.7, 1], day)), time);
  // The lighthouse wakes at dusk and sleeps after dawn.
  glow.Set(Gf.Vec3f(...[1, 0.72, 0.35].map((value) => value * night)), time);
  beaconIntensity.Set(30 * night, time);
}
for (let frame = 1; frame <= 97; frame += 2) light(frame, 360 * (frame - 1) / 96);
light(Usd.TimeCode.Default(), 35);

// Keep the island and the sun arc in one shot. The camera stays fixed while
// the light rotates, making changes in shadows and colour easier to compare.
const camera = UsdGeom.Camera.Define(stage, "/World/Camera");
camera.CreateFocalLengthAttr(40);
kit.attr(camera, "horizontalAperture", "float", 36);
kit.attr(camera, "verticalAperture", "float", 27);
kit.aim(stage, camera.GetPrim(), [6, 5, 7.5], [0, 1.3, 0]);

print({ samples: await sunColor.GetNumTimeSamples(), noon: await sunColor.GetValueStringAtTime(25), preview: await sunColor.GetValueString() });`,
  },
  {
    title: "Weighted Skinning",
    group: "Rigging",
    code: `// UsdSkel: a Skeleton of joints, a SkelAnimation that moves them, and a mesh
// whose vertices follow the joints by weight. Here a three-joint sea frond sways.
const kit = sceneHelpers, colors = kit.colors;

stage = Usd.Stage.CreateNew("/tmp/frond/frond-rig.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(49);
stage.DefinePrim("/World/Frond", "SkelRoot");
const skeleton = stage.DefinePrim("/World/Frond/Skeleton", "Skeleton");
const joints = ["base", "base/mid", "base/mid/tip"];
skeleton.GetAttribute("joints").Set(joints);
// Bind transforms place joints in skeleton space; rest transforms place each
// joint relative to its parent. Both describe the same straight, unposed frond.
const translated = y => Gf.Matrix4d.Identity().SetTranslate(Gf.Vec3d(0, y, 0));
skeleton.GetAttribute("bindTransforms").Set([0, 1.1, 2.2].map(translated));
skeleton.GetAttribute("restTransforms").Set([0, 1.1, 1.1].map(translated));
const animation = stage.DefinePrim("/World/Frond/Sway", "SkelAnimation");
animation.GetAttribute("joints").Set(joints);
animation.GetAttribute("translations").Set([[0, 0, 0], [0, 1.1, 0], [0, 1.1, 0]]);
animation.GetAttribute("scales").Set(joints.map(() => [1, 1, 1]));

// 1. The mesh: a flattened, tapering tube of rings around the Y axis.
const rings = 24, sides = 12, height = 3;
const points = [], counts = [], indices = [];
for (let ring = 0; ring <= rings; ring++) {
  const y = ring / rings * height;
  const radius = 0.3 * (1 - 0.75 * y / height) * (1 + 0.12 * Math.sin(y * 7));   // taper with soft ribs
  for (let side = 0; side < sides; side++) {
    const angle = side / sides * 2 * Math.PI;
    points.push([radius * Math.cos(angle), y, 0.6 * radius * Math.sin(angle)]);
  }
}
for (let ring = 0; ring < rings; ring++) for (let side = 0; side < sides; side++) {
  const a = ring * sides + side, b = ring * sides + (side + 1) % sides;
  counts.push(4);
  indices.push(a, a + sides, b + sides, b);
}
const tip = points.push([0, height + 0.12, 0]) - 1;   // close the top with a fan of triangles
for (let side = 0; side < sides; side++) {
  counts.push(3);
  indices.push(rings * sides + side, tip, rings * sides + (side + 1) % sides);
}
const body = UsdGeom.Mesh.Define(stage, "/World/Frond/Body");
body.CreatePointsAttr(Vt.Vec3fArray(points.map((point) => Gf.Vec3f(...point))));
body.CreateFaceVertexCountsAttr(Vt.IntArray(counts));
body.CreateFaceVertexIndicesAttr(Vt.IntArray(indices));
kit.attr(body, "subdivisionScheme", "token", "none");

// 2. Skin weights: three per vertex (one per joint), falling off with distance
//    from each joint's height and normalised to sum to 1. Tinting each vertex
//    by its weights makes the influence gradient visible, like weight painting.
const jointHeights = [0, 1.1, 2.2], jointColors = [colors.teal, colors.gold, colors.coral];
const jointIndices = [], jointWeights = [], vertexColors = [];
for (const [, y] of points) {
  const falloff = jointHeights.map((jointY) => Math.exp(-(((y - jointY) / 0.75) ** 2)));
  const total = falloff.reduce((sum, value) => sum + value, 0);
  const weights = falloff.map((value) => value / total);
  jointIndices.push(0, 1, 2);
  jointWeights.push(...weights);
  vertexColors.push([0, 1, 2].map((c) => weights.reduce((sum, w, j) => sum + w * jointColors[j][c], 0)));
}
const bodyPrim = body.GetPrim();
bodyPrim.ApplyAPI("SkelBindingAPI");
const indicesPrimvar = kit.attr(bodyPrim, "primvars:skel:jointIndices", "int[]", jointIndices);
const weightsPrimvar = kit.attr(bodyPrim, "primvars:skel:jointWeights", "float[]", jointWeights);
for (const primvar of [indicesPrimvar, weightsPrimvar]) {
  primvar.SetMetadata("interpolation", "vertex");
  primvar.SetMetadata("elementSize", 3);   // three influences per vertex
}
const tint = kit.attr(bodyPrim, "primvars:displayColor", "color3f[]", vertexColors);
tint.SetMetadata("interpolation", "vertex");
bodyPrim.CreateRelationship("skel:skeleton", false).AddTarget("/World/Frond/Skeleton");

// 3. Bend the joints with rotations, letting skin weights blend their effects.
// Quaternions avoid the axis-order ambiguities of Euler rotations. A later
// phase at the tip makes the frond trail behind its middle joint.
const frond = stage.GetPrimAtPath("/World/Frond");
frond.ApplyAPI("SkelBindingAPI");
frond.CreateRelationship("skel:animationSource", false).AddTarget("/World/Frond/Sway");
const rotations = animation.GetAttribute("rotations");
const aroundZ = radians => [Math.cos(radians / 2), 0, 0, Math.sin(radians / 2)];
const swayed = phase => [aroundZ(0.08 * Math.sin(phase)),
  aroundZ(0.32 * Math.sin(phase)), aroundZ(0.45 * Math.sin(phase - 0.4))];
rotations.Set(swayed(Math.PI / 3));
// Match the first and last pose so the two-second sway repeats without a snap.
for (let frame = 1; frame <= 49; frame += 2) {
  const phase = frame === 49 ? 0 : (frame - 1) / 48 * 2 * Math.PI;
  rotations.Set(swayed(phase), frame);
}

// A rock and a sandy seabed to anchor the frond.
kit.sphere(stage, "/World/Rock", [0, 0.05, 0], 0.5, [0.32, 0.34, 0.42], [1, 0.45, 0.9]);
kit.lathe(stage, "/World/Seabed", [0, 0, 0], [[0.01, -0.12], [1.9, -0.12], [1.75, 0], [0.01, 0.03]], [0.86, 0.76, 0.56]);

print({ vertices: points.length, faces: counts.length, joints: jointHeights.length, keyframes: await rotations.GetNumTimeSamples() });`,
  },
  {
    title: "Rigid Skinning",
    group: "Rigging",
    code: `// Rigid skinning binds a whole mesh to one joint. A telescoping antenna mast
// on a rover extends by animating its joints' translations.
const kit = sceneHelpers, colors = kit.colors;

stage = Usd.Stage.CreateNew("/tmp/rover/rover-rig.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(49);
stage.DefinePrim("/World/Mast", "SkelRoot");
const skeleton = stage.DefinePrim("/World/Mast/Skeleton", "Skeleton");
const joints = ["base", "base/lower", "base/lower/upper"];
const translated = y => Gf.Matrix4d.Identity().SetTranslate(Gf.Vec3d(0, y, 0));
skeleton.GetAttribute("joints").Set(joints);
skeleton.GetAttribute("bindTransforms").Set([0, 0.3, 0.4].map(translated));
skeleton.GetAttribute("restTransforms").Set([0, 0.3, 0.1].map(translated));
const animation = stage.DefinePrim("/World/Mast/Extend", "SkelAnimation");
animation.GetAttribute("joints").Set(joints);
animation.GetAttribute("rotations").Set(joints.map(() => [1, 0, 0, 0]));
animation.GetAttribute("scales").Set(joints.map(() => [1, 1, 1]));

// The rover itself is ordinary, unskinned geometry.
kit.box(stage, "/World/Ground", [0, -0.03, 0], [3.4, 0.06, 2.2], [0.78, 0.5, 0.36]);
kit.box(stage, "/World/Rover/Body", [0, 0.55, 0], [1.7, 0.5, 1], colors.teal);
kit.box(stage, "/World/Rover/Cab", [-0.5, 0.95, 0], [0.6, 0.3, 0.8], colors.cream);
kit.box(stage, "/World/Rover/Windshield", [-0.81, 0.95, 0], [0.03, 0.2, 0.66], colors.ink);
for (const x of [-0.55, 0.55]) for (const z of [-0.55, 0.55]) {
  const id = (x < 0 ? "Front" : "Back") + (z < 0 ? "Left" : "Right");
  kit.torus(stage, "/World/Rover/Wheel" + id, [x, 0.25, z], 0.17, 0.08, colors.ink);
  kit.sphere(stage, "/World/Rover/Hub" + id, [x, 0.25, z], 0.09, colors.gold, [1, 1, 0.5]);
}
kit.lathe(stage, "/World/Rover/Sleeve", [0.35, 0.8, 0], [[0.2, 0], [0.2, 0.18], [0.15, 0.18]], colors.ink);
const mast = stage.GetPrimAtPath("/World/Mast");
kit.pose(stage, mast, [0.35, 0.8, 0]);   // the SkelRoot sits on the rover's roof

// One joint index and weight, left at the default "constant" interpolation,
// binds the whole mesh rigidly to that joint: no per-vertex data is needed.
function bindToJoint(mesh, jointIndex) {
  mesh.ApplyAPI("SkelBindingAPI");
  mesh.CreateRelationship("skel:skeleton", false).AddTarget("/World/Mast/Skeleton");
  mesh.CreateAttribute("primvars:skel:jointIndices", Sdf.ValueTypeNames.IntArray, false).Set([jointIndex]);
  mesh.CreateAttribute("primvars:skel:jointWeights", Sdf.ValueTypeNames.FloatArray, false).Set([1]);
}
// Model the parts collapsed, in their bind pose: each tube hangs below its joint.
bindToJoint(kit.lathe(stage, "/World/Mast/LowerTube", [0, 0, 0], [[0.13, -0.45], [0.13, 0.3]], colors.cream), 1);
bindToJoint(kit.lathe(stage, "/World/Mast/UpperTube", [0, 0, 0], [[0.085, -0.4], [0.085, 0.4]], colors.cream), 2);
bindToJoint(kit.lathe(stage, "/World/Mast/Dish", [0, 0.4, 0], [[0.02, 0.02], [0.2, 0.08], [0.42, 0.22], [0.44, 0.25]], colors.gold), 2);
bindToJoint(kit.beam(stage, "/World/Mast/Feed", [0, 0.42, 0], [0, 0.72, 0], 0.02, colors.ink), 2);
bindToJoint(kit.lathe(stage, "/World/Mast/Beacon", [0, 0.72, 0], [[0.01, -0.06], [0.05, -0.045], [0.065, 0], [0.05, 0.045], [0.01, 0.06]], colors.coral), 2);

// Animation: translations are local to each joint's parent: [base, lower, upper].
mast.ApplyAPI("SkelBindingAPI");
mast.CreateRelationship("skel:animationSource", false).AddTarget("/World/Mast/Extend");
const translations = stage.GetPrimAtPath("/World/Mast/Extend").CreateAttribute("translations", Sdf.ValueTypeNames.Float3Array, false);
const collapsed = [[0, 0, 0], [0, 0.3, 0], [0, 0.1, 0]];
const extended = [[0, 0, 0], [0, 0.85, 0], [0, 0.7, 0]];
translations.Set(extended);   // default value: still previews show the raised mast
// Ease out, admire the sky, and retract. Zero speed at both ends prevents a
// visible snap when the two-second cycle wraps from frame 49 back to frame 1.
for (let frame = 1; frame <= 49; frame += 2) {
  const phase = frame === 49 ? 0 : (frame - 1) / 48 * 2 * Math.PI;
  const rise = Math.min(1, 0.8 * (1 - Math.cos(phase)));
  const amount = rise * rise * (3 - 2 * rise);   // eased rise, with a hold at full extension
  const pose = collapsed.map((joint, i) => joint.map((value, axis) =>
    value + (extended[i][axis] - value) * amount));
  translations.Set(pose, frame);
}

print({ samples: await translations.GetNumTimeSamples(), extended: await translations.GetValueStringAtTime(25), collapsed: await translations.GetValueStringAtTime(1) });`,
  },
  {
    title: "Splat Galaxy",
    group: "Gaussian Splats",
    code: `// Gaussian splats are soft ellipsoids stored as parallel arrays on one prim.
// Keep position, scale, opacity and colour entries in the same order: index i
// in every array describes the same splat. One prim carries the entire galaxy.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/splat-galaxy.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
const galaxy = stage.DefinePrim("/World/Galaxy", "ParticleField3DGaussianSplat");

// Splat colour is stored as spherical harmonics. Degree 0 is one base colour
// per splat, encoded as (rgb - 0.5) / C0.
const C0 = 0.28209479177387814;
const toHarmonic = (rgb) => rgb.map((channel) => (channel - 0.5) / C0);
const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
const jitter = (seed) => Math.sin(seed * 78.233) * 0.5;   // repeatable, in [-0.5, 0.5]

const positions = [], scales = [], opacities = [], harmonics = [];
function addSplat(position, scale, opacity, rgb) {
  positions.push(position);
  scales.push(scale);   // per-axis radii; different values make an ellipsoid
  opacities.push(opacity);
  harmonics.push(toHarmonic(rgb));
}
// A warm, dense core...
for (let i = 0; i < 70; i++) {
  const angle = i * 2.39996, radius = 0.38 * Math.sqrt(i / 70);
  addSplat([radius * Math.cos(angle), jitter(i) * 0.14, radius * Math.sin(angle)], [0.13, 0.08, 0.13], 0.85, [1, 0.86, 0.62]);
}
// ...and two spiral arms that cool to blue and fade toward the rim.
for (let i = 0; i < 340; i++) {
  const t = i / 340, arm = i % 2;
  const angle = arm * Math.PI + t * 3.2 * Math.PI + jitter(i + 7) * 0.35;
  const radius = 0.3 + t * 1.7 + jitter(i + 3) * 0.14;
  const size = 0.055 + 0.08 * (1 - t);
  addSplat([radius * Math.cos(angle), jitter(i + 11) * 0.08, radius * Math.sin(angle)],
    [size, size * 0.3, size],   // flat discs hugging the galactic plane
    0.9 - 0.5 * t,
    mix([1, 0.7, 0.45], [0.35, 0.55, 1], Math.min(1, t * 1.4)));
}
galaxy.CreateAttribute("positions", Sdf.ValueTypeNames.Point3fArray, false).Set(positions);
galaxy.CreateAttribute("scales", Sdf.ValueTypeNames.Float3Array, false).Set(scales);
galaxy.CreateAttribute("opacities", Sdf.ValueTypeNames.FloatArray, false).Set(opacities);
galaxy.CreateAttribute("radiance:sphericalHarmonicsDegree", Sdf.ValueTypeNames.Int, false).Set(0);
galaxy.CreateAttribute("radiance:sphericalHarmonicsCoefficients", Sdf.ValueTypeNames.Float3Array, false).Set(harmonics);
// Omit rotations for this round galaxy; all ellipsoids use their local axes.
// To tilt individual splats, author orientations as [real, x, y, z] quaternions.

// Tilt the field for a three-quarter view and mount it on a display stand.
kit.pose(stage, galaxy, [0, 1.4, 0], [1, 1, 1], [18, 0, -10]);
kit.lathe(stage, "/World/Stand", [0, 0, 0], [[0.01, 0], [0.6, 0], [0.6, 0.06], [0.1, 0.12], [0.04, 1.35], [0.01, 1.35]], colors.ink);

print({ splats: positions.length, properties: vectorToArray(galaxy.GetPropertyNames()) });`,
  },
  {
    title: "Splat Blossom Tree",
    group: "Gaussian Splats",
    code: `// Splats and meshes share a stage: mesh trunk and branches carry a canopy of
// blossom splats, with translucent edges and flat petals fallen on the grass.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/splat-blossom-tree.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);

const bark = [0.36, 0.24, 0.18];
kit.lathe(stage, "/World/Ground", [0, 0, 0], [[0.01, -0.1], [2.1, -0.1], [2, 0], [0.01, 0.02]], [0.42, 0.55, 0.32]);
kit.lathe(stage, "/World/Tree/Trunk", [0, 0, 0], [[0.22, 0], [0.15, 0.6], [0.12, 1.3]], bark);
const clusters = [[-0.7, 1.85, 0.2], [0.75, 1.95, -0.1], [0.05, 2.3, -0.45]];   // canopy centres
clusters.forEach((center, i) => kit.beam(stage, "/World/Tree/Branch" + i, [0, 1.25, 0], center, 0.07, bark));

const C0 = 0.28209479177387814;
const toHarmonic = (rgb) => rgb.map((channel) => (channel - 0.5) / C0);
const pink = [0.98, 0.6, 0.72], rose = [0.88, 0.36, 0.52], white = [1, 0.93, 0.95];
const positions = [], scales = [], opacities = [], harmonics = [];

// Fill each cluster: Fibonacci-sphere directions at varying depth, so splats
// spread through the volume. Inner splats are larger and more opaque.
clusters.forEach((center, cluster) => {
  const count = 160;
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + 0.5) / count, ring = Math.sqrt(1 - y * y), angle = i * 2.39996;
    const depth = Math.cbrt(((i * 7) % 10 + 1) / 10);   // 0 = centre, 1 = surface
    const radius = 0.75 * depth, size = 0.07 + 0.06 * (1 - depth);
    positions.push([center[0] + radius * ring * Math.cos(angle), center[1] + 0.8 * radius * y, center[2] + radius * ring * Math.sin(angle)]);
    scales.push([size, 0.8 * size, size]);
    opacities.push(0.95 - 0.5 * depth);
    harmonics.push(toHarmonic((i + cluster) % 9 === 0 ? white : i % 3 === 0 ? rose : pink));
  }
});
// Fallen petals: very flat splats lying on the grass.
for (let i = 0; i < 70; i++) {
  const angle = i * 2.39996, radius = 0.4 + 1.4 * Math.sqrt(i / 70);
  positions.push([radius * Math.cos(angle), 0.035, radius * Math.sin(angle)]);
  scales.push([0.06, 0.006, 0.045]);
  opacities.push(0.9);
  harmonics.push(toHarmonic(i % 4 ? pink : white));
}

const blossoms = stage.DefinePrim("/World/Tree/Blossoms", "ParticleField3DGaussianSplat");
blossoms.CreateAttribute("positions", Sdf.ValueTypeNames.Point3fArray, false).Set(positions);
blossoms.CreateAttribute("scales", Sdf.ValueTypeNames.Float3Array, false).Set(scales);
blossoms.CreateAttribute("opacities", Sdf.ValueTypeNames.FloatArray, false).Set(opacities);
blossoms.CreateAttribute("radiance:sphericalHarmonicsDegree", Sdf.ValueTypeNames.Int, false).Set(0);
blossoms.CreateAttribute("radiance:sphericalHarmonicsCoefficients", Sdf.ValueTypeNames.Float3Array, false).Set(harmonics);

print({ splats: positions.length, prims: listPrims(stage) });`,
  },
  {
    title: "View-Dependent Splats",
    group: "Gaussian Splats",
    code: `// Spherical harmonics of degree 1 make colour depend on the viewing direction.
// Each splat stores four float3 coefficients: the base colour, then three
// tints applied when the splat is seen along the Y, Z and X axes.
const kit = sceneHelpers, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/view-dependent-splats.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);

const C0 = 0.28209479177387814;
const pearl = [0.86, 0.86, 0.9].map((channel) => (channel - 0.5) / C0);
const positions = [], scales = [], opacities = [], harmonics = [];
const count = 420, radius = 0.8;
for (let i = 0; i < count; i++) {
  // Fibonacci sphere: evenly spread points on the orb's surface.
  const y = 1 - 2 * (i + 0.5) / count, ring = Math.sqrt(1 - y * y), angle = i * 2.39996;
  positions.push([radius * ring * Math.cos(angle), radius * y, radius * ring * Math.sin(angle)]);
  scales.push([0.11, 0.11, 0.11]);
  opacities.push(0.8);
  // Vary the tint strength across the surface for an opal-like play of colour.
  const play = Math.sin(angle * 3 + y * 4);
  harmonics.push(
    pearl,                             // base colour
    [0, 0.25 * play, 0.5],             // seen along Y: teal to blue
    [0.5 * play, -0.1, 0.3],           // seen along Z: magenta
    [0.45, 0.35 * play, -0.3],         // seen along X: gold
  );
}

const orb = stage.DefinePrim("/World/Orb", "ParticleField3DGaussianSplat");
orb.CreateAttribute("positions", Sdf.ValueTypeNames.Point3fArray, false).Set(positions);
orb.CreateAttribute("scales", Sdf.ValueTypeNames.Float3Array, false).Set(scales);
orb.CreateAttribute("opacities", Sdf.ValueTypeNames.FloatArray, false).Set(opacities);
orb.CreateAttribute("radiance:sphericalHarmonicsDegree", Sdf.ValueTypeNames.Int, false).Set(1);
orb.CreateAttribute("radiance:sphericalHarmonicsCoefficients", Sdf.ValueTypeNames.Float3Array, false).Set(harmonics);
kit.pose(stage, orb, [0, 1.4, 0]);

// The orb rests in a gold cup.
kit.lathe(stage, "/World/Cup", [0, 0, 0], [[0.01, 0], [0.45, 0], [0.45, 0.05], [0.12, 0.12], [0.08, 0.45], [0.35, 0.62], [0.4, 0.7]], colors.gold);

print({ splats: count, coefficientsPerSplat: harmonics.length / count });`,
  },
  {
    title: "Payload Variant Assembly",
    group: "Composition",
    code: `// Assembly: one asset layer with a "style" variant set, payloaded five times.
// Each holder picks its own variant, and the root layer adds a local override.
const kit = sceneHelpers, colors = kit.colors;

// 1. The lantern asset, authored in its own layer.
const asset = Usd.Stage.CreateNew("/tmp/lanterns/lantern.usda");
UsdGeom.SetStageUpAxis(asset, UsdGeom.Tokens.y);
const lantern = asset.DefinePrim("/Lantern", "Xform");
// Parts outside the variant set are shared by every style.
kit.beam(asset, "/Lantern/Cord", [0, 0.55, 0], [0, 0, 0], 0.012, colors.ink);
kit.lathe(asset, "/Lantern/Cap", [0, 0, 0], [[0.01, 0.02], [0.14, 0], [0.2, -0.14], [0.01, -0.16]], colors.gold);
kit.beam(asset, "/Lantern/Tassel", [0, -1.08, 0], [0, -1.4, 0], 0.035, colors.gold);

// 2. Store each paper body in its style variant. The edit target scopes the
// geometry and its values together, while the frame remains shared.
const style = lantern.GetVariantSets().AddVariantSet("style");
const bodies = [
  { variant: "round", prim: "RoundBody", color: colors.coral, profile: [[0.06, -0.12], [0.36, -0.28], [0.46, -0.6], [0.36, -0.92], [0.06, -1.1]] },
  { variant: "tall", prim: "TallBody", color: colors.cream, profile: [[0.06, -0.12], [0.26, -0.18], [0.3, -0.6], [0.26, -1.02], [0.06, -1.1]] },
  { variant: "bell", prim: "BellBody", color: colors.teal, profile: [[0.06, -0.12], [0.16, -0.3], [0.28, -0.75], [0.5, -1.05], [0.06, -1.1]] },
];
for (const body of bodies) {
  style.AddVariant(body.variant);
  await kit.withVariant(asset, style, body.variant, () => {
    kit.lathe(asset, "/Lantern/" + body.prim, [0, 0, 0], body.profile, body.color);
  });
}
await style.SetVariantSelection("round");   // the asset's own default
// Save the layer itself. (Stage.Export writes a flattened copy, which would
// bake in the default style and drop the variant set.)
asset.GetRootLayer().Export("/tmp/lanterns/lantern.usda");

// 3. The shot: a sagging string between two posts.
stage = Usd.Stage.CreateNew("/tmp/lanterns/festival.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
const stringHeight = (x) => 2.55 + 0.08 * x * x;   // lowest in the middle
for (const x of [-2.6, 2.6]) {
  kit.beam(stage, "/World/Post" + (x < 0 ? "Left" : "Right"), [x, 0, 0], [x, stringHeight(x) + 0.1, 0], 0.05, colors.ink);
}
for (let i = 0; i < 8; i++) {
  const x0 = -2.6 + i * 0.65, x1 = x0 + 0.65;
  kit.beam(stage, "/World/String" + i, [x0, stringHeight(x0), 0], [x1, stringHeight(x1), 0], 0.015, colors.ink);
}
kit.box(stage, "/World/Ground", [0, -0.05, 0], [5.8, 0.1, 1.2], colors.ink);

// 4. Five holders payload the same asset, each with its own variant selection.
const styles = ["tall", "round", "bell", "round", "tall"];
for (const [i, styleName] of styles.entries()) {
  const x = (i - 2) * 1.05;
  const holder = stage.DefinePrim("/World/Lantern" + i, "Xform");
  await holder.GetPayloads().AddPayload("lantern.usda", "/Lantern");
  await holder.GetVariantSets().GetVariantSet("style").SetVariantSelection(styleName);
  kit.pose(stage, holder, [x, stringHeight(x) - 0.55, 0]);
}
// 5. A root-layer opinion beats anything inside the payload: recolour the middle lantern.
kit.color(stage.GetPrimAtPath("/World/Lantern2/BellBody"), colors.violet);

print(styles.map((_, i) => {
  const holder = stage.GetPrimAtPath("/World/Lantern" + i);
  return { path: holder.GetPath(), loaded: holder.IsLoaded(), style: holder.GetVariantSelection("style"), choices: vectorToArray(holder.GetVariantNames("style")) };
}));`,
  },
  {
    title: "Department Layers",
    group: "Composition",
    code: `// Departments author separate layers; the shot layer sublayers them.
// Earlier sublayers are stronger, and the shot's own root layer is strongest.
const kit = sceneHelpers, colors = kit.colors;
const houses = [
  { x: -2, width: 0.9, height: 1.1 },
  { x: -1, width: 0.8, height: 1.5 },
  { x: 0, width: 1, height: 1.2 },
  { x: 1, width: 0.8, height: 1.7 },
  { x: 2, width: 0.9, height: 1.3 },
];

// Layout: blocks out positions and proportions in neutral grey.
const grey = [0.62, 0.62, 0.64];
const layout = Usd.Stage.CreateNew("/tmp/street/layout.usda");
UsdGeom.SetStageUpAxis(layout, UsdGeom.Tokens.y);
kit.box(layout, "/World/Street/Pavement", [0, -0.04, 0], [5.6, 0.08, 1.4], grey);
kit.box(layout, "/World/Street/Road", [0, -0.06, 1.25], [5.6, 0.06, 1.1], grey);
houses.forEach((house, i) => {
  const path = "/World/Street/House" + i;
  kit.box(layout, path + "/Walls", [house.x, house.height / 2, 0], [house.width, house.height, 0.9], grey);
  // A cube turned 45 degrees and sunk into the walls reads as a gable roof.
  const roofSize = house.width / Math.SQRT2;
  kit.box(layout, path + "/Roof", [house.x, house.height, 0], [roofSize, roofSize, 0.98], grey, [0, 0, 45]);
  kit.box(layout, path + "/Door", [house.x, 0.22, 0.46], [0.22, 0.44, 0.03], grey);
  kit.box(layout, path + "/Window", [house.x, house.height * 0.7, 0.46], [0.26, 0.22, 0.03], grey);
});
layout.GetRootLayer().Export("/tmp/street/layout.usda");

// Look development: only colours, authored on the same prim paths.
const lookdev = Usd.Stage.CreateNew("/tmp/street/lookdev.usda");
const paint = [colors.coral, colors.teal, colors.gold, colors.blue, colors.cream];
houses.forEach((house, i) => {
  const path = "/World/Street/House" + i;
  kit.color(lookdev.DefinePrim(path + "/Walls", "Cube"), paint[i]);
  kit.color(lookdev.DefinePrim(path + "/Roof", "Cube"), colors.ink);
  kit.color(lookdev.DefinePrim(path + "/Door", "Cube"), colors.ink);
  kit.color(lookdev.DefinePrim(path + "/Window", "Cube"), [1, 0.9, 0.6]);
});
kit.color(lookdev.DefinePrim("/World/Street/Road", "Cube"), colors.ink);
lookdev.GetRootLayer().Export("/tmp/street/lookdev.usda");

// Look development wins over layout because it appears first in the stack.
// Relative layer paths resolve next to the shot, so the assembly can move intact.
stage = Usd.Stage.CreateNew("/tmp/street/shot.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
await stage.GetRootLayer().SetSubLayerPaths(["lookdev.usda", "layout.usda"]);

// A shot-specific fix in the root layer outranks both departments.
kit.color(stage.GetPrimAtPath("/World/Street/House2/Roof"), colors.coral);

// The roof's prim stack shows one spec per layer, strongest first.
print(stage.GetPrimAtPath("/World/Street/House2/Roof").GetPrimStack().map((spec) => spec.layer.displayName));`,
  },
  {
    title: "Instanced Grove",
    group: "Composition",
    code: `// References, variants and native instancing together. Every tree references
// one asset. Instanceable prims that compose identically (same references, same
// variant selection) share one prototype: the orchard's 15 trees need only 3.
const kit = sceneHelpers, colors = kit.colors;

// 1. The tree asset, with a "season" variant set that swaps the canopy.
const bark = [0.4, 0.28, 0.2], snow = [0.95, 0.97, 1];
const asset = Usd.Stage.CreateNew("/tmp/grove/tree.usda");
UsdGeom.SetStageUpAxis(asset, UsdGeom.Tokens.y);
const tree = asset.DefinePrim("/Tree", "Xform");
kit.lathe(asset, "/Tree/Trunk", [0, 0, 0], [[0.11, 0], [0.07, 0.7], [0.04, 1]], bark);
const season = tree.GetVariantSets().AddVariantSet("season");
for (const name of ["summer", "autumn", "winter"]) season.AddVariant(name);

await kit.withVariant(asset, season, "summer", () => {
  kit.sphere(asset, "/Tree/SummerCanopy", [0, 1.05, 0], 0.42, [0.25, 0.55, 0.3]);
  kit.sphere(asset, "/Tree/SummerCrown", [0.08, 1.35, 0.05], 0.28, [0.4, 0.7, 0.35]);
});
await kit.withVariant(asset, season, "autumn", () => {
  kit.sphere(asset, "/Tree/AutumnCanopy", [0, 1, 0], 0.36, colors.coral);
  kit.sphere(asset, "/Tree/AutumnCrown", [-0.08, 1.28, 0], 0.24, colors.gold);
});
await kit.withVariant(asset, season, "winter", () => {
  const branches = [], snowTips = [];
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2 + 0.4, tip = [0.38 * Math.cos(angle), 1.3, 0.38 * Math.sin(angle)];
    branches.push([[0, 0.75, 0], tip]); snowTips.push(tip);
  }
  kit.beams(asset, "/Tree/WinterBranches", branches, 0.025, bark);
  kit.spheres(asset, "/Tree/WinterSnow", snowTips, 0.07, snow);
});
await season.SetVariantSelection("summer");
asset.GetRootLayer().Export("/tmp/grove/tree.usda");   // the layer, not a flattened stage

// 2. Make three rows of shared trees and an editable hero. A reference keeps
// the tree asset in its own layer; instanceable copies share composed geometry.
const rows = [{ season: "summer", z: -1.1 }, { season: "autumn", z: 0 }, { season: "winter", z: 1.1 }];
const rowName = season => season[0].toUpperCase() + season.slice(1);
stage = Usd.Stage.CreateNew("/tmp/grove/orchard.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
for (const {season} of rows) for (let i = 0; i < 5; i++) {
  const instance = stage.DefinePrim("/World/Orchard/" + rowName(season) + i, "Xform");
  await instance.GetReferences().AddReference("tree.usda", "/Tree");
  await instance.SetInstanceable(true);
}
await stage.DefinePrim("/World/HeroTree", "Xform").GetReferences().AddReference("tree.usda", "/Tree");

// 3. An instance root still takes local opinions: placement, size and its own
//    variant selection. Each row selects one season, so each row shares one
//    prototype; the trees differ only in their transforms.
for (const [row, { season, z }] of rows.entries()) {
  for (let i = 0; i < 5; i++) {
    const instance = stage.GetPrimAtPath("/World/Orchard/" + rowName(season) + i);
    await instance.GetVariantSets().GetVariantSet("season").SetVariantSelection(season);
    const size = 0.85 + 0.12 * ((i * 2 + row) % 3);
    kit.pose(stage, instance, [(i - 2) * 0.85, 0, z], [size, size, size], [0, i * 67, 0]);
  }
}

// 4. Below an instance root, the prims come from the shared prototype and
//    cannot be edited. The hero tree is not instanceable, so it can: add a
//    birdhouse under it and recolour its own canopy, without touching the asset.
const hero = stage.GetPrimAtPath("/World/HeroTree");
await hero.GetVariantSets().GetVariantSet("season").SetVariantSelection("autumn");
kit.pose(stage, hero, [-2.6, 0.08, 2], [1.3, 1.3, 1.3], [0, -20, 0]);
kit.color(stage.GetPrimAtPath("/World/HeroTree/AutumnCanopy"), colors.violet);
kit.box(stage, "/World/HeroTree/Birdhouse", [0, 0.48, 0.13], [0.16, 0.18, 0.14], colors.teal);
kit.box(stage, "/World/HeroTree/BirdhouseRoof", [0, 0.6, 0.13], [0.13, 0.13, 0.17], colors.gold, [0, 0, 45]);
kit.lathe(stage, "/World/HeroPlinth", [-2.6, 0, 2], [[0.01, 0], [0.62, 0], [0.62, 0.08], [0.01, 0.08]], colors.cream);

// One bed per row: everything standing on a bed shares that row's prototype.
const beds = { summer: [0.32, 0.5, 0.3], autumn: [0.62, 0.34, 0.2], winter: [0.78, 0.84, 0.92] };
for (const { season, z } of rows) kit.box(stage, "/World/Beds/" + rowName(season), [0, 0.02, z], [4.4, 0.04, 0.8], beds[season]);
kit.box(stage, "/World/Ground", [-0.45, -0.05, 0.5], [5.9, 0.1, 4.5], [0.24, 0.3, 0.26]);

const trees = [...rows.flatMap(({ season }) => [0, 1, 2, 3, 4].map((i) => "/World/Orchard/" + rowName(season) + i)), "/World/HeroTree"];
print(trees.map((path) => {
  const prim = stage.GetPrimAtPath(path);
  return { path, instance: prim.IsInstance(), season: prim.GetVariantSelection("season") };
}));`,
  },
];

// The four native authoring examples used by the standalone API test buttons.
for (const [kind, title] of [['preview', 'API Preview Surface'], ['animated', 'API Animated Material'], ['variant-sphere', 'API Variant Sphere'], ['variant-cube', 'API Variant Cube']]) {
  replExamples.push({
    title, group: 'API Authoring',
    code: `stage = await createApiStage(USD, "${kind}", "/tmp/api-${kind}.usda");\nprint(stage.GetRootLayer().ExportToString());`,
  });
}

// Examples that author a complete light rig are shown with those lights alone,
// in authored UsdLux units, without the viewer's environment or headlight.
export const hasAuthoredLighting = example => example.group === 'Lighting' || example.authoredLighting === true;

export const apiExampleAssets = replExamples.map(example => {
  const id = example.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    group: 'JavaScript API', label: example.title, exampleGroup: example.group,
    root: `api/examples.js#${id}`, executable: id,
    ...(hasAuthoredLighting(example) ? {scenePrimitiveLightIntensityScale: 1, environment: 'none'} : {}),
    ...(apiPreviewIds.has(id) ? { thumbnail: `thumbnails/api-${id}.png` } : {}),
  };
});
