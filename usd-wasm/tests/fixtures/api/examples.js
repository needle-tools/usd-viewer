import { apiPreviewIds } from './previews.js';

export const replExamples = [
  {
    title: "Hello World",
    group: "Scene Building",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/hello-world.usda");
stage.SetUpAxis("Y");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);

const xform = UsdGeom.Xform.Define(stage, "/hello");
const sphere = UsdGeom.Sphere.Define(stage, "/hello/world");
sphere.CreateRadiusAttr(1.0);

k.pose(stage, sphere, [0, 0.25, 0], [1, 1, 1]);
k.color(sphere, c.teal);
k.torus(stage, "/hello/Orbit", [0, 0.25, 0], 1.65, 0.07, c.gold);
k.sphere(stage, "/hello/Moon", [1.5, 0.95, 0], 0.23, c.coral);
k.torus(stage, "/hello/Latitude", [0, 0.25, 0], 1.08, 0.025, c.cream, "y");

print(stage.GetRootLayer().ExportToString());`,
  },
  {
    title: "Stage Metadata",
    group: "Scene Building",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/stage-metadata.usda");
stage.SetUpAxis("Y");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
stage.SetStartTimeCode(1001);
stage.SetEndTimeCode(1048);
stage.SetTimeCodesPerSecond(24);

// A 24-tooth time wheel and a Y-up survey mast encode the authored metadata.
k.torus(stage, "/World/Clock/Rim", [0, 1.7, 0], 1.45, 0.09, c.teal);
for (let i = 0; i < stage.GetTimeCodesPerSecond(); i++) {
  const a = i * Math.PI / 12;
  k.beam(stage, "/World/Clock/Tick" + i, [1.23*Math.cos(a), 1.7+1.23*Math.sin(a), 0], [1.42*Math.cos(a), 1.7+1.42*Math.sin(a), 0], 0.035, c.gold);
}
k.beam(stage, "/World/Clock/Hand", [0,1.7,0.1], [0.75,2.45,0.1], 0.055, c.coral);
k.sphere(stage, "/World/Clock/Axle", [0,1.7,0.12], 0.13, c.cream);
k.box(stage, "/World/Timeline", [0,0,0], [3.4,0.12,0.45], c.ink);

print({
  upAxis: String.fromCharCode(stage.GetUpAxis()).toUpperCase(),
  start: stage.GetStartTimeCode(),
  end: stage.GetEndTimeCode(),
  fps: stage.GetTimeCodesPerSecond(),
});`,
  },
  {
    title: "Generic Prims",
    group: "Scene Building",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/generic-prims.usda");
stage.SetUpAxis("Y");
const world = stage.DefinePrim("/World", "Xform");
const group = stage.DefinePrim("/World/Props", "Scope");
const light = stage.DefinePrim("/World/KeyLight", "DistantLight");

light.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(800);
light.CreateAttribute("inputs:angle", Sdf.ValueTypeNames.Float, false).Set(0.45);

k.group(stage, "/World/Props/Mobile", [0,0,0]);
k.beam(stage, "/World/Props/Mobile/Spine", [0,-1,0], [0,2.3,0], 0.07, c.gold);
for (let i=0; i<5; i++) {
  const a=i*1.5, x=1.2*Math.cos(a), z=1.2*Math.sin(a), y=i*0.6-0.5;
  k.beam(stage, "/World/Props/Mobile/Arm"+i, [0,y,0], [x,y,z], 0.035, c.cream);
  k.sphere(stage, "/World/Props/Mobile/Weight"+i, [x,y,z], 0.3, i%2 ? c.coral:c.teal);
}
k.attr(light, "xformOp:rotateXYZ", "float3", [-35,-25,0]);
k.attr(light, "xformOpOrder", "token[]", ["xformOp:rotateXYZ"]);

print([world.GetTypeName(), group.GetTypeName(), light.GetTypeName()]);`,
  },
  {
    title: "Schema Shapes",
    group: "Scene Building",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/schema-shapes.usda");
stage.SetUpAxis("Y");
const root = UsdGeom.Xform.Define(stage, "/World");
const ball = UsdGeom.Sphere.Define(stage, "/World/Ball");
const box = UsdGeom.Cube.Define(stage, "/World/Box");

ball.CreateRadiusAttr(0.75);
box.CreateSizeAttr(1.25);
ball.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(0.95, 0.2, 0.15)]));
box.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(0.05, 0.25, 0.9)]));
UsdGeom.XformCommonAPI(ball).SetTranslate(Gf.Vec3d(-1.25, 0, 0));
UsdGeom.XformCommonAPI(box).SetTranslate(Gf.Vec3d(1.25, 0, 0));

k.pose(stage, ball, [-1.05,0.15,0]);
k.pose(stage, box, [1.05,-0.05,0], [1,1,1], [12,25,8]);
k.torus(stage, "/World/CircularOutline", [-1.05,0.15,-0.1], 1.04, 0.035, c.gold);
for (const [i,a,b] of [[0,[0.18,-0.9,0],[1.95,-0.9,0]],[1,[1.95,-0.9,0],[1.95,0.95,0]],[2,[1.95,0.95,0],[0.18,0.95,0]]]) k.beam(stage,"/World/Bracket"+i,a,b,0.035,c.cream);

print(listPrims(stage));`,
  },
  {
    title: "Mesh From Arrays",
    group: "Scene Building",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/mesh-arrays.usda");
stage.SetUpAxis("Y");
const mesh = UsdGeom.Mesh.Define(stage, "/World/Triangle");

mesh.CreatePointsAttr(Vt.Vec3fArray([
  Gf.Vec3f(-1, 0, 0),
  Gf.Vec3f(1, 0, 0),
  Gf.Vec3f(0, 1.5, 0),
]));
mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3]));
mesh.CreateFaceVertexIndicesAttr(Vt.IntArray([0, 1, 2]));
mesh.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(0.2, 0.8, 0.55)]));

// Keep the original three vertices intact; expose them as the corners of a sail.
k.attr(mesh, "doubleSided", "bool", true);
k.beam(stage,"/World/Mast",[0,-0.5,-0.03],[0,1.85,-0.03],0.045,c.gold);
k.beam(stage,"/World/Boom",[-1.1,-0.05,0],[1.1,-0.05,0],0.035,c.cream);
k.mesh(stage,"/World/Hull",[[-1.4,-0.2,0.3],[1.4,-0.2,0.3],[0.9,-0.65,0],[-0.9,-0.65,0],[-1.4,-0.2,-0.3],[1.4,-0.2,-0.3]],[4,4,4],[0,1,2,3,4,3,2,5,0,4,5,1],c.blue);
for (let i=0;i<3;i++) k.beam(stage,"/World/Wake"+i,[-1.5+i*0.2,-0.85,-0.7-i*0.25],[1.2-i*0.2,-0.85,-0.7-i*0.25],0.025,c.teal);

