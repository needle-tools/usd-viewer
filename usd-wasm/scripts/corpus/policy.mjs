import {basename} from 'node:path';

export function selectAssets(catalogue, values) {
 let assets=[...catalogue.assets].sort((a,b)=>a.root.localeCompare(b.root));
 if(values.file){
  if(values.only||values.limit)throw new Error('--file cannot be combined with --only or --limit.');
  const name=values.file.replaceAll('\\','/');
  const exact=assets.filter(a=>a.id===name||a.root===name);
  assets=exact.length?exact:assets.filter(a=>basename(a.root)===name);
  if(assets.length!==1)throw new Error(`--file must identify exactly one asset; matched ${assets.length}. Use the asset ID or full catalogue path.`);
 }else if(values.only)assets=assets.filter(asset=>values.only.split(',').some(name=>asset.root.includes(name)||asset.id===name));
 if(values.priority){const first=values.priority.split(',').filter(Boolean),rank=asset=>{const n=first.findIndex(name=>asset.id===name||asset.root.includes(name));return n<0?first.length:n;};assets.sort((a,b)=>rank(a)-rank(b));}
 if(values.limit)assets=assets.slice(0,Number(values.limit));
 if(!assets.length)throw new Error('No assets matched the requested selection.');
 return assets;
}

export function retainsSuccessfulGlbs(values) {
 if(values['keep-success']&&values['discard-success'])throw new Error('Choose either --keep-success or --discard-success.');
 return !values['discard-success'];
}

export function canReuseReport(report,{identity,harnessSha256,retainSuccess,artifactSize}) {
 if(report.identity!==identity||report.harness?.sha256!==harnessSha256)return false;
 if(!['passed','review'].includes(report.status))return false;
 if(retainSuccess&&['passed','review'].includes(report.status))return report.artifact===true&&artifactSize>0&&artifactSize===report.bytes;
 return true;
}
