import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setPrimActive} from '../../src/scene/index.js';

for (const result of [true, false]) {
    test(`activation awaits native completion before releasing its prim (result: ${result})`, async () => {
        let complete, disposed = false;
        const native = new Promise(resolve => { complete = resolve; });
        const prim = {IsValid:() => true, SetActive:() => native, delete:() => { disposed = true; }};
        const handle = {editStage:callback => callback({GetPrimAtPath:() => prim})};
        const edit = setPrimActive(handle, '/World', false);
        await Promise.resolve();
        assert.equal(disposed, false, 'native async operation still owns the prim');
        complete(result);
        if (result) await edit;
        else await assert.rejects(edit, /Could not change activation of \/World/);
        assert.equal(disposed, true);
    });
}

test('activation propagates native asynchronous errors and releases its prim', async () => {
    let disposed = false;
    const error = new Error('composition failed');
    const prim = {IsValid:() => true, SetActive:async () => { throw error; }, delete:() => { disposed = true; }};
    const handle = {editStage:callback => callback({GetPrimAtPath:() => prim})};
    await assert.rejects(setPrimActive(handle, '/World', true), actual => actual === error);
    assert.equal(disposed, true);
});
