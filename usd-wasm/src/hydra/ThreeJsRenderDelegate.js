import { TextureLoader, BufferGeometry, MeshPhysicalMaterial, DoubleSide, Color, Mesh, InstancedMesh, Matrix4, Float32BufferAttribute, SRGBColorSpace, RGBAFormat, RepeatWrapping, LinearSRGBColorSpace, Vector2, CameraHelper, DirectionalLight, DirectionalLightHelper, HemisphereLight, OrthographicCamera, PerspectiveCamera, PointLight, PointLightHelper, MathUtils } from 'three';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const debugTextures = false;
const debugMaterials = false;
const debugMeshes = false;
const debugPrims = false;
const disableTextures = false;
const disableMaterials = false;

let materialXModulePromise = null;

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
    this.disposed = false;
    this.loader = new TextureLoader();
    this.tgaLoader = new TGALoader();
    this.exrLoader = new EXRLoader();

    // HACK get URL ?file parameter again
    let urlParams = new URLSearchParams(window.location.search);
    let fileParam = urlParams.get('file');
    if (fileParam) {
      let lastSlash = fileParam.lastIndexOf('/');
      if (lastSlash >= 0)
        fileParam = fileParam.substring(0, lastSlash);
      this.baseUrl = fileParam;
    }
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

  readResolvedResource(resourcePath) {
    if (!resourcePath?.startsWith("/") || typeof this.config.USD?.ReadFile !== "function") {
      return null;
    }

    try {
      const file = this.config.USD.ReadFile(resourcePath);
      return file?.byteLength ? file : null;
    }
    catch {
      return null;
    }
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
      console.warn("EXR textures are not fully supported yet", resourcePath);
      // using EXRLoader explicitly
      filetype = 'image/x-exr';
    } else if (extension === 'tga') {
      console.warn("TGA textures are not fully supported yet", resourcePath);
      // using TGALoader explicitly
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

    const baseUrl = this.baseUrl;
    const loadFromFile = (_loadedFile) => {
      let url = undefined;
      if (debugTextures) console.log("window.driver.getFile", resourcePath, " => ", _loadedFile);
      if (_loadedFile) {
        let blob = new Blob([_loadedFile.slice(0)], { type: filetype });
        url = URL.createObjectURL(blob);
        this.objectUrls.add(url);
      } else {
        if (baseUrl)
          url = baseUrl + '/' + resourcePath;
        else
          url = resourcePath;
      }
      if (debugTextures) console.log("Loading texture from", url, "with loader", loader, "_loadedFile", _loadedFile, "baseUrl", baseUrl, "resourcePath", resourcePath);
      // Load the texture
      loader.load(
        // resource URL
        url,

        // onLoad callback
        (texture) => {
          if (url?.startsWith('blob:')) {
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
          if (url?.startsWith('blob:')) {
            URL.revokeObjectURL(url);
            this.objectUrls.delete(url);
          }
          textureReject(err);
        }
      );
    };

    const resolvedFile = this.readResolvedResource(resourcePath);
    if (resolvedFile) {
      loadFromFile(resolvedFile);
      return this.textures[resourcePath];
    }

    this.config.driver().getFile(resourcePath, async (loadedFile) => {
      if (!loadedFile) {
        // if the file is not part of the filesystem, we can still try to fetch it from the network
        if (baseUrl) {
          console.log("File not found in filesystem, trying to fetch", resourcePath);
        }
        else {
          textureReject(new Error('Unknown file: ' + resourcePath));
          return;
        }
      }

      loadFromFile(loadedFile);
    });

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
    this._normals = undefined;
    this._tangents = undefined;
    this._colors = undefined;
    this._uvs = undefined;
    this._indices = undefined;
    this._materials = [];
    this._visible = false;
    this._renderTag = 'geometry';
    this._instancedMesh = null;
    this._instanceMatrix = new Matrix4();

    let material = new MeshPhysicalMaterial({
      side: DoubleSide,
      color: new Color(0xB4B4B4),
      // envMap: hydraInterface.config.envMap,
    });
    this._ownedMaterial = material;
    this._materials.push(material);
    this._mesh = new Mesh(this._geometry, material);
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
    if (this._mesh.parent) {
      this._mesh.parent.remove(this._mesh);
    }
    this._geometry.dispose();
    disposeMaterialResources(this._ownedMaterial);
    this._ownedMaterial = null;
    this._mesh = null;
  }

  updateOrder(attribute, attributeName, dimension = 3) {
    if (debugMeshes) console.log("updateOrder", attribute, attributeName, dimension);
    if (attribute && this._indices) {
      let values = [];
      for (let i = 0; i < this._indices.length; i++) {
        let index = this._indices[i]
        for (let j = 0; j < dimension; ++j) {
          values.push(attribute[dimension * index + j]);
        }
      }
      this._geometry.setAttribute(attributeName, new Float32BufferAttribute(values, dimension));
      if (attributeName === 'position') {
        this._geometry.computeBoundingBox();
        this._geometry.computeBoundingSphere();
      }
    }
  }

  updateIndices(indices) {
    if (debugMeshes) console.log("updateIndices", indices);
    this._indices = [];
    for (let i = 0; i < indices.length; i++) {
      this._indices.push(indices[i]);
    }
    //this._geometry.setIndex( indicesArray );
    this.updateOrder(this._points, 'position');
    this.updateOrder(this._normals, 'normal');
    if (this._colors) {
      this.updateOrder(this._colors, 'color');
    }
    if (this._uvs) {
      this.updateOrder(this._uvs, 'uv', 2);
      this._geometry.attributes.uv2 = this._geometry.attributes.uv;
    }
  }

  /**
   * Sets the transform of the mesh.
   * @param {Iterable<number>} matrix - The 4x4 matrix to set on the mesh.
   */
  setTransform(matrix) {
    this._mesh.matrix.set(...matrix);
    this._mesh.matrix.transpose();
    this._mesh.matrixAutoUpdate = false;
  }

  setInstanceTransforms(matrices, count = 0) {
    if (!this._mesh) return;
    const instanceCount = Number(count) || 0;
    if (instanceCount <= 0) {
      this._disposeInstancedMesh();
      this._mesh.visible = this._visible && this._renderTag !== 'hidden';
      return;
    }

    if (!this._instancedMesh || this._instancedMesh.count !== instanceCount) {
      this._disposeInstancedMesh();
      this._instancedMesh = new InstancedMesh(this._geometry, this._mesh.material, instanceCount);
      this._instancedMesh.name = `${this._mesh.name}_instances`;
      this._instancedMesh.castShadow = this._mesh.castShadow;
      this._instancedMesh.receiveShadow = this._mesh.receiveShadow;
      this._instancedMesh.matrixAutoUpdate = false;
      this._instancedMesh.userData.usdPath = this._id;
      this._instancedMesh.userData.usdInstanced = true;
      this._interface.config.usdRoot.add(this._instancedMesh);
    }

    this._instancedMesh.material = this._mesh.material;
    this._instancedMesh.visible = this._visible && this._renderTag !== 'hidden';
    this._instancedMesh.userData.usdRenderTag = this._renderTag;
    this._mesh.visible = false;

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

  setVisibilityState(visible, renderTag = 'geometry') {
    this._visible = Boolean(visible);
    this._renderTag = String(renderTag || 'geometry');
    if (this._mesh) {
      this._mesh.visible = !this._instancedMesh && this._visible && this._renderTag !== 'hidden';
      this._mesh.userData.usdRenderTag = this._renderTag;
    }
    if (this._instancedMesh) {
      this._instancedMesh.visible = this._visible && this._renderTag !== 'hidden';
      this._instancedMesh.userData.usdRenderTag = this._renderTag;
    }
  }

  /**
   * Sets automatically generated normals on the mesh. Should only be used if there are no authored normals.
   * @param {} normals 
   */
  updateNormals(normals) {
    // don't apply automatically generated normals if there are already authored normals.
    if (this._geometry.hasAttribute('normal')) return;

    this._normals = normals.slice(0);
    this.updateOrder(this._normals, 'normal');
  }

  setNormals(data, interpolation) {
    if (interpolation === 'facevarying') {
      // The UV buffer has already been prepared on the C++ side, so we just set it
      this._geometry.setAttribute('normal', new Float32BufferAttribute(data, 3));
    } else if (interpolation === 'vertex') {
      // We have per-vertex UVs, so we need to sort them accordingly
      this._normals = data.slice(0);
      this.updateOrder(this._normals, 'normal');
    }
  }

  setTangents(data, dimension, interpolation) {
    if (interpolation === 'facevarying') {
      this._geometry.setAttribute('tangent', new Float32BufferAttribute(data, dimension));
    } else if (interpolation === 'vertex') {
      this._tangents = data.slice(0);
      this.updateOrder(this._tangents, 'tangent', dimension);
    }
  }

  // This is always called before prims are updated
  setMaterial(materialId) {
    if (debugMaterials) console.log('Setting material on hydra prim: ' + materialId, this._mesh, materialId, this._interface.materials[materialId]);
    const hydraMaterial = this._interface.materials[materialId];
    if (hydraMaterial) {
      hydraMaterial.assignToMesh(this._mesh);
    }
    else {
      console.error("Material not found", materialId, this._interface.materials);
    }
  }

  setGeomSubsetMaterial(sections) {
    //console.log("setting subset material: ", this._id, sections)

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
    this.setVisibilityState(this._visible, this._renderTag);
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
      wasDefaultMaterial = true;
    }

    this._colors = null;

    if (interpolation === 'constant') {
      this._mesh.material.color = new Color().fromArray(data);
    } else if (interpolation === 'vertex') {
      // Per-vertex buffer attribute
      this._mesh.material.vertexColors = true;
      if (wasDefaultMaterial) {
        // Reset the pink debugging color
        this._mesh.material.color = new Color(0xffffff);
      }
      this._colors = data.slice(0);
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
    } else if (interpolation === 'vertex') {
      // We have per-vertex UVs, so we need to sort them accordingly
      this._uvs = data.slice(0);
      this.updateOrder(this._uvs, 'uv', 2);
    }

    if (this._geometry.hasAttribute('uv'))
      this._geometry.attributes.uv2 = this._geometry.attributes.uv;
  }

  updatePrimvar(name, data, dimension, interpolation) {
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
        break;
      default:
        if (warningMessagesToCount.has(name)) {
          warningMessagesToCount.set(name, warningMessagesToCount.get(name) + 1);
        }
        else {
          warningMessagesToCount.set(name, 1);
          console.warn('Unsupported primvar: ', name);
        }
    }
  }

  updatePoints(points) {
    this._points = points.slice(0);
    this.updateOrder(this._points, 'position');
  }

  commit() {
    if (this._instancedMesh && this._mesh) {
      this._instancedMesh.material = this._mesh.material;
    }
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
    this._interface.diagnostics.materialSPrims++;

    if (debugMaterials) console.log("Hydra Material", this)
  }

  assignToMesh(mesh, materialIndex = null) {
    this._interface.diagnostics.materialAssignments++;
    const existing = this._assignments.find(assignment => assignment.mesh === mesh && assignment.materialIndex === materialIndex);
    if (!existing) {
      this._assignments.push({ mesh, materialIndex });
    }
    this._applyMaterialToMesh(mesh, materialIndex);
  }

  unassignMesh(mesh) {
    this._assignments = this._assignments.filter(assignment => assignment.mesh !== mesh);
  }

  dispose() {
    this._assignments = [];
    disposeMaterialResources(this._material);
    this._material = null;
  }

  _applyMaterialToMesh(mesh, materialIndex) {
    if (materialIndex === null || materialIndex === undefined) {
      mesh.material = this._material;
      return;
    }

    if (Array.isArray(mesh.material)) {
      mesh.material[materialIndex] = this._material;
      return;
    }

    mesh.material = this._material;
  }

  _applyMaterialToAssignedMeshes() {
    for (const assignment of this._assignments) {
      this._applyMaterialToMesh(assignment.mesh, assignment.materialIndex);
    }
  }

  beginMaterialSync() {
    this._nodes = {};
    this._resolvedAssetPaths.clear();
    this._materialXDocuments = [];
  }

  static canonicalAssetPath(path) {
    return String(path ?? "")
      .replace(/\\/g, "/")
      .replace(/^\/+(?=\.?\/)/, "")
      .replace(/^(?:\.\/)+/, "")
      .replace(/\/\.\//g, "/");
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
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(authored)) {
      return authored;
    }

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

    return "";
  }

  updateNode(networkId, path, parameters) {
    if (debugTextures) console.log('Updating Material Node: ' + networkId + ' ' + path, parameters);
    this._interface.diagnostics.materialNodes++;
    this._nodes[path] = parameters;
    this._rememberResolvedAssetPath(parameters?.file, parameters?.resolvedPath);
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
        const textureFileName = this._resolveMaterialTexturePath(nodeIn.resolvedPath || nodeIn.file);
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

        this._interface.registry.getTexture(textureFileName).then(texture => {
          if (!this._material) {
            console.error("Material not set when trying to assign texture, this is likely a bug");
            resolve();
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

    const packedTexture = sourceTexture.clone();
    packedTexture.image = canvas;
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
        aoMap,
        roughnessMap,
        metalnessMap,
      });
      return;
    }

    const packedMap = HydraMaterial._packMetallicRoughnessMap({ aoMap, roughnessMap, metalnessMap });
    if (!packedMap) {
      console.error("Something went wrong while packing occlusion/metallic/roughness textures.", {
        aoMap,
        roughnessMap,
        metalnessMap,
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
        this._applyMaterialToAssignedMeshes();
        return;
      }
      this._material = materialXMaterial;
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

    const xml = materialXDocument?.xml;
    if (!xml) {
      return null;
    }

    try {
      const { MaterialX, MaterialXMaterial } = await getMaterialXModule();
      const materialName = this._id.split('/').pop() || this._id;
      const materialNodeNameOrIndex = materialXDocument.materialName || materialName || 0;
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
    this.scenePrimitives = {};
    this.pendingMaterialUpdates = new Set();
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
    this.destroyRPrim(id);
    let mesh = new HydraMesh(id, this);
    this.meshes[id] = mesh;
    return mesh;
  }

  destroyRPrim(id) {
    if (debugPrims) console.log('Destroying RPrim: ', id);
    const mesh = this.meshes[id];
    if (!mesh) return;
    mesh.dispose();
    delete this.meshes[id];
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
    for (const id of Object.keys(this.materials)) {
      this.destroySPrim(id);
    }
    for (const id of Object.keys(this.scenePrimitives)) {
      this.destroySPrim(id);
    }
    this.registry.dispose();
    this.pendingMaterialUpdates.clear();
  }

  unassignMeshFromMaterials(mesh) {
    for (const material of Object.values(this.materials)) {
      material.unassignMesh(mesh);
    }
  }

  CommitResources() {
    for (const id in this.meshes) {
      const hydraMesh = this.meshes[id]
      hydraMesh.commit();
    }
  }
}
