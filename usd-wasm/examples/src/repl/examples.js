export const replExamples = [
  {
    title: "Hello World",
    group: "Scene Building",
    code: `stage = Usd.Stage.CreateNew("/tmp/hello-world.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z);

const xform = UsdGeom.Xform.Define(stage, "/hello");
const sphere = UsdGeom.Sphere.Define(stage, "/hello/world");
sphere.CreateRadiusAttr(1.0);

print(stage.GetRootLayer().ExportToString());`,
  },
  {
    title: "Stage Metadata",
    group: "Scene Building",
    code: `stage = Usd.Stage.CreateNew("/tmp/stage-metadata.usda");
UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.y);
stage.SetStartTimeCode(1001);
stage.SetEndTimeCode(1048);
stage.SetTimeCodesPerSecond(24);

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
    code: `stage = Usd.Stage.CreateNew("/tmp/generic-prims.usda");
const world = stage.DefinePrim("/World", "Xform");
const group = stage.DefinePrim("/World/Props", "Scope");
const light = stage.DefinePrim("/World/KeyLight", "DistantLight");

light.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(800);
light.CreateAttribute("inputs:angle", Sdf.ValueTypeNames.Float, false).Set(0.45);

print([world.GetTypeName(), group.GetTypeName(), light.GetTypeName()]);`,
  },
  {
    title: "Schema Shapes",
    group: "Scene Building",
    code: `stage = Usd.Stage.CreateNew("/tmp/schema-shapes.usda");
const root = UsdGeom.Xform.Define(stage, "/World");
const ball = UsdGeom.Sphere.Define(stage, "/World/Ball");
const box = UsdGeom.Cube.Define(stage, "/World/Box");

ball.CreateRadiusAttr(0.75);
box.CreateSizeAttr(1.25);
ball.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(0.95, 0.2, 0.15)]));
box.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(0.05, 0.25, 0.9)]));
UsdGeom.XformCommonAPI(ball).SetTranslate(Gf.Vec3d(-1.25, 0, 0));
UsdGeom.XformCommonAPI(box).SetTranslate(Gf.Vec3d(1.25, 0, 0));

print(listPrims(stage));`,
  },
  {
    title: "Mesh From Arrays",
    group: "Scene Building",
    code: `stage = Usd.Stage.CreateNew("/tmp/mesh-arrays.usda");
const mesh = UsdGeom.Mesh.Define(stage, "/World/Triangle");

mesh.CreatePointsAttr(Vt.Vec3fArray([
  Gf.Vec3f(-1, 0, 0),
  Gf.Vec3f(1, 0, 0),
  Gf.Vec3f(0, 1.5, 0),
]));
mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3]));
mesh.CreateFaceVertexIndicesAttr(Vt.IntArray([0, 1, 2]));
mesh.CreateDisplayColorAttr(Vt.Vec3fArray([Gf.Vec3f(0.2, 0.8, 0.55)]));

print(stage.ExportToString());`,
  },
  {
    title: "Xform Ops",
    group: "Transforms",
    code: `stage = Usd.Stage.CreateNew("/tmp/xform-ops.usda");
const model = UsdGeom.Xform.Define(stage, "/World/Model");

model.AddTranslateOp().Set(Gf.Vec3d(1, 2, 3));
model.AddRotateXYZOp().Set(Gf.Vec3f(0, 45, 0));
model.AddScaleOp().Set(Gf.Vec3f(1.5, 1.5, 1.5));

print(inspectPrim(model.GetPrim()));`,
  },
  {
    title: "Xform Common API",
    group: "Transforms",
    code: `stage = Usd.Stage.CreateNew("/tmp/xform-common.usda");
const tower = UsdGeom.Cube.Define(stage, "/World/Tower");
const xform = UsdGeom.XformCommonAPI(tower);

xform.SetTranslate(Gf.Vec3d(0, 2, 0));
xform.SetRotate(Gf.Vec3f(0, 0, 15));
xform.SetScale(Gf.Vec3f(0.4, 3, 0.4));

print(stage.ExportToString());`,
  },
  {
    title: "Matrix Transform",
    group: "Transforms",
    code: `stage = Usd.Stage.CreateNew("/tmp/matrix-transform.usda");
const rig = UsdGeom.Xform.Define(stage, "/World/Rig");
const matrix = Gf.Matrix4d.Identity().SetTranslate(Gf.Vec3d(4, 5, 6));

