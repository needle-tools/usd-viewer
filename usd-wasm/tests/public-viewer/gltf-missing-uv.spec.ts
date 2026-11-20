import {test,expect} from './test';
import {validateBytes} from 'gltf-validator';

test('textured meshes without a UV channel export the rendered constant coordinate',async({page})=>{
	await page.goto('/?viewer=three&render=basic&file=/test-fixtures/simready/assembly.usda');
	const results=await page.evaluate(async()=>{
		const path='/usd/gltf/simready.js',hydraPath='/usd/create.three.js',runtimePath='/usd/bindings/index.js';
		const {Group,Scene,Mesh,MeshStandardMaterial,PlaneGeometry,CanvasTexture,NearestFilter,SRGBColorSpace,WebGLRenderer,OrthographicCamera,HemisphereLight}=await import('three');
		const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
		const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
		const renderer=new WebGLRenderer();renderer.setSize(64,64);
		const render=(object:any)=>{
			const scene=new Scene();scene.add(object,new HemisphereLight(0xffffff,0xffffff,2));
			const camera=new OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=5;renderer.render(scene,camera);
			const pixels=new Uint8Array(64*64*4),gl=renderer.getContext();gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels);scene.remove(object);return pixels;
		};
		const results=[];
		try{for(const channel of [0,1,3]){
			const image=document.createElement('canvas');image.width=image.height=2;const ctx=image.getContext('2d')!;
			for(const [index,color]of ['red','lime','blue','yellow'].entries()){ctx.fillStyle=color;ctx.fillRect(index%2,Math.floor(index/2),1,1);}
			const map=new CanvasTexture(image);map.channel=channel;map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;map.offset.set(.25,.25);
			const geometry=new PlaneGeometry(2,2);if(channel===0)geometry.deleteAttribute('uv');if(channel===1)geometry.setAttribute('uv2',geometry.attributes.uv);
			const material=new MeshStandardMaterial({map}),mesh=new Mesh(geometry,material);mesh.userData.usdPath='/NoUV';
			const root=new Group();root.add(mesh);const authored=geometry.attributes.uv;
			const snapshot={metersPerUnit:1,kilogramsPerUnit:1,upAxis:'Y',scenes:[],bodies:[],shapes:[],joints:[],materials:[],groups:[],unsupported:[]};
			let native:any;
			try{
				const before=render(root),blob=await(await import(path)).exportSimreadyGltf({handle:{scene:root,ready:async()=>{}},snapshot,exporter:new GLTFExporter(),output:'blob'}),buffer=await blob.arrayBuffer();
				const gltf=await new GLTFLoader().parseAsync(buffer,''),after=render(gltf.scene),node=gltf.scene.children[0].children[0];
				const uv=node.geometry.getAttribute(channel?'uv'+channel:'uv');
				native=await(await import(hydraPath)).createThreeHydra({USD:await(await import(runtimePath)).getUsdModule(),scene:new Group(),renderer,files:[Object.assign(new File([blob],'missing-uv.glb'),{path:'missing-uv.glb'})],autoPlay:false});
				await native.ready();await native.materialsReady();const imported=render(native.scene);
				const error=(pixels:Uint8Array)=>before.reduce((sum,value,index)=>sum+Math.abs(value-pixels[index]),0)/(before.length*255);
				results.push({channel,bytes:[...new Uint8Array(buffer)],uv:uv?[...uv.array]:null,sdkError:error(after),nativeError:error(imported),colored:before[0]!==before[1]||before[1]!==before[2],unchanged:mesh.geometry===geometry&&geometry.attributes.uv===authored&&!geometry.attributes.uv3&&mesh.material===material&&material.map===map});
			}finally{await native?.dispose();geometry.dispose();material.dispose();map.dispose();}
		}}finally{renderer.dispose();renderer.forceContextLoss();}
		return results;
	});
	for(const result of results){
		expect(result.uv).toEqual(new Array(8).fill(0));expect(result.unchanged).toBe(true);expect(result.colored).toBe(true);
		expect(result.sdkError).toBeLessThan(.001);expect(result.nativeError).toBeLessThan(.001);
		const validation=await validateBytes(new Uint8Array(result.bytes));expect(validation.issues.numErrors,JSON.stringify(validation.issues)).toBe(0);
	}
});