print(stage.ExportToString());`,
  },
  {
    title: "Xform Ops",
    group: "Transforms",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/xform-ops.usda");
stage.SetUpAxis("Y");
const model = UsdGeom.Xform.Define(stage, "/World/Model");

model.AddTranslateOp().Set(Gf.Vec3d(1, 2, 3));
model.AddRotateXYZOp().Set(Gf.Vec3f(0, 45, 0));
model.AddScaleOp().Set(Gf.Vec3f(1.5, 1.5, 1.5));

// The local rig is asymmetric, so translation, rotation and scale are visible.
k.box(stage,"/World/Model/Body",[0,0,0],[1.4,0.45,0.65],c.teal);
k.box(stage,"/World/Model/Fin",[-0.45,0.5,0],[0.25,0.9,0.5],c.coral,[0,0,-20]);
k.sphere(stage,"/World/Model/Nose",[0.85,0,0],0.32,c.gold);
k.beam(stage,"/World/Displacement",[0,0,0],[1,2,3],0.035,c.cream);
k.torus(stage,"/World/Origin",[0,0,0],0.45,0.045,c.ink,"y");

print(inspectPrim(model.GetPrim()));`,
  },
  {
    title: "Xform Common API",
    group: "Transforms",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/xform-common.usda");
stage.SetUpAxis("Y");
const tower = UsdGeom.Cube.Define(stage, "/World/Tower");
const xform = UsdGeom.XformCommonAPI(tower);

xform.SetTranslate(Gf.Vec3d(0, 2, 0));
xform.SetRotate(Gf.Vec3f(0, 0, 15));
xform.SetScale(Gf.Vec3f(0.4, 3, 0.4));

tower.CreateSizeAttr(1);
k.color(tower,c.coral);
for (let i=0;i<7;i++) k.box(stage,"/World/Tower/Window"+i,[0,-0.42+i*0.14,0.51],[0.65,0.065,0.025],c.cream);
k.box(stage,"/World/Counterweight",[1.2,0.65,0],[0.9,1.3,0.9],c.teal,[0,0,-12]);
k.beam(stage,"/World/Brace",[-0.5,0,0],[1.1,1.3,0],0.06,c.gold);

print(stage.ExportToString());`,
  },
  {
    title: "Matrix Transform",
    group: "Transforms",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/matrix-transform.usda");
stage.SetUpAxis("Y");
const rig = UsdGeom.Xform.Define(stage, "/World/Rig");
const matrix = Gf.Matrix4d.Identity().SetTranslate(Gf.Vec3d(4, 5, 6));

rig.AddTransformOp().Set(matrix);
k.group(stage,"/World/Rig/Elbow",[0,0,0],[0,0,30]);
k.beam(stage,"/World/Rig/Elbow/Arm",[0,0,0],[0,1.5,0],0.16,c.teal);
k.sphere(stage,"/World/Rig/Elbow/Joint",[0,1.5,0],0.3,c.gold);
k.box(stage,"/World/Rig/Elbow/Grip",[0.6,1.5,0],[1.2,0.23,0.45],c.coral);
k.beam(stage,"/World/Rig/OriginX",[0,0,0],[1.6,0,0],0.035,c.coral);
k.beam(stage,"/World/Rig/OriginY",[0,0,0],[0,2,0],0.035,c.teal);
k.beam(stage,"/World/Rig/OriginZ",[0,0,0],[0,0,1.3],0.035,c.blue);

print(rig.GetPrim().GetAttribute("xformOp:transform").GetValueString());`,
  },
  {
    title: "Animated Radius",
    group: "Animation",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/animated-radius.usda");
stage.SetUpAxis("Y");
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(48);

const sphere = UsdGeom.Sphere.Define(stage, "/World/Pulse");
const radius = sphere.CreateRadiusAttr(0.5);
radius.Set(0.5, 1);
radius.Set(1.5, 24);
radius.Set(0.5, 48);

k.color(sphere,c.coral);
for(let i=0;i<3;i++) k.torus(stage,"/World/Wave"+i,[0,0,0],0.85+i*0.43,0.045,i%2?c.teal:c.gold,"y");
k.beam(stage,"/World/Amplitude",[-1.8,-0.6,0],[-1.8,1.5,0],0.035,c.cream);
for(let i=0;i<5;i++) k.box(stage,"/World/Scale"+i,[-1.65,-0.5+i*0.5,0],[0.3,0.035,0.06],c.blue);

print(sphere.GetPrim().GetAttribute("radius").GetValueStringAtTime(24));`,
  },
  {
    title: "Animated Transform",
    group: "Animation",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/animated-transform.usda");
stage.SetUpAxis("Y");
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(60);

const cube = UsdGeom.Cube.Define(stage, "/World/MovingCube");
cube.CreateSizeAttr(0.8);
const translate = cube.AddTranslateOp();
translate.Set(Gf.Vec3d(-2, 0, 0), 1);
translate.Set(Gf.Vec3d(2, 0, 0), 60);

translate.Set(Gf.Vec3d(-2,0,0));
k.color(cube,c.coral);
k.box(stage,"/World/Track",[0,-0.55,0],[5.5,0.15,1.1],c.ink);
for(let i=0;i<9;i++) k.box(stage,"/World/Sleeper"+i,[-2.4+i*0.6,-0.42,0],[0.09,0.08,1],c.cream);
for(const z of [-0.4,0.4]) k.beam(stage,"/World/Rail"+(z<0?"L":"R"),[-2.6,-0.3,z],[2.6,-0.3,z],0.045,c.gold);
k.torus(stage,"/World/Finish",[2,0.25,0],0.7,0.05,c.teal);

print(cube.GetPrim().GetAttribute("xformOp:translate").GetTimeSamples().size());`,
  },
  {
    title: "Shader Color Inputs",
    group: "Scene Building",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/shader-color-inputs.usda");
stage.SetUpAxis("Y");
const red = UsdShade.Shader.Define(stage, "/World/Looks/Red/PreviewSurface");
const blue = UsdShade.Shader.Define(stage, "/World/Looks/Blue/PreviewSurface");

red.CreateIdAttr("UsdPreviewSurface");
blue.CreateIdAttr("UsdPreviewSurface");
red.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(1, 0.05, 0.05));
blue.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.05, 0.2, 1));

const redMaterial=k.material(stage,"/World/Looks/Red",null,0.25,0.25,"/World/Looks/Red/PreviewSurface");
const blueMaterial=k.material(stage,"/World/Looks/Blue",null,0.25,0.25,"/World/Looks/Blue/PreviewSurface");
k.bind(k.torus(stage,"/World/RedLoop",[-0.65,0,0],1,0.24,c.coral),redMaterial);
k.bind(k.torus(stage,"/World/BlueLoop",[0.65,0,0],1,0.24,c.blue,"y"),blueMaterial);

