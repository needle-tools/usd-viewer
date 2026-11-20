import {test,expect} from './test';
import {validateBytes} from 'gltf-validator';

test('oversized UDIM export retains source pixels and reloads through both importers',async({page})=>{
	await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');
	const result=await page.evaluate(async()=>{
		const exportPath='/usd/gltf/simready.js',hydraPath='/usd/create.three.js',runtimePath='/usd/bindings/index.js';
		const {Group,Scene,Mesh,MeshStandardMaterial,BufferGeometry,Float32BufferAttribute,CanvasTexture,NearestFilter,SRGBColorSpace,WebGLRenderer,OrthographicCamera,HemisphereLight}=await import('three');
		const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
		const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
		const atlas=document.createElement('canvas');atlas.width=8;atlas.height=4;
		const context=atlas.getContext('2d')!,tiles=new Map<number,any>();
		for(const [index,color]of ['red','lime'].entries()){
			context.fillStyle=color;context.fillRect(index*4,0,4,4);
			const image=document.createElement('canvas');image.width=image.height=4;
			const ctx=image.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,4,4);
			const texture=new CanvasTexture(image);texture.colorSpace=SRGBColorSpace;texture.minFilter=texture.magFilter=NearestFilter;tiles.set(1001+index,texture);
		}
		const map=new CanvasTexture(atlas);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;map.repeat.set(.5,1);map.updateMatrix();
		// Small images exercise the same decision as a large source atlas,
		// without allocating hundreds of megapixels in the regression test.
		map.userData.usdUdim={minU:0,minV:0,columns:2,rows:1,tiles:[1001,1002],sourceTileSize:[32768,32768]};
		const geometry=new BufferGeometry();
		geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,1,0,1,0,0,2,0,0,2,1,0,1,1,0],3));
		geometry.setAttribute('uv',new Float32BufferAttribute([0,0,1,0,1,1,0,1,1,0,2,0,2,1,1,1],2));
		geometry.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);geometry.computeVertexNormals();
		const mesh=new Mesh(geometry,new MeshStandardMaterial({map}));mesh.userData.usdPath='/Plane';const root=new Group();root.add(mesh);
		let disposed=false,atlasRequests=0;const requests:number[]=[];
		const handle={scene:root,ready:async()=>{},createTextureExport:()=>({getTexture:async()=>{atlasRequests++;throw new Error('Oversized atlas must not be loaded');},getUdimTile:async(_texture:any,tile:number)=>{requests.push(tile);return tiles.get(tile);},dispose(){disposed=true;}})};
		const snapshot={metersPerUnit:1,kilogramsPerUnit:1,upAxis:'Y',bodies:[],shapes:[],joints:[],scenes:[],materials:[],groups:[],unsupported:[]};
		const renderer=new WebGLRenderer();renderer.setSize(128,64);let native:any;
		const render=(object:any)=>{
			const scene=new Scene();scene.add(object,new HemisphereLight(0xffffff,0xffffff,2));
			const camera=new OrthographicCamera(0,2,1,0,.1,10);camera.position.set(0,0,5);renderer.render(scene,camera);
			const pixels=new Uint8Array(128*64*4);renderer.getContext().readPixels(0,0,128,64,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);scene.remove(object);return pixels;
		};
		try{
			const before=render(root),blob=await(await import(exportPath)).exportSimreadyGltf({handle,snapshot,exporter:new GLTFExporter(),output:'blob'}),buffer=await blob.arrayBuffer();
			const length=new DataView(buffer).getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length))),dimensions=[];
			for(const image of json.images){const view=json.bufferViews[image.bufferView],bitmap=await createImageBitmap(new Blob([new Uint8Array(buffer,28+length+(view.byteOffset||0),view.byteLength)],{type:image.mimeType}));dimensions.push([bitmap.width,bitmap.height]);bitmap.close();}
			const gltf=await new GLTFLoader().parseAsync(buffer,''),after=render(gltf.scene);
			native=await(await import(hydraPath)).createThreeHydra({USD:await(await import(runtimePath)).getUsdModule(),scene:new Group(),renderer,files:[Object.assign(new File([blob],'islands.glb'),{path:'islands.glb'})],autoPlay:false,maxTextureSize:4});
			await native.ready();await native.materialsReady();const imported=render(native.scene);
			const error=(pixels:Uint8Array)=>before.reduce((total,value,index)=>total+Math.abs(value-pixels[index]),0)/(before.length*255);
			return{bytes:[...new Uint8Array(buffer)],dimensions,triangles:json.meshes.flatMap((mesh:any)=>mesh.primitives).reduce((count:number,primitive:any)=>count+json.accessors[primitive.indices].count/3,0),materials:json.materials.length,sdkError:error(after),nativeError:error(imported),unchanged:mesh.geometry===geometry&&mesh.material.map===map,requests,atlasRequests,disposed};
		}finally{await native?.dispose();renderer.dispose();renderer.forceContextLoss();geometry.dispose();mesh.material.dispose();map.dispose();for(const texture of tiles.values())texture.dispose();}
	});
	expect(result.dimensions).toEqual([[4,4],[4,4]]);expect(result.triangles).toBe(4);expect(result.materials).toBe(2);
	expect(result.sdkError).toBeLessThan(.01);expect(result.nativeError).toBeLessThan(.01);expect(result.unchanged).toBe(true);
	expect(result.requests).toEqual([1001,1002]);expect(result.atlasRequests).toBe(0);expect(result.disposed).toBe(true);
	const validation=await validateBytes(new Uint8Array(result.bytes));expect(validation.issues.numErrors,JSON.stringify(validation.issues)).toBe(0);
});

