import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createModuleVersions} from '../../../scripts/module-versions.js';
import {stageReady} from './workbench-menus';

test('normal reload updates cached module dependencies without discarding unchanged code',async({page})=>{
 const root=await mkdtemp(join(tmpdir(),'usd-browser-module-cache-'));
 await mkdir(join(root,'public'));await mkdir(join(root,'usd-wasm/src/scene'),{recursive:true});
 await writeFile(join(root,'public/entry.js'),'export {value} from "/usd/scene/dependency.js";');
 const dependency=join(root,'usd-wasm/src/scene/dependency.js');await writeFile(dependency,'export const value="before";');
 const versions=createModuleVersions(root),requests:string[]=[];
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url!,'http://localhost');
   if(url.pathname==='/'||url.pathname==='/unversioned'){
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/html');
    const start=url.pathname==='/'?`const response=await fetch('/viewer-module-versions.json',{cache:'no-store'});const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports:await response.json()});document.head.append(map);`:'';
    res.end(`<body></body><script>(async()=>{${start}const m=await import('/entry.js');document.body.dataset.value=m.value;})()</script>`);return;
   }
   res.setHeader('Content-Type','application/javascript');
   if(url.pathname==='/viewer-module-versions.json'){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await versions()));return;}
   requests.push(req.url!);res.setHeader('Cache-Control','public,max-age=3600,immutable');
   res.end(await readFile(url.pathname.startsWith('/usd/')?join(root,'usd-wasm/src',url.pathname.slice(5)):join(root,'public',url.pathname.slice(1))));
  }catch(error){res.statusCode=500;res.end(String(error));}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as any;
 try{
  await page.goto(`http://127.0.0.1:${address.port}/unversioned`);await expect(page.locator('body')).toHaveAttribute('data-value','before');
  await writeFile(dependency,'export const value="after";');
  await page.reload();await expect(page.locator('body')).toHaveAttribute('data-value','before');
  await page.goto(`http://127.0.0.1:${address.port}/`);await expect(page.locator('body')).toHaveAttribute('data-value','after');
  await writeFile(dependency,'export const value="latest";');
  await page.reload();await expect(page.locator('body')).toHaveAttribute('data-value','latest');
  await page.reload();await expect(page.locator('body')).toHaveAttribute('data-value','latest');
  expect(requests.filter(p=>p.startsWith('/entry.js?'))).toHaveLength(1);
  expect(new Set(requests.filter(p=>p.startsWith('/usd/scene/dependency.js?'))).size).toBe(2);
 }finally{await page.goto('about:blank');server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});

test('viewer reload keeps native paging and one shared SDK module with a warm browser cache',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(let cycle=0;cycle<2;cycle++){
  if(cycle)await page.reload();else await page.goto('/?workspace=studio&viewer=three&render=basic&file=/test-fixtures/coverage/core/analytic-primitives.usda');
  await stageReady(page);
  const state=await page.evaluate(async()=>{
   const imports=JSON.parse(document.querySelector('script[type=importmap]')!.textContent!).imports;
   const {inspectPrimAsync}=await import('/usd/scene/index.js');
   const data=await (window as any).usdHydra.readStage(async stage=>{
    const prim=stage.GetPrimAtPath('/World/Cube'),attribute=prim.GetAttribute('xformOpOrder');
    try{return {page:typeof attribute.GetValuePage==='function',snapshot:await inspectPrimAsync(stage,prim.GetPath(),0,{arrayLimit:0})};}
    finally{attribute.delete();prim.delete();}
   });
   return {scene:imports['/usd/scene/index.js'],runtime:imports['viewer-runtime'],data};
  });
  expect(state.scene).toMatch(/\/usd\/scene\/index\.js\?v=[a-f0-9]+$/);expect(state.runtime).toMatch(/viewer-runtime-three\.js\?v=/);
  expect(state.data?.page).toBe(true);expect(state.data?.snapshot.attributes.some((a:any)=>a.arraySize>0&&a.value.length===0)).toBe(true);
 }
 expect(errors).toEqual([]);
});
