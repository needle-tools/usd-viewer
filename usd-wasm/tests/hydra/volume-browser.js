import { Scene, Color, PerspectiveCamera, WebGPURenderer, RenderTarget, LinearSRGBColorSpace, NoToneMapping, Mesh, BoxGeometry, DirectionalLight } from 'three/webgpu';
import { createThreeHydra } from '../../src/create.three.js';
import { getUsdModule } from '../../src/bindings/index.js';
import { ThreeRenderDelegateInterface } from '../../src/hydra/ThreeJsRenderDelegate.js';
import { createMaterialXVolumeMaterial } from '../../src/hydra/materialxVolume.js';

function backendFlags(renderer) {
    return {
        isWebGPUBackend: renderer.backend.isWebGPUBackend === true,
        isWebGLBackend: renderer.backend.isWebGLBackend === true,
    };
}

export async function probeProceduralVolume({ forceWebGL, name }) {
    const renderer = new WebGPURenderer({ antialias: false, forceWebGL });
    await renderer.init();
    const backend = backendFlags(renderer);
    if (!forceWebGL && !backend.isWebGPUBackend) {
        renderer.dispose();
        return { backend, skip: 'WebGPU unavailable: renderer selected a fallback backend.' };
    }
    renderer.setSize(64, 64);
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    const scene = new Scene();
    scene.background = new Color(0, 0, 0);
    const light = new DirectionalLight(0xffffff, 6);
    light.position.set(-0.5, 0.8, 1);
    scene.add(light);
    const xml = await (await fetch(`/tests/fixtures/materialx/mtlxFiles/bounded_${name}.mtlx`)).text();
    const material = await createMaterialXVolumeMaterial(xml, 0, { renderer });
    const geometry = new BoxGeometry(2, 2, 2);
    scene.add(new Mesh(geometry, material));
    const camera = new PerspectiveCamera(45, 1, 0.1, 10);
    camera.position.z = 4;
    const target = new RenderTarget(64, 64);
    try {
        renderer.setOutputRenderTarget(target);
        renderer.render(scene, camera);
        const data = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 64, 64);
        let bright = 0, dark = 0, maximum = 0;
        for (let index = 0; index < data.length; index += 4) {
            const value = Math.max(data[index], data[index + 1], data[index + 2]);
            if (value > 10) bright++;
            if (value < 5) dark++;
            maximum = Math.max(maximum, value);
        }
        return { backend, bright, dark, maximum };
    } finally {
        renderer.setOutputRenderTarget(null);
        material.dispose(); geometry.dispose(); target.dispose(); renderer.dispose();
    }
}

export async function probeVolumeStage({ forceWebGL, emission }) {
    const renderer = new WebGPURenderer({ antialias: false, forceWebGL });
    await renderer.init();
    const backend = backendFlags(renderer);
    if (!forceWebGL && !backend.isWebGPUBackend) {
        renderer.dispose();
        return { backend, skip: 'WebGPU unavailable: renderer selected a fallback backend.' };
    }
    renderer.setSize(64, 64);
    renderer.outputColorSpace = LinearSRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    const scene = new Scene();
    scene.background = new Color(emission ? 0 : 1, emission ? 0 : 1, emission ? 0 : 1);
    const camera = new PerspectiveCamera(45, 1, 0.1, 10);
    camera.position.z = 4;
    let source = await (await fetch('/tests/fixtures/materialx/bounded_volume.usda')).text();
    if (emission) source = source.replace('inputs:absorption = (0.2, 0.5, 1)', 'inputs:absorption = (0, 0, 0)').replace('inputs:color = (0, 0, 0)', 'inputs:color = (0.1, 0.2, 0.3)');
    const USD = await getUsdModule();
    const original = ThreeRenderDelegateInterface.prototype.createSPrim;
    const documents = [];
    ThreeRenderDelegateInterface.prototype.createSPrim = function (...args) {
        const prim = original.apply(this, args);
        if (prim?.updateMaterialXDocument) {
            const update = prim.updateMaterialXDocument.bind(prim);
            prim.updateMaterialXDocument = document => { documents.push(document); return update(document); };
        }
        return prim;
    };
    const handle = await createThreeHydra({ USD, scene, renderer, materialXVolumeFactory: createMaterialXVolumeMaterial, url: 'bounded-volume.usda', buffer: new TextEncoder().encode(source) });
    ThreeRenderDelegateInterface.prototype.createSPrim = original;
    const target = new RenderTarget(64, 64);
    try {
        await handle.ready();
        await handle.materialsReady();
        const materials = [];
        scene.traverse(object => { if (object.isMesh) materials.push({ type: object.material.type, side: object.material.side, visible: object.visible, attributes: Object.keys(object.geometry.attributes) }); });
        renderer.setOutputRenderTarget(target);
        renderer.render(scene, camera);
        const data = await renderer.readRenderTargetPixelsAsync(target, 32, 32, 1, 1);
        return { backend, materials, pixel: [...data], terminals: documents.map(document => document.terminal), diagnostics: handle.diagnostics() };
    } finally {
        renderer.setOutputRenderTarget(null);
        await handle.dispose();
        target.dispose();
        renderer.dispose();
    }
}
