import {serveCorpus} from './server.mjs';
import {readFile, mkdir, rm, stat} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {parseArgs} from 'node:util';
import {createCorpusSession,corpusSessionMetadata} from './session.mjs';
import {writeJsonAtomic} from './files.mjs';
import {createAssetQueue} from './queue.mjs';
import {selectAssets,retainsSuccessfulGlbs,canReuseReport} from './policy.mjs';

const {values} = parseArgs({options: {build: {type: 'string'}, assets: {type: 'string'}, catalogue: {type: 'string'}, output: {type: 'string'}, workers: {type: 'string', default: '2'}, only: {type: 'string'}, file: {type: 'string'}, priority: {type: 'string'}, limit: {type: 'string'}, chrome: {type: 'string'}, port: {type: 'string', default: '0'}, force: {type: 'boolean'}, 'keep-success': {type: 'boolean'}, 'discard-success': {type: 'boolean'}, 'usd-reimport': {type: 'boolean'}, textures: {type: 'string', default: 'original'}}});
for (const name of ['build', 'assets', 'catalogue', 'output']) if (!values[name]) throw new Error(`Missing --${name}`);
const retainSuccess=retainsSuccessfulGlbs(values);
const output = resolve(values.output); await mkdir(output, {recursive: true}); await mkdir(join(output, 'assets'), {recursive: true});
const catalogue = JSON.parse(await readFile(values.catalogue,'utf8'));
const {build,harness,identity,run}=await corpusSessionMetadata(values,catalogue);
const assets=selectAssets(catalogue,values);
await writeJsonAtomic(join(output, 'run.json'), {...run, identity});
await mkdir(join(output,'runs'),{recursive:true});
await writeJsonAtomic(join(output,'runs',run.startedAt.replace(/[:.]/g,'-')+'.json'),{...run,identity});

const server=await serveCorpus({build:resolve(values.build),assets:/^https?:/.test(values.assets)?values.assets:resolve(values.assets),results:output,port:Number(values.port)});
const results = [], takeAsset = createAssetQueue(assets);
let publication = Promise.resolve();
const publish = () => publication = publication.then(async () => {
	const counts = Object.fromEntries(['passed', 'review', 'failed'].map(status => [status, results.filter(result => result.status === status).length]));
	const progress = {identity, expected: assets.length, completed: results.length, statuses: counts, updatedAt: new Date().toISOString()};
	await writeJsonAtomic(join(output, 'progress.json'), progress);
	const completed = new Map(results.map(result => [result.id, result]));
	const index = {...progress, run, assets: assets.map(asset => {
		const result = completed.get(asset.id);
		return {id: asset.id, root: asset.root, status: result?.status || 'pending', bytes: result?.bytes, artifact: result?.artifact, checks: result?.checks, error: result?.error, imageError: result?.imageError, usdImageError: result?.usdImageError, snapshot: result?.snapshot, times: result?.times};
	})};
	await writeJsonAtomic(join(output, 'index.json'), index);
});
await publish();
console.log(JSON.stringify({event: 'start', total: assets.length, identity}));
try {
	await Promise.all(Array.from({length: Number(values.workers)}, async (_, worker) => {
  const session=await createCorpusSession({values,build,identity,harness,server});
  try{
   for(let lease;(lease=await takeAsset());)try{
    const asset=lease.asset,report=join(output,'assets',asset.id+'.json');
    const previous=JSON.parse(await readFile(report,'utf8').catch(()=>'{}'));
    const retained=await stat(join(output,'artifacts',asset.id+'.glb')).catch(()=>null);
    if(!values.force&&canReuseReport(previous,{identity,harnessSha256:harness.sha256,retainSuccess,artifactSize:retained?.size})){results.push(previous);await publish();continue;}
    results.push(await session.run(asset));await publish();
   }finally{lease.release();}
  }finally{await session.close();}
	}));
} finally {await publication;await server.close();}
const summary = {identity, expected: assets.length, completed: results.length, statuses: Object.fromEntries(['passed', 'review', 'failed'].map(status => [status, results.filter(result => result.status === status).length])), assets: results.map(({id, root, status, checks, error, imageError, bytes}) => ({id, root, status, checks, error, imageError, bytes}))};
await writeJsonAtomic(join(output, 'summary.json'), summary);
console.log(JSON.stringify({event: 'complete', ...summary, assets: undefined}));
if (summary.statuses.failed || summary.statuses.review) process.exitCode = 1;
