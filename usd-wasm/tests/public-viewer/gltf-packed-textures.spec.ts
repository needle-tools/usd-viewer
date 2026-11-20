import {test,expect} from './test';

test('materials sharing roughness and metalness images embed one packed image',async({page})=>{
 await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');
 const result=await page.evaluate(async()=>{
  const path='/usd/gltf/simready.js';
  const {Group,Mesh,BoxGeometry,MeshStandardMaterial,DataTexture}=await import('three');
  const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
  const roughness=new DataTexture(new Uint8Array([10,30,50,255]),1,1),metalness=new DataTexture(new Uint8Array([70,80,90,255]),1,1);
  const scene=new Group();
  for(const [i,color]of [0xff0000,0x0000ff].entries()){
   const material=new MeshStandardMaterial({color,roughness:.6,metalness:.4});
   material.roughnessMap=roughness.clone();material.metalnessMap=metalness.clone();
   const mesh=new Mesh(new BoxGeometry(),material);mesh.userData.usdPath='/Mesh'+i;scene.add(mesh);
  }
  const snapshot={metersPerUnit:1,kilogramsPerUnit:1,upAxis:'Y',scenes:[],bodies:[],shapes:[],joints:[],materials:[],groups:[],unsupported:[]};
  const blob=await(await import(path)).exportSimreadyGltf({handle:{scene,ready:async()=>{}},snapshot,exporter:new GLTFExporter(),output:'blob'});
  const buffer=await blob.arrayBuffer(),length=new DataView(buffer).getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
  const pixels=[];
  for(const image of json.images){
   const view=json.bufferViews[image.bufferView],bitmap=await createImageBitmap(new Blob([new Uint8Array(buffer,28+length+(view.byteOffset||0),view.byteLength)],{type:image.mimeType}));
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);pixels.push([...context.getImageData(0,0,1,1).data]);bitmap.close();
  }
  return{pixels,materials:json.materials.map((m:any)=>m.pbrMetallicRoughness),source:[...roughness.image.data]};
 });
 expect(result.pixels).toEqual([[0,30,90,255]]);
 expect(result.materials).toHaveLength(2);
 expect(result.materials.map((m:any)=>m.metallicRoughnessTexture.index)).toEqual([0,0]);
 expect(result.materials.map((m:any)=>m.baseColorFactor)).toEqual([[1,0,0,1],[0,0,1,1]]);
 for(const material of result.materials){expect(material.roughnessFactor).toBe(.6);expect(material.metallicFactor).toBe(.4);}
 expect(result.source).toEqual([10,30,50,255]);
});

test('pixel-backed normal maps bake signed scales without losing channels to unused alpha',async({page})=>{
	await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');
	const result=await page.evaluate(async()=>{
		const path='/usd/gltf/simready.js';
		const {Group,Mesh,BoxGeometry,MeshStandardMaterial,DataTexture}=await import('three');
		const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
		const normal=new DataTexture(new Uint8Array([12,34,56,0]),1,1),scene=new Group();
		for(const [index,x]of [1,-1].entries()){
			const material=new MeshStandardMaterial({normalMap:normal});material.normalScale.set(x,1);
			const mesh=new Mesh(new BoxGeometry(),material);mesh.userData.usdPath='/Normal'+index;scene.add(mesh);
		}
		const snapshot={metersPerUnit:1,kilogramsPerUnit:1,upAxis:'Y',scenes:[],bodies:[],shapes:[],joints:[],materials:[],groups:[],unsupported:[]};
		const blob=await(await import(path)).exportSimreadyGltf({handle:{scene,ready:async()=>{}},snapshot,exporter:new GLTFExporter(),output:'blob'});
		const buffer=await blob.arrayBuffer(),length=new DataView(buffer).getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length))),pixels=[];
		for(const material of json.materials){
			const image=json.images[json.textures[material.normalTexture.index].source],view=json.bufferViews[image.bufferView];
			const bitmap=await createImageBitmap(new Blob([new Uint8Array(buffer,28+length+(view.byteOffset||0),view.byteLength)],{type:image.mimeType}));
			const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d')!;context.drawImage(bitmap,0,0);pixels.push([...context.getImageData(0,0,1,1).data]);bitmap.close();
		}
		return{pixels,source:[...normal.image.data],scales:scene.children.map((mesh:any)=>mesh.material.normalScale.toArray())};
	});
	expect(result.pixels).toEqual([[12,221,56,255],[243,221,56,255]]);
	expect(result.source).toEqual([12,34,56,0]);expect(result.scales).toEqual([[1,1],[-1,1]]);
});
