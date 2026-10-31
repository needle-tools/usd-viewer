import type { USD, USDStage } from './bindings.js';

export interface ArrayEditProperty {
  primPath: string;
  name: string;
  type: string;
  /** NaN addresses the authored default rather than a time sample. */
  time: number;
}

export interface ArrayEditsOptions {
  usd: Pick<USD, 'ReleaseStage'>;
  stage: Pick<USDStage, 'OpenLayerStage'>;
  /** Serialize this callback with all other mutations and refresh the host views. */
  edit: (action: () => void | Promise<void>) => unknown | Promise<unknown>;
  /** False once the owning document has been replaced or closed. */
  isCurrent: () => boolean;
}

export interface ArrayEdits {
  /** Apply to an existing typed attribute in the specified layer. The layer text
   * must match the inspected baseline. Failed writes preserve history; recovery
   * never overwrites a newer value. If recovery also fails, the original error
   * is rethrown with a rollbackError property when that error is extensible. */
  apply(layer: string, array: { property?: ArrayEditProperty }, text: string, value: readonly unknown[]): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  dispose(): void;
}

/** Optional typed array authoring with at most 50 sparse undo commands per owner.
 * Create one owner per document and dispose it when the document closes. */
export function createArrayEdits(options: ArrayEditsOptions): ArrayEdits;
