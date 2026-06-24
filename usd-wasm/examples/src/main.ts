
import { getUsdModule, createThreeHydra, USD, NeedleThreeHydraHandle } from '@needle-tools/usd';
import { loadEnvMap, run } from './three';
import { Object3D, Scene, WebGLRenderer } from 'three';

import { allDroppedFiles } from './fileHandling';

declare global {
  interface Window {
    loadFile: (url: string, label?: string) => Promise<void>;
  }
}

let hydraDelegate: NeedleThreeHydraHandle | null;
let scene: Scene;
let usdContent: Object3D;
let usd: USD;
let app: { fitCamera: () => void };
let statusElement: HTMLElement | null = null;
let variantControlsElement: HTMLElement | null = null;
let lastApiKind: ApiSceneKind = "preview";
const debugUsd = false;

type TestFile = { path: string, url: string };
type TestAsset = { label: string, url?: string, files?: TestFile[], group: string };
type ApiSceneKind = "preview" | "animated" | "variant-sphere" | "variant-cube";

const fixtureUrls = {
  "asset-explorer/DamagedHelmet.glb": new URL("../../tests/fixtures/asset-explorer/DamagedHelmet.glb", import.meta.url).href,
  "asset-explorer/DamagedHelmet.glb.three.usdz": new URL("../../tests/fixtures/asset-explorer/DamagedHelmet.glb.three.usdz", import.meta.url).href,
  "asset-explorer/BoomBox.glb": new URL("../../tests/fixtures/asset-explorer/BoomBox.glb", import.meta.url).href,
  "asset-explorer/BoomBox.glb.three.usdz": new URL("../../tests/fixtures/asset-explorer/BoomBox.glb.three.usdz", import.meta.url).href,
  "asset-explorer/CesiumMan.glb": new URL("../../tests/fixtures/asset-explorer/CesiumMan.glb", import.meta.url).href,
  "asset-explorer/CesiumMan.glb.openusd.usdz": new URL("../../tests/fixtures/asset-explorer/CesiumMan.glb.openusd.usdz", import.meta.url).href,
  "materialx/mxSimple.usda": new URL("../../tests/fixtures/materialx/mxSimple.usda", import.meta.url).href,
  "materialx/materialx_nested_reference.usda": new URL("../../tests/fixtures/materialx/materialx_nested_reference.usda", import.meta.url).href,
  "materialx/materialx_variant_bindings.usda": new URL("../../tests/fixtures/materialx/materialx_variant_bindings.usda", import.meta.url).href,
  "materialx/usdshade_preview_with_mtlx_peer.usda": new URL("../../tests/fixtures/materialx/usdshade_preview_with_mtlx_peer.usda", import.meta.url).href,
  "materialx/materialx_texture_noise.usda": new URL("../../tests/fixtures/materialx/materialx_texture_noise.usda", import.meta.url).href,
  "materialx/materialx_marble.usda": new URL("../../tests/fixtures/materialx/materialx_marble.usda", import.meta.url).href,
  "materialx/materialx_procedural_brick.usda": new URL("../../tests/fixtures/materialx/materialx_procedural_brick.usda", import.meta.url).href,
  "materialx/mtlxFiles/standard_surface_default.mtlx": new URL("../../tests/fixtures/materialx/mtlxFiles/standard_surface_default.mtlx", import.meta.url).href,
  "materialx/mtlxFiles/texture_noise_surface.mtlx": new URL("../../tests/fixtures/materialx/mtlxFiles/texture_noise_surface.mtlx", import.meta.url).href,
  "materialx/mtlxFiles/standard_surface_marble_solid.mtlx": new URL("../../tests/fixtures/materialx/mtlxFiles/standard_surface_marble_solid.mtlx", import.meta.url).href,
  "materialx/mtlxFiles/standard_surface_brick_procedural.mtlx": new URL("../../tests/fixtures/materialx/mtlxFiles/standard_surface_brick_procedural.mtlx", import.meta.url).href,
  "materialx/textures/checker.png": new URL("../../tests/fixtures/materialx/textures/checker.png", import.meta.url).href,
  "materialx/textures/brick_base_gray.jpg": new URL("../../tests/fixtures/materialx/textures/brick_base_gray.jpg", import.meta.url).href,
  "materialx/textures/brick_dirt_mask.jpg": new URL("../../tests/fixtures/materialx/textures/brick_dirt_mask.jpg", import.meta.url).href,
  "materialx/textures/brick_mask.jpg": new URL("../../tests/fixtures/materialx/textures/brick_mask.jpg", import.meta.url).href,
  "materialx/textures/brick_normal.jpg": new URL("../../tests/fixtures/materialx/textures/brick_normal.jpg", import.meta.url).href,
  "materialx/textures/brick_roughness.jpg": new URL("../../tests/fixtures/materialx/textures/brick_roughness.jpg", import.meta.url).href,
  "materialx/textures/brick_variation_mask.jpg": new URL("../../tests/fixtures/materialx/textures/brick_variation_mask.jpg", import.meta.url).href,
  "payloads/payload_root.usda": new URL("../../tests/fixtures/payloads/payload_root.usda", import.meta.url).href,
  "payloads/payload_payload.usda": new URL("../../tests/fixtures/payloads/payload_payload.usda", import.meta.url).href,
  "variants/nested_variants.usda": new URL("../../tests/fixtures/variants/nested_variants.usda", import.meta.url).href,
  "variants/material_binding_overrides.usda": new URL("../../tests/fixtures/variants/material_binding_overrides.usda", import.meta.url).href,
};

