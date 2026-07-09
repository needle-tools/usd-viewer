import * as THREE from 'three';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const {
  TextureLoader,
  BufferGeometry,
  MeshPhysicalMaterial,
  FrontSide,
  BackSide,
  DoubleSide,
  Color,
  Mesh,
  Points,
  PointsMaterial,
  InstancedMesh,
  Matrix4,
  BufferAttribute,
  Float32BufferAttribute,
  WireframeGeometry,
  LineSegments,
  LineBasicMaterial,
  SRGBColorSpace,
  RGBAFormat,
  RepeatWrapping,
  LinearSRGBColorSpace,
  CanvasTexture,
  Vector2,
  CameraHelper,
  DirectionalLight,
  DirectionalLightHelper,
  HemisphereLight,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  PointLightHelper,
  MathUtils,
} = THREE;

const debugTextures = false;
const debugMaterials = false;
const debugMeshes = false;
const debugPrims = false;
const disableTextures = false;
const disableMaterials = false;

let materialXModulePromise = null;

function hydraTimingEnabled() {
  if (typeof location === "undefined") return false;
  const params = new URLSearchParams(location.search);
  return params.get("hydraTiming") === "1" || params.get("hydraProfile") === "1";
}

function timeHydraUpdate(label, callback) {
  if (!hydraTimingEnabled()) return callback();
  console.time(label);
  try {
    return callback();
  }
  finally {
    console.timeEnd(label);
  }
}

async function getMaterialXModule() {
  materialXModulePromise ??= import('@needle-tools/materialx').then(module => ({
    MaterialX: module.Experimental_API,
    MaterialXMaterial: module.MaterialXMaterial,
  }));
  return materialXModulePromise;
}

function disposeTexture(texture, disposed = new Set()) {
  if (!texture || disposed.has(texture) || typeof texture.dispose !== 'function') return;
  disposed.add(texture);
  texture.dispose();
}

function disposeMaterialResources(material, disposedMaterials = new Set(), disposedTextures = new Set()) {
  if (!material) return;
  if (Array.isArray(material)) {
    for (const entry of material) disposeMaterialResources(entry, disposedMaterials, disposedTextures);
    return;
  }
  if (disposedMaterials.has(material)) return;
  disposedMaterials.add(material);

  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && value.isTexture) {
      disposeTexture(value, disposedTextures);
    }
  }

  if (material !== defaultMaterial && typeof material.dispose === 'function') {
    material.dispose();
  }
}

function disposeObjectResources(object) {
  if (!object) return;
  object.traverse?.((entry) => {
    entry.geometry?.dispose?.();
    disposeMaterialResources(entry.material);
  });
  object.parent?.remove(object);
}

function prepareMaterialXMaterialForGeometry(material) {
  if (!material || typeof material.onBeforeRender !== 'function') return material;
  if (material.userData?.usdHydraMaterialXGeometryGuard) return material;
  if (!material.isMaterialXMaterial && material.constructor?.name !== 'MaterialXMaterial') return material;

  material.userData ??= {};
  material.userData.usdHydraMaterialXGeometryGuard = true;
  const originalOnBeforeRender = material.onBeforeRender.bind(material);
  material.onBeforeRender = (renderer, scene, camera, geometry, object, group) => {
    const needsTangents = material._needsTangents && !geometry?.attributes?.tangent;
    const canGenerateTangents = geometry?.attributes?.position && geometry?.attributes?.uv;
    const hasHydraNormals = geometry?.attributes?.normal;
    if (needsTangents && !hasHydraNormals) {
      material.needsUpdate = true;
      return;
    }
    if (needsTangents && !canGenerateTangents) {
      if (debugMaterials && !material._missingTangentsWarned) {
        material._missingTangentsWarned = true;
        console.warn(`[MaterialX] Tangents are required for this material (${material.name}) but could not be generated for the geometry.`);
      }
      const previousGenerateTangents = material.generateTangents;
      material.generateTangents = false;
      try {
        return originalOnBeforeRender(renderer, scene, camera, geometry, object, group);
      } finally {
        material.generateTangents = previousGenerateTangents;
      }
    }
    return originalOnBeforeRender(renderer, scene, camera, geometry, object, group);
  };
  return material;
}

function isFiniteArray(values, dimension = 3) {
  if (!values || values.length === 0 || values.length % dimension !== 0) return false;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) return false;
  }
  return true;
}

function copyIndexArray(indices) {
  if (!indices || !Number.isInteger(indices.length)) return null;
  const values = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    if (!Number.isInteger(index) || index < 0) return null;
    values[i] = index;
  }
  return values;
}

function cullStyleToThreeSide(doubleSided, cullStyle) {
  switch (cullStyle) {
    case "nothing":
      return DoubleSide;
    case "back":
      return FrontSide;
    case "front":
      return BackSide;
    case "frontUnlessDoubleSided":
      return doubleSided ? DoubleSide : BackSide;
    case "backUnlessDoubleSided":
    case "dontCare":
    default:
      return doubleSided ? DoubleSide : FrontSide;
  }
}

function primNameFromPath(id, fallback) {
  const path = String(id || "");
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.substring(slash + 1) || fallback : path || fallback;
}

function applyHydraTransform(object, matrix) {
  if (!object || !matrix || matrix.length < 16) return;
  object.matrix.set(...Array.from(matrix).slice(0, 16));
  object.matrix.transpose();
  object.matrix.decompose(object.position, object.quaternion, object.scale);
  object.matrixAutoUpdate = true;
}

const defaultScenePrimitiveLightIntensityScale = 0.01;
const lightSprimTypeIds = new Set([
  "domeLight",
  "cylinderLight",
  "diskLight",
  "distantLight",
  "light",
  "rectLight",
  "simpleLight",
  "sphereLight",
]);

const usdLightTypeNames = {
  domeLight: "DomeLight",
  cylinderLight: "CylinderLight",
  diskLight: "DiskLight",
  distantLight: "DistantLight",
  light: "LightAPI",
  rectLight: "RectLight",
  simpleLight: "SimpleLight",
  sphereLight: "SphereLight",
};

class TextureRegistry {
  /** 
   * @param {import('..').threeJsRenderDelegateConfig} config
   */
  constructor(config) {
    this.config = config;
    this.allPaths = config.paths;
    this.textures = [];
    this.loadedTextures = new Set();
    this.objectUrls = new Set();
    this.materialXDefinitionCache = new Map();
    this.disposed = false;
    this.loader = new TextureLoader();
    this.tgaLoader = new TGALoader();
    this.exrLoader = new EXRLoader();
    this.driverFileQueue = Promise.resolve();

  }

  normalizeResourcePath(resourcePath) {
    const rawPath = String(resourcePath ?? "").replace(/\\/g, "/");
    const isUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawPath);
    if (isUrl) {
      return rawPath;
    }

