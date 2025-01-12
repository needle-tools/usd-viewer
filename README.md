# USD Viewer

A USD viewer on the web.  
[Open USD Viewer](https://usd-viewer.glitch.me/)  

There are two main parts:  
- [USD WASM bindings by Autodesk](https://github.com/needle-tools/OpenUSD/tree/needle/feature/wasm-improvements)
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

### Rebuilding USD-wasm

NOTE: Origins for these instructions can be found [here](https://github.com/autodesk-forks/USD/blob/adsk/feature/webgpu/pxr/usdImaging/bin/usdviewweb/README.md)

#### Getting Setup

1. Setup emscripten if it's not already setup.
    1. Download and Install [emscripten](https://emscripten.org) from [HERE](https://emscripten.org/docs/getting_started/downloads.html).
    2. MacOS
        1. Download and install the latest SDK tools.
            1. `./emsdk install 3.1.55`
        2. Make the specific SDK "active" for the current user. (writes .emscripten file)
            1. `./emsdk activate 3.1.55`
        3. Activate PATH and other environment variables in the current terminal
            1. `source ./emsdk_env.sh`
      3. Windows
          1. Download and install the latest SDK tools.
              1. `emsdk install 3.1.55`
          2. Make the specific SDK for the current user. (writes .emscripten file)
              1. `emsdk activate 3.1.55`
  2. Setup CMAKE
      1. Install
      2. Open CMAKE, open "Tools/How to install for Command Line Use"
      3. Copy the command there and run in the same terminal, e.g.
         `PATH="/Applications/CMake.app/Contents/bin":"$PATH"`
  2. Pull [this branch](https://github.com/autodesk-forks/USD/tree/adsk/feature/webgpu) from Autodesk's USD fork
      1. `git clone --recursive https://git.autodesk.com/autodesk-forks/usd/tree/adsk/feature/webgpu`

#### Building

##### Release

1. Go into the root of usd source repo, if the folder name is "usd_repo"
    1. `cd usd_repo`
2. Build USD with the --emscripten flag, for example "../build_dir" is your local build folder
    2. `python3 ./build_scripts/build_usd.py --build-target wasm ../build_dir`
3. This will put the resulting files in ../build_dir/bin
    1. `emHdBindings.js`
    2. `emHdBindings.wasm`
    3. `emHdBindings.worker.js`
    4. `emHdBindings.data`
    4. Note: It's possible the build will fail due to comments in `pxr/base/arch/hints.h`, removing all comments from line 1-26 allowed the build to complete successfully
4. Run `wasm-opt -Oz -o "../build_dir/bin/emHdBindings.wasm" "../build_dir/bin/emHdBindings.wasm" --enable-bulk-memory --enable-threads` to shrink the wasm file more.
5. Patch emHdBindings.js to enable the following support, unable to currently do these things as part of the normal build process
    1. Support for arguments
        - `patch emHdBindings.js < arguments_1.patch` 
        - `patch emHdBindings.js -R < arguments_2.patch` 
    2. Disable ABORT so that one bad file doesn't corrupt the entire session
        - `patch emHdBindings.js < abort.patch` 
    3. Add file system functions to the module
        - `patch emHdBindings.js -R < fileSystem.patch` 
    4. Include global export
        - `echo -e '\nglobalThis["NEEDLE:USD:GET"] = getUsdModule;' >> "emHdBindings.js"`

##### Debug
1. Install [ C/C++ DevTools Support (DWARF)](https://chromewebstore.google.com/detail/cc++-devtools-support-dwa/pdcpmagijalfljmkmjngeonclgbbannb)
2. Update https://github.com/needle-tools/OpenUSD/blob/needle/feature/wasm-improvements/pxr/usdImaging/hdEmscripten/CMakeLists.txt#L89, instead of `-Oz` use `-O3 -g`
3. Go into the root of usd source repo, if the folder name is "usd_repo"
    1. `cd usd_repo`
4. Build USD with the --emscripten flag, for example "../build_dir" is your local build folder
    2. `python3 ./build_scripts/build_usd.py --build-target wasm --build-variant debug ../build_dir`
5. This will put the resulting files in ../build_dir/bin
    1. `emHdBindings.js`
    2. `emHdBindings.wasm`
    3. `emHdBindings.worker.js`
    4. `emHdBindings.data`
    5. Note: It's possible the build will fail due to comments in `pxr/base/arch/hints.h`, removing all comments from line 1-26 allowed the build to complete successfully
6. Patch emHdBindings.js to enable the following support, unable to currently do these things as part of the normal build process
    1. Support for arguments
        - `patch emHdBindings.js < arguments_1.patch` 
        - `patch emHdBindings.js -R < arguments_2.patch` 
    2. Disable ABORT so that one bad file doesn't corrupt the entire session
        - `patch emHdBindings.js < abort.patch` 
    3. Add file system functions to the module
        - `patch emHdBindings.js -R < fileSystem.patch` 
    4. Include global export
        - `echo -e '\nglobalThis["NEEDLE:USD:GET"] = getUsdModule;' >> "emHdBindings.js"`
7. Run `npm start`
8. Go to http://localhost:3003 (or wherever the app is running)
9. Open up Chrome Dev Tools
10. Go to Sources -> (vertical ellipsis) -> Group by Authored/Deployed
11. Under Authored, you can go through to the pxr files to set breakpoints in the c++ code.

##### Build Script
There is a build script [here](https://github.com/needle-tools/OpenUSD/blob/needle/feature/wasm-improvements/buildAndMove.sh) which tries to make building easier. Set the mode, build directory and destination directory to deal with the file movement. This does not update CMakeLists.txt for debug mode automatically. Follow step 2 above to configure this.

Usage: `./buildAndMove.sh --mode release --build-dir ../build-wasm --destination-dir /Users/andrewbeers/git/needle/usd-viewer/usd-wasm/src/bindings --patch-dir /Users/andrewbeers/git/needle/OpenUSD/pxr/usdImaging/hdEmscripten/patches`

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
