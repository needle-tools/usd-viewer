import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTransferTracker,downloadAmount,formatEta} from '../public/viewer-transfer-tracker.js';

test('concurrent transfers aggregate bytes, totals, speed and ETA across completed files',()=>{
  let time=0;const tracker=createTransferTracker(()=>time);
  tracker.update({url:'a',state:'start'});tracker.update({url:'b',state:'start'});
  assert.equal(tracker.snapshot().total,null);
  time=1000;
  tracker.update({url:'a',state:'progress',loaded:200,total:1000});
  tracker.update({url:'b',state:'progress',loaded:300,total:1000});
  let snapshot=tracker.snapshot();
  assert.equal(snapshot.loaded,500);assert.equal(snapshot.total,2000);
  assert.equal(snapshot.ratio,0.25);assert.equal(snapshot.rate,500);assert.equal(snapshot.eta,3);
  time=2000;tracker.update({url:'a',state:'done',loaded:1000,total:1000});
  snapshot=tracker.snapshot();assert.equal(snapshot.active,1);assert.equal(snapshot.completed,1);
  assert.equal(snapshot.loaded,1300);assert.equal(snapshot.total,2000);
  assert.equal(tracker.update({url:'a',state:'start',loaded:0,total:0}),false);
  assert.equal(tracker.snapshot().loaded,1300);
});

test('unknown sizes stay indeterminate until measured, without losing known per-file progress',()=>{
  let time=0;const tracker=createTransferTracker(()=>time);
  tracker.update({url:'known',state:'start'});tracker.update({url:'unknown',state:'start'});
  time=1000;tracker.update({url:'known',state:'progress',loaded:250,total:1000});
  tracker.update({url:'unknown',state:'progress',loaded:500,total:0});
  let snapshot=tracker.snapshot();
  assert.equal(snapshot.total,null);assert.equal(snapshot.ratio,null);assert.equal(snapshot.eta,null);
  assert.equal(snapshot.unknown,1);assert.equal(snapshot.files[0].ratio,0.25);
  assert.equal(downloadAmount(snapshot.files[1]),'500 B · size unknown');
  tracker.update({url:'unknown',state:'done',loaded:500,total:0});
  snapshot=tracker.snapshot();assert.equal(snapshot.total,1500);assert.equal(snapshot.ratio,0.5);
});

test('discovered files expand the denominator and stalled downloads stop showing a rate',()=>{
  let time=0;const tracker=createTransferTracker(()=>time);
  tracker.update({url:'a',state:'start'});time=1000;
  tracker.update({url:'a',state:'progress',loaded:500,total:1000});
  assert.equal(tracker.snapshot().ratio,0.5);
  tracker.update({url:'b',state:'progress',loaded:0,total:1000});
  assert.equal(tracker.snapshot().ratio,0.25);
  time=7000;assert.equal(tracker.snapshot().rate,0);assert.equal(tracker.snapshot().eta,null);
});

test('failed downloads preserve received bytes and do not claim completion; retries and resets work',()=>{
  let time=0;const tracker=createTransferTracker(()=>time);
  tracker.update({url:'a',state:'start'});time=1000;
  tracker.update({url:'a',state:'progress',loaded:50,total:100});
  tracker.update({url:'a',state:'error',loaded:0,total:0,error:'offline'});
  let snapshot=tracker.snapshot();assert.equal(snapshot.failed,1);assert.equal(snapshot.loaded,50);
  assert.equal(snapshot.completed,0);assert.equal(snapshot.eta,null);
  tracker.update({url:'a',state:'start'});assert.equal(tracker.snapshot().failed,0);
  tracker.update({url:'a',state:'done',loaded:100,total:100});assert.equal(tracker.snapshot().completed,1);
  tracker.reset();snapshot=tracker.snapshot();assert.equal(snapshot.files.length,0);assert.equal(snapshot.loaded,0);assert.equal(snapshot.rate,0);
});

test('inconsistent length headers never produce a percentage over 100',()=>{
  const tracker=createTransferTracker(()=>1000);
  tracker.update({url:'decoded',state:'progress',loaded:200,total:100});
  assert.equal(tracker.snapshot().ratio,null);
  tracker.update({url:'decoded',state:'done',loaded:200,total:100});
  assert.equal(tracker.snapshot().ratio,1);assert.equal(tracker.snapshot().total,200);
  assert.equal(formatEta(119.8),'~2 min left');assert.equal(formatEta(null),'');
});
