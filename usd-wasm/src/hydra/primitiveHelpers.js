import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Points, PointsMaterial, Vector3 } from 'three';

export const helperKinds = ['curves', 'controlPoints', 'points', 'lights', 'cameras'];
export function viewportHelpers(config = {}) {
    const all = !!config.showScenePrimitiveHelpers;
    return { curves:false, controlPoints:false, points:false,
        lights:all || !!config.showLightHelpers, cameras:all || !!config.showCameraHelpers, ...config.helpers };
}

/** Helpers are display geometry: never change USD widths, bounds, lighting or tracing inputs. */
export function helperGeometry(kind, path, positions, points = false, color = 0x297f96, createPointHelper) {
    const options = {color, transparent:true, opacity:.85, depthWrite:false, toneMapped:false};
    let object;
    if(points && createPointHelper) object=createPointHelper(positions,options);
    else {
        const geometry = new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positions,3));
        const material = points ? new PointsMaterial({...options,size:5,sizeAttenuation:false}) : new LineBasicMaterial(options);
        object=points ? new Points(geometry,material) : new LineSegments(geometry,material);
    }
    object.name = `${path.split('/').pop()} ${kind}`;
    Object.assign(object.userData, {usdPath:path, usdHelperFor:path, usdHelperKind:kind,
        usdExcludeFromBounds:true, usdHelperPickable:true});
    return object;
}
export function disposeHelper(object) {
    object?.removeFromParent();
    object?.traverse(child => {child.geometry?.dispose();for(const material of [child.material].flat())material?.dispose();});
}

function controlData(type, data) {
    const flat = Array.from(data.points || []).flat(), vertices = [], edges = [];
    const point = index => flat.slice(index * 3, index * 3 + 3);
    const edge = (a,b) => edges.push(...point(a),...point(b));
    if(type === 'points') return {vertices:flat, edges};
    if(type === 'nurbsPatch') {
        vertices.push(...flat);
        for(let v=0;v<data.vCount;v++)for(let u=0;u<data.uCount;u++) {
            const i=v*data.uCount+u;
            if(u+1<data.uCount)edge(i,i+1);
            if(v+1<data.vCount)edge(i,i+data.uCount);
        }
    } else {
        let offset=0;const invisible=new Set(data.invisibleCurves || []);
        for(let curve=0;curve<(data.counts?.length || 0);curve++) {
            const count=data.counts[curve], index=i=>data.indices?.length?data.indices[offset+i]:offset+i;
            if(!invisible.has(curve)) {
                for(let i=0;i<count;i++)vertices.push(...point(index(i)));
                for(let i=1;i<count;i++)if(data.wrap!=='segmented' || i%2)edge(index(i-1),index(i));
                if(data.wrap==='periodic')edge(index(count-1),index(0));
            }
            offset+=count;
        }
    }
    return {vertices,edges};
}

export function strokeHelpers(type, path, data, geometry, parents, settings, instanced, createPointHelper) {
    if(!data || !parents.length)return [];
    const result=[], point=new Vector3();
    const transformed = (values) => {
        const positions=[];
        for(const matrix of parents)for(let i=0;i<values.length;i+=3) {
            point.fromArray(values,i).applyMatrix4(matrix);positions.push(point.x,point.y,point.z);
        }
        return positions;
    };
    const add = (kind, values, points, color) => {
        if(!values.length || values.some(value=>!Number.isFinite(value)))return;
        const object=helperGeometry(kind,path,transformed(values),points,color,createPointHelper);
        if(instanced)Object.assign(object.userData,{usdHelperInstanced:true,usdHelperInstanceStride:values.length/3});
        result.push(object);
    };
    if(settings.curves && type==='basisCurves') {
        const lines=[];
        for(const curve of geometry.userData.usdCurveSamples || [])for(let i=1;i<curve.length;i++)lines.push(...curve[i-1],...curve[i]);
        add('curves',lines,false,0x297f96);
    }
    if((settings.controlPoints && type!=='points') || (settings.points && type==='points')) {
        const {vertices,edges}=controlData(type,data);
        if(type!=='points')add('controlPoints',edges,false,0x947027);
        add(type==='points'?'points':'controlPoints',vertices,true,0x966b20);
    }
    return result;
}

/** USD emitters face local -Z; CylinderLight's axis is local X. */
export function scenePrimitiveHelper(object, state, path) {
    const lines=[], line=(a,b)=>lines.push(...a,...b);
    const circle=(radius,axis='z',offset=0)=>{
        for(let i=0;i<48;i++) {
            const at=t=>{const a=Math.cos(t)*radius,b=Math.sin(t)*radius;return axis==='x'?[offset,a,b]:axis==='y'?[a,offset,b]:[a,b,offset];};
            line(at(i*Math.PI/24),at((i+1)*Math.PI/24));
        }
    };
    const rectangle=(w,h,z=0)=>{const p=[[-w/2,-h/2,z],[w/2,-h/2,z],[w/2,h/2,z],[-w/2,h/2,z]];for(let i=0;i<4;i++)line(p[i],p[(i+1)%4]);return p;};
    const finite=(value,fallback)=>Number.isFinite(Number(value))?Math.max(.001,Number(value)):fallback;
    const radius=finite(state.radius,.25), type=state.typeId;
    if(object.isCamera) {
        const distance=Math.max(.5,Math.min(2,object.near*4));
        const h=object.isPerspectiveCamera?2*Math.tan(object.fov*Math.PI/360)*distance:object.top-object.bottom;
        const w=object.isPerspectiveCamera?h*object.aspect:object.right-object.left;
        const far=rectangle(w,h,-distance);
        const near=object.isPerspectiveCamera?far.map(p=>p.map(v=>v*.08)):rectangle(w,h,0);
        for(let i=0;i<4;i++)line(near[i],far[i]);
        line([-w*.15,h*.6,-distance],[0,h*.8,-distance]);line([0,h*.8,-distance],[w*.15,h*.6,-distance]);
    } else if(type==='rectLight' || type==='portalLight')rectangle(finite(state.width,1),finite(state.height,1));
    else if(type==='diskLight')circle(radius);
    else if(type==='cylinderLight') {
        const half=finite(state.length,1)/2;circle(radius,'x',-half);circle(radius,'x',half);
        for(let i=0;i<4;i++){const a=i*Math.PI/2;line([-half,Math.cos(a)*radius,Math.sin(a)*radius],[half,Math.cos(a)*radius,Math.sin(a)*radius]);}
    } else if(object.isSpotLight) {
        const length=Math.max(radius*2,.5),r=Math.tan(Math.min(object.angle,Math.PI*.45))*length;
        circle(r,'z',-length);for(let i=0;i<4;i++){const a=i*Math.PI/2;line([0,0,0],[Math.cos(a)*r,Math.sin(a)*r,-length]);}
    } else if(type==='distantLight')circle(.25);
    else {const r=type==='domeLight'?.6:radius;circle(r);circle(r,'x');circle(r,'y');}
    if(!object.isCamera && (object.isSpotLight || ['rectLight','diskLight','portalLight','distantLight'].includes(type))) {
        const end=-Math.max(.5,radius*2);line([0,0,0],[0,0,end]);line([0,0,end],[.1,0,end+.15]);line([0,0,end],[-.1,0,end+.15]);
    }
    const helper=helperGeometry(object.isCamera?'cameras':'lights',path,lines,false,object.isCamera?0x298aa9:0x966b20);
    helper.matrixAutoUpdate=false;helper.matrix.copy(object.matrix);helper.visible=object.visible;
    return helper;
}
