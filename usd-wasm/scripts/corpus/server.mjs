import {createServer} from 'node:http';
import {createReadStream, createWriteStream} from 'node:fs';
import {stat, mkdir, unlink} from 'node:fs/promises';
import {replaceFile} from './files.mjs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {resolve, join, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const types = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary'};
export async function serveCorpus({build, assets, results, port = 0}) {
	const code = fileURLToPath(new URL('./', import.meta.url));
	await mkdir(join(results, 'artifacts'), {recursive: true});
	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url, 'http://localhost');
			if (url.pathname === '/gpu.html') {
				response.setHeader('Content-Type', 'text/html');
				response.setHeader('Cache-Control', 'no-store');
				response.end('<!doctype html><meta charset="utf-8"><title>GPU initialization</title><body></body>'); return;
			}
			response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
			response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
			response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
			response.setHeader('Access-Control-Allow-Origin', '*');
			response.setHeader('Cache-Control', 'no-cache');
			if (request.method === 'POST' && /^\/artifacts\/[a-f0-9]{20}\.(glb|source\.png|imported\.png|usd\.png)$/.test(url.pathname)) {
				const file = join(results, url.pathname.slice(1)), temp = file + '.partial';
				try {
					await pipeline(request, createWriteStream(temp));
					await replaceFile(temp, file);
				} finally {
					await unlink(temp).catch(error => {if (error.code !== 'ENOENT') throw error;});
				}
				response.writeHead(201).end(); return;
			}
			if (!['GET', 'HEAD'].includes(request.method)) {response.writeHead(405).end(); return;}
			let root = join(build, 'public'), pathname = decodeURIComponent(url.pathname);
			if (pathname === '/corpus.html') {
				response.setHeader('Content-Type', 'text/html');
				response.end(`<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/":"/three/","three/addons/":"/three/examples/jsm/","closed-chain-ik/core":"/modules/kinematics.js","@needle-tools/materialx":"/materialx/index.js","@needle-tools/simready":"/simready/index.js","@needle-tools/simready/gltf":"/simready/gltf.js"}}</script><script type="module">import {runAsset} from '/corpus/browser.js'; window.runAsset=runAsset;</script>`); return;
			}
			if (pathname.startsWith('/assets/') && /^https?:/.test(assets)) {
				const upstream = await fetch(assets.replace(/\/$/, '') + url.pathname.slice(7));
				response.writeHead(upstream.status, Object.fromEntries(['content-type', 'content-length'].map(key => [key, upstream.headers.get(key)]).filter(([, value]) => value)));
				await pipeline(Readable.fromWeb(upstream.body), response); return;
			}
			if (pathname.startsWith('/assets/')) {root = assets; pathname = pathname.slice(7);}
			else if (pathname.startsWith('/corpus/')) {root = code; pathname = pathname.slice(7);}
			else if (pathname.startsWith('/artifacts/')) root = results;
			else if (pathname.startsWith('/reports/')) {root = results; pathname = pathname.slice(8);}
			else if (pathname.startsWith('/needle-three/')) pathname = '/three/' + pathname.slice(14);
			if (pathname === '/') pathname = '/index.html';
			const file = resolve(root, '.' + pathname);
			if (!file.startsWith(resolve(root) + sep)) {response.writeHead(403).end(); return;}
			const info = await stat(file);
			if (!info.isFile()) {response.writeHead(404).end(); return;}
			response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
			response.setHeader('Content-Length', info.size);
			if (request.method === 'HEAD') response.end();
			else {
				const stream = createReadStream(file);
				response.once('close', () => stream.destroy());
				stream.on('error', error => response.destroy(error)).pipe(response);
			}
		} catch (error) {if (!response.headersSent) response.writeHead(error.code === 'ENOENT' ? 404 : 500); response.end(String(error.message));}
	});
	await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
	return {origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => {server.close(resolve); server.closeAllConnections();})};
}
