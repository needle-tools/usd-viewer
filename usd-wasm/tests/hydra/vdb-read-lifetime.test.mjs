import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { VdbVolumeRprim } from '../../src/hydra/vdbVolumeRprim.js';

function volume(getFile) {
    return new VdbVolumeRprim('/Volume', {
        config: { usdRoot: new Group(), driver: () => ({ getFile }) },
        registry: { resolveHttpResourceUrl: () => null, readResolvedResource: () => null },
    });
}

test('VDB native asset bytes are retained before the getFile callback returns', async () => {
    const bytes = new Uint8Array([99, 1, 2, 3, 99]);
    const prim = volume((_path, callback) => {
        callback(bytes.subarray(1, 4));
        bytes.fill(0);
        return Promise.resolve();
    });
    try {
        assert.deepEqual([...new Uint8Array(await prim._readFile({ filePath: 'density.vdb' }))], [1, 2, 3]);
    } finally { prim.dispose(); }
});

test('VDB native read failures settle for both synchronous and asynchronous drivers', { timeout: 2000 }, async () => {
    const error = new Error('Native volume read failed');
    for (const getFile of [() => { throw error; }, () => Promise.reject(error)]) {
        const prim = volume(getFile);
        try { await assert.rejects(prim._readFile({ filePath: 'density.vdb' }), reason => reason === error); }
        finally { prim.dispose(); }
    }
});
