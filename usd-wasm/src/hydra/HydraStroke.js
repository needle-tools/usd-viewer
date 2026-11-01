import { BufferGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, SphereGeometry } from 'three';
import { buildStrokeCurveGeometry, pointStrokeSamples } from './strokeGeometry.js';
import { disposeHelper, strokeHelpers, viewportHelpers } from './primitiveHelpers.js';

/** World-space point diameters and tessellated curve widths, independent of mesh topology. */
export class HydraStroke {
    constructor(type, id, delegate) {
        this._type = type; this._id = id; this._interface = delegate;
        this._visible = false; this._pending = new Set(); this._transform = new Matrix4();
        this._helpers = []; this._instanceTransforms = null; this._data = null; this._pointSamples = [];
        this._geometry = type === 'points' ? new SphereGeometry(0.5, 12, 8) : new BufferGeometry();
        this._ownedMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.65, vertexColors: type !== 'points' });
        this._materialClones = new Map();
        this._mesh = new InstancedMesh(this._geometry, this._ownedMaterial, 0);
        this._mesh.name = id.slice(id.lastIndexOf('/') + 1);
        this._mesh.visible = false; this._mesh.castShadow = true; this._mesh.receiveShadow = true;
        this._mesh.matrixAutoUpdate = false;
        Object.assign(this._mesh.userData, {
            usdPath: id, usdPrimitiveType: type,
            usdHydraFallbackMaterial: () => this._ownedMaterial,
            usdHydraApplyMaterialSide: material => this._prepareMaterial(material),
            usdHydraSetMaterialPending: (id, pending) => {
                if (pending) this._pending.add(id); else this._pending.delete(id);
                this._applyVisibilityState();
            },
        });
        delegate.config.usdRoot.add(this._mesh);
        this._prepareMaterial(this._ownedMaterial);
    }
    _prepareMaterial(source) {
        // Opacity attributes belong to the primitive, not a globally shared surface.
        let material = source;
        if (source !== this._ownedMaterial) {
            material = this._materialClones.get(source);
            if (!material) { material = source.clone(); this._materialClones.set(source, material); }
            else material.copy(source);
        }
        const original = source.onBeforeCompile;
        const originalCacheKey = source.customProgramCacheKey.bind(source);
        material.onBeforeCompile = (shader, renderer) => {
            original.call(source, shader, renderer);
            shader.vertexShader = `attribute float strokeOpacity;\nvarying float vStrokeOpacity;\n${shader.vertexShader}`
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStrokeOpacity = strokeOpacity;');
            shader.fragmentShader = `varying float vStrokeOpacity;\n${shader.fragmentShader}`
                .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vStrokeOpacity;');
        };
        material.customProgramCacheKey = () => `usd-stroke-opacity:${source.uuid}:${originalCacheKey()}`;
        material.userData.usdStrokeBaseTransparent = !!source.transparent;
        material.transparent = source.transparent || !!this._hasTransparency;
        this._interface.config.webGpuSupport?.configureStrokeMaterial?.(material);
        material.needsUpdate = true;
        return material;
    }
    _buildGeometry(data) { return buildStrokeCurveGeometry(data); }
    setStrokeData(data) {
        this._data = data;
        this._mesh.userData.usdStrokeData = data;
        try {
            if (this._type === 'points') this._pointSamples = pointStrokeSamples(data);
            else {
                const geometry = this._buildGeometry(data);
                this._geometry.dispose(); this._geometry = geometry; this._mesh.geometry = geometry;
            }
            delete this._mesh.userData.usdStrokeError;
        } catch (error) {
            // Invalid authored geometry must not throw across the native Sync callback.
            this._mesh.userData.usdStrokeError = error.message;
            this._pointSamples = [];
            if (this._type !== 'points') {
                this._geometry.dispose(); this._geometry = new BufferGeometry(); this._mesh.geometry = this._geometry;
            }
            console.warn(`Unable to render USD ${this._type} '${this._id}': ${error.message}`);
        }
        this._hasTransparency = this._type === 'points'
            ? this._pointSamples.some(sample => sample.opacity < 1)
            : Array.from(this._geometry.attributes.strokeOpacity?.array || []).some(value => value < 1);
        this._mesh.material.transparent = this._mesh.material.userData.usdStrokeBaseTransparent || !!this._hasTransparency;
        this._mesh.material.needsUpdate = true;
        this._updateInstances();
    }
    setMaterial(id) {
        this._interface.unassignMeshFromMaterials(this._mesh);
        if (!id) { this._mesh.material = this._ownedMaterial; return; }
        const material = this._interface.materials[id];
        if (material) material.assignToMesh(this._mesh);
        else this._interface.rememberPendingMaterialAssignment(id, this._mesh);
    }
    setTransform(values) {
        this._transform.fromArray(values);
        this._updateInstances();
    }
    setInstanceTransforms(values, count, instanced = count > 0) {
        this._instanceTransforms = instanced
            ? Array.from({ length: count }, (_, index) => new Matrix4().fromArray(values, index * 16)) : null;
        this._updateInstances();
    }
    _updateInstances() {
        const parents = this._instanceTransforms || [this._transform];
        const count = parents.length * (this._type === 'points' ? this._pointSamples.length : 1);
        this._mesh.count = count;
        if (this._mesh.instanceMatrix.count !== count) {
            // Release GPU instance buffers before changing their allocation size.
            this._mesh.dispose();
            this._mesh.instanceMatrix = new InstancedBufferAttribute(new Float32Array(count * 16), 16);
        }
        const colors = new Float32Array(count * 3), opacity = new Float32Array(count);
        const local = new Matrix4(), combined = new Matrix4(), color = new Color();
        let index = 0;
        for (const parent of parents) {
            if (this._type === 'points') {
                for (const sample of this._pointSamples) {
                    local.makeScale(sample.width, sample.width, sample.width).setPosition(...sample.position);
                    this._mesh.setMatrixAt(index, combined.multiplyMatrices(parent, local));
                    color.fromArray(sample.color); colors.set(color.toArray(), index * 3);
                    opacity[index] = sample.opacity; index++;
                }
            } else this._mesh.setMatrixAt(index++, parent);
        }
        if (this._type === 'points') {
            if (this._mesh.instanceColor?.count !== count) this._mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
            else this._mesh.instanceColor.array.set(colors);
            this._mesh.instanceColor.needsUpdate = true;
            let opacityAttribute = this._geometry.getAttribute('strokeOpacity');
            if (opacityAttribute?.count !== count) {
                this._geometry.dispose();
                opacityAttribute = new InstancedBufferAttribute(opacity, 1);
                this._geometry.setAttribute('strokeOpacity', opacityAttribute);
            } else opacityAttribute.array.set(opacity);
            opacityAttribute.needsUpdate = true;
            this._mesh.userData.usdPointCount = this._pointSamples.length;
        }
        this._mesh.instanceMatrix.needsUpdate = true;
        this._mesh.boundingBox = null; this._mesh.boundingSphere = null;
        if (count && this._geometry.attributes.position) { this._mesh.computeBoundingBox(); this._mesh.computeBoundingSphere(); }
        this.updateHelpers();
        this._interface.prepareMeshMaterialGeometry(this._mesh);
        this._applyVisibilityState();
    }
    updateHelpers() {
        for (const helper of this._helpers) disposeHelper(helper);
        this._helpers = this._mesh.userData.usdStrokeError ? [] : strokeHelpers(this._type, this._id, this._data,
            this._geometry, this._instanceTransforms || [this._transform], viewportHelpers(this._interface.config), !!this._instanceTransforms, this._interface.config.webGpuSupport?.createPointHelper);
        for (const helper of this._helpers) this._interface.config.usdRoot.add(helper);
        this._applyVisibilityState();
    }
    setVisibilityState(visible, tag = 'geometry') {
        this._visible = Boolean(visible); this._renderTag = tag; this._mesh.userData.usdRenderTag = tag; this._applyVisibilityState();
    }
    _applyVisibilityState() {
        for (const helper of this._helpers) helper.visible = this._visible && this._interface.isRenderTagIncluded(this._renderTag) && this._mesh.count > 0;
        this._mesh.visible = this._visible && this._interface.isRenderTagIncluded(this._renderTag) && !this._pending.size && this._mesh.count > 0 && !!this._geometry.attributes.position?.count;
    }
    commit() { this._applyVisibilityState(); }
    dispose() {
        for (const helper of this._helpers) disposeHelper(helper);
        this._helpers = [];
        this._interface.unassignMeshFromMaterials(this._mesh);
        this._mesh.removeFromParent(); this._mesh.dispose(); this._geometry.dispose();
        this._ownedMaterial.dispose();
        for (const material of this._materialClones.values()) material.dispose();
        this._materialClones.clear();
    }
}