type FixturePath = keyof typeof fixtureUrls;
const fixtureUrl = (path: FixturePath) => fixtureUrls[path];
const fixtureFile = (path: FixturePath): TestFile => ({ path, url: fixtureUrl(path) });

const testAssets: TestAsset[] = [
  { group: "Core", label: "USDZ Cube", url: "/test.usdz" },
  { group: "Core", label: "Gingerbread USDC", url: "/gingerbread/house/GingerBreadHouse.usdc" },
  { group: "Core", label: "Gingerbread USDA", url: "/gingerbread/GingerbreadHouse.usda" },
  { group: "Core", label: "HTTPS References", url: "/HttpReferences.usda" },
  { group: "Regressions", label: "Carbon Bike USDZ", url: "https://github.com/usd-wg/assets/blob/jcowles/discoverability/full_assets/CarbonFrameBike/CarbonFrameBike.usdz" },
  { group: "Regressions", label: "Carbon Bike USDA", url: "https://github.com/usd-wg/assets/blob/jcowles/discoverability/full_assets/CarbonFrameBike/index.usda" },
  { group: "Regressions", label: "McUsd USDA", url: "https://github.com/usd-wg/assets/blob/jcowles/discoverability/full_assets/McUsd/McUsd.usda" },
  { group: "Regressions", label: "Teapot USD", url: "https://github.com/usd-wg/assets/blob/main/full_assets/Teapot/Teapot.usd" },
  { group: "glTF Plugin", label: "DamagedHelmet GLB", files: [fixtureFile("asset-explorer/DamagedHelmet.glb")] },
  { group: "glTF Plugin", label: "DamagedHelmet USDZ", url: fixtureUrl("asset-explorer/DamagedHelmet.glb.three.usdz") },
  { group: "glTF Plugin", label: "BoomBox GLB", files: [fixtureFile("asset-explorer/BoomBox.glb")] },
  { group: "glTF Plugin", label: "BoomBox USDZ", url: fixtureUrl("asset-explorer/BoomBox.glb.three.usdz") },
  { group: "glTF Plugin", label: "CesiumMan GLB", files: [fixtureFile("asset-explorer/CesiumMan.glb")] },
  { group: "glTF Plugin", label: "CesiumMan USDZ", url: fixtureUrl("asset-explorer/CesiumMan.glb.openusd.usdz") },
  {
    group: "Composition",
    label: "Payload Root",
    files: [
      fixtureFile("payloads/payload_root.usda"),
      fixtureFile("payloads/payload_payload.usda"),
    ],
  },
  { group: "Composition", label: "Nested Variants", files: [fixtureFile("variants/nested_variants.usda")] },
  { group: "Composition", label: "Binding Override Variants", files: [fixtureFile("variants/material_binding_overrides.usda")] },
  {
    group: "MaterialX",
    label: "MaterialX External Ref",
    files: [
      fixtureFile("materialx/mxSimple.usda"),
      fixtureFile("materialx/mtlxFiles/standard_surface_default.mtlx"),
    ],
  },
  {
    group: "MaterialX",
    label: "MaterialX Nested Ref",
    files: [
      fixtureFile("materialx/materialx_nested_reference.usda"),
      fixtureFile("materialx/mtlxFiles/standard_surface_default.mtlx"),
    ],
  },
  {
    group: "MaterialX",
    label: "MaterialX Variants",
    files: [
      fixtureFile("materialx/materialx_variant_bindings.usda"),
      fixtureFile("materialx/mtlxFiles/standard_surface_default.mtlx"),
    ],
  },
  {
    group: "MaterialX",
    label: "Preview + MaterialX",
    files: [
      fixtureFile("materialx/usdshade_preview_with_mtlx_peer.usda"),
      fixtureFile("materialx/mtlxFiles/standard_surface_default.mtlx"),
    ],
  },
  {
    group: "MaterialX",
    label: "MaterialX Texture + Noise",
    files: [
      fixtureFile("materialx/materialx_texture_noise.usda"),
      fixtureFile("materialx/mtlxFiles/texture_noise_surface.mtlx"),
      fixtureFile("materialx/textures/checker.png"),
    ],
  },
  {
    group: "MaterialX",
    label: "MaterialX Marble",
    files: [
      fixtureFile("materialx/materialx_marble.usda"),
      fixtureFile("materialx/mtlxFiles/standard_surface_marble_solid.mtlx"),
    ],
  },
  {
    group: "MaterialX",
    label: "MaterialX Procedural Bricks",
    files: [
      fixtureFile("materialx/materialx_procedural_brick.usda"),
      fixtureFile("materialx/mtlxFiles/standard_surface_brick_procedural.mtlx"),
      fixtureFile("materialx/textures/brick_base_gray.jpg"),
      fixtureFile("materialx/textures/brick_dirt_mask.jpg"),
      fixtureFile("materialx/textures/brick_mask.jpg"),
      fixtureFile("materialx/textures/brick_normal.jpg"),
      fixtureFile("materialx/textures/brick_roughness.jpg"),
      fixtureFile("materialx/textures/brick_variation_mask.jpg"),
    ],
  },
];