print(stage.ExportToString());`,
  },
  {
    title: "Visibility",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/visibility.usda");
stage.SetUpAxis("Y");
const visible = UsdGeom.Cube.Define(stage, "/World/VisibleCube");
const hidden = UsdGeom.Sphere.Define(stage, "/World/HiddenSphere");

visible.MakeVisible();
hidden.MakeInvisible();

k.pose(stage,visible,[-0.9,0,0],[0.55,0.55,0.55],[0,25,0]);
k.color(visible,c.teal);
k.pose(stage,hidden,[1,0,0],[0.55,0.55,0.55]);
for(let i=0;i<12;i++) {const a=i*Math.PI/6; k.sphere(stage,"/World/HiddenOutline/Dot"+i,[1+0.75*Math.cos(a),0.75*Math.sin(a),0],0.055,c.gold);}
k.box(stage,"/World/Screen",[0,-1,0],[3.6,0.12,1],c.ink);

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
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/custom-properties.usda");
stage.SetUpAxis("Y");
const prim = stage.DefinePrim("/World/Asset", "Xform");

prim.CreateAttribute("userProperties:assetId", Sdf.ValueTypeNames.String, true).Set("asset-042");
prim.CreateAttribute("userProperties:massKg", Sdf.ValueTypeNames.Float, true).Set(12.5);
prim.CreateAttribute("userProperties:approved", Sdf.ValueTypeNames.Bool, true).Set(true);

k.box(stage,"/World/Asset/Case",[0,0,0],[2,1.25,1.1],c.teal,[0,15,0]);
k.torus(stage,"/World/Asset/Handle",[0,0.75,0],0.38,0.07,c.gold);
for(let i=0;i<3;i++) k.box(stage,"/World/Asset/Rivet"+i,[-0.65+i*0.65,0,0.65],[0.16,0.38,0.08],i===2?c.coral:c.cream);
k.attr(stage.GetPrimAtPath("/World/Asset/Case"),"userProperties:massKg","float",12.5);

print(inspectPrim(prim));`,
  },
  {
    title: "Relationships",
    group: "Authoring",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/relationships.usda");
stage.SetUpAxis("Y");
const parent = stage.DefinePrim("/World/Controller", "Xform");
stage.DefinePrim("/World/TargetA", "Xform");
stage.DefinePrim("/World/TargetB", "Xform");

const rel = parent.CreateRelationship("targets", true);
rel.AddTarget("/World/TargetA");
rel.AddTarget("/World/TargetB");

k.sphere(stage,"/World/Controller/Hub",[0,1.2,0],0.5,c.gold);
k.torus(stage,"/World/Controller/Halo",[0,1.2,0],0.72,0.055,c.cream);
k.box(stage,"/World/TargetA/Receiver",[-1.6,-0.5,0],[0.85,0.85,0.85],c.teal,[0,25,0]);
k.sphere(stage,"/World/TargetB/Receiver",[1.6,-0.5,0],0.55,c.violet);
k.beam(stage,"/World/LinkA",[-0.35,0.85,0],[-1.3,-0.2,0],0.055,c.teal);
k.beam(stage,"/World/LinkB",[0.35,0.85,0],[1.3,-0.2,0],0.055,c.violet);

print(vectorToArray(rel.GetTargets()));`,
  },
  {
    title: "Preview Material",
    group: "Materials",
    code: `const k = sceneKit, c = k.colors;
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

k.bind(k.lathe(stage,"/World/GoldVessel",[0,0,0],[[0.01,-1],[0.6,-1],[0.8,-0.6],[0.65,0.2],[0.3,0.65],[0.4,1],[0.32,1.05]],c.gold),material);
k.bind(k.torus(stage,"/World/Handle",[0.7,0.1,0],0.5,0.085,c.gold),material);
k.box(stage,"/World/Slate",[0,-1.15,0],[2.1,0.18,1.8],c.ink,[0,20,0]);

print(stage.ExportToString());`,
  },
  {
    title: "Bind Material",
    group: "Materials",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/bind-material.usda");
stage.SetUpAxis("Y");
const cube = UsdGeom.Cube.Define(stage, "/World/Box");
const material = UsdShade.Material.Define(stage, "/World/Looks/BluePaint");
const shader = UsdShade.Shader.Define(stage, "/World/Looks/BluePaint/PreviewSurface");

shader.CreateIdAttr("UsdPreviewSurface");
shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.1, 0.25, 1));
const surfaceOutput = shader.CreateOutput("surface", Sdf.ValueTypeNames.Token);
material.CreateSurfaceOutput().ConnectToSource(surfaceOutput);
UsdShade.MaterialBindingAPI(cube).Bind(material);

k.pose(stage,cube,[-0.6,0.2,0],[0.55,0.55,0.55],[12,25,0]);
k.bind(k.lathe(stage,"/World/PaintCan",[0.9,-0.25,0],[[0.01,-0.5],[0.48,-0.5],[0.48,0.5],[0.01,0.5]],c.blue),material);
k.torus(stage,"/World/CanRim",[0.9,0.25,0],0.48,0.045,c.cream,"y");
k.box(stage,"/World/PaintStroke",[-0.4,-0.6,0.7],[2.5,0.06,0.4],c.blue,[0,-15,0]);

print(cube.GetPrim().GetRelationship("material:binding").GetTargets().get(0));`,
  },
  {
    title: "Texture Shader Network",
    group: "Materials",
    code: `const k = sceneKit, c = k.colors;
stage = await openFixture("MaterialX Texture + Noise");
const material = UsdShade.Material.Define(stage, "/World/Looks/Textured");
const surface = UsdShade.Shader.Define(stage, "/World/Looks/Textured/PreviewSurface");
const texture = UsdShade.Shader.Define(stage, "/World/Looks/Textured/DiffuseTexture");
const uv = UsdShade.Shader.Define(stage, "/World/Looks/Textured/UVReader");
surface.CreateIdAttr("UsdPreviewSurface");
texture.CreateIdAttr("UsdUVTexture");
uv.CreateIdAttr("UsdPrimvarReader_float2");
uv.CreateInput("varname", Sdf.ValueTypeNames.Token).Set("st");
const uvOutput = uv.CreateOutput("result", "float2");
texture.CreateInput("st", "float2").ConnectToSource(uvOutput);
texture.CreateInput("file", Sdf.ValueTypeNames.Asset).Set("textures/checker.png");
texture.CreateInput("sourceColorSpace", Sdf.ValueTypeNames.Token).Set("sRGB");
const textureRgb = texture.CreateOutput("rgb", Sdf.ValueTypeNames.Color3f);
surface.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(textureRgb);
surface.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.35);
const surfaceOutput = surface.CreateOutput("surface", Sdf.ValueTypeNames.Token);
material.CreateSurfaceOutput().ConnectToSource(surfaceOutput);
k.bind(stage.GetPrimAtPath("/World/TexturedQuad"),material);
k.pose(stage,stage.GetPrimAtPath("/World/TexturedQuad"),[0,0.2,0],[0.75,1.2,1]);
for(const x of [-1.05,1.05]) k.box(stage,"/World/Sign/Side"+(x<0?"L":"R"),[x,0.2,0],[0.16,2.25,0.24],c.coral);
k.box(stage,"/World/Sign/Top",[0,1.3,0],[2.3,0.16,0.24],c.coral);
k.beam(stage,"/World/Sign/Pole",[0,-0.7,0],[0,-2,0],0.09,c.ink);
k.torus(stage,"/World/Sign/Foot",[0,-2,0],0.65,0.09,c.teal,"y");
print(stage.ExportToString());`,
  },
  {
    title: "Variant Set",
    group: "Composition",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/variant-set.usda");
stage.SetUpAxis("Y");
const model = UsdGeom.Xform.Define(stage, "/World/Model").GetPrim();
const variants = model.GetVariantSets().AddVariantSet("shape");

variants.AddVariant("sphere");
variants.AddVariant("cube");
variants.DefinePrim("sphere", "/World/Model/Geom", "Sphere").CreateAttribute("radius", Sdf.ValueTypeNames.Double, false).Set(0.9);
variants.DefinePrim("cube", "/World/Model/Geom", "Cube").CreateAttribute("size", Sdf.ValueTypeNames.Double, false).Set(1.4);
await variants.SetVariantSelection("cube");

k.color(stage.GetPrimAtPath("/World/Model/Geom"),c.coral);
k.torus(stage,"/World/ChoiceSocket",[0,-0.85,0],1,0.16,c.ink,"y");
k.beam(stage,"/World/ForkL",[-1.8,-0.8,0],[-1.8,0.8,0],0.06,c.teal);
k.beam(stage,"/World/ForkR",[1.8,-0.8,0],[1.8,0.8,0],0.06,c.gold);
k.sphere(stage,"/World/SphereOption",[-1.8,1.1,0],0.25,c.teal);
k.box(stage,"/World/CubeOption",[1.8,1.1,0],[0.45,0.45,0.45],c.gold);

print({ selection: variants.GetVariantSelection(), names: variants.GetVariantNames() });`,
  },
  {
    title: "Variant Switch",
    group: "Composition",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/variant-switch.usda");
stage.SetUpAxis("Y");
const root = stage.DefinePrim("/World/Product", "Xform");
const look = root.GetVariantSets().AddVariantSet("look");

look.AddVariant("warm");
look.AddVariant("cool");
look.DefinePrim("warm", "/World/Product/Swatch", "Sphere").CreateAttribute("userProperties:look", Sdf.ValueTypeNames.Token, true).Set("warm");
look.DefinePrim("cool", "/World/Product/Swatch", "Sphere").CreateAttribute("userProperties:look", Sdf.ValueTypeNames.Token, true).Set("cool");
for (const [name,rgb] of [["warm",c.coral],["cool",c.blue]]) {
  const swatch=look.DefinePrim(name,"/World/Product/Swatch","Sphere");
  swatch.CreateAttribute("primvars:displayColor",Sdf.ValueTypeNames.Color3fArray,false).Set(Vt.Vec3fArray([Gf.Vec3f(...rgb)]));
}
await look.SetVariantSelection("warm");
k.pose(stage,stage.GetPrimAtPath("/World/Product/Swatch"),[0,0,0],[0.9,1.25,0.75]);
k.torus(stage,"/World/Product/Collar",[0,-0.85,0],0.7,0.12,c.ink,"y");
k.torus(stage,"/World/Product/Crown",[0,0.9,0],0.62,0.07,c.gold,"y");
k.sphere(stage,"/World/WarmChip",[-1.6,-0.4,0],0.3,c.coral);
k.sphere(stage,"/World/CoolChip",[1.6,-0.4,0],0.3,c.blue);

print(stage.GetPrimAtPath("/World/Product/Swatch").GetAttribute("userProperties:look").GetValueString());
await look.SetVariantSelection("cool");
print(stage.GetPrimAtPath("/World/Product/Swatch").GetAttribute("userProperties:look").GetValueString());`,
  },
  {
    title: "Payload",
    group: "Composition",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/payload-root.usda");
stage.SetUpAxis("Y");
const payloadStage = Usd.Stage.CreateNew("/tmp/payload-asset.usda");
payloadStage.DefinePrim("/PayloadRoot", "Xform");
payloadStage.DefinePrim("/PayloadRoot/Sphere", "Sphere");
payloadStage.Export("/tmp/payload-asset.usda");

const holder = stage.DefinePrim("/World/PayloadHolder", "Xform");
holder.GetPayloads().AddPayload("payload-asset.usda", "/PayloadRoot");

k.color(stage.GetPrimAtPath("/World/PayloadHolder/Sphere"),c.gold);
for(const x of [-1.4,1.4]) for(const z of [-1.1,1.1]) k.beam(stage,"/World/Crate/Post"+(x<0?"L":"R")+(z<0?"B":"F"),[x,-1.2,z],[x,1.2,z],0.075,c.teal);
for(const y of [-1.2,1.2]) for(const z of [-1.1,1.1]) k.beam(stage,"/World/Crate/Rail"+(y<0?"B":"T")+(z<0?"B":"F"),[-1.4,y,z],[1.4,y,z],0.075,c.teal);

print(inspectPrim(holder));`,
  },
  {
    title: "Payload Load State",
    group: "Composition",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/payload-load.usda");
stage.SetUpAxis("Y");
const payloadStage = Usd.Stage.CreateNew("/tmp/payload-load-asset.usda");
payloadStage.DefinePrim("/PayloadRoot", "Xform");
payloadStage.DefinePrim("/PayloadRoot/Cube", "Cube");
payloadStage.Export("/tmp/payload-load-asset.usda");

const holder = stage.DefinePrim("/World/Holder", "Xform");
holder.GetPayloads().AddPayload("payload-load-asset.usda", "/PayloadRoot");
k.pose(stage,stage.GetPrimAtPath("/World/Holder/Cube"),[0,0,0],[0.55,0.55,0.55],[0,30,0]);
k.color(stage.GetPrimAtPath("/World/Holder/Cube"),c.coral);
k.box(stage,"/World/Drawer",[0,-0.7,0.3],[2.2,0.15,2.4],c.ink);
k.box(stage,"/World/DrawerFront",[0,-0.35,1.5],[2.2,0.7,0.12],c.teal);
k.torus(stage,"/World/DrawerPull",[0,-0.3,1.6],0.23,0.045,c.gold);
k.box(stage,"/World/Sleeve",[0,0,-1.25],[2.4,1.8,0.2],c.cream);

print({ before: holder.IsLoaded() });
holder.Unload();
print({ unloaded: holder.IsLoaded() });
holder.Load();
print({ loaded: holder.IsLoaded() });`,
  },
  {
    title: "Open Text Layer",
    group: "Composition",
    code: `const k = sceneKit, c = k.colors;
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
k.pose(stage,stage.GetPrimAtPath("/World/Loaded"),[0.45,0.8,0.1],[0.12,0.12,0.12]);
k.color(stage.GetPrimAtPath("/World/Loaded"),c.teal);
k.beam(stage,"/World/Book/Spine",[0,0,-1],[0,0,1],0.09,c.ink);
for(const side of [-1,1]) {
  k.box(stage,"/World/Book/Cover"+(side<0?"Left":"Right"),[side*0.7,0.2,0],[1.5,0.08,2.05],c.coral,[0,0,side*22]);
  for(let i=0;i<5;i++) k.box(stage,"/World/Book/Page"+(side<0?"L":"R")+i,[side*0.68,0.27+i*0.025,0],[1.4,0.018,1.9],c.cream,[0,0,side*(22+i*3)]);
}
k.mesh(stage,"/World/Book/FoldedCorner",[[0.9,0.75,0.7],[1.2,0.86,0.7],[1.2,0.86,0.35]],[3],[0,1,2],c.gold);

print(listPrims(stage));`,
  },
  {
    title: "Referenced Layer",
    group: "Composition",
    code: `const k = sceneKit, c = k.colors;
mountText("/tmp/reference-base.usda", \`#usda 1.0
def Xform "Asset"
{
    double size = 3
}
\`);
mountText("/tmp/reference-root.usda", \`#usda 1.0
def Xform "World" (
    prepend references = @reference-base.usda@</Asset>
)
{
}
\`);

stage = await Usd.Stage.Open("/tmp/reference-root.usda");
stage.SetUpAxis("Y");
k.box(stage,"/World/SourceBlock",[-1,0,0],[1.3,1.3,1.3],c.teal,[0,25,0]);
k.box(stage,"/World/ReferenceBlock",[1.1,0.7,0],[0.9,0.9,0.9],c.gold,[0,25,0]);
k.beam(stage,"/World/ReferenceLink",[-0.35,0.25,0],[0.65,0.6,0],0.08,c.cream);
k.torus(stage,"/World/SourceSeal",[-1,0,0.8],0.35,0.06,c.coral);

print(inspectPrim(stage.GetPrimAtPath("/World")));`,
  },
  {
    title: "Layer Stack",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/layer-stack.usda");
stage.SetUpAxis("Y");
stage.DefinePrim("/World", "Xform");

const layers=stage.GetLayerStack(true);
for(let i=0;i<layers.length;i++) {
  const slab=k.box(stage,"/World/Layers/Layer"+i,[i*0.25,i*0.55,0],[2.8,0.18,1.8],i?c.teal:c.ink,[0,i*12,0]);
  k.attr(slab,"userProperties:identifier","string",layers[i].identifier);
}
k.box(stage,"/World/Opinion",[0,1.2,0],[0.8,0.6,0.8],c.coral,[0,24,0]);
k.beam(stage,"/World/StackPin",[-1.1,-0.2,0.5],[-1.1,1.5,0.5],0.045,c.gold);

print(stage.GetLayerStack(true).map((layer) => ({
  identifier: layer.identifier,
  displayName: layer.displayName,
  realPath: layer.realPath,
})));`,
  },
  {
    title: "Used Layers",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
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
const used=stage.GetUsedLayers(false);
for(let i=0;i<used.length;i++) {
  const x=(i-(used.length-1)/2)*1.4;
  const book=k.box(stage,"/World/Library/Volume"+i,[x,0,0],[0.8,1.8,1.1],i%2?c.teal:c.coral,[0,0,i*8-4]);
  k.attr(book,"userProperties:layer","string",used[i].displayName);
  for(let j=0;j<3;j++) k.box(stage,"/World/Library/Band"+i+"_"+j,[x,-0.5+j*0.5,0.57],[0.82,0.045,0.03],c.gold);
}
k.box(stage,"/World/Shelf",[0,-1.05,0],[used.length*1.4,0.12,1.4],c.ink);

print(stage.GetUsedLayers(false).map((layer) => layer.displayName));`,
  },
  {
    title: "Traverse",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/traverse.usda");
stage.SetUpAxis("Y");
stage.DefinePrim("/World", "Xform");
stage.DefinePrim("/World/A", "Sphere");
stage.DefinePrim("/World/B", "Cube");
stage.DefinePrim("/World/B/Child", "Scope");

k.pose(stage,stage.GetPrimAtPath("/World/A"),[-1.2,0.1,0],[0.45,0.45,0.45]);
k.color(stage.GetPrimAtPath("/World/A"),c.teal);
k.pose(stage,stage.GetPrimAtPath("/World/B"),[1,0.1,0],[0.4,0.4,0.4]);
k.color(stage.GetPrimAtPath("/World/B"),c.coral);
k.sphere(stage,"/World/RootNode",[0,1.6,0],0.35,c.gold);
k.beam(stage,"/World/EdgeA",[0,1.3,0],[-1.2,0.5,0],0.04,c.cream);
k.beam(stage,"/World/EdgeB",[0,1.3,0],[1,0.5,0],0.04,c.cream);
k.sphere(stage,"/World/B/Child/Leaf",[0,-3.5,0],0.6,c.violet);
k.beam(stage,"/World/B/Child/Stem",[0,-1,0],[0,-3,0],0.08,c.cream);

print(listPrims(stage));`,
  },
  {
    title: "Property Names",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/property-names.usda");
stage.SetUpAxis("Y");
const cube = UsdGeom.Cube.Define(stage, "/World/Cube");
cube.CreateSizeAttr(2);
cube.GetPrim().CreateAttribute("userProperties:label", Sdf.ValueTypeNames.String, true).Set("inspection target");

k.pose(stage,cube,[0,0,0],[0.5,0.65,0.4],[0,20,0]); k.color(cube,c.ink);
for(let i=0;i<4;i++) {
  k.box(stage,"/World/PropertyDrawer"+i,[0,-0.48+i*0.32,0.45+i*0.08],[0.85,0.23,0.5],i%2?c.teal:c.cream);
  k.sphere(stage,"/World/PropertyKnob"+i,[0,-0.48+i*0.32,0.73+i*0.08],0.05,c.gold);
}

print(vectorToArray(cube.GetPrim().GetPropertyNames()));`,
  },
  {
    title: "Attribute Resolve Info",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/resolve-info.usda");
stage.SetUpAxis("Y");
const sphere = UsdGeom.Sphere.Define(stage, "/World/Sphere");
sphere.CreateRadiusAttr(1.25);

const attr = sphere.GetPrim().GetAttribute("radius");
k.color(sphere,c.coral);
k.pose(stage,sphere,[0,0.35,0],[0.28,0.28,0.28]);
k.box(stage,"/World/Probe/Foot",[0,-0.65,0],[2.8,0.16,1.2],c.ink);
for(const x of [-1,1]) k.box(stage,"/World/Probe/Column"+(x<0?"L":"R"),[x,0.25,0],[0.18,1.7,0.45],c.teal);
k.box(stage,"/World/Probe/Bridge",[0,1.1,0],[2.2,0.22,0.5],c.teal);
k.beam(stage,"/World/Probe/Stylus",[0,0.7,0],[0,1.4,0],0.06,c.gold);
k.box(stage,"/World/Probe/Readout",[0.7,1.4,0],[0.65,0.48,0.2],c.blue);
const measuredRadius=Number(attr.GetValueString());
for(let i=0;i<Math.round(measuredRadius*8);i++) k.box(stage,"/World/Probe/Tick"+i,[-0.8+i*0.17,-0.53,0.35],[0.025,0.025,i%2?0.12:0.24],c.cream);

print({
  value: attr.GetValueString(),
  resolve: attr.GetResolveInfo(Usd.TimeCode.Default()),
});`,
  },
  {
    title: "Prim Stack",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
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
for(let i=0;i<3;i++) {
  k.box(stage,"/World/Opinion"+i,[0,i*0.65-0.65,0],[2.1-i*0.35,0.24,1.2], [c.ink,c.teal,c.coral][i],[0,i*18,0]);
  k.beam(stage,"/World/Stratum"+i,[-1.4,i*0.65-0.65,0],[-1.4,i*0.65-0.25,0],0.055,c.gold);
}
k.sphere(stage,"/World/Resolved",[0,1.3,0],0.4,c.gold);

print(stage.GetPrimAtPath("/World").GetPrimStackWithLayerOffsets());`,
  },
  {
    title: "Composition Arcs",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
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
for(let i=0;i<3;i++) {
  const x=(i-1)*1.3;
  k.box(stage,"/World/Pier"+i,[x,-0.7,0],[0.35,0.65,0.8],[c.teal,c.coral,c.blue][i]);
}
for(let i=0;i<2;i++) k.torus(stage,"/World/Arc"+i,[-0.65+i*1.3,-0.4,0],0.65,0.12,i?c.gold:c.cream,"z",0.5);
k.sphere(stage,"/World/Keystone",[0,0.8,0],0.3,c.coral);

print(stage.GetPrimAtPath("/World").GetCompositionArcs());`,
  },
  {
    title: "Fixture: Unmaterialed Empty Subset",
    group: "Fixture Smoke",
    code: `const k = sceneKit, c = k.colors;
stage = await openFixture("Unmaterialed Empty Subset");

k.beam(stage,"/World/Survey/EdgeA",[-1,0,0],[1,0,0],0.035,c.teal);
k.beam(stage,"/World/Survey/EdgeB",[1,0,0],[0,0,-1.5],0.035,c.teal);
k.beam(stage,"/World/Survey/EdgeC",[0,0,-1.5],[-1,0,0],0.035,c.teal);
for(const [i,p] of [[0,[-1,0,0]],[1,[1,0,0]],[2,[0,0,-1.5]]]) k.sphere(stage,"/World/Survey/Vertex"+i,p,0.09,c.gold);

print({
  prims: listPrims(stage),
  mesh: inspectPrim(stage.GetPrimAtPath("/World/PlainTriangle")),
});`,
  },
  {
    title: "Fixture: Face-Varying Normals Matrix",
    group: "Fixture Smoke",
    code: `const k = sceneKit, c = k.colors;
stage = await openFixture("Face-Varying Normals Matrix");

// Keep authored points and normal/tangent values; arrange the diagnostic meshes on an inspection rack.
const cells=vectorToArray(stage.TraverseAll()).filter(p=>p.GetTypeName()==="Mesh");
for(const [i,cell] of cells.entries()) {
  const numbers=cell.GetAttribute("points").GetValueString().match(/[-+]?(?:\\d*\\.)?\\d+(?:e[-+]?\\d+)?/gi).map(Number);
  const xs=[],ys=[],zs=[]; for(let j=0;j<numbers.length;j+=3) {xs.push(numbers[j]);ys.push(numbers[j+1]);zs.push(numbers[j+2]);}
  const center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,(Math.min(...zs)+Math.max(...zs))/2];
  const x=(i%4-1.5)*1.3,y=Math.floor(i/4)*1.4,s=0.32;
  k.pose(stage,cell,[x-s*center[0],y-s*center[1],-s*center[2]],[s,s,s],[90,0,0]);
  k.color(cell,i%2?c.coral:c.teal);
  k.box(stage,"/World/Rack/Back"+i,[x,y,-0.12],[1.12,1.12,0.12],c.cream);
  for(const dx of [-0.59,0.59]) k.beam(stage,"/World/Rack/Frame"+i+(dx<0?"L":"R"),[x+dx,y-0.6,0],[x+dx,y+0.6,0],0.035,c.ink);
  const normal=cell.GetAttribute("primvars:normals");
  if(normal.IsValid()) {
    const values=normal.GetValueString().match(/[-+]?(?:\\d*\\.)?\\d+(?:e[-+]?\\d+)?/gi)?.map(Number);
    if(values?.length>=3) {const n=values.slice(0,3),len=Math.hypot(...n)||1; k.beam(stage,"/World/Rack/Normal"+i,[x,y,0.15],[x+n[0]/len*0.4,y+n[1]/len*0.4,0.15+n[2]/len*0.4],0.025,c.gold);}
  }
}