    const preserveLeadingSlash = rawPath.startsWith("/");
    const path = rawPath
      .replace(/^\/+/, preserveLeadingSlash ? "/" : "")
      .replace(/^(?:\.\/)+/, "")
      .replace(/\/\.\//g, "/");
    const parts = [];
    for (const part of path.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        parts.pop();
        continue;
      }
      parts.push(part);
    }
    return (preserveLeadingSlash ? "/" : "") + parts.join("/");
  }

  materialResourcePathCandidates(resourcePath) {
    const rawPath = String(resourcePath ?? "").replace(/\\/g, "/");
    const normalized = this.normalizeResourcePath(rawPath);
    const withoutLeadingSlash = normalized.replace(/^\/+/, "");
    const candidates = new Set([
      rawPath,
      normalized,
      withoutLeadingSlash,
      withoutLeadingSlash.replace(/^(?:\.\/)+/, ""),
      withoutLeadingSlash.replace(/^(?:\.\.\/)+/, ""),
    ]);

    const pathParts = withoutLeadingSlash.split("/").filter(Boolean);
    const texturesIndex = pathParts.lastIndexOf("textures");
    if (texturesIndex >= 0) {
      candidates.add(pathParts.slice(texturesIndex).join("/"));
    }

    return [...candidates].filter(Boolean);
  }

  getResourceExtension(resourcePath) {
    const path = String(resourcePath ?? "").toLowerCase();
    const extensionMatches = [...path.matchAll(/\.([a-z0-9]+)(?=\]|$|[?#])/g)];
    return extensionMatches.length ? extensionMatches[extensionMatches.length - 1][1] : "";
  }

  async readResourceText(resourcePath) {
    const candidates = this.materialResourcePathCandidates(resourcePath)
      .flatMap(candidate => candidate.startsWith("/") ? [candidate] : [candidate, `/${candidate}`]);
    for (const candidate of candidates) {
      const file = this.readResolvedResource(candidate);
      if (file) return new TextDecoder().decode(file);
    }

    for (const candidate of candidates) {
      const file = await new Promise(resolve => {
        try {
          this.config.driver().getFile(candidate, resolve);
        } catch {
          resolve(null);
        }
      });
      if (file) return new TextDecoder().decode(file);
    }

    return "";
  }

  async materialXDefinitionsFor(nodeDefNames) {
    const missing = new Set(nodeDefNames);
    if (!missing.size || typeof DOMParser === "undefined" || typeof XMLSerializer === "undefined") {
      return "";
    }

    const serializer = new XMLSerializer();
    const definitions = [];
    const knownPaths = Array.isArray(this.allPaths) ? this.allPaths : [];
    for (const path of knownPaths) {
      if (this.getResourceExtension(path) !== "mtlx") continue;

      let xml = this.materialXDefinitionCache.get(path);
      if (xml === undefined) {
        xml = await this.readResourceText(path).catch(() => "");
        this.materialXDefinitionCache.set(path, xml || "");
      }
      if (!xml) continue;

      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const root = doc.documentElement;
      if (!root || root.nodeName.toLowerCase() === "parsererror") continue;

      const topLevelElements = [...root.children];
      for (const nodeDef of topLevelElements.filter(element => element.localName === "nodedef" && element.hasAttribute("name"))) {
        const name = nodeDef.getAttribute("name");
        if (missing.has(name)) definitions.push(serializer.serializeToString(nodeDef));
      }

      for (const nodeGraph of topLevelElements.filter(element => element.localName === "nodegraph" && element.hasAttribute("nodedef"))) {
        if (missing.has(nodeGraph.getAttribute("nodedef"))) {
          definitions.push(serializer.serializeToString(nodeGraph));
        }
      }
    }

    return [...new Set(definitions)].join("\n");
  }

  readResolvedResource(resourcePath) {
    if (!resourcePath || typeof this.config.USD?.ReadFile !== "function") {
      return null;
    }

    const path = String(resourcePath);
    const candidates = path.startsWith("/")
      ? [path]
      : this.materialResourcePathCandidates(path)
        .flatMap(candidate => candidate.startsWith("/") ? [candidate] : [candidate, `/${candidate}`]);

    for (const candidate of candidates) {
      try {
        const file = this.config.USD.ReadFile(candidate);
        if (file?.byteLength) return file;
      }
      catch {
      }
    }

    return null;
  }

  resolveHttpResourceUrl(resourcePath) {
    const rootFile = this.config.rootFile;
    if (!rootFile || !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rootFile)) {
      return "";
    }
    if (!resourcePath?.startsWith("/tmp/1/")) {
      return "";
    }

    const baseTempDir = "/tmp/1/1/1/1/1/1/";
    const targetParts = resourcePath.split("/").filter(Boolean);
    const baseParts = baseTempDir.split("/").filter(Boolean);
    let common = 0;
    while (
      common < targetParts.length &&
      common < baseParts.length &&
      targetParts[common] === baseParts[common]
    ) {
      common++;
    }

    const relativeParts = [
      ...baseParts.slice(common).map(() => ".."),
      ...targetParts.slice(common),
    ];
    if (!relativeParts.length) {
      return "";
    }

    return new URL(relativeParts.join("/"), rootFile).href;
  }

  resolveResourcePath(resourcePath) {
    const candidates = this.materialResourcePathCandidates(resourcePath);
    if (!candidates.length) return "";

    const knownPaths = Array.isArray(this.allPaths) ? this.allPaths : [];
    for (const candidate of candidates) {
      const candidateWithoutRoot = candidate.replace(/^needle\//, "");
      for (const knownPath of knownPaths) {
        const known = this.normalizeResourcePath(knownPath);
        const knownWithoutRoot = known.replace(/^needle\//, "");
        if (
          known === candidate ||
          knownWithoutRoot === candidate ||
          knownWithoutRoot === candidateWithoutRoot ||
          knownWithoutRoot.endsWith("/" + candidateWithoutRoot)
        ) {
          return known;
        }
      }
    }

    return candidates[0];
  }

  getTexture(resourcePath) {
    resourcePath = this.resolveResourcePath(resourcePath);
    if (debugTextures) console.log("get texture", resourcePath);
    if (this.textures[resourcePath]) {
      return this.textures[resourcePath];
    }

    let textureResolve, textureReject;
    this.textures[resourcePath] = new Promise((resolve, reject) => {
      textureResolve = resolve;
      textureReject = reject;
    });

    if (!resourcePath) {
      return Promise.reject(new Error('Empty resource path for file: ' + resourcePath));
    }

    let filetype = undefined;
    const extension = this.getResourceExtension(resourcePath);
    if (extension === 'png') {
      filetype = 'image/png';
    } else if (extension === 'jpg') {
      filetype = 'image/jpeg';
    } else if (extension === 'jpeg') {
      filetype = 'image/jpeg';
    } else if (extension === 'exr') {
      filetype = 'image/x-exr';
    } else if (extension === 'tga') {
      filetype = 'image/tga';
    } else {
      console.error("Error when loading texture: unknown filetype", resourcePath);
      // throw new Error('Unknown filetype');
    }

    let loader = this.loader;
    if (filetype === 'image/tga')
      loader = this.tgaLoader;
    else if (filetype === 'image/x-exr')
      loader = this.exrLoader;

    const loadFromUrl = (url, revokeOnLoad = false) => {
      if (debugTextures) console.log("Loading texture from", url, "with loader", loader, "resourcePath", resourcePath);
      // Load the texture
      loader.load(
        // resource URL
        url,

        // onLoad callback
        (texture) => {
          if (revokeOnLoad) {
            URL.revokeObjectURL(url);
            this.objectUrls.delete(url);
          }
          texture.name = resourcePath;
          if (this.disposed) {
            texture.dispose();
          }
          else {
            this.loadedTextures.add(texture);
          }
          textureResolve(texture);
        },

        // onProgress callback currently not used
        undefined,

        // onError callback
        (err) => {
          if (revokeOnLoad) {
            URL.revokeObjectURL(url);
            this.objectUrls.delete(url);
          }
          textureReject(err);
        }
      );
    };

    const loadFromFile = (_loadedFile) => {
      if (debugTextures) console.log("window.driver.getFile", resourcePath, " => ", _loadedFile);
      if (!_loadedFile) {
        textureReject(new Error('Unknown file: ' + resourcePath));
        return;
      }

      let blob = new Blob([_loadedFile.slice(0)], { type: filetype });
      const url = URL.createObjectURL(blob);
      this.objectUrls.add(url);
      loadFromUrl(url, true);
    };

    const resolvedFile = this.readResolvedResource(resourcePath);
    if (resolvedFile) {
      loadFromFile(resolvedFile);
      return this.textures[resourcePath];
    }

    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(resourcePath)) {
      loadFromUrl(resourcePath);
      return this.textures[resourcePath];
    }

    const httpResourceUrl = this.resolveHttpResourceUrl(resourcePath);
    if (httpResourceUrl) {
      loadFromUrl(httpResourceUrl);
      return this.textures[resourcePath];
    }

    const loadFromDriverFile = () => {
      this.driverFileQueue = this.driverFileQueue.catch(() => {}).then(() => new Promise((resolveQueue) => {
        this.config.driver().getFile(resourcePath, async (loadedFile) => {
          resolveQueue();
          if (!loadedFile) {
            textureReject(new Error('Unknown file: ' + resourcePath));
            return;
          }

          loadFromFile(loadedFile);
        });
      }));
    };

    loadFromDriverFile();

    return this.textures[resourcePath];
  }

  dispose() {
    this.disposed = true;
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();

    for (const texture of this.loadedTextures) {
      texture.dispose();
    }
    this.loadedTextures.clear();

    for (const texturePromise of Object.values(this.textures)) {
      Promise.resolve(texturePromise).then(texture => {
        if (texture?.dispose) texture.dispose();
      }).catch(() => {});
    }
    this.textures = [];
  }
}

class HydraScenePrimitive {
  /**
   * @param {string} typeId
   * @param {string} id
   * @param {ThreeRenderDelegateInterface} hydraInterface
   */
  constructor(typeId, id, hydraInterface) {
    this._typeId = typeId;
    this._id = id;
    this._interface = hydraInterface;
    this._object = null;
    this._helper = null;
  }

  updateCameraState(state) {
    if (!this._id) return;
    const projection = state?.projection || "perspective";
    const isOrthographic = projection === "orthographic";
    if (!this._object || (isOrthographic && !this._object.isOrthographicCamera) || (!isOrthographic && !this._object.isPerspectiveCamera)) {
      this._replaceObject(isOrthographic
        ? new OrthographicCamera(-1, 1, 1, -1, Number(state?.near) || 0.01, Number(state?.far) || 100000)
        : new PerspectiveCamera(45, 1, Number(state?.near) || 0.01, Number(state?.far) || 100000));
      this._object.userData.usdKind = "sprim";
    }

    const focalLength = Number(state?.focalLength) || 50;
    const verticalAperture = Number(state?.verticalAperture) || 20.955;
    const horizontalAperture = Number(state?.horizontalAperture) || verticalAperture;
    const near = Number(state?.near);
    const far = Number(state?.far);
    if (this._object.isPerspectiveCamera) {
      this._object.fov = MathUtils.radToDeg(2 * Math.atan((verticalAperture * 0.5) / focalLength));
      this._object.aspect = horizontalAperture > 0 && verticalAperture > 0 ? horizontalAperture / verticalAperture : 1;
    }
    if (Number.isFinite(near) && near > 0) this._object.near = near;
    if (Number.isFinite(far) && far > 0) this._object.far = far;
    this._object.name = primNameFromPath(this._id, "UsdCamera");
    this._object.userData.usdPath = this._id;
    this._object.userData.usdTypeName = "Camera";
    applyHydraTransform(this._object, state?.transform);
    this._object.updateProjectionMatrix?.();
    this._syncHelper();
  }

  updateLightState(state) {
    if (!this._id) return;
    const typeId = String(state?.typeId || this._typeId);
    const LightCtor = typeId === "distantLight"
      ? DirectionalLight
      : typeId === "domeLight"
        ? HemisphereLight
        : PointLight;

    if (!this._object || !(this._object instanceof LightCtor)) {
      const color = new Color(1, 1, 1);
      this._replaceObject(typeId === "domeLight"
        ? new HemisphereLight(color, new Color(0.2, 0.2, 0.2), 1)
        : new LightCtor(color, 1));
      this._object.userData.usdKind = "sprim";
    }

    const colorValue = Array.isArray(state?.color) ? state.color : [1, 1, 1];
    this._object.color?.setRGB?.(
      Number(colorValue[0]) || 0,
      Number(colorValue[1]) || 0,
      Number(colorValue[2]) || 0);
    const scale = this._interface.config.scenePrimitiveLightIntensityScale ?? defaultScenePrimitiveLightIntensityScale;
    this._object.intensity = (Number(state?.intensity) || 0) * scale;
    this._object.visible = state?.visible !== false;
    this._object.name = primNameFromPath(this._id, usdLightTypeNames[typeId] || "UsdLight");
    this._object.userData.usdPath = this._id;
    this._object.userData.usdTypeName = usdLightTypeNames[typeId] || typeId;
    applyHydraTransform(this._object, state?.transform);
    this._syncHelper(state);
  }

  dispose() {
    disposeObjectResources(this._helper);
    disposeObjectResources(this._object);
    this._helper = null;
    this._object = null;
  }

  _replaceObject(object) {
    disposeObjectResources(this._helper);
    disposeObjectResources(this._object);
    this._helper = null;
    this._object = object;
    this._interface.config.scenePrimitiveRoot?.add(object);
  }

  _syncHelper(state = {}) {
    const object = this._object;
    if (!object) return;
    const wantHelper = object.isCamera
      ? (this._interface.config.showCameraHelpers || this._interface.config.showScenePrimitiveHelpers)
      : object.isLight
        ? (this._interface.config.showLightHelpers || this._interface.config.showScenePrimitiveHelpers)
        : false;
    if (!wantHelper) {
      disposeObjectResources(this._helper);
      this._helper = null;
      return;
    }

    const helperCtor = object.isCamera
      ? CameraHelper
      : object.isDirectionalLight
        ? DirectionalLightHelper
        : object.isPointLight
          ? PointLightHelper
          : null;
    if (!helperCtor) {
      disposeObjectResources(this._helper);
      this._helper = null;
      return;
    }

    const needsNewHelper = !this._helper ||
      (object.isCamera && !this._helper.isCameraHelper) ||
      (object.isDirectionalLight && this._helper.type !== "DirectionalLightHelper") ||
      (object.isPointLight && this._helper.type !== "PointLightHelper");
    if (needsNewHelper) {
      disposeObjectResources(this._helper);
      const color = object.color || new Color(1, 1, 1);
      this._helper = object.isCamera
        ? new CameraHelper(object)
        : object.isDirectionalLight
          ? new DirectionalLightHelper(object, 0.5, color)
          : new PointLightHelper(object, Number(state?.radius) || 0.25, color);
      this._helper.name = `${object.name}Helper`;
      this._helper.userData.usdHelperFor = this._id;
      this._interface.config.scenePrimitiveRoot?.add(this._helper);
    }
    this._helper.name = `${object.name}Helper`;
    this._helper.visible = object.visible;
    this._helper.update?.();
  }
}

class HydraMesh {
  /**
   * @param {string} id
   * @param {ThreeRenderDelegateInterface} hydraInterface
   */
  constructor(id, hydraInterface) {
    this._geometry = new BufferGeometry();
    this._id = id;
    this._interface = hydraInterface;
    this._points = undefined;
    this._indexedNormals = undefined;
    this._orderedNormals = undefined;
    this._constantNormal = undefined;
    this._hasAuthoredNormals = false;
    this._tangents = undefined;
    this._tangentDimension = 4;
    this._tangentInterpolation = undefined;
    this._colors = undefined;
    this._uvs = undefined;
    this._indices = undefined;
    this._materials = [];
    this._materialSideClones = new Map();
    this._side = DoubleSide;
    this._visible = false;
    this._renderTag = 'geometry';
    this._reprStyle = 'surface';
    this._instancedMesh = null;
    this._wireObject = null;
    this._instanceMatrix = new Matrix4();
    this._pendingMaterialIds = new Set();

    let material = new MeshPhysicalMaterial({
      side: DoubleSide,
      color: new Color(0xB4B4B4),
      // envMap: hydraInterface.config.envMap,
    });
    this._ownedMaterial = material;
    this._ownedPointsMaterial = new PointsMaterial({
      size: 4,
      sizeAttenuation: false,
      vertexColors: true,
      color: new Color(0xB4B4B4),
    });
    this._ownedWireMaterial = new LineBasicMaterial({
      color: new Color(0x202020),
      transparent: true,
      opacity: 0.45,
      depthTest: true,
      depthWrite: false,
    });
    this._materials.push(material);
    this._mesh = new Mesh(this._geometry, material);
    this._installMeshHooks(this._mesh);
    this._mesh.visible = false;
    this._mesh.castShadow = true;
    this._mesh.receiveShadow = true;

    // ID can contain paths, we strip those here
    let _name = id;
    let lastSlash = _name.lastIndexOf('/');
    if (lastSlash >= 0) {
      _name = _name.substring(lastSlash + 1);
    }
    this._mesh.name = _name;

    // console.log("Creating HydraMesh: " + id + " -> " + _name);

    hydraInterface.config.usdRoot.add(this._mesh); // FIXME
  }

  dispose() {
    if (!this._mesh) return;
    this._interface.unassignMeshFromMaterials(this._mesh);
    this._disposeInstancedMesh();
    this._disposeWireObject();
    this._disposeMaterialSideClones();
    if (this._mesh.parent) {
      this._mesh.parent.remove(this._mesh);
    }
    this._geometry.dispose();
    disposeMaterialResources(this._ownedMaterial);
    disposeMaterialResources(this._ownedPointsMaterial);
    disposeMaterialResources(this._ownedWireMaterial);
    this._ownedMaterial = null;
    this._ownedPointsMaterial = null;
    this._ownedWireMaterial = null;
    this._mesh = null;
  }

  _makeRenderableObject() {
    if (this._reprStyle === 'points') {
      return new Points(this._geometry, this._ownedPointsMaterial);
    }
    const material = this._mesh?.isPoints ? undefined : this._mesh?.material;
    return new Mesh(this._geometry, material || this._ownedMaterial || defaultMaterial);
  }

  _replaceRenderableObject(nextObject) {
    const previous = this._mesh;
    if (!previous || previous.type === nextObject.type) {
      if (previous) this._applyHydraReprMaterialState();
      return;
    }

    nextObject.name = previous.name;
    nextObject.matrix.copy(previous.matrix);
    nextObject.matrixAutoUpdate = previous.matrixAutoUpdate;
    nextObject.castShadow = previous.castShadow;
    nextObject.receiveShadow = previous.receiveShadow;
    nextObject.visible = previous.visible;
    this._interface.unassignMeshFromMaterials(previous);
    if (previous.parent) previous.parent.remove(previous);
    this._mesh = nextObject;
    this._installMeshHooks(this._mesh);
    this._interface.config.usdRoot.add(this._mesh);
    this._applyCullSideToMeshes();
    this._applyHydraReprMaterialState();
    this._applyVisibilityState();
  }

  _applyHydraReprMaterialState() {
    const wireframe = this._reprStyle === 'wire';
    const apply = material => {
      if (!material || !('wireframe' in material)) return;
      material.wireframe = wireframe;
      material.needsUpdate = true;
    };
    if (Array.isArray(this._mesh?.material)) {
      for (const material of this._mesh.material) apply(material);
    } else {
      apply(this._mesh?.material);
    }
    this._refreshWireObject();
  }

  _disposeWireObject() {
    if (!this._wireObject) return;
    this._wireObject.parent?.remove(this._wireObject);
    this._wireObject.geometry?.dispose?.();
    this._wireObject = null;
  }

  _refreshWireObject() {
    const wantsWireOnSurface = this._reprStyle === 'wireOnSurface';
    this._disposeWireObject();
    if (!wantsWireOnSurface || this._mesh?.isPoints || !this._geometry.getAttribute('position')) {
      return;
    }
    const wireGeometry = new WireframeGeometry(this._geometry);
    this._wireObject = new LineSegments(wireGeometry, this._ownedWireMaterial);
    this._wireObject.name = `${this._mesh.name}_wire`;
    this._wireObject.matrix.copy(this._mesh.matrix);
    this._wireObject.matrixAutoUpdate = this._mesh.matrixAutoUpdate;
    this._installMeshHooks(this._wireObject);
    this._interface.config.usdRoot.add(this._wireObject);
    this._applyVisibilityState();
  }

  setHydraReprStyle(style) {
    this._reprStyle = String(style || 'surface');
    const wantsPoints = this._reprStyle === 'points';
    const isPoints = this._mesh?.isPoints;
    if (wantsPoints !== Boolean(isPoints)) {
      this._disposeInstancedMesh();
      this._replaceRenderableObject(this._makeRenderableObject());
    } else {
      this._applyHydraReprMaterialState();
    }
  }

  updateOrder(attribute, attributeName, dimension = 3) {
    if (debugMeshes) console.log("updateOrder", attribute, attributeName, dimension);
    if (attribute && this._indices) {
      const values = new Float32Array(this._indices.length * dimension);
      for (let i = 0; i < this._indices.length; i++) {
        const index = this._indices[i];
        if ((dimension * index + dimension) > attribute.length) {
          this._geometry.deleteAttribute(attributeName);
          if (attributeName === 'normal') {
            this._markMaterialsNeedUpdate();
          }
          return;
        }
        const sourceOffset = dimension * index;
        const targetOffset = dimension * i;
        for (let j = 0; j < dimension; ++j) {
          const value = attribute[sourceOffset + j];
          if (!Number.isFinite(value)) {
            this._geometry.deleteAttribute(attributeName);
            if (attributeName === 'normal') {
              this._markMaterialsNeedUpdate();
            }
            return;
          }
          values[targetOffset + j] = value;
        }
      }
      this._geometry.setAttribute(attributeName, new Float32BufferAttribute(values, dimension));
      if (attributeName === 'normal') {
        this._markMaterialsNeedUpdate();
      }
      if (attributeName === 'position') {
        this._geometry.computeBoundingBox();
        this._geometry.computeBoundingSphere();
      }
    }
  }

  updateTypedOrder(attribute, attributeName, dimension = 3) {
    if (debugMeshes) console.log("updateTypedOrder", attribute, attributeName, dimension);
    if (!attribute || !this._indices) return;
    const ArrayType = attribute.constructor || Float32Array;
    const values = new ArrayType(this._indices.length * dimension);
    for (let i = 0; i < this._indices.length; i++) {
      const index = this._indices[i];
      if ((dimension * index + dimension) > attribute.length) {
        this._geometry.deleteAttribute(attributeName);
        return;
      }
      const sourceOffset = dimension * index;
      const targetOffset = dimension * i;
      for (let j = 0; j < dimension; ++j) {
        values[targetOffset + j] = attribute[sourceOffset + j];
      }
    }
    this._geometry.setAttribute(attributeName, new BufferAttribute(values, dimension));
  }

  updateIndices(indices) {
    return timeHydraUpdate(`Hydra updateIndices ${this.usdPath}`, () => {
      if (debugMeshes) console.log("updateIndices", indices);
      this._indices = copyIndexArray(indices);
      if (!this._indices) {
        this._geometry.deleteAttribute('position');
        this._geometry.deleteAttribute('normal');
        this._markMaterialsNeedUpdate();
        this._geometry.deleteAttribute('color');
        this._geometry.deleteAttribute('uv');
        this._geometry.deleteAttribute('tangent');
        delete this._geometry.attributes.uv2;
        return;
      }
      //this._geometry.setIndex( indicesArray );
      this.updateOrder(this._points, 'position');
      this._applyNormalStateForGeometry();
      if (this._colors) {
        this.updateOrder(this._colors, 'color');
      }
      if (this._uvs) {
        this.updateOrder(this._uvs, 'uv', 2);
        this._geometry.attributes.uv2 = this._geometry.attributes.uv;
      }
      if (this._tangents && (this._tangentInterpolation === 'vertex' || this._tangentInterpolation === 'varying')) {
        this.updateOrder(this._tangents, 'tangent', this._tangentDimension);
      } else {
        this._geometry.deleteAttribute('tangent');
      }
      this._refreshWireObject();
      this._applyVisibilityState();
    });
  }

  /**
   * Sets the transform of the mesh.
   * @param {Iterable<number>} matrix - The 4x4 matrix to set on the mesh.
   */
  setTransform(matrix) {
    this._mesh.matrix.set(...matrix);
    this._mesh.matrix.transpose();
    this._mesh.matrixAutoUpdate = false;
    if (this._wireObject) {
      this._wireObject.matrix.copy(this._mesh.matrix);
      this._wireObject.matrixAutoUpdate = this._mesh.matrixAutoUpdate;
    }
  }

  setInstanceTransforms(matrices, count = 0) {
    if (!this._mesh) return;
    const instanceCount = Number(count) || 0;
    if (instanceCount <= 0) {
      this._disposeInstancedMesh();
      this._applyVisibilityState();
      return;
    }

    if (!this._instancedMesh || this._instancedMesh.count !== instanceCount) {
      this._disposeInstancedMesh();
      this._instancedMesh = new InstancedMesh(this._geometry, this._mesh.material, instanceCount);
      this._installMeshHooks(this._instancedMesh);
      this._instancedMesh.name = `${this._mesh.name}_instances`;
      this._instancedMesh.castShadow = this._mesh.castShadow;
      this._instancedMesh.receiveShadow = this._mesh.receiveShadow;
      this._instancedMesh.matrixAutoUpdate = false;
      this._instancedMesh.userData.usdPath = this._id;
      this._instancedMesh.userData.usdInstanced = true;
      this._interface.config.usdRoot.add(this._instancedMesh);
    }

    this._instancedMesh.material = this._mesh.material;
    this._mesh.visible = false;
    this._applyVisibilityState();

    for (let i = 0; i < instanceCount; i++) {
      const offset = i * 16;
      this._instanceMatrix.set(...Array.from(matrices.slice(offset, offset + 16)));
      this._instanceMatrix.transpose();
      this._instancedMesh.setMatrixAt(i, this._instanceMatrix);
    }
    this._instancedMesh.instanceMatrix.needsUpdate = true;
    this._instancedMesh.computeBoundingBox?.();
    this._instancedMesh.computeBoundingSphere?.();
  }

  _disposeInstancedMesh() {
    if (!this._instancedMesh) return;
    if (this._instancedMesh.parent) {
      this._instancedMesh.parent.remove(this._instancedMesh);
    }
    this._instancedMesh.dispose?.();
    this._instancedMesh = null;
  }

  _installMeshHooks(mesh) {
    mesh.userData.usdPath = this._id;
    mesh.userData.usdHydraMaterialSide = this._side;
    mesh.userData.usdHydraApplyMaterialSide = (material, hydraMaterial) => this._applyMaterialSide(material, hydraMaterial);
    mesh.userData.usdHydraSetMaterialPending = (materialId, pending) => this._setMaterialPending(materialId, pending);
  }

  _setMaterialPending(materialId, pending) {
    if (!materialId) return;
    if (pending) {
      this._pendingMaterialIds.add(materialId);
    } else {
      this._pendingMaterialIds.delete(materialId);
    }
    this._applyVisibilityState();
  }

  _disposeMaterialSideClones() {
    for (const material of this._materialSideClones.values()) {
      material.dispose?.();
    }
    this._materialSideClones.clear();
  }

  _hasRenderableGeometry() {
    const position = this._geometry?.getAttribute?.('position') || this._geometry?.attributes?.position;
    const positionCount = position?.count || 0;
    if (positionCount <= 0) return false;

    for (const attribute of Object.values(this._geometry?.attributes || {})) {
      if (attribute && attribute.count < positionCount) {
        return false;
      }
    }

    for (const group of this._geometry?.groups || []) {
      if ((group.start + group.count) > positionCount) {
        return false;
      }
    }

    return true;
  }

  _applyVisibilityState() {
    const visible = this._visible && this._renderTag !== 'hidden' && this._pendingMaterialIds.size === 0 && this._hasRenderableGeometry();
    if (this._mesh) {
      this._mesh.visible = !this._instancedMesh && visible;
      this._mesh.userData.usdRenderTag = this._renderTag;
    }
    if (this._instancedMesh) {
      this._instancedMesh.visible = visible;
      this._instancedMesh.userData.usdRenderTag = this._renderTag;
    }
    if (this._wireObject) {
      this._wireObject.visible = visible && !this._instancedMesh;
      this._wireObject.userData.usdRenderTag = this._renderTag;
    }
  }

  _updateMeshSideState() {
    if (this._mesh) {
      this._mesh.userData.usdHydraMaterialSide = this._side;
    }
    if (this._instancedMesh) {
      this._instancedMesh.userData.usdHydraMaterialSide = this._side;
    }
  }

  _applyMaterialSide(material, hydraMaterial = null) {
    if (!material) return material;
    if (Array.isArray(material)) {
      return material.map(entry => this._applyMaterialSide(entry, hydraMaterial));
    }
    if (material === this._ownedMaterial || material.userData?.usdHydraMeshOwner === this._id) {
      material.side = this._side;
      material.needsUpdate = true;
      return material;
    }

    if (!hydraMaterial?.requiresMaterialSideVariants?.()) {
      material.side = this._side;
      material.needsUpdate = true;
      return material;
    }

    let clone = this._materialSideClones.get(material);
    if (!clone) {
      clone = material.clone();
      clone.userData.usdHydraSideCloneOf = material.uuid;
      this._materialSideClones.set(material, clone);
    } else {
      clone.copy(material);
      clone.userData.usdHydraSideCloneOf = material.uuid;
    }
    clone.side = this._side;
    clone.needsUpdate = true;
    return clone;
  }

  _applyCullSideToMeshes() {
    this._updateMeshSideState();
    let refreshedMaterialAssignments = false;
    if (this._mesh) {
      refreshedMaterialAssignments = this._interface.refreshMeshMaterialAssignments(this._mesh);
      if (!refreshedMaterialAssignments) {
        this._mesh.material = this._applyMaterialSide(this._mesh.material);
      }
    }
    if (this._instancedMesh) {
      this._instancedMesh.material = this._mesh?.material;
    }
  }

  _markMaterialsNeedUpdate() {
    const mark = material => {
      if (!material) return;
      if (Array.isArray(material)) {
        for (const entry of material) mark(entry);
        return;
      }
      material.needsUpdate = true;
    };
    mark(this._mesh?.material);
    mark(this._instancedMesh?.material);
  }

  setCullStyle(doubleSided, cullStyle) {
    this._side = cullStyleToThreeSide(Boolean(doubleSided), String(cullStyle || "dontCare"));
    this._applyCullSideToMeshes();
  }

  setVisibilityState(visible, renderTag = 'geometry') {
    this._visible = Boolean(visible);
    this._renderTag = String(renderTag || 'geometry');
    this._applyVisibilityState();
  }

  /**
   * Sets automatically generated normals on the mesh. Should only be used if there are no authored normals.
   * @param {} normals 
   */
  updateNormals(normals) {
    return timeHydraUpdate(`Hydra updateNormals ${this.usdPath}`, () => {
      this._hasAuthoredNormals = false;
      this._orderedNormals = undefined;
      this._constantNormal = undefined;
      this._indexedNormals = Float32Array.from(normals);
      this.updateOrder(this._indexedNormals, 'normal');
    });
  }

  updateOrderedNormals(normals) {
    return timeHydraUpdate(`Hydra updateOrderedNormals ${this.usdPath}`, () => {
      this._hasAuthoredNormals = false;
      this._indexedNormals = undefined;
      this._constantNormal = undefined;
      this._orderedNormals = Float32Array.from(normals);
      this._geometry.setAttribute('normal', new Float32BufferAttribute(this._orderedNormals, 3));
      this._markMaterialsNeedUpdate();
    });
  }

  _applyNormalStateForGeometry() {
    if (this._indexedNormals) {
      this.updateOrder(this._indexedNormals, 'normal');
      return;
    }

    if (this._constantNormal) {
      this._applyConstantNormal();
      return;
    }

    if (this._orderedNormals) {
      const position = this._geometry.getAttribute('position');
      if (position?.count && this._orderedNormals.length === position.count * 3) {
        this._geometry.setAttribute('normal', new Float32BufferAttribute(this._orderedNormals, 3));
        this._markMaterialsNeedUpdate();
      } else {
        this._geometry.deleteAttribute('normal');
        this._markMaterialsNeedUpdate();
      }
    }
  }

  _applyConstantNormal() {
    if (!this._constantNormal) return;
    const position = this._geometry.getAttribute('position');
    if (!position?.count) return;

    const values = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      values[i * 3 + 0] = this._constantNormal[0];
      values[i * 3 + 1] = this._constantNormal[1];
      values[i * 3 + 2] = this._constantNormal[2];
    }
    this._geometry.setAttribute('normal', new Float32BufferAttribute(values, 3));
    this._markMaterialsNeedUpdate();
  }

  setNormals(data, interpolation) {
    this._hasAuthoredNormals = true;
    this._constantNormal = undefined;

    if (interpolation === 'facevarying') {
      // The UV buffer has already been prepared on the C++ side, so we just set it
      this._indexedNormals = undefined;
      this._orderedNormals = Float32Array.from(data);
      this._geometry.setAttribute('normal', new Float32BufferAttribute(this._orderedNormals, 3));
      this._markMaterialsNeedUpdate();
    } else if (interpolation === 'vertex' || interpolation === 'varying') {
      // Per-point data is sorted into the expanded triangle order.
      this._orderedNormals = undefined;
      this._indexedNormals = Float32Array.from(data);
      this.updateOrder(this._indexedNormals, 'normal');
    } else if (interpolation === 'constant' || interpolation === 'uniform') {
      this._indexedNormals = undefined;
      this._orderedNormals = undefined;
      const values = Float32Array.from(data || []);
      if (values.length >= 3) {
        this._constantNormal = values.slice(0, 3);
        this._applyConstantNormal();
      }
    }
  }

  setTangents(data, dimension, interpolation) {
    this._tangentDimension = Math.max(1, Number(dimension) || 4);
    this._tangentInterpolation = interpolation;
    if (interpolation === 'facevarying') {
      this._tangents = undefined;
      this._geometry.setAttribute('tangent', new Float32BufferAttribute(data, this._tangentDimension));
    } else if (interpolation === 'vertex' || interpolation === 'varying') {
      this._tangents = Float32Array.from(data);
      this.updateOrder(this._tangents, 'tangent', this._tangentDimension);
    }
  }

  // This is always called before prims are updated
  setMaterial(materialId) {
    if (debugMaterials) console.log('Setting material on hydra prim: ' + materialId, this._mesh, materialId, this._interface.materials[materialId]);
    if (this._reprStyle === 'points') {
      return;
    }
    const hydraMaterial = this._interface.materials[materialId];
    this._interface.unassignMeshFromMaterials(this._mesh);
    if (hydraMaterial) {
      hydraMaterial.assignToMesh(this._mesh);
      this._applyHydraReprMaterialState();
    }
    else {
      this._interface.rememberPendingMaterialAssignment(materialId, this._mesh);
      if (debugMaterials) console.debug("Material assignment is pending until material sprim arrives", materialId);
    }
  }

  setGeomSubsetMaterial(sections) {
    //console.log("setting subset material: ", this._id, sections)
    this._geometry.clearGroups();
    this._interface.unassignMeshFromMaterials(this._mesh);
    this._materials = [this._ownedMaterial || defaultMaterial];
    if (this._reprStyle === 'points' || !sections?.length) {
      if (this._mesh && !this._mesh.isPoints) {
        this._mesh.material = this._applyMaterialSide(this._materials[0]);
        this._applyHydraReprMaterialState();
      }
      return;
    }

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const hydraMaterial = this._interface.materials[section.materialId];
      if (hydraMaterial) {
        this._materials.push(hydraMaterial._material);
        this._geometry.addGroup(section.start, section.length, i + 1);
      }
    }

    if (this._mesh.parent) {
      this._mesh.parent.remove(this._mesh);
    }
    this._mesh = new Mesh(this._geometry, this._materials);
    this._installMeshHooks(this._mesh);
    this.setVisibilityState(this._visible, this._renderTag);
    this._applyCullSideToMeshes();
    this._applyHydraReprMaterialState();
    this._interface.config.usdRoot.add(this._mesh);

    for (let i = 0; i < sections.length; i++) {
      const hydraMaterial = this._interface.materials[sections[i].materialId];
      hydraMaterial?.assignToMesh(this._mesh, i + 1);
    }
  }

  setDisplayColor(data, interpolation) {
    if (disableMaterials) return;

    let wasDefaultMaterial = false;
    if (this._mesh.material === defaultMaterial) {
      this._mesh.material = this._mesh.material.clone();
      this._mesh.material.userData.usdHydraMeshOwner = this._id;
      wasDefaultMaterial = true;
    }
    this._mesh.material = this._applyMaterialSide(this._mesh.material);

    this._colors = null;

    if (interpolation === 'constant') {
      this._mesh.material.color = new Color().fromArray(data);
    } else if (interpolation === 'vertex' || interpolation === 'varying') {
      // Per-vertex buffer attribute
      this._mesh.material.vertexColors = true;
      if (wasDefaultMaterial) {
        // Reset the pink debugging color
        this._mesh.material.color = new Color(0xffffff);
      }
      this._colors = Float32Array.from(data);
      this.updateOrder(this._colors, 'color');
    } else {
      if (warningMessagesToCount.has(interpolation)) {
        warningMessagesToCount.set(interpolation, warningMessagesToCount.get(interpolation) + 1);
      }
      else {
        warningMessagesToCount.set(interpolation, 1);
        console.warn(`Unsupported displayColor interpolation type '${interpolation}'.`);
      }
    }
  }

  setUV(data, dimension, interpolation) {
    // TODO: Support multiple UVs. For now, we simply set uv = uv2, which is required when a material has an aoMap.
    this._uvs = null;

    if (interpolation === 'facevarying') {
      // The UV buffer has already been prepared on the C++ side, so we just set it
      this._geometry.setAttribute('uv', new Float32BufferAttribute(data, dimension));
    } else if (interpolation === 'vertex' || interpolation === 'varying') {
      // Per-point data is sorted into the expanded triangle order.
      this._uvs = Float32Array.from(data);
      this.updateOrder(this._uvs, 'uv', 2);
    }

    if (this._geometry.hasAttribute('uv'))
      this._geometry.attributes.uv2 = this._geometry.attributes.uv;
  }

  setGenericPrimvar(name, data, dimension, interpolation) {
    const attributeName = `primvars:${name}`;
    const itemSize = Math.max(1, Number(dimension) || 1);
    const values = ArrayBuffer.isView(data) ? data.slice() : Float32Array.from(data || []);

    if (interpolation === 'constant') {
      this._mesh.userData.usdPrimvars ??= {};
      this._mesh.userData.usdPrimvars[name] = Array.from(values);
      this._geometry.deleteAttribute(attributeName);
    } else if (interpolation === 'facevarying') {
      this._geometry.setAttribute(attributeName, new BufferAttribute(values, itemSize));
    } else if (interpolation === 'vertex' || interpolation === 'varying') {
      this.updateTypedOrder(values, attributeName, itemSize);
    }
  }

  updatePrimvar(name, data, dimension, interpolation) {
    return timeHydraUpdate(`Hydra updatePrimvar ${name} ${this.usdPath}`, () => {
      if (!name) return;

      if (name === 'points') { // || name === 'normals') {
        // Points and normals are set separately
        return;
      }

      // console.log('Setting PrimVar: ' + name + ", interpolation: " + interpolation);

      // TODO: Support multiple UVs. For now, we simply set uv = uv2, which is required when a material has an aoMap.
      if (name.startsWith('st')) {
        name = 'uv';
      }

      switch (name) {
        case 'displayColor':
          this.setDisplayColor(data, interpolation);
          break;
        case 'uv':
        case "UVMap":
        case "uvmap":
        case "uv0":
        case "UVW":
        case "uvw":
        case "map1":
          this.setUV(data, dimension, interpolation);
          break;
        case "normals":
          this.setNormals(data, interpolation);
          break;
        case "tangent":
        case "tangents":
          this.setTangents(data, dimension, interpolation);
          break;
        case "rest":
          this.setGenericPrimvar(name, data, dimension, interpolation);
          break;
        default:
          this.setGenericPrimvar(name, data, dimension, interpolation);
      }
    });
  }

  updatePoints(points) {
    return timeHydraUpdate(`Hydra updatePoints ${this.usdPath}`, () => {
      this._points = Float32Array.from(points);
      this.updateOrder(this._points, 'position');
      this._applyNormalStateForGeometry();
      if (this._tangents && (this._tangentInterpolation === 'vertex' || this._tangentInterpolation === 'varying')) {
        this.updateOrder(this._tangents, 'tangent', this._tangentDimension);
      } else {
        const position = this._geometry.getAttribute('position');
        const tangent = this._geometry.getAttribute('tangent');
        if (position?.count && tangent?.count !== position.count) {
          this._geometry.deleteAttribute('tangent');
        }
      }
      this._applyVisibilityState();
    });
  }

  commit() {
    if (this._instancedMesh && this._mesh) {
      this._instancedMesh.material = this._mesh.material;
    }
    this._applyVisibilityState();
  }

}

