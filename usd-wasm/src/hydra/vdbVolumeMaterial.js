import { BoxGeometry, Group, Matrix4, Mesh, Vector3 } from 'three';
import { Fn, mat4, texture3D, vec3, vec4 } from 'three/tsl';
import BoundedVolumeNodeMaterial from '../vendor/materialx/materials/BoundedVolumeNodeMaterial.js';
import { VDBLoader } from '../vendor/vdb/VDBLoader.js';

export async function createVdbVolumeMesh(state, { renderer, readFile }) {
    if (!renderer?.isWebGPURenderer || renderer.samples > 1) {
        throw new Error('USD VDB fields require WebGPURenderer (WebGPU or forceWebGL), with antialias: false.');
    }
    const resources = new Map(), fields = [];
    try {
        for (const field of state.fields || []) {
            const key = field.resolvedUrl || field.resolvedPath || field.filePath;
            if (!resources.has(key)) {
                const names = state.fields.filter(candidate => (candidate.resolvedUrl || candidate.resolvedPath || candidate.filePath) === key)
                    .map(candidate => candidate.fieldName || candidate.name);
                resources.set(key, new VDBLoader().setGridNames(names).parse(await readFile(field)));
            }
            const grid = resources.get(key).find(grid => grid.name === (field.fieldName || field.name));
            if (!grid) throw new Error(`USD VDB grid '${field.fieldName || field.name}' is missing from ${key}`);
            if (grid.texture) fields.push({ field, grid });
        }
        const density = fields.find(({ field, grid }) => field.name === 'density' || grid.name === 'density') || fields[0];
        if (!density) {
            const empty = new Group();
            empty.userData.usdVolumeFields = [];
            empty.userData.usdVolumeTextures = [];
            empty.userData.usdVolumeEmpty = true;
            return empty;
        }
        if (density.grid.texture.image.data.length !== density.grid.texture.image.width * density.grid.texture.image.height * density.grid.texture.image.depth) {
            throw new Error('USD VDB density visualization requires a scalar grid');
        }
        const grid = density.grid;
        const dimensions = grid.bbox.getSize(new Vector3()).addScalar(1);
        const center = grid.bbox.getCenter(new Vector3());
        const localToGridWorld = grid.transform.clone().multiply(new Matrix4().makeTranslation(center.x, center.y, center.z).scale(dimensions));
        const material = new BoundedVolumeNodeMaterial();
        material.steps = 96;
        material.shadowSteps = 8;
        const sampleDensity = inputs => texture3D(grid.texture, inputs.positionLocal.add(.5)).r.max(0);
        material.extinctionNode = Fn(inputs => vec3(sampleDensity(inputs).mul(1.2)));
        material.scatteringNode = Fn(inputs => vec3(sampleDensity(inputs).mul(.06)));
        const heat = fields.find(({ field, grid }) => field.name === 'heat' || field.name === 'temperature' || grid.name === 'heat');
        if (heat) {
            const heatDimensions = heat.grid.bbox.getSize(new Vector3()).addScalar(1);
            const matrix = new Matrix4().makeScale(1 / heatDimensions.x, 1 / heatDimensions.y, 1 / heatDimensions.z)
                .multiply(new Matrix4().makeTranslation(.5 - heat.grid.bbox.min.x, .5 - heat.grid.bbox.min.y, .5 - heat.grid.bbox.min.z))
                .multiply(heat.grid.transform.clone().invert()).multiply(localToGridWorld);
            material.emissionNode = Fn(inputs => {
                const uv = mat4(matrix).mul(vec4(inputs.positionLocal, 1)).xyz;
                const value = texture3D(heat.grid.texture, uv).r.max(0);
                return vec3(1, .25, .025).mul(value.mul(1.8)).add(vec3(.22, .3, .4).mul(sampleDensity(inputs)));
            });
        } else {
            // Unbound fields have no authored transfer material. Use a neutral
            // density visualization so visibility does not depend on host lights.
            material.emissionNode = Fn(inputs => vec3(.22, .3, .4).mul(sampleDensity(inputs)));
        }
        const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(localToGridWorld);
        mesh.matrixWorldNeedsUpdate = true;
        mesh.userData.usdVolumeTextures = [...resources.values()].flat().map(grid => grid.texture).filter(Boolean);
        mesh.userData.usdVolumeFields = fields.map(({ field, grid }) => ({ name: field.name, fieldName: grid.name,
            dimensions: [grid.texture.image.width, grid.texture.image.height, grid.texture.image.depth] }));
        mesh.name = 'VDB fields';
        return mesh;
    } catch (error) {
        for (const grids of resources.values()) for (const grid of grids) grid.texture?.dispose();
        throw error;
    }
}