print(listPrims(stage).filter((path) => {
  return stage.GetPrimAtPath(path).GetTypeName() === "Mesh";
}));`,
  },
  {
    title: "Fixture: Parent Folder Reference",
    group: "Fixture Smoke",
    code: `const k = sceneKit, c = k.colors;
stage = await openFixture("Parent Folder References");

k.color(stage.GetPrimAtPath("/World/Shape"),c.teal);
k.box(stage,"/World/ParentFolder",[0,-1.1,0],[2.6,0.12,1.8],c.gold);
k.box(stage,"/World/ParentTab",[-0.7,-0.8,-0.85],[0.9,0.5,0.12],c.gold);
k.beam(stage,"/World/RelativeLink",[1.4,-0.9,0],[1.4,0.8,0],0.045,c.coral);
k.sphere(stage,"/World/SharedAsset",[1.4,1.1,0],0.24,c.coral);

print({
  usedLayers: stage.GetUsedLayers(false).map((layer) => layer.displayName),
  world: inspectPrim(stage.GetPrimAtPath("/World")),
  referencedCube: inspectPrim(stage.GetPrimAtPath("/World/Shape")),
});`,
  },
  {
    title: "Fixture: Payload Root",
    group: "Fixture Smoke",
    code: `const k = sceneKit, c = k.colors;