rig.AddTransformOp().Set(matrix);
print(rig.GetPrim().GetAttribute("xformOp:transform").GetValueString());`,
  },
  {
    title: "Animated Radius",
    group: "Animation",
    code: `stage = Usd.Stage.CreateNew("/tmp/animated-radius.usda");
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(48);

const sphere = UsdGeom.Sphere.Define(stage, "/World/Pulse");
const radius = sphere.CreateRadiusAttr(0.5);
radius.Set(0.5, 1);
radius.Set(1.5, 24);
radius.Set(0.5, 48);

print(sphere.GetPrim().GetAttribute("radius").GetValueStringAtTime(24));`,
  },
  {
    title: "Animated Transform",
    group: "Animation",
    code: `stage = Usd.Stage.CreateNew("/tmp/animated-transform.usda");
stage.SetStartTimeCode(1);
stage.SetEndTimeCode(60);

const cube = UsdGeom.Cube.Define(stage, "/World/MovingCube");
cube.CreateSizeAttr(0.8);
const translate = cube.AddTranslateOp();
translate.Set(Gf.Vec3d(-2, 0, 0), 1);
translate.Set(Gf.Vec3d(2, 0, 0), 60);

print(cube.GetPrim().GetAttribute("xformOp:translate").GetTimeSamples().size());`,
  },
  {
    title: "Shader Color Inputs",
    group: "Scene Building",
    code: `stage = Usd.Stage.CreateNew("/tmp/shader-color-inputs.usda");
const red = UsdShade.Shader.Define(stage, "/World/Looks/Red/PreviewSurface");
const blue = UsdShade.Shader.Define(stage, "/World/Looks/Blue/PreviewSurface");

red.CreateIdAttr("UsdPreviewSurface");
blue.CreateIdAttr("UsdPreviewSurface");
red.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(1, 0.05, 0.05));
blue.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.05, 0.2, 1));

print(stage.ExportToString());`,
  },
  {
    title: "Visibility",
    group: "Inspection",
    code: `stage = Usd.Stage.CreateNew("/tmp/visibility.usda");
const visible = UsdGeom.Cube.Define(stage, "/World/VisibleCube");
const hidden = UsdGeom.Sphere.Define(stage, "/World/HiddenSphere");

visible.MakeVisible();
hidden.MakeInvisible();

print(listPrims(stage).map((path) => inspectPrim(stage.GetPrimAtPath(path))));`,
  },
  {
    title: "Purpose",
    group: "Inspection",
    code: `stage = Usd.Stage.CreateNew("/tmp/purpose.usda");
const renderMesh = UsdGeom.Cube.Define(stage, "/World/RenderMesh");
const proxyMesh = UsdGeom.Cube.Define(stage, "/World/ProxyMesh");

renderMesh.CreatePurposeAttr(UsdGeom.Tokens.render);
proxyMesh.CreatePurposeAttr(UsdGeom.Tokens.proxy);

print(stage.ExportToString());`,
  },
  {
    title: "Custom Properties",
    group: "Authoring",
    code: `stage = Usd.Stage.CreateNew("/tmp/custom-properties.usda");
const prim = stage.DefinePrim("/World/Asset", "Xform");

prim.CreateAttribute("userProperties:assetId", Sdf.ValueTypeNames.String, true).Set("asset-042");
prim.CreateAttribute("userProperties:massKg", Sdf.ValueTypeNames.Float, true).Set(12.5);
prim.CreateAttribute("userProperties:approved", Sdf.ValueTypeNames.Bool, true).Set(true);

print(inspectPrim(prim));`,
  },
  {
    title: "Relationships",
    group: "Authoring",
    code: `stage = Usd.Stage.CreateNew("/tmp/relationships.usda");
const parent = stage.DefinePrim("/World/Controller", "Xform");
stage.DefinePrim("/World/TargetA", "Xform");
stage.DefinePrim("/World/TargetB", "Xform");

const rel = parent.CreateRelationship("targets", true);
rel.AddTarget("/World/TargetA");
rel.AddTarget("/World/TargetB");

print(vectorToArray(rel.GetTargets()));`,
  },
  {
    title: "Preview Material",
    group: "Materials",
    code: `stage = Usd.Stage.CreateNew("/tmp/preview-material.usda");
const material = UsdShade.Material.Define(stage, "/World/Looks/Gold");
const shader = UsdShade.Shader.Define(stage, "/World/Looks/Gold/PreviewSurface");

