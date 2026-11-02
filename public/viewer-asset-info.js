import {viewerIcon} from './usd/viewer/icons.js';
import {renderStructuredValue,getSelectionBounds} from './usd/viewer/inspect.js';
import {Vector3} from 'three';
import {inspectStageSummary,inspectStageFiles} from './usd/scene/index.js';
import {formatBytes} from './viewer-transfer-tracker.js';
import {assetFileTotals} from './viewer-asset-stats.js';

const nvidiaViewer = 'https://nvidia-simready-central.hf.space/';

export function assetSourceLinks(source, base = globalThis.location?.href) {
  let url;
  try {url = new URL(source, base);} catch {return null;}
  if (!['https:', 'http:'].includes(url.protocol)) return null;
  const match = url.hostname === 'huggingface.co' && url.pathname.match(/^\/datasets\/([^/]+\/[^/]+)\/(?:resolve|blob)\/([^/]+)\/(.+)$/);
  if (!match) return {source: url.href};
  url.pathname = `/datasets/${match[1]}/blob/${match[2]}/${match[3]}`;
  url.search = ''; url.hash = '';
  const simready=match[1].endsWith('/simready-assets')||match[3].includes('/simready_usd/');
  return {source: url.href, huggingface: true, simreadyPath:simready?match[3]:null,...(simready?{simreadyRepository:match[1]}:{})};
}

/** A single-result filter opens the asset and survives NVIDIA catalog revisions. */
export function nvidiaAssetLink(path,{repository='nvidia/simready-assets'}={}) {
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const url = new URL(nvidiaViewer);
  url.searchParams.set('filter_url_regexp', `.*/datasets/${escape(repository)}/(resolve|blob)/[^/]+/${escape(path)}`);
  return url.href;
}

export function mountAssetInfo(container, source, {handle,usd,getFiles=()=>[],getTransfers=()=>[],resolveTextureUrl=url=>url} = {}) {
  const links = typeof source === 'string' ? assetSourceLinks(source) : null;
  const sourceUrl=links?new URL(source,globalThis.location?.href):null;
  const section = document.createElement('details'); section.className = 'usd-stage-section usd-asset-info';
  const summary = document.createElement('summary');summary.className='section-rail-group-summary'; summary.append(viewerIcon('chevron_right'), 'Info'); section.append(summary);
  const stats = document.createElement('div'); stats.className='property-list usd-asset-stats'; section.append(stats);
  const schemaGroup=document.createElement('details'),schemaTitle=document.createElement('summary'),schemas=document.createElement('div');
  schemaGroup.className='usd-asset-schemas';schemaTitle.textContent='Schemas';schemaGroup.append(schemaTitle,schemas);section.append(schemaGroup);
  let disposed=false,revision=0,controller,stageFiles=[],sourceFiles=[];
  const fields=new Map();
  function row(label,value,{subline=false,title}={}) {
    let field=fields.get(label);
    if(!field){const group=document.createElement('div'),head=document.createElement('div'),name=document.createElement('label'),content=document.createElement('output');group.className='property-row';head.className='property-row-head';name.textContent=label;group.classList.toggle('usd-asset-subline',subline);head.append(name,content);group.append(head);stats.append(group);field={name,content};fields.set(label,field);}
    field.content.textContent=String(value);if(title)field.name.title=title;
  }
  function refreshFiles() {
    if(disposed||!section.open)return;
    const transfers=getTransfers().map(file=>({path:handle?.sourcePaths?.path(file.url)||file.url,size:file.state==='done'?file.loaded:file.total??undefined}));
    const total=assetFileTotals([...stageFiles,...sourceFiles,...transfers]);
    row('Files',total.count,{title:'Source files discovered for this asset'});
    row('Total file size',formatBytes(total.total)+(total.unknown?' + …':''),{title:total.unknown?`${total.unknown} file sizes unavailable`:'Source file bytes'});
    row('Meshes / USD',formatBytes(total.geometry),{subline:true,title:'USD layers, packages and geometry source files'});
    row('Textures',formatBytes(total.textures),{subline:true});
    row('Other',formatBytes(total.other),{subline:true});
  }
  async function refresh() {
    if(disposed||!section.open)return;
    const request=++revision;controller?.abort();controller=new AbortController();
    const signal=controller.signal;
    sourceFiles=getFiles().map(file=>{
      const original=file.url||(sourceUrl?new URL(file.path,sourceUrl).href:file.path);
      const resolved=/^https?:\/\//i.test(original)?resolveTextureUrl(original):original;
      const path=resolved!==original?handle?.sourcePaths?.path(resolved)||resolved:file.path;
      return{path,size:resolved===original?file.size??file.file?.size:undefined};
    });refreshFiles();
    if(!handle||!usd)return;
    section.setAttribute('aria-busy','true');
    try {
      const result=await handle.readStage(async stage=>{
        signal.throwIfAborted();
        const functionality=await inspectStageSummary(stage,{signal});
        return{functionality,files:inspectStageFiles(stage,usd,handle.sourcePaths)};
      });
      if(disposed||request!==revision)return;
      stageFiles=result.files;refreshFiles();
      const info=result.functionality;
      row('SimReady profile',info.profile || '—');
      row('Mass',info.massKg==null?'—':`${Number(info.massKg.toFixed(3))} kg`);
      let dimensions=info.dimensions;
      if(!dimensions){const bounds=await getSelectionBounds(handle);handle.scene.updateWorldMatrix(true,false);bounds.applyMatrix4(handle.scene.matrixWorld.clone().invert());if(!bounds.isEmpty())dimensions=bounds.getSize(new Vector3()).multiplyScalar(info.metersPerUnit).toArray();}
      if(disposed||request!==revision)return;
      row('Dimensions',dimensions?dimensions.map(value=>Number(value.toFixed(3))).join(' × ')+' m':'—');
      for(const [label,key] of [['Moving parts','movingParts'],['Independent joints','independentJoints'],['Prims','prims'],['Meshes','meshes'],['Materials','materials'],['Lights','lights'],['Colliders','colliders'],['Rigid bodies','rigidBodies'],['Constraints','constraints']])row(label,info[key]);
      const list=[...new Set([...info.types,...info.apiSchemas])].sort();
      schemaTitle.textContent=`Schemas (${list.length})`;
      schemas.replaceChildren(renderStructuredValue(list,'Schemas'));
    } catch(error) {if(!disposed&&request===revision&&error.name!=='AbortError')row('Inspection',error.message);}
    finally {if(!disposed&&request===revision)section.removeAttribute('aria-busy');}
  }
  section.addEventListener('toggle',()=>{if(section.open)void refresh();else controller?.abort();});
  function link(label, href) {
    const anchor = document.createElement('a');anchor.className='header-tool-button'; anchor.textContent = label;
    anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    anchor.href = href;
    anchor.append(viewerIcon('open_in_new')); section.append(anchor); return anchor;
  }
  if(links)link(links.huggingface ? 'Hugging Face' : 'Source file', links.source);
  if (links?.simreadyPath) link('NVIDIA SimReady', nvidiaAssetLink(links.simreadyPath,{repository:links.simreadyRepository}));
  container.append(section);
  return {refresh,refreshFiles,dispose() {disposed=true;revision++;controller?.abort();section.remove();}};
}
