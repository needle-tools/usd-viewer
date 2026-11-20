import {Scene, Group, WebGLRenderer, OrthographicCamera, HemisphereLight, DirectionalLight, Box3, Vector3, Matrix4, Quaternion, Color, SRGBColorSpace} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {getUsdModule} from '/usd/bindings/index.js';
import {createThreeHydra} from '/usd/create.three.js';
import {readUsdPhysics} from '/usd/physics/readPhysics.js';
import {exportSimreadyGltf} from '/usd/gltf/simready.js';
import {registerSimreadyLoader, toGltfPhysicsSnapshot} from '@needle-tools/simready/gltf';
import {ThreeRenderDelegateInterface} from '/usd/hydra/ThreeJsRenderDelegate.js';
import {geometryStats} from './geometry.mjs';
import {previewPngTextures} from './texture-preview.mjs';
import {withPngBitmapPreview} from './bitmap-preview.mjs';
import {createPngDownsampler} from '/usd/hydra/pngTexture.js';
import {setVariant} from '/usd/scene/index.js';
import {applyAssetProfile, checkProfileApproximations} from './profiles.mjs';
import {capturePolicy,requireHardwareRenderer} from './rendering.mjs';

let retainedRenderer;
const encodePath = path => path.split('/').map(encodeURIComponent).join('/');
const clean = value => JSON.parse(JSON.stringify(value, (_key, value) => ArrayBuffer.isView(value) ? Array.from(value) : value));
function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
	return value;
}
async function render(root, renderer) {
	const scene = new Scene(); scene.background = new Color(.12, .12, .12); scene.add(root);
	const light = new DirectionalLight(0xffffff, 3); light.position.set(3, 4, 5); scene.add(light, new HemisphereLight(0xffffff, 0x555555, 2));
	root.updateMatrixWorld(true);
	const visible = geometryStats(root, root.matrixWorld).bounds;
	const box = visible ? new Box3(new Vector3(...visible[0]), new Vector3(...visible[1])) : new Box3().setFromObject(root);
	const center = box.getCenter(new Vector3()), radius = Math.max(box.getSize(new Vector3()).length() / 2, .001);
	const camera = new OrthographicCamera(-radius, radius, radius, -radius, radius / 100, radius * 10);
	camera.position.copy(center).add(new Vector3(3, 2, 4).normalize().multiplyScalar(radius * 3)); camera.lookAt(center);
	renderer.render(scene, camera);
	const pixels = new Uint8Array(256 * 256 * 4); renderer.getContext().readPixels(0, 0, 256, 256, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, pixels);
	const png = await new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/png'));
	scene.remove(root); return {pixels, png};
}
async function upload(id, suffix, data) {
	const result = await fetch(`/artifacts/${id}.${suffix}`, {method: 'POST', body: data});
	if (!result.ok) throw new Error(`Evidence upload failed: ${result.status}: ${await result.text()}`);
}
function pixelError(a, b) {
	let error = 0;
	for (let index = 0; index < a.length; index++) if (index % 4 !== 3) error += Math.abs(a[index] - b[index]);
	return error / (256 * 256 * 3 * 255);
}
function materialInfo(material) {
	const colors=['color','emissive','attenuationColor','specularColor'];
	return {name:material.name,type:material.type,...Object.fromEntries(colors.map(key=>[key,material[key]?.toArray()])),...Object.fromEntries(['roughness','metalness','opacity','transmission','thickness','attenuationDistance','ior','emissiveIntensity','clearcoat','clearcoatRoughness','side','transparent','alphaTest'].map(key=>[key,material[key]])),maps:Object.keys(material).filter(key=>material[key]?.isTexture)};
}
function boundsError(a, b) {
	if (!a || !b) return Infinity;
	const size = new Vector3(...a[1]).sub(new Vector3(...a[0])).length();
	const error = Math.max(...a.flat().map((value, i) => Math.abs(value - b.flat()[i])));
	return error > Math.max(1e-5, size * 1e-5) ? error : 0;
}
export async function runAsset({asset, textureResolution = 'original', reimportUsd = false}) {
	const times = {}, started = performance.now(), check = [], warnings = [];
	const phase = name => {times[name] = performance.now() - started; window.corpusPhase = name; console.info('[corpus-phase] ' + name);};
	const renderer = retainedRenderer ??= new WebGLRenderer({preserveDrawingBuffer: true, antialias: false,powerPreference:'high-performance'}); renderer.setSize(256, 256); renderer.outputColorSpace = SRGBColorSpace;
	let handle, importedHandle;
	const materialX = [];
	const createSPrim = ThreeRenderDelegateInterface.prototype.createSPrim;
	ThreeRenderDelegateInterface.prototype.createSPrim = function(type, id) {
		const prim = createSPrim.call(this, type, id);
		if (type === 'material') {
			const update = prim.updateMaterialXDocument, resolve = prim._resolveMaterialTexturePath;
			prim.updateMaterialXDocument = function(document) {materialX.push({id, document}); return update.call(this, document);};
			prim._resolveMaterialTexturePath = function(path) {const resolved = resolve.call(this, path); if (this._materialXDocuments.length) materialX.push({id, path, resolved}); return resolved;};
		}
		return prim;
	};
	try {
		const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
		const rendererName=requireHardwareRenderer(debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):'');
		phase('runtime'); const USD = await getUsdModule({wasmMemory:new WebAssembly.Memory({initial:256,maximum:65536,shared:true})});
		const runtimeBuild = JSON.parse(USD.GetBuildInfoJson());
		phase('load'); handle = await createThreeHydra({USD, scene: new Group(), renderer, url: location.origin + '/assets/' + encodePath(asset.root), autoPlay: false, maxTextureSize: 512});
		await handle.ready(); await handle.materialsReady();
		await applyAssetProfile(handle, asset, setVariant);
		const diagnostics = handle.diagnostics();
		if (diagnostics.materialFallbacks || diagnostics.pendingMaterialAssignments) warnings.push({reason: 'USD material fallback or pending binding', diagnostics});
		const sourceMaterials = [], sourceMeshes = [], seenMaterials = new Set();
		handle.scene.traverseVisible(object => {
			if (!object.isMesh) return;
			sourceMeshes.push({path: object.userData.usdPath, groups: object.geometry.groups, materials: [object.material].flat().map(material => ({name: material.name, vertexColors: material.vertexColors}))});
			for (const material of [object.material].flat()) if (material && !seenMaterials.has(material)) {
				seenMaterials.add(material);
				sourceMaterials.push({...materialInfo(material),path:object.userData.usdPath});
			}
		});
		seenMaterials.clear();
		phase('physics'); const snapshot = await readUsdPhysics(handle);
		checkProfileApproximations(snapshot, asset);
		for (const shape of snapshot.shapes) if (shape.type === 'mesh' && !shape.points?.length) Object.assign(shape, await handle.readStage((_stage, driver) => driver.GetPhysicsMeshBuffers(shape.path)));
		const up = snapshot.upAxis === 'Z' ? new Vector3(0, 0, 1) : snapshot.upAxis === 'X' ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
		const conversion = new Matrix4().compose(new Vector3(), new Quaternion().setFromUnitVectors(up, new Vector3(0, 1, 0)), new Vector3().setScalar(snapshot.metersPerUnit));
		const source = geometryStats(handle.scene, conversion);
		if (!source.primitives || !source.triangles) check.push('Source has no rendered triangle geometry.');
		// createThreeHydra already presents the stage in Y-up. The explicit
		// conversion above is only for statistics measured below that root.
		phase('source-image'); const before = await render(handle.scene, renderer); await upload(asset.id, 'source.png', before.png);
		phase('export'); let blob = await exportSimreadyGltf({handle, snapshot, exporter: new GLTFExporter(), textureResolution, output: 'blob', onProgress: event => phase('export:' + event.phase)});
		const exportedBytes = blob.size;
		await upload(asset.id, 'glb', blob);
		blob = null; await handle.dispose(); handle = null;
		phase('reimport');
		const loader = new GLTFLoader();
		loader.register(parser => {
			// Match the USD preview budget while validating full-resolution files.
			parser.textureLoader.setOptions?.({...parser.textureLoader.options, resizeQuality: 'high'});
			previewPngTextures(parser, 512);
			return {name: 'CORPUS_PREVIEW_TEXTURES'};
		});
		registerSimreadyLoader(loader);
		let gltf = await withPngBitmapPreview(() => loader.loadAsync(`/artifacts/${asset.id}.glb`), createPngDownsampler());
		const imported = geometryStats(gltf.scene);
		phase('import-image'); const after = await render(gltf.scene, renderer); await upload(asset.id, 'imported.png', after.png);
		if (source.triangles !== imported.triangles) check.push(`Triangle count changed: ${source.triangles} -> ${imported.triangles}`);
		const worldError = boundsError(source.bounds, imported.bounds);
		if (worldError) check.push(`World bounds changed by ${worldError} metres.`);
		let runtime = gltf.userData.simready;
		const mappingIssues = clean(runtime?.mappingIssues || []);
		if (!runtime) check.push('Export lost the SimReady runtime.');
		else {
			const expected = clean(toGltfPhysicsSnapshot(snapshot)), actual = clean(runtime.snapshot);
			for (const shape of expected.shapes) if (shape.points) shape.points = shape.points.map(Math.fround);
			for (const key of ['bodies', 'joints', 'shapes', 'materials', 'scenes', 'groups', 'articulations', 'unsupported']) {
				if (JSON.stringify(canonical(expected[key])) !== JSON.stringify(canonical(actual[key]))) check.push(`Physics ${key} changed during round trip.`);
			}
			phase('mechanism'); const mechanism = await runtime.createMechanism();
			try {warnings.push(...mechanism.unsupported);} finally {mechanism.dispose();}
		}
		const imageError = pixelError(before.pixels, after.pixels);
		const materials = (gltf.parser.json.materials || []).map(material => ({name: material.name, alphaMode: material.alphaMode || 'OPAQUE', extensions: Object.keys(material.extensions || {}), pbr: material.pbrMetallicRoughness}));
		const extensions = gltf.parser.json.extensionsUsed || [];
		const disposed = new Set();
		gltf.scene.traverse(object => {
			object.geometry?.dispose();
			for (const material of [object.material].flat()) if (material && !disposed.has(material)) {
				disposed.add(material);
				for (const value of Object.values(material)) if (value?.isTexture && !disposed.has(value)) {disposed.add(value); value.dispose(); value.image?.close?.();}
				material.dispose();
			}
		});
		disposed.clear(); renderer.renderLists.dispose();
		gltf = null; runtime = null;
		let usdImported, usdImageError;const usdMaterials=[];
		if (reimportUsd) {
			phase('usd-reimport'); const wrapper = `#usda 1.0\n(upAxis="Y"\nmetersPerUnit=1)\ndef Xform "Asset" (prepend references = @${location.origin}/artifacts/${asset.id}.glb@) {}`;
			importedHandle = await createThreeHydra({USD, scene: new Group(), renderer, buffer: new TextEncoder().encode(wrapper), url: 'roundtrip.usda', autoPlay: false, maxTextureSize: 512});
			await importedHandle.ready(); await importedHandle.materialsReady();
			const materials=new Set();importedHandle.scene.traverseVisible(object=>{for(const material of [object.material].flat())if(material&&!materials.has(material)){materials.add(material);usdMaterials.push(materialInfo(material));}});materials.clear();
			usdImported = geometryStats(importedHandle.scene);
			if (!usdImported.triangles) check.push('USD glTF importer produced no geometry.');
			else if (usdImported.triangles !== imported.triangles) check.push(`USD glTF importer changed triangle count: ${imported.triangles} -> ${usdImported.triangles}`);
			const usdBoundsError = boundsError(imported.bounds, usdImported.bounds);
			if (usdBoundsError) check.push(`USD glTF importer changed world bounds by ${usdBoundsError} metres.`);
			phase('usd-import-image'); const usdImage = await render(importedHandle.scene, renderer);
			await upload(asset.id, 'usd.png', usdImage.png); usdImageError = pixelError(after.pixels, usdImage.pixels);
		}
		phase('complete');
		return {renderer:rendererName,capturePolicy,checks: check, warnings, mappingIssues, diagnostics, sourceMaterials, sourceMeshes, materialX, source, imported, usdImported, usdMaterials, imageError, usdImageError, bytes: exportedBytes, times, runtimeBuild, wasmMemoryBytes: USD.wasmMemory?.buffer.byteLength, snapshot: {bodies: snapshot.bodies.length, shapes: snapshot.shapes.length, joints: snapshot.joints.length, articulations: snapshot.articulations?.length || 0}, materials, extensions};
	} finally {ThreeRenderDelegateInterface.prototype.createSPrim = createSPrim; await importedHandle?.dispose(); await handle?.dispose(); renderer.renderLists.dispose();}
}
