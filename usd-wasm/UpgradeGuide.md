# Upgrade Guide

## From 1.x to 2.x

### Optional path tracing

Install `@meimu/mutracer@0.3.0` and use `pathtraced` with `loadPathTracer`.
The optional `pathtraced-gk` mode, `loadGkPathTracer`, `loadDenoiser` and
`gkDenoiser` settings have been removed. The public viewer maps older links and
saved mode preferences to MuTracer; SDK callers should use `pathtraced`.

### Runtime selection

`getUsdModule()` now selects the JSPI runtime where `WebAssembly.Suspending`
and `WebAssembly.promising` are available, and the Asyncify runtime elsewhere.
1.x used Asyncify unless you passed `asyncRuntime: 'auto'`.

Both runtimes have the same API, so most applications need no runtime option.
Pass `asyncRuntime: 'asyncify'` or `asyncRuntime: 'jspi'` only to force one. A
custom `locateFile` or `mainScriptUrlOrBlob` must point to the files of the
selected runtime: `emHdBindings.jspi.js` and `emHdBindings.jspi.wasm` for
JSPI, `emHdBindings.js` and `emHdBindings.wasm` for Asyncify.

### Await binding operations that can load data

Operations that can load data, such as `OpenStage`, `Attribute.Get`,
`Attribute.GetValueString`, `Prim.SetVariantSelection`, `Prim.Load` and
`Stage.ExportToString`, always return a Promise. Their types are `Promise<T>`.
In 1.x, Asyncify returned a plain value unless the call had to fetch data.

```js
// 1.x
const stage = USD.OpenStage(path);
const size = attribute.Get(time);

// 2.x
const stage = await USD.OpenStage(path);
const size = await attribute.Get(time);
```

Their errors, including invalid arguments, are rejections instead of
exceptions.

### Create drivers with `CreateHydraDriver`

`new HdWebSyncDriver(delegate, file)` and `CreateHdWebSyncDriver` are replaced
by one asynchronous factory:

```js
const driver = await USD.CreateHydraDriver(delegate, file);
```

The driver type is `HydraDriver`. The module no longer exports the driver
class. `createThreeHydra` creates its driver for you.

### Inspection from `@needle-tools/usd/scene`

`inspectStage` and `inspectPrim` are asynchronous; `await` them inside
`handle.readStage()`. `inspectStageAsync` and `inspectPrimAsync` are removed.

```js
// 1.x
const info = await handle.readStage(stage => inspectStageAsync(stage, time));

// 2.x
const info = await handle.readStage(stage => inspectStage(stage, time));
```

`inspectPrim` accepts the options of the former `inspectPrimAsync`, such as
`{arrayLimit: 256}`.