let warningMessagesToCount = new Map();

/** @type {MeshPhysicalMaterial} */
let defaultMaterial;

class HydraMaterial {
  // Maps USD preview material texture names to Three.js MeshPhysicalMaterial names
  static usdPreviewToMeshPhysicalTextureMap = {
    'diffuseColor': 'map',
    'clearcoat': 'clearcoatMap',
    'clearcoatRoughness': 'clearcoatRoughnessMap',
    'emissiveColor': 'emissiveMap',
    'occlusion': 'aoMap',
    'roughness': 'roughnessMap',
    'metallic': 'metalnessMap',
    'normal': 'normalMap',
    'opacity': 'alphaMap'
  };

  static usdPreviewToColorSpaceMap = {
    'diffuseColor': SRGBColorSpace,
    'emissiveColor': SRGBColorSpace,
    'opacity': SRGBColorSpace,
  };

  static channelMap = {
    // Three.js expects many 8bit values such as roughness or metallness in a specific RGB texture channel.
    // We could write code to combine multiple 8bit texture files into different channels of one RGB texture where it
    // makes sense, but that would complicate this loader a lot. Most Three.js loaders don't seem to do it either.
    // Instead, we simply provide the 8bit image as an RGBA texture, even though this might be less efficient.
    'r': RGBAFormat,
    'g': RGBAFormat,
    'b': RGBAFormat,
    'rgb': RGBAFormat,
    'rgba': RGBAFormat
  };

