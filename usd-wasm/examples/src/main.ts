
import { getUsdModule, getOpenUsdBuildInfo, createThreeHydra, type USD, type NeedleThreeHydraHandle, type OpenUsdBuildInfo } from '@needle-tools/usd';
import { loadEnvMap, run, type DemoRenderHost, type RenderHostRuntime } from './three';
import { Object3D, Scene, WebGLRenderer } from 'three';
import { mount } from 'svelte';
import UsdViewPanel from './UsdViewPanel.svelte';

import { allDroppedFiles } from './fileHandling';
import { usdViewState } from './usdViewStore.svelte';
import { testAssetLibrary } from '../../tests/fixtures/test-asset-library.js';

globalThis.NEEDLE_MATERIALX_LOCATION ??= "package";

declare global {
  var NEEDLE_MATERIALX_LOCATION: string | undefined;

  interface Window {
    loadFile: (url: string, label?: string) => Promise<void>;
    __usdViewerTestState?: () => {
      status: string,
      childCount: number,
      renderHost: RenderHostRuntime,
      rootRotationX: number | null,
      rootMatrixWorld: number[] | null,
      stageMetadata: ReturnType<NeedleThreeHydraHandle["stageMetadata"]> | null,
      diagnostics: Record<string, unknown> | null,
      usdview: {
        hasStage: boolean,
        selectedPath: string,
        selectedPropertyPath: string,
        selectedLayerIdentifier: string,
        selectedLayerSource: string,
        currentTime: number,
        isPlaying: boolean,
        revision: number,
        lastNoticeResyncedPaths: string[],
        lastNoticeChangedInfoOnlyPaths: string[],
      },
    };
  }
}

let hydraDelegate: NeedleThreeHydraHandle | null;
let scene: Scene;
let usdContent: Object3D;
let usd: USD;
let openUsdBuildInfo: OpenUsdBuildInfo | null = null;
let app: DemoRenderHost;
let statusElement: HTMLElement | null = null;
let variantControlsElement: HTMLElement | null = null;
let lastApiKind: ApiSceneKind = "preview";
const renderHostRuntime = getRenderHostRuntime();
const debugUsd = false;

type TestFile = { path: string, url: string };
type TestAsset = { label: string, url?: string, files?: TestFile[], group: string };
type TestAssetLibraryEntry = { label: string, root: string, files?: string[], group: string };
type ApiSceneKind = "preview" | "animated" | "variant-sphere" | "variant-cube";
type AssetFetchProgress = {
  state: string,
  active: number,
  loadedTotal: number,
  totalBytes: number,
  error?: string,
};

