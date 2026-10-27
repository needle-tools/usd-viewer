const DEFAULT_TIME = Number.NaN;

const TYPE_NAMES = {
  Bool: "bool",
  Int: "int",
  Float: "float",
  Double: "double",
  String: "string",
  Token: "token",
  Asset: "asset",
  Color3f: "color3f",
  Color3fArray: "color3f[]",
  Float3: "float3",
  Float3Array: "float3[]",
  Double3: "double3",
  Double3Array: "double3[]",
  Vector3f: "vector3f",
  Vector3fArray: "vector3f[]",
  Vector3d: "vector3d",
  Vector3dArray: "vector3d[]",
  Matrix4d: "matrix4d",
  FloatArray: "float[]",
  DoubleArray: "double[]",
  StringArray: "string[]",
  TokenArray: "token[]",
  Point3fArray: "point3f[]",
  Normal3fArray: "normal3f[]",
  IntArray: "int[]",
};

const REQUIRED_EXPORTS = [
  "SdfPath",
  "GfVec3f",
  "GfVec3d",
  "GfMatrix4d",
  "UsdGeomXform",
  "UsdGeomScope",
  "UsdGeomSphere",
  "UsdGeomCube",
  "UsdGeomMesh",
  "UsdGeomCamera",
  "UsdGeomXformOp",
  "UsdGeomXformCommonAPI",
  "UsdShadeMaterial",
  "UsdShadeShader",
  "UsdShadeInput",
  "UsdShadeOutput",
  "UsdShadeMaterialBindingAPI",
];

function requireNativeSurface(USD) {
  const missing = REQUIRED_EXPORTS.filter((name) => typeof USD[name] !== "function");
  if (missing.length) {
    throw new Error(`OpenUSD wasm bindings are missing required REPL exports: ${missing.join(", ")}`);
  }
}

function installStageShape(USD) {
  USD.Stage.CreateNew ??= (path) => USD.CreateStage(pathString(path));
  USD.Stage.Open ??= (path) => USD.OpenStage(pathString(path));

  const definePrim = USD.Stage.prototype.DefinePrim;
  USD.Stage.prototype.DefinePrim = function DefinePrim(path, typeName = "") {
    return definePrim.call(this, pathString(path), String(typeName));
  };

  const getPrimAtPath = USD.Stage.prototype.GetPrimAtPath;
  USD.Stage.prototype.GetPrimAtPath = function GetPrimAtPath(path) {
    return getPrimAtPath.call(this, pathString(path));
  };
}

function installAttributeShape(USD) {
  const attrSet = USD.Attribute.prototype.Set;
  USD.Attribute.prototype.Set = function Set(value, timeCode = DEFAULT_TIME) {
    return attrSet.call(this, value, timeCode);
  };
  USD.Attribute.prototype.Get ??= function Get(timeCode = DEFAULT_TIME) {
    return Number.isNaN(timeCode) ? this.GetValueString() : this.GetValueStringAtTime(timeCode);
  };

  const xformOpSet = USD.UsdGeomXformOp.prototype.Set;
  USD.UsdGeomXformOp.prototype.Set = function Set(value, timeCode = DEFAULT_TIME) {
    return xformOpSet.call(this, value, timeCode);
  };
}

function installPrimShape(USD) {
  USD.Prim.prototype.GetPayloads ??= function GetPayloads() {
    const prim = this;
    return {
      AddPayload(assetPath, primPath = "") {
        return prim.AddPayload(String(assetPath), pathString(primPath));
      },
    };
  };

  USD.Prim.prototype.GetVariantSets ??= function GetVariantSets() {
    const prim = this;
    return {
      AddVariantSet(name) {
        return variantSet(prim, name);
      },
      GetVariantSet(name) {
        return variantSet(prim, name);
      },
      GetNames() {
        return vectorToArray(prim.GetVariantSetNames());
      },
    };
  };
}

