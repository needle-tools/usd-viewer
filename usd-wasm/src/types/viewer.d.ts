import type { Camera, Object3D } from 'three';
import type { NeedleThreeHydraHandle } from './create.three.js';
import type { USDStage } from './bindings.js';
import type { RenderModes, RenderMode, createRenderModes } from './renderers.js';
export interface StagePanel {
  refresh(): void;
  dispose(): void;
}
/** The host retains ownership of its scene, renderer, controls and handle. */
export function mountStagePanel(options: {
  handle: NeedleThreeHydraHandle; stage: USDStage; scene: Object3D; camera: Camera;
  controls: { enabled: boolean }; container?: HTMLElement; style?: boolean;
  beforeEdit?: () => void | Promise<void>; afterEdit?: () => void | Promise<void>;
  onVariantChange?: (path: string, setName: string, value: string) => void;
  isCurrent?: () => boolean; setCamera?: (camera: Camera) => void;
}): Promise<StagePanel>;
export function mountRenderModePicker(options: Parameters<typeof createRenderModes>[0] & {
  container?: HTMLElement; style?: boolean; onModeChange?: (mode: RenderMode) => void;
}): Promise<{ modes: RenderModes; select: HTMLSelectElement; status: HTMLSpanElement; panel: HTMLDivElement; dispose(): void }>;
