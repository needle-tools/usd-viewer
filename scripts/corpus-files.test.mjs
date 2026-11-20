import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {serveCorpus} from '../usd-wasm/scripts/corpus/server.mjs';
import {writeJsonAtomic} from '../usd-wasm/scripts/corpus/files.mjs';

test('a failed atomic report replacement removes its incomplete temporary file',async()=>{
 const root=await mkdtemp(join(tmpdir(),'corpus-write-cleanup-'));
 try{
  const target=join(root,'report.json');await mkdir(target);
  await assert.rejects(writeJsonAtomic(target,{ok:true}));
  assert.deepEqual(await readdir(root),['report.json']);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('failed uploads clean their temporary file and successful reruns replace one current artifact',async()=>{
 const root=await mkdtemp(join(tmpdir(),'corpus-upload-cleanup-'));
 const server=await serveCorpus({build:root,assets:root,results:root});
 try{
  const id='0123456789abcdefabcd',target=join(root,'artifacts',id+'.glb');await mkdir(target);
  let response=await fetch(server.origin+'/artifacts/'+id+'.glb',{method:'POST',body:'first'});
  assert.equal(response.status,500);await response.text();
  assert.deepEqual(await readdir(join(root,'artifacts')),[id+'.glb']);
  await rm(target,{recursive:true});
  for(const text of ['first','second']){response=await fetch(server.origin+'/artifacts/'+id+'.glb',{method:'POST',body:text});assert.equal(response.status,201);await response.text();}
  assert.equal(await readFile(target,'utf8'),'second');assert.deepEqual(await readdir(join(root,'artifacts')),[id+'.glb']);
 }finally{await server.close();await rm(root,{recursive:true,force:true});}
});