shader.CreateIdAttr("UsdPreviewSurface");
shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(1.0, 0.72, 0.2));
shader.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(1.0);
shader.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.28);
const surfaceOutput = shader.CreateOutput("surface", Sdf.ValueTypeNames.Token);
material.CreateSurfaceOutput().ConnectToSource(surfaceOutput);

print(stage.ExportToString());`,
  },
  {
    title: "Bind Material",
    group: "Materials",
    code: `stage = Usd.Stage.CreateNew("/tmp/bind-material.usda");
const cube = UsdGeom.Cube.Define(stage, "/World/Box");
const material = UsdShade.Material.Define(stage, "/World/Looks/BluePaint");
const shader = UsdShade.Shader.Define(stage, "/World/Looks/BluePaint/PreviewSurface");

shader.CreateIdAttr("UsdPreviewSurface");
shader.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(0.1, 0.25, 1));
const surfaceOutput = shader.CreateOutput("surface", Sdf.ValueTypeNames.Token);
material.CreateSurfaceOutput().ConnectToSource(surfaceOutput);
UsdShade.MaterialBindingAPI(cube).Bind(material);

print(cube.GetPrim().GetRelationship("material:binding").GetTargets().get(0));`,
  },
  {
    title: "Texture Shader Network",
    group: "Materials",
    code: `stage = Usd.Stage.CreateNew("/tmp/texture-network.usda");
const material = UsdShade.Material.Define(stage, "/World/Looks/Textured");
const surface = UsdShade.Shader.Define(stage, "/World/Looks/Textured/PreviewSurface");
const texture = UsdShade.Shader.Define(stage, "/World/Looks/Textured/DiffuseTexture");

surface.CreateIdAttr("UsdPreviewSurface");
texture.CreateIdAttr("UsdUVTexture");
texture.CreateInput("file", Sdf.ValueTypeNames.String).Set("textures/albedo.png");
const textureRgb = texture.CreateOutput("rgb", Sdf.ValueTypeNames.Color3f);
surface.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(textureRgb);
const surfaceOutput = surface.CreateOutput("surface", Sdf.ValueTypeNames.Token);
material.CreateSurfaceOutput().ConnectToSource(surfaceOutput);

print(stage.ExportToString());`,
  },
  {
    title: "Variant Set",
    group: "Composition",
    code: `stage = Usd.Stage.CreateNew("/tmp/variant-set.usda");
const model = UsdGeom.Xform.Define(stage, "/World/Model").GetPrim();
const variants = model.GetVariantSets().AddVariantSet("shape");

variants.AddVariant("sphere");
variants.AddVariant("cube");
variants.DefinePrim("sphere", "/World/Model/Geom", "Sphere").CreateAttribute("radius", Sdf.ValueTypeNames.Double, false).Set(0.9);
variants.DefinePrim("cube", "/World/Model/Geom", "Cube").CreateAttribute("size", Sdf.ValueTypeNames.Double, false).Set(1.4);
await variants.SetVariantSelection("cube");

print({ selection: variants.GetVariantSelection(), names: variants.GetVariantNames() });`,
  },
  {
    title: "Variant Switch",
    group: "Composition",
    code: `stage = Usd.Stage.CreateNew("/tmp/variant-switch.usda");
const root = stage.DefinePrim("/World/Product", "Xform");
const look = root.GetVariantSets().AddVariantSet("look");

look.AddVariant("warm");
look.AddVariant("cool");
look.DefinePrim("warm", "/World/Product/Swatch", "Sphere").CreateAttribute("userProperties:look", Sdf.ValueTypeNames.Token, true).Set("warm");
look.DefinePrim("cool", "/World/Product/Swatch", "Sphere").CreateAttribute("userProperties:look", Sdf.ValueTypeNames.Token, true).Set("cool");
await look.SetVariantSelection("warm");
print(stage.GetPrimAtPath("/World/Product/Swatch").GetAttribute("userProperties:look").GetValueString());
await look.SetVariantSelection("cool");
print(stage.GetPrimAtPath("/World/Product/Swatch").GetAttribute("userProperties:look").GetValueString());`,
  },
  {
    title: "Payload",
    group: "Composition",
    code: `stage = Usd.Stage.CreateNew("/tmp/payload-root.usda");
