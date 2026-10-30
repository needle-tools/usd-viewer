import { createSceneHelpers } from './scene-helpers.js';

// Shared native authoring source for the fixture catalog and standalone buttons.
export async function createApiStage(usd, kind, path) {
  const stage = await usd.CreateStage(path);
  stage.SetUpAxis('Y');
  stage.SetStartTimeCode(1);
  stage.SetEndTimeCode(48);
  stage.SetTimeCodesPerSecond(24);
  const k = createSceneHelpers(usd), c = k.colors;
  const world = stage.DefinePrim('/World', 'Xform');
  const material = k.material(stage, '/Looks/ApiPreview', kind === 'animated' ? c.blue : c.coral, 0.25, 0.28, '/Looks/ApiPreview/Shader');
  k.bind(world, material);

  if (kind.startsWith('variant')) {
    const previous = stage.GetEditTarget();
    try {
      for (const [name, type, attribute, value] of [
        ['sphere', 'Sphere', 'radius', 0.95], ['cube', 'Cube', 'size', 1.5],
      ]) {
        world.AddVariant('shape', name);
        await world.SetVariantSelection('shape', name);
        const target = world.GetVariantEditTarget('shape');
        try {
          stage.SetEditTarget(target);
          stage.DefinePrim('/World/Shape', type).GetAttribute(attribute).Set(value, Number.NaN);
        } finally { stage.SetEditTarget(previous); target.delete(); }
      }
    } finally { previous.delete(); }
    await world.SetVariantSelection('shape', kind === 'variant-cube' ? 'cube' : 'sphere');
    // The sphere gets an orbital cage; the cube sits on a stepped stand.
    if (kind === 'variant-sphere') {
      k.torus(stage, '/World/OrbitalCage/Equator', [0,0,0], 1.45, 0.055, c.gold, 'y');
      k.torus(stage, '/World/OrbitalCage/Meridian', [0,0,0], 1.45, 0.055, c.teal);
      for (let i=0;i<3;i++) {
        const a=i*Math.PI*2/3;
        k.sphere(stage, '/World/OrbitalCage/Satellite'+i, [1.45*Math.cos(a),0,1.45*Math.sin(a)], 0.18, c.gold);
      }
    } else {
      k.pose(stage, stage.GetPrimAtPath('/World/Shape'), [0,0.15,0], [1,1,1], [12,25,10]);
      for (let i=0;i<3;i++) {
        k.box(stage, '/World/Assembly/Step'+i, [0,-1.05-i*0.23,0], [1.9+i*0.45,0.13,1.5+i*0.35], i%2?c.gold:c.ink, [0,i*12,0]);
      }
      for (const x of [-1.2,1.2]) k.beam(stage,'/World/Assembly/Guide'+(x<0?'L':'R'),[x,-0.9,0],[x,1.25,0],0.055,c.teal);
    }
  } else {
    const sphere = k.sphere(stage, '/World/ApiSphere', kind === 'animated' ? [-0.8,0.2,0] : [0,0.7,0], kind === 'animated' ? 0.65 : 0.72, c.coral);
    k.bind(sphere, material);
    if (kind === 'animated') {
      const diffuseColor = stage.GetPrimAtPath('/Looks/ApiPreview/Shader').GetAttribute('inputs:diffuseColor');
      diffuseColor.SetColor3f(0.1,0.35,1,Number.NaN);
      diffuseColor.SetColor3f(0.1,0.35,1,1);
      diffuseColor.SetColor3f(1,0.35,0.05,24);
      diffuseColor.SetColor3f(0.1,0.35,1,48);
      k.bind(k.torus(stage,'/World/ColorRibbon',[0.65,0.15,0],0.9,0.22,c.blue),material);
      k.beam(stage,'/World/Timeline',[-1.8,-0.8,0],[1.8,-0.8,0],0.045,c.cream);
      for(let i=0;i<9;i++) k.sphere(stage,'/World/ColorSample'+i,[-1.6+i*0.4,-0.8,0],0.1,[0.1+i*0.1,0.35,1-i*0.1]);
    } else {
      k.bind(k.lathe(stage,'/World/GlazeBody',[0,0,0],[[0.01,-1],[0.7,-1],[0.72,-0.75],[0.45,-0.3],[0.3,0.1],[0.01,0.15]],c.coral),material);
      k.torus(stage,'/World/GoldCollar',[0,0.1,0],0.45,0.08,c.gold,'y');
      k.torus(stage,'/World/Handle',[0.75,-0.25,0],0.46,0.085,c.teal);
      k.box(stage,'/World/Plinth',[0,-1.12,0],[2.1,0.16,1.8],c.ink,[0,25,0]);
    }
  }
  // Child materials override the inherited hero shader so the surrounding
  // construction remains legible while /World/Shape switches schema in place.
  const descendants = stage.TraverseAll();
  for(let i=0;i<descendants.size();i++) {
    const p=descendants.get(i), path=p.GetPath();
    if(!['Mesh','Sphere','Cube'].includes(p.GetTypeName()) || ['/World/Shape','/World/ApiSphere','/World/GlazeBody','/World/ColorRibbon'].includes(path)) continue;
    const rgb=p.GetAttribute('primvars:displayColor').Get(Number.NaN)?.[0];
    if(rgb?.length===3) k.bind(p,k.material(stage,'/Looks/Details'+i,rgb,0.1,0.4));
  }
  return stage;
}
