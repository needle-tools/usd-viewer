import { WebGLRenderer, VSMShadowMap, SRGBColorSpace, NeutralToneMapping, PerspectiveCamera, Scene, GridHelper, Object3D, DirectionalLight, Clock, PMREMGenerator, EquirectangularReflectionMapping, Texture } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';


export function loadEnvMap(url: string, renderer: WebGLRenderer): Promise<Texture | null> {
    return new Promise((resolve, _reject) => {
        const pmremGenerator = new PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        new EXRLoader().load(url, texture => {
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            texture.dispose();
            pmremGenerator.dispose();
            resolve(envMap);
        });
    });
}


export function run(config: {
    renderer: WebGLRenderer,
    scene: Scene,
    onRender: (dt: number) => void
}) {

    const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.x = 2;
    camera.position.y = 2;
    camera.position.z = 10;

    const { renderer, onRender, scene } = config;

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    // renderer.toneMapping = AgXToneMapping;
    // renderer.toneMappingExposure = 1;
    renderer.toneMapping = NeutralToneMapping;
    console.log("tonemapping", renderer.toneMapping)
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = VSMShadowMap;
    renderer.setClearColor(0x000000, 1); // the default


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

    if (!scene.environment)
        scene.add(new DirectionalLight(0xffffff, 1));

    const clock = new Clock();
    function render() {
        const dt = clock.getDelta();
        requestAnimationFrame(render);
        controls.update(dt);
        onRender(dt);
        renderer.render(scene, camera);
    }

    window.requestAnimationFrame(render);
}