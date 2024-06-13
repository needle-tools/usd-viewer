
import { getUsdModule, createThreeHydra, USD } from '@needle-tools/usd';
import { loadEnvMap, run } from './three';
import { Scene, WebGLRenderer } from 'three';


getUsdModule({
  debug: true
}).then(async (USD: USD) => {

  const filepath = "test.usdz";


  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  const envmapUrl = "https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/1k/studio_small_09_1k.exr";
  const envmap = await loadEnvMap(envmapUrl, renderer);

  const scene = new Scene();
  scene.environment = envmap;

  const { update } = await createThreeHydra({
    debug: true,
    USD,
    usdz: filepath,
    scene,
  })

  console.log(scene.children)

  // setTimeout(()=>dispose(), 2000);

  run({
    renderer,
    scene: scene,
    onRender: (dt) => {
      update(dt);
    }
  });

})
