import {Raycaster,Vector2} from 'three';
import {createViewportFraming} from './viewer-framing.js';
import {createPickingCache} from './viewer-picking.js';

import {selectionItem} from './usd/viewer/selection.js';
import {createInstanceMaskCache} from './usd/viewer/instanceSelection.js';

/** Shared authored identities; picking never changes materials or tracer input. */
export function createViewportInteraction({viewport,getState,onSelect}) {
  const ray = new Raycaster(), pointer = new Vector2();
  let selected = [], hovered = null, start, dragged = false, disposed = false, frame, overlay, pending, hoverEpoch = 0, clickEpoch = 0, pickMode = 'prim';
  let cursor = null, hoverRequest = null, hoverInFlight = false, hoverHandle, hoverTime, hoverRevision, hoverCamera, hoverWorld = [], hoverProjection = [];
  let movingUntil=0,lastHoverAt=0,motionCamera,motionWorld=[],motionProjection=[],preparedHandle,preparedRevision;
  const picking=createPickingCache({onReady:()=>{hoverRequest=cursor;}});
  const framing=createViewportFraming({viewport,getState,getSelection:()=>selected});
  const listeners = [];
  function listen(type,handler) {viewport.addEventListener(type,handler,true); listeners.push([type,handler]);}
  function visible(object) {for(let p=object;p;p=p.parent) if(!p.visible)return false; return true;}
  async function pick(event,hover=false) {
    const state = getState(); if(!state?.scene || !state.camera || event.target.closest?.('button,input,select,summary,.usd-timeline'))return null;
    const rect = viewport.getBoundingClientRect(); if(!rect.width || !rect.height)return null;
    pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);
    state.scene.updateMatrixWorld(); state.camera.updateMatrixWorld(); ray.setFromCamera(pointer,state.camera);
    // Raycaster traverses hidden objects too. Filter before triangle testing,
    // including hidden Hydra source meshes retained behind visible instances.
    const candidates=[];
    state.scene.traverseVisible(object=>{
      let path=false;
      for(let parent=object;parent;parent=parent.parent){
        if(parent.userData.usdHelperFor)return;
        path ||= !!parent.userData.usdPath;
      }
      if(path && typeof object.raycast==='function')candidates.push(object);
    });
    const result=picking.intersect(ray,candidates,{defer:hover,accelerate:!state.handle?.isPlaying?.()});
    if(result.pending&&hover)return undefined;
    for(const hit of result.hits) {
      if(!visible(hit.object) || hit.object.userData.usdHelperFor)continue;
      let object=hit.object; while(object && !object.userData.usdPath)object=object.parent;
      if(!object)continue;
      const renderPath=object.userData.usdPath, renderInstanceIndex=hit.instanceId;
      const resolved=await state.handle?.resolvePick?.(renderPath,renderInstanceIndex??0);
      if(disposed || getState()?.handle!==state.handle)return null;
      if(!resolved && hit.object.isInstancedMesh)return null;
      let path=resolved?.path || renderPath;
      let instances=resolved?.instances || [];
      if(pickMode==='instance') {
        if(instances.length) {path=instances[0].path; instances=instances.slice(0,1);}
        else {
          let candidate=path;
          while(candidate) {
            let prim; try {prim=state.stage?.GetPrimAtPath(candidate);if(prim?.IsValid() && prim.IsInstance()){path=candidate;break;}} finally {prim?.delete?.();}
            candidate=candidate.slice(0,candidate.lastIndexOf('/'));
          }
        }
      }
      return selectionItem({path,renderPath,renderInstanceIndex,instances,
        ...(instances.length ? {instancerPath:instances[0].path,instanceIndex:instances[0].index,instanceId:instances[0].id,prototypePath:resolved.path} : {})});
    }
    return null;
  }
  async function ensureOverlay() {
    if(overlay || pending || disposed)return;
    pending=makeOutline(viewport).then(value=>{if(disposed)value.dispose();else overlay=value;}).catch(error=>console.error('Selection outline failed',error)).finally(()=>pending=null);
  }
  function choose(value) {selected=(Array.isArray(value)?value:value?[value]:[]).map(selectionItem).filter(Boolean);if(selected.length)void ensureOverlay();}
  function clearHover() {hoverEpoch++;cursor=hoverRequest=null;hovered=null;}
  function queueHover(event) {
    hoverEpoch++;
    if(event.buttons || event.target.closest?.('button,input,select,summary,.usd-timeline')){cursor=hoverRequest=null;hovered=null;return;}
    cursor=hoverRequest={clientX:event.clientX,clientY:event.clientY,target:event.target};
  }
  function updateHover(state) {
    if(!cursor || hoverInFlight || !state?.camera || window.usdViewportVisible===false)return;
    const camera=state.camera,time=state.handle?.renderedTime,revision=state.handle?.revision;
    const now=performance.now();
    const cameraMoved=motionCamera!==camera||camera.matrixWorld.elements.some((v,i)=>v!==motionWorld[i])||camera.projectionMatrix.elements.some((v,i)=>v!==motionProjection[i]);
    if(cameraMoved){
      motionCamera=camera;motionWorld=camera.matrixWorld.elements.slice();motionProjection=camera.projectionMatrix.elements.slice();
      movingUntil=now+120;hoverEpoch++;hovered=null;hoverRequest=cursor;
    }
    if(now<movingUntil||now-lastHoverAt<50)return;
    const changed=hoverRequest || hoverHandle!==state.handle || hoverTime!==time || hoverRevision!==revision || hoverCamera!==camera
      || camera.matrixWorld.elements.some((v,i)=>v!==hoverWorld[i]) || camera.projectionMatrix.elements.some((v,i)=>v!==hoverProjection[i]);
    if(!changed)return;
    const request=hoverRequest||cursor,epoch=hoverEpoch;hoverRequest=null;hoverInFlight=true;
    lastHoverAt=now;
    hoverHandle=state.handle;hoverTime=time;hoverRevision=revision;hoverCamera=camera;
    hoverWorld=camera.matrixWorld.elements.slice();hoverProjection=camera.projectionMatrix.elements.slice();
    // One in-flight pick and one latest pointer sample; animation also rechecks
    // a stationary cursor as the rendered surface moves beneath it.
    void pick(request,true).then(next=>{if(!disposed && epoch===hoverEpoch){if(next===undefined){hoverRequest=cursor;return;}hovered=next;if(next)void ensureOverlay();}})
      .catch(()=>{}).finally(()=>{hoverInFlight=false;});
  }
  listen('pointerdown',event=>{clearHover();if(event.button!==0)return;start=[event.clientX,event.clientY];dragged=false;clickEpoch++;});
  listen('wheel',event=>{hoverEpoch++;hovered=null;cursor=hoverRequest={clientX:event.clientX,clientY:event.clientY,target:event.target};movingUntil=performance.now()+160;});
  listen('pointermove',event=>{
    if(start && Math.hypot(event.clientX-start[0],event.clientY-start[1])>4)dragged=true;
    queueHover(event);
  });
  listen('pointerleave',clearHover);
  listen('pointercancel',()=>{clickEpoch++;start=undefined;clearHover();});
  listen('pointerup',event=>{
    if(!start || event.button!==0){queueHover(event);return;}
    const click=!dragged && Math.hypot(event.clientX-start[0],event.clientY-start[1])<=4;start=undefined;
    queueHover(event);
    const epoch=clickEpoch, options={toggle:event.ctrlKey||event.metaKey,range:false};
    if(click)void pick(event).then(item=>{if(!disposed && epoch===clickEpoch)onSelect(item,options);}).catch(error=>console.error('USD picking failed',error));
  });
  function tick() {
    if(disposed)return;frame=requestAnimationFrame(tick);
    const state=getState(),rect=viewport.getBoundingClientRect();
    if(state?.handle!==preparedHandle){picking.reset();preparedHandle=state?.handle;preparedRevision=undefined;}
    if(state?.scene&&!state.handle?.isPlaying?.()&&preparedRevision!==state.handle?.revision){preparedRevision=state.handle?.revision;picking.prepare(state.scene);}
    updateHover(state);
    if(overlay)overlay.render(state,selected,hovered,rect,window.usdViewportVisible!==false);
  }
  tick();
  return {select:choose,focus:framing.focus,setPickMode(mode){if(['prim','instance'].includes(mode)){pickMode=mode;hoverEpoch++;hovered=null;hoverRequest=cursor;}},get pickMode(){return pickMode;},
    clear(){selected=[];clearHover();clickEpoch++;framing.cancel();picking.reset();preparedHandle=preparedRevision=undefined;},get selection(){return selected;},get selectedPath(){return selected.at(-1)?.path||'';},get hoveredPath(){return hovered?.path||'';},
    dispose(){disposed=true;hoverEpoch++;clickEpoch++;framing.dispose();picking.dispose();cancelAnimationFrame(frame);overlay?.dispose();for(const [type,handler]of listeners)viewport.removeEventListener(type,handler,true);}};
}