  // Maps USD preview material property names to Three.js MeshPhysicalMaterial names
  static usdPreviewToMeshPhysicalMap = {
    'clearcoat': 'clearcoat',
    'clearcoatRoughness': 'clearcoatRoughness',
    'diffuseColor': 'color',
    'emissiveColor': 'emissive',
    'ior': 'ior',
    'metallic': 'metalness',
    'opacity': 'opacity',
    'roughness': 'roughness',
    'opacityThreshold': 'alphaTest',
  };

  constructor(id, hydraInterface) {
    this._id = id;
    this._nodes = {};
    this._resolvedAssetPaths = new Map();
    this._materialXDocuments = [];
    this._interface = hydraInterface;
    if (!defaultMaterial) {
      defaultMaterial = new MeshPhysicalMaterial({
        side: DoubleSide,
        color: new Color(0xff2997), // a bright pink color to indicate a missing material
        // envMap: window.envMap,
        name: 'DefaultMaterial',
      });
    }
    // proper color when materials are disabled
    if (disableMaterials)
      defaultMaterial.color = new Color(0x999999);

    /** @type {MeshPhysicalMaterial} */
    this._material = defaultMaterial;
    this._assignments = [];
    this._ready = id === "";
    this._hasResolvedMaterial = id === "";
    this._interface.diagnostics.materialSPrims++;

    if (debugMaterials) console.log("Hydra Material", this)
  }