function installSchemaDefaults(USD) {
  const schemas = [
    USD.UsdGeomSphere,
    USD.UsdGeomCube,
    USD.UsdGeomMesh,
    USD.UsdGeomCamera,
    USD.UsdShadeShader,
  ];

  for (const Schema of schemas) {
    for (const name of Object.getOwnPropertyNames(Schema.prototype)) {
      if (!/^Create.*Attr$/.test(name)) continue;
      const nativeMethod = Schema.prototype[name];
      Schema.prototype[name] = function createAttr(defaultValue = undefined, writeSparsely = false) {
        return nativeMethod.call(this, defaultValue, writeSparsely);
      };
    }
  }

  for (const Schema of [USD.UsdGeomXform, USD.UsdGeomScope, ...schemas, USD.UsdShadeMaterial]) {
    const define = Schema.Define;
    Schema.Define = function Define(stage, path) {
      const resolvedPath = pathString(path);
      return decorateSchema(define.call(Schema, stage, resolvedPath), stage, resolvedPath);
    };
    const get = Schema.Get;
    Schema.Get = function Get(stage, path) {
      const resolvedPath = pathString(path);
      return decorateSchema(get.call(Schema, stage, resolvedPath), stage, resolvedPath);
    };
  }

  const createSurfaceOutput = USD.UsdShadeMaterial.prototype.CreateSurfaceOutput;
  USD.UsdShadeMaterial.prototype.CreateSurfaceOutput = function CreateSurfaceOutput(renderContext = "") {
    return createSurfaceOutput.call(this, String(renderContext));
  };

  const shaderCreateOutput = USD.UsdShadeShader.prototype.CreateOutput;
  USD.UsdShadeShader.prototype.CreateOutput = function CreateOutput(name, typeName = TYPE_NAMES.Token) {
    return shaderCreateOutput.call(this, String(name), String(typeName));
  };
}

function decorateSchema(schema, stage, path) {
  if (schema && typeof schema.GetPrim !== "function") {
    schema.GetPrim = () => stage.GetPrimAtPath(path);
  }
  return schema;
}

function installShadeDefaults(USD) {
  const inputSet = USD.UsdShadeInput.prototype.Set;
  USD.UsdShadeInput.prototype.Set = function Set(value, timeCode = DEFAULT_TIME) {
    return inputSet.call(this, value, timeCode);
  };

  const outputSet = USD.UsdShadeOutput.prototype.Set;
  USD.UsdShadeOutput.prototype.Set = function Set(value, timeCode = DEFAULT_TIME) {
    return outputSet.call(this, value, timeCode);
  };
}

function installXformCommonDefaults(USD) {
  const { prototype } = USD.UsdGeomXformCommonAPI;
  const setTranslate = prototype.SetTranslate;
  prototype.SetTranslate = function SetTranslate(value, timeCode = DEFAULT_TIME) {
    return setTranslate.call(this, value, timeCode);
  };
  const setRotate = prototype.SetRotate;
  prototype.SetRotate = function SetRotate(value, timeCode = DEFAULT_TIME) {
    return setRotate.call(this, value, timeCode);
  };
  const setScale = prototype.SetScale;
  prototype.SetScale = function SetScale(value, timeCode = DEFAULT_TIME) {
    return setScale.call(this, value, timeCode);
  };
}

function variantSet(prim, name) {
  const setName = String(name);
  return {
    AddVariant(variantName) {
      return prim.AddVariant(setName, String(variantName));
    },
    SetVariantSelection(variantName) {
      return prim.SetVariantSelection(setName, String(variantName));
    },
    GetVariantSelection() {
      return prim.GetVariantSelection(setName);
    },
    GetVariantNames() {
      return vectorToArray(prim.GetVariantNames(setName));
    },
    DefinePrim(variantName, path, typeName) {
      return prim.DefinePrimInVariant(setName, String(variantName), pathString(path), String(typeName));
    },
  };
}

function unwrapPrim(value) {
  if (typeof value?.GetPrim === "function") return value.GetPrim();
  return value;
}

