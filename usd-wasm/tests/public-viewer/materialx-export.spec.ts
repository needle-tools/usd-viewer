import {test, expect} from './test';

test('MaterialX names preserve graph connections and texture filenames while avoiding reserved GLSL identifiers', async ({page}) => {
	await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');
	const result = await page.evaluate(async () => {
		const path = '/usd/hydra/materialxNames.js';
		const {portableMaterialXNames} = await import(path);
		const original = `<materialx version="1.39">
			<nodegraph name="Graph__A">
				<image name="Color__A" type="color3"><input name="file" type="filename" value="textures/albedo__a.png"/></image>
				<output name="out" type="color3" nodename="Color__A"/>
			</nodegraph>
			<standard_surface name="Surface__A" type="surfaceshader"><input name="base_color" type="color3" nodegraph="Graph__A" output="out"/></standard_surface>
			<surfacematerial name="Material__A" type="material"><input name="surfaceshader" type="surfaceshader" nodename="Surface__A"/></surfacematerial>
		</materialx>`;
		const normalized = portableMaterialXNames(original, 'Material__A');
		const document = new DOMParser().parseFromString(normalized.xml, 'application/xml');
		const names = [...document.querySelectorAll('[name]')].map(node => node.getAttribute('name'));
		return {
			names,
			image: document.querySelector('image')!.getAttribute('name'),
			imageConnection: document.querySelector('output')!.getAttribute('nodename'),
			graph: document.querySelector('nodegraph')!.getAttribute('name'),
			graphConnection: document.querySelector('standard_surface input')!.getAttribute('nodegraph'),
			material: document.querySelector('surfacematerial')!.getAttribute('name'),
			target: normalized.target,
			filename: document.querySelector('input[type="filename"]')!.getAttribute('value'),
			unchanged: portableMaterialXNames('<materialx><image name="Color"><input name="file" value="albedo__a.png"/></image></materialx>', 0).xml,
		};
	});
	expect(result.names.every(name => !name!.includes('__'))).toBe(true);
	expect(result.imageConnection).toBe(result.image); expect(result.graphConnection).toBe(result.graph);
	expect(result.target).toBe(result.material); expect(result.filename).toBe('textures/albedo__a.png');
	expect(result.unchanged).toBe('<materialx><image name="Color"><input name="file" value="albedo__a.png"/></image></materialx>');
});

test('glTF embeds a raw base-color texture with sRGB pixels and unchanged alpha', async ({page}) => {
	await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');
	const result = await page.evaluate(async () => {
		const {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,DataTexture} = await import('three');
		const {GLTFExporter} = await import('three/addons/exporters/GLTFExporter.js');
		const path = '/usd/gltf/simready.js';
		const {exportSimreadyGltf} = await import(path);
		const texture = new DataTexture(new Uint8Array([128,64,16,96]),1,1);
		const geometry = new BufferGeometry().setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3)).setAttribute('uv',new Float32BufferAttribute([0,0,1,0,0,1],2));
		const mesh = new Mesh(geometry,new MeshStandardMaterial({map:texture}));mesh.userData.usdPath='/Plane';
		const scene = new Group();scene.add(mesh);
		const snapshot = {metersPerUnit:1,kilogramsPerUnit:1,upAxis:'Y',scenes:[],bodies:[],joints:[],materials:[],groups:[],unsupported:[],shapes:[]};
		const blob = await exportSimreadyGltf({handle:{scene,ready:async()=>{},setPlaying(){}},snapshot,exporter:new GLTFExporter(),output:'blob'});
		const buffer = await blob.arrayBuffer(),length = new DataView(buffer).getUint32(12,true);
		const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
		const image = json.images[json.textures[json.materials[0].pbrMetallicRoughness.baseColorTexture.index].source];
		const view = json.bufferViews[image.bufferView];
		const bitmap = await createImageBitmap(new Blob([new Uint8Array(buffer,28+length+(view.byteOffset||0),view.byteLength)],{type:image.mimeType}));
		const canvas = document.createElement('canvas');canvas.width=1;canvas.height=1;
		const context = canvas.getContext('2d')!;context.drawImage(bitmap,0,0);
		const pixels = [...context.getImageData(0,0,1,1).data];bitmap.close();
		geometry.dispose();mesh.material.dispose();texture.dispose();
		return {pixels,source:[...texture.image.data]};
	});
	// Canvas alpha premultiplication can round RGB by one sample.
	for (const [i,value] of [188,137,71,96].entries()) expect(Math.abs(result.pixels[i]-value)).toBeLessThanOrEqual(1);
	expect(result.source).toEqual([128,64,16,96]);
});
