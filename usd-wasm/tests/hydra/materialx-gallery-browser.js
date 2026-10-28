import { Scene, Color, PerspectiveCamera, DirectionalLight, AmbientLight, WebGLRenderer, RenderTarget, WebGLRenderTarget, LinearSRGBColorSpace, NoToneMapping } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { createThreeHydra } from '../../src/create.three.js';
import { getUsdModule } from '../../src/bindings/index.js';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';
import { createMaterialXVolumeMaterial } from '../../src/hydra/materialxVolume.js';

export async function probeGalleryStage({ name, volume }) {
    const renderer = volume ? new WebGPURenderer({ antialias: false, forceWebGL: true }) : new WebGLRenderer({ antialias: false });
    if (volume) await renderer.init();
    renderer.setSize(96, 96);
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    const scene = new Scene();scene.background = new Color(.025,.03,.04);
    const light = new DirectionalLight(0xffffff, volume ? 6 : 2);light.position.set(-.5,.8,1);scene.add(light);
    scene.add(new AmbientLight(0xffffff,.6));
    const camera = new PerspectiveCamera(45,1,.1,20);camera.position.set(0,0,4);
    const USD = await getUsdModule();
    const documents=[];
    const nativeDocuments=[];
    const nodeIdentifiers=[];
    const createSPrim=ThreeRenderDelegateInterface.prototype.createSPrim;
    ThreeRenderDelegateInterface.prototype.createSPrim=function(type,id){
        const prim=createSPrim.call(this,type,id);
        if(type==='material' && prim?.updateMaterialXDocument){
            const updateNode=prim.updateNode;prim.updateNode=function(network,path,parameters){nodeIdentifiers.push(parameters.identifier);return updateNode.call(this,network,path,parameters);};
            const update=prim.updateMaterialXDocument;
            prim.updateMaterialXDocument=function(document){nativeDocuments.push(document.xml);return update.call(this,document);};
            const merge=prim._withAuthoredMaterialXDefinitions;
            prim._withAuthoredMaterialXDefinitions=async function(xml){const result=await merge.call(this,xml);documents.push(result);return result;};
        }
        return prim;
    };
    const handle = await createThreeHydra({ USD, scene, renderer,
        materialXVolumeFactory: volume ? createMaterialXVolumeMaterial : undefined,
        url: new URL(`/tests/fixtures/coverage/materialx/${name}.usda`,location.origin).href,
    });
    const target = volume ? new RenderTarget(96,96) : new WebGLRenderTarget(96,96);
    try {
        await handle.ready();await handle.materialsReady();
        let customSourceAsset;
        if(name==='nested') {
            const stage=handle.driver.GetStage(),prim=stage.GetPrimAtPath('/World/MaterialX/Materials/M/NG/n');
            const attribute=prim.GetAttribute('info:mtlx:sourceAsset');
            customSourceAsset=attribute.GetValueString();attribute.delete();prim.delete();
        }
        const exported = documents.map(xml=>new DOMParser().parseFromString(xml,'application/xml'));
        const exportedDefinitions=[...new Set(exported.flatMap(doc=>[...doc.querySelectorAll('nodedef[name]')].map(el=>el.getAttribute('name'))))];
        const exportedGraphs=[...new Set(exported.flatMap(doc=>[...doc.querySelectorAll('nodegraph[nodedef]')].map(el=>el.getAttribute('name'))))];
        const namedOutputs=[...new Set(exported.flatMap(doc=>[...doc.querySelectorAll('[output]')].map(el=>el.getAttribute('output'))))];
        const featured=[];const materials=[];
        scene.traverse(object => {
            if (!object.isMesh) return;
            const list=Array.isArray(object.material)?object.material:[object.material];
            if (list.some(m=>volume?m.isBoundedVolumeNodeMaterial:m.isMaterialXMaterial||m.constructor.name==='MaterialXMaterial')) {
                featured.push(object);materials.push(...list.map(m=>({type:m.type,class:m.constructor.name,name:m.name})));
            } else object.visible=false;
        });
        const render=async()=>{
            if(volume){renderer.setOutputRenderTarget(target);renderer.render(scene,camera);return Array.from(await renderer.readRenderTargetPixelsAsync(target,0,0,96,96));}
            renderer.setRenderTarget(target);renderer.render(scene,camera);const pixels=new Uint8Array(96*96*4);renderer.readRenderTargetPixels(target,0,0,96,96,pixels);return Array.from(pixels);
        };
        const pixels=await render();featured.forEach(o=>o.visible=false);const empty=await render();
        let changed=0,bright=0,dark=0;const colors=new Set();
        for(let i=0;i<pixels.length;i+=4){
            const delta=Math.max(...[0,1,2].map(c=>Math.abs(pixels[i+c]-empty[i+c])));
            if(delta>5){changed++;colors.add(pixels.slice(i,i+3).map(v=>Math.floor(v/8)).join(','));}
            const value=Math.max(...pixels.slice(i,i+3));if(value>30)bright++;if(value<12)dark++;
        }
        return { name,volume,materials,changed,colors:colors.size,bright,dark,customSourceAsset,nodeIdentifiers,exportedDefinitions,exportedGraphs,namedOutputs,diagnostics:handle.diagnostics(),backend:volume?'WebGPURenderer/WebGL2':'WebGLRenderer' };
    } finally {
        ThreeRenderDelegateInterface.prototype.createSPrim=createSPrim;
        if(volume)renderer.setOutputRenderTarget(null);else renderer.setRenderTarget(null);
        await handle.dispose();target.dispose();renderer.dispose();
    }
}

export function probeConstantTangentTopology() {
    const scene=new Scene();const delegate=new ThreeRenderDelegateInterface({usdRoot:scene,paths:[],driver:()=>null});
    try {
        const prim=delegate.createRPrim('mesh','/ConstantTangent','');
        prim.updatePrimvar('tangents',[1,0,0],3,'constant');
        prim.updateIndices([0,1,2]);prim.updatePoints([0,0,0,1,0,0,0,1,0]);
        const read=()=>{let result;scene.traverse(o=>{if(o.name==='ConstantTangent'){const a=o.geometry.getAttribute('tangent');result={count:a?.count,values:a?Array.from(a.array):[]};}});return result;};
        const initial=read();prim.updateIndices([0,2,1,1,2,0]);prim.updatePoints([0,0,0,2,0,0,0,2,0]);prim.commit();
        return {initial,updated:read()};
    } finally { delegate.dispose(); }
}
