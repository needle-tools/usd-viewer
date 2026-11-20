import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPhaseTiming} from '../usd-wasm/scripts/corpus/phase-timing.mjs';
test('interrupted source phases retain their measured time without a browser result',()=>{
 let now=100;const timing=createPhaseTiming(()=>now);
 now=300;assert.equal(timing.enter('load'),.2);
 now=1300;assert.equal(timing.enter('load'),1.2);
 now=2300;assert.deepEqual(timing.snapshot(),{wallSeconds:2.2,phases:[{phase:'page',startedSeconds:0,durationSeconds:.2},{phase:'load',startedSeconds:.2,durationSeconds:2}]});
 now=2800;timing.enter('export');now=3100;
 assert.deepEqual(timing.snapshot(),{wallSeconds:3,phases:[{phase:'page',startedSeconds:0,durationSeconds:.2},{phase:'load',startedSeconds:.2,durationSeconds:2.5},{phase:'export',startedSeconds:2.7,durationSeconds:.3}]});
});
