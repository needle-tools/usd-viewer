import type { WebGpuSupport } from './hydra.js';
export function createWebGpuSupport(): Promise<WebGpuSupport>;
/** Register Needle's AgX look on a modern renderer, retaining its current exposure. */
export function configureNeedleAgx(renderer: PresentationRenderer): Promise<boolean>;
/** MuTracer Engine; installs a display pass and returns its unregister function. Requires WebGPU extended output. */
export function configureNeedleAgxDisplay(engine: unknown, getToneMapping?: () => number): () => void;
import type { Camera, Material, Light, Scene, Vector2, Color } from 'three';
export type RenderMode = 'basic' | 'beauty' | 'pathtraced' | 'pathtraced-gk';
export interface RenderSettings {
  maxSamples: number;
  bounces: number;
  denoiser: 'jnlm' | 'oidn' | 'oidn-fast' | null;
  gkDenoiser: 'oidn' | 'oidn-fast' | null;
  /** Optional HDR bloom in Basic and Beauty on WebGPURenderer. Default false. */
  bloom: boolean;
  /** 0–10; default 0.5. */
  bloomStrength: number;
  /** 0–1; default 0.5. */
  bloomRadius: number;
  /** Scene-linear luminance, 0–100; default 1. */
  bloomThreshold: number;
}
export interface RenderModeStatus { mode: RenderMode; requestedMode?: RenderMode; status: string; samples: number; maxSamples?: number; error?: string; }
export interface PresentationRenderer {
  domElement: HTMLCanvasElement;
  isWebGPURenderer?: boolean;
  toneMappingExposure: number;
  toneMapping?: number;
  render(scene: Scene, camera: Camera): void;
  getClearColor?(target: Color): Color;
  getClearAlpha?(): number;
  getDrawingBufferSize(target: Vector2): Vector2;
}
export interface RenderModes {
  readonly settings: Readonly<RenderSettings>;
  setSettings(settings: Partial<RenderSettings>): Promise<void>;
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
  renderer: PresentationRenderer; scene: Scene; camera: Camera; controls?: import('three/addons/controls/OrbitControls.js').OrbitControls; settings?: Partial<RenderSettings>; canvas?: HTMLCanvasElement;
  onStatus?: (status: RenderModeStatus) => void;
  loadPathTracer?: () => Promise<unknown>;
  /** Configure a freshly initialized MuTracer engine; an optional returned disposer runs on mode exit. */
  configurePathTracer?: (engine: unknown) => void | (() => void) | Promise<void | (() => void)>;
  loadGkPathTracer?: () => Promise<unknown>;
  /** Optional OIDN module, loaded only when a gkjohnson denoiser is enabled. */
  loadDenoiser?: () => Promise<unknown>;
  /** Self-hosted MuTracer-compatible OIDN weights (standard and small models). */
  denoiserWeightsBaseUrl?: string;
  /** Override MuTracer material/light conversion; returned objects must follow its OpenPBR interfaces. */
  convertMaterial?: (material: Material) => unknown;
  convertLight?: (light: Light) => unknown;
}): Promise<RenderModes>;
