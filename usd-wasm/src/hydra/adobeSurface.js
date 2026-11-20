// Adobe's import networks retain volume inputs that universal Preview Surface
// cannot represent. Keep connected UsdUVTexture nodes and their sampler state.
export function adobeSurface(node, defaults) {
 const result={...defaults};
 const inputs={baseColor:'diffuseColor',metallic:'metallic',roughness:'roughness',opacity:'opacity',IOR:'ior',normal:'normal',height:'displacement',ambientOcclusion:'occlusion',emissive:'emissiveColor',emissiveIntensity:'emissiveIntensity',translucency:'transmission',volumeThickness:'thickness',absorptionColor:'attenuationColor',absorptionDistance:'attenuationDistance',coatOpacity:'clearcoat',coatRoughness:'clearcoatRoughness',opacityThreshold:'opacityThreshold'};
 for(const [input,target]of Object.entries(inputs))if(node[input]!==undefined){
  result[target]=node[input];
  if(node['colorSpace:'+input])result['colorSpace:'+target]=node['colorSpace:'+input];
 }
 if(result.attenuationDistance<=0)result.attenuationDistance=Infinity;
 if(node.clearcoatModelsTransmissionTint)result.clearcoat=0;
 return result;
}