  assignToMesh(mesh, materialIndex = null) {
    this._interface.diagnostics.materialAssignments++;
    const existing = this._assignments.find(assignment => assignment.mesh === mesh && assignment.materialIndex === materialIndex);
    if (!existing) {
      this._assignments.push({ mesh, materialIndex });
    }
    if (!this._ready && !this._hasResolvedMaterial) {
      this._setMeshMaterialPending(mesh, true);
      return;
    }
    this._applyMaterialToAssignedMeshes();
  }

  unassignMesh(mesh) {
    const previousLength = this._assignments.length;
    this._assignments = this._assignments.filter(assignment => assignment.mesh !== mesh);
    if (this._assignments.length !== previousLength) {
      this._setMeshMaterialPending(mesh, false);
      this._applyMaterialToAssignedMeshes();
    }
  }

  dispose() {
    for (const assignment of this._assignments) {
      this._setMeshMaterialPending(assignment.mesh, false);
    }
    this._assignments = [];
    disposeMaterialResources(this._material);
    this._material = null;
  }

  _setMeshMaterialPending(mesh, pending) {
    mesh?.userData?.usdHydraSetMaterialPending?.(this._id, pending);
  }

  _applyMaterialToMesh(mesh, materialIndex) {
    const applyMaterialSide = mesh.userData?.usdHydraApplyMaterialSide;
    const material = prepareMaterialXMaterialForGeometry(typeof applyMaterialSide === 'function'
      ? applyMaterialSide(this._material, this)
      : this._material);

    if (materialIndex === null || materialIndex === undefined) {
      mesh.material = material;
      this._setMeshMaterialPending(mesh, false);
      return;
    }

    if (Array.isArray(mesh.material)) {
      mesh.material[materialIndex] = material;
      this._setMeshMaterialPending(mesh, false);
      return;
    }

    mesh.material = material;
    this._setMeshMaterialPending(mesh, false);
  }

  _applyMaterialToAssignedMeshes() {
    if (!this._ready && !this._hasResolvedMaterial) {
      for (const assignment of this._assignments) {
        this._setMeshMaterialPending(assignment.mesh, true);
      }
      return;
    }
    for (const assignment of this._assignments) {
      this._applyMaterialToMesh(assignment.mesh, assignment.materialIndex);
    }
  }

  hasMeshAssignment(mesh) {
    return this._assignments.some(assignment => assignment.mesh === mesh);
  }

  requiresMaterialSideVariants() {
    const sides = new Set();
    for (const assignment of this._assignments) {
      const side = assignment.mesh?.userData?.usdHydraMaterialSide;
      if (typeof side === 'number') {
        sides.add(side);
      }
      if (sides.size > 1) {
        return true;
      }
    }
    return false;
  }

  refreshAssignments() {
    this._applyMaterialToAssignedMeshes();
  }

  beginMaterialSync() {
    this._ready = false;
    this._nodes = {};
    this._resolvedAssetPaths.clear();
    this._materialXDocuments = [];
    if (!this._hasResolvedMaterial) {
      this._applyMaterialToAssignedMeshes();
    }
  }

