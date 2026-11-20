import {createHash} from 'node:crypto';
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function stampBuild(root) {
	const files = [];
	async function walk(relative) {
		for (const entry of await readdir(join(root, relative), {withFileTypes: true})) {
			const path = relative + '/' + entry.name;
			if (entry.isDirectory()) await walk(path);
			else if (entry.isFile()) files.push(path.slice(1));
		}
	}
	await walk('/public'); await walk('/corpus');
	const hash = createHash('sha256'), entries = [];
	for (const path of files.sort()) {
		const data = await readFile(join(root, path)), sha256 = createHash('sha256').update(data).digest('hex');
		hash.update(path + '\0' + sha256 + '\n'); entries.push({path, bytes: data.length, sha256});
	}
	const build = JSON.parse(await readFile(join(root, 'build.json'), 'utf8'));
	build.runtimes = {};
	for (const [profile, suffix] of [['asyncify', ''], ['jspi', '.jspi']]) {
		const prefix = 'public/usd/bindings/';
		build.runtimes[profile] = {
			build: JSON.parse(await readFile(join(root, prefix + 'openusd-build-info' + suffix + '.json'), 'utf8')),
			wasmSha256: entries.find(entry => entry.path === prefix + 'emHdBindings' + suffix + '.wasm').sha256,
			javascriptSha256: entries.find(entry => entry.path === prefix + 'emHdBindings' + suffix + '.js').sha256,
		};
	}
	build.wasm = build.runtimes.asyncify.build;
	build.contentSha256 = hash.digest('hex');
	await writeFile(join(root, 'build-files.json'), JSON.stringify(entries));
	await writeFile(join(root, 'build.json'), JSON.stringify(build, null, 2));
	return build;
}
