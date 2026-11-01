import type { Object3D } from 'three';
import type { USD } from './bindings.js';
import type { NeedleThreeHydraHandle } from './create.three.js';

export interface StageSourcePaths {
  /** Root-folder-relative path, preserving ../ traversal and USDZ membership. */
  path(identifier: string): string;
  /** Native resolver identity for a public path. Absolute identities also pass through. */
  resolve(path: string): string;
}
export function createStageSourcePaths(rootIdentifier: string, options?: {resolveUrl?: (path: string) => string}): StageSourcePaths;

export interface StageReadOptions {
  signal?: AbortSignal;
  /** Additional host generation check, evaluated inside the native read boundary. */
  isCurrent?: () => boolean;
}
export interface StageLayerReadOptions extends StageReadOptions {
  /** Allow opening a dependency not used by the composed stage. Default false.
   * Opening it for inspection does not replace the handle's stage root. */
  allowUncomposed?: boolean;
}
/** Read root-relative paths, HTTP resolver identities, MEMFS paths and USDZ members. Returned bytes
 * are independent of native memory. Rejects stale/closed stages and cancellation. */
export function readStageAsset(handle: NeedleThreeHydraHandle, usd: USD, path: string, options?: StageReadOptions): Promise<Uint8Array>;
/** Current authored layer text, including unsaved opinions. Temporary native
 * stages are released before completion; the displayed stage stays unchanged. */
export function readStageLayer(handle: NeedleThreeHydraHandle, usd: USD, identifier: string, options?: StageLayerReadOptions): Promise<string>;
/** Deduplicated texture identities currently loaded into the render scene. */
export function stageResources(root: Object3D, sourcePaths?: StageSourcePaths): string[];