test('a plain material beside oversized UDIM sections does not duplicate the complete mesh',async({page})=>{
	await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');
	const result=await page.evaluate(async()=>{
		const path='/usd/gltf/simready.js';
		const {Group,Mesh,MeshStandardMaterial,BufferGeometry,Float32BufferAttribute,CanvasTexture}=await import('three');
		const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
		const canvas=document.createElement('canvas');canvas.width=canvas.height=4;const ctx=canvas.getContext('2d')!;ctx.fillStyle='red';ctx.fillRect(0,0,4,4);
		const tile=new CanvasTexture(canvas),atlas=tile.clone();atlas.repeat.set(.5,1);atlas.updateMatrix();
		atlas.userData.usdUdim={minU:0,minV:0,columns:2,rows:1,tiles:[1001,1002],sourceTileSize:[32768,32768]};
		const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([0,0,0,1,0,0,0,1,0,2,0,0,3,0,0,2,1,0],3));
		geometry.setAttribute('uv',new Float32BufferAttribute([.1,.1,.9,.1,.1,.9,1.1,.1,1.9,.1,1.1,.9],2));
		geometry.setIndex([0,1,2,3,4,5]);geometry.computeVertexNormals();geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);
		const textured=new MeshStandardMaterial({map:atlas}),plain=new MeshStandardMaterial({color:0x0000ff});textured.name='Textured';plain.name='Plain';
		const mesh=new Mesh(geometry,[textured,plain]);mesh.userData.usdPath='/Mixed';const scene=new Group();scene.add(mesh);
		const handle={scene,ready:async()=>{},createTextureExport:()=>({getTexture:async()=>{throw new Error('Full atlas must not be loaded');},getUdimTile:async()=>tile,dispose(){}})};
		const snapshot={metersPerUnit:1,kilogramsPerUnit:1,upAxis:'Y',scenes:[],bodies:[],shapes:[],joints:[],materials:[],groups:[],unsupported:[]};
		const blob=await(await import(path)).exportSimreadyGltf({handle,snapshot,exporter:new GLTFExporter(),output:'blob'});
		const buffer=await blob.arrayBuffer(),length=new DataView(buffer).getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
		return{bytes:[...new Uint8Array(buffer)],parts:json.meshes.flatMap((mesh:any)=>mesh.primitives).map((primitive:any)=>({name:json.materials[primitive.material].name,triangles:json.accessors[primitive.indices].count/3,vertices:json.accessors[primitive.attributes.POSITION].count})),sourceIndices:geometry.index!.count,sourceGroups:geometry.groups.length};
	});
	expect(result.parts).toEqual([{name:'Textured',triangles:1,vertices:3},{name:'Plain',triangles:1,vertices:3}]);
	expect(result.sourceIndices).toBe(6);expect(result.sourceGroups).toBe(2);
	const validation=await validateBytes(new Uint8Array(result.bytes));expect(validation.issues.numErrors,JSON.stringify(validation.issues)).toBe(0);
});
