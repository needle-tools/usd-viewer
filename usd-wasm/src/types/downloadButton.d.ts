import type {NeedleThreeHydraHandle} from './create.three.js';

export type DownloadFormat = 'zip' | 'usdz' | 'gltf';
export interface DownloadProgress {phase: string; completed: number; total: number}
export interface DownloadSource {
  handle: Partial<Pick<NeedleThreeHydraHandle, 'exportUsdz'>>;
  filename: string;
  formats?: readonly DownloadFormat[];
  isCurrent?: () => boolean;
  /** Host-owned glTF export; enables glTF in the format menu. */
  exportGltf?: (options: {onProgress: (progress: DownloadProgress) => void; signal: AbortSignal; textureResolution: 'original' | 'preview'}) => Promise<ArrayBuffer | Uint8Array>;
  /** Enables the Cloud destination. It runs only when Share is clicked. */
  share?: (options: {format: DownloadFormat; textureResolution: 'original' | 'preview'; signal: AbortSignal; onProgress: (progress: DownloadProgress) => void}) => Promise<void>;
}
/** Split button for ZIP/USDZ, optional host glTF export and Cloud sharing. */
export function mountDownloadButton(options: {
  container?: HTMLElement;
  getSource: () => DownloadSource | null | undefined;
  /** Install the shared viewer stylesheet. Defaults to true. */
  style?: boolean;
  format?: DownloadFormat;
  /** Optional localStorage key; omit to keep the choice local to this control. */
  stateKey?: string;
  /** Texture quality for all formats and destinations. Defaults to original. */
  textureResolution?: 'original' | 'preview';
  onTextureResolutionChange?: (resolution: 'original' | 'preview') => void;
  onFormatChange?: (format: DownloadFormat) => void;
  onError?: (error: unknown) => void;
  onProgress?: (progress: DownloadProgress) => void;
  /** Optional host menu coordination. */
  menuAnchor?: HTMLElement;
  onOpenChange?: (open: boolean) => void;
  onMenuNavigate?: (direction: -1 | 1) => void;
}): {
  readonly element: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly menuElement: HTMLDetailsElement;
  readonly menuTrigger: HTMLElement;
  readonly textureResolution: 'original' | 'preview';
  readonly format: DownloadFormat;
  readonly busy: boolean;
  readonly progress: DownloadProgress | null;
  readonly menuOpen: boolean;
  /** Call when getSource's availability changes. */
  refresh(): void;
  setFormat(format: DownloadFormat): void;
  setTextureResolution(resolution: 'original' | 'preview'): void;
  /** Resolves on completion/cancellation; rejects on failure. Click failures use onError. */
  download(): Promise<void>;
  /** Share through the host callback, using the selected format and texture quality. */
  share(): Promise<void>;
  openMenu(): void;
  closeMenu(): void;
  dispose(): void;
};
