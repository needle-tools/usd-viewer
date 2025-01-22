import { WebGLRenderer, VSMShadowMap, SRGBColorSpace, NeutralToneMapping, PerspectiveCamera, Scene, GridHelper, DirectionalLight, Clock, PMREMGenerator, Texture, Vector3, Box3, Object3D } from 'three';
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

    return {
        fitCamera: () => {
            setTimeout(() => {
                const toRemove = [ gridhelper, ];
                const parents = toRemove.map(x => x.parent);
                toRemove.forEach(x => scene.remove(x));

                fitCameraToSelection(camera, controls, scene.children);
                
                toRemove.forEach((x, i) => parents[i]!.add(x));
            }, 1000);
        },
    }
}

// from https://discourse.threejs.org/t/camera-zoom-to-fit-object/936/24
function fitCameraToSelection(camera: PerspectiveCamera, controls: OrbitControls, selection: Object3D[], fitOffset = 1.5) {
    const size = new Vector3();
    const center = new Vector3();
    const box = new Box3();
    
    box.makeEmpty();
    for(const object of selection) {
      box.expandByObject(object);
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