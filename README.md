# USD Viewer

## Origin

Based on [autodesk-forks.github.io/USD/usd_for_web_demos](https://autodesk-forks.github.io/USD/usd_for_web_demos/)  
Code here: [github.com/autodesk-forks/USD/tree/gh-pages](https://github.com/autodesk-forks/USD/tree/gh-pages)

## Additions

- reduced environment image size to 400 KB (PR here: [github.com/autodesk-forks/USD/pull/3](https://github.com/autodesk-forks/USD/pull/3))
- added drag-and-drop loading (PR here: [github.com/autodesk-forks/USD/pull/5](https://github.com/autodesk-forks/USD/pull/5))
- added camera orbit dampening
- setting headers server-side instead of via ServiceWorker

## Fixes

- g,b texture channels were missing with RBGFormat
- files of the form somefile.usdz[./textures/myTexture.jpg] weren't resolved correctly
- UVMap primvar type wasn't correctly resolved to uv

## Headers

Some JavaScript features used here require specific HTTP headers (SharedArrayBuffers).  
This was originally achieved by using the service worker from here: [github.com/gzuidhof/coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker/blob/master/coi-serviceworker.js).  
Now, headers are set server-side which should have wider support / better caching.

```
res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
```

## Credits

Adjusted by [@hybridherbst](https://twitter.com/hybridherbst)  
[prefrontal cortex](https://prefrontalcortex.de) / 🌵 [Needle](https://needle.tools)
