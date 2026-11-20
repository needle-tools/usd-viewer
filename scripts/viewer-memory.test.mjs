import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createViewerMemory} from '../public/viewer-memory.js';

test('desktop viewer requests growth capacity without increasing the initial allocation',()=>{
 let options;class Memory{constructor(value){options=value;}}
 assert.ok(createViewerMemory({isolated:true,userAgent:'Windows NT 10.0',Memory}) instanceof Memory);
 assert.deepEqual(options,{initial:256,maximum:65536,shared:true});
});

test('mobile, nonisolated and unsupported hosts retain the SDK memory configuration',()=>{
 class Memory{constructor(){throw new Error('Unsupported memory capacity');}}
 assert.equal(createViewerMemory({isolated:true,userAgent:'Macintosh',Memory}),undefined);
 let calls=0;const never=class{constructor(){calls++;}};
 for(const userAgent of ['Android','iPhone','iPad'])assert.equal(createViewerMemory({isolated:true,userAgent,Memory:never}),undefined);
 assert.equal(createViewerMemory({isolated:false,userAgent:'Windows NT 10.0',Memory:never}),undefined);
 assert.equal(calls,0,'these hosts do not allocate a viewer-owned shared memory');
});
