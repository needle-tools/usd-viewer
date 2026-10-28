import { Group, Matrix4 } from 'three';

function disposeVolume(root) {
    root?.removeFromParent();
    root?.traverse(object => {
        object.geometry?.dispose();
        for (const material of [object.material].flat()) material?.dispose();
    });
    for (const texture of root?.userData.usdVolumeTextures || []) texture.dispose();
}

export class VdbVolumeRprim {
    constructor(id, hydraInterface) {
        this._id = id;
        this._interface = hydraInterface;
        this._root = new Group();
        this._root.name = id.split('/').pop();
        this._root.userData.usdPath = id;
        this._root.userData.usdTypeName = 'Volume';
        hydraInterface.config.usdRoot.add(this._root);
        this._generation = 0;
    }

    updateVolumeState(state) {
        if (this._disposed) return;
        if (state.transform?.length === 16) {
            this._root.matrix.copy(new Matrix4().fromArray(state.transform));
            this._root.matrixAutoUpdate = false;
            this._root.matrixWorldNeedsUpdate = true;
        }
        this._root.visible = state.visible !== false;
        const key = JSON.stringify(state.fields);
        if (key === this._key) return;
        this._key = key;
        const generation = ++this._generation;
        const factory = this._interface.config.usdVolumeFactory;
        const update = (async () => {
            if (!factory) throw new Error('USD VDB fields require createVdbVolumeMesh from @needle-tools/usd/volumes and a compatible node renderer.');
            const mesh = await factory(state, {
                renderer: this._interface.config.renderer,
                readFile: field => this._readFile(field),
            });
            if (this._disposed || generation !== this._generation) { disposeVolume(mesh); return; }
            disposeVolume(this._volume);
            this._volume = mesh;
            this._root.add(mesh);
            this._interface.config.requestRender?.();
        })();
        this._interface.trackRprimUpdate(update);
    }

    // Volume data is applied atomically when the tracked field load finishes.
    commit() {}

    _hasRenderableGeometry() { return Boolean(this._volume); }

    async _readFile(field) {
        const registry = this._interface.registry;
        const path = field.resolvedUrl || field.resolvedPath || field.filePath;
        const url = /^https?:\/\//.test(path) ? path : registry.resolveHttpResourceUrl(path);
        if (url) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`USD VDB field request failed (${response.status}): ${url}`);
            return response.arrayBuffer();
        }
        const bytes = registry.readResolvedResource(path) || await new Promise(resolve =>
            this._interface.config.driver().getFile(path, resolve));
        if (!bytes) throw new Error(`USD VDB field is unavailable: ${path}`);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    dispose() {
        this._disposed = true;
        ++this._generation;
        disposeVolume(this._volume);
        this._root.removeFromParent();
    }
}
