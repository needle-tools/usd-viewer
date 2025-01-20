
import { getUsdModule, createThreeHydra, USD } from '@needle-tools/usd';
import { loadEnvMap, run } from './three';
import { Object3D, Scene, WebGLRenderer } from 'three';


getUsdModule({
  debug: true,
  setURLModifier: (url: string) => {

    // This is just for testing – this code already runs inside emHdBindings.js
    if (url.startsWith("/http")) url = url.slice(1);
    if (url.includes("http:/")) url = url.replace("http:/", "http://");
    if (url.includes("https:/")) url = url.replace("https:/", "https://");

    console.log(url);

    // return "./gingerbread/house/" + url;
    return url;
  }
}).then(async (USD: USD) => {

  // const url = "test.usdz"; // local file
  // const url = "/gingerbread/house/GingerBreadHouse.usdc";
  // const url = "/gingerbread/GingerbreadHouse.usda";
  const url = "/HttpReferences.usda";
  // ... all the URLs
  // --> put them all into the virtual file system
  // --> load the first one (assume which one that actually is)

  // const url = "https://cloud-staging.needle.tools/-/assets/Z23hmXB22WdG2-22WdG2/file.usda"; // remote file
  // const url = "https://cloud-staging.needle.tools/-/assets/Z23hmXB22WdG2-22WdG2/house/GingerBreadHouse.usdc"; // remote file
  
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
