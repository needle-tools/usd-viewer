import { apiPreviewIds } from './previews.js';

// Every example authors a small, visible scene with the OpenUSD bindings.
// `sceneKit` (scene-kit.js) supplies short helpers for the decorative geometry,
// so each example's own API calls stay in the foreground.
export const replExamples = [
  {
    title: "Hello World",
    group: "Scene Building",
    code: `// The smallest useful stage: an Xform with one Sphere child.
const kit = sceneKit, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/hello-world.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);

// Schema classes define typed prims and offer schema-aware attribute creators.
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
    code: `// Stage metadata lives on the root layer: up axis, time range and frame rate.
const kit = sceneKit, colors = kit.colors;
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
for (let frame = 0; frame < fps; frame++) {
  const inner = frame % 6 === 0 ? 1.02 : 1.18;      // quarter-second ticks are longer
  kit.beam(stage, "/World/Clock/Tick" + frame, onDial(frame / fps, inner), onDial(frame / fps, 1.32), 0.03, colors.gold);
}
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
    code: `// Stage.DefinePrim accepts any registered type name, even without a JS schema class.
const kit = sceneKit, colors = kit.colors;
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
    code: `// Typed schemas carry their own attributes: Sphere.radius and Cube.size.
const kit = sceneKit, colors = kit.colors;
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
const kit = sceneKit, colors = kit.colors;
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

print(stage.ExportToString());`,
  },
  {
    title: "Xform Ops",
    group: "Transforms",
    code: `// Xform ops apply in their authored order: translate, then rotate, then scale.
const kit = sceneKit, colors = kit.colors;
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

print(inspectPrim(model.GetPrim()));`,
  },
  {
    title: "Xform Common API",
    group: "Transforms",
    code: `// XformCommonAPI authors the standard translate/rotate/scale stack, one call each.
const kit = sceneKit, colors = kit.colors;
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
for (let floor = 1; floor < 7; floor++) {
  const y = -0.5 + floor / 7;
  kit.box(stage, "/World/Tower/Cornice" + floor, [0, y, 0], [1.12, 0.012, 1.12], colors.gold);
  kit.box(stage, "/World/Tower/Window" + floor, [0, y + 0.07, 0.505], [0.3, 0.05, 0.02], colors.ink);
}
kit.box(stage, "/World/Tower/Belfry", [0, 0.56, 0], [0.8, 0.12, 0.8], colors.coral);

// A plinth and a true vertical make the 8 degree lean readable.
kit.box(stage, "/World/Plinth", [0, -0.08, 0], [2.4, 0.16, 1.8], colors.teal);
kit.beam(stage, "/World/Vertical", [0.85, 0, -0.55], [0.85, 3.3, -0.55], 0.02, colors.coral);

print(stage.ExportToString());`,
  },
  {
    title: "Matrix Transform",
    group: "Transforms",
    code: `// One matrix op can carry a whole transform; this one only translates.
const kit = sceneKit, colors = kit.colors;
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

print(rig.GetPrim().GetAttribute("xformOp:transform").GetValueString());`,
  },
  {
    title: "Animated Radius",
    group: "Animation",
    code: `// Time samples let one attribute hold different values at different frames.
const kit = sceneKit, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/animated-radius.usda");
stage.SetUpAxis("Y");
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(48);

const sphere = UsdGeom.Sphere.Define(stage, "/World/Pulse");
const radius = sphere.CreateRadiusAttr(0.5);   // the default value, used when no time is given
const keys = [[1, 0.5], [24, 1.5], [48, 0.5]];  // [frame, radius]
for (const [frame, value] of keys) radius.Set(value, frame);
kit.color(sphere, colors.coral);

// The largest keyed radius as a ring around the pulse...
kit.torus(stage, "/World/PeakRadius", [0, 0, 0], 1.5, 0.03, colors.gold, "y");
// ...and the keys plotted behind it like a curve editor: x is time, y is radius.
const plot = ([frame, value]) => [-1.6 + (frame - 1) / 47 * 3.2, value - 0.5, -1.9];
kit.box(stage, "/World/Graph/Backdrop", [0, 0.5, -1.98], [3.6, 1.6, 0.05], colors.ink);
keys.forEach((key, i) => {
  kit.sphere(stage, "/World/Graph/Key" + i, plot(key), 0.08, colors.gold);
  if (i > 0) kit.beam(stage, "/World/Graph/Segment" + i, plot(keys[i - 1]), plot(key), 0.025, colors.cream);
});

print(sphere.GetPrim().GetAttribute("radius").GetValueStringAtTime(24));`,
  },
  {
    title: "Animated Transform",
    group: "Animation",
    code: `// Animate a translate op with two keyframes; USD interpolates the frames between.
const kit = sceneKit, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/animated-transform.usda");
stage.SetUpAxis("Y");
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(60);

const cube = UsdGeom.Cube.Define(stage, "/World/MovingCube");
cube.CreateSizeAttr(0.8);
kit.color(cube, colors.coral);
const translate = cube.AddTranslateOp();
translate.Set(Gf.Vec3d(-2, 0, 0), 1);
translate.Set(Gf.Vec3d(2, 0, 0), 60);
translate.Set(Gf.Vec3d(-2, 0, 0));   // default value for still previews: the start position

// A short rail track, ending in a gate the cube drives through.
kit.box(stage, "/World/Track/Bed", [0, -0.55, 0], [5.5, 0.1, 1.1], colors.ink);
for (let i = 0; i < 9; i++) {
  kit.box(stage, "/World/Track/Sleeper" + i, [-2.4 + i * 0.6, -0.47, 0], [0.09, 0.05, 1], colors.cream);
}
for (const side of [-1, 1]) {
  kit.beam(stage, "/World/Track/Rail" + (side < 0 ? "Left" : "Right"), [-2.6, -0.43, side * 0.4], [2.6, -0.43, side * 0.4], 0.03, colors.gold);
}
kit.group(stage, "/World/Track/FinishGate", [2, 0, 0], [0, 90, 0]);
kit.torus(stage, "/World/Track/FinishGate/Hoop", [0, 0, 0], 0.72, 0.05, colors.teal);

print(cube.GetPrim().GetAttribute("xformOp:translate").GetTimeSamples().size());`,
  },
  {
    title: "Shader Color Inputs",
    group: "Scene Building",
    code: `// UsdPreviewSurface shaders expose typed inputs such as diffuseColor.
const kit = sceneKit, colors = kit.colors;
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

print(stage.ExportToString());`,
  },
  {
    title: "Visibility",
    group: "Inspection",
    code: `// visibility is inherited: "invisible" hides a prim and all of its descendants.
const kit = sceneKit, colors = kit.colors;
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
for (let i = 0; i < 16; i++) {
  const angle = i / 16 * 2 * Math.PI;
  kit.sphere(stage, "/World/HiddenOutline/Dot" + i, [0.95 + 0.75 * Math.cos(angle), 0.75 + 0.75 * Math.sin(angle), 0], 0.045, colors.gold);
}
kit.box(stage, "/World/Stage", [0, -0.06, 0], [3.8, 0.12, 1.4], colors.ink);

print(listPrims(stage).map((path) => inspectPrim(stage.GetPrimAtPath(path))));`,
  },
  {
    title: "Purpose",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/purpose.usda");
stage.SetUpAxis("Y");
const renderMesh = UsdGeom.Cube.Define(stage, "/World/RenderMesh");
const proxyMesh = UsdGeom.Cube.Define(stage, "/World/ProxyMesh");

renderMesh.CreatePurposeAttr(UsdGeom.Tokens.render);
proxyMesh.CreatePurposeAttr(UsdGeom.Tokens.proxy);

k.pose(stage,renderMesh,[-0.9,0,0],[0.5,0.7,0.5]);
k.pose(stage,proxyMesh,[0.9,0,0],[0.6,0.8,0.6]);
k.color(renderMesh,c.coral); k.color(proxyMesh,c.teal);
// Default-purpose silhouette stays visible when viewers omit render/proxy purposes.
for(const x of [-0.9,0.9]) for(let i=0;i<4;i++) {const a=i*Math.PI/2+Math.PI/4,b=a+Math.PI/2; k.beam(stage,"/World/Bounds"+(x<0?"R":"P")+i,[x+0.8*Math.cos(a),0.8*Math.sin(a),0.65],[x+0.8*Math.cos(b),0.8*Math.sin(b),0.65],0.035,c.gold);}
k.sphere(stage,"/World/PurposeKey",[0,1.4,0],0.25,c.cream);

print(stage.ExportToString());`,
  },
  {
    title: "Custom Properties",
    group: "Authoring",
    code: `// userProperties: is the conventional namespace for pipeline data on a prim.
const kit = sceneKit, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/custom-properties.usda");
stage.SetUpAxis("Y");
const prim = stage.DefinePrim("/World/Asset", "Xform");

prim.CreateAttribute("userProperties:assetId", Sdf.ValueTypeNames.String, true).Set("asset-042");
prim.CreateAttribute("userProperties:massKg", Sdf.ValueTypeNames.Float, true).Set(12.5);
prim.CreateAttribute("userProperties:approved", Sdf.ValueTypeNames.Bool, true).Set(true);

// Values read back as strings ("1" for true). Let the approval drive the status lamp.
const approved = prim.GetAttribute("userProperties:approved").GetValueString() === "1";

// A tool case; its parts are children of /World/Asset and share its turn.
kit.pose(stage, prim, [0, 0, 0], [1, 1, 1], [0, 15, 0]);
kit.box(stage, "/World/Asset/Case", [0, 0.6, 0], [2, 1.2, 1], colors.coral);
kit.box(stage, "/World/Asset/Seam", [0, 0.95, 0], [2.04, 0.08, 1.04], colors.ink);
kit.torus(stage, "/World/Asset/Handle", [0, 1.2, 0], 0.36, 0.06, colors.gold, "z", 0.5);
for (const x of [-0.65, 0.65]) {
  kit.box(stage, "/World/Asset/Latch" + (x < 0 ? "Left" : "Right"), [x, 0.95, 0.52], [0.18, 0.26, 0.06], colors.cream);
}
kit.sphere(stage, "/World/Asset/StatusLamp", [0, 0.6, 0.52], 0.11, approved ? colors.teal : colors.coral);

print(inspectPrim(prim));`,
  },
  {
    title: "Relationships",
    group: "Authoring",
    code: `// A relationship stores paths to other prims. Here a controller targets two receivers.
const kit = sceneKit, colors = kit.colors;
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
    code: `// A Material's surface output connects to a UsdPreviewSurface shader.
const kit = sceneKit, colors = kit.colors;
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

print(stage.ExportToString());`,
  },
  {
    title: "Bind Material",
    group: "Materials",
    code: `// MaterialBindingAPI connects geometry to a material through material:binding.
const kit = sceneKit, colors = kit.colors;
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
const kit = sceneKit, colors = kit.colors;
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

print(stage.ExportToString());`,
  },
  {
    title: "Variant Set",
    group: "Composition",
    code: `// A variant set stores alternative opinions; exactly one variant is selected.
const kit = sceneKit, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/variant-set.usda");
stage.SetUpAxis("Y");
const model = UsdGeom.Xform.Define(stage, "/World/Model").GetPrim();
const variants = model.GetVariantSets().AddVariantSet("shape");

variants.AddVariant("sphere");
variants.AddVariant("cube");
// Both variants define /World/Model/Geom, each with a different schema type.
variants.DefinePrim("sphere", "/World/Model/Geom", "Sphere").CreateAttribute("radius", Sdf.ValueTypeNames.Double, false).Set(0.9);
variants.DefinePrim("cube", "/World/Model/Geom", "Cube").CreateAttribute("size", Sdf.ValueTypeNames.Double, false).Set(1.4);
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
    code: `const kit = sceneKit;
const colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/variant-switch.usda");
stage.SetUpAxis("Y");
const product = stage.DefinePrim("/World/Product", "Xform");
const look = product.GetVariantSets().AddVariantSet("look");

// Each variant defines its own child. DefinePrim selects that variant while
// defining the prim; subsequent attribute writes use the stage's edit target.
// Distinct child paths keep those values from overriding the other look.
for (const [name, color, scale] of [
  ["warm", colors.coral, [0.9, 1.25, 0.75]],
  ["cool", colors.blue, [1.05, 0.85, 1.05]],
]) {
  look.AddVariant(name);
  const path = "/World/Product/" + (name === "warm" ? "WarmSwatch" : "CoolSwatch");
  const swatch = look.DefinePrim(name, path, "Sphere");
  swatch.CreateAttribute("userProperties:look", Sdf.ValueTypeNames.Token, true).Set(name);
  kit.color(swatch, color);
  kit.pose(stage, swatch, [0, 0, 0], scale);
}

// The collar and crown are shared: they remain outside the variant set.
kit.torus(stage, "/World/Product/Collar", [0, -0.85, 0], 0.7, 0.12, colors.ink, "y");
kit.torus(stage, "/World/Product/Crown", [0, 0.9, 0], 0.62, 0.07, colors.gold, "y");
kit.sphere(stage, "/World/WarmChip", [-1.6, -0.4, 0], 0.3, colors.coral);
kit.sphere(stage, "/World/CoolChip", [1.6, -0.4, 0], 0.3, colors.blue);

await look.SetVariantSelection("cool");
print(stage.GetPrimAtPath("/World/Product/CoolSwatch").GetAttribute("userProperties:look").GetValueString());
await look.SetVariantSelection("warm");
print(stage.GetPrimAtPath("/World/Product/WarmSwatch").GetAttribute("userProperties:look").GetValueString());`,
  },
  {
    title: "Payload",
    group: "Composition",
    code: `// A payload is a reference that can be loaded or unloaded on demand.
const kit = sceneKit, colors = kit.colors;
const payloadStage = Usd.Stage.CreateNew("/tmp/payload-asset.usda");
payloadStage.DefinePrim("/PayloadRoot", "Xform");
payloadStage.DefinePrim("/PayloadRoot/Sphere", "Sphere");
payloadStage.Export("/tmp/payload-asset.usda");

stage = Usd.Stage.CreateNew("/tmp/payload-root.usda");
stage.SetUpAxis("Y");
const holder = stage.DefinePrim("/World/PayloadHolder", "Xform");
holder.GetPayloads().AddPayload("payload-asset.usda", "/PayloadRoot");

// The payload's sphere now appears under the holder; colour it from the root layer.
kit.color(stage.GetPrimAtPath("/World/PayloadHolder/Sphere"), colors.gold);

// A shipping-crate frame around the delivered content: the cube's 12 edges.
const s = 1.3;
for (const a of [-s, s]) for (const b of [-s, s]) {
  const id = (a < 0 ? "N" : "P") + (b < 0 ? "N" : "P");
  kit.beam(stage, "/World/Crate/EdgeX" + id, [-s, a, b], [s, a, b], 0.07, colors.teal);
  kit.beam(stage, "/World/Crate/EdgeY" + id, [a, -s, b], [a, s, b], 0.07, colors.teal);
  kit.beam(stage, "/World/Crate/EdgeZ" + id, [a, b, -s], [a, b, s], 0.07, colors.teal);
}

print(inspectPrim(holder));`,
  },
  {
    title: "Payload Load State",
    group: "Composition",
    code: `// Payloads can be unloaded to save memory and loaded again on demand.
const kit = sceneKit, colors = kit.colors;
const payloadStage = Usd.Stage.CreateNew("/tmp/payload-load-asset.usda");
payloadStage.DefinePrim("/PayloadRoot", "Xform");
payloadStage.DefinePrim("/PayloadRoot/Cube", "Cube");
payloadStage.Export("/tmp/payload-load-asset.usda");

stage = Usd.Stage.CreateNew("/tmp/payload-load.usda");
stage.SetUpAxis("Y");
const holder = stage.DefinePrim("/World/Holder", "Xform");
holder.GetPayloads().AddPayload("payload-load-asset.usda", "/PayloadRoot");

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
    code: `// Any .usda text can be written to the virtual filesystem and opened as a stage.
const kit = sceneKit, colors = kit.colors;
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
    code: `// A reference grafts a prim and its children from another layer into this stage.
const kit = sceneKit, colors = kit.colors;
mountText("/tmp/reference-base.usda", \`#usda 1.0
(
    defaultPrim = "Mushroom"
    upAxis = "Y"
)

def Xform "Mushroom"
{
    def Cylinder "Stem"
    {
        uniform token axis = "Y"
        double height = 0.8
        double radius = 0.16
        color3f[] primvars:displayColor = [(0.86, 0.83, 0.7)]
        double3 xformOp:translate = (0, 0.4, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }

    def Sphere "Cap"
    {
        double radius = 0.5
        color3f[] primvars:displayColor = [(0.96, 0.22, 0.12)]
        double3 xformOp:translate = (0, 0.8, 0)
        float3 xformOp:scale = (1, 0.55, 1)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
    }
}
\`);
// The root layer references the mushroom twice: once on /World, once on a child.
// (The bindings can add payloads but not references, so the arcs are written as text.)
mountText("/tmp/reference-root.usda", \`#usda 1.0
def Xform "World" (
    prepend references = @reference-base.usda@</Mushroom>
)
{
    def Xform "Neighbour" (
        prepend references = @reference-base.usda@</Mushroom>
    )
    {
    }
}
\`);

stage = await Usd.Stage.Open("/tmp/reference-root.usda");
stage.SetUpAxis("Y");

// Local opinions in the root layer are stronger than referenced ones: the
// neighbour gets its own place, size and cap colour without editing the asset.
kit.pose(stage, stage.GetPrimAtPath("/World/Neighbour"), [0.95, 0, 0.4], [0.62, 0.62, 0.62], [0, 30, 0]);
kit.color(stage.GetPrimAtPath("/World/Neighbour/Cap"), colors.gold);
kit.lathe(stage, "/World/Moss", [0.35, 0, 0.15], [[0.01, -0.08], [1.5, -0.08], [1.35, 0.01], [0.01, 0.04]], [0.3, 0.5, 0.32]);

print(inspectPrim(stage.GetPrimAtPath("/World")));`,
  },
  {
    title: "Layer Stack",
    group: "Inspection",
    code: `// A stage's layer stack: its session layer and root layer, plus any sublayers.
const kit = sceneKit, colors = kit.colors;
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
    code: `// GetUsedLayers lists every layer the composed stage depends on.
const kit = sceneKit, colors = kit.colors;
mountText("/tmp/used-base.usda", \`#usda 1.0
def Scope "Library" {}
\`);
mountText("/tmp/used-root.usda", \`#usda 1.0
def Xform "World" (
    prepend references = @used-base.usda@</Library>
)
{
}
\`);

stage = await Usd.Stage.Open("/tmp/used-root.usda");
stage.SetUpAxis("Y");

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
    code: `// TraverseAll visits every prim depth-first, parents before children.
const kit = sceneKit, colors = kit.colors;
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
    code: `// GetPropertyNames lists built-in schema properties as well as authored ones.
const kit = sceneKit, colors = kit.colors;
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
    code: `// GetResolveInfo reports where an attribute's value comes from.
const kit = sceneKit, colors = kit.colors;
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
const measuredRadius = Number(attr.GetValueString());
for (let i = 0; i < Math.round(measuredRadius * 8); i++) {
  kit.box(stage, "/World/Probe/Tick" + i, [-0.8 + i * 0.17, -0.53, 0.35], [0.025, 0.025, i % 2 ? 0.12 : 0.24], colors.cream);
}

print({
  value: attr.GetValueString(),
  resolve: attr.GetResolveInfo(Usd.TimeCode.Default()),
});`,
  },
  {
    title: "Prim Stack",
    group: "Inspection",
    code: `// A prim stack lists every spec that contributes to a prim, strongest first.
const kit = sceneKit, colors = kit.colors;
mountText("/tmp/stack-base.usda", \`#usda 1.0
def Xform "Asset"
{
    custom string userProperties:source = "base"
}
\`);
mountText("/tmp/stack-root.usda", \`#usda 1.0
def Xform "World" (
    prepend references = @stack-base.usda@</Asset>
)
{
    custom string userProperties:source = "root"
}
\`);

stage = await Usd.Stage.Open("/tmp/stack-root.usda");
stage.SetUpAxis("Y");
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
    code: `// GetCompositionArcs lists the arcs (root, references, payloads...) that build a prim.
const kit = sceneKit, colors = kit.colors;
mountText("/tmp/arcs-base.usda", \`#usda 1.0
def Xform "Asset" {}
\`);
mountText("/tmp/arcs-root.usda", \`#usda 1.0
def Xform "World" (
    prepend references = @arcs-base.usda@</Asset>
)
{
}
\`);

stage = await Usd.Stage.Open("/tmp/arcs-root.usda");
stage.SetUpAxis("Y");
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
    code: `// openFixture mounts a packaged test asset and opens it as the stage.
const kit = sceneKit, colors = kit.colors;
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
  mesh: inspectPrim(triangle),
});`,
  },
  {
    title: "Fixture: Face-Varying Normals Matrix",
    group: "Fixture Smoke",
    code: `// Keep the fixture's authored points and normals; re-arrange its meshes on a rack.
const kit = sceneKit, colors = kit.colors;
stage = await openFixture("Face-Varying Normals Matrix");

// Attribute values come back as text, so pull the numbers out of the string.
const numbersIn = (text) => (text.match(/[-+]?(?:\\d*\\.)?\\d+(?:e[-+]?\\d+)?/gi) ?? []).map(Number);
const cells = vectorToArray(stage.TraverseAll()).filter((prim) => prim.GetTypeName() === "Mesh");
cells.forEach((cell, i) => {
  // Centre each mesh in its rack slot using the middle of its point bounds.
  const values = numbersIn(cell.GetAttribute("points").GetValueString());
  const center = [0, 1, 2].map((axis) => {
    const coords = values.filter((_, j) => j % 3 === axis);
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
  const normal = normals.IsValid() ? numbersIn(normals.GetValueString()).slice(0, 3) : [];
  if (normal.length === 3) {
    const length = Math.hypot(...normal) || 1;
    kit.beam(stage, "/World/Rack/Normal" + i, [x, y, 0.15], [x + normal[0] / length * 0.4, y + normal[1] / length * 0.4, 0.15 + normal[2] / length * 0.4], 0.025, colors.gold);
  }
});

print(listPrims(stage).filter((path) => {
  return stage.GetPrimAtPath(path).GetTypeName() === "Mesh";
}));`,
  },
  {
    title: "Fixture: Parent Folder Reference",
    group: "Fixture Smoke",
    code: `// The fixture references a cube through a "../" asset path; it resolves relative to the layer.
const kit = sceneKit, colors = kit.colors;
stage = await openFixture("Parent Folder References");

kit.color(stage.GetPrimAtPath("/World/Shape"), colors.teal);
// A folder with a tab, and a link up to the shared asset in the parent folder.
kit.box(stage, "/World/ParentFolder", [0, -1.1, 0], [2.6, 0.12, 1.8], colors.gold);
kit.box(stage, "/World/ParentTab", [-0.7, -0.8, -0.85], [0.9, 0.5, 0.12], colors.gold);
kit.beam(stage, "/World/RelativeLink", [1.4, -0.9, 0], [1.4, 0.8, 0], 0.045, colors.coral);
kit.sphere(stage, "/World/SharedAsset", [1.4, 1.1, 0], 0.24, colors.coral);

print({
  usedLayers: stage.GetUsedLayers(false).map((layer) => layer.displayName),
  world: inspectPrim(stage.GetPrimAtPath("/World")),
  referencedCube: inspectPrim(stage.GetPrimAtPath("/World/Shape")),
});`,
  },
  {
    title: "Fixture: Payload Root",
    group: "Fixture Smoke",
    code: `// Payloads in a fixture load automatically when the stage opens.
const kit = sceneKit, colors = kit.colors;
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
const kit = sceneKit, colors = kit.colors;
stage = await openFixture("usd-concepts/native_instances.usda");

// "instanceable" and "references" are prim metadata, which these bindings cannot
// author. Append seven more instance declarations to the layer text and reopen it.
const declarations = [];
for (let i = 0; i < 7; i++) {
  declarations.push(\`    def Xform "Instance\${i}" (
        instanceable = true
        prepend references = </Prototype>
    )
    {
    }\`);
}
mountText("/tmp/native-instance-sculpture.usda", stage.GetRootLayer().ExportToString() + \`
def Xform "Spiral"
{
\${declarations.join("\\n")}
}
\`);
stage = await Usd.Stage.Open("/tmp/native-instance-sculpture.usda");

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
    code: `// A PointInstancer draws prototypes at positions given by parallel per-instance arrays.
const kit = sceneKit, colors = kit.colors;
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

// Every per-instance array needs one entry per instance, but quath[] orientations
// cannot be set through these bindings: rewrite that line with identity rotations.
const identities = Array(count).fill("(1, 0, 0, 0)").join(", ");
const layerText = stage.GetRootLayer().ExportToString().replace(/quath\\[\\] orientations = \\[.*?\\]/, "quath[] orientations = [" + identities + "]");
mountText("/tmp/point-instancer-sculpture.usda", layerText);
stage = await Usd.Stage.Open("/tmp/point-instancer-sculpture.usda");
kit.torus(stage, "/World/ScatterFoot", [0, -0.3, 0], 1.3, 0.055, colors.teal, "y");

print(inspectPrim(stage.GetPrimAtPath("/World/Scatter")));`,
  },
  {
    title: "Fixture: Camera + Light",
    group: "Fixture Smoke",
    code: `// Re-aim the fixture's shot camera and retune one of its lights.
const kit = sceneKit, colors = kit.colors;
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
  camera: inspectPrim(shot),
  lights: ["KeyLight", "FillLight", "SunLight", "SkyLight", "ApiLight"].map((name) => {
    const light = stage.GetPrimAtPath("/World/" + name);
    return { name, type: light.GetTypeName(), intensity: light.GetAttribute("inputs:intensity").GetValueString() };
  }),
});`,
    authoredLighting: true,
  },
  {
    title: "Fixture: MaterialX Texture + Noise",
    group: "Fixture Smoke",
    code: `// The fixture's MaterialX-bound quad stays as authored: stretch it on a loom.
const kit = sceneKit, colors = kit.colors;
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
    code: `// ObjectsChanged notices report which paths an edit touched.
const kit = sceneKit, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/notices.usda");
stage.SetUpAxis("Y");
const prim = stage.DefinePrim("/World/Thing", "Xform");
const notices = [];

// Listen, make one edit, give the notice a tick to arrive, then stop listening.
const listener = stage.RegisterObjectsChanged((notice) => notices.push(notice));
prim.SetActive(false);
await new Promise((resolve) => setTimeout(resolve, 0));
stage.RevokeObjectsChanged(listener);

// A dark "before" block, a lit "after" block, and ripples carrying the notice across.
kit.box(stage, "/World/Before", [-1.2, 0, 0], [0.7, 0.7, 0.7], colors.ink, [0, 20, 0]);
kit.box(stage, "/World/After", [1, 0.2, 0], [1.1, 1.1, 1.1], colors.teal, [0, 20, 0]);
for (let i = 0; i < 3; i++) kit.torus(stage, "/World/Notice" + i, [-0.1, 0.1, 0], 0.35 + i * 0.25, 0.035, colors.gold, "y", 0.7);
kit.sphere(stage, "/World/Change", [1, 1, 0], 0.18, colors.coral);

print(notices);`,
  },
  {
    title: "Active State",
    group: "Authoring",
    code: `// Deactivating a prim removes it (and its children) from the composed stage
// without deleting its data.
const kit = sceneKit, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/active-state.usda");
stage.SetUpAxis("Y");
const keep = stage.DefinePrim("/World/Keep", "Cube");
const mute = stage.DefinePrim("/World/Mute", "Cube");

mute.SetActive(false);

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
    code: `// Applied API schemas add behaviour to any prim; MaterialBindingAPI enables material:binding.
const kit = sceneKit, colors = kit.colors;
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

print(stage.ExportToString());`,
  },
  {
    title: "Cameras And Lights",
    group: "Scene Building",
    code: `// Cameras have a schema class; lights are generic prims with "inputs:" attributes.
const kit = sceneKit, colors = kit.colors;
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

print(stage.ExportToString());`,
    authoredLighting: true,
  },
  {
    title: "USDZ Package",
    group: "Export",
    code: `// CreateUsdzPackage zips a layer and its dependencies into one .usdz file.
const kit = sceneKit, colors = kit.colors;
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
const ok = USD.CreateUsdzPackage("/tmp/package-source.usda", "/tmp/package.usdz");
const bytes = USD.ReadFile("/tmp/package.usdz");

// A .usdz is a zip archive: it starts with the bytes "PK" (80, 75).
print({ ok, byteLength: bytes.byteLength, zipMagic: [bytes[0], bytes[1]] });`,
  },
  {
    title: "Reopen Verification",
    group: "Export",
    code: `// Export a stage, open the file again and check the value survived the round trip.
const kit = sceneKit, colors = kit.colors;
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

stage.Export("/tmp/reopen.usda");
const reopened = await Usd.Stage.Open("/tmp/reopen.usda");
print(reopened.GetPrimAtPath("/World/Sphere").GetAttribute("radius").GetValueString());`,
  },
  {
    title: "Build Info",
    group: "Runtime",
    code: `// GetBuildInfoJson describes the OpenUSD build and its optional modules.
const kit = sceneKit, colors = kit.colors;
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
    code: `// The wasm runtime has an in-memory filesystem; layers and textures live there.
const kit = sceneKit, colors = kit.colors;
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
    code: `// Sdf.Path builds prim and property paths without touching a stage.
const kit = sceneKit, colors = kit.colors;
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
const kit = sceneKit, colors = kit.colors;
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

// An authored camera gives the scene a repeatable shot.
const camera = UsdGeom.Camera.Define(stage, "/World/Camera");
camera.CreateFocalLengthAttr(38);
kit.attr(camera, "horizontalAperture", "float", 36);
kit.attr(camera, "verticalAperture", "float", 27);
kit.aim(stage, camera.GetPrim(), [4, 3.3, 5], [0, 0.75, 0]);

print(vectorToArray(stage.GetPrimAtPath("/World/Lights").GetChildren()).map((light) => inspectPrim(light)));`,
  },
  {
    title: "Shaped Spotlights",
    group: "Lighting",
    code: `// ShapingAPI turns a light into a spotlight with a cone angle and a soft edge.
// Three coloured spots overlap on a white stage and mix additively.
const kit = sceneKit, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/shaped-spotlights.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);

const white = [0.92, 0.92, 0.92];
kit.lathe(stage, "/World/Stage", [0, 0, 0], [[0.01, -0.15], [2.2, -0.15], [2.2, 0], [0.01, 0]], white);
kit.sphere(stage, "/World/Performer", [0, 0.45, 0], 0.45, white);
kit.torus(stage, "/World/Truss", [0, 3.4, 0], 2.2, 0.05, colors.ink, "y");

const spots = [
  { name: "Red", color: [1, 0.12, 0.1], degrees: 90 },
  { name: "Green", color: [0.1, 1, 0.2], degrees: 210 },
  { name: "Blue", color: [0.15, 0.3, 1], degrees: 330 },
];
for (const spot of spots) {
  const light = stage.DefinePrim("/World/Spots/" + spot.name, "SphereLight");
  light.ApplyAPI("ShapingAPI");   // adds the inputs:shaping:* attributes
  // Intensity is luminance (nits). A small emitter needs high luminance:
  // 4000 * pi * 0.08² gives roughly 80 candela in the point approximation.
  light.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(4000);
  light.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(...spot.color));
  light.CreateAttribute("inputs:radius", Sdf.ValueTypeNames.Float, false).Set(0.08);
  light.CreateAttribute("inputs:shaping:cone:angle", Sdf.ValueTypeNames.Float, false).Set(18);    // degrees off the axis
  light.CreateAttribute("inputs:shaping:cone:softness", Sdf.ValueTypeNames.Float, false).Set(0.25);

  // Hang each spot on the truss and aim it a little off-centre so the pools overlap.
  const angle = spot.degrees * Math.PI / 180, ring = [Math.cos(angle), 0, Math.sin(angle)];
  const position = [2.2 * ring[0], 3.3, 2.2 * ring[2]];
  kit.aim(stage, light, position, [0.45 * ring[0], 0, 0.45 * ring[2]]);
  kit.sphere(stage, "/World/Truss/Can" + spot.name, [position[0], 3.5, position[2]], 0.1, spot.color);
}

// An authored camera gives the scene a repeatable shot.
const camera = UsdGeom.Camera.Define(stage, "/World/Camera");
camera.CreateFocalLengthAttr(40);
kit.attr(camera, "horizontalAperture", "float", 36);
kit.attr(camera, "verticalAperture", "float", 27);
kit.aim(stage, camera.GetPrim(), [5, 4.5, 6], [0, 1.5, 0]);

print(spots.map((spot) => inspectPrim(stage.GetPrimAtPath("/World/Spots/" + spot.name))));`,
  },
  {
    title: "Sun Cycle",
    group: "Lighting",
    code: `// Lights animate like any other prim: time-sample a sun's rotation, colour
// and intensity across a day. Still previews show the default (golden hour).
const kit = sceneKit, colors = kit.colors;
stage = Usd.Stage.CreateNew("/tmp/sun-cycle.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(48);

// A lighthouse on a rock in a round patch of sea.
kit.lathe(stage, "/World/Sea", [0, 0, 0], [[0.01, -0.1], [2.4, -0.1], [2.4, 0], [0.01, 0]], [0.12, 0.4, 0.62]);
kit.sphere(stage, "/World/Rock", [0, 0, 0], 0.9, [0.42, 0.4, 0.38], [1, 0.45, 0.85]);
const towerRadius = (height) => 0.34 - 0.1 * height / 1.5;   // tapers toward the top
kit.lathe(stage, "/World/Lighthouse/Tower", [0, 0.3, 0], [[towerRadius(0), 0], [towerRadius(1.5), 1.5]], colors.cream);
for (const [i, from, to] of [[0, 0.4, 0.65], [1, 0.95, 1.2]]) {
  kit.lathe(stage, "/World/Lighthouse/Band" + i, [0, 0.3, 0], [[towerRadius(from) + 0.01, from], [towerRadius(to) + 0.01, to]], colors.coral);
}
kit.torus(stage, "/World/Lighthouse/Gallery", [0, 1.82, 0], 0.3, 0.035, colors.ink, "y");
kit.sphere(stage, "/World/Lighthouse/Lamp", [0, 1.98, 0], 0.17, colors.gold);
kit.lathe(stage, "/World/Lighthouse/Roof", [0, 2.1, 0], [[0.27, 0], [0.01, 0.3]], colors.coral);

// The sun travels a half circle tilted toward the back. The arc, the visible
// sun disc and the light share one tilted group, so the maths stays 2D.
kit.group(stage, "/World/Sky", [0, 0, 0], [-30, 20, 0]);
kit.torus(stage, "/World/Sky/Arc", [0, 0, 0], 3.2, 0.015, colors.gold, "z", 0.5);
const sunDisc = UsdGeom.Sphere.Define(stage, "/World/Sky/SunDisc");
sunDisc.CreateRadiusAttr(0.22);
kit.color(sunDisc, colors.gold);
const sun = stage.DefinePrim("/World/Sky/Sun", "DistantLight");
// Normalized distant intensity is illuminance (lux), independent of sun angle.
sun.CreateAttribute("inputs:normalize", Sdf.ValueTypeNames.Bool, false).Set(true);
const sunColor = sun.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false);
const sunIntensity = sun.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false);

function placeSun(time, degrees) {
  const angle = degrees * Math.PI / 180, height = Math.sin(angle);   // 0 at the horizon, 1 at noon
  const position = [3.2 * Math.cos(angle), 3.2 * height, 0];
  UsdGeom.XformCommonAPI(sunDisc).SetTranslate(Gf.Vec3d(...position), time);
  // A DistantLight only uses its rotation: point it from the sun at the island.
  UsdGeom.XformCommonAPI(sun).SetRotate(Gf.Vec3f(...kit.lookAt(position, [0, 0, 0])), time);
  // Low sun is warm and dim, high sun white and bright.
  const warm = [1, 0.45, 0.25], noon = [1, 0.97, 0.9];
  sunColor.Set(Gf.Vec3f(...warm.map((value, i) => value + (noon[i] - value) * height)), time);
  sunIntensity.Set(0.6 + 2.4 * height, time);
}
// Key the arc every few frames so the sun follows the circle, not a straight chord.
for (let frame = 1; frame <= 46; frame += 3) placeSun(frame, 8 + 164 * (frame - 1) / 47);
placeSun(48, 172);
placeSun(Usd.TimeCode.Default(), 35);

// The sky dome tints the shadow side.
const sky = stage.DefinePrim("/World/Sky/Dome", "DomeLight");
sky.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(0.3);
sky.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(0.55, 0.7, 1));

// An authored camera gives the scene a repeatable shot.
const camera = UsdGeom.Camera.Define(stage, "/World/Camera");
camera.CreateFocalLengthAttr(40);
kit.attr(camera, "horizontalAperture", "float", 36);
kit.attr(camera, "verticalAperture", "float", 27);
kit.aim(stage, camera.GetPrim(), [6, 5, 7.5], [0, 1.3, 0]);

print({ samples: sunColor.GetNumTimeSamples(), noon: sunColor.GetValueStringAtTime(24), preview: sunColor.GetValueString() });`,
  },
  {
    title: "Weighted Skinning",
    group: "Rigging",
    code: `// UsdSkel: a Skeleton of joints, a SkelAnimation that moves them, and a mesh
// whose vertices follow the joints by weight. Here a three-joint sea frond sways.
const kit = sceneKit, colors = kit.colors;

// The bindings cannot author matrix4d[] and quatf[] arrays or primvar metadata
// (interpolation, elementSize). This small layer declares only those; everything
// else (mesh, weights, colours, bindings and the animation) is authored below.
mountText("/tmp/frond/frond-rig.usda", \`#usda 1.0
(
    defaultPrim = "World"
    endTimeCode = 49
    startTimeCode = 1
    upAxis = "Y"
)

def Xform "World"
{
    def SkelRoot "Frond"
    {
        def Skeleton "Skeleton"
        {
            uniform token[] joints = ["base", "base/mid", "base/mid/tip"]
            uniform matrix4d[] bindTransforms = [( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1) ), ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 1.1, 0, 1) ), ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 2.2, 0, 1) )]
            uniform matrix4d[] restTransforms = [( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1) ), ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 1.1, 0, 1) ), ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 1.1, 0, 1) )]
        }

        def SkelAnimation "Sway"
        {
            uniform token[] joints = ["base", "base/mid", "base/mid/tip"]
            quatf[] rotations = [(1, 0, 0, 0), (1, 0, 0, 0), (1, 0, 0, 0)]
            half3[] scales = [(1, 1, 1), (1, 1, 1), (1, 1, 1)]
        }

        def Mesh "Body"
        {
            int[] primvars:skel:jointIndices (
                elementSize = 3
                interpolation = "vertex"
            )
            float[] primvars:skel:jointWeights (
                elementSize = 3
                interpolation = "vertex"
            )
            color3f[] primvars:displayColor (
                interpolation = "vertex"
            )
        }
    }
}
\`);
stage = await Usd.Stage.Open("/tmp/frond/frond-rig.usda");

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
bodyPrim.GetAttribute("primvars:skel:jointIndices").Set(jointIndices);
bodyPrim.GetAttribute("primvars:skel:jointWeights").Set(jointWeights);
bodyPrim.GetAttribute("primvars:displayColor").Set(vertexColors);
bodyPrim.CreateRelationship("skel:skeleton", false).AddTarget("/World/Frond/Skeleton");

// 3. Animation: joint translations are local to the parent joint. Swaying the
//    mid and tip joints sideways shears the smoothly weighted body.
//    Full character rigs normally bend with rotations; this lesson uses the
//    translation arrays that are directly available in the JavaScript bindings.
const frond = stage.GetPrimAtPath("/World/Frond");
frond.ApplyAPI("SkelBindingAPI");
frond.CreateRelationship("skel:animationSource", false).AddTarget("/World/Frond/Sway");
const translations = stage.GetPrimAtPath("/World/Frond/Sway").CreateAttribute("translations", Sdf.ValueTypeNames.Float3Array, false);
// A periodic sway, with the tip following the middle joint a little later.
// Sample every two frames; matching phase at 1 and 49 closes the two-second loop.
const swayed = (phase) => [[0, 0, 0],
  [0.32 * Math.sin(phase), 1.1, 0.08 * Math.cos(phase)],
  [0.68 * Math.sin(phase - 0.4), 1.1, 0.2 * Math.sin(phase)]];
translations.Set(swayed(Math.PI / 3));   // an expressive still-preview pose
for (let frame = 1; frame <= 49; frame += 2) {
  const phase = frame === 49 ? 0 : (frame - 1) / 48 * 2 * Math.PI;
  translations.Set(swayed(phase), frame);
}

// A rock and a sandy seabed to anchor the frond.
kit.sphere(stage, "/World/Rock", [0, 0.05, 0], 0.5, [0.32, 0.34, 0.42], [1, 0.45, 0.9]);
kit.lathe(stage, "/World/Seabed", [0, 0, 0], [[0.01, -0.12], [1.9, -0.12], [1.75, 0], [0.01, 0.03]], [0.86, 0.76, 0.56]);

print({ vertices: points.length, faces: counts.length, joints: jointHeights.length, keyframes: translations.GetNumTimeSamples() });`,
  },
  {
    title: "Rigid Skinning",
    group: "Rigging",
    code: `// Rigid skinning binds a whole mesh to one joint. A telescoping antenna mast
// on a rover extends by animating its joints' translations.
const kit = sceneKit, colors = kit.colors;

// The bindings cannot author matrix4d[] or quatf[] arrays, so this layer
// declares only the skeleton's matrices and the animation's static rotations
// and scales. Bindings, meshes and the animated translations come from the API.
mountText("/tmp/rover/rover-rig.usda", \`#usda 1.0
(
    defaultPrim = "World"
    endTimeCode = 49
    startTimeCode = 1
    upAxis = "Y"
)

def Xform "World"
{
    def SkelRoot "Mast"
    {
        def Skeleton "Skeleton"
        {
            uniform token[] joints = ["base", "base/lower", "base/lower/upper"]
            uniform matrix4d[] bindTransforms = [( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1) ), ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0.3, 0, 1) ), ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0.4, 0, 1) )]
            uniform matrix4d[] restTransforms = [( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1) ), ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0.3, 0, 1) ), ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0.1, 0, 1) )]
        }

        def SkelAnimation "Extend"
        {
            uniform token[] joints = ["base", "base/lower", "base/lower/upper"]
            quatf[] rotations = [(1, 0, 0, 0), (1, 0, 0, 0), (1, 0, 0, 0)]
            half3[] scales = [(1, 1, 1), (1, 1, 1), (1, 1, 1)]
        }
    }
}
\`);
stage = await Usd.Stage.Open("/tmp/rover/rover-rig.usda");

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

print({ samples: translations.GetNumTimeSamples(), extended: translations.GetValueStringAtTime(25), collapsed: translations.GetValueStringAtTime(1) });`,
  },
  {
    title: "Splat Galaxy",
    group: "Gaussian Splats",
    code: `// Gaussian splats are soft ellipsoids stored as parallel arrays on one prim.
// The bindings have no schema class for them, so define the prim by type name
// and author each array with CreateAttribute.
const kit = sceneKit, colors = kit.colors;
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
// orientations (quatf[]) are optional; without them every splat stays axis-aligned.

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
const kit = sceneKit, colors = kit.colors;
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
const kit = sceneKit, colors = kit.colors;
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
const kit = sceneKit, colors = kit.colors;

// 1. The lantern asset, authored in its own layer.
const asset = Usd.Stage.CreateNew("/tmp/lanterns/lantern.usda");
UsdGeom.SetStageUpAxis(asset, UsdGeom.Tokens.y);
const lantern = asset.DefinePrim("/Lantern", "Xform");
// Parts outside the variant set are shared by every style.
kit.beam(asset, "/Lantern/Cord", [0, 0.55, 0], [0, 0, 0], 0.012, colors.ink);
kit.lathe(asset, "/Lantern/Cap", [0, 0, 0], [[0.01, 0.02], [0.14, 0], [0.2, -0.14], [0.01, -0.16]], colors.gold);
kit.beam(asset, "/Lantern/Tassel", [0, -1.08, 0], [0, -1.4, 0], 0.035, colors.gold);

// 2. The "style" variant set swaps the paper body. kit.inVariant routes the
//    helpers' DefinePrim calls into one variant; each style uses its own prim name.
const style = lantern.GetVariantSets().AddVariantSet("style");
const bodies = [
  { variant: "round", prim: "RoundBody", color: colors.coral, profile: [[0.06, -0.12], [0.36, -0.28], [0.46, -0.6], [0.36, -0.92], [0.06, -1.1]] },
  { variant: "tall", prim: "TallBody", color: colors.cream, profile: [[0.06, -0.12], [0.26, -0.18], [0.3, -0.6], [0.26, -1.02], [0.06, -1.1]] },
  { variant: "bell", prim: "BellBody", color: colors.teal, profile: [[0.06, -0.12], [0.16, -0.3], [0.28, -0.75], [0.5, -1.05], [0.06, -1.1]] },
];
for (const body of bodies) {
  style.AddVariant(body.variant);
  kit.lathe(kit.inVariant(asset, style, body.variant), "/Lantern/" + body.prim, [0, 0, 0], body.profile, body.color);
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
  holder.GetPayloads().AddPayload("lantern.usda", "/Lantern");
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
const kit = sceneKit, colors = kit.colors;
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

// The shot layer declares the sublayer stack, strongest first. Sublayer lists
// are layer metadata, which these bindings cannot author, so it is text.
mountText("/tmp/street/shot.usda", \`#usda 1.0
(
    subLayers = [
        @lookdev.usda@,
        @layout.usda@
    ]
    upAxis = "Y"
)
\`);
stage = await Usd.Stage.Open("/tmp/street/shot.usda");

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
const kit = sceneKit, colors = kit.colors;

// 1. The tree asset, with a "season" variant set that swaps the canopy.
const bark = [0.4, 0.28, 0.2], snow = [0.95, 0.97, 1];
const asset = Usd.Stage.CreateNew("/tmp/grove/tree.usda");
UsdGeom.SetStageUpAxis(asset, UsdGeom.Tokens.y);
const tree = asset.DefinePrim("/Tree", "Xform");
kit.lathe(asset, "/Tree/Trunk", [0, 0, 0], [[0.11, 0], [0.07, 0.7], [0.04, 1]], bark);
const season = tree.GetVariantSets().AddVariantSet("season");
for (const name of ["summer", "autumn", "winter"]) season.AddVariant(name);

const summer = kit.inVariant(asset, season, "summer");
kit.sphere(summer, "/Tree/SummerCanopy", [0, 1.05, 0], 0.42, [0.25, 0.55, 0.3]);
kit.sphere(summer, "/Tree/SummerCrown", [0.08, 1.35, 0.05], 0.28, [0.4, 0.7, 0.35]);
const autumn = kit.inVariant(asset, season, "autumn");
kit.sphere(autumn, "/Tree/AutumnCanopy", [0, 1, 0], 0.36, colors.coral);
kit.sphere(autumn, "/Tree/AutumnCrown", [-0.08, 1.28, 0], 0.24, colors.gold);
const winter = kit.inVariant(asset, season, "winter");
for (let i = 0; i < 4; i++) {
  const angle = i * Math.PI / 2 + 0.4, tip = [0.38 * Math.cos(angle), 1.3, 0.38 * Math.sin(angle)];
  kit.beam(winter, "/Tree/WinterBranch" + i, [0, 0.75, 0], tip, 0.025, bark);
  kit.sphere(winter, "/Tree/WinterSnow" + i, tip, 0.07, snow);
}
await season.SetVariantSelection("summer");
asset.GetRootLayer().Export("/tmp/grove/tree.usda");   // the layer, not a flattened stage

// 2. The orchard layer references the asset once per tree. "instanceable" and
//    "references" are prim metadata the bindings cannot author, so these
//    declarations are text; everything else is authored through the API below.
//    Three rows of five instanceable trees, one row per season, and one hero
//    tree that references the same asset but is not instanceable.
const rows = [{ season: "summer", z: -1.1 }, { season: "autumn", z: 0 }, { season: "winter", z: 1.1 }];
const rowName = (season) => season[0].toUpperCase() + season.slice(1);
const declare = (name, instanceable) => \`    def Xform "\${name}" (
        instanceable = \${instanceable}
        prepend references = @tree.usda@</Tree>
    )
    {
    }\`;
const orchard = rows.flatMap(({ season }) => [0, 1, 2, 3, 4].map((i) => declare(rowName(season) + i, true)));
mountText("/tmp/grove/orchard.usda", \`#usda 1.0
(
    upAxis = "Y"
)

def Xform "World"
{
    def Xform "Orchard"
    {
\${orchard.join("\\n")}
    }

\${declare("HeroTree", false)}
}
\`);
stage = await Usd.Stage.Open("/tmp/grove/orchard.usda");

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
