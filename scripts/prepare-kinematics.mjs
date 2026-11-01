import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {existsSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
const outfile=fileURLToPath(new URL('../public/modules/kinematics.js',import.meta.url));
const result=await build({
 entryPoints:[fileURLToPath(import.meta.resolve('closed-chain-ik/core'))],outfile,
 bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked',metafile:true,
 footer:{js:'/* Third-party licenses: kinematics.js.LICENSE.txt */'},
});
const roots=new Set();
for(const input of Object.keys(result.metafile.inputs)){
 let folder=dirname(resolve(input));
 while(!existsSync(join(folder,'package.json'))&&dirname(folder)!==folder)folder=dirname(folder);
 if(existsSync(join(folder,'package.json')))roots.add(folder);
}
const notices=[];
for(const folder of [...roots].sort()){
 const pkg=JSON.parse(readFileSync(join(folder,'package.json'),'utf8'));
 const license=readdirSync(folder).find(name=>/^licen[cs]e(?:$|\.)/i.test(name));
 const text=license?readFileSync(join(folder,license),'utf8'):pkg.license?`License declared by package.json: ${pkg.license}\n${readFileSync(join(folder,'README.md'),'utf8').match(/# License[\s\S]*$/i)?.[0]||''}`:null;
 if(!text)throw new Error(`Missing bundled license for ${pkg.name}`);
 notices.push(`${pkg.name} ${pkg.version}\n${JSON.stringify(pkg.repository||pkg.homepage||'')}\n\n${text}`);
}
writeFileSync(outfile+'.LICENSE.txt',notices.join('\n\n----------------------------------------\n\n'));
