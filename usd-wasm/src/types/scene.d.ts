import type { Camera, Object3D } from 'three';
import type { NeedleThreeHydraHandle } from './create.three.js';
import type { USDStage } from './bindings.js';
export * from './sources.js';
export interface StageSummary {
  prims: number; meshes: number; materials: number; lights: number;
  colliders: number; rigidBodies: number; constraints: number;
  movingParts: number; independentJoints: number; profile: string | null; massKg: number | null;
  dimensions: number[] | null; metersPerUnit: number;
  types: string[]; apiSchemas: string[];
}
/** Lightweight schema/functionality inventory. Call inside handle.readStage(). */
export function inspectStageSummary(stage: USDStage, options?: {signal?: AbortSignal}): Promise<StageSummary>;
/** Sizes of mounted used layers, without loading file contents. */
export function inspectStageFiles(stage: USDStage, usd: import('./bindings.js').USD, sourcePaths?: import('./sources.js').StageSourcePaths): {path: string; size?: number}[];
export interface VariantInfo { path: string; setName: string; choices: string[]; selection: string; readOnly?: boolean; }
export function hasAuthoredUsdLights(root?: Object3D | null, stage?: USDStage | null): boolean;
export function stageVariants(stage: USDStage): VariantInfo[];
export function readStageLayers(handle: import('./create.three.js').NeedleThreeHydraHandle, usd: import('./bindings.js').USD): Promise<ReturnType<typeof stageLayers>>;
export function stageLayers(stage: USDStage): (ReturnType<USDStage['GetLayerStack']>[number] & {role:'root' | 'sublayer' | 'session' | 'layer'})[];
export interface PrimInfo { path: string; name: string; type: string; specifier: string; active: boolean; visible: boolean; localVisible: boolean; hiddenBy: string; purpose: string; imageable: boolean; loaded: boolean; payload: boolean; reference: boolean; instance: boolean; instanceProxy: boolean; instanceable: boolean; prototype: boolean; inPrototype: boolean; defined: boolean; abstract: boolean; prototypePath: string; prototypePrimPath: string; prototypeInstanceCount: number; variants: VariantInfo[]; }
export interface StageInfo { prims: PrimInfo[]; prototypes: {path:string;instanceCount:number}[]; time: { start: number; end: number } | null; variants: VariantInfo[]; payloads: PrimInfo[]; layers: ReturnType<USDStage['GetLayerStack']>; errors: string[]; }
export function inspectStage(stage: USDStage, time?: number, options?: {expandedInstances?: string[] | null;includePrototypes?:boolean}): StageInfo;
/** Supports both native runtimes, including remotely loaded value clips. */
export function inspectStageAsync(stage: USDStage, time?: number, options?: {expandedInstances?: string[] | null;includePrototypes?:boolean}): Promise<StageInfo>;
export function inspectPrimAsync(stage: USDStage, path: string, time?: number, options?: {arrayLimit?:number}): Promise<ReturnType<typeof inspectPrim>>;
export function inspectPrim(stage: USDStage, path: string, time?: number): null | {
  instancing: null | {kind:'instance';prototypePath:string;instanceCount:number} | {kind:'proxy';prototypePrimPath:string} | {kind:'prototype';instances:string[];instanceCount:number} | {kind:'point-instancer';instanceCount:number;prototypes:string[]} | {kind:'instanceable' | 'prototype-child'};
  path: string; type: string; metadata: Record<string, unknown>;
  attributes: { name: string; path: string; type: string; value: unknown; arraySize?: number; valueOffset?: number; connections: string[]; resolveInfo?: import('./bindings.js').USDResolveInfo; authored: boolean }[];
  relationships: { name: string; path: string; targets: string[] }[];
};
export function setVariant(handle: NeedleThreeHydraHandle, path: string, setName: string, value: string): Promise<unknown>;
export function setPayloadLoaded(handle: NeedleThreeHydraHandle, path: string, loaded: boolean): Promise<unknown>;
export function setPrimActive(handle: NeedleThreeHydraHandle, path: string, active: boolean): Promise<unknown>;
export function setPrimVisible(handle: NeedleThreeHydraHandle, path: string, visible: boolean): Promise<unknown>;
export function stageCameras(scene: Object3D): Camera[];
