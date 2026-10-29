import {Box3,Vector3,Matrix4} from 'three';
import {pathContains} from './usd/viewer/selection.js';

/** Selection-or-all framing, with subd-modelling's projected fit and smooth glide. */
export function createViewportFraming({viewport,getState,getSelection}) {
  let animation,restoreControls,epoch=0,disposed=false;
  function cancel() { epoch++;cancelAnimationFrame(animation); animation=undefined; restoreControls?.(); restoreControls=undefined; }
  async function focus() {
    cancel();
    const request=epoch;
    let state=getState(); if(!state?.scene || !state.camera)return;
    const {scene}=state;scene.updateMatrixWorld(true);
    async function bounds(items) {
      const box=new Box3();
      const objects=[];scene.traverseVisible(object=>{if(object.geometry && !object.userData.usdHelperFor)objects.push(object);});
      for(const object of objects){
        let prim=object;while(prim && !prim.userData.usdPath)prim=prim.parent;
        const name=prim?.userData.usdPath;
        if(!name)continue;
        if(!items.length){box.expandByObject(object);continue;}
        if(object.isInstancedMesh){
          const indices=await state.handle?.resolveSelection?.(name,object.count,items);
          if(indices){
            object.geometry.computeBoundingBox();const matrix=new Matrix4();
            for(const index of indices){object.getMatrixAt(index,matrix);matrix.premultiply(object.matrixWorld);box.union(object.geometry.boundingBox.clone().applyMatrix4(matrix));}
          }
        } else if(items.some(item=>!item.instances?.length && pathContains(item.path,name)))box.expandByObject(object);
      }return box;
    }
    const items=getSelection(),selection=Array.isArray(items)?items:items?[{path:items}]:[];
    let box=await bounds(selection);if(box.isEmpty())box=await bounds([]);
    if(box.isEmpty() || disposed || request!==epoch || getState()?.handle!==state.handle)return;
    const current=state.camera,origin=current.getWorldPosition(new Vector3()),direction=current.getWorldDirection(new Vector3()).negate();
    // Authored cameras remain unchanged. Framing returns to the free orbit view.
    if(state.useFreeCamera){state.useFreeCamera();state=getState();}
    const camera=state.camera,controls=state.getControls?.();if(!camera || !controls)return;
    const damping=controls.enableDamping;controls.enableDamping=false;controls.update(0);controls.enableDamping=damping;
    const enabled=controls.enabled;controls.enabled=false;restoreControls=()=>{controls.enabled=enabled;};
    const target=box.getCenter(new Vector3()),right=new Vector3(1,0,0).applyQuaternion(current.getWorldQuaternion(current.quaternion.clone()));
    const up=new Vector3().crossVectors(direction,right).normalize();
    const rect=viewport.getBoundingClientRect(),aspect=rect.width/Math.max(1,rect.height);
    const tan=Math.tan((camera.getEffectiveFOV?.()||50)*Math.PI/360),size=box.getSize(new Vector3()).length();
    let distance=Math.max(size*.01,1e-6),height=1e-6;
    for(let k=0;k<8;k++) {
      const p=new Vector3(k&1?box.max.x:box.min.x,k&2?box.max.y:box.min.y,k&4?box.max.z:box.min.z).sub(target);
      const x=Math.abs(p.dot(right))*1.12,y=Math.abs(p.dot(up))*1.12,z=p.dot(direction);
      distance=Math.max(distance,z+x/(tan*aspect),z+y/tan,z+size*.01);height=Math.max(height,2*y,2*x/aspect);
    }
    if(camera.isOrthographicCamera)distance=Math.max(origin.distanceTo(target),size*2);
    const destination=target.clone().addScaledVector(direction,distance),startTarget=origin.clone().addScaledVector(direction,-Math.max(origin.distanceTo(controls.target),size*.01)),startZoom=camera.zoom;
    const endZoom=camera.isOrthographicCamera?(camera.top-camera.bottom)/height:camera.zoom;
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:280,start=performance.now();
    function tick(now) {
      const t=duration?Math.min(1,(now-start)/duration):1,e=t*t*t*(t*(t*6-15)+10);
      const position=origin.clone().lerp(destination,e);camera.position.copy(camera.parent?camera.parent.worldToLocal(position):position);
      controls.target.copy(startTarget).lerp(target,e);camera.zoom=startZoom+(endZoom-startZoom)*e;
      camera.near=Math.min(camera.near,Math.max(distance*.001,1e-6));camera.far=Math.max(camera.far,distance+size*4);
      camera.lookAt(controls.target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);controls.update(0);
      if(t<1)animation=requestAnimationFrame(tick);else cancel();
    }
    animation=requestAnimationFrame(tick);
  }
  const onKey=event=>{
    if(event.key.toLowerCase()!=='f' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.target.closest?.('input,textarea,select,[contenteditable=true],[role=dialog]'))return;
    event.preventDefault();void focus().catch(error=>console.error('USD framing failed',error));
  };
  document.addEventListener('keydown',onKey);viewport.addEventListener('pointerdown',cancel,true);
  return{focus,cancel,dispose(){disposed=true;cancel();document.removeEventListener('keydown',onKey);viewport.removeEventListener('pointerdown',cancel,true);}};
}
