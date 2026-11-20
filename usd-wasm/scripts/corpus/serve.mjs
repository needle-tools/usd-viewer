import {parseArgs} from 'node:util';
import {resolve} from 'node:path';
import {serveCorpus} from './server.mjs';
const {values} = parseArgs({options: {build: {type:'string'}, assets: {type:'string'}, results: {type:'string'}, port: {type:'string',default:'8770'}}});
for (const name of ['build','assets','results']) if (!values[name]) throw new Error(`Missing --${name}`);
const server = await serveCorpus({build:resolve(values.build),assets:/^https?:/.test(values.assets)?values.assets:resolve(values.assets),results:resolve(values.results),port:Number(values.port)});
console.log(server.origin);
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async()=>{await server.close();process.exit();});