stage = await openFixture("Payload Root");

const payloadPrim = stage.GetPrimAtPath("/World/PayloadHolder");
k.torus(stage,"/World/ContainerRim",[0,-0.75,0],1.35,0.15,c.blue,"y");
for(let i=0;i<4;i++) {const a=i*Math.PI/2; k.beam(stage,"/World/ContainerRib"+i,[1.3*Math.cos(a),-0.75,1.3*Math.sin(a)],[1.3*Math.cos(a),0.9,1.3*Math.sin(a)],0.055,c.gold);}
k.torus(stage,"/World/ContainerTop",[0,0.9,0],1.3,0.055,c.gold,"y");

print({
  loaded: payloadPrim.IsLoaded(),
  prims: listPrims(stage),
});`,
  },
  {
    title: "Fixture: Native Instances",
    group: "Fixture Smoke",
    code: `const k = sceneKit, c = k.colors;
stage = await openFixture("usd-concepts/native_instances.usda");

// Original instances remain intact; the sculpture explicitly reuses their prototype.
for(let i=0;i<7;i++) {
  const a=i*0.85, p=stage.DefinePrim("/World/SpiralInstance"+i,"Xform");
  // Internal reference + instanceability are authored in a tiny native layer below.
  k.pose(stage,p,[Math.cos(a)*1.2,0.6+i*0.34,Math.sin(a)*1.2]);
}
const instanceLayer=stage.GetRootLayer().ExportToString();
// Reopen with the same authored transforms and native instancing metadata.
const withInstances=instanceLayer.replace(/def Xform "SpiralInstance([0-9]+)"/g, 'def Xform "SpiralInstance$1" (instanceable = true; prepend references = </Prototype>)');
mountText("/tmp/native-instance-sculpture.usda",withInstances);
stage=await Usd.Stage.Open("/tmp/native-instance-sculpture.usda");
k.beam(stage,"/World/Spindle",[0,-0.5,0],[0,3,0],0.045,c.gold);