const payloadStage = Usd.Stage.CreateNew("/tmp/payload-asset.usda");
payloadStage.DefinePrim("/PayloadRoot", "Xform");
payloadStage.DefinePrim("/PayloadRoot/Sphere", "Sphere");
payloadStage.Export("/tmp/payload-asset.usda");

const holder = stage.DefinePrim("/World/PayloadHolder", "Xform");
holder.GetPayloads().AddPayload("payload-asset.usda", "/PayloadRoot");

print(inspectPrim(holder));`,
  },
  {
    title: "Payload Load State",
    group: "Composition",
    code: `stage = Usd.Stage.CreateNew("/tmp/payload-load.usda");
const payloadStage = Usd.Stage.CreateNew("/tmp/payload-load-asset.usda");
payloadStage.DefinePrim("/PayloadRoot", "Xform");
payloadStage.DefinePrim("/PayloadRoot/Cube", "Cube");
payloadStage.Export("/tmp/payload-load-asset.usda");

const holder = stage.DefinePrim("/World/Holder", "Xform");
holder.GetPayloads().AddPayload("payload-load-asset.usda", "/PayloadRoot");
print({ before: holder.IsLoaded() });
holder.Unload();
print({ unloaded: holder.IsLoaded() });
holder.Load();
print({ loaded: holder.IsLoaded() });`,
  },
  {
    title: "Open Text Layer",
    group: "Composition",
    code: `mountText("/tmp/from-text.usda", \`#usda 1.0

def Xform "World"
{
    def Sphere "Loaded"
    {
        double radius = 2
    }
}
\`);

stage = await Usd.Stage.Open("/tmp/from-text.usda");
print(listPrims(stage));`,
  },
  {
    title: "Referenced Layer",
    group: "Composition",
    code: `mountText("/tmp/reference-base.usda", \`#usda 1.0
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
print(inspectPrim(stage.GetPrimAtPath("/World")));`,
  },
  {
    title: "Layer Stack",
    group: "Inspection",
    code: `stage = Usd.Stage.CreateNew("/tmp/layer-stack.usda");
stage.DefinePrim("/World", "Xform");

print(stage.GetLayerStack(true).map((layer) => ({
  identifier: layer.identifier,
  displayName: layer.displayName,
  realPath: layer.realPath,
})));`,
  },
  {
    title: "Used Layers",
    group: "Inspection",
    code: `mountText("/tmp/used-base.usda", \`#usda 1.0
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
print(stage.GetUsedLayers(false).map((layer) => layer.displayName));`,
  },
  {
    title: "Traverse",
    group: "Inspection",
    code: `stage = Usd.Stage.CreateNew("/tmp/traverse.usda");
stage.DefinePrim("/World", "Xform");
stage.DefinePrim("/World/A", "Sphere");
stage.DefinePrim("/World/B", "Cube");
stage.DefinePrim("/World/B/Child", "Scope");

print(listPrims(stage));`,
  },
  {
    title: "Property Names",
    group: "Inspection",
    code: `stage = Usd.Stage.CreateNew("/tmp/property-names.usda");
const cube = UsdGeom.Cube.Define(stage, "/World/Cube");
cube.CreateSizeAttr(2);
cube.GetPrim().CreateAttribute("userProperties:label", Sdf.ValueTypeNames.String, true).Set("inspection target");

print(vectorToArray(cube.GetPrim().GetPropertyNames()));`,
  },
  {
    title: "Attribute Resolve Info",
    group: "Inspection",
    code: `stage = Usd.Stage.CreateNew("/tmp/resolve-info.usda");
const sphere = UsdGeom.Sphere.Define(stage, "/World/Sphere");
sphere.CreateRadiusAttr(1.25);

const attr = sphere.GetPrim().GetAttribute("radius");
print({
  value: attr.GetValueString(),
  resolve: attr.GetResolveInfo(Usd.TimeCode.Default()),
});`,
  },
  {
    title: "Prim Stack",
    group: "Inspection",
    code: `mountText("/tmp/stack-base.usda", \`#usda 1.0
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
print(stage.GetPrimAtPath("/World").GetPrimStackWithLayerOffsets());`,
  },
  {
    title: "Composition Arcs",
    group: "Inspection",
    code: `mountText("/tmp/arcs-base.usda", \`#usda 1.0
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
print(stage.GetPrimAtPath("/World").GetCompositionArcs());`,
  },
  {
    title: "Objects Changed",
    group: "Inspection",
    code: `stage = Usd.Stage.CreateNew("/tmp/notices.usda");
const prim = stage.DefinePrim("/World/Thing", "Xform");
const notices = [];
const listener = stage.RegisterObjectsChanged((notice) => notices.push(notice));

prim.SetActive(false);
await new Promise((resolve) => setTimeout(resolve, 0));
stage.RevokeObjectsChanged(listener);

print(notices);`,
  },
  {
    title: "Active State",
    group: "Authoring",
    code: `stage = Usd.Stage.CreateNew("/tmp/active-state.usda");
const keep = stage.DefinePrim("/World/Keep", "Cube");
const mute = stage.DefinePrim("/World/Mute", "Cube");

mute.SetActive(false);
print({
  keep: keep.IsActive(),
  mute: mute.IsActive(),
  traverse: listPrims(stage),
});`,
  },
  {
    title: "Apply API Schema",
    group: "Authoring",
    code: `stage = Usd.Stage.CreateNew("/tmp/apply-api.usda");
const prim = stage.DefinePrim("/World/BoundThing", "Cube");

prim.ApplyAPI("MaterialBindingAPI");
prim.CreateRelationship("material:binding", false).AddTarget("/World/Looks/Preview");

print(stage.ExportToString());`,
  },
  {
    title: "Cameras And Lights",
    group: "Scene Building",
    code: `stage = Usd.Stage.CreateNew("/tmp/cameras-lights.usda");
const camera = UsdGeom.Camera.Define(stage, "/World/Camera");
camera.CreateFocalLengthAttr(35);
UsdGeom.XformCommonAPI(camera).SetTranslate(Gf.Vec3d(0, 2, 6));
UsdGeom.XformCommonAPI(camera).SetRotate(Gf.Vec3f(-15, 0, 0));

const light = stage.DefinePrim("/World/KeyLight", "DistantLight");
light.CreateAttribute("inputs:intensity", Sdf.ValueTypeNames.Float, false).Set(600);
light.CreateAttribute("inputs:color", Sdf.ValueTypeNames.Color3f, false).Set(Gf.Vec3f(1, 0.94, 0.86));

print(stage.ExportToString());`,
  },
  {
    title: "USDZ Package",
    group: "Export",
    code: `stage = Usd.Stage.CreateNew("/tmp/package-source.usda");
UsdGeom.Sphere.Define(stage, "/World/Sphere").CreateRadiusAttr(1.5);
stage.GetRootLayer().Export("/tmp/package-source.usda");

const ok = USD.CreateUsdzPackage("/tmp/package-source.usda", "/tmp/package.usdz");
const bytes = USD.ReadFile("/tmp/package.usdz");

print({ ok, byteLength: bytes.byteLength, zipMagic: [bytes[0], bytes[1]] });`,
  },
  {
    title: "Reopen Verification",
    group: "Export",
    code: `stage = Usd.Stage.CreateNew("/tmp/reopen.usda");
const sphere = UsdGeom.Sphere.Define(stage, "/World/Sphere");
sphere.CreateRadiusAttr(4.2);
stage.Export("/tmp/reopen.usda");

const reopened = await Usd.Stage.Open("/tmp/reopen.usda");
print(reopened.GetPrimAtPath("/World/Sphere").GetAttribute("radius").GetValueString());`,
  },
  {
    title: "Build Info",
    group: "Runtime",
    code: `const info = JSON.parse(USD.GetBuildInfoJson());
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
    code: `mountText("/tmp/fs-note.txt", "hello from MEMFS");

print({
  tmpEntries: USD.FS_readdir("/tmp"),
  exists: USD.FS_analyzePath("/tmp/fs-note.txt").exists,
  text: new TextDecoder().decode(USD.ReadFile("/tmp/fs-note.txt")),
});`,
  },
  {
    title: "Sdf Paths",
    group: "Runtime",
    code: `const root = new Sdf.Path("/World");
const child = root.AppendChild("Geom");
const prop = child.AppendProperty("xformOp:translate");

stage = Usd.Stage.CreateNew("/tmp/sdf-paths.usda");
UsdGeom.Xform.Define(stage, child);
stage.GetPrimAtPath(child.GetString()).CreateAttribute("xformOp:translate", Sdf.ValueTypeNames.Double3, false).Set(Gf.Vec3d(1, 2, 3));

print({ child: child.GetString(), property: prop.GetString() });`,
  },
];
