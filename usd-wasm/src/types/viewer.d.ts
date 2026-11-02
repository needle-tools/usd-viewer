import type { Box3, Camera, Object3D } from 'three';
import type { NeedleThreeHydraHandle } from './create.three.js';
import type { USDStage } from './bindings.js';
import type { RenderModes, RenderMode, createRenderModes } from './renderers.js';
export { mountRepl } from './repl.js';
export {mountDownloadButton} from './downloadButton.js';
export type {DownloadFormat, DownloadSource} from './downloadButton.js';
export type {Repl, ReplContext, ReplOptions} from './repl.js';
export interface SelectionItem {
  readonly path: string;
  readonly renderPath?: string;
  readonly renderInstanceIndex?: number;
  readonly prototypePath?: string;
  readonly instancerPath?: string;
  readonly instanceIndex?: number;
  readonly instanceId?: string | number;
  readonly instances?: readonly {readonly path: string; readonly index: number; readonly id?: string}[];
}
export interface SelectionOptions { toggle?: boolean; range?: boolean; }
export interface NavigationOptions {recordHistory?: boolean; instance?: SelectionItem;}
export function selectionItem(value: string | SelectionItem | null): SelectionItem | null;
export function selectionKey(item: SelectionItem): string;
/** World bounds at the current render pose. Subdivision subsets use their control cage. */
export function getSelectionBounds(handle: NeedleThreeHydraHandle, items?: readonly SelectionItem[], root?: Object3D): Promise<Box3>;
export function createSelection(options?: {items?: readonly (string | SelectionItem)[]; onChange?: (items: readonly SelectionItem[]) => void}): {
  readonly items: readonly SelectionItem[]; readonly primary: SelectionItem | null; readonly anchor: string;
  replace(items: readonly (string | SelectionItem)[], options?: {notify?: boolean; preserveAnchor?: boolean}): boolean;
  choose(item: string | SelectionItem | null, options?: SelectionOptions & {order?: string[]}): boolean;
  prune(predicate: (item: SelectionItem) => boolean): boolean; clear(): boolean;
};
export function mountPropertyInspector(options: {stage: USDStage; handle: Pick<NeedleThreeHydraHandle, 'getTime' | 'stageMetadata' | 'readStage'>; container: HTMLElement; isCurrent?: () => boolean; onNavigate?: (target: string, options: NavigationOptions) => void}): {
  show(target: string, options?: NavigationOptions): boolean; refresh(): Promise<void>; readonly target: string; dispose(): void;
};
export interface StagePanel {
  readonly selectedPath: string;
  readonly selection: readonly SelectionItem[];
  readonly selectedProperty: string;
  /** Reveal the selected row inside a visible hierarchy without scrolling host containers. */
  revealSelection(): void;
  refresh(): Promise<void>;
  selectPrim(path: string | SelectionItem | null, options?: SelectionOptions): boolean;
  selectMany(items: readonly (string | SelectionItem)[]): void;
  navigate(target: string, options?: NavigationOptions): boolean;
  /** Serialized stage mutation and host refresh, including failure paths. Not an undo transaction. */
  edit<T>(action: (stage: USDStage, driver: NeedleThreeHydraHandle['driver']) => T | Promise<T>): Promise<T | undefined>;
  /** Return to the free camera without modifying an authored USD camera. */
  useFreeCamera(): void;
  dispose(): void;
}
/** The host retains ownership of its scene, renderer, controls and handle. */
export function mountStagePanel(options: {
  handle: NeedleThreeHydraHandle; stage: USDStage; scene: Object3D; camera: Camera;
  controls: { enabled: boolean }; container?: HTMLElement; style?: boolean;
  containers?: { settings?: HTMLElement; view?: HTMLElement; stage: HTMLElement; properties: HTMLElement; layers: HTMLElement; timeline: HTMLElement; toolbar?: HTMLElement };
  stateKey?: string;
  onSelect?: (path: string, items: readonly SelectionItem[]) => void;
  onPickModeChange?: (mode: 'prim' | 'instance' | 'subset') => void;
  onHover?: (path: string | null) => void;
  onOpen?: () => void;
  onStage?: (info: import('./scene.js').StageInfo | null) => void;
  beforeEdit?: () => void | Promise<void>; afterEdit?: () => void | Promise<void>;
  onVariantChange?: (path: string, setName: string, value: string) => void;
  isCurrent?: () => boolean; setCamera?: (camera: Camera) => void;
}): Promise<StagePanel>;
export function mountRenderModePicker(options: Parameters<typeof createRenderModes>[0] & {
  container?: HTMLElement; style?: boolean; layout?: 'compact' | 'settings'; onSettingsChange?: (settings: import('./renderers.js').RenderSettings & {exposure:number}) => void; onModeChange?: (mode: RenderMode) => void;
}): Promise<{ modes: RenderModes; select: HTMLSelectElement; status: HTMLSpanElement; panel: HTMLDivElement; dispose(): void }>;
