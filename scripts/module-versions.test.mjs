import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,utimes,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createModuleVersions} from './module-versions.js';

test('module URLs follow content, including same-size edits with preserved mtimes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'usd-module-versions-'));
 try{
  await mkdir(join(root,'public/css'),{recursive:true});await writeFile(join(root,'public/css/workbench.css'),'body{color:red}');await mkdir(join(root,'usd-wasm/src/scene'),{recursive:true});
  const file=join(root,'usd-wasm/src/scene/index.js');await writeFile(file,'export const value=1;');
  await writeFile(join(root,'public/app.js'),'import "/usd/scene/index.js";');await writeFile(join(root,'public/viewer-module-versions.json'),'generated');
  const read=createModuleVersions(root),before=await read(),info=await stat(file);
  assert.match(before['/usd/scene/index.js'],/^\/usd\/scene\/index\.js\?v=[a-f0-9]{20}$/);
  assert.equal(before['/viewer-module-versions.json'],undefined);assert.deepEqual(await read(),before);
  await writeFile(file,'export const value=2;');await utimes(file,info.atime,info.mtime);
  const after=await read();assert.notEqual(after['/usd/scene/index.js'],before['/usd/scene/index.js']);assert.equal(after['/app.js'],before['/app.js']);
  assert.match(after['/css/workbench.css'],/\?v=/);await writeFile(join(root,'public/css/workbench.css'),'body{color:blue}');assert.notEqual((await read())['/css/workbench.css'],after['/css/workbench.css']);
 }finally{await rm(root,{recursive:true,force:true});}
});
