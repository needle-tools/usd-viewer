
import { getUsdModule, createThreeHydra, USD, createThreeHydraReturnType } from '@needle-tools/usd';
import { loadEnvMap, run } from './three';
import { Object3D, Scene, WebGLRenderer } from 'three';

import { allDroppedFiles } from './fileHandling';

let hydraDelegate: createThreeHydraReturnType | null;
let scene: Scene;
let usdContent: Object3D;
let usd: USD;
let app: { fitCamera: () => void };

getUsdModule({
  debug: true,
  urlModifier: async (url: string) => {
    // Resolve GitHub-specific URLs
    // rewrite GitHub links in the form https://github.com/usd-wg/assets/blob/main/full_assets/ElephantWithMonochord/SoC-ElephantWithMonochord.usdc
    // to the raw version https://raw.githubusercontent.com/usd-wg/assets/main/full_assets/ElephantWithMonochord/SoC-ElephantWithMonochord.usdc
    if (url.startsWith("https://github.com")) {
      url = url.replace("github.com", "raw.githubusercontent.com");
      url = url.replace("/blob/", "/");
    }

    console.log(url);

    // Check if we find this URL in the dropped files, if there are any
    if (allDroppedFiles && allDroppedFiles.length > 0) {
      const found = allDroppedFiles.find(f => f.fullPath == url);

      if (found) {
        console.log("found file, returning handle", url, found);
        if ("file" in found) {
          return await new Promise((resolve, reject) => found.file(resolve, reject));
        }
        else if ("getFile" in found) {
          return await found.getFile();
        }
      }
      else {
        console.warn("File not found", url, allDroppedFiles);
      }
    }

    // return "./gingerbread/house/" + url;
    return url;
  }
}).then(async (USD: USD) => {

  const testUrls = [
    { label: "USDZ Cube", url: "/test.usdz" },
    { label: "Gingerbread House USDC", url: "/gingerbread/house/GingerBreadHouse.usdc" },
    { label: "Gingerbread House USDA", url: "/gingerbread/GingerbreadHouse.usda", },
    { label: "USDA file with HTTPS references", url: "/HttpReferences.usda" },
    { label: "Gingerbread House from Needle Cloud", url: "https://cloud-staging.needle.tools/-/assets/Z23hmXB22WdG2-22WdG2/file.usda" },
    { label: "Gingerbread House Subasset from Needle Cloud", url: "https://cloud-staging.needle.tools/-/assets/Z23hmXB22WdG2-22WdG2/house/GingerBreadHouse.usdc" },
    { label: "USD Kitchen from Needle Cloud", url: "https://cloud-staging.needle.tools/-/assets/Z23hmXBZCdB4p-ZCdB4p/file.usdz" },
    { label: "Car with Variants", url: "https://github.com/usd-wg/assets/blob/main/full_assets/Vehicles/USD_Mini_Car_Kit/assets/vehicles/vehicleVariants.usda" },
    { label: "Carbon Frame Bike USDZ", url: "https://github.com/usd-wg/assets/blob/jcowles/discoverability/full_assets/CarbonFrameBike/CarbonFrameBike.usdz" },
    { label: "Carbon Frame Bike USDA", url: "https://github.com/usd-wg/assets/blob/jcowles/discoverability/full_assets/CarbonFrameBike/index.usda" },
    { label: "McUsd USDA", url: "https://github.com/usd-wg/assets/blob/jcowles/discoverability/full_assets/McUsd/McUsd.usda" },
    { label: "Teapot USD", url: "https://github.com/usd-wg/assets/blob/main/full_assets/Teapot/Teapot.usd" },
  ];

  const div = document.createElement("div");
  div.className = "test-buttons";
  
  for (const url of testUrls) {
    const button = document.createElement("button");
    button.innerText = url.label;
    button.onclick = () => loadFile(url.url);
    div.appendChild(button);
  }

  document.body.appendChild(div);

  const div2 = document.createElement("div");
  div2.className = "options";
  const frameButton = document.createElement("button");
  frameButton.innerText = "Fit Camera";
  frameButton.onclick = () => app.fitCamera();
  div2.appendChild(frameButton);
  div.appendChild(div2);

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

  scene = new Scene();
  scene.environment = envmap;
  scene.background = envmap;
  scene.backgroundBlurriness = 0.8;
  scene.backgroundIntensity = 0.2;

  usd = USD;

  /*
    usdContent = new Object3D();
    scene.add(usdContent);
    hydraDelegate = await createThreeHydra({
      debug: true,
      USD,
      url: url,
      // files: [file],
      // @ts-ignore
      scene: usdContent,
    })
    */

  // loadFile(url);

  app = run({
    renderer,
    scene: scene,
    onRender: (dt) => {
      hydraDelegate?.update(dt);
    }
  });
})

async function loadFile(url: string) {

  if (hydraDelegate)
    hydraDelegate.dispose();
  hydraDelegate = null;

  if (usdContent) {
    scene.remove(usdContent);
    // TODO dispose as well
  }

  usdContent = new Object3D();
  scene.add(usdContent);

  const delegate = await createThreeHydra({
    debug: true,
    USD: usd,
    url: url,
    // @ts-ignore
    scene: usdContent,
  })

  hydraDelegate = delegate;

  console.log("Scene content", usdContent);
  app.fitCamera();
}

window.loadFile = loadFile;