import type {NeedleThreeHydraHandle, UsdExportProgress} from './create.three.js';

export type DownloadFormat = 'zip' | 'usdz';
export interface DownloadSource {
  handle: Pick<NeedleThreeHydraHandle, 'exportUsdz'>;
  filename: string;
  formats?: readonly DownloadFormat[];
  isCurrent?: () => boolean;
}
/** Standalone split button with keyboard-accessible ZIP/USDZ settings and download handling. */
export function mountDownloadButton(options: {
  container?: HTMLElement;
  getSource: () => DownloadSource | null | undefined;
  /** Install the shared viewer stylesheet. Defaults to true. */
  style?: boolean;
  format?: DownloadFormat;
  /** Optional localStorage key; omit to keep the choice local to this control. */
  stateKey?: string;
  onFormatChange?: (format: DownloadFormat) => void;
  onError?: (error: unknown) => void;
  onProgress?: (progress: UsdExportProgress) => void;
  /** Optional host menu coordination. */
  menuAnchor?: HTMLElement;
  onOpenChange?: (open: boolean) => void;
  onMenuNavigate?: (direction: -1 | 1) => void;
}): {
  readonly element: HTMLDivElement;
  readonly button: HTMLButtonElement;
  readonly menuElement: HTMLDetailsElement;
  readonly menuTrigger: HTMLElement;
  readonly format: DownloadFormat;
  readonly busy: boolean;
  readonly progress: UsdExportProgress | null;
  readonly menuOpen: boolean;
  /** Call when getSource's availability changes. */
  refresh(): void;
  setFormat(format: DownloadFormat): void;
  /** Resolves on completion/cancellation; rejects on failure. Click failures use onError. */
  download(): Promise<void>;
  openMenu(): void;
  closeMenu(): void;
  dispose(): void;
};