print(listPrims(stage).map((path) => {
  const prim = stage.GetPrimAtPath(path);
  return { path, typeName: prim.GetTypeName(), instance: prim.IsInstance?.() ?? false };
}));`,
  },
  {
    title: "Fixture: Point Instancer",
    group: "Fixture Smoke",
    code: `const k = sceneKit, c = k.colors;
stage = await openFixture("usd-concepts/point_instancer.usda");

const scatter=stage.GetPrimAtPath("/World/Scatter");
const positions=[],indices=[],scales=[],orientations=[];
for(let i=0;i<30;i++) {const a=i*2.4,r=0.3+Math.sqrt(i)*0.22; positions.push(k.point(stage,[Math.cos(a)*r,0.12*i,Math.sin(a)*r])); indices.push(i%2); scales.push([1,1,1]); orientations.push([1,0,0,0]);}
k.attr(scatter,"positions","point3f[]",positions); k.attr(scatter,"protoIndices","int[]",indices);
k.attr(scatter,"scales","float3[]",scales);
// Clear the three original orientation entries by supplying one identity per instance.
const instancerText=stage.GetRootLayer().ExportToString().replace(/quath\\[\\] orientations = \\[.*?\\]/, "quath[] orientations = ["+orientations.map(()=>"(1, 0, 0, 0)").join(", ")+"]");
mountText("/tmp/point-instancer-sculpture.usda",instancerText);
stage=await Usd.Stage.Open("/tmp/point-instancer-sculpture.usda");
k.torus(stage,"/World/ScatterFoot",[0,-0.3,0],1.3,0.055,c.teal,"y");

