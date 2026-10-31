import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { getUsdModule } from '../runtime.mjs';
import { createThreeHydra } from '../../src/create.three.js';

test('native volume fields preserve grid names, bounds, transforms and animated asset changes', async () => {
    const diagnostics = [];
    const USD = await getUsdModule({ print() {}, printErr: message => diagnostics.push(String(message)) });
    for (const name of ['volume-fields-a.vdb', 'volume-fields-b.vdb']) {
        USD.FS_createDataFile('/', name, new Uint8Array([0]), true, true, true);
    }
    const source = `#usda 1.0
(
    startTimeCode = 1
    endTimeCode = 2
    upAxis = "Y"
)
def Volume "Volume" {
    float3[] extent = [(-1, -2, -3), (4, 5, 6)]
    rel field:density = </Density>
    rel field:temperature = </Heat>
    double3 xformOp:translate = (2, 3, 4)
    uniform token[] xformOpOrder = ["xformOp:translate"]
}
def OpenVDBAsset "Density" {
    token fieldName = "density"
    asset filePath.timeSamples = { 1: @/volume-fields-a.vdb@, 2: @/volume-fields-b.vdb@ }
}
def OpenVDBAsset "Heat" {
    token fieldName = "heat"
    asset filePath = @/volume-fields-a.vdb@
}`;
    const states = [], root = new Group();
    const handle = await createThreeHydra({ USD, scene: root, url: 'volume-fields.usda',
        buffer: new TextEncoder().encode(source),
        usdVolumeFactory: async state => { states.push(state); return new Group(); },
    });
    try {
        await handle.ready(); await handle.setTime(1);
        let state = states.at(-1);
        assert.equal(state.visible, true);
        assert.deepEqual(state.extent, [[-1, -2, -3], [4, 5, 6]]);
        assert.deepEqual(state.transform.slice(12, 15), [2, 3, 4]);
        const density = state.fields.find(field => field.name === 'density');
        const heat = state.fields.find(field => field.name === 'temperature');
        assert.equal(density.fieldName, 'density'); assert.equal(density.fieldType, 'openvdbAsset');
        assert.equal(density.filePath, '/volume-fields-a.vdb'); assert.equal(density.resolvedPath, '/volume-fields-a.vdb');
        assert.equal(heat.fieldName, 'heat');
        await handle.setTime(2);
        state = states.at(-1);
        assert.equal(state.fields.find(field => field.name === 'density').filePath, '/volume-fields-b.vdb');
        assert.equal(state.fields.find(field => field.name === 'temperature').filePath, '/volume-fields-a.vdb');
        await handle.setTime(1);
        assert.equal(states.at(-1).fields.find(field => field.name === 'density').filePath, '/volume-fields-a.vdb');
        const volume = root.children.find(object => object.userData.usdTypeName === 'Volume');
        assert.deepEqual(volume.matrix.elements.slice(12, 15), [2, 3, 4]);
        assert.deepEqual(diagnostics.filter(message => /Coding Error|Runtime Error|Unsafe|invalidation/i.test(message)), []);
    } finally {
        await handle.dispose();
        for (const name of ['volume-fields-a.vdb', 'volume-fields-b.vdb']) USD.FS_unlink(`/${name}`);
    }
});