const fixtureUrls = import.meta.glob("../../tests/fixtures/**/*", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

const fixtureUrl = (path: string) => {
  const url = fixtureUrls[`../../tests/fixtures/${path}`];
  if (!url) throw new Error(`Missing test fixture URL for ${path}`);
  return url;
};
const fixtureFile = (path: string): TestFile => ({ path, url: fixtureUrl(path) });
const catalogAsset = (asset: TestAssetLibraryEntry): TestAsset => ({
  group: asset.group,
  label: asset.label,
  files: asset.files?.map(fixtureFile),
  url: asset.files ? undefined : fixtureUrl(asset.root),
});

const testAssets: TestAsset[] = [
  { group: "Core", label: "USDZ Cube", url: "/test.usdz" },
  { group: "Core", label: "Gingerbread USDC", url: "/gingerbread/house/GingerBreadHouse.usdc" },
  { group: "Core", label: "Gingerbread USDA", url: "/gingerbread/GingerbreadHouse.usda" },
  { group: "Core", label: "HTTPS References", url: "/HttpReferences.usda" },
  { group: "Regressions", label: "Carbon Bike USDZ", url: "https://github.com/usd-wg/assets/blob/jcowles/discoverability/full_assets/CarbonFrameBike/CarbonFrameBike.usdz" },
  { group: "Regressions", label: "Carbon Bike USDA", url: "https://github.com/usd-wg/assets/blob/jcowles/discoverability/full_assets/CarbonFrameBike/index.usda" },
  { group: "Regressions", label: "McUsd USDA", url: "https://github.com/usd-wg/assets/blob/jcowles/discoverability/full_assets/McUsd/McUsd.usda" },
  { group: "Regressions", label: "Teapot USD", url: "https://github.com/usd-wg/assets/blob/main/full_assets/Teapot/Teapot.usd" },
  ...(testAssetLibrary as TestAssetLibraryEntry[]).map(catalogAsset),
];

getUsdModule({
  debug: debugUsd,
  onAssetFetchProgress: (progress: AssetFetchProgress) => {
    if (progress.state === "error") {
      status(`USD asset download failed: ${progress.error ?? "unknown error"}`);
      return;
    }
    if (progress.active > 0 && (progress.state === "start" || progress.state === "progress")) {
      const total = progress.totalBytes > 0 ? ` / ${formatBytes(progress.totalBytes)}` : "";
      status(`Downloading ${progress.active} USD asset${progress.active === 1 ? "" : "s"} (${formatBytes(progress.loadedTotal)}${total})`);
    }
  },
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

  app = await run({
    renderer,
    runtime: renderHostRuntime,
    onRender: (dt) => {
      hydraDelegate?.update(dt);
      usdViewState.tickTime();
    }
  });

  scene = app.scene;
  scene.environment = envmap;
  scene.background = envmap;
  scene.backgroundBlurriness = 0.8;
  scene.backgroundIntensity = 0.2;

  usd = USD;
  openUsdBuildInfo = getOpenUsdBuildInfo(USD);

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

  const div = createControls();
  document.body.appendChild(div);
  mount(UsdViewPanel, { target: document.body });

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

  if (openUsdBuildInfo) {
    const runtimeSection = document.createElement("section");
    runtimeSection.className = "control-group";
    const runtimeHeading = document.createElement("h2");
    runtimeHeading.innerText = "Runtime";
    runtimeSection.appendChild(runtimeHeading);
    const runtimeInfo = document.createElement("p");
    runtimeInfo.className = "runtime-info";
    runtimeInfo.innerText = formatOpenUsdBuildInfo(openUsdBuildInfo);
    runtimeSection.appendChild(runtimeInfo);
    runtimeSection.appendChild(createRenderHostControl());
    div.appendChild(runtimeSection);
  }

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

function createRenderHostControl() {
  const container = document.createElement("div");
  container.className = "render-host-toggle";
  container.setAttribute("role", "group");
  container.setAttribute("aria-label", "Render host");

  const threeButton = createRenderHostButton("three", "three.js");
  const needleButton = createRenderHostButton("needle-engine", "Needle Engine");
  container.append(threeButton, needleButton);

  const label = document.createElement("p");
  label.className = "runtime-info";
  const version = app.runtimeVersion ? ` ${app.runtimeVersion}` : "";
  label.innerText = `Viewing via ${app.runtimeLabel}${version}`;
  container.appendChild(label);

  return container;
}

function createRenderHostButton(runtime: RenderHostRuntime, label: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.innerText = label;
  button.setAttribute("aria-pressed", String(renderHostRuntime === runtime));
  button.dataset.active = String(renderHostRuntime === runtime);
  button.onclick = () => {
    if (renderHostRuntime === runtime) return;
    const url = new URL(window.location.href);
    url.searchParams.set("host", runtime);
    window.location.href = url.href;
  };
  return button;
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
  usdViewState.dispose();
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
    showScenePrimitiveHelpers: true,
    // @ts-ignore
    scene: usdContent,
  })

  hydraDelegate = delegate;
  usdViewState.setStage(await getDelegateStage(delegate), delegate);

  console.log("Scene content", usdContent);
  await waitForReadyForStatus(delegate, label);
  await waitForMaterialsForStatus(delegate, label);
  updateSceneControls();
  usdViewState.refresh();
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
    showScenePrimitiveHelpers: true,
    // @ts-ignore
    scene: usdContent,
  });

  hydraDelegate = delegate;
  usdViewState.setStage(await getDelegateStage(delegate), delegate);
  console.log("Scene content", usdContent);
  await waitForReadyForStatus(delegate, label);
  await waitForMaterialsForStatus(delegate, label);
  updateSceneControls();
  usdViewState.refresh();
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
  const buffer = copyToArrayBuffer(bytes);
  const delegate = await createThreeHydra({
    debug: debugUsd,
    USD: usd,
    url: filename,
    buffer,
    showScenePrimitiveHelpers: true,
    // @ts-ignore
    scene: usdContent,
  });
  hydraDelegate = delegate;
  usdViewState.setStage(await getDelegateStage(delegate), delegate);
  await waitForReadyForStatus(delegate, label);
  await waitForMaterialsForStatus(delegate, label);
  updateSceneControls();
  usdViewState.refresh();
  app.fitCamera();
  status(`Loaded ${label}`);
}

