import * as THREE from 'three';
import { fetchAsset } from '../assetFetch.js';
import { packSparkSphericalHarmonics } from './sparkSphericalHarmonics.js';
import { HydraStroke } from './HydraStroke.js';
import { HydraNurbsPatch } from './HydraNurbsPatch.js';
import { mdlToPreview } from './mdlPreview.js';
import { configurePreviewPrimvars, installPreviewPrimvarShader, preparePreviewPrimvars, configureMaterialXPrimvars, prepareMaterialXPrimvars } from './materialPrimvars.js';
import { remapNormalTextureSamples, remapTextureSamples } from './textureChannels.js';
import { textureFileType } from './textureFileType.js';
import { Ktx2Textures } from './ktx2Textures.js';
import { prepareWebGlAreaLights } from './areaLightSupport.js';
import { createDomeTexture, updateDomeEnvironment, removeDomeEnvironment } from './domeEnvironment.js';
import { VdbVolumeRprim } from './vdbVolumeRprim.js';
import { hasMaterialXVolume } from './materialxVolumeSupport.js';
import { materialXDefinitionsFor } from './materialxDefinitions.js';
import { lightIntensity } from './lightIntensity.js';
import { helperKinds, viewportHelpers, scenePrimitiveHelper, disposeHelper } from './primitiveHelpers.js';

const {
  TextureLoader,
  BufferGeometry,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
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
  Vector2,
  DirectionalLight,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  RectAreaLight,
  SpotLight,
  MathUtils,
  Group,
} = THREE;

const debugTextures = false;
const debugMaterials = false;
const debugMeshes = false;
const debugPrims = false;
const disableTextures = false;
const disableMaterials = false;

let materialXModulePromise = null;
let sparkModulePromise = null;
let mikkTSpaceTangentsPromise = null;
const generatedTangentStates = new WeakMap();
const sparkRendererRecords = new WeakMap();
const volumeProxyShadowStates = new WeakMap();

function surfaceShadowCasting(mesh) {
  return volumeProxyShadowStates.has(mesh) ? volumeProxyShadowStates.get(mesh) : mesh.castShadow;
}

function prepareVolumeProxyShadows(mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (materials.length && materials.every(material => material?.isBoundedVolumeNodeMaterial)) {
    if (!volumeProxyShadowStates.has(mesh)) volumeProxyShadowStates.set(mesh, mesh.castShadow);
    // The box bounds the integration domain; it is not an opaque occluder.
    // Extinction along light rays is evaluated by the volume material itself.
    mesh.castShadow = false;
  } else if (volumeProxyShadowStates.has(mesh)) {
    mesh.castShadow = volumeProxyShadowStates.get(mesh);
    volumeProxyShadowStates.delete(mesh);
  }
}

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
    MaterialXEnvironment: module.MaterialXEnvironment,
  }));
  return materialXModulePromise;
}