  static canonicalAssetPath(path) {
    return String(path ?? "")
      .replace(/\\/g, "/")
      .replace(/^\/+(?=\.?\/)/, "")
      .replace(/^(?:\.\/)+/, "")
      .replace(/\/\.\//g, "/");
  }

  static missingMaterialXNodeDefs(xml) {
    if (typeof DOMParser === "undefined") return [];
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() === "parsererror") return [];

    const declared = new Set([...root.querySelectorAll("nodedef[name]")]
      .map(node => node.getAttribute("name"))
      .filter(Boolean));
    const referenced = new Set([...root.querySelectorAll("[nodedef]")]
      .map(node => node.getAttribute("nodedef"))
      .filter(Boolean));
    return [...referenced].filter(name => !declared.has(name));
  }

  async _withAuthoredMaterialXDefinitions(xml) {
    const missingNodeDefs = HydraMaterial.missingMaterialXNodeDefs(xml);
    if (!missingNodeDefs.length) return xml;

    const definitions = await this._interface.registry.materialXDefinitionsFor(missingNodeDefs);
    if (!definitions) return xml;

    return xml.replace(/(<materialx\b[^>]*>)/, `$1\n${definitions}`);
  }

  _rememberResolvedAssetPath(authoredPath, resolvedPath) {
    if (!authoredPath || !resolvedPath) {
      return;
    }

    const authored = String(authoredPath);
    const canonical = HydraMaterial.canonicalAssetPath(authored);
    for (const key of [
      authored,
      canonical,
      canonical.replace(/^\/+/, ""),
      canonical.replace(/^\/?(?:\.\.\/)+/, ""),
      `./${canonical}`,
      `/./${canonical}`,
    ]) {
      this._resolvedAssetPaths.set(key, String(resolvedPath));
    }
  }

  _resolveMaterialTexturePath(authoredPath) {
    if (!authoredPath) {
      return "";
    }

    const authored = String(authoredPath);
    const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(authored);
    const isPackageInternalUrl = /\.[a-z0-9]+(?:\?[^[]*)?\[[^\]]+\]/i.test(authored);

    const candidates = this._interface.registry.materialResourcePathCandidates(authored);
    for (const candidate of candidates) {
      const resolved = this._resolvedAssetPaths.get(candidate)
        || this._resolvedAssetPaths.get(HydraMaterial.canonicalAssetPath(candidate));
      if (resolved) return resolved;
    }

    for (const candidate of candidates) {
      const resolved = this._interface.registry.resolveResourcePath(candidate);
      if (resolved) return resolved;
    }

    if (isAbsoluteUrl && !isPackageInternalUrl) {
      return authored;
    }

    return "";
  }

  updateNode(networkId, path, parameters) {
    if (debugTextures) console.log('Updating Material Node: ' + networkId + ' ' + path, parameters);
    this._interface.diagnostics.materialNodes++;
    this._nodes[path] = parameters;
    this._rememberResolvedAssetPath(parameters?.file, parameters?.resolvedPath);
    // TODO: Replace the bridge's string-suffixed asset metadata keys with a
    // structured asset-parameter payload in a future C++/JS bridge revision.
    for (const key of Object.keys(parameters || {})) {
      if (!key.endsWith(':resolvedPath')) {
        continue;
      }
      const parameterName = key.slice(0, -':resolvedPath'.length);
      this._rememberResolvedAssetPath(parameters?.[parameterName], parameters?.[key]);
    }
  }

  updateMaterialXDocument(document) {
    if (debugMaterials) console.log('Updating MaterialX document: ' + this._id, document);
    this._interface.diagnostics.materialXDocuments++;
    const existingIndex = this._materialXDocuments.findIndex(existing => existing.terminal === document?.terminal);
    if (existingIndex >= 0) {
      this._materialXDocuments[existingIndex] = document;
    }
    else {
      this._materialXDocuments.push(document);
    }
  }

  convertWrap(usdWrapMode) {
    if (usdWrapMode === undefined)
      return RepeatWrapping;

    const WRAPPINGS = {
      'repeat': 1000, // RepeatWrapping
      'clamp': 1001, // ClampToEdgeWrapping
      'mirror': 1002 // MirroredRepeatWrapping
    };

    if (WRAPPINGS[usdWrapMode])
      return WRAPPINGS[usdWrapMode];

    return RepeatWrapping;
  }

  /**
   * @return {Promise<void>}
   */
  assignTexture(mainMaterial, parameterName) {
    return new Promise((resolve, reject) => {
      const materialParameterMapName = HydraMaterial.usdPreviewToMeshPhysicalTextureMap[parameterName];
      if (materialParameterMapName === undefined) {
        console.warn(`Unsupported material texture parameter '${parameterName}'.`);
        resolve();
        return;
      }
      if (mainMaterial[parameterName] && mainMaterial[parameterName].nodeIn) {
        const nodeIn = mainMaterial[parameterName].nodeIn;
        const textureFileName = this._resolveMaterialTexturePath(nodeIn.resolvedPath || nodeIn.resolvedUrl || nodeIn.file);
        if (!textureFileName) {
          if (debugTextures) console.debug("Texture node has no file; skipping optional texture input.", nodeIn);
          this._material[materialParameterMapName] = undefined;
          resolve();
          return;
        }
        if (debugTextures)
          console.log("Assigning texture with resolved path", parameterName, { file: nodeIn.file, resolvedPath: nodeIn.resolvedPath });
        const channel = mainMaterial[parameterName].inputName;

        // For debugging
        const matName = Object.keys(this._nodes).find(key => this._nodes[key] === mainMaterial);
        if (debugTextures) console.log(`Setting texture '${materialParameterMapName}' (${textureFileName}) of material '${matName}'... with channel '${channel}'`);

        setTimeout(() => {
          this._interface.registry.getTexture(textureFileName).then(texture => {
            if (!this._material) {
              console.error("Material not set when trying to assign texture, this is likely a bug");
              resolve();
              return;
            }
            // console.log("getTexture", texture, nodeIn);
            if (materialParameterMapName === 'alphaMap') {
              // If this is an opacity map, check if it's using the alpha channel of the diffuse map.
              // If so, simply change the format of that diffuse map to RGBA and make the material transparent.
              // If not, we need to copy the alpha channel into a new texture's green channel, because that's what Three.js
              // expects for alpha maps (not supported at the moment).
              // NOTE that this only works if diffuse maps are always set before opacity maps, so the order of
              // 'assingTexture' calls for a material matters.
              if (nodeIn.file === mainMaterial.diffuseColor?.nodeIn?.file && channel === 'a') {
                this._material.map.format = RGBAFormat;
              } else {
                // TODO: Extract the alpha channel into a new RGB texture.
                console.warn("Separate alpha channel is currently not supported.", nodeIn.file, mainMaterial.diffuseColor?.nodeIn?.file, channel);
              }
              if (!this._material.alphaClip)
                this._material.transparent = true;

              this._material.needsUpdate = true;
              resolve();
              return;
            } else if (materialParameterMapName === 'metalnessMap') {
              this._material.metalness = 1.0;
            } else if (materialParameterMapName === 'roughnessMap') {
              this._material.roughness = 1.0;
            } else if (materialParameterMapName === 'emissiveMap') {
              this._material.emissive = new Color(0xffffff);
            } else if (!HydraMaterial.channelMap[channel]) {
              console.warn(`Unsupported texture channel '${channel}'!`);
              resolve();
              return;
            }
            // TODO need to apply bias/scale to the texture in some cases.
            // May be able to extract that for metalness/roughness/opacity/normalScale

            // Clone texture and set the correct format.
            const clonedTexture = texture.clone();
            let targetSwizzle = 'rgba';

            if (materialParameterMapName == 'roughnessMap' && channel != 'g') {
              targetSwizzle = '0' + channel + '11';
            }
            if (materialParameterMapName == 'metalnessMap' && channel != 'b') {
              targetSwizzle = '01' + channel + '1';
            }
            if (materialParameterMapName == 'aoMap' && channel != 'r') {
              targetSwizzle = channel + '111';
            }
            if (materialParameterMapName == 'opacityMap' && channel != 'a') {
              targetSwizzle = channel + channel + channel + channel;
            }

            clonedTexture.colorSpace = HydraMaterial.usdPreviewToColorSpaceMap[parameterName] || LinearSRGBColorSpace;

            // console.log("Cloned texture", clonedTexture, "swizzled with", targetSwizzle);
            // clonedTexture.image = HydraMaterial._swizzleImageChannels(clonedTexture.image, targetSwizzle);
            // if (materialParameterToTargetChannel[materialParameterMapName] && channel != materialParameterToTargetChannel[materialParameterMapName])
            if (targetSwizzle != 'rgba') {
              clonedTexture.image = HydraMaterial._swizzleImageChannels(clonedTexture.image, targetSwizzle);
            }
            // clonedTexture.image = HydraMaterial._swizzleImageChannels(clonedTexture.image, channel, 'g')

            clonedTexture.format = HydraMaterial.channelMap[channel];
            clonedTexture.needsUpdate = true;
            if (nodeIn.st && nodeIn.st.nodeIn) {
              const uvData = nodeIn.st.nodeIn;
              // console.log("Tiling data", uvData);

              // TODO this is messed up but works for scale and translation, not really for rotation.
              // Refer to https://github.com/mrdoob/three.js/blob/e5426b0514a1347d7aafca69aa34117503c1be88/examples/jsm/exporters/USDZExporter.js#L461
              // (which is also not perfect but close)

              const rotation = uvData.rotation ? (uvData.rotation / 180 * Math.PI) : 0;
              const offset = uvData.translation ? new Vector2(uvData.translation[0], uvData.translation[1]) : new Vector2(0, 0);
              const repeat = uvData.scale ? new Vector2(uvData.scale[0], uvData.scale[1]) : new Vector2(1, 1);

              const xRotationOffset = Math.sin(rotation);
              const yRotationOffset = Math.cos(rotation);
              offset.y = offset.y - (1 - yRotationOffset) * repeat.y;
              offset.x = offset.x - xRotationOffset * repeat.x;
              // offset.y = 1 - offset.y - repeat.y;
              /*
              if (uvData.scale)
                clonedTexture.repeat.set(uvData.scale[0], uvData.scale[1]);
              if (uvData.translation)
                clonedTexture.offset.set(uvData.translation[0], uvData.translation[1]);
              if (uvData.rotation)
              clonedTexture.rotation = uvData.rotation / 180 * Math.PI;
              */

              clonedTexture.repeat.set(repeat.x, repeat.y);
              clonedTexture.offset.set(offset.x, offset.y);
              clonedTexture.rotation = rotation;
            }

            // TODO use nodeIn.wrapS and wrapT and map to THREE
            clonedTexture.wrapS = this.convertWrap(nodeIn.wrapS);
            clonedTexture.wrapT = this.convertWrap(nodeIn.wrapT);
            if (debugTextures) console.log("Setting texture " + materialParameterMapName + " to", clonedTexture)
            this._material[materialParameterMapName] = clonedTexture;
            this._material.needsUpdate = true;

            if (debugTextures) console.log("RESOLVED TEXTURE", clonedTexture.name, matName, parameterName);
            resolve();
            return;
          }).catch(err => {
            console.warn("Error when loading texture", err);
            resolve();
            return;
          });
        }, 0);
      } else {
        this._material[materialParameterMapName] = undefined;
        resolve();
        return;
      }
    });
  }