function downloadApiUsdz() {
  const stage = createApiStage(lastApiKind, "/tmp/api-download.usda");
  stage.GetRootLayer().Export("/tmp/api-download.usda");
  usd.CreateUsdzPackage("/tmp/api-download.usda", "/tmp/api-download.usdz");
  const bytes = usd.ReadFile("/tmp/api-download.usdz");
  usd.ReleaseStage(stage);
  const blob = new Blob([copyToArrayBuffer(bytes)], { type: "model/vnd.usdz+zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `api-${lastApiKind}.usdz`;
  anchor.click();
  URL.revokeObjectURL(url);
  status(`Downloaded API USDZ (${lastApiKind})`);
}

async function getDelegateStage(delegate: NeedleThreeHydraHandle) {
  return await delegate.driver.GetStage();
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
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
        return await prim.SetVariantSelection(entry.setName, select.value);
      });
      await waitForMaterialsForStatus(delegate, label);
      usdViewState.refresh();
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
        if (prim.IsLoaded()) await prim.Unload();
        else await prim.Load();
        loaded = prim.IsLoaded();
        return true;
      });
      await waitForMaterialsForStatus(delegate, label);
      usdViewState.refresh();
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

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`;
  return `${Math.round(value / 1024 / 102.4) / 10} MB`;
}

function formatOpenUsdBuildInfo(buildInfo: OpenUsdBuildInfo) {
  const modules = Object.entries(buildInfo.modules)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(", ");
  return `OpenUSD ${buildInfo.openusd.version} (${buildInfo.openusd.gitSha.slice(0, 8)}) - ${modules}`;
}

function getRenderHostRuntime(): RenderHostRuntime {
  const host = new URLSearchParams(window.location.search).get("host");
  return host === "needle-engine" ? "needle-engine" : "three";
}

window.loadFile = loadFile;
window.__usdViewerTestState = () => {
  const usdview = usdViewState.snapshot();
  return {
    status: statusElement?.innerText ?? "",
    childCount: usdContent?.children?.length ?? 0,
    renderHost: app?.runtime ?? renderHostRuntime,
    rootRotationX: usdContent?.rotation?.x ?? null,
    rootMatrixWorld: usdContent?.matrixWorld?.elements ? Array.from(usdContent.matrixWorld.elements) : null,
    stageMetadata: hydraDelegate?.stageMetadata?.() ?? null,
    diagnostics: hydraDelegate?.diagnostics?.() ?? null,
    usdview: {
      hasStage: Boolean(usdview.stage),
      selectedPath: usdview.selectedPath,
      selectedPropertyPath: usdview.selectedPropertyPath,
      selectedLayerIdentifier: usdview.selectedLayerIdentifier,
      selectedLayerSource: usdview.selectedLayerSource,
      currentTime: usdview.currentTime,
      isPlaying: usdview.isPlaying,
      revision: usdview.revision,
      lastNoticeResyncedPaths: usdview.notice?.resyncedPaths ?? [],
      lastNoticeChangedInfoOnlyPaths: usdview.notice?.changedInfoOnlyPaths ?? [],
    },
  };
};