print(inspectPrim(stage.GetPrimAtPath("/World/Scatter")));`,
  },
  {
    title: "Fixture: Camera + Light",
    group: "Fixture Smoke",
    code: `const k = sceneKit, c = k.colors;
stage = await openFixture("Camera + Light");
const shot=stage.GetPrimAtPath("/World/ShotCam");
k.attr(shot,"xformOp:translate","double3",[5,-6,3]);
k.attr(shot,"xformOp:rotateXYZ","float3",[70,0,40]);
k.attr(shot,"xformOpOrder","token[]",["xformOp:translate","xformOp:rotateXYZ"]);
k.attr(shot,"focalLength","float",40);


k.pose(stage,stage.GetPrimAtPath("/World/LitCube"),[-0.6,0.2,0],[1,1,1],[0,25,0]);
k.bind(k.lathe(stage,"/World/LitVessel",[0.55,0,0],[[0.01,-0.4],[0.4,-0.4],[0.5,0],[0.25,0.6],[0.3,0.9]],c.cream),"/Looks/Neutral");
k.box(stage,"/World/StudioFloor",[0,-0.55,0],[2.8,0.1,1.8],c.ink);

print({
  camera: inspectPrim(stage.GetPrimAtPath("/World/ShotCam")),
  light: inspectPrim(stage.GetPrimAtPath("/World/KeyLight")),
});`,
  },
  {
    title: "Fixture: MaterialX Texture + Noise",
    group: "Fixture Smoke",
    code: `const k = sceneKit, c = k.colors;
stage = await openFixture("MaterialX Texture + Noise");

// The original MaterialX-bound quad stays active as the stretched textile.
for(const x of [-1.4,1.4]) k.beam(stage,"/World/Loom/Post"+(x<0?"L":"R"),[x,-1.1,0],[x,1.1,0],0.055,c.gold);
for(const y of [-0.95,0.95]) k.beam(stage,"/World/Loom/Rail"+(y<0?"B":"T"),[-1.4,y,0],[1.4,y,0],0.06,c.teal);
for(let i=0;i<9;i++) k.beam(stage,"/World/Loom/Fringe"+i,[-1.1+i*0.275,-0.8,0],[-1.1+i*0.275,-1.15-(i%2)*0.12,0],0.018,c.cream);

print({
  fixture: findFixture("MaterialX Texture + Noise"),
  usedLayers: stage.GetUsedLayers(false).map((layer) => layer.displayName),
  prims: listPrims(stage),
});`,
  },
  {
    title: "Objects Changed",
    group: "Inspection",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/notices.usda");
stage.SetUpAxis("Y");
const prim = stage.DefinePrim("/World/Thing", "Xform");
const notices = [];
const listener = stage.RegisterObjectsChanged((notice) => notices.push(notice));

prim.SetActive(false);
await new Promise((resolve) => setTimeout(resolve, 0));
stage.RevokeObjectsChanged(listener);

k.box(stage,"/World/Before",[-1.2,0,0],[0.7,0.7,0.7],c.ink,[0,20,0]);
k.box(stage,"/World/After",[1,0.2,0],[1.1,1.1,1.1],c.teal,[0,20,0]);
for(let i=0;i<3;i++) k.torus(stage,"/World/Notice"+i,[-0.1,0.1,0],0.35+i*0.25,0.035,c.gold,"y",0.7);
k.sphere(stage,"/World/Change",[1,1,0],0.18,c.coral);

print(notices);`,
  },
  {
    title: "Active State",
    group: "Authoring",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/active-state.usda");
stage.SetUpAxis("Y");
const keep = stage.DefinePrim("/World/Keep", "Cube");
const mute = stage.DefinePrim("/World/Mute", "Cube");

mute.SetActive(false);
k.pose(stage,keep,[-0.65,0,0],[0.45,0.7,0.45]); k.color(keep,c.teal);
k.box(stage,"/World/SwitchBody",[0,-0.9,0],[2.7,0.25,1.2],c.ink);
k.box(stage,"/World/MutedSlot",[0.85,-0.73,0],[0.75,0.04,0.75],c.cream);
k.sphere(stage,"/World/ActiveLamp",[-0.65,0.95,0],0.18,c.gold);

print({
  keep: keep.IsActive(),
  mute: mute.IsActive(),
  traverse: listPrims(stage),
});`,
  },
  {
    title: "Apply API Schema",
    group: "Authoring",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/apply-api.usda");
stage.SetUpAxis("Y");
const prim = stage.DefinePrim("/World/BoundThing", "Cube");

prim.ApplyAPI("MaterialBindingAPI");
prim.CreateRelationship("material:binding", false).AddTarget("/World/Looks/Preview");

const appliedMaterial=k.material(stage,"/World/Looks/Preview",c.violet,0.5,0.25);
k.pose(stage,prim,[0,0,0],[0.6,0.8,0.5],[0,30,0]);
k.bind(k.torus(stage,"/World/BindingBand",[0,0,0],1.15,0.12,c.violet,"y"),appliedMaterial);
k.sphere(stage,"/World/BindingClasp",[1.1,0,0],0.23,c.gold);

print(stage.ExportToString());`,
  },
  {
    title: "Cameras And Lights",
    group: "Scene Building",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/cameras-lights.usda");
stage.SetUpAxis("Y");
const camera = UsdGeom.Camera.Define(stage, "/World/Camera");
camera.CreateFocalLengthAttr(35);
UsdGeom.XformCommonAPI(camera).SetTranslate(Gf.Vec3d(0, 2, 6));
UsdGeom.XformCommonAPI(camera).SetRotate(Gf.Vec3f(-15, 0, 0));

const light = stage.DefinePrim("/World/KeyLight", "DistantLight");
light.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(600);
light.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(1, 0.94, 0.86));

k.bind(k.lathe(stage,"/World/Subject",[0,0,0],[[0.01,-0.8],[0.6,-0.8],[0.7,-0.4],[0.35,0.5],[0.15,1.1],[0.01,1.1]],c.cream),k.material(stage,"/World/Looks/Ceramic",c.cream,0,0.2));
k.torus(stage,"/World/SubjectHandle",[0.55,0.2,0],0.35,0.09,c.teal);
k.box(stage,"/World/Backdrop",[0,-1.05,0],[3.3,0.15,2.6],c.blue);
k.attr(light,"xformOp:rotateXYZ","float3",[-40,-35,0]);
k.attr(light,"xformOpOrder","token[]",["xformOp:rotateXYZ"]);