  // from https://github.com/mrdoob/three.js/blob/dev/src/math/ColorManagement.js
  static SRGBToLinear(c) {
    return (c < 0.04045) ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
  }

  static LinearToSRGB(c) {
    return (c < 0.0031308) ? c * 12.92 : 1.055 * (Math.pow(c, 0.41666)) - 0.055;
  }

  /**
   * Swizzle image channels (e.g. move red channel to green channel)
   * @param {*} image three.js image
   * @param {string} swizzle For example, "rgga". Must have max. 4 components. Can contain 0 and 1, e.g. "rgba1" is valid.
   * @returns three.js image
   */
  static _swizzleImageChannels(image, swizzle) {
    if ((typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) ||
      (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) ||
      (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)) {

      const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');

      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, image.width, image.height);

      const imageData = context.getImageData(0, 0, image.width, image.height);
      const data = imageData.data;

      // console.log(data);

      const swizzleToIndex = {
        'r': 0,
        'g': 1,
        'b': 2,
        'a': 3,
        'x': 0,
        'y': 1,
        'z': 2,
        'w': 3,
        '0': 4, // set to 0
        '1': 5, // set to 1
        '-': -1, // passthrough
      };
      const arrayAccessBySwizzle = [4, 4, 4, 4]; // empty value if nothing defined in the swizzle pattern
      for (let i = 0; i < swizzle.length; i++) {
        arrayAccessBySwizzle[i] = swizzleToIndex[swizzle[i]];
      }

      const dataEntry = data.slice(0);
      for (let i = 0; i < data.length; i += 4) {
        dataEntry[0] = data[i];
        dataEntry[1] = data[i + 1];
        dataEntry[2] = data[i + 2];
        dataEntry[3] = data[i + 3];
        dataEntry[4] = 0; // empty value
        dataEntry[5] = 1;

        const rAccess = arrayAccessBySwizzle[0];
        const gAccess = arrayAccessBySwizzle[1];
        const bAccess = arrayAccessBySwizzle[2];
        const aAccess = arrayAccessBySwizzle[3];

        if (rAccess !== -1)
          data[i] = dataEntry[rAccess];
        if (gAccess !== -1)
          data[i + 1] = dataEntry[gAccess];
        if (bAccess !== -1)
          data[i + 2] = dataEntry[bAccess];
        if (aAccess !== -1)
          data[i + 3] = dataEntry[aAccess];
      }

      context.putImageData(imageData, 0, 0);
      return canvas;

    } else if (image.data) {
      const data = image.data.slice(0);

      for (let i = 0; i < data.length; i++) {
        if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
          data[i] = Math.floor(this.SRGBToLinear(data[i] / 255) * 255);
        } else {
          // assuming float
          data[i] = this.SRGBToLinear(data[i]);
        }
      }

      return {
        data: data,
        width: image.width,
        height: image.height
      };
    } else {
      console.warn('ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied.');
      return image;
    }
  }

  static _imageChannelData(image, width, height, channel) {
    if (!image) return null;

    if ((typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement) ||
      (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) ||
      (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)) {

      const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, width, height);

      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData.data;
      const channelData = new Uint8ClampedArray(width * height);
      for (let i = 0, j = channel; i < channelData.length; i++, j += 4) {
        channelData[i] = data[j];
      }
      return channelData;
    }

    return null;
  }

  static _packMetallicRoughnessMap({ aoMap, roughnessMap, metalnessMap }) {
    const sourceTexture = roughnessMap || metalnessMap || aoMap;
    const sourceImage = sourceTexture?.image;
    const width = sourceImage?.width;
    const height = sourceImage?.height;
    if (!sourceTexture || !sourceImage || !width || !height) {
      return null;
    }

    const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const imageData = context.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }

    const ao = HydraMaterial._imageChannelData(aoMap?.image, width, height, 0);
    const roughness = HydraMaterial._imageChannelData(roughnessMap?.image, width, height, 1);
    const metalness = HydraMaterial._imageChannelData(metalnessMap?.image, width, height, 2);

    for (let i = 0, j = 0; i < width * height; i++, j += 4) {
      if (ao) data[j] = ao[i];
      if (roughness) data[j + 1] = roughness[i];
      if (metalness) data[j + 2] = metalness[i];
    }

    context.putImageData(imageData, 0, 0);

    const packedTexture = new CanvasTexture(canvas);
    packedTexture.format = RGBAFormat;
    packedTexture.colorSpace = LinearSRGBColorSpace;
    packedTexture.name = [
      "packed-orm",
      aoMap?.name || "ao:1",
      roughnessMap?.name || "roughness:1",
      metalnessMap?.name || "metalness:1",
    ].join("|");
    packedTexture.needsUpdate = true;
    return packedTexture;
  }

  _packMaterialTextureChannels({ haveOcclusionMap, haveRoughnessMap, haveMetalnessMap }) {
    if (!haveOcclusionMap && !haveRoughnessMap && !haveMetalnessMap) return;

    const aoMap = this._material.aoMap;
    const roughnessMap = this._material.roughnessMap;
    const metalnessMap = this._material.metalnessMap;
    const existingPackedMap = [aoMap, roughnessMap, metalnessMap]
      .find(texture => texture?.name?.startsWith?.("packed-orm"));
    if (existingPackedMap) {
      if (haveOcclusionMap) this._material.aoMap = existingPackedMap;
      this._material.roughnessMap = existingPackedMap;
      this._material.metalnessMap = existingPackedMap;
      return;
    }

    if ((haveOcclusionMap && !aoMap) || (haveRoughnessMap && !roughnessMap) || (haveMetalnessMap && !metalnessMap)) {
      console.error("Something went wrong with the texture promise; a material texture was authored but not loaded.", {
        haveOcclusionMap,
        haveRoughnessMap,
        haveMetalnessMap,
        aoMap: aoMap?.name || null,
        roughnessMap: roughnessMap?.name || null,
        metalnessMap: metalnessMap?.name || null,
      });
      return;
    }

    const packedMap = HydraMaterial._packMetallicRoughnessMap({ aoMap, roughnessMap, metalnessMap });
    if (!packedMap) {
      console.error("Something went wrong while packing occlusion/metallic/roughness textures.", {
        aoMap: aoMap?.name || null,
        roughnessMap: roughnessMap?.name || null,
        metalnessMap: metalnessMap?.name || null,
      });
      return;
    }

    if (haveOcclusionMap) this._material.aoMap = packedMap;
    this._material.roughnessMap = packedMap;
    this._material.metalnessMap = packedMap;

    for (const texture of new Set([aoMap, roughnessMap, metalnessMap])) {
      if (texture && texture !== packedMap) texture.dispose();
    }
  }

  assignProperty(mainMaterial, parameterName) {
    const materialParameterName = HydraMaterial.usdPreviewToMeshPhysicalMap[parameterName];
    if (materialParameterName === undefined) {
      console.warn(`Unsupported material parameter '${parameterName}'.`);
      return;
    }
    if (mainMaterial[parameterName] !== undefined && !mainMaterial[parameterName].nodeIn) {
      // console.log(`Assigning property ${parameterName}: ${mainMaterial[parameterName]}`);
      if (Array.isArray(mainMaterial[parameterName])) {
        this._material[materialParameterName] = new Color().fromArray(mainMaterial[parameterName]);
      } else {
        this._material[materialParameterName] = mainMaterial[parameterName];
        if (materialParameterName === 'opacity' && mainMaterial[parameterName] < 1.0) {
          this._material.transparent = true;
        }
        if (parameterName == 'opacityThreshold' && mainMaterial[parameterName] > 0.0) {
          this._material.transparent = false;
          this._material.alphaClip = true;
        }
      }
    }
  }

  updateFinished(type, relationships) {
    this._interface.diagnostics.materialUpdateFinished++;
    const promise = this._updateFinished(type, relationships);
    this._interface.trackMaterialUpdate(promise);
  }

  async _updateFinished(type, relationships) {
    for (let relationship of relationships) {
      relationship.nodeIn = this._nodes[relationship.inputId];
      relationship.nodeOut = this._nodes[relationship.outputId];
      if (!relationship.nodeIn || !relationship.nodeOut) {
        console.warn('Material relationship references an unknown node.', relationship);
        continue;
      }
      relationship.nodeIn[relationship.inputName] = relationship;
      relationship.nodeOut[relationship.outputName] = relationship;
    }
    if (debugMaterials) console.log('Finalizing Material: ' + this._id);
    if (debugMaterials) console.log("updateFinished", type, relationships)

    const materialXDocument = this._materialXDocuments.find(document => document.terminal === type);
    if (materialXDocument) {
      const materialXMaterial = await this.createMaterialXMaterial(materialXDocument);
      if (!materialXMaterial) {
        this._material = defaultMaterial;
        this._ready = true;
        this._hasResolvedMaterial = true;
        this._applyMaterialToAssignedMeshes();
        return;
      }
      this._material = materialXMaterial;
      this._ready = true;
      this._hasResolvedMaterial = true;
      this._applyMaterialToAssignedMeshes();
      return;
    }

    // find the main material node
    let mainMaterialNode = undefined;
    for (let node of Object.values(this._nodes)) {
      if (node.diffuseColor) {
        mainMaterialNode = node;
        break;
      }
    }

    if (!mainMaterialNode || disableMaterials) {
      this._material = defaultMaterial;
      this._ready = true;
      this._hasResolvedMaterial = true;
      this._applyMaterialToAssignedMeshes();
      return;
    }

    // TODO: Ideally, we don't recreate the material on every update.
    // Creating a new one requires to also update any meshes that reference it. So we're relying on the C++ side to
    // call this before also calling `setMaterial` on the affected meshes.
    this._material = new MeshPhysicalMaterial({});
    this._material.side = DoubleSide;
    // split _id
    let _name = this._id;
    let lastSlash = _name.lastIndexOf('/');
    if (lastSlash >= 0)
      _name = _name.substring(lastSlash + 1);
    this._material.name = _name;

    // Assign textures
    const haveRoughnessMap = !!(mainMaterialNode.roughness && mainMaterialNode.roughness.nodeIn);
    const haveMetalnessMap = !!(mainMaterialNode.metallic && mainMaterialNode.metallic.nodeIn);
    const haveOcclusionMap = !!(mainMaterialNode.occlusion && mainMaterialNode.occlusion.nodeIn);

    if (debugMaterials) {
      console.log('Creating Material: ' + this._id, mainMaterialNode, {
        haveRoughnessMap,
        haveMetalnessMap,
        haveOcclusionMap
      });
    }

    if (!disableTextures) {
      /** @type {Array<Promise<any>>} */
      const texturePromises = [];
      for (let key in HydraMaterial.usdPreviewToMeshPhysicalTextureMap) {
        texturePromises.push(this.assignTexture(mainMaterialNode, key));
      }
      await Promise.all(texturePromises);

      this._packMaterialTextureChannels({ haveOcclusionMap, haveRoughnessMap, haveMetalnessMap });
    }

    // Assign material properties
    for (let key in HydraMaterial.usdPreviewToMeshPhysicalMap) {
      this.assignProperty(mainMaterialNode, key);
    }

    if (debugMaterials) console.log("Material Node \"" + this._material.name + "\"", mainMaterialNode, "Resulting Material", this._material);
    this._ready = true;
    this._hasResolvedMaterial = true;
    this._applyMaterialToAssignedMeshes();
  }

  async createMaterialXMaterial(materialXDocument) {
    if (!materialXDocument || disableMaterials) {
      if (!materialXDocument) {
        this._interface.diagnostics.materialXSkippedNoDocuments++;
      }
      return null;
    }
    this._interface.diagnostics.materialXCreateAttempts++;

    let xml = materialXDocument?.xml;
    if (!xml) {
      return null;
    }

    try {
      const { MaterialX, MaterialXMaterial } = await getMaterialXModule();
      const materialName = this._id.split('/').pop() || this._id;
      const materialNodeNameOrIndex = materialXDocument.materialName || materialName || 0;
      xml = await this._withAuthoredMaterialXDefinitions(xml);
      const material = await MaterialX.createMaterialXMaterial(xml, materialNodeNameOrIndex, {
        cacheKey: `${this._id}:${materialXDocument.terminal}`,
        getTexture: async (url) => {
          const texturePath = this._resolveMaterialTexturePath(url);
          return texturePath ? this._interface.registry.getTexture(texturePath) : null;
        },
      }, {
        parameters: {
          side: DoubleSide,
        },
      }, {});

      if (typeof MaterialXMaterial === 'function' && !(material instanceof MaterialXMaterial)) {
        this._interface.diagnostics.materialXCreateFailures++;
        if (debugMaterials) console.debug('MaterialX shader generation returned a non-MaterialX material.', {
          materialId: this._id,
          materialName: material?.name,
          materialType: material?.constructor?.name,
        });
        return null;
      }

      material.name = materialName;
      material.side = DoubleSide;
      material.needsUpdate = true;
      this._interface.diagnostics.materialXCreateSuccess++;
      return material;
    }
    catch (error) {
      this._interface.diagnostics.materialXCreateFailures++;
      console.warn('Failed to create MaterialX material.', error);
      return null;
    }
  }
}

