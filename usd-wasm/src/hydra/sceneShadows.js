import { Box3, Matrix4, Vector3 } from 'three';

/** Raster shadows for composed USD punctual lights. The owning Hydra handle supplies its
 * existing stage and time after a completed draw; no secondary stage or native polling loop.
 * Shadow color, distance/falloff and shadowLink require shader/linking work and are not mapped
 * to unrelated Three controls. Rectangular/dome lights have no raster shadow implementation.
 */
export class UsdSceneShadows {
    constructor(stage, delegate) {
        this.stage = stage;
        this.delegate = delegate;
        this.records = new Map();
        this.activeLights = [];
        this.bounds = new Box3();
        this.meshBounds = new Box3();
        this.cameraInverse = new Matrix4();
        this.corner = new Vector3();
    }

    async update(timeCode) {
        if (!this.stage) return;
        const primitives = this.delegate.scenePrimitives;
        for (const [path, record] of this.records) {
            if (primitives[path]?._object !== record.light) {
                this.release(record);
                this.records.delete(path);
                this.lightSetChanged = true;
            }
        }
        const activeLights = [];
        for (const [path, primitive] of Object.entries(primitives)) {
            const light = primitive._object;
            if (!light?.shadow || !(light.isDirectionalLight || light.isPointLight || light.isSpotLight)) continue;
            let record = this.records.get(path);
            if (!record) {
                let prim;
                try {
                    prim = this.stage.GetPrimAtPath(path);
                    record = { light, enabledAttribute: prim.GetAttribute('inputs:shadow:enable') };
                    this.records.set(path, record);
                } finally { prim?.delete?.(); }
            }
            const attribute = record.enabledAttribute;
            const value = attribute?.IsValid?.() ? await attribute.Get(timeCode) : undefined;
            const enabled = value !== false; // UsdLuxShadowAPI fallback is true.
            light.userData.usdShadowEnabled = enabled;
            let visible = true;
            for (let parent = light; parent; parent = parent.parent) visible &&= parent.visible;
            light.castShadow = enabled && visible && light.intensity > 0;
            if (light.castShadow) activeLights.push(light);
        }
        this.activeLights = activeLights;
        this.refreshBounds();
    }

    refreshBounds() {
        const activeLights = this.activeLights;
        if (!this.stage) return;
        if (!activeLights.length) { this.refreshLightOrder(); return; }
        const root = this.delegate.config.usdRoot;
        root.updateWorldMatrix(true, true);
        this.bounds.makeEmpty();
        root.traverseVisible(object => {
            if (!object.isMesh || !object.geometry || !object.userData.usdPath) return;
            // Helpers and external host meshes must not expand the USD shadow frustum.
            if (object.userData.usdHelperFor) return;
            if (object.isInstancedMesh || object.isSkinnedMesh) {
                object.computeBoundingBox();
                if (object.boundingBox) this.bounds.union(this.meshBounds.copy(object.boundingBox).applyMatrix4(object.matrixWorld));
            } else {
                if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
                if (object.geometry.boundingBox) this.bounds.union(this.meshBounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
            }
        });
        for (const light of activeLights) {
            light.castShadow = !this.bounds.isEmpty();
            if (light.castShadow) this.fit(light);
        }
        this.refreshLightOrder();
    }

    refreshLightOrder() {
        let changed = this.lightSetChanged === true;
        this.lightSetChanged = false;
        for (const record of this.records.values()) {
            if (record.lastCastShadow !== record.light.castShadow || record.lastVisible !== record.light.visible) {
                record.lastCastShadow = record.light.castShadow;
                record.lastVisible = record.light.visible;
                changed = true;
            }
        }
        // MaterialX caches a caster-first light list. Three rebuilds its shadow-map list
        // when castShadow changes, so refresh the existing environment at the same boundary.
        if (changed) this.delegate.refreshMaterialXLighting?.();
    }

    fit(light) {
        light.updateWorldMatrix(true, false);
        light.target?.updateWorldMatrix(true, false);
        const camera = light.shadow.camera;
        const diagonal = this.bounds.getSize(this.corner).length();
        const margin = Math.max(diagonal * 0.025, 1e-4);
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.bias = light.isDirectionalLight ? -0.0001 : 0;
        light.shadow.normalBias = diagonal * 0.0005;
        if (light.isDirectionalLight) {
            // A distant light's authored translation is physically irrelevant. Fit signed depth
            // around that origin, so geometry behind it is not clipped out of the shadow map.
            camera.position.setFromMatrixPosition(light.matrixWorld);
            camera.lookAt(this.corner.setFromMatrixPosition(light.target.matrixWorld));
            camera.updateMatrixWorld(true);
            this.cameraInverse.copy(camera.matrixWorldInverse);
            const local = this.meshBounds.makeEmpty();
            for (let i = 0; i < 8; i++) {
                this.corner.set(i & 1 ? this.bounds.max.x : this.bounds.min.x,
                    i & 2 ? this.bounds.max.y : this.bounds.min.y,
                    i & 4 ? this.bounds.max.z : this.bounds.min.z).applyMatrix4(this.cameraInverse);
                local.expandByPoint(this.corner);
            }
            camera.left = local.min.x - margin; camera.right = local.max.x + margin;
            camera.bottom = local.min.y - margin; camera.top = local.max.y + margin;
            camera.near = -local.max.z - margin; camera.far = -local.min.z + margin;
        } else {
            const position = light.getWorldPosition(new Vector3());
            let far = 0;
            for (let i = 0; i < 8; i++) {
                this.corner.set(i & 1 ? this.bounds.max.x : this.bounds.min.x,
                    i & 2 ? this.bounds.max.y : this.bounds.min.y,
                    i & 4 ? this.bounds.max.z : this.bounds.min.z);
                far = Math.max(far, position.distanceTo(this.corner));
            }
            // Perspective depth loses precision with an unnecessarily tiny near plane.
            // Half the distance to the stage box stays safely in front of all casters.
            camera.near = Math.max(this.bounds.distanceToPoint(position) * 0.5, diagonal * 0.001, 1e-5);
            camera.far = Math.max(camera.near * 2, far + margin);
        }
        camera.updateProjectionMatrix();
        light.shadow.needsUpdate = true;
    }

    release(record) {
        if (record.released) return;
        record.released = true;
        record.enabledAttribute?.delete?.();
        record.light.shadow?.dispose?.();
    }

    dispose() {
        for (const record of this.records.values()) this.release(record);
        this.records.clear();
        this.activeLights = [];
        this.stage = null;
        this.delegate = null;
    }
}