function pathString(value) {
  if (value?.GetString) return value.GetString();
  if (value?.GetAsString) return value.GetAsString();
  if (value?.pathString) return String(value.pathString);
  if (value?.GetPath) return pathString(value.GetPath());
  return String(value);
}

function vectorToArray(vector) {
  if (!vector) return [];
  if (Array.isArray(vector)) return vector;
  const result = [];
  try {
    for (let i = 0; i < vector.size(); i++) result.push(vector.get(i));
  }
  finally {
    vector.delete?.();
  }
  return result;
}

function makeVtArrayFromScalarValues(values = [], convert = (value) => value) {
  return Array.from(values, convert);
}

function makeVtArrayFromVec3Values(values = []) {
  return Array.from(values);
}

export function createPxrFacade(USD) {
  requireNativeSurface(USD);
  installStageShape(USD);
  installAttributeShape(USD);
  installPrimShape(USD);
  installSchemaDefaults(USD);
  installShadeDefaults(USD);
  installXformCommonDefaults(USD);

  function Vec3f(...args) {
    return new USD.GfVec3f(...args);
  }

  function Vec3d(...args) {
    return new USD.GfVec3d(...args);
  }

  function Matrix4d(...args) {
    return new USD.GfMatrix4d(...args);
  }
  Matrix4d.Identity = () => USD.GfMatrix4d.Identity();

  const Usd = {
    Stage: USD.Stage,
    TimeCode: {
      Default: () => DEFAULT_TIME,
      EarliestTime: () => Number.NEGATIVE_INFINITY,
    },
  };

  const UsdGeom = {
    Tokens: {
      x: "X",
      y: "Y",
      z: "Z",
      default_: "default",
      render: "render",
      proxy: "proxy",
      guide: "guide",
      inherited: "inherited",
      invisible: "invisible",
      constant: "constant",
      uniform: "uniform",
      varying: "varying",
      vertex: "vertex",
      faceVarying: "faceVarying",
    },
    SetStageUpAxis(stage, axis) {
      return stage.SetUpAxis(axis);
    },
    Xform: USD.UsdGeomXform,
    Scope: USD.UsdGeomScope,
    Sphere: USD.UsdGeomSphere,
    Cube: USD.UsdGeomCube,
    Mesh: USD.UsdGeomMesh,
    Camera: USD.UsdGeomCamera,
    XformOp: USD.UsdGeomXformOp,
    XformCommonAPI(schemaOrPrim) {
      return new USD.UsdGeomXformCommonAPI(unwrapPrim(schemaOrPrim));
    },
  };

  const UsdShade = {
    Tokens: {
      surface: "surface",
      universalRenderContext: "universalRenderContext",
    },
    Material: USD.UsdShadeMaterial,
    Shader: USD.UsdShadeShader,
    Input: USD.UsdShadeInput,
    Output: USD.UsdShadeOutput,
    MaterialBindingAPI(schemaOrPrim) {
      return new USD.UsdShadeMaterialBindingAPI(unwrapPrim(schemaOrPrim));
    },
  };

  const Sdf = {
    Path: USD.SdfPath,
    ValueTypeNames: TYPE_NAMES,
  };

  const Gf = { Vec3f, Vec3d, Matrix4d };

  const Vt = {
    Vec3fArray(values = []) {
      return makeVtArrayFromVec3Values(values);
    },
    Vec3dArray(values = []) {
      return makeVtArrayFromVec3Values(values);
    },
    IntArray(values = []) {
      return makeVtArrayFromScalarValues(values, (value) => Number.parseInt(value, 10));
    },
    FloatArray(values = []) {
      return makeVtArrayFromScalarValues(values, Number);
    },
    DoubleArray(values = []) {
      return makeVtArrayFromScalarValues(values, Number);
    },
    StringArray(values = []) {
      return makeVtArrayFromScalarValues(values, String);
    },
    TokenArray(values = []) {
      return makeVtArrayFromScalarValues(values, String);
    },
  };

  const Tf = {
    Token: (value) => String(value),
  };

  return { Usd, UsdGeom, UsdShade, Sdf, Gf, Vt, Tf, vectorToArray };
}
