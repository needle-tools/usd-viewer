import {Color} from 'three';
import {backgroundRotation, equirectUV, mix, normalWorldGeometry, pmremTexture, texture, uniform, vec4} from 'three/tsl';
import {getDomeRotation} from '../../usd-wasm/src/hydra/domeEnvironment.js';

/** Camera background only. Never modify the dome texture or scene.environment. */
export function createDomeBackground(scene) {
  const opacity=uniform(1), intensity=uniform(1), backdrop=uniform(new Color());
  let current=null;
  function release() {
    if(!current)return;
    current.texture.removeEventListener('dispose',release);
    current.pmrem.dispose();
    current=null;
  }
  return {
    update(dome,settings) {
      const visible=settings.domeLightCameraVisibility&&dome;
      const image=visible?dome._domeTexture:null;
      if(current&&current.texture!==image)release();
      scene.background=image;
      scene.backgroundNode=null;
      scene.backgroundBlurriness=settings.backgroundBlur;
      scene.backgroundIntensity=dome?Number(dome._domeState.intensity??1):1;
      if(dome)getDomeRotation(dome._object,scene.backgroundRotation);
      if(!image||settings.backgroundOpacity===1)return;
      if(!current){
        const sharp=texture(image,equirectUV(backgroundRotation.mul(normalWorldGeometry)));
        const pmrem=pmremTexture(image);
        const blend=sample=>vec4(mix(backdrop,sample.rgb.mul(intensity),opacity),1);
        current={texture:image,pmrem,sharp:blend(sharp),blurred:blend(pmrem)};
        image.addEventListener('dispose',release);
      }
      opacity.value=settings.backgroundOpacity;
      intensity.value=scene.backgroundIntensity;
      backdrop.value.fromArray(settings.backgroundColor);
      // Three's background handles rotation and PMREM roughness. Blend the
      // viewport backdrop before the shared Beauty/TRAA pipeline, so silhouettes
      // and transparent surfaces resolve against the displayed background.
      scene.backgroundNode=settings.backgroundBlur>0?current.blurred:current.sharp;
      scene.backgroundIntensity=1;
    },
    dispose:release,
  };
}
