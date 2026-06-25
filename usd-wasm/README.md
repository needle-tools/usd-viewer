# Needle USD

USD wasm runtime and three.js Hydra delegate.   
Developed & maintained by [Needle](https://needle.tools).  

For commercial use, please contact [hi@needle.tools](mailto:hi@needle.tools).  

## Install

```sh
npm install @needle-tools/usd@next three @needle-tools/materialx@1.7.0
```

This major prerelease uses upstream OpenUSD 26.05 and ships a Hydra imaging
bridge for three.js. The wasm bundle includes Adobe `usdGltf`, MaterialX, and
OpenSubdiv support.



## Use with Needle Engine


```ts
import { get } from "svelte/store";
import { activeFiles } from "..";
import { addPluginForNeedleEngine } from "@needle-tools/usd/plugins";

export function addUsdPlugin() {
    return addPluginForNeedleEngine({
        // USD files to load (first file must be the main file)
        getFiles: () => { return get(activeFiles) as Array<File & { path: string }> }
    })
}
```


### Use with three.js


See full example in [examples](/usd-wasm/examples/src/main.ts)

```js
import { getUsdModule } from "@needle-tools/usd";
import { createThreeHydra } from "@needle-tools/usd/three";

// Load the USD module
const usd = await getUsdModule();
// Load a USD file to be rendered by threejs
const handle = await createThreeHydra({
    USD: usd,
    scene: ctx.scene,
    usdz: "http://localhost:8081/v1/public/89aa693/89aa693/ImageTrackingNeedleSample.usdz",
})
// Call handle.update(dt) in your threejs update loop 
```

Public package entrypoints:

```js
import { getUsdModule, loadOpenUsdBuildInfo } from "@needle-tools/usd";
import { createThreeHydra } from "@needle-tools/usd/three";
import { addPluginForNeedleEngine } from "@needle-tools/usd/plugins";
import { needleUSD } from "@needle-tools/usd/vite";
```



## Low Level Usage

### Import
```js
import { getUsdModule } from '@needle-tools/usd';
```

### Load the Module

```js
getUsdModule({
  // We need to override where the initial module is loaded from, 
  // since after bundling we can't rely on paths anymore
  mainScriptUrlOrBlob: "/emHdBindings.js",
}).then(async (Usd: USD) => {
    // use Usd here
});
```

### Load a file into the virtual file system
```js
const blob = await fetch("test.usdz");
const arrayBuffer = await blob.arrayBuffer();
// Create a file in the virtual file system
Usd.FS_createDataFile("", "test.usdz", new Uint8Array(arrayBuffer), true, true, true);
```

### Load file into USD

```js
let driver = new Usd.HdWebSyncDriver(delegate, "test.usdz");
if (driver instanceof Promise) driver = await driver;

// This kicks off asynchronous tasks to look at everything that has changed – _SyncAll –
// which will then call into the delegate to create and update the scene graph.
driver.Draw();
```

## Useful References

Uses `Asyncify` to handle async calls in emscripten.  
> A synchronous call in C that waits for an asynchronous operation in JS to complete.
https://emscripten.org/docs/porting/asyncify.html


# Contact ✒️
<b>[🌵 Needle](https://needle.tools)</b> • 
[Github](https://github.com/needle-tools) • 
[Twitter](https://twitter.com/NeedleTools) • 
[Discord](https://discord.needle.tools) • 
[Forum](https://forum.needle.tools) • 
[Youtube](https://www.youtube.com/@needle-tools)
