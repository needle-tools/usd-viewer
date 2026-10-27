import { WebGLRenderer, VSMShadowMap, SRGBColorSpace, NeutralToneMapping, PerspectiveCamera, Scene, GridHelper, Clock, PMREMGenerator, Texture, Vector3, Box3, Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

export type RenderHostRuntime = "three" | "needle-engine";

export type DemoRenderHost = {
    runtime: RenderHostRuntime,
    runtimeLabel: string,
    runtimeVersion: string | null,
    needleContext: import("@needle-tools/engine").Context | null,
    scene: Scene,
    fitCamera: () => void,
};

export function loadEnvMap(url: string, renderer: WebGLRenderer): Promise<Texture | null> {
    return new Promise((resolve, _reject) => {
        const pmremGenerator = new PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        new EXRLoader().load(url, texture => {
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            texture.dispose();
            pmremGenerator.dispose();
            resolve(envMap);
        }, undefined, error => {
            console.warn("Failed to load environment map", url, error);
            pmremGenerator.dispose();
            resolve(null);
        });
    });
}


export function run(config: {
    renderer: WebGLRenderer,
    runtime: RenderHostRuntime,
    onRender: (dt: number) => void
}): Promise<DemoRenderHost> {
    return createRenderHost(config);
}

async function createRenderHost(config: {
    renderer: WebGLRenderer,
    runtime: RenderHostRuntime,
    onRender: (dt: number) => void
}): Promise<DemoRenderHost> {

    const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.x = 2;
    camera.position.y = 2;
    camera.position.z = 10;

    const { renderer, onRender } = config;

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    // renderer.toneMapping = AgXToneMapping;
    // renderer.toneMappingExposure = 1;
    renderer.toneMapping = NeutralToneMapping;
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = VSMShadowMap;
    renderer.setClearColor(0x000000, 1); // the default

    let scene: Scene;
    let needleContext: import("@needle-tools/engine").Context | null = null;
    let runtimeLabel = "three.js";
    let runtimeVersion: string | null = null;

    if (config.runtime === "needle-engine") {
        const { Context } = await import("@needle-tools/engine");
        needleContext = new Context({
            name: "OpenUSD Demo",
            alias: "openusd-demo",
            domElement: renderer.domElement,
            renderer,
            runInBackground: true,
        });
        await needleContext.create({ files: [] });
        needleContext.mainCamera = camera;
        scene = needleContext.scene;
        runtimeLabel = "Needle Engine";
        runtimeVersion = needleContext.version && needleContext.version !== "0.0.0" ? needleContext.version : null;
    }
    else {
        scene = new Scene();
    }

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    document.body.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);

    // controls.enableDamping = true;
    // controls.dampingFactor = 0.2;
    controls.update();

    const gridhelper = new GridHelper(100, 100);
    scene.add(gridhelper);

    const clock = new Clock();
    function render(timestamp = performance.now()) {
        const dt = clock.getDelta();
        requestAnimationFrame(render);
        controls.update(dt);
        needleContext?.update(timestamp / 1000, null);
        onRender(dt);
        if (needleContext) needleContext.renderNow(camera);
        else renderer.render(scene, camera);
    }

    window.requestAnimationFrame(render);

    return {
        runtime: config.runtime,
        runtimeLabel,
        runtimeVersion,
        needleContext,
        scene,
        fitCamera: () => {
            setTimeout(() => {
                const toRemove = [ gridhelper, ];
                const parents = toRemove.map(x => x.parent);
                toRemove.forEach(x => scene.remove(x));

                fitCameraToSelection(camera, controls, scene.children);
                
                toRemove.forEach((x, i) => parents[i]!.add(x));
            }, 0);
        },
    }
}

// from https://discourse.threejs.org/t/camera-zoom-to-fit-object/936/24
function fitCameraToSelection(camera: PerspectiveCamera, controls: OrbitControls, selection: Object3D[], fitOffset = 1.5) {
    const size = new Vector3();
    const center = new Vector3();
    const box = new Box3();
    const objectBox = new Box3();
    
    box.makeEmpty();
    for(const object of selection) {
      object.updateWorldMatrix(true, false);
      expandFitBox(box, object, objectBox);
    }
  
    box.getSize(size);
    box.getCenter(center );
  
    if (Number.isNaN(size.x) || Number.isNaN(size.y) || Number.isNaN(size.z) || 
        Number.isNaN(center.x) || Number.isNaN(center.y) || Number.isNaN(center.z)) {
      console.warn("Fit Camera failed: NaN values found, some objects may not have any mesh data.", selection, size);
      if (controls) 
        controls.update();
      return;
    }
  
    if (!controls) {
      console.warn("No camera controls object found, something went wrong.");
      return;
    }
  
    const maxSize = Math.max(size.x, size.y, size.z);
    const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
    const fitWidthDistance = fitHeightDistance / camera.aspect;
    const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);
  
    if (distance == 0) {
      console.warn("Fit Camera failed: distance is 0, some objects may not have any mesh data.");
      return;
    }
  
    const direction = controls.target.clone()
      .sub(camera.position)
      .normalize()
      .multiplyScalar(distance);
  
    controls.maxDistance = distance * 10;
    controls.target.copy(center);
  
    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
  
    camera.position.copy(controls.target).sub(direction);
    controls.update();
  }

function expandFitBox(box: Box3, object: Object3D, objectBox: Box3) {
    if (object.userData?.usdHelperFor) return;

    const geometry = (object as Object3D & {
        geometry?: {
            boundingBox?: Box3 | null,
            computeBoundingBox?: () => void,
        }
    }).geometry;

    if (geometry) {
        if (!geometry.boundingBox) geometry.computeBoundingBox?.();
        if (geometry.boundingBox) {
            objectBox.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld);
            box.union(objectBox);
        }
    }

    for (const child of object.children) {
        expandFitBox(box, child, objectBox);
    }
}
