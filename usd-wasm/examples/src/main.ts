
import { getUsdModule, createThreeHydra, USD } from '@needle-tools/usd';
import { loadEnvMap, run } from './three';
import { Object3D, Scene, WebGLRenderer } from 'three';


getUsdModule({
  debug: true
}).then(async (USD: USD) => {

  // const url = "test.usdz"; // local file
  const url = "./gingerbread/GingerbreadHouse.usda";
  // const url = "https://cloud-staging.needle.tools/-/assets/Z23hmXB22WdG2-22WdG2/file.usda"; // remote file
  
  // using a file/buffer
  /* 
  const buffer = await fetch(url).then(response => response.arrayBuffer());
  const file = new File([buffer], url, { type: "model/usd" });
  file.path = url; // used to determine the directory structure
  */

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  const envmapUrl = "https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/1k/studio_small_09_1k.exr";
  const envmap = await loadEnvMap(envmapUrl, renderer);

  const scene = new Scene();
  scene.environment = envmap;

  const usdContent = new Object3D();
  scene.add(usdContent);
  const { update } = await createThreeHydra({
    debug: true,
    USD,
    url: url,
    // files: [file],
    // @ts-ignore – three types don't match for some reason
    scene: usdContent,
  })

  console.log(scene.children);

  // setTimeout(()=>dispose(), 2000);

  run({
    renderer,
    scene: scene,
    onRender: (dt) => {
      update(dt);
    }
  });

})
