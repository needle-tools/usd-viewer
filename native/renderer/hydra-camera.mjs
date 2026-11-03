import {Camera, Matrix4, Vector3, WebGPUCoordinateSystem} from 'three';

const glToWebGpu = new Matrix4().set(1,0,0,0, 0,1,0,0, 0,0,.5,.5, 0,0,0,1);

/** Preserve Hydra's complete frustum, including crop/offsets, through TRAA jitter. */
export class HydraCamera extends Camera {
  constructor() {
    super();
    this.matrixAutoUpdate = false;
    this.coordinateSystem = WebGPUCoordinateSystem;
    this.baseProjection = new Matrix4();
    this.view = null;
    this.aspect = 1;
    this.near = .1;
    this.far = 1000;
    this.isPerspectiveCamera = true;
    this.isOrthographicCamera = false;
  }

  setHydraMatrices(view, projection) {
    this.matrixWorldInverse.fromArray(view);
    this.matrixWorld.copy(this.matrixWorldInverse).invert();
    this.matrix.copy(this.matrixWorld);
    this.baseProjection.fromArray(projection).premultiply(glToWebGpu);
    this.isOrthographicCamera = Math.abs(this.baseProjection.elements[15]) > .5;
    this.isPerspectiveCamera = !this.isOrthographicCamera;
    const inverse = this.baseProjection.clone().invert();
    this.near = -new Vector3(0, 0, 0).applyMatrix4(inverse).z;
    this.far = -new Vector3(0, 0, 1).applyMatrix4(inverse).z;
    this.view = null;
    this.updateProjectionMatrix();
  }

  setViewOffset(fullWidth, fullHeight, offsetX, offsetY, width, height) {
    this.view = {enabled:true, fullWidth, fullHeight, offsetX, offsetY, width, height};
    this.updateProjectionMatrix();
  }

  clearViewOffset() {
    if (this.view) this.view.enabled = false;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    this.projectionMatrix.copy(this.baseProjection);
    if (this.view?.enabled) {
      const v = this.view;
      const crop = new Matrix4().set(
        v.fullWidth/v.width, 0, 0, (v.fullWidth-2*v.offsetX-v.width)/v.width,
        0, v.fullHeight/v.height, 0, (-v.fullHeight+2*v.offsetY+v.height)/v.height,
        0, 0, 1, 0, 0, 0, 0, 1);
      this.projectionMatrix.premultiply(crop);
    }
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
