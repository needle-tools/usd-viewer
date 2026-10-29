import type { WebGpuSupport } from './hydra.js';
export function createWebGpuSupport(): Promise<WebGpuSupport>;
import type { Camera, Material, Light, Scene, Vector2 } from 'three';
export type RenderMode = 'basic' | 'beauty' | 'pathtraced' | 'pathtraced-gk';
export interface RenderModeStatus { mode: RenderMode; requestedMode?: RenderMode; status: string; samples: number; error?: string; }
export interface PresentationRenderer {
  domElement: HTMLCanvasElement;
  isWebGPURenderer?: boolean;
  toneMappingExposure: number;
  render(scene: Scene, camera: Camera): void;
  getDrawingBufferSize(target: Vector2): Vector2;
}
export interface RenderModes {
  readonly mode: RenderMode;
  readonly samples: number;
  readonly backend: 'webgpu' | 'webgl' | undefined;
  readonly pathCanvas: HTMLCanvasElement;
  setMode(mode: RenderMode): Promise<void>;
  resize(): void;
  render(camera?: Camera): void;
  dispose(): void;
}
/** Three.js r185+ is required for Beauty. Optional tracers are imported only when selected. */
export function createRenderModes(options: {
  renderer: PresentationRenderer; scene: Scene; camera: Camera; canvas?: HTMLCanvasElement;
  onStatus?: (status: RenderModeStatus) => void;
  loadPathTracer?: () => Promise<unknown>;
  loadGkPathTracer?: () => Promise<unknown>;
  /** Override MuTracer material/light conversion; returned objects must follow its OpenPBR interfaces. */
  convertMaterial?: (material: Material) => unknown;
  convertLight?: (light: Light) => unknown;
}): Promise<RenderModes>;