/*
class SdfPath {
  get name() { return this.GetName(); }
  get absoluteRootPath() { return this.AbsoluteRootPath(); }
  get reflexiveRelativePath() { return this.ReflexiveRelativePath(); }
}
*/

export class ThreeRenderDelegateInterface {

  /**
   * @param {import('..').threeJsRenderDelegateConfig} config
   */
  constructor(config) {
    this.config = config;
    if (debugMaterials) console.log("RenderDelegateInterface", config);
    this.registry = new TextureRegistry(config);
    this.materials = {};
    this.meshes = {};
    this.retiredMeshes = new Map();
    this.retiredMeshReleaseFrames = new Map();
    this.hydraDrawDepth = 0;
    this.scenePrimitives = {};
    this.pendingMaterialUpdates = new Set();
    this.pendingMaterialAssignments = new Map();
    this.diagnostics = {
      materialSPrims: 0,
      sceneSPrims: 0,
      materialAssignments: 0,
      materialNodes: 0,
      materialUpdateFinished: 0,
      materialXDocuments: 0,
      materialXSkippedNoDocuments: 0,
      materialXCreateAttempts: 0,
      materialXCreateSuccess: 0,
      materialXCreateFailures: 0,
      materialIds: [],
      scenePrimitiveIds: [],
    };
  }

  trackMaterialUpdate(promise) {
    this.pendingMaterialUpdates.add(promise);
    promise.finally(() => this.pendingMaterialUpdates.delete(promise));
  }

  async waitForMaterialsReady() {
    while (this.pendingMaterialUpdates.size > 0) {
      await Promise.allSettled([...this.pendingMaterialUpdates]);
    }
  }

  getDiagnostics() {
    return { ...this.diagnostics };
  }

  /**
   * Render Prims. See webRenderDelegate.h and webRenderDelegate.cpp
   * @param {string} typeId // translated from TfToken
   * @param {string} id // SdfPath.GetAsString()
   * @param {*} instancerId
   * @returns 
   */
  createRPrim(typeId, id, instancerId) {
    if (debugPrims) console.log('Creating RPrim: ', typeId, id, typeof id);
    const existing = this.meshes[id];
    if (existing) {
      this._retireRPrim(id, existing, false);
      delete this.meshes[id];
    }
    this._cancelRetiredRPrimRelease(id);
    let mesh = new HydraMesh(id, this);
    this.meshes[id] = mesh;
    return mesh;
  }

  beginHydraDraw() {
    this.hydraDrawDepth++;
  }

  endHydraDraw() {
    this.hydraDrawDepth = Math.max(0, this.hydraDrawDepth - 1);
    if (this.hydraDrawDepth > 0) return;

    for (const id of [...this.retiredMeshes.keys()]) {
      const replacement = this.meshes[id];
      if (replacement && !replacement._hasRenderableGeometry?.()) continue;
      this.releaseRetiredRPrims(id);
    }
  }

  destroyRPrim(id) {
    if (debugPrims) console.log('Destroying RPrim: ', id);
    const mesh = this.meshes[id];
    if (!mesh) return;
    delete this.meshes[id];
    this._retireRPrim(id, mesh, this.hydraDrawDepth === 0);
  }

  _retireRPrim(id, mesh, scheduleRelease) {
    let retired = this.retiredMeshes.get(id);
    if (!retired) {
      retired = new Set();
      this.retiredMeshes.set(id, retired);
    }
    retired.add(mesh);
    if (scheduleRelease) {
      this._scheduleRetiredRPrimRelease(id);
    }
  }

  _scheduleRetiredRPrimRelease(id) {
    this._cancelRetiredRPrimRelease(id);
    const requestFrame = globalThis.requestAnimationFrame || ((callback) => setTimeout(callback, 16));
    const frame = requestFrame(() => {
      this.retiredMeshReleaseFrames.delete(id);
      this.releaseRetiredRPrims(id);
    });
    this.retiredMeshReleaseFrames.set(id, frame);
  }

  _cancelRetiredRPrimRelease(id) {
    const frame = this.retiredMeshReleaseFrames.get(id);
    if (frame === undefined) return;
    const cancelFrame = globalThis.cancelAnimationFrame || clearTimeout;
    cancelFrame(frame);
    this.retiredMeshReleaseFrames.delete(id);
  }

  releaseRetiredRPrims(id) {
    this._cancelRetiredRPrimRelease(id);
    const retired = this.retiredMeshes.get(id);
    if (!retired) return;
    this.retiredMeshes.delete(id);
    for (const mesh of retired) {
      mesh.dispose();
    }
  }

  createBPrim(typeId, id) {
    if (debugPrims) console.log('Creating BPrim: ', typeId, id);
    /*let mesh = new HydraMesh(id, this);
    this.meshes[id] = mesh;
    return mesh;*/
  }

  createSPrim(typeId, id) {
    if (debugPrims) console.log('Creating SPrim: ', typeId, id);

    if (typeId === 'material') {
      this.destroySPrim(id);
      let material = new HydraMaterial(id, this);
      this.materials[id] = material;
      this.applyPendingMaterialAssignments(id);
      if (this.diagnostics.materialIds.length < 20) {
        this.diagnostics.materialIds.push(id);
      }
      return material;
    } else if (typeId === 'camera' || lightSprimTypeIds.has(typeId)) {
      const scenePrimitive = new HydraScenePrimitive(typeId, id, this);
      if (!id) {
        return scenePrimitive;
      }
      this.destroySPrim(id);
      this.scenePrimitives[id] = scenePrimitive;
      this.diagnostics.sceneSPrims++;
      if (this.diagnostics.scenePrimitiveIds.length < 20) {
        this.diagnostics.scenePrimitiveIds.push(id);
      }
      return scenePrimitive;
    } else {
      return undefined;
    }
  }

  destroySPrim(id) {
    if (debugPrims) console.log('Destroying SPrim: ', id);
    const material = this.materials[id];
    if (material) {
      material.dispose();
      delete this.materials[id];
    }
    const scenePrimitive = this.scenePrimitives[id];
    if (scenePrimitive) {
      scenePrimitive.dispose();
      delete this.scenePrimitives[id];
    }
  }

  dispose() {
    for (const id of Object.keys(this.meshes)) {
      this.destroyRPrim(id);
    }
    for (const id of [...this.retiredMeshes.keys()]) {
      this.releaseRetiredRPrims(id);
    }
    for (const id of Object.keys(this.materials)) {
      this.destroySPrim(id);
    }
    for (const id of Object.keys(this.scenePrimitives)) {
      this.destroySPrim(id);
    }
    this.registry.dispose();
    this.pendingMaterialUpdates.clear();
    this.pendingMaterialAssignments.clear();
  }

  rememberPendingMaterialAssignment(materialId, mesh) {
    if (!materialId || !mesh) return;
    mesh.userData?.usdHydraSetMaterialPending?.(materialId, true);
    let meshes = this.pendingMaterialAssignments.get(materialId);
    if (!meshes) {
      meshes = new Set();
      this.pendingMaterialAssignments.set(materialId, meshes);
    }
    meshes.add(mesh);
  }

  applyPendingMaterialAssignments(materialId) {
    const material = this.materials[materialId];
    const meshes = this.pendingMaterialAssignments.get(materialId);
    if (!material || !meshes) return;
    for (const mesh of meshes) {
      material.assignToMesh(mesh);
    }
    this.pendingMaterialAssignments.delete(materialId);
  }

  unassignMeshFromMaterials(mesh) {
    for (const material of Object.values(this.materials)) {
      material.unassignMesh(mesh);
    }
    for (const [materialId, meshes] of this.pendingMaterialAssignments) {
      if (meshes.delete(mesh)) {
        mesh.userData?.usdHydraSetMaterialPending?.(materialId, false);
      }
    }
  }

  refreshMeshMaterialAssignments(mesh) {
    let refreshed = false;
    for (const material of Object.values(this.materials)) {
      if (!material.hasMeshAssignment(mesh)) continue;
      material.refreshAssignments();
      refreshed = true;
    }
    return refreshed;
  }

  CommitResources() {
    for (const id in this.meshes) {
      const hydraMesh = this.meshes[id]
      hydraMesh.commit();
    }
  }
}
