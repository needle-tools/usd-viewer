// Small native authoring vocabulary shared by the executable API examples.
// Positions use a Y-up design space; loaded Z-up fixtures keep their stage axis.
export function createSceneKit(USD) {
  const colors = { ink: [0.055, 0.09, 0.16], teal: [0.035, 0.65, 0.58], coral: [0.96, 0.22, 0.12], gold: [1, 0.63, 0.12], blue: [0.08, 0.3, 0.85], cream: [0.86, 0.83, 0.7], violet: [0.49, 0.19, 0.72] };
  const prim = value => value.GetPrim?.() ?? value;
  const attr = (p, name, type, value) => { const a = prim(p).CreateAttribute(name, type, false); a.Set(value, Number.NaN); return a; };
  const isZ = stage => { const axis = stage.GetUpAxis(); return String(typeof axis === 'number' ? String.fromCharCode(axis) : axis).toUpperCase() === 'Z'; };
  const point = (stage, p) => isZ(stage) ? [p[0], -p[2], p[1]] : p;
  function pose(stage, value, position = [0, 0, 0], scale = [1, 1, 1], rotate = [0, 0, 0]) {
    const p = prim(value);
    attr(p, 'xformOp:translate', 'double3', point(stage, position));
    attr(p, 'xformOp:rotateXYZ', 'float3', point(stage, rotate));
    attr(p, 'xformOp:scale', 'float3', isZ(stage) ? [scale[0], scale[2], scale[1]] : scale);
    attr(p, 'xformOpOrder', 'token[]', ['xformOp:translate', 'xformOp:rotateXYZ', 'xformOp:scale']);
    return p;
  }
  function color(value, rgb) { attr(value, 'primvars:displayColor', 'color3f[]', [rgb]); return prim(value); }
  function bind(value, material) {
    const p = prim(value); p.ApplyAPI('MaterialBindingAPI');
    const binding = p.CreateRelationship('material:binding', false);
    binding.ClearTargets(false);
    binding.AddTarget(typeof material === 'string' ? material : prim(material).GetPath());
    return p;
  }
  function material(stage, path, rgb, metallic = 0, roughness = 0.35, shaderPath = `${path}/Surface`) {
    const m = stage.DefinePrim(path, 'Material');
    const shader = stage.DefinePrim(shaderPath, 'Shader');
    attr(shader, 'info:id', 'token', 'UsdPreviewSurface');
    if (rgb) attr(shader, 'inputs:diffuseColor', 'color3f', rgb);
    attr(shader, 'inputs:metallic', 'float', metallic);
    attr(shader, 'inputs:roughness', 'float', roughness);
    shader.CreateAttribute('outputs:surface', 'token', false);
    m.CreateAttribute('outputs:surface', 'token', false).AddConnection(`${shaderPath}.outputs:surface`);
    return m;
  }
  function box(stage, path, position, size, rgb = colors.teal, rotate) {
    const p = stage.DefinePrim(path, 'Cube'); attr(p, 'size', 'double', 1);
    color(p, rgb); return pose(stage, p, position, size, rotate);
  }
  function sphere(stage, path, position, radius, rgb = colors.coral, scale = [1, 1, 1]) {
    const p = stage.DefinePrim(path, 'Sphere'); attr(p, 'radius', 'double', radius);
    color(p, rgb); return pose(stage, p, position, scale);
  }
  function mesh(stage, path, points, counts, indices, rgb, normals) {
    const p = stage.DefinePrim(path, 'Mesh');
    attr(p, 'points', 'point3f[]', points.map(v => point(stage, v)));
    attr(p, 'faceVertexCounts', 'int[]', counts); attr(p, 'faceVertexIndices', 'int[]', indices);
    attr(p, 'subdivisionScheme', 'token', 'none'); attr(p, 'doubleSided', 'bool', true);
    // UsdGeomPointBased's default normals interpolation is vertex.
    if (normals) attr(p, 'normals', 'normal3f[]', normals.map(v => point(stage, v)));
    if (rgb) color(p, rgb);
    return p;
  }
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const unit = a => { const d = Math.hypot(...a) || 1; return a.map(v => v/d); };
  function surface(stage, path, fn, rgb, nu = 64, nv = 16) {
    const points = [], normals = [], counts = [], indices = [];
    for (let i=0;i<=nu;i++) for (let j=0;j<=nv;j++) {
      const u=i/nu,v=j/nv,e=0.0001;
      points.push(fn(u,v));
      normals.push(unit(cross(sub(fn(u+e,v),fn(u-e,v)),sub(fn(u,v+e),fn(u,v-e)))));
    }
    for (let i=0;i<nu;i++) for(let j=0;j<nv;j++) {
      const a=i*(nv+1)+j; counts.push(4); indices.push(a,a+nv+1,a+nv+2,a+1);
    }
    return mesh(stage,path,points,counts,indices,rgb,normals);
  }
  function torus(stage,path,center,radius,tube,rgb=colors.gold,axis='z',sweep=1) {
    return surface(stage,path,(u,v)=>{
      const a=u*Math.PI*2*sweep,b=v*Math.PI*2;
      const x=(radius+tube*Math.cos(b))*Math.cos(a),y=(radius+tube*Math.cos(b))*Math.sin(a),z=tube*Math.sin(b);
      return axis==='y' ? [center[0]+x,center[1]+z,center[2]-y] : [center[0]+x,center[1]+y,center[2]+z];
    },rgb);
  }
  function beam(stage,path,a,b,width,rgb=colors.cream) {
    const d=sub(b,a), length=Math.hypot(...d), w=unit(d);
    const u=unit(cross(w,Math.abs(w[1])<0.9?[0,1,0]:[1,0,0])),v=cross(w,u);
    return surface(stage,path,(s,t)=>a.map((x,i)=>x+s*d[i]+width*(Math.cos(-t*Math.PI*2)*u[i]+Math.sin(-t*Math.PI*2)*v[i])),rgb,1,12);
  }
  function lathe(stage,path,center,profile,rgb=colors.teal) {
    return surface(stage,path,(u,v)=>{
      const f=Math.max(0,Math.min(profile.length-1-1e-7,v*(profile.length-1))),i=Math.floor(f),t=f-i;
      const r=profile[i][0]*(1-t)+profile[i+1][0]*t,y=profile[i][1]*(1-t)+profile[i+1][1]*t,a=-u*2*Math.PI;
      return [center[0]+r*Math.cos(a),center[1]+y,center[2]+r*Math.sin(a)];
    },rgb,64,(profile.length-1)*4);
  }
  function group(stage,path,position=[0,0,0],rotate=[0,0,0]) { return pose(stage,stage.DefinePrim(path,'Xform'),position,[1,1,1],rotate); }
  return { colors, attr, point, pose, color, bind, material, box, sphere, mesh, surface, torus, beam, lathe, group };
}
