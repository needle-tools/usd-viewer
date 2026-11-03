# Distributing Needle Three.js Hydra

The usual Hydra delivery is a versioned archive or installer containing a
renderer library, a USD `plugInfo.json` manifest, resources and any renderer
runtime dependencies. USD discovers the manifest and loads the renderer library
when the host selects it. A user does not need to replace their application's
USD installation or build all of OpenUSD to install a compatible renderer.
See the official [USD plugin framework](https://openusd.org/release/api/plug_page_front.html)
and [manifest/discovery reference](https://openusd.org/release/api/class_plug_registry.html).

## What this renderer needs

The current implementation is macOS-specific. Build a separate plugin for each
supported host SDK, architecture and compatible application version. Matching a
USD version number alone is insufficient: namespaces, compiler configuration,
dependent libraries and host ABI must also match. In particular, Blender's USD
namespace differs from the standalone installation used for usdview. Do not
copy the usdview library into Blender or Houdini, or bundle a competing USD
runtime into the host's library search path.

The plugin starts an Electron helper to run the shared Three.js renderer. Keep
the pinned runtime in `native/package-lock.json`, its complete application
bundle/frameworks, the native `surface.node` addon, compiled renderer and assets
together. The helper's browser window is configured to stay hidden. A visible
window is unintended, not an installation step. Moving away from Electron is
deferred; it is a required runtime dependency for the current implementation.
Electron's [shared-texture offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)
is the GPU export path. The recipient does not need the web viewer running.

## Send a developer the current integration

For a handoff today, send the paired source revisions and these instructions.
Use `needle/feature/hdEmscripten` in `needle-tools/OpenUSD` and the consolidated
viewer revision containing this guide. Record exact commit IDs rather than
asking the recipient to combine arbitrary branch tips. The OpenUSD branch has
`NEEDLE_NATIVE_HYDRA.md` explaining the consolidation and original wasm provenance.

1. Check out both repositories beside each other as `openusd` and `usd-viewer`.
   Have the target host and its matching development headers/libraries
   available. This OpenUSD source provides shared imaging headers; it does not
   replace the host SDK. The local build instructions in [README.md](README.md)
   describe the host-specific CMake inputs.
2. Install the viewer and native runtime dependencies from their lockfiles:

   ```sh
   npm ci
   npm ci --prefix native
   # Only if lifecycle scripts were disabled during installation:
   node native/node_modules/electron/install.js
   node native/build.mjs
   ```

3. Configure and build only the required host plugin using the commands in
   [README.md](README.md). Set `NEEDLE_OPENUSD_SOURCE` if the repositories are not
   siblings. Do not rebuild OpenUSD/wasm merely to install this native plugin.
4. Run `python3 native/install-hosts.py` for the matching installed versions.
   Its defaults target the local standalone USD prefix, Blender 5.1 and Houdini
   22.0; use `--usd-prefix`, `--blender-version` and `--houdini-version` as needed.
   Installation metadata does not make a binary compatible with another SDK.
5. Restart the host and select **Needle Three.js WebGPU**. The checkout launchers
   `native/run-usdview`, `native/run-blender` and `native/run-houdini-compat`
   provide an isolated launch environment. Confirm rendering and selection with
   the verification scripts in [README.md](README.md).

The current installer creates links and discovery entries pointing into the
checkout. Keep that checkout and its runtime installed at their original paths.
This is a developer installation, not a relocatable binary release.

## Binary package to send an end user

Produce an archive/installer per host ABI and architecture, for example:

```text
NeedleHydra-<renderer-version>-<host-build>-macos-<arch>/
  plugin/
    libhdNeedle.dylib
    resources/plugInfo.json
  runtime/
    Electron.app/
    surface.node
    renderer/                  # main/preload/index, bundled Three.js and assets
    environments/neutral.hdr
  host/                        # matching Blender add-on or Houdini metadata
  LICENSES/
  manifest.json
  INSTALL.md
```

This is the proposed release layout, not the current build output. The release
manifest should record the viewer/OpenUSD revisions, host build and USD ABI,
architecture, Electron/Three.js versions and file hashes. Ship the fallback HDR,
generated runtime assets and required dependency/license notices, not just the
Hydra library. Link host-provided libraries from the host; include private
renderer dependencies only where their licenses allow redistribution.

Before making that portable archive, replace the current compile-time
`NEEDLE_SOURCE_DIR` and `NEEDLE_ELECTRON` checkout paths with installed runtime
discovery, and adapt `main.cjs`/renderer asset paths and the Blender add-on's
checkout-relative lookup to the release layout. `NEEDLE_HYDRA_ELECTRON` currently
overrides only the executable, not the renderer script/runtime root. Copying
today's `.build` directory to a different machine is therefore insufficient.
For an internal fixed-location pilot, compiling and installing the complete
runtime at the same agreed absolute prefix is possible, but is not portable.

Audit dynamic-library dependencies and rpaths with `otool -L`/`otool -l`, then
sign the native library, addon and nested Electron application appropriately
and notarize the public macOS distribution. Preserve framework symlinks and
executable permissions when archiving. Test on a clean recipient installation
with no developer checkout, Homebrew headers or inherited USD/Python paths.
Verify renderer discovery, a real render, picking, progressive updates and
uninstallation through each target host. The source handoff above is the
working route until this packaging work has been implemented and verified.

## Host registration

| Host | Registration delivered by its package |
| --- | --- |
| Standalone usdview | Add the package's `resources/plugInfo.json` to USD discovery using a managed include in the installation's scanned plugin directory, or prepend its resource directory to `PXR_PLUGINPATH_NAME` for that application launch. |
| Blender | Install and enable the matching `needle_hydra` Python add-on; it registers the Hydra engine and its bundled plugin manifest. Our current developer installer links the add-on into the user's `scripts/addons` directory. |
| Houdini/Solaris | Install a Houdini package JSON that adds the manifest to `PXR_PLUGINPATH_NAME` and the renderer metadata directory to `HOUDINI_PATH`, preserving other package entries. Include `UsdRenderers.json` and the viewport parameter definition. |

Houdini's official [package documentation](https://www.sidefx.com/docs/houdini/ref/plugins.html)
describes per-user/site package discovery and version conditions. Blender's
adapter uses the host's `bpy.types.HydraRenderEngine` API; the native plugin is
still compiled against Blender's USD SDK. Existing per-host launchers and the
installer are useful development examples, not a universal binary installer.

An installer should record the files and registrations it owns and remove only
those on uninstall. Keep explicit renderer sample settings and existing host
preferences. The installed Houdini builds' Retina picking compatibility option
is described in [README.md](README.md); it remains a per-launch setting.