async function getSparkModule() {
  sparkModulePromise ??= import('@sparkjsdev/spark');
  return sparkModulePromise;
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

async function getMikkTSpaceTangents() {
  mikkTSpaceTangentsPromise ??= Promise.all([
    import('three/addons/utils/BufferGeometryUtils.js'),
    import('three/addons/libs/mikktspace.module.js'),
  ]).then(async ([utils, MikkTSpace]) => {
    await MikkTSpace.ready;
    return { computeMikkTSpaceTangents: utils.computeMikkTSpaceTangents, MikkTSpace };
  });
  return mikkTSpaceTangentsPromise;
}

function ensureMaterialXGeometryTangents(geometry) {
  let state = generatedTangentStates.get(geometry);
  if (!state) {
    state = { requested: false, promise: null };
    generatedTangentStates.set(geometry, state);
  }
  state.requested = true;
  if (state.promise) return state.promise;

  state.promise = (async () => {
    const { computeMikkTSpaceTangents, MikkTSpace } = await getMikkTSpaceTangents();
    let generated = false;
    do {
      state.requested = false;
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      const tangent = geometry.getAttribute('tangent');
      if (!position || !normal || normal.count !== position.count) {
        continue;
      }
      if (tangent?.count === position.count) {
        generated = true;
        continue;
      }

      if (uv) {
        if (uv.count !== position.count) continue;
        computeMikkTSpaceTangents(geometry, MikkTSpace);
      } else {
        // MaterialX standard_surface consumes a basis even without textures.
        // With no UV parameterization, choose a deterministic orthogonal tangent
        // instead of letting the missing attribute produce a zero/NaN basis.
        // UV-bearing geometry still uses MikkTSpace; authored tangents win above.
        const values = new Float32Array(position.count * 4);
        for (let i = 0; i < position.count; i++) {
          const x = normal.getX(i), y = normal.getY(i), z = normal.getZ(i);
          const useY = Math.abs(y) < 0.9 * Math.hypot(x, y, z);
          const tx = useY ? z : 0, ty = useY ? 0 : -z, tz = useY ? -x : y;
          const length = Math.hypot(tx, ty, tz);
          const valid = length > 0 && Number.isFinite(length);
          values[i * 4] = valid ? tx / length : 1;
          values[i * 4 + 1] = valid ? ty / length : 0;
          values[i * 4 + 2] = valid ? tz / length : 0;
          values[i * 4 + 3] = 1;
        }
        geometry.setAttribute('tangent', new Float32BufferAttribute(values, 4));
      }
      const generatedTangents = geometry.getAttribute('tangent');
      if (generatedTangents?.count === position.count) {
        generatedTangents.needsUpdate = true;
        geometry.userData.usdHydraGeneratedTangents = true;
        generated = true;
      }
    } while (state.requested);
    return generated;
  })().catch(error => {
    console.warn('[MaterialX] Failed to generate MikkTSpace tangents for Hydra geometry.', error);
    return false;
  }).finally(() => {
    state.promise = null;
  });
  return state.promise;
}

function prepareMaterialXMaterialForGeometry(material, geometry) {
  if (!material || !geometry) return null;
  if (!material.isMaterialXMaterial && material.constructor?.name !== 'MaterialXMaterial') return null;

  // Hydra readiness includes tangent generation, so do not also start the
  // MaterialX material's lazy first-render path for the same geometry.
  material.generateTangents = false;
  if (!material._needsTangents) return null;
  return ensureMaterialXGeometryTangents(geometry).then(generated => {
    if (generated) material.needsUpdate = true;
  });
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
    this.exportRecipes = new WeakMap();
    this.objectUrls = new Set();
    this.materialXDefinitionCache = new Map();
    this.disposed = false;
    this.loader = new TextureLoader();
    this.textureDecoders = new Map();
    this.httpAbort = new AbortController();
    this.driverFileQueue = Promise.resolve();
    this.ktx2Textures = null;

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
          // getFile lends a native byte view only for the callback's duration.
          Promise.resolve(this.config.driver().getFile(candidate, file => resolve(file?.slice()))).catch(() => resolve(null));
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
    // Package members need the native archive reader, not an image URL.
    if (!resourcePath || resourcePath.includes('[')) return "";
    try {
      const resolved = this.config.driver?.()?.resolveAssetUrl?.(resourcePath);
      if (typeof resolved === "string" && /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(resolved)) {
        return resolved;
      }
    } catch { }

    // Compatibility with runtimes that predate resolver-owned HTTP scopes.
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

  getTextureDecoder(filetype) {
    let pending = this.textureDecoders.get(filetype);
    if (!pending) {
      // Keep uncommon decoders and their compression dependencies off the
      // normal PNG/JPEG startup path; concurrent textures share one loader.
      if (filetype === 'image/tga') {
        pending = import('three/addons/loaders/TGALoader.js').then(({ TGALoader }) => new TGALoader());
      } else if (filetype === 'image/x-exr') {
        pending = import('three/addons/loaders/EXRLoader.js').then(({ EXRLoader }) => new EXRLoader());
      } else if (filetype === 'image/vnd.radiance') {
        pending = import('three/addons/loaders/RGBELoader.js').then(({ RGBELoader }) => new RGBELoader());
      }
      if (pending) this.textureDecoders.set(filetype, pending);
    }
    return pending;
  }

  getTexture(resourcePath, readable = false) {
    resourcePath = this.resolveResourcePath(resourcePath);
    // Known uploaded files can be stored as MEMFS paths without a leading slash.
    // Texture identities must be absolute so a host can relativize them against
    // the stage root, rather than anchoring the mount path a second time.
    let sourceIdentity = resourcePath;
    if (resourcePath && !resourcePath.startsWith('/') && !/^[a-z][a-z\d+.-]*:/i.test(resourcePath)) {
      const file = resourcePath.split('[')[0];
      if (this.config.USD?.FS_analyzePath?.(file)?.exists) sourceIdentity = '/' + resourcePath;
    }
    const cacheKey = resourcePath + (readable ? "#usd-readable" : "");
    if (debugTextures) console.log("get texture", resourcePath);
    if (this.textures[cacheKey]) {
      return this.textures[cacheKey];
    }

    let textureResolve, textureReject;
    this.textures[cacheKey] = new Promise((resolve, reject) => {
      textureResolve = texture => {
        this.exportRecipes.set(texture.source, async registry => {
          const original = await registry.getTexture(resourcePath, readable);
          const copy = texture.clone(); copy.source = original.source; return copy;
        });
        resolve(texture);
      };
      textureReject = reject;
    });

    if (!resourcePath) {
      return Promise.reject(new Error('Empty resource path for file: ' + resourcePath));
    }

    const extension = this.getResourceExtension(resourcePath);
    let filetype = textureFileType(extension);

    const loadFromUrl = (url, revokeOnLoad = false) => {
      if (filetype === 'image/ktx2') {
        this.ktx2Textures ??= new Ktx2Textures(this.config.renderer, this.config.ktx2TranscoderPath);
        const releaseUrl = () => { if (revokeOnLoad) { URL.revokeObjectURL(url); this.objectUrls.delete(url); } };
        this.ktx2Textures.load(url, readable).then(texture => {
          releaseUrl(); texture.name = sourceIdentity; texture.userData.usdKtx2 = true;
          if (this.disposed) texture.dispose(); else this.loadedTextures.add(texture);
          textureResolve(texture);
        }, error => { releaseUrl(); textureReject(error); });
        return;
      }
      const releaseUrl = () => {
        if (revokeOnLoad) {
          URL.revokeObjectURL(url);
          this.objectUrls.delete(url);
        }
      };
      const fail = error => { releaseUrl(); textureReject(error); };
      const loadWith = loader => {
        try {
          if (this.disposed) throw new Error('Texture registry disposed while loading ' + resourcePath);
          if (debugTextures) console.log("Loading texture from", url, "with loader", loader, "resourcePath", resourcePath);
          loader.load(url, texture => {
            try {
            releaseUrl();
            texture.name = sourceIdentity;
            const limit = this.config.maxTextureSize;
            const image = texture.image;
            if (limit > 0 && image?.width > 0 && image?.height > 0 && Math.max(image.width,image.height) > limit && typeof document !== 'undefined' && !texture.isDataTexture && !texture.isCompressedTexture) {
              const canvas=document.createElement('canvas'),scale=limit/Math.max(image.width,image.height);
              canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
              canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
              texture.userData.usdSourceSize=[image.width,image.height];texture.image=canvas;texture.needsUpdate=true;
            }
            if (this.disposed) texture.dispose();
            else this.loadedTextures.add(texture);
            textureResolve(texture);
            } catch (error) { texture.dispose(); fail(error); }
          }, undefined, fail);
        } catch (error) { fail(error); }
      };
      const decoder = this.getTextureDecoder(filetype);
      if (decoder) decoder.then(loadWith, fail);
      else loadWith(this.loader);
    };

    const loadFromFile = (_loadedFile) => {
      if (debugTextures) console.log("window.driver.getFile", resourcePath, " => ", _loadedFile);
      if (!_loadedFile) {
        textureReject(new Error('Unknown file: ' + resourcePath));
        return;
      }

      // Native archive reads can alias the shared WASM heap. Blob and image
      // decoders require ordinary, owned memory; copy before native work resumes.
      if (!(_loadedFile.buffer instanceof ArrayBuffer)) _loadedFile = new Uint8Array(_loadedFile);
      filetype = textureFileType(extension, _loadedFile);
      const limit=this.config.maxTextureSize;
      if(filetype==='image/png' && limit>0 && typeof document!=='undefined' && typeof Worker!=='undefined' && _loadedFile.byteLength>=33){
        const header=new DataView(_loadedFile.buffer,_loadedFile.byteOffset,_loadedFile.byteLength);
        if(Math.max(header.getUint32(16),header.getUint32(20))>limit){
          void import('./pngTexture.js').then(({createPngDownsampler})=>{
            if(this.disposed)throw new Error('Texture registry disposed');
            this.pngDownsampler ||= createPngDownsampler();
            const owned=_loadedFile.buffer instanceof ArrayBuffer && _loadedFile.byteOffset===0 && _loadedFile.byteLength===_loadedFile.buffer.byteLength?_loadedFile:new Uint8Array(_loadedFile);
            return this.pngDownsampler.decode(owned,limit);
          }).then(image=>{
            if(this.disposed)throw new Error('Texture registry disposed');
            const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
            canvas.getContext('2d').putImageData(new ImageData(image.data,image.width,image.height),0,0);
            const texture=new THREE.CanvasTexture(canvas);texture.name=sourceIdentity;texture.userData.usdSourceSize=[image.sourceWidth,image.sourceHeight];
            this.loadedTextures.add(texture);textureResolve(texture);
          }).catch(textureReject);
          return;
        }
      }
      let blob = new Blob([_loadedFile], { type: filetype });
      const url = URL.createObjectURL(blob);
      this.objectUrls.add(url);
      loadFromUrl(url, true);
    };

    const loadHttp = url => {
      const progress = this.config.onAssetFetchProgress || this.config.USD?.onAssetFetchProgress;
      if (!progress && !this.config.resolveTextureUrl && !(this.config.maxTextureSize>0)) { loadFromUrl(url); return; }
      Promise.resolve().then(() => this.config.resolveTextureUrl?.(url) || url)
        .then(target => fetchAsset(target || url, progress, {signal:this.httpAbort.signal}))
        .then(bytes => { if (this.disposed) throw new Error('Texture registry disposed'); loadFromFile(bytes); })
        .catch(textureReject);
    };

    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(resourcePath)) {
      loadHttp(resourcePath);
      return this.textures[cacheKey];
    }

    const httpResourceUrl = this.resolveHttpResourceUrl(resourcePath);
    if (httpResourceUrl) {
      loadHttp(httpResourceUrl);
      return this.textures[cacheKey];
    }

    // URL resolution must precede ReadFile: a missing HTTP-backed file can
    // suspend that native function through Asyncify, while this read is sync.
    const resolvedFile = this.readResolvedResource(resourcePath);
    if (resolvedFile) {
      loadFromFile(resolvedFile);
      return this.textures[cacheKey];
    }

    const loadFromDriverFile = () => {
      this.driverFileQueue = this.driverFileQueue.catch(() => {}).then(() => new Promise((resolveQueue) => {
        const fail = error => {
          resolveQueue();
          textureReject(error);
        };
        try {
          Promise.resolve(this.config.driver().getFile(resourcePath, loadedFile => {
            resolveQueue();
            if (!loadedFile) {
              textureReject(new Error('Unknown file: ' + resourcePath));
              return;
            }
            try { loadFromFile(loadedFile); }
            catch (error) { textureReject(error); }
          })).catch(fail);
        } catch (error) { fail(error); }
      }));
    };

    loadFromDriverFile();

    return this.textures[cacheKey];
  }

  // Originals use a separate registry: no preview URL rewrite, size cap, or
  // replacement of textures in the live scene. The caller owns this scope.
  createExportScope({signal,resolution='original'} = {}) {
    if(!['original','preview'].includes(resolution))throw new RangeError('Invalid export texture resolution.');
    const preview=resolution==='preview',limit=this.config.maxTextureSize||512;
    const registry = new TextureRegistry({...this.config, resolveTextureUrl: preview?this.config.resolveTextureUrl:undefined, maxTextureSize: preview?limit:undefined});
    const pending = new Map(), converted = new Set();
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true; signal?.removeEventListener('abort', dispose);
      registry.dispose(); for (const texture of converted) texture.dispose();
    };
    signal?.addEventListener('abort', dispose, {once:true});
    if (signal?.aborted) dispose();
    return {
      maxTextureSize:preview?limit:Infinity,
      getTexture: async texture => {
        if (disposed) throw new DOMException('Texture export cancelled', 'AbortError');
        if(preview&&Math.max(texture.image?.width||0,texture.image?.height||0)<=limit)return texture;
        const recipe = this.exportRecipes.get(texture) || this.exportRecipes.get(texture.source);
        if (!recipe) return texture; // Native glTF and host-owned textures are already the source.
        if (!pending.has(texture)) pending.set(texture, recipe(registry).then(value => {
          if (disposed) {value.dispose(); throw new DOMException('Texture export cancelled', 'AbortError');}
          converted.add(value); return value;
        }));
        return pending.get(texture);
      },
      dispose,
    };
  }

  dispose() {
    this.disposed = true;
    this.httpAbort.abort();
    this.pngDownsampler?.dispose();
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
    this.materialXDefinitionCache.clear();
    this.ktx2Textures?.dispose();

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

    const focalLength = Number(state?.focalLength) || 5;
    const verticalAperture = Number(state?.verticalAperture) || 1.52908;
    const horizontalAperture = Number(state?.horizontalAperture) || verticalAperture;
    const near = Number(state?.near);
    const far = Number(state?.far);
    if (this._object.isPerspectiveCamera) {
      this._object.fov = MathUtils.radToDeg(2 * Math.atan((verticalAperture * 0.5) / focalLength));
      this._object.aspect = horizontalAperture > 0 && verticalAperture > 0 ? horizontalAperture / verticalAperture : 1;
    }
    if (this._object.isOrthographicCamera) {
      // Hydra has already converted USD apertures to world units.
      this._object.left = -horizontalAperture / 2; this._object.right = horizontalAperture / 2;
      this._object.top = verticalAperture / 2; this._object.bottom = -verticalAperture / 2;
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
    const shaped = Number(state?.coneAngle ?? 180) < 180;
    const area = typeId === 'rectLight' || typeId === 'diskLight';
    const LightCtor = typeId === "distantLight"
      ? DirectionalLight
      : typeId === "domeLight"
        ? Group
        : shaped ? SpotLight : area ? RectAreaLight : PointLight;

    if (!this._object || !(this._object instanceof LightCtor)) {
      const color = new Color(1, 1, 1);
      // Dome lighting comes from scene.environment. Its transform carrier
      // must not also enter the light list: an origin HemisphereLight has an
      // undefined direction that poisons node-renderer irradiance even at zero intensity.
      this._replaceObject(typeId === "domeLight" ? new Group() : new LightCtor(color, 1));
      this._object.userData.usdKind = "sprim";
      if (this._object.target) {
        this._object.target.position.set(0, 0, -1);
        this._object.add(this._object.target);
      }
    }

    const colorValue = Array.isArray(state?.color) ? state.color : [1, 1, 1];
    this._object.color?.setRGB?.(
      Number(colorValue[0]) || 0,
      Number(colorValue[1]) || 0,
      Number(colorValue[2]) || 0);
    const scale = this._interface.config.scenePrimitiveLightIntensityScale ?? defaultScenePrimitiveLightIntensityScale;
    const photometry = lightIntensity(state || {}, typeId, shaped);
    if (this._object.isLight) this._object.intensity = photometry.intensity * scale;
    if (area && !shaped) {
      this._interface.prepareAreaLights();
      this._object.width = Math.max(photometry.width, .001);
      this._object.height = Math.max(photometry.height, .001);
    }
    if (this._object.isSpotLight) {
      this._object.angle = MathUtils.degToRad(Math.max(.01, Math.min(90, Number(state.coneAngle))));
      this._object.penumbra = Math.max(0, Math.min(1, Number(state.coneSoftness) || 0));
    }
    this._lightVisible = state?.visible !== false;
    this._object.visible = this._lightVisible && (!area || shaped || !!this._interface.areaLightsPrepared);
    if (area && !shaped && !this._interface.areaLightsPrepared && this._pendingAreaLight !== this._object) {
      const object = this._pendingAreaLight = this._object;
      void this._interface.prepareAreaLights().then(() => {
        if (this._object !== object) return;
        object.visible = this._lightVisible; this._syncHelper();
        this._interface.config.requestRender?.();
      }).catch(() => {}); // Readiness reports initialization failures to the caller.
    }
    this._object.name = primNameFromPath(this._id, usdLightTypeNames[typeId] || "UsdLight");
    this._object.userData.usdPath = this._id;
    this._object.userData.usdTypeName = usdLightTypeNames[typeId] || typeId;
    applyHydraTransform(this._object, state?.transform);
    if (typeId === 'domeLight') this._updateDome(state, colorValue);
    this._syncHelper(state);
  }

  _updateDome(state, color) {
    this._domeScene = this._interface.config.renderScene || this._interface.config.usdRoot;
    const path = state.textureResolvedUrl || state.textureResolvedPath || state.textureFile || '';
    const key = JSON.stringify([path, color]);
    this._domeState = { ...state };
    if (key === this._domeKey) {
      updateDomeEnvironment(this, this._domeScene, this._domeTexture, state, this._object);
      return;
    }
    this._domeKey = key;
    const token = this._domeToken = {};
    const update = (async () => {
      const source = path ? await this._interface.registry.getTexture(path) : null;
      if (this._domeToken !== token) return;
      const texture = createDomeTexture(source, color);
      const previous = this._domeTexture;
      this._domeTexture = texture;
      updateDomeEnvironment(this, this._domeScene, texture, this._domeState, this._object);
      previous?.dispose();
      this._interface.config.requestRender?.();
    })().catch(error => console.error(`USD dome light '${this._id}' failed to load its environment`, error));
    this._interface.trackMaterialUpdate(update);
  }

  dispose() {
    this._domeToken = null;
    removeDomeEnvironment(this, this._domeScene);
    this._domeTexture?.dispose();
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

  _syncHelper(state = this._helperState || {}) {
    this._helperState = state;
    const object = this._object;
    if (!object || !this._interface.helpersFor(this._id)[object.isCamera ? 'cameras' : 'lights']) {
      disposeHelper(this._helper); this._helper = null; return;
    }
    const shape = JSON.stringify([state.typeId, state.radius, state.width, state.height, state.length,
      object.angle, object.fov, object.aspect, object.near, object.left, object.right, object.top, object.bottom]);
    if (!this._helper || this._helperShape !== shape) {
      disposeHelper(this._helper);
      this._helper = scenePrimitiveHelper(object, state, this._id);
      this._helperShape = shape;
      this._interface.config.scenePrimitiveRoot?.add(this._helper);
    }
    this._helper.matrix.copy(object.matrix); this._helper.visible = object.visible;
  }

  updateHelpers() { this._syncHelper(); }

}

const SH_C0 = 0.28209479177387814;

function copyFiniteFloatArray(values, label) {
  const result = Float32Array.from(values || []);
  for (let i = 0; i < result.length; i++) {
    if (!Number.isFinite(result[i])) {
      throw new Error(`${label} contains a non-finite value at index ${i}`);
    }
  }
  return result;
}

function normalizeOptionalParticleArray(values, expected) {
  if (values.length < expected) return new Float32Array();
  return values.length === expected ? values : values.slice(0, expected);
}

function createSparkExtSplats(data, spark) {
  const count = data.positions.length / 3;
  const coefficientsPerSplat = (data.degree + 1) ** 2;
  const paddedCount = Math.ceil(count / spark.defines.SPLAT_TEX_WIDTH) * spark.defines.SPLAT_TEX_WIDTH;
  const extArrays = [
    new Uint32Array(paddedCount * 4),
    new Uint32Array(paddedCount * 4),
  ];
  const extra = {};
  if (data.degree >= 1) extra.sh1 = new Uint32Array(paddedCount * 4);
  if (data.degree >= 2) extra.sh2 = new Uint32Array(paddedCount * 4);
  if (data.degree >= 3) {
    extra.sh3a = new Uint32Array(paddedCount * 4);
    extra.sh3b = new Uint32Array(paddedCount * 4);
  }

  for (let i = 0; i < count; i++) {
    const p = i * 3;
    const q = i * 4;
    const coefficientBase = i * coefficientsPerSplat * 3;
    spark.utils.encodeExtSplat(
      extArrays,
      i,
      data.positions[p], data.positions[p + 1], data.positions[p + 2],
      data.scales.length ? data.scales[p] : 1,
      data.scales.length ? data.scales[p + 1] : 1,
      data.scales.length ? data.scales[p + 2] : 1,
      data.orientations.length ? data.orientations[q] : 0,
      data.orientations.length ? data.orientations[q + 1] : 0,
      data.orientations.length ? data.orientations[q + 2] : 0,
      data.orientations.length ? data.orientations[q + 3] : 1,
      data.opacities.length ? data.opacities[i] : 1,
      0.5 + SH_C0 * data.coefficients[coefficientBase],
      0.5 + SH_C0 * data.coefficients[coefficientBase + 1],
      0.5 + SH_C0 * data.coefficients[coefficientBase + 2],
    );

    packSparkSphericalHarmonics(extra, i, data.coefficients, coefficientBase, data.degree);
  }

  return new spark.ExtSplats({ extArrays, numSplats: count, extra });
}

class HydraParticleField {
  constructor(id, hydraInterface) {
    this._id = id;
    this._interface = hydraInterface;
    this._root = new Group();
    this._root.name = primNameFromPath(id, 'ParticleField');
    this._root.userData.usdPath = id;
    this._root.userData.usdTypeName = 'ParticleField3DGaussianSplat';
    this._root.visible = false;
    this._interface.config.usdRoot.add(this._root);
    this._data = null;
    this._transform = new Matrix4();
    this._instanceTransforms = [];
    this._meshes = [];
    this._visible = false;
    this._renderTag = 'geometry';
    this._revision = 0;
    this._appliedRevision = -1;
    this._scheduledUpdate = null;
    this._disposed = false;
  }

  setParticleFieldData(positions, orientations, scales, opacities, degree,
    coefficients, projectionModeHint, sortingModeHint) {
    const positionValues = copyFiniteFloatArray(positions, 'particleField.positions');
    if (positionValues.length % 3 !== 0) {
      throw new Error(`particleField.positions has ${positionValues.length} values; expected vec3 elements`);
    }
    const count = positionValues.length / 3;
    const normalizedDegree = Number(degree);
    if (!Number.isInteger(normalizedDegree) || normalizedDegree < 0 || normalizedDegree > 3) {
      throw new Error(`Particle fields support spherical harmonics degrees 0 through 3; received ${degree}`);
    }

    const orientationValues = normalizeOptionalParticleArray(
      copyFiniteFloatArray(orientations, 'particleField.orientations'), count * 4);
    const scaleValues = normalizeOptionalParticleArray(
      copyFiniteFloatArray(scales, 'particleField.scales'), count * 3);
    const opacityValues = normalizeOptionalParticleArray(
      copyFiniteFloatArray(opacities, 'particleField.opacities'), count);
    let coefficientValues = copyFiniteFloatArray(
      coefficients, 'particleField.radiance:sphericalHarmonicsCoefficients');
    const expectedCoefficients = count * ((normalizedDegree + 1) ** 2) * 3;
    const effectiveDegree = coefficientValues.length >= expectedCoefficients ? normalizedDegree : 0;
    coefficientValues = effectiveDegree === normalizedDegree
      ? coefficientValues.slice(0, expectedCoefficients)
      : new Float32Array(count * 3);

    this._data = {
      positions: positionValues,
      orientations: orientationValues,
      scales: scaleValues,
      opacities: opacityValues,
      degree: effectiveDegree,
      coefficients: coefficientValues,
      projectionModeHint: String(projectionModeHint || 'perspective'),
      sortingModeHint: String(sortingModeHint || 'zDepth'),
    };
    this._revision++;
    this._scheduleUpdate();
  }

  setTransform(matrix) {
    this._transform.set(...Array.from(matrix).slice(0, 16));
    this._transform.transpose();
    this._revision++;
    this._scheduleUpdate();
  }

  setInstanceTransforms(matrices, count = 0) {
    const instanceCount = Number(count) || 0;
    this._instanceTransforms = [];
    for (let i = 0; i < instanceCount; i++) {
      const matrix = new Matrix4();
      matrix.set(...Array.from(matrices.slice(i * 16, i * 16 + 16)));
      matrix.transpose();
      this._instanceTransforms.push(matrix);
    }
    this._revision++;
    this._scheduleUpdate();
  }

  setVisibilityState(visible, renderTag = 'geometry') {
    this._visible = Boolean(visible);
    this._renderTag = String(renderTag || 'geometry');
    this._applyVisibilityState();
  }

  _applyVisibilityState() {
    this._root.visible = this._visible && this._interface.isRenderTagIncluded(this._renderTag);
  }

  _scheduleUpdate() {
    if (this._scheduledUpdate || this._disposed) return;
    const update = Promise.resolve().then(() => this._rebuild());
    this._scheduledUpdate = update;
    this._interface.trackRprimUpdate(update);
    const finish = (failed) => {
      if (this._scheduledUpdate !== update) return;
      this._scheduledUpdate = null;
      if (failed) this._appliedRevision = this._revision;
      if (!this._disposed && this._revision !== this._appliedRevision) {
        this._scheduleUpdate();
      }
    };
    update.then(() => finish(false), () => finish(true));
  }

  async _rebuild() {
    const revision = this._revision;
    const data = this._data;
    if (!data || this._disposed) {
      this._appliedRevision = revision;
      return;
    }

    if (data.positions.length === 0) {
      for (const mesh of this._meshes) {
        mesh.parent?.remove(mesh);
        mesh.dispose();
      }
      this._meshes.length = 0;
      this._appliedRevision = revision;
      return;
    }

    const factory = this._interface.config.webGpuSupport?.createParticleField;
    const transforms = this._instanceTransforms.length ? this._instanceTransforms : [this._transform];
    let candidates;
    if (this._interface.config.renderer?.isWebGPURenderer) {
      if (!factory) throw new Error('WebGPURenderer particle fields require createWebGpuSupport().');
      const results = await Promise.allSettled(transforms.map(() => Promise.resolve().then(() => factory(data))));
      candidates = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      const failure = results.find(result => result.status === 'rejected');
      if (failure) { for (const mesh of candidates) mesh.dispose(); throw failure.reason; }
    } else {
      const spark = await getSparkModule();
      const renderer = this._interface.ensureSparkRenderer(spark, data.sortingModeHint);
      if (data.projectionModeHint !== 'perspective') this._interface.warnUnsupportedParticleProjection(data.projectionModeHint, this._id);
      renderer.sortRadial = data.sortingModeHint !== 'zDepth';
      candidates = transforms.map(() => new spark.SplatMesh({ extSplats: createSparkExtSplats(data, spark) }));
      await Promise.all(candidates.map(mesh => mesh.initialized));
    }
    candidates.forEach((mesh, index) => {
      mesh.name = `${this._root.name}${transforms.length > 1 ? `_instance_${index}` : ''}`;
      mesh.userData.usdPath = this._id;
      mesh.userData.usdTypeName = 'ParticleField3DGaussianSplat';
      mesh.matrix.copy(transforms[index]); mesh.matrixAutoUpdate = false; mesh.visible = false;
    });

    if (this._disposed || revision !== this._revision) {
      for (const mesh of candidates) mesh.dispose();
      return;
    }

    for (const mesh of this._meshes) {
      mesh.parent?.remove(mesh);
      mesh.dispose();
    }
    this._meshes = candidates;
    for (const mesh of candidates) {
      mesh.visible = true;
      this._root.add(mesh);
    }
    this._appliedRevision = revision;
    this._applyVisibilityState();
  }

  _hasRenderableGeometry() {
    return this._meshes.length > 0;
  }

  commit() {
  }

  dispose() {
    this._disposed = true;
    this._revision++;
    for (const mesh of this._meshes) {
      mesh.parent?.remove(mesh);
      mesh.dispose();
    }
    this._meshes.length = 0;
    this._root.parent?.remove(this._root);
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
    this._constantTangent = undefined;
    this._colors = undefined;
    this._primvars = new Map();
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

    let material = new MeshStandardMaterial({
      side: DoubleSide,
      color: new Color(0xf2f2f2),
      roughness: 0.65,
      metalness: 0,
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
    nextObject.castShadow = surfaceShadowCasting(previous);
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

  updateIndices(indices, coarseFaceParams) {
    return timeHydraUpdate(`Hydra updateIndices ${this.usdPath}`, () => {
      if (coarseFaceParams) {
        const previous = this._geometry.userData.usdCoarseFaceParams;
        let same = previous?.length === coarseFaceParams.length;
        for (let i = 0; same && i < previous.length; i++) same = previous[i] === coarseFaceParams[i];
        // Runtime lookup data must not become exported geometry extras.
        if (!same) Object.defineProperty(this._geometry.userData,'usdCoarseFaceParams',{value:Int32Array.from(coarseFaceParams),writable:true,configurable:true});
      }
      if (debugMeshes) console.log("updateIndices", indices);
      let unchanged = this._indices && this._indices.length === indices?.length;
      for (let i = 0; unchanged && i < indices.length; i++) unchanged = this._indices[i] === indices[i];
      if (unchanged) {
        // updatePoints already refreshes positions/normals. Keep unchanged UV,
        // color and custom-primvar buffers across deforming animation frames.
        // Tangent preparation and wire overlays still depend on the new points.
        this._interface.prepareMeshMaterialGeometry(this._mesh);
        this._refreshWireObject();
        this._applyVisibilityState();
        return;
      }
      this._invalidateGeneratedTangents();
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
      if (this._constantTangent) {
        this._applyConstantTangent();
      } else if (this._tangents && (this._tangentInterpolation === 'vertex' || this._tangentInterpolation === 'varying')) {
        this.updateOrder(this._tangents, 'tangent', this._tangentDimension);
      } else {
        this._geometry.deleteAttribute('tangent');
      }
      for (const [name, primvar] of this._primvars) {
        if (primvar.interpolation === 'vertex' || primvar.interpolation === 'varying') {
          this.updateTypedOrder(primvar.values, `primvars:${name}`, primvar.itemSize);
        }
      }
      this._interface.prepareMeshMaterialGeometry(this._mesh);
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

  setInstanceTransforms(matrices, count = 0, instanced = count > 0 || !!this._isInstanced) {
    if (!this._mesh) return;
    this._isInstanced = Boolean(instanced);
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
      this._instancedMesh.castShadow = surfaceShadowCasting(this._mesh);
      this._instancedMesh.receiveShadow = this._mesh.receiveShadow;
      this._instancedMesh.matrixAutoUpdate = false;
      this._instancedMesh.userData.usdPath = this._id;
      this._instancedMesh.userData.usdInstanced = true;
      this._interface.config.usdRoot.add(this._instancedMesh);
    }

    this._instancedMesh.material = this._mesh.material;
    prepareVolumeProxyShadows(this._instancedMesh);
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
    mesh.userData.usdHydraFallbackMaterial = () => this._ownedMaterial;
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
    const visible = this._visible && this._interface.isRenderTagIncluded(this._renderTag) && this._pendingMaterialIds.size === 0 && this._hasRenderableGeometry();
    if (this._mesh) {
      this._mesh.visible = !this._isInstanced && visible;
      this._mesh.userData.usdRenderTag = this._renderTag;
    }
    if (this._instancedMesh) {
      this._instancedMesh.visible = visible;
      this._instancedMesh.userData.usdRenderTag = this._renderTag;
    }
    if (this._wireObject) {
      this._wireObject.visible = visible && !this._isInstanced;
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
    // Bounded media integrate from back faces through their box, independent of
    // the USD mesh's surface culling mode.
    if (material.isBoundedVolumeNodeMaterial) return material;
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
    // NodeMaterial.copy in r185 skips inherited accessors, including alphaTest.
    // Sidedness copies must retain the authored cutout, just like WebGL copies.
    clone.alphaTest = material.alphaTest;
    clone.alphaClip = material.alphaClip;
    installPreviewPrimvarShader(clone);
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
    this._interface.prepareMeshMaterialGeometry(this._mesh);
  }

  _invalidateGeneratedTangents() {
    if (!this._geometry.userData.usdHydraGeneratedTangents) return;
    this._geometry.deleteAttribute('tangent');
    delete this._geometry.userData.usdHydraGeneratedTangents;
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
      this._invalidateGeneratedTangents();
      this._hasAuthoredNormals = false;
      this._orderedNormals = undefined;
      this._constantNormal = undefined;
      this._indexedNormals = Float32Array.from(normals);
      this.updateOrder(this._indexedNormals, 'normal');
    });
  }

  updateOrderedNormals(normals) {
    return timeHydraUpdate(`Hydra updateOrderedNormals ${this.usdPath}`, () => {
      this._invalidateGeneratedTangents();
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
    this._invalidateGeneratedTangents();
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

  _applyConstantTangent() {
    const count = this._geometry.getAttribute('position')?.count;
    if (!count || !this._constantTangent) return;
    const values = new Float32Array(count * this._tangentDimension);
    for (let i = 0; i < count; i++) values.set(this._constantTangent, i * this._tangentDimension);
    this._geometry.setAttribute('tangent', new Float32BufferAttribute(values, this._tangentDimension));
  }

  setTangents(data, dimension, interpolation) {
    delete this._geometry.userData.usdHydraGeneratedTangents;
    this._constantTangent = undefined;
    this._tangentDimension = Math.max(1, Number(dimension) || 4);
    this._tangentInterpolation = interpolation;
    if (interpolation === 'constant') {
      this._tangents = undefined;
      const values = Float32Array.from(data || []);
      if (values.length >= this._tangentDimension) {
        this._constantTangent = values.slice(0, this._tangentDimension);
        this._applyConstantTangent();
      }
    } else if (interpolation === 'facevarying') {
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
      // Keep every section, including materials Hydra cannot translate and
      // sprims that will arrive later in this draw. Slot indices must stay
      // aligned with the sections when those assignments eventually resolve.
      this._materials.push(hydraMaterial?._material || this._materials[0]);
      this._geometry.addGroup(section.start, section.length, i + 1);
    }

    this._mesh.material = this._materials;
    this._applyCullSideToMeshes();
    this._applyHydraReprMaterialState();
    for (let i = 0; i < sections.length; i++) {
      const hydraMaterial = this._interface.materials[sections[i].materialId];
      if (hydraMaterial) {
        hydraMaterial.assignToMesh(this._mesh, i + 1);
      } else {
        this._interface.rememberPendingMaterialAssignment(sections[i].materialId, this._mesh, i + 1);
      }
    }
    this._applyVisibilityState();
  }

  setDisplayColor(data, interpolation) {
    if (disableMaterials) return;

    // Hydra may deliver primvars after it assigns the authored material. Keep
    // displayColor on mesh-owned fallbacks instead of mutating that shared
    // surface, for every interpolation (including constant and vertex).
    if (Array.isArray(this._mesh.material)) {
      for (let i = 0; i < this._mesh.material.length; i++) {
        if (this._mesh.material[i] === defaultMaterial) this._mesh.material[i] = this._ownedMaterial;
      }
    } else if (this._mesh.material === defaultMaterial) {
      this._mesh.material = this._ownedMaterial;
    }
    const fallbacks = new Set([
      this._ownedMaterial,
      this._ownedPointsMaterial,
      ...[this._mesh.material].flat().filter(material => material?.userData?.usdHydraMeshOwner === this._id),
    ]);
    this._colors = null;

    if (interpolation === 'constant') {
      this._geometry.deleteAttribute('color');
      for (const material of fallbacks) {
        material.color.fromArray(data);
        material.vertexColors = false;
        material.needsUpdate = true;
      }
    } else if (interpolation === 'vertex' || interpolation === 'varying' || interpolation === 'facevarying') {
      if (interpolation === 'facevarying') {
        // Hydra already expanded face-varying and uniform colors to triangle order.
        this._geometry.setAttribute('color', new Float32BufferAttribute(data, 3));
      } else {
        this._colors = Float32Array.from(data);
        this.updateOrder(this._colors, 'color');
      }
      for (const material of fallbacks) {
        material.vertexColors = true;
        material.color.setRGB(1, 1, 1);
        material.needsUpdate = true;
      }
    } else {
      if (warningMessagesToCount.has(interpolation)) {
        warningMessagesToCount.set(interpolation, warningMessagesToCount.get(interpolation) + 1);
      } else {
        warningMessagesToCount.set(interpolation, 1);
        console.warn(`Unsupported displayColor interpolation type '${interpolation}'.`);
      }
    }
    this.setGenericPrimvar('displayColor', data, 3, interpolation);
  }

  setUV(data, dimension, interpolation) {
    // TODO: Support multiple UVs. For now, we simply set uv = uv2, which is required when a material has an aoMap.
    this._invalidateGeneratedTangents();
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
    this._interface.prepareMeshMaterialGeometry(this._mesh);
  }

  setGenericPrimvar(name, data, dimension, interpolation) {
    const attributeName = `primvars:${name}`;
    const itemSize = Math.max(1, Number(dimension) || 1);
    const values = ArrayBuffer.isView(data) ? data.slice() : Float32Array.from(data || []);
    this._primvars.set(name, { values, itemSize, interpolation });
    if (this._mesh.userData.usdPrimvars) delete this._mesh.userData.usdPrimvars[name];

    if (interpolation === 'constant') {
      this._mesh.userData.usdPrimvars ??= {};
      this._mesh.userData.usdPrimvars[name] = Array.from(values);
      this._geometry.deleteAttribute(attributeName);
    } else if (interpolation === 'facevarying') {
      this._geometry.setAttribute(attributeName, new BufferAttribute(values, itemSize));
    } else if (interpolation === 'vertex' || interpolation === 'varying') {
      this.updateTypedOrder(values, attributeName, itemSize);
    }
    this._interface.prepareMeshMaterialGeometry(this._mesh);
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
      this._invalidateGeneratedTangents();
      this._points = Float32Array.from(points);
      this.updateOrder(this._points, 'position');
      this._applyNormalStateForGeometry();
      if (this._constantTangent) {
        this._applyConstantTangent();
      } else if (this._tangents && (this._tangentInterpolation === 'vertex' || this._tangentInterpolation === 'varying')) {
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
      prepareVolumeProxyShadows(this._instancedMesh);
    }
    this._applyVisibilityState();
  }

}

let warningMessagesToCount = new Map();

/** @type {MeshPhysicalMaterial} */
let defaultMaterial;

class HydraMaterial {
  // Defaults from OpenUSD usdShaders/shaders/shaderDefs.usda. Hydra's network
  // payload can omit unauthored inputs even for a valid PreviewSurface terminal.
  static usdPreviewDefaults = {
    diffuseColor: [0.18, 0.18, 0.18],
    emissiveColor: [0, 0, 0],
    metallic: 0,
    roughness: 0.5,
    clearcoat: 0,
    clearcoatRoughness: 0.01,
    opacity: 1,
    opacityThreshold: 0,
    ior: 1.5,
  };

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
    'opacity': LinearSRGBColorSpace,
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
    this._syncRevision = 0;
    this._disposed = false;
    this._nodes = {};
    this._resolvedAssetPaths = new Map();
    this._materialXDocuments = [];
    this._mdlDocument = null;
    this._useMeshFallback = false;
    this._interface = hydraInterface;
    if (!defaultMaterial) {
      defaultMaterial = new MeshStandardMaterial({
        side: DoubleSide,
        color: new Color(0xf2f2f2),
        roughness: 0.65,
        metalness: 0,
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
    this._disposed = true;
    this._syncRevision++;
    const previous = this._material;
    // USD variant resync can retire a material before its replacement is ready.
    // Detach its textures from live/retired meshes before freeing GPU resources.
    this._useMeshFallback = true;
    for (const { mesh, materialIndex } of this._assignments) {
      this._applyMaterialToMesh(mesh, materialIndex);
      this._interface.rememberPendingMaterialAssignment(this._id, mesh, materialIndex);
    }
    this._assignments = [];
    disposeMaterialResources(previous);
    this._material = null;
  }

  _setMeshMaterialPending(mesh, pending) {
    mesh?.userData?.usdHydraSetMaterialPending?.(this._id, pending);
  }

  _applyMaterialToMesh(mesh, materialIndex) {
    const applyMaterialSide = mesh.userData?.usdHydraApplyMaterialSide;
    // The empty-path sprim is Hydra's shared fallback, not an authored surface.
    // Reapplying its assignments must retain each mesh's displayColor material.
    const sourceMaterial = this._id === '' || this._useMeshFallback
      ? mesh.userData.usdHydraFallbackMaterial?.() || defaultMaterial : this._material;
    const material = typeof applyMaterialSide === 'function'
      ? applyMaterialSide(sourceMaterial, this)
      : sourceMaterial;

    if (materialIndex === null || materialIndex === undefined) {
      mesh.material = material;
      this._setMeshMaterialPending(mesh, false);
      this._interface.prepareMeshMaterialGeometry(mesh);
      return;
    }

    if (Array.isArray(mesh.material)) {
      mesh.material[materialIndex] = material;
      this._setMeshMaterialPending(mesh, false);
      this._interface.prepareMeshMaterialGeometry(mesh);
      return;
    }

    mesh.material = material;
    this._setMeshMaterialPending(mesh, false);
    this._interface.prepareMeshMaterialGeometry(mesh);
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
    this._syncRevision++;
    this._ready = false;
    this._nodes = {};
    this._resolvedAssetPaths.clear();
    this._materialXDocuments = [];
    this._mdlDocument = null;
    this._useMeshFallback = false;
    if (!this._hasResolvedMaterial) {
      this._applyMaterialToAssignedMeshes();
    }
  }

  clearMaterial() {
    const previous = this._material;
    this.beginMaterialSync();
    this._useMeshFallback = true;
    this._ready = true;
    this._hasResolvedMaterial = true;
    this._material = defaultMaterial;
    this._applyMaterialToAssignedMeshes();
    disposeMaterialResources(previous);
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
    const missingNodeDefs = new Set(HydraMaterial.missingMaterialXNodeDefs(xml));
    // HdMtlx omits nodedef on a custom terminal node. Sdr's source-asset
    // identifier retains its authored subIdentifier, including that terminal.
    const customShaderPaths = [];
    for (const [path, node] of Object.entries(this._nodes)) {
      const custom = /<([^<>]+)><mtlx>$/.exec(String(node.identifier || ""));
      if (custom) {
        missingNodeDefs.add(custom[1]);
        customShaderPaths.push(path);
      }
    }
    if (!missingNodeDefs.size) return xml;

    const definitions = await materialXDefinitionsFor(this._interface.registry, [...missingNodeDefs], customShaderPaths);
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

  updateMdlMaterial(document) {
    this._mdlDocument = document;
    for (const [input, path] of Object.entries(document?.resolvedPaths || {})) {
      this._rememberResolvedAssetPath(document.inputs?.[input], path);
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
      'mirror': 1002, // MirroredRepeatWrapping
      'clamp_to_edge': 1001,
      'mirrored_repeat': 1002,
      'wrap_repeat': 1000,
      'wrap_clamp': 1001,
      'wrap_mirrored_repeat': 1002,
      10497: 1000,
      33071: 1001,
      33648: 1002,
    };

    const name = String(usdWrapMode).split('::').pop();
    if (typeof WRAPPINGS[name] === 'number')
      return WRAPPINGS[name];

    return RepeatWrapping;
  }

  /**
   * @return {Promise<void>}
   */
  async assignTexture(mainMaterial, parameterName, revision = this._syncRevision) {
    const slot = HydraMaterial.usdPreviewToMeshPhysicalTextureMap[parameterName];
    const connection = mainMaterial[parameterName];
    const node = connection?.nodeIn;
    if (!slot || !node) return;
    const file = this._resolveMaterialTexturePath(node.resolvedPath || node.resolvedUrl || node.file);
    if (!file) return;
    try {
      const channel = node.ignoreAlpha ? 'one' : connection.inputName;
      const targetChannel = node.ignoreAlpha ? 3 : { roughnessMap: 1, metalnessMap: 2, aoMap: 0, alphaMap: 1, clearcoatMap: 0, clearcoatRoughnessMap: 1 }[slot];
      const remapScalar = targetChannel !== undefined && (channel !== ['r', 'g', 'b', 'a'][targetChannel] || node.sampleTransform);
      const normalScale = [0, 1, 2].map(i => Number.isFinite(node.scale?.[i]) ? node.scale[i] : 1);
      const normalBias = [0, 1, 2].map(i => Number.isFinite(node.bias?.[i]) ? node.bias[i] : 0);
      const remapNormal = slot === 'normalMap' && (node.identifier === 'UsdUVTexture' || node.scale || node.bias)
        && (normalScale.some(value => value !== 2) || normalBias.some(value => value !== -1));
      const texture = await this._interface.registry.getTexture(file, !!(remapScalar || remapNormal));
      if (!texture || this._disposed || revision !== this._syncRevision || !this._material) return;
      // The base-color map already contributes its alpha; adding an alphaMap
      // here would square it. Resolve by authored source, independent of load order.
      if (slot === 'alphaMap' && channel === 'a' && !mainMaterial.diffuseColor?.nodeIn?.ignoreAlpha && node.file === mainMaterial.diffuseColor?.nodeIn?.file) {
        if (!this._material.alphaClip) this._material.transparent = true;
        connection.loaded = true;
        return;
      }
      const convert = texture => {
        let cloned = texture.clone();
        const target = node.ignoreAlpha ? 3 : { roughnessMap: 1, metalnessMap: 2, aoMap: 0, alphaMap: 1, clearcoatMap: 0, clearcoatRoughnessMap: 1 }[slot];
        if (target !== undefined && (channel !== ['r', 'g', 'b', 'a'][target] || node.sampleTransform || (!texture.isCompressedTexture && texture.format !== RGBAFormat))) {
          // A clone initially shares its Source with the cached texture. Replacing
          // source avoids corrupting other maps that use a different channel.
          cloned.source = new THREE.Source(remapTextureSamples(texture.image, channel, target, node.sampleTransform,
            { type: texture.type, format: texture.format }));
        }
        if (slot === 'normalMap' && (node.identifier === 'UsdUVTexture' || node.scale || node.bias)) {
          // UsdUVTexture defaults to identity, while common normal maps explicitly
          // author scale=2 and bias=-1. MDL lookup nodes use their own normal contract.
          const scale = [0, 1, 2].map(i => Number.isFinite(node.scale?.[i]) ? node.scale[i] : 1);
          const bias = [0, 1, 2].map(i => Number.isFinite(node.bias?.[i]) ? node.bias[i] : 0);
          if (scale.some(value => value !== 2) || bias.some(value => value !== -1)) {
            const converted = remapNormalTextureSamples(texture.image, scale, bias, { type: texture.type, format: texture.format });
            if (converted.image.data && !texture.isDataTexture) cloned = new THREE.DataTexture().copy(texture);
            cloned.source = new THREE.Source(converted.image);
            cloned.type = converted.type;
            cloned.format = RGBAFormat;
          }
        }
        const authoredColorSpace = String(node.sourceColorSpace || '').toLowerCase();
        cloned.colorSpace = authoredColorSpace === 'srgb' ? SRGBColorSpace
          : ['raw', 'linear', 'lin_rec709'].includes(authoredColorSpace) ? LinearSRGBColorSpace
          : texture.userData?.usdKtx2 ? texture.colorSpace || LinearSRGBColorSpace
          : HydraMaterial.usdPreviewToColorSpaceMap[parameterName] || LinearSRGBColorSpace;
        if (target !== undefined && !cloned.isCompressedTexture) cloned.format = RGBAFormat;
        const uv = node.mdlUV || node.st?.nodeIn;
        if (uv) {
          const rotation = node.mdlUV ? uv.rotation : (uv.rotation || 0) / 180 * Math.PI;
          cloned.repeat.fromArray(uv.scale || [1, 1]);
          cloned.offset.fromArray(uv.translation || [0, 0]);
          cloned.rotation = rotation || 0;
          if (!node.mdlUV) {
            cloned.offset.y -= (1 - Math.cos(rotation)) * cloned.repeat.y;
            cloned.offset.x -= Math.sin(rotation) * cloned.repeat.x;
          }
          if (node.mdlUV) {
            const [sx, sy] = uv.scale;
            const [tx, ty] = uv.translation;
            const c = Math.cos(rotation), s = Math.sin(rotation);
            cloned.matrixAutoUpdate = false;
            // Conjugate glTF transforms with the MDL bottom-left UV origin.
            cloned.matrix.set(c * sx, -s * sy, uv.gltf ? tx + s * sy : tx,
              s * sx, c * sy, uv.gltf ? 1 - ty - c * sy : ty, 0, 0, 1);
          }
        }
        cloned.wrapS = this.convertWrap(node.wrapS);
        cloned.wrapT = this.convertWrap(node.wrapT);
        cloned.needsUpdate = true;
        return cloned;
      };
      const cloned = convert(texture);
      this._interface.registry.exportRecipes.set(cloned, async registry =>
        convert(await registry.getTexture(file, !!(remapScalar || remapNormal))));
      this._material[slot] = cloned;
      if (slot === 'metalnessMap') this._material.metalness = 1;
      if (slot === 'roughnessMap') this._material.roughness = 1;
      if (slot === 'emissiveMap') this._material.emissive.setRGB(1, 1, 1);
      if (slot === 'alphaMap' && !this._material.alphaClip) this._material.transparent = true;
      connection.loaded = true;
      this._material.needsUpdate = true;
    } catch (error) {
      if (!this._disposed && !this._interface.registry.httpAbort.signal.aborted) console.warn(`Error loading USD material texture '${file}'.`, error);
    }
  }

  assignProperty(mainMaterial, parameterName) {
    const name = HydraMaterial.usdPreviewToMeshPhysicalMap[parameterName];
    const parameter = mainMaterial[parameterName];
    const value = parameter?.nodeIn ? (parameter.loaded ? parameter.factor : parameter.fallback) : parameter;
    if (!name || value === undefined) return;
    if (Array.isArray(value)) this._material[name] = new Color().fromArray(value);
    else {
      this._material[name] = value;
      if (name === 'opacity' && value < 1) this._material.transparent = true;
      if (parameterName === 'opacityThreshold' && value > 0) {
        this._material.transparent = false;
        this._material.alphaClip = true;
      }
    }
  }

  updateFinished(type, relationships) {
    this._interface.diagnostics.materialUpdateFinished++;
    const promise = this._updateFinished(type, relationships);
    this._interface.trackMaterialUpdate(promise);
  }

  async _updateFinished(type, relationships) {
    const revision = this._syncRevision;
    const isCurrent = () => !this._disposed && revision === this._syncRevision;
    if (!isCurrent()) return;
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
      if (!isCurrent()) { disposeMaterialResources(materialXMaterial); return; }
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

    const previewSurfaceNode = Object.values(this._nodes).find(node => node.identifier === 'UsdPreviewSurface');
    const mdlPreview = this._mdlDocument ? mdlToPreview(this._mdlDocument) : null;
    if (this._mdlDocument && !mdlPreview && !previewSurfaceNode) {
      this._useMeshFallback = true;
      this._material = defaultMaterial;
      this._ready = true;
      this._hasResolvedMaterial = true;
      if (!this._interface.missingMaterialWarnings.has(this._id)) {
        this._interface.missingMaterialWarnings.add(this._id);
        this._interface.diagnostics.materialFallbacks++;
        if (this._interface.diagnostics.unsupportedMaterialIds.length < 20) this._interface.diagnostics.unsupportedMaterialIds.push(this._id);
        console.warn(`USD material '${this._id}' uses an unsupported MDL definition or connected expression; using the mesh fallback.`);
      }
      this._applyMaterialToAssignedMeshes();
      return;
    }

    // A universal PreviewSurface cannot encode OmniGlass transmission. Other
    // supported authored surfaces retain priority over MDL approximations.
    const mainMaterialNode = previewSurfaceNode && mdlPreview?.family !== 'OmniGlass'
      ? { ...HydraMaterial.usdPreviewDefaults, ...previewSurfaceNode }
      : mdlPreview?.main;
    const usingMdl = mainMaterialNode === mdlPreview?.main;

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
    const SurfaceMaterial = this._interface.config.webGpuSupport?.SurfaceMaterial || MeshPhysicalMaterial;
    this._material = new SurfaceMaterial({});
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

    // Assign material properties
    for (let key in HydraMaterial.usdPreviewToMeshPhysicalMap) {
      this.assignProperty(mainMaterialNode, key);
    }

    if (!usingMdl) {
      configurePreviewPrimvars(this._material, mainMaterialNode);
      this._interface.config.webGpuSupport?.configurePreviewPrimvars?.(this._material);
    }

    if (usingMdl) {
      const { normalScale, specularColor, ...settings } = mdlPreview.settings;
      Object.assign(this._material, settings);
      if (normalScale) this._material.normalScale.fromArray(normalScale);
      if (specularColor) this._material.specularColor.fromArray(specularColor);
      this._material.userData.usdMdlApproximation = mdlPreview.family;
      this._interface.diagnostics.mdlApproximations++;
    }

    // Publish the authored constants as soon as geometry is ready. Textures
    // refine the same material in place instead of hiding the whole mesh (and
    // every subset) behind the slowest image download.
    this._ready = true;
    this._hasResolvedMaterial = true;
    this._applyMaterialToAssignedMeshes();

    if (!disableTextures) {
      /** @type {Array<Promise<any>>} */
      const texturePromises = [];
      for (let key in HydraMaterial.usdPreviewToMeshPhysicalTextureMap) {
        texturePromises.push(this.assignTexture(mainMaterialNode, key, revision));
      }
      await Promise.all(texturePromises);

      // Each slot already reads its converted channel and keeps its own UV/sampler state.
    }

    if (!isCurrent()) return;
    for (const key in HydraMaterial.usdPreviewToMeshPhysicalMap) {
      this.assignProperty(mainMaterialNode, key);
    }
    if (!usingMdl) {
      configurePreviewPrimvars(this._material, mainMaterialNode);
      this._interface.config.webGpuSupport?.configurePreviewPrimvars?.(this._material);
    }
    this._material.needsUpdate = true;
    this._applyMaterialToAssignedMeshes();
    this._interface.config.requestRender?.();
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
      const materialName = this._id.split('/').pop() || this._id;
      const materialNodeNameOrIndex = materialXDocument.materialName || materialName || 0;
      xml = await this._withAuthoredMaterialXDefinitions(xml);
      if (hasMaterialXVolume(xml)) {
        const volumeFactory = this._interface.config.materialXVolumeFactory;
        if (typeof volumeFactory !== 'function') {
          throw new Error('MaterialX bounded volumes require the optional @needle-tools/usd/volumes entry. Import createMaterialXVolumeMaterial and pass it as materialXVolumeFactory, with a compatible WebGPURenderer.');
        }
        const volume = await volumeFactory(xml, materialNodeNameOrIndex, {
          renderer: this._interface.config.renderer,
          getTexture: async (url) => {
            const texturePath = this._resolveMaterialTexturePath(url);
            return texturePath ? this._interface.registry.getTexture(texturePath) : null;
          },
        });
        volume.name = materialName;
        this._interface.diagnostics.materialXCreateSuccess++;
        return volume;
      }
      if (this._interface.config.webGpuSupport) {
        const material = await this._interface.config.webGpuSupport.createMaterialXMaterial(xml, materialNodeNameOrIndex, {
          renderer: this._interface.config.renderer,
          getTexture: async url => {
            const path = this._resolveMaterialTexturePath(url);
            return path ? this._interface.registry.getTexture(path) : null;
          },
        });
        material.name = materialName;
        this._interface.diagnostics.materialXCreateSuccess++;
        return material;
      }
      const { MaterialX, MaterialXMaterial, MaterialXEnvironment } = await getMaterialXModule();
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

      // Register only after the package was already loaded for an authored material.
      this._interface.materialXEnvironmentClass = MaterialXEnvironment;
      this._interface.refreshMaterialXLighting();
      configureMaterialXPrimvars(material);
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
    this.includedRenderTags = new Set((config.includedPurposes?.length ? config.includedPurposes : ['default', 'render']).map(purpose => purpose === 'default' ? 'geometry' : purpose));
    this.retiredMeshes = new Map();
    this.retiredMeshReleaseFrames = new Map();
    this.hydraDrawDepth = 0;
    this.scenePrimitives = {};
    this.helperPrimitives = new Set();
    this.selectedHelperPaths = new Set();
    this.pendingMaterialUpdates = new Set();
    this.pendingRprimUpdates = new Set();
    this.pendingMaterialAssignments = new Map();
    this.missingMaterialWarnings = new Set();
    this.sparkRenderer = null;
    this.sparkRendererRecord = null;
    this.particleSortingMode = null;
    this.unsupportedParticleProjectionWarnings = new Set();
    this.diagnostics = {
      materialSPrims: 0,
      sceneSPrims: 0,
      materialAssignments: 0,
      materialFallbacks: 0,
      mdlApproximations: 0,
      unsupportedMaterialIds: [],
      materialNodes: 0,
      materialUpdateFinished: 0,
      materialXDocuments: 0,
      materialXSkippedNoDocuments: 0,
      materialXCreateAttempts: 0,
      materialXCreateSuccess: 0,
      materialXCreateFailures: 0,
      materialIds: [],
      scenePrimitiveIds: [],
      particleFields: 0,
    };
  }

  get helpers() { return viewportHelpers(this.config); }

  setHelpers(settings) {
    const next = viewportHelpers(this.config);
    for (const kind of helperKinds) if (typeof settings?.[kind] === 'boolean') next[kind] = settings[kind];
    this.config.helpers = next;
    for (const primitive of this.helperPrimitives) primitive.updateHelpers();
    this.config.requestRender?.();
  }

  isHelperSelected(path, selection = this.selectedHelperPaths) {
    for (let current = path; current; current = current.slice(0, current.lastIndexOf('/'))) {
      if (selection.has(current)) return true;
    }
    return selection.has('/');
  }

  helpersFor(path) {
    const settings = this.helpers;
    if (this.isHelperSelected(path)) for (const kind of helperKinds) settings[kind] = true;
    return settings;
  }

  setHelperSelection(paths) {
    const next = new Set(Array.from(paths || []).filter(path => typeof path === 'string' && path.startsWith('/'))
      .map(path => path.length > 1 ? path.replace(/\/+$/, '') : path));
    const previous = this.selectedHelperPaths;
    if (next.size === previous.size && [...next].every(path => previous.has(path))) return;
    this.selectedHelperPaths = next;
    for (const primitive of this.helperPrimitives) {
      if (this.isHelperSelected(primitive._id, previous) !== this.isHelperSelected(primitive._id, next)) primitive.updateHelpers();
    }
    this.config.requestRender?.();
  }

  isRenderTagIncluded(tag = 'geometry') {
    return tag !== 'hidden' && this.includedRenderTags.has(tag);
  }

  setIncludedPurposes(purposes) {
    this.includedRenderTags = new Set((purposes?.length ? purposes : ['default', 'render'])
      .map(purpose => purpose === 'default' ? 'geometry' : purpose));
    // Hydra filters future syncs; retained Three objects also need filtering.
    // Keep the authored visibility separate so re-including a purpose restores it.
    for (const prim of Object.values(this.meshes)) prim._applyVisibilityState();
    for (const retired of this.retiredMeshes.values()) for (const prim of retired) prim._applyVisibilityState();
  }

  cancelPendingTextureLoads() { this.registry.httpAbort.abort(); }

  trackMaterialUpdate(promise) {
    this.pendingMaterialUpdates.add(promise);
    const remove = () => this.pendingMaterialUpdates.delete(promise);
    promise.then(remove, remove);
  }

  prepareMeshMaterialGeometry(mesh) {
    if (!mesh?.geometry) return;
    prepareVolumeProxyShadows(mesh);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const primvarAttributes = new Set(materials.flatMap(material =>
      material?.userData?.usdPreviewPrimvars?.map(binding => binding.attribute) || []));
    for (const name of Object.keys(mesh.geometry.attributes)) {
      if ((name.startsWith('usdPrimvar_') && !primvarAttributes.has(name)) || name.startsWith('i_geomprop_')) {
        mesh.geometry.deleteAttribute(name);
      }
    }
    for (const material of materials) {
      this.config.webGpuSupport?.prepareMaterial?.(material);
      preparePreviewPrimvars(material, mesh);
      prepareMaterialXPrimvars(material, mesh);
      const promise = prepareMaterialXMaterialForGeometry(material, mesh.geometry);
      if (promise) this.trackMaterialUpdate(promise);
    }
  }

  async waitForMaterialsReady() {
    while (this.pendingMaterialUpdates.size > 0) {
      await Promise.allSettled([...this.pendingMaterialUpdates]);
    }
  }

  trackRprimUpdate(promise) {
    this.pendingRprimUpdates.add(promise);
    const remove = () => this.pendingRprimUpdates.delete(promise);
    promise.then(remove, remove);
  }

  prepareAreaLights() {
    if (!this.areaLightsReady) {
      this.areaLightsReady = (async () => {
        const support = this.config.webGpuSupport;
        if (support?.prepareAreaLights) await support.prepareAreaLights();
        else await prepareWebGlAreaLights();
        this.areaLightsPrepared = true;
        if (!this.registry.disposed) this.config.requestRender?.();
      })();
      // Retain failures for readiness, including imports that reject before Draw finishes.
      void this.areaLightsReady.catch(() => {});
    }
    return this.areaLightsReady;
  }

  async waitForRprimsReady() {
    const failures = [];
    while (this.pendingRprimUpdates.size > 0) {
      const results = await Promise.allSettled([...this.pendingRprimUpdates]);
      for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
    }
    // One rejected factory must not release the driver while another still reads.
    if (failures.length) throw failures[0];
    if (this.areaLightsReady) await this.areaLightsReady;
  }

  ensureSparkRenderer(spark, sortingModeHint) {
    if (!this.config.renderer?.isWebGLRenderer) {
      throw new Error('Rendering a USD particleField requires createThreeHydra({ renderer }) with the host THREE.WebGLRenderer');
    }
    if (!this.sparkRenderer) {
      const renderScene = this.config.renderScene || this.config.usdRoot;
      let record = sparkRendererRecords.get(renderScene);
      if (!record) {
        let renderer = null;
        renderScene.traverse?.(object => {
          if (!renderer && object instanceof spark.SparkRenderer) renderer = object;
        });
        const owned = !renderer;
        const Timer = Reflect.get(THREE, 'Timer');
        const timer = owned && Timer ? new Timer() : undefined;
        renderer ??= new spark.SparkRenderer({
          renderer: this.config.renderer,
          onDirty: this.config.requestRender,
          timer,
        });
        if (owned) {
          renderer.name = '__usd_spark_renderer';
          renderer.userData.usdParticleFieldRenderer = true;
          renderer.userData.usdExcludeFromBounds = true;
          renderScene.add(renderer);
        }
        record = { renderer, timer, owned, references: 0 };
        sparkRendererRecords.set(renderScene, record);
      }
      record.references++;
      this.sparkRendererRecord = record;
      this.sparkRenderer = record.renderer;
    }
    const sortingMode = String(sortingModeHint || 'zDepth');
    if (this.particleSortingMode && this.particleSortingMode !== sortingMode) {
      console.warn(`USD particleFields use different sortingModeHint values (${this.particleSortingMode}, ${sortingMode}); Spark applies one sorting mode per renderer`);
    }
    this.particleSortingMode = sortingMode;
    return this.sparkRenderer;
  }

  warnUnsupportedParticleProjection(projectionModeHint, id) {
    const key = `${projectionModeHint}:${id}`;
    if (this.unsupportedParticleProjectionWarnings.has(key)) return;
    this.unsupportedParticleProjectionWarnings.add(key);
    console.warn(`USD particleField ${id} requests projectionModeHint=${projectionModeHint}; Spark currently renders perspective projection`);
  }

  getDiagnostics() {
    return { ...this.diagnostics };
  }

  /** Points render one glyph per point per USD instance; Hydra indexes parents. */
  getInstanceStride(path) {
    const mesh = this.meshes[path]?._mesh;
    return mesh?.userData.usdPrimitiveType === 'points' ? Math.max(1, mesh.userData.usdPointCount || 0) : 1;
  }

  /**
   * Render Prims. See webRenderDelegate.h and webRenderDelegate.cpp
   * @param {string} typeId // translated from TfToken
   * @param {string} id // SdfPath.GetAsString()
   * @param {*} instancerId
   * @returns 
   */
  createRPrim(typeId, id, instancerId) {
    if (typeId === 'volume') {
      const volume = new VdbVolumeRprim(id, this);
      this.meshes[id] = volume;
      return volume;
    }
    if (debugPrims) console.log('Creating RPrim: ', typeId, id, typeof id);
    const existing = this.meshes[id];
    if (existing) {
      this.helperPrimitives.delete(existing);
      this._retireRPrim(id, existing, false);
      delete this.meshes[id];
    }
    this._cancelRetiredRPrimRelease(id);
    const mesh = typeId === 'particleField'
      ? new HydraParticleField(id, this)
      : typeId === 'points' || typeId === 'basisCurves'
        ? new HydraStroke(typeId, id, this)
        : typeId === 'nurbsPatch' ? new HydraNurbsPatch(id, this) : new HydraMesh(id, this);
    this.meshes[id] = mesh;
    if (mesh.updateHelpers) this.helperPrimitives.add(mesh);
    if (typeId === 'particleField') this.diagnostics.particleFields++;
    return mesh;
  }

  refreshMaterialXLighting() {
    if (!this.materialXEnvironmentClass || this.registry.disposed) return;
    let scene = this.config.renderScene || this.config.usdRoot;
    while (!scene.isScene && scene.parent) scene = scene.parent;
    if (scene.isScene) this.materialXEnvironmentClass.get(scene)?.refreshLights();
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

    // An MDL-only binding (or another unsupported shader context) may never
    // create a Hydra material sprim. Waiting for it would hide valid geometry
    // forever. Only settle missing sprims after the whole draw; supported
    // materials can still be loading asynchronously and retain their barrier.
    for (const [materialId, assignments] of this.pendingMaterialAssignments) {
      if (!assignments.size) { this.pendingMaterialAssignments.delete(materialId); continue; }
      if (this.materials[materialId]) continue;
      for (const mesh of assignments.keys()) {
        mesh.userData?.usdHydraSetMaterialPending?.(materialId, false);
      }
      if (!this.missingMaterialWarnings.has(materialId)) {
        this.missingMaterialWarnings.add(materialId);
        this.diagnostics.materialFallbacks++;
        if (this.diagnostics.unsupportedMaterialIds.length < 20) {
          this.diagnostics.unsupportedMaterialIds.push(materialId);
        }
        console.warn(`USD material '${materialId}' has no supported Hydra surface; using the mesh fallback.`);
      }
    }


  }

  destroyRPrim(id) {
    if (debugPrims) console.log('Destroying RPrim: ', id);
    const mesh = this.meshes[id];
    if (!mesh) return;
    delete this.meshes[id];
    this.helperPrimitives.delete(mesh);
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
      this.helperPrimitives.add(scenePrimitive);
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
      this.helperPrimitives.delete(scenePrimitive);
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
    if (this.sparkRenderer) {
      const renderScene = this.config.renderScene || this.config.usdRoot;
      const record = this.sparkRendererRecord;
      if (record) {
        record.references--;
        if (record.references === 0) {
          if (record.owned) {
            record.renderer.parent?.remove(record.renderer);
            record.renderer.dispose();
            record.timer?.dispose();
          }
          sparkRendererRecords.delete(renderScene);
        }
      }
      this.sparkRenderer = null;
      this.sparkRendererRecord = null;
    }
    this.registry.dispose();
    this.pendingMaterialUpdates.clear();
    this.pendingRprimUpdates.clear();
    this.pendingMaterialAssignments.clear();
    this.missingMaterialWarnings.clear();
  }

  rememberPendingMaterialAssignment(materialId, mesh, materialIndex = null) {
    if (!materialId || !mesh) return;
    mesh.userData?.usdHydraSetMaterialPending?.(materialId, true);
    let assignments = this.pendingMaterialAssignments.get(materialId);
    if (!assignments) {
      assignments = new Map();
      this.pendingMaterialAssignments.set(materialId, assignments);
    }
    let indices = assignments.get(mesh);
    if (!indices) assignments.set(mesh, indices = new Set());
    indices.add(materialIndex);
  }

  applyPendingMaterialAssignments(materialId) {
    const material = this.materials[materialId];
    const assignments = this.pendingMaterialAssignments.get(materialId);
    if (!material || !assignments) return;
    for (const [mesh, indices] of assignments) {
      for (const index of indices) material.assignToMesh(mesh, index);
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
      if (!meshes.size) this.pendingMaterialAssignments.delete(materialId);
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