getUsdModule({
  debug: debugUsd,
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
        const fileHandle = found as any;
        if ("file" in found) {
          return await new Promise((resolve, reject) => fileHandle.file(resolve, reject));
        }
        else if ("getFile" in found) {
          return await fileHandle.getFile();
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

  const div = createControls();
  document.body.appendChild(div);

  const div2 = document.createElement("section");
  div2.className = "options control-group";
  const optionsHeading = document.createElement("h2");
  optionsHeading.innerText = "Actions";
  div2.appendChild(optionsHeading);
  const frameButton = document.createElement("button");
  frameButton.innerText = "Fit Camera";
  frameButton.onclick = () => app.fitCamera();
  div2.appendChild(frameButton);
  const downloadButton = document.createElement("button");
  downloadButton.innerText = "Download API USDZ";
  downloadButton.onclick = () => downloadApiUsdz();
  div2.appendChild(downloadButton);
  div.appendChild(div2);

  statusElement = document.createElement("div");
  statusElement.className = "status";
  statusElement.innerText = "Ready";
  div.appendChild(statusElement);

  variantControlsElement = document.createElement("section");
  variantControlsElement.className = "control-group variant-controls";
  const variantHeading = document.createElement("h2");
  variantHeading.innerText = "Scene Controls";
  variantControlsElement.appendChild(variantHeading);
  const emptyState = document.createElement("p");
  emptyState.innerText = "Load a file with variants or payloads.";
  variantControlsElement.appendChild(emptyState);
  div.appendChild(variantControlsElement);
})

function createControls() {
  const div = document.createElement("div");
  div.className = "test-buttons";

  const grouped = new Map<string, TestAsset[]>();
  for (const asset of testAssets) {
    const assets = grouped.get(asset.group) ?? [];
    assets.push(asset);
    grouped.set(asset.group, assets);
  }

  for (const [group, assets] of grouped) {
    const section = document.createElement("section");
    section.className = "control-group";
    const heading = document.createElement("h2");
    heading.innerText = group;
    section.appendChild(heading);

    for (const asset of assets) {
      const button = document.createElement("button");
      button.innerText = asset.label;
      button.onclick = () => loadAsset(asset);
      section.appendChild(button);
    }
    div.appendChild(section);
  }

  const apiSection = document.createElement("section");
  apiSection.className = "control-group";
  const apiHeading = document.createElement("h2");
  apiHeading.innerText = "API Constructed";
  apiSection.appendChild(apiHeading);
  const apiPreview = document.createElement("button");
  apiPreview.innerText = "Preview Material";
  apiPreview.onclick = () => loadApiScene("preview");
  apiSection.appendChild(apiPreview);
  const apiAnimated = document.createElement("button");
  apiAnimated.innerText = "Animated Color";
  apiAnimated.onclick = () => loadApiScene("animated");
  apiSection.appendChild(apiAnimated);
  const apiVariantA = document.createElement("button");
  apiVariantA.innerText = "Variant Sphere";
  apiVariantA.onclick = () => loadApiScene("variant-sphere");
  apiSection.appendChild(apiVariantA);
  const apiVariantB = document.createElement("button");
  apiVariantB.innerText = "Variant Cube";
  apiVariantB.onclick = () => loadApiScene("variant-cube");
  apiSection.appendChild(apiVariantB);
  div.appendChild(apiSection);

  return div;
}

async function loadAsset(asset: TestAsset) {
  if (asset.files) {
    await loadFiles(asset.files, asset.label);
    return;
  }
  if (asset.url) {
    await loadFile(asset.url, asset.label);
  }
}

async function resetScene() {
  const oldDelegate = hydraDelegate;
  hydraDelegate = null;

  if (oldDelegate)
    await oldDelegate.dispose();

  if (usdContent) {
    scene.remove(usdContent);
    disposeObject3D(usdContent);
  }

  usdContent = new Object3D();
  scene.add(usdContent);
}

function disposeObject3D(root: Object3D) {
  root.traverse(object => {
    const disposable = object as Object3D & {
      geometry?: { dispose?: () => void },
      material?: { dispose?: () => void } | Array<{ dispose?: () => void }>,
    };
    disposable.geometry?.dispose?.();
    if (Array.isArray(disposable.material)) {
      for (const material of disposable.material) material.dispose?.();
    }
    else {
      disposable.material?.dispose?.();
    }
  });
}

async function loadFile(url: string, label = url) {
  status(`Loading ${label}`);
  await resetScene();

  const delegate = await createThreeHydra({
    debug: debugUsd,
    USD: usd,
    url: url,
    // @ts-ignore
    scene: usdContent,
  })

  hydraDelegate = delegate;

  console.log("Scene content", usdContent);
  await waitForReadyForStatus(delegate, label);
  await waitForMaterialsForStatus(delegate, label);
  updateSceneControls();
  app.fitCamera();
  status(`Loaded ${label}`);
}

async function waitForMaterialsForStatus(delegate: NeedleThreeHydraHandle, label: string) {
  if (!delegate.materialsReady) return;

  let didTimeout = false;
  await Promise.race([
    delegate.materialsReady(),
    new Promise<void>(resolve => setTimeout(() => {
      didTimeout = true;
      resolve();
    }, 15000)),
  ]);

  if (didTimeout) {
    console.warn(`Material updates are still pending for ${label}.`);
  }
}

async function waitForReadyForStatus(delegate: NeedleThreeHydraHandle, label: string) {
  if (!delegate.ready) return;

  let didTimeout = false;
  await Promise.race([
    delegate.ready(),
    new Promise<void>(resolve => setTimeout(() => {
      didTimeout = true;
      resolve();
    }, 15000)),
  ]);

  if (didTimeout) {
    console.warn(`Initial Hydra draw is still pending for ${label}.`);
  }
}

async function loadFiles(files: TestFile[], label: string) {
  status(`Loading ${label}`);
  await resetScene();
  const hydraFiles = await Promise.all(files.map(async file => {
    const response = await fetch(file.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${file.url}: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return {
      name: file.path.split('/').pop() || file.path,
      path: file.path,
      arrayBuffer: async () => buffer,
    };
  }));

  const delegate = await createThreeHydra({
    debug: debugUsd,
    USD: usd,
    // @ts-ignore
    files: hydraFiles,
    // @ts-ignore
    scene: usdContent,
  });

  hydraDelegate = delegate;
  console.log("Scene content", usdContent);
  await waitForReadyForStatus(delegate, label);
  await waitForMaterialsForStatus(delegate, label);
  updateSceneControls();
  app.fitCamera();
  status(`Loaded ${label}`);
}

async function loadApiScene(kind: ApiSceneKind) {
  status(`Constructing ${kind}`);
  lastApiKind = kind;
  const path = `/tmp/${kind}.usda`;
  const stage = createApiStage(kind, path);
  stage.GetRootLayer().Export(path);
  const bytes = usd.ReadFile(path);
  usd.ReleaseStage(stage);
  await loadBuffer(bytes, `${kind}.usda`, `API ${kind}`);
}

function createApiStage(kind: string, path: string) {
  const stage = usd.CreateStage(path);
  stage.SetUpAxis("Z");
  stage.SetStartTimeCode(1);
  stage.SetEndTimeCode(48);
  stage.SetTimeCodesPerSecond(24);

  const world = stage.DefinePrim("/World", "Xform");

  if (kind.startsWith("variant")) {
    world.AddVariant("shape", "sphere");
    world.AddVariant("shape", "cube");
    world.DefinePrimInVariant("shape", "sphere", "/World/Shape", "Sphere")
      .CreateAttribute("radius", "double", false).SetDouble(0.95, Number.NaN);
    world.DefinePrimInVariant("shape", "cube", "/World/Shape", "Cube")
      .CreateAttribute("size", "double", false).SetDouble(1.5, Number.NaN);
    world.SetVariantSelection("shape", kind === "variant-cube" ? "cube" : "sphere");
  }
  else {
    const sphere = stage.DefinePrim("/World/ApiSphere", "Sphere");
    sphere.CreateAttribute("radius", "double", false).SetDouble(1, Number.NaN);
    sphere.ApplyAPI("MaterialBindingAPI");
    sphere.CreateRelationship("material:binding", false).AddTarget("/Looks/ApiPreview");
  }

  const material = stage.DefinePrim("/Looks/ApiPreview", "Material");
  const shader = stage.DefinePrim("/Looks/ApiPreview/Shader", "Shader");
  shader.CreateAttribute("info:id", "token", false).SetToken("UsdPreviewSurface", Number.NaN);
  const diffuseColor = shader.CreateAttribute("inputs:diffuseColor", "color3f", false);
  diffuseColor.SetColor3f(0.95, 0.25, 0.1, Number.NaN);
  if (kind === "animated") {
    diffuseColor.SetColor3f(0.1, 0.35, 1, 1);
    diffuseColor.SetColor3f(1, 0.35, 0.05, 24);
    diffuseColor.SetColor3f(0.1, 0.35, 1, 48);
  }
  shader.CreateAttribute("inputs:roughness", "float", false).SetFloat(0.28, Number.NaN);
  shader.CreateAttribute("outputs:surface", "token", false);
  material.CreateAttribute("outputs:surface", "token", false).AddConnection("/Looks/ApiPreview/Shader.outputs:surface");
  world.ApplyAPI("MaterialBindingAPI");
  world.CreateRelationship("material:binding", false).AddTarget("/Looks/ApiPreview");

  return stage;
}

async function loadBuffer(bytes: Uint8Array, filename: string, label: string) {
  await resetScene();
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const delegate = await createThreeHydra({
    debug: debugUsd,
    USD: usd,
    url: filename,
    buffer,
    // @ts-ignore
    scene: usdContent,
  });
  hydraDelegate = delegate;
  await waitForReadyForStatus(delegate, label);
  await waitForMaterialsForStatus(delegate, label);
  updateSceneControls();
  app.fitCamera();
  status(`Loaded ${label}`);
}

function downloadApiUsdz() {
  const stage = createApiStage(lastApiKind, "/tmp/api-download.usda");
  stage.GetRootLayer().Export("/tmp/api-download.usda");
  usd.CreateUsdzPackage("/tmp/api-download.usda", "/tmp/api-download.usdz");
  const bytes = usd.ReadFile("/tmp/api-download.usdz");
  usd.ReleaseStage(stage);
  const blob = new Blob([bytes], { type: "model/vnd.usdz+zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `api-${lastApiKind}.usdz`;
  anchor.click();
  URL.revokeObjectURL(url);
  status(`Downloaded API USDZ (${lastApiKind})`);
}

function updateSceneControls() {
  if (!variantControlsElement) return;
  while (variantControlsElement.children.length > 1) {
    variantControlsElement.lastChild?.remove();
  }

  const stage = hydraDelegate?.driver?.GetStage?.();
  if (!stage) {
    appendSceneControlEmpty("Load a file with variants or payloads.");
    return;
  }

  const prims = vectorToArray(stage.TraverseAll());
  const variantEntries: Array<{ primPath: string, setName: string, selection: string, names: string[] }> = [];
  const payloadEntries: Array<{ primPath: string, loaded: boolean }> = [];

  for (const prim of prims) {
    const setNames = vectorToArray(prim.GetVariantSetNames());
    for (const setName of setNames) {
      const names = vectorToArray(prim.GetVariantNames(setName));
      if (names.length) {
        variantEntries.push({
          primPath: prim.GetPath(),
          setName,
          selection: prim.GetVariantSelection(setName),
          names,
        });
      }
    }

    if (prim.HasAuthoredPayloads()) {
      payloadEntries.push({
        primPath: prim.GetPath(),
        loaded: prim.IsLoaded(),
      });
    }
  }

  if (!variantEntries.length && !payloadEntries.length) {
    appendSceneControlEmpty("No variants or authored payloads found.");
    return;
  }

  for (const entry of variantEntries) {
    const row = document.createElement("label");
    row.className = "scene-control-row";
    const text = document.createElement("span");
    text.innerText = `${entry.primPath} ${entry.setName}`;
    row.appendChild(text);

    const select = document.createElement("select");
    for (const name of entry.names) {
      const option = document.createElement("option");
      option.value = name;
      option.innerText = name;
      option.selected = name === entry.selection;
      select.appendChild(option);
    }
    select.onchange = async () => {
      const delegate = hydraDelegate;
      if (!delegate?.editStage) return;
      const label = `${entry.primPath} ${entry.setName}=${select.value}`;
      status(`Applying ${label}`);
      await delegate.editStage(async (stage) => {
        const prim = stage.GetPrimAtPath(entry.primPath);
        if (!prim?.IsValid()) return false;
        return prim.SetVariantSelection(entry.setName, select.value);
      });
      await waitForMaterialsForStatus(delegate, label);
      app.fitCamera();
      status(`Applied ${label}`);
      updateSceneControls();
    };
    row.appendChild(select);
    variantControlsElement.appendChild(row);
  }

  for (const entry of payloadEntries) {
    const row = document.createElement("div");
    row.className = "scene-control-row";
    const text = document.createElement("span");
    text.innerText = `${entry.primPath} payload ${entry.loaded ? "loaded" : "unloaded"}`;
    row.appendChild(text);

    const toggle = document.createElement("button");
    toggle.innerText = entry.loaded ? "Unload" : "Load";
    toggle.onclick = async () => {
      const delegate = hydraDelegate;
      if (!delegate?.editStage) return;
      let loaded = entry.loaded;
      const label = `${entry.primPath} payload`;
      status(`Applying ${label}`);
      await delegate.editStage(async (stage) => {
        const prim = stage.GetPrimAtPath(entry.primPath);
        if (!prim?.IsValid()) return false;
        if (prim.IsLoaded()) prim.Unload();
        else prim.Load();
        loaded = prim.IsLoaded();
        return true;
      });
      await waitForMaterialsForStatus(delegate, label);
      app.fitCamera();
      status(`Applied ${entry.primPath} payload ${loaded ? "loaded" : "unloaded"}`);
      updateSceneControls();
    };
    row.appendChild(toggle);
    variantControlsElement.appendChild(row);
  }
}

function appendSceneControlEmpty(message: string) {
  if (!variantControlsElement) return;
  const empty = document.createElement("p");
  empty.innerText = message;
  variantControlsElement.appendChild(empty);
}

function vectorToArray<T>(vector: { size(): number, get(index: number): T, delete(): void }) {
  const values: T[] = [];
  try {
    for (let i = 0; i < vector.size(); i++) {
      values.push(vector.get(i));
    }
  } finally {
    vector.delete();
  }
  return values;
}

function status(message: string) {
  console.log(message);
  if (statusElement) statusElement.innerText = message;
}

window.loadFile = loadFile;
