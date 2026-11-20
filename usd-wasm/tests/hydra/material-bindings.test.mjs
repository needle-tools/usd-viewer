import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DataTexture, Group, Matrix4, MeshPhysicalMaterial } from 'three';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';

function setup() {
    const delegate = new ThreeRenderDelegateInterface({ usdRoot: new Group() });
    const mesh = delegate.createRPrim('mesh', '/Panel');
    mesh.updatePoints([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    mesh.updateIndices([0, 1, 2, 0, 2, 3]);
    mesh.setVisibilityState(true);
    return { delegate, mesh };
}

async function preview(delegate, id, color) {
    const material = delegate.createSPrim('material', id);
    material.beginMaterialSync();
    material.updateNode('surface', `${id}/Preview`, { identifier: 'UsdPreviewSurface', diffuseColor: color });
    material.updateFinished('surface', []);
    await delegate.waitForMaterialsReady();
    return material;
}

test('UsdUVTexture factors remain linear material multipliers for color and packed scalar maps',async()=>{
 const delegate=new ThreeRenderDelegateInterface({usdRoot:new Group()});
 const texture=new DataTexture(new Uint8Array([255,128,64,255]),1,1);
 delegate.registry.getTexture=async()=>texture;
 const material=delegate.createSPrim('material','/Scaled');material.beginMaterialSync();
 material.updateNode('surface','/Scaled/PBR',{identifier:'UsdPreviewSurface'});
 material.updateNode('surface','/Scaled/Texture',{identifier:'UsdUVTexture',file:'color.png',sourceColorSpace:'sRGB',scale:[.2,.3,.4,1],bias:[0,0,0,0]});
 material.updateFinished('surface',[
  {inputId:'/Scaled/Texture',inputName:'rgb',outputId:'/Scaled/PBR',outputName:'diffuseColor'},
  {inputId:'/Scaled/Texture',inputName:'g',outputId:'/Scaled/PBR',outputName:'roughness'},
  {inputId:'/Scaled/Texture',inputName:'b',outputId:'/Scaled/PBR',outputName:'metallic'},
 ]);
 await delegate.waitForMaterialsReady();
 assert.deepEqual(material._material.color.toArray(),[.2,.3,.4]);assert.equal(material._material.roughness,.3);assert.equal(material._material.metalness,.4);
 assert.deepEqual([...texture.image.data],[255,128,64,255]);delegate.dispose();
});

test('repeated image derivations share pixels while keeping their UV transforms and channel mappings separate',async()=>{
 const delegate=new ThreeRenderDelegateInterface({usdRoot:new Group()});
 const texture=new DataTexture(new Uint8Array([10,20,30,255]),1,1);delegate.registry.getTexture=async()=>texture;
 const make=async(id,scale)=>{
  const material=delegate.createSPrim('material',id);material.beginMaterialSync();
  material.updateNode('surface',id+'/PBR',{identifier:'UsdPreviewSurface'});
  material.updateNode('surface',id+'/Texture',{identifier:'UsdUVTexture',file:'channels.png',sourceColorSpace:'raw'});
  material.updateNode('surface',id+'/UV',{identifier:'UsdTransform2d',scale:[scale,scale]});
  material.updateFinished('surface',[
   {inputId:id+'/Texture',inputName:'r',outputId:id+'/PBR',outputName:'roughness'},
   {inputId:id+'/Texture',inputName:'r',outputId:id+'/PBR',outputName:'metallic'},
   {inputId:id+'/UV',inputName:'result',outputId:id+'/Texture',outputName:'st'},
  ]);await delegate.waitForMaterialsReady();return material._material;
 };
 const first=await make('/First',1),second=await make('/Second',3);
 assert.notEqual(first.roughnessMap,second.roughnessMap);assert.equal(first.roughnessMap.source,second.roughnessMap.source);
 assert.notEqual(first.roughnessMap.source,first.metalnessMap.source);
 assert.deepEqual([...first.roughnessMap.image.data],[10,10,30,255]);assert.deepEqual([...first.metalnessMap.image.data],[10,20,10,255]);
 assert.deepEqual(first.roughnessMap.repeat.toArray(),[1,1]);assert.deepEqual(second.roughnessMap.repeat.toArray(),[3,3]);
 assert.deepEqual([...texture.image.data],[10,20,30,255]);delegate.dispose();
});

test('fragmented material sections bind and refresh without preparing every slot after every assignment',async()=>{
 const delegate=new ThreeRenderDelegateInterface({usdRoot:new Group()}),mesh=delegate.createRPrim('mesh','/Fragmented');
 const count=4000,positions=Float32Array.from({length:count*9},(_,i)=>i%3===0?Math.floor(i/9):i%3===1?(i%9===4?1:0):0);
 mesh.updatePoints(positions);mesh.updateIndices(Uint32Array.from({length:count*3},(_,i)=>i));mesh.setVisibilityState(true);
 const materials=await Promise.all([0,1,2,3].map(i=>preview(delegate,'/Material'+i,[i/4,.5,.2])));
 const prepare=delegate.prepareMeshMaterialGeometry.bind(delegate);let preparations=0;
 delegate.prepareMeshMaterialGeometry=(...args)=>{assert.ok(++preparations<=64,'preparation must scale with material changes, not pairs of face sections');return prepare(...args);};
 mesh.setGeomSubsetMaterial(Array.from({length:count},(_,i)=>({start:i*3,length:3,materialId:'/Material'+i%4})));
 assert.equal(mesh._geometry.groups.length,count);assert.equal(mesh._mesh.material.length,count+1);
 for(let i=0;i<count;i++){assert.equal(mesh._geometry.groups[i].materialIndex,i+1);assert.equal(mesh._mesh.material[i+1],materials[i%4]._material);}
 materials[0].clearMaterial();
 for(let i=0;i<count;i+=4)assert.equal(mesh._mesh.material[i+1],mesh._ownedMaterial);
 delegate.dispose();
});

test('asynchronously resolved surfaces replace the fallback on existing instance batches', async () => {
	const {delegate, mesh} = setup();
	const material = delegate.createSPrim('material', '/Authored');
	let resolveMaterial;
	material.createMaterialXMaterial = () => new Promise(resolve => {resolveMaterial = resolve;});
	material.beginMaterialSync();
	material.updateMaterialXDocument({terminal: 'surface', xml: '<materialx/>'});
	mesh.setMaterial('/Authored');
	material.updateFinished('surface', []);
	mesh.setInstanceTransforms(new Matrix4().elements, 1, true);
	mesh.commit();
	const instance = mesh._instancedMesh, original = instance.material;
	const resolved = new MeshPhysicalMaterial({color: 0xff7700});
	resolveMaterial(resolved);
	await delegate.waitForMaterialsReady();
	assert.equal(mesh._instancedMesh, instance, 'material completion must retain the instance batch');
	assert.equal(mesh._mesh.material, resolved);
	assert.notEqual(resolved, original);
	assert.equal(instance.material, resolved, 'visible instances must receive the completed surface');
	material.clearMaterial();
	assert.equal(instance.material, mesh._ownedMaterial, 'clearing a surface also reaches its instances');
	delegate.dispose();
});

test('unsupported material bindings show geometry after draw and can resolve on a later draw', async () => {
    const { delegate, mesh } = setup();
    delegate.beginHydraDraw();
    mesh.setMaterial('/MDL');
    assert.equal(mesh._mesh.visible, false, 'wait until all sprims in this draw have arrived');
    delegate.endHydraDraw();
    assert.equal(mesh._mesh.visible, true, 'unsupported shading must not hide geometry forever');
    assert.equal(delegate.getDiagnostics().materialFallbacks, 1);
    const material = await preview(delegate, '/MDL', [0, 1, 0]);
    assert.equal(mesh._mesh.visible, true);
    assert.equal(mesh._mesh.material, material._material);
    delegate.dispose();
});

test('a supported material keeps its readiness barrier across the end of a draw', async () => {
    const { delegate, mesh } = setup();
    delegate.beginHydraDraw();
    mesh.setMaterial('/Supported');
    const material = delegate.createSPrim('material', '/Supported');
    delegate.endHydraDraw();
    assert.equal(mesh._mesh.visible, false);
    material.updateNode('surface', '/Supported/Preview', { identifier: 'UsdPreviewSurface', diffuseColor: [1, 0, 0] });
    material.updateFinished('surface', []);
    await delegate.waitForMaterialsReady();
    assert.equal(mesh._mesh.visible, true);
    assert.equal(delegate.getDiagnostics().materialFallbacks, 0);
    delegate.dispose();
});

test('subset sections keep their slots, object identity, and late material assignments', async () => {
    const { delegate, mesh } = setup();
    const object = mesh._mesh;
    delegate.beginHydraDraw();
    mesh.setGeomSubsetMaterial([
        { start: 0, length: 3, materialId: '/Late' },
        { start: 3, length: 3, materialId: '/Unsupported' },
    ]);
    const material = await preview(delegate, '/Late', [0, 0, 1]);
    delegate.endHydraDraw();
    assert.equal(mesh._mesh, object, 'material assignment must preserve mesh identity and instancing hooks');
    assert.deepEqual(mesh._geometry.groups, [
        { start: 0, count: 3, materialIndex: 1 },
        { start: 3, count: 3, materialIndex: 2 },
    ]);
    assert.equal(object.material[1], material._material);
    assert.equal(object.material[2], mesh._ownedMaterial);
    assert.equal(object.visible, true);
    delegate.dispose();
});

test('one late material can occupy multiple slots without replacing the material array', async () => {
    const { delegate, mesh } = setup();
    delegate.beginHydraDraw();
    mesh.setGeomSubsetMaterial([
        { start: 0, length: 3, materialId: '/Shared' },
        { start: 3, length: 3, materialId: '/Shared' },
    ]);
    const material = await preview(delegate, '/Shared', [1, 0, 0]);
    delegate.endHydraDraw();
    assert.equal(mesh._mesh.material[1], material._material);
    assert.equal(mesh._mesh.material[2], material._material);
    assert.equal(mesh._mesh.visible, true);
    delegate.dispose();
});

test('unsupported shading preserves face-varying display colors without tinting authored surfaces', async () => {
    const { delegate, mesh } = setup();
    const colors = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    mesh.setDisplayColor(colors, 'facevarying');
    assert.deepEqual([...mesh._geometry.attributes.color.array], colors);
    assert.equal(mesh._mesh.material.vertexColors, true);
    assert.deepEqual(mesh._mesh.material.color.toArray(), [1, 1, 1]);
    const material = await preview(delegate, '/Authored', [0, 0, 1]);
    mesh.setMaterial('/Authored');
    mesh.setDisplayColor(colors, 'facevarying');
    assert.equal(material._material.vertexColors, false);
    assert.deepEqual(material._material.color.toArray(), [0, 0, 1]);
    delegate.dispose();
});

test('displayColor arriving after material assignment only changes fallback for every interpolation', async () => {
    const { delegate, mesh } = setup();
    const authored = await preview(delegate, '/Authored', [0, 0, 1]);
    mesh.setMaterial('/Authored');
    for (const [interpolation, colors] of [
        ['constant', [1, 0, 0]],
        ['vertex', [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]],
        ['varying', [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]],
        ['facevarying', [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]],
    ]) {
        mesh.setDisplayColor(colors, interpolation);
        assert.deepEqual(authored._material.color.toArray(), [0, 0, 1], interpolation);
        assert.equal(authored._material.vertexColors, false, interpolation);
        assert.equal(mesh._ownedMaterial.vertexColors, interpolation !== 'constant');
    }
    mesh.setDisplayColor([0.5, 0.25, 0], 'constant');
    assert.deepEqual(mesh._ownedMaterial.color.toArray(), [0.5, 0.25, 0]);
    assert.equal(mesh._ownedMaterial.vertexColors, false);
    delegate.dispose();
});

test('shared empty-path fallback preserves per-mesh colors through later assignments and rebinding', async () => {
    const { delegate, mesh } = setup();
    delegate.createSPrim('material', '');
    mesh.setMaterial('');
    mesh.setDisplayColor([0.72, 0.25, 0.16], 'constant');
    const second = delegate.createRPrim('mesh', '/Second');
    second.setDisplayColor([0.2, 0.48, 0.52], 'constant');
    second.setMaterial('');
    assert.equal(mesh._mesh.material, mesh._ownedMaterial);
    assert.deepEqual(mesh._mesh.material.color.toArray(), [0.72, 0.25, 0.16]);
    assert.equal(second._mesh.material, second._ownedMaterial);
    assert.deepEqual(second._mesh.material.color.toArray(), [0.2, 0.48, 0.52]);
    const authored = await preview(delegate, '/Authored', [0, 0, 1]);
    mesh.setMaterial('/Authored');
    mesh.setDisplayColor([1, 0, 0], 'constant');
    second.setMaterial('');
    assert.equal(mesh._mesh.material, authored._material);
    assert.deepEqual(mesh._mesh.material.color.toArray(), [0, 0, 1]);
    mesh.setMaterial('');
    assert.deepEqual(mesh._mesh.material.color.toArray(), [1, 0, 0]);
    delegate.dispose();
});

test('preview constants show before textures finish and disposed updates cannot revive materials', async () => {
    const {delegate,mesh}=setup();
    const {Texture}=await import('three');
    let release;
    delegate.registry.getTexture=()=>new Promise(resolve=>{release=resolve;});
    const material=delegate.createSPrim('material','/Surface');
    mesh.setMaterial('/Surface');
    material.beginMaterialSync();
    material.updateNode('surface','/Surface/Preview',{identifier:'UsdPreviewSurface',diffuseColor:[.8,.2,.1]});
    material.updateNode('surface','/Surface/Texture',{identifier:'UsdUVTexture',file:'color.png'});
    material.updateFinished('surface',[{inputId:'/Surface/Texture',outputId:'/Surface/Preview',inputName:'rgb',outputName:'diffuseColor',fallback:[.8,.2,.1]}]);
    assert.equal(mesh._mesh.visible,true,'geometry does not wait for image downloads');
    assert.deepEqual(mesh._mesh.material.color.toArray(),[.8,.2,.1]);
    delegate.destroySPrim('/Surface');
    release(new Texture());
    await delegate.waitForMaterialsReady();
    assert.equal(material._material,null,'late textures cannot resurrect a disposed surface');
    delegate.dispose();
});

test('retiring prototype meshes does not report their removed materials as unsupported', async () => {
    const {delegate,mesh}=setup();
    const material=await preview(delegate,'/OldPrototype/Material',[1,0,0]);
    mesh.setMaterial('/OldPrototype/Material');
    delegate.beginHydraDraw();
    delegate.destroySPrim(material._id);
    delegate.destroyRPrim('/Panel');
    const replacement=delegate.createRPrim('mesh','/Panel');
    replacement.updatePoints([0,0,0,1,0,0,0,1,0]);replacement.updateIndices([0,1,2]);
    delegate.endHydraDraw();
    assert.equal(delegate.pendingMaterialAssignments.size,0);
    assert.equal(delegate.getDiagnostics().materialFallbacks,0);
    delegate.dispose();
});

test('clearing a live Hydra material restores each assigned mesh fallback and can be reenabled', async () => {
    const {delegate, mesh} = setup();
    mesh.setDisplayColor([.1,.2,.8], 'constant');
    const material = await preview(delegate, '/Authored', [.8,.02,.01]);
    mesh.setMaterial('/Authored');
    assert.equal(mesh._mesh.material, material._material);
    material.clearMaterial();
    await delegate.waitForMaterialsReady();
    assert.equal(mesh._mesh.material, mesh._ownedMaterial);
    assert.deepEqual(mesh._mesh.material.color.toArray(), [.1,.2,.8]);
    material.beginMaterialSync();
    material.updateNode('surface','/Authored/Preview',{identifier:'UsdPreviewSurface',diffuseColor:[.8,.02,.01]});
    material.updateFinished('surface',[]);
    await delegate.waitForMaterialsReady();
    assert.equal(mesh._mesh.material, material._material);
    assert.notEqual(mesh._mesh.material, mesh._ownedMaterial);
    delegate.dispose();
});
