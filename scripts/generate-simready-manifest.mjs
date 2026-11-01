#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repository='nvidia/simready-assets';
const hub=`https://huggingface.co/datasets/${repository}`;
const api=`https://huggingface.co/api/datasets/${repository}`;
export const resourceShard = value => [...value].reduce((hash,char)=>((hash*31)+char.charCodeAt(0))>>>0,0)%16;
const encodePath=value=>value.split('/').map(encodeURIComponent).join('/');

async function request(url) {
  for (let attempt=0;;attempt++) {
    const response=await fetch(url);
    if (response.ok) return response;
    if (attempt>=4 || ![429,502,503,504].includes(response.status)) throw new Error(`${response.status}: ${url}`);
    await new Promise(resolve=>setTimeout(resolve,Math.min(30,Number(response.headers.get('retry-after')) || 2**attempt)*1000));
  }
}

/** Find entry points using actual root files and the published thumbnail layout. */
export function collectPackages(entries) {
  const files=new Map(entries.filter(entry=>entry.type==='file').map(entry=>[entry.path,entry]));
  const packages=[...files.keys()].filter(name=>name.endsWith('/com.nvidia.simready.packaging.json')).map(name=>path.posix.dirname(name)).sort();
  const candidates=new Map();
  for (const name of files.keys()) {
    if (!/\.(usd|usda|usdc|usdz)$/i.test(name)) continue;
    const directory=path.posix.dirname(name);
    const packageName=path.posix.basename(directory)==='simready_usd'?path.posix.dirname(directory):directory;
    if (!candidates.has(packageName)) candidates.set(packageName,[]);
    candidates.get(packageName).push(name);
  }
  return packages.map(packageName=>({
    package:packageName,
    candidates:candidates.get(packageName) || [],
    files,
  }));
}

export function projectAsset(packageName,root,files) {
  const directory=path.posix.dirname(root),filename=path.posix.basename(root);
  const thumbnail=`${directory}/.thumbs/256x256/${filename}.png`;
  const lightThumbnail=`${directory}/.thumbs/256x256/${filename}_light.png`;
  if (!files.has(root)) throw new Error(`Missing declared root: ${root}`);
  if (!files.has(thumbnail)) throw new Error(`Missing published preview: ${thumbnail}`);
  return {package:packageName,root,thumbnail,...(files.has(lightThumbnail)?{lightThumbnail}:{}),rootBytes:files.get(root).size};
}

/** Only resolutions that actually exist in the published inventory are offered. */
export function collectResources(entries) {
  const files=new Map(entries.filter(entry=>entry.type==='file').map(entry=>[entry.path,entry]));
  const resources={};
  for (const [name,entry] of files) {
    const match=name.match(/^([^/]+)\/simready_usd\/(.+)$/);
    if (!match || match[2].includes('/.thumbs/') || match[2].startsWith('.thumbs/')) continue;
    const [,asset,relative]=match;
    const data=resources[asset] ||= {layers:[],textures:[],textureBytes:0};
    if (relative.startsWith('payloads/') && relative.endsWith('.usda') && entry.size<512*1024) data.layers.push(relative);
    if (relative==='payloads/geometries.usd' && entry.size<=32*1024*1024) data.geometry=relative;
    if (relative==='payloads/instances.usda' && entry.size>=512*1024 && entry.size<=16*1024*1024) data.instances=relative;
    if (!relative.startsWith('Textures/')) continue;
    data.textureBytes+=entry.size;
    const preview=`${name.slice(0,name.lastIndexOf('/'))}/.thumbs/512x512/${path.posix.basename(name)}.png`;
    if (files.has(preview)) data.textures.push(relative);
  }
  for(const [asset,data] of Object.entries(resources)) {
    let bytes=0;
    data.layers=data.layers.filter(relative=>{
      bytes+=files.get(`${asset}/simready_usd/${relative}`).size;
      return bytes<=1024*1024;
    });
  }
  return resources;
}

async function main() {
  const revision=process.argv[2] || (await (await request(`${api}?expand=sha`)).json()).sha;
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Use a full dataset commit SHA.');
  const cache=path.resolve('.cache/simready-index',revision);await fs.mkdir(cache,{recursive:true});
  let url=`${api}/tree/${revision}?recursive=true&limit=1000`,page=0;
  const entries=[];
  while (url) {
    const cachePath=path.join(cache,`${page}.json`);let data;
    try {data=JSON.parse(await fs.readFile(cachePath,'utf8'));}
    catch {
      const response=await request(url);
      data={url,entries:await response.json(),next:response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null};
      await fs.writeFile(cachePath,JSON.stringify(data));
    }
    if (data.url!==url || !Array.isArray(data.entries)) throw new Error(`Invalid inventory cache: ${cachePath}`);
    entries.push(...data.entries);url=data.next;page++;
    if (page%10===0 || !url) console.log(`Listed ${entries.length.toLocaleString()} entries (${page} pages)`);
  }
  const packages=collectPackages(entries),assets=[];
  for (const item of packages) {
    let roots=item.candidates;
    if (roots.length!==1) {
      const metadata=`${item.package}/.metadata/com.nvidia.simready.root_usds.json`;
      const declared=await (await request(`${hub}/resolve/${revision}/${encodePath(metadata)}`)).json();
      if (!Array.isArray(declared.entries) || !declared.entries.length) throw new Error(`No root entries for ${item.package}`);
      roots=declared.entries.map(relative=>path.posix.join(item.package,relative));
    }
    assets.push(...roots.map(root=>projectAsset(item.package,root,item.files)));
  }
  if (!assets.length || new Set(assets.map(asset=>asset.root)).size!==assets.length) throw new Error('Empty or duplicate SimReady entries.');
  const manifest={version:1,repository,revision,source:hub,license:'CC-BY-4.0',packageCount:packages.length,assets};
  await fs.writeFile('public/data/nvidia-simready.json',JSON.stringify(manifest,null,2)+'\n');
  const resources=collectResources(entries);
  const shards=Array.from({length:16},()=>({revision,assets:{}}));
  for (const [asset,data] of Object.entries(resources)) shards[resourceShard(asset)].assets[asset]=data;
  await fs.mkdir('public/data/simready-resources',{recursive:true});
  await Promise.all(shards.map((shard,index)=>fs.writeFile(`public/data/simready-resources/${index}.json`,JSON.stringify(shard)+'\n')));
  console.log(`Wrote ${assets.length} USD entry points from ${packages.length} packages at ${revision}`);
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
