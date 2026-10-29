import type { USDStage } from './bindings.js';

/** Plain paths/instance identities; never pass native Prims or Three objects. */
export type ReplSelection = string | number | boolean | null | readonly ReplSelection[] | { readonly [key: string]: ReplSelection | undefined };
export interface ReplContext {
  /** Stable identity for the current document. Return null before freeing it. */
  handle: object;
  stage: USDStage;
  /** Supply a changing generation if a host reuses a handle and stage. */
  generation?: unknown;
  USD?: unknown;
  scene?: unknown;
  selection?: ReplSelection;
  panel?: unknown;
  api?: unknown;
  three?: unknown;
  [symbol: string]: unknown;
}
export interface Repl {
  /** Expressions return their awaited value; statements may use explicit return.
   * Declarations are command-local. scratch persists until the document changes.
   * Rejects on syntax/runtime errors, disposal and document changes.
   */
  run(source: string): Promise<unknown>;
  focus(): void;
  dispose(): void;
}
export interface ReplOptions {
  container: HTMLElement;
  /** Must report the CURRENT document, including while commands are awaiting. */
  getContext(): ReplContext | null;
  /** Host synchronized edit lifecycle, including refresh of dependent systems. */
  edit<T>(callback: (stage: USDStage) => T | Promise<T>): Promise<T | undefined>;
  /** Persists bounded command source history only, not variables or SDK objects. */
  stateKey?: string;
  style?: boolean;
}
/** Inline console; evaluate only trusted, explicitly submitted JavaScript. */
export function mountRepl(options: ReplOptions): Repl;
