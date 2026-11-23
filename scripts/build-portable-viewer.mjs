import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import { viewerBuild } from './viewer-build.cjs';
import {stampBuild} from '../usd-wasm/scripts/corpus/stamp.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || '.cache/portable-viewer');
await mkdir(dirname(output), {recursive: true});
await mkdir(output);
const generated = new Set(['usd', 'simready', 'materialx', 'mutracer', 'oidn-webgpu', 'dockview', 'three-mesh-bvh', 'rapier', 'test-fixtures']);
await cp(join(root, 'public'), join(output, 'public'), {
	recursive: true,
	mode: constants.COPYFILE_FICLONE,
	filter: path => {
		if (path === join(root, 'public')) return true;
		const parts = path.slice(join(root, 'public').length + 1).split('/');
		return !generated.has(parts[0]) && !parts.some(part => part.startsWith('.'));
	},
});
const copies = {
	usd: 'usd-wasm/src', simready: 'modules/simready/src',
	three: 'node_modules/three', materialx: 'node_modules/@needle-tools/materialx',
	'needle-engine': 'node_modules/@needle-tools/engine', spark: 'node_modules/@sparkjsdev/spark',
	'rapier': 'node_modules/@dimforge/rapier3d-compat/dist',
	'dockview': 'node_modules/dockview-core/dist', 'three-mesh-bvh': 'node_modules/three-mesh-bvh',
	mutracer: 'node_modules/@meimu/mutracer', 'oidn-webgpu': 'node_modules/oidn-webgpu',
	'test-fixtures': 'usd-wasm/tests/fixtures',
};
for (const [target, source] of Object.entries(copies)) {
	await cp(join(root, source), join(output, 'public', target), {
		recursive: true, dereference: true, mode: constants.COPYFILE_FICLONE,
		filter: path => !path.slice(join(root, source).length).split(/[\\/]/).includes('node_modules') && !path.endsWith('.DS_Store'),
	});
}
await cp(join(root, 'usd-wasm/scripts/corpus'), join(output, 'corpus'), {recursive: true, mode: constants.COPYFILE_FICLONE});
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const revision = git(['rev-parse', 'HEAD']);
await writeFile(join(output, 'public', 'viewer-build.json'), JSON.stringify(viewerBuild(root, revision)) + '\n');
await writeFile(join(output, 'build.json'), JSON.stringify({
	viewer: revision, simready: git(['-C', 'modules/simready', 'rev-parse', 'HEAD']),
	dirty: git(['status', '--porcelain']).split('\n').filter(Boolean), createdAt: new Date().toISOString(),
	wasm: JSON.parse(await readFile(join(root, 'usd-wasm/src/bindings/openusd-build-info.json'), 'utf8')),
}, null, 2));
await writeFile(join(output, 'package.json'), JSON.stringify({private: true, type: 'module', dependencies: {playwright: '1.60.0', 'gltf-validator': '2.0.0-dev.3.10'}}, null, 2));
await stampBuild(output);
console.log(output);