print(stage.ExportToString());`,
  },
  {
    title: "USDZ Package",
    group: "Export",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/package-source.usda");
stage.SetUpAxis("Y");
UsdGeom.Sphere.Define(stage, "/World/Sphere").CreateRadiusAttr(1.5);
k.pose(stage,stage.GetPrimAtPath("/World/Sphere"),[0,0.2,0],[0.4,0.4,0.4]);
k.color(stage.GetPrimAtPath("/World/Sphere"),c.coral);
k.box(stage,"/World/PackageBottom",[0,-0.65,0],[2,0.2,1.6],c.teal);
for(const x of [-0.95,0.95]) k.box(stage,"/World/PackageSide"+(x<0?"L":"R"),[x,-0.15,0],[0.12,0.85,1.6],c.teal);
k.box(stage,"/World/OpenLid",[0,0.7,-0.9],[2,1.5,0.12],c.gold,[-25,0,0]);

stage.GetRootLayer().Export("/tmp/package-source.usda");

const ok = USD.CreateUsdzPackage("/tmp/package-source.usda", "/tmp/package.usdz");
const bytes = USD.ReadFile("/tmp/package.usdz");

print({ ok, byteLength: bytes.byteLength, zipMagic: [bytes[0], bytes[1]] });`,
  },
  {
    title: "Reopen Verification",
    group: "Export",
    code: `const k = sceneKit, c = k.colors;
stage = Usd.Stage.CreateNew("/tmp/reopen.usda");
stage.SetUpAxis("Y");
const sphere = UsdGeom.Sphere.Define(stage, "/World/Sphere");
sphere.CreateRadiusAttr(4.2);
k.pose(stage,sphere,[0.1,0.5,0],[0.13,0.13,0.13]); k.color(sphere,c.blue);
k.box(stage,"/World/Caliper/Scale",[0,1.4,0],[3,0.18,0.35],c.cream);
k.box(stage,"/World/Caliper/FixedJaw",[-0.75,0.55,0],[0.16,1.6,0.4],c.gold);
k.box(stage,"/World/Caliper/MovingJaw",[0.86,0.55,0],[0.17,1.6,0.4],c.teal);
k.box(stage,"/World/Caliper/Slider",[0.86,1.4,0],[0.48,0.45,0.55],c.teal);
k.box(stage,"/World/Caliper/Stop",[-0.45,-0.2,0],[0.8,0.16,0.4],c.gold);
for(let i=0;i<15;i++) k.box(stage,"/World/Caliper/Tick"+i,[-1.2+i*0.16,1.51,0.2],[0.025,i%5?0.08:0.18,0.025],c.ink);
k.sphere(stage,"/World/Caliper/Lock",[0.86,1.72,0],0.12,c.coral);

stage.Export("/tmp/reopen.usda");

const reopened = await Usd.Stage.Open("/tmp/reopen.usda");
print(reopened.GetPrimAtPath("/World/Sphere").GetAttribute("radius").GetValueString());`,
  },
  {
    title: "Build Info",
    group: "Runtime",
    code: `const k = sceneKit, c = k.colors;
const info = JSON.parse(USD.GetBuildInfoJson());
stage = Usd.Stage.CreateNew("/tmp/build-info.usda"); stage.SetUpAxis("Y");
k.box(stage,"/World/Board",[0,-0.35,0],[3.4,0.18,2.5],c.ink);
const modules=[info.modules.materialX,info.modules.usdGltf,info.modules.hydraBridge];
for(let i=0;i<modules.length;i++) {
  const chip=k.box(stage,"/World/Module"+i,[(i-1)*1.05,0.05,0],[0.7,modules[i]?0.7:0.2,0.85],[c.teal,c.coral,c.blue][i]);
  k.attr(chip,"userProperties:buildModule","string",JSON.stringify(modules[i]));
  for(let j=0;j<4;j++) for(const z of [-0.55,0.55]) k.box(stage,"/World/Pin"+i+"_"+j+(z<0?"B":"F"),[(i-1)*1.05-0.25+j/6,-0.15,z],[0.07,0.07,0.3],c.gold);
}
k.attr(stage.GetPrimAtPath("/World"),"userProperties:openusdVersion","string",String(info.openusd.version));

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
    code: `const k = sceneKit, c = k.colors;
mountText("/tmp/fs-note.txt", "hello from MEMFS");

stage = Usd.Stage.CreateNew("/tmp/virtual-filesystem.usda"); stage.SetUpAxis("Y");
const entries=USD.FS_readdir("/tmp").filter(name=>name!=="."&&name!=="..").sort();
// Bound the display, while recording the real filenames on each visible file.
for(let i=0;i<Math.min(entries.length,7);i++) {
  const file=k.box(stage,"/World/Files/File"+i,[i*0.22-0.7,i*0.12,0],[1.6,0.065,1.25],i%2?c.cream:c.teal,[0,i*3,0]);
  k.attr(file,"userProperties:fileName","string",entries[i]);
}
k.box(stage,"/World/FolderBack",[0,0.45,-0.7],[2.3,1.4,0.08],c.gold);
k.box(stage,"/World/FolderTab",[-0.65,1.25,-0.7],[0.9,0.3,0.08],c.gold);
k.box(stage,"/World/FolderFront",[0,-0.15,0.75],[2.3,0.65,0.08],c.coral,[-12,0,0]);

print({
  tmpEntries: USD.FS_readdir("/tmp"),
  exists: USD.FS_analyzePath("/tmp/fs-note.txt").exists,
  text: new TextDecoder().decode(USD.ReadFile("/tmp/fs-note.txt")),
});`,
  },
  {
    title: "Sdf Paths",
    group: "Runtime",
    code: `const k = sceneKit, c = k.colors;
const root = new Sdf.Path("/World");
const child = root.AppendChild("Geom");
const prop = child.AppendProperty("xformOp:translate");

stage = Usd.Stage.CreateNew("/tmp/sdf-paths.usda");
stage.SetUpAxis("Y");
UsdGeom.Xform.Define(stage, child);
stage.GetPrimAtPath(child.GetString()).CreateAttribute("xformOp:translate", Sdf.ValueTypeNames.Double3, false).Set(Gf.Vec3d(1, 2, 3));

stage.SetUpAxis("Y");
k.attr(stage.GetPrimAtPath(child.GetString()),"xformOpOrder","token[]",["xformOp:translate"]);
k.box(stage,child.GetString()+"/Node",[0,0,0],[1,0.8,0.7],c.teal);
k.sphere(stage,"/World/RootNode",[-1,0,0],0.4,c.gold);
k.beam(stage,"/World/PathSegment",[-1,0,0],[1,2,3],0.055,c.cream);
k.torus(stage,child.GetString()+"/PropertySocket",[0,0.65,0],0.28,0.07,c.coral);

print({ child: child.GetString(), property: prop.GetString() });`,
  },
];

// The four native authoring examples used by the standalone API test buttons.
for (const [kind, title] of [['preview', 'API Preview Surface'], ['animated', 'API Animated Material'], ['variant-sphere', 'API Variant Sphere'], ['variant-cube', 'API Variant Cube']]) {
  replExamples.push({
    title, group: 'API Authoring',
    code: `stage = await createApiStage(USD, "${kind}", "/tmp/api-${kind}.usda");\nprint(stage.GetRootLayer().ExportToString());`,
  });
}

export const apiExampleAssets = replExamples.map(example => {
  const id = example.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    group: 'JavaScript API', label: example.title, exampleGroup: example.group,
    root: `api/examples.js#${id}`, executable: id,
    ...(apiPreviewIds.has(id) ? { thumbnail: `thumbnails/api-${id}.png` } : {}),
  };
});
