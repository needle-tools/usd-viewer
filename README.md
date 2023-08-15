# USD Viewer

A USD viewer on the web.  
[Open USD Viewer](https://usd-viewer.glitch.me/)  

There are two main parts:  
- [USD WASM bindings by Autodesk](https://autodesk-forks.github.io/USD/usd_for_web_demos/)
- A [Three.js](https://threejs.org/) Hydra Delegate for rendering, originally by Autodesk and improved by hybridherbst

## Info and Known Issues

- You can load USDZ files, folders, multiple files.  
  - Try the Kitchen Set from [here](https://openusd.org/release/dl_kitchen_set.html)
  - Try assets from [Asset Explorer](https://asset-explorer.needle.tools)
- There is a heuristic to determine what the root file is - it's not perfect.  
- Up axis is only supported for the root file (and very hacky).  
- Variants are loaded but can't be switched.  
- The viewer uses SharedArrayBuffers, which have strict header and origin requirements and are not supported on all platforms. 

### Limitations

- Skinned meshes aren't supported. 
- Vertex colors aren't supported. 
- Point instancing isn't supported.  
- MaterialX isn't supported.  
- LightsAPI isn't supported.  
- Texture paths currently can't be resolved correctly for nested USDZ files. One level is fine.
    - Fixing this would require adjustments to the WASM bindings.

## Contribute

- [Report an issue](https://github.com/needle-tools/usd-viewer/issues)  
- [Reach out](https://twitter.com/hybridherbst)

## Development

- clone this repository
- run `npm install`
- run `npm run start`
- open `http://localhost:<port>` in your browser (Note: 0.0.0.0 won't work since it doesn't have SharedArrayBuffer permissions)

The three.js Hydra Delegate is in `public/ThreeJsRenderDelegate.js`.  
Loading and rendering are currently intermingled in `public/index.html`.  

## Origin

Based on [autodesk-forks.github.io/USD/usd_for_web_demos](https://autodesk-forks.github.io/USD/usd_for_web_demos/)  
Code here: [github.com/autodesk-forks/USD/tree/gh-pages](https://github.com/autodesk-forks/USD/tree/gh-pages)
This project: [github.com/needle-tools/usd-viewer](https://github.com/needle-tools/usd-viewer)

## Improvements over the original viewer

- added drag-and-drop loading
- dropping folders and multiple files is supported (experimental)
- g,b texture channels were missing with RBGFormat
- files of the form somefile.usdz[./textures/myTexture.jpg] weren't resolved correctly
- UVMap primvar type wasn't correctly resolved to uv
- support for texture wrap modes
- support for texture transforms (rotation isn't properly working yet)
- fixed output color space, added neutral HDR, fixed point light changing color appearance of scene
- very hacky support for up axis on the root file
- added camera orbit dampening
- setting policy headers server-side instead of via ServiceWorker

## Headers

Some JavaScript features used here require specific HTTP headers (SharedArrayBuffers).  
This was originally achieved by using the service worker from here: [github.com/gzuidhof/coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker/blob/master/coi-serviceworker.js).  

Now, headers are set server-side which should have wider support / better caching.

```
res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
```

## Credits

By [@hybridherbst](https://twitter.com/hybridherbst)  
🌵 [Needle](https://needle.tools) & [prefrontal cortex](https://prefrontalcortex.de)