async function makeOutline(viewport) {
  const {WebGPURenderer,MeshBasicNodeMaterial,RenderPipeline,Scene,Color,Mesh,InstancedMesh,SkinnedMesh,PerspectiveCamera,OrthographicCamera,NoToneMapping,SRGBColorSpace,WebGPUCoordinateSystem,WebGLCoordinateSystem} = await import('three/webgpu');
  const {pass,uniform,vec4,uv,max,mix,renderOutput,screenCoordinate,perspectiveDepthToViewZ,orthographicDepthToViewZ} = await import('three/tsl');
  const renderer = new WebGPURenderer({alpha:true,antialias:false,forceWebGL:new URLSearchParams(location.search).get('backend')==='webgl'});
  await renderer.init();renderer.toneMapping=NoToneMapping;renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const canvas=renderer.domElement;canvas.className='usd-selection-overlay';canvas.setAttribute('aria-hidden','true');viewport.append(canvas);
  const scenes=Array.from({length:3},()=>{const scene=new Scene();scene.background=new Color(0);return scene;});
  const materials=[0,0xffffff].map(color=>new MeshBasicNodeMaterial({color,side:2}));
  let camera,sourceCamera,pipeline,passes=[],pairs=[],sources=[],size='',previousKey='',maskVersion=0,disposed=false;
  const masks=createInstanceMaskCache(()=>{maskVersion++;});
  const step=uniform(new Vector2()),selection=uniform(new Color()),hover=uniform(new Color());
  const near=uniform(.1),far=uniform(1000),hiddenOpacity=uniform(.45),dashLength=uniform(4),dashPeriod=uniform(7);
  function createPipeline(nextCamera) {
    pipeline?.dispose();passes.forEach(pass=>pass.dispose());
    camera=nextCamera.isOrthographicCamera ? new OrthographicCamera() : new PerspectiveCamera();sourceCamera=nextCamera;
    camera.matrixAutoUpdate=camera.matrixWorldAutoUpdate=false;
    passes=scenes.map(scene=>pass(scene,camera));
    const sceneDepth=passes[0].getTextureNode('depth');
    const distance=d=>(camera.isOrthographicCamera ? orthographicDepthToViewZ(d,near,far) : perspectiveDepthToViewZ(d,near,far)).negate();
    function contour(target) {
      // Derive the contour from the isolated target. Occluders only classify it;
      // their intersections must never introduce edges inside the selected object.
      const image=target.getTextureNode(),depth=target.getTextureNode('depth');
      const center=image.sample(uv()).r;
      let high=center,targetDepth=depth.sample(uv()).r,occluderDepth=sceneDepth.sample(uv()).r;
      for(const [x,y]of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){
        const at=uv().add(step.mul(new Vector2(x,y))),value=image.sample(at).r;
        const sampleDepth=depth.sample(at).r,nearer=sampleDepth.lessThan(targetDepth);
        // Compare scene and target at the same interior sample. Comparing an
        // exterior sky pixel to an interior target makes a second solid halo.
        occluderDepth=nearer.select(sceneDepth.sample(at).r,occluderDepth);
        targetDepth=nearer.select(sampleDepth,targetDepth);high=max(high,value);
      }
      const edge=high.sub(center).clamp(0,1),targetDistance=distance(targetDepth);
      const hidden=targetDistance.greaterThan(distance(occluderDepth).add(targetDistance.mul(.0005).max(.00005)));
      const gx=image.sample(uv().add(step.mul(new Vector2(1,0)))).r.sub(image.sample(uv().sub(step.mul(new Vector2(1,0)))).r).abs();
      const gy=image.sample(uv().add(step.mul(new Vector2(0,1)))).r.sub(image.sample(uv().sub(step.mul(new Vector2(0,1)))).r).abs();
      const along=gx.greaterThan(gy).select(screenCoordinate.y,screenCoordinate.x);
      const dash=along.mod(dashPeriod).lessThan(dashLength);
      return {edge,alpha:edge.mul(hidden.select(hiddenOpacity.mul(dash),1))};
    }
    const selected=contour(passes[1]),hovered=contour(passes[2]);
    const alpha=max(selected.alpha,hovered.alpha);
    // Transparent canvases expect premultiplied display RGB. Multiplying before
    // sRGB encoding brightens faint edges and creates a pale parallel fringe.
    const color=renderOutput(vec4(mix(hover,selection,selected.edge),1),NoToneMapping,SRGBColorSpace).rgb;
    pipeline=new RenderPipeline(renderer,vec4(color.mul(alpha),alpha));pipeline.outputColorTransform=false;
  }
  function clear() {
    for(const [,copies]of pairs)for(let i=0;i<copies.length;i++){scenes[i].remove(copies[i]);if(copies[i].isInstancedMesh){copies[i].morphTexture=null;copies[i].dispose();}}
    pairs=[];sources=[];previousKey='';
  }
  function proxy(source,material) {
    const copy=source.isInstancedMesh ? new InstancedMesh(source.geometry,material,source.count) : source.isSkinnedMesh ? new SkinnedMesh(source.geometry,material) : new Mesh(source.geometry,material);
    copy.matrixAutoUpdate=copy.matrixWorldAutoUpdate=false;copy.frustumCulled=false;if(copy.isInstancedMesh)copy.userData.maskMatrix=copy.instanceMatrix;return copy;
  }
  return {
    render(state,selected,hovered,rect,shown) {
      const active=shown && (selected.length || hovered) && state?.camera && rect.width>0 && rect.height>0;
      canvas.hidden=!active;if(!active)return;
      const css=getComputedStyle(viewport),ratio=renderer.getPixelRatio();
      const width=parseFloat(css.getPropertyValue('--usd-outline-width'))||1.5;
      const nextSize=`${rect.width}:${rect.height}:${width}`;
      if(size!==nextSize){size=nextSize;renderer.setSize(rect.width,rect.height);step.value.set(width/rect.width,width/rect.height);}
      near.value=state.camera.near;far.value=state.camera.far;
      hiddenOpacity.value=parseFloat(css.getPropertyValue('--usd-outline-hidden-opacity'))||.45;
      dashLength.value=(parseFloat(css.getPropertyValue('--usd-outline-dash-length'))||4)*ratio;
      dashPeriod.value=dashLength.value+(parseFloat(css.getPropertyValue('--usd-outline-dash-gap'))||3)*ratio;
      if(sourceCamera!==state.camera)createPipeline(state.camera);
      // A WebGPU pass must not change Needle's WebGL camera projection/conventions.
      camera.near=state.camera.near;camera.far=state.camera.far;camera.layers.mask=state.camera.layers.mask;
      camera.matrix.copy(state.camera.matrixWorld);camera.matrixWorld.copy(state.camera.matrixWorld);camera.matrixWorldInverse.copy(state.camera.matrixWorldInverse);
      camera.coordinateSystem=renderer.backend.isWebGPUBackend ? WebGPUCoordinateSystem : WebGLCoordinateSystem;
      camera.projectionMatrix.copy(state.camera.projectionMatrix);
      if(camera.coordinateSystem!==state.camera.coordinateSystem){
        const e=camera.projectionMatrix.elements;
        for(const i of [2,6,10,14])e[i]=camera.coordinateSystem===WebGPUCoordinateSystem ? (e[i]+e[i+1])*.5 : e[i]*2-e[i+1];
      }
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      const next=[];state.scene.traverseVisible(object=>{if(object.isMesh && !object.userData.usdHelperFor && ![object.material].flat().some(m=>m?.isBoundedVolumeNodeMaterial))next.push(object);});
      if(next.length!==sources.length || next.some((object,i)=>object!==sources[i]) || pairs.some(([source,copies])=>source.isInstancedMesh && copies.some(copy=>copy.userData.maskMatrix.count<source.count))){
        clear();sources=next;
        for(const object of sources){
          // Copy render data only: engine userData can contain context cycles.
          const copies=scenes.map((scene,i)=>{const copy=proxy(object,materials[i?1:0]);scene.add(copy);return copy;});
          pairs.push([object,copies]);
        }
      }
      for(const [source,copies]of pairs){
        const selectedMask=masks.get(source,selected,state.handle,'selected'),rawHoverMask=masks.get(source,hovered?[hovered]:[],state.handle,'hover');
        const hoveredMask=selectedMask===null ? new Set() : new Set([...(rawHoverMask===null ? Array.from({length:source.count||1},(_,i)=>i) : rawHoverMask)].filter(i=>!selectedMask.has(i)));
        const version=`${source.geometry.attributes.position?.version}:${source.geometry.index?.version}:${source.instanceMatrix?.version}:${source.count}:${source.geometry.drawRange.start}:${source.geometry.drawRange.count}`;
        const position=source.geometry.attributes.position,index=source.geometry.index,morph=source.morphTargetInfluences?.join(','),morphTexture=source.morphTexture?.version;
        for(let i=0;i<copies.length;i++){
          const copy=copies[i],indices=i===1?selectedMask:i===2?hoveredMask:null,visible=i===0 || indices===null || indices.size>0;
          if(copy.geometry!==source.geometry || copy.userData.position!==position || copy.userData.index!==index
            || !copy.matrixWorld.equals(source.matrixWorld) || copy.visible!==visible || copy.userData.version!==version
            || source.isSkinnedMesh || copy.userData.morph!==morph || copy.userData.morphTexture!==morphTexture)previousKey='';
          copy.userData.position=position;copy.userData.index=index;copy.userData.morph=morph;copy.userData.morphTexture=morphTexture;
          copy.userData.version=version;copy.visible=visible;
          copy.geometry=source.geometry;copy.matrix.copy(source.matrixWorld);copy.matrixWorld.copy(source.matrixWorld);
          copy.morphTargetInfluences=source.morphTargetInfluences;copy.skeleton=source.skeleton;
          if(copy.isInstancedMesh)copy.morphTexture=source.morphTexture;
          if(source.isSkinnedMesh){copy.bindMode=source.bindMode;copy.bindMatrix.copy(source.bindMatrix);copy.bindMatrixInverse.copy(source.bindMatrixInverse);}
          if(source.instanceMatrix){
            if(i===0 || indices===null){copy.instanceMatrix=source.instanceMatrix;copy.count=source.count;}
            else {
              copy.instanceMatrix=copy.userData.maskMatrix;let index=0;
              for(const sourceIndex of indices){copy.instanceMatrix.array.set(source.instanceMatrix.array.subarray(sourceIndex*16,sourceIndex*16+16),index++*16);}
              copy.instanceMatrix.needsUpdate=true;copy.count=index;
            }
          } else copy.count=source.count;
        }
      }
      selection.value.set(css.getPropertyValue('--usd-selection-color').trim()||'#198500');hover.value.set(css.getPropertyValue('--usd-hover-color').trim()||'#777777');
      const key=JSON.stringify([size,maskVersion,selected,hovered,camera.matrixWorld.elements,camera.projectionMatrix.elements,selection.value.toArray(),hover.value.toArray(),hiddenOpacity.value,dashLength.value,dashPeriod.value]);
      if(key===previousKey)return;previousKey=key;
      pipeline.render();
    },
    dispose(){disposed=true;masks.dispose();clear();pipeline?.dispose();passes.forEach(pass=>pass.dispose());materials.forEach(m=>m.dispose());renderer.dispose();canvas.remove();}
  };
}
