/** Display helpers over an external path-traced canvas, without entering the traced scene. */
export async function createHelperOverlay({renderer:sourceRenderer, scene, host}) {
  const {WebGPURenderer,Scene,MeshBasicNodeMaterial,Mesh,InstancedMesh,SkinnedMesh,LineSegments,Points,Sprite,PerspectiveCamera,OrthographicCamera,NoToneMapping,DoubleSide} = await import('three/webgpu');
  const renderer=new WebGPURenderer({alpha:true,antialias:true,forceWebGL:!sourceRenderer.backend?.isWebGPUBackend});
  await renderer.init();renderer.toneMapping=NoToneMapping;renderer.setPixelRatio(sourceRenderer.getPixelRatio());
  const canvas=renderer.domElement;canvas.setAttribute('aria-hidden','true');canvas.dataset.usdHelperOverlay='';
  Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2'});host.append(canvas);
  const display=new Scene(),depth=new MeshBasicNodeMaterial({colorWrite:false,side:DoubleSide});
  const copies=new Map();let camera,originalCamera,key='',size='';
  function remove(source,copy){display.remove(copy);if(copy.isInstancedMesh){copy.morphTexture=null;copy.dispose();}copies.delete(source);}
  return {
    render(activeCamera) {
      const sources=[];scene.traverseVisible(object=>{if(object.userData.usdHelperFor || object.isMesh)sources.push(object);});
      const helpers=sources.filter(object=>object.userData.usdHelperFor);
      canvas.hidden=!helpers.length;if(!helpers.length)return;
      const current=new Set(sources),signature=[];
      for(const [source,copy] of copies)if(!current.has(source))remove(source,copy);
      for(const source of sources) {
        let copy=copies.get(source);
        if(copy?.isInstancedMesh && copy.instanceMatrix.count<source.count){remove(source,copy);copy=null;}
        if(!copy) {
          const helper=!!source.userData.usdHelperFor,material=helper?source.material:depth;
          copy=source.isSprite?new Sprite(material):source.isLineSegments?new LineSegments(source.geometry,material):source.isPoints?new Points(source.geometry,material)
            :source.isInstancedMesh?new InstancedMesh(source.geometry,material,source.count):source.isSkinnedMesh?new SkinnedMesh(source.geometry,material):new Mesh(source.geometry,material);
          copy.matrixAutoUpdate=copy.matrixWorldAutoUpdate=false;copy.frustumCulled=false;copy.layers.mask=source.layers.mask;
          copies.set(source,copy);display.add(copy);key='';
        }
        copy.geometry=source.geometry;copy.matrix.copy(source.matrixWorld);copy.matrixWorld.copy(source.matrixWorld);
        copy.morphTargetInfluences=source.morphTargetInfluences;copy.skeleton=source.skeleton;
        if(source.isSkinnedMesh){copy.bindMode=source.bindMode;copy.bindMatrix.copy(source.bindMatrix);copy.bindMatrixInverse.copy(source.bindMatrixInverse);}
        if(source.isInstancedMesh){
          if(copy.userData.sourceMatrix!==source.instanceMatrix || copy.userData.matrixVersion!==source.instanceMatrix.version) {
            copy.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0,source.count*16));copy.instanceMatrix.needsUpdate=true;
            copy.userData.sourceMatrix=source.instanceMatrix;copy.userData.matrixVersion=source.instanceMatrix.version;
          }
          copy.count=source.count;copy.morphTexture=source.morphTexture;
        }
        signature.push([source.id,source.geometry.id,source.geometry.attributes.position?.version,source.geometry.index?.version,
          source.instanceMatrix?.version,source.count,source.matrixWorld.elements,source.morphTargetInfluences,
          source.skeleton?.bones.map(bone=>bone.matrixWorld.elements)]);
      }
      if(originalCamera!==activeCamera){camera=activeCamera.isOrthographicCamera?new OrthographicCamera():new PerspectiveCamera();originalCamera=activeCamera;key='';}
      camera.matrixAutoUpdate=camera.matrixWorldAutoUpdate=false;
      camera.matrix.copy(activeCamera.matrixWorld);camera.matrixWorld.copy(activeCamera.matrixWorld);camera.matrixWorldInverse.copy(activeCamera.matrixWorldInverse);
      camera.coordinateSystem=activeCamera.coordinateSystem;
      camera.projectionMatrix.copy(activeCamera.projectionMatrix);camera.projectionMatrixInverse.copy(activeCamera.projectionMatrixInverse);
      camera.near=activeCamera.near;camera.far=activeCamera.far;camera.layers.mask=activeCamera.layers.mask;
      const width=sourceRenderer.domElement.width/sourceRenderer.getPixelRatio(),height=sourceRenderer.domElement.height/sourceRenderer.getPixelRatio();
      const nextSize=`${width}:${height}`;if(size!==nextSize){size=nextSize;renderer.setSize(width,height,false);key='';}
      const nextKey=JSON.stringify([size,signature,camera.matrixWorld.elements,camera.projectionMatrix.elements]);
      if(key===nextKey)return;key=nextKey;
      renderer.render(display,camera);
    },
    hide(){canvas.hidden=true;},
    dispose(){for(const [source,copy] of copies)remove(source,copy);depth.dispose();renderer.dispose();canvas.remove();},
  };
}
