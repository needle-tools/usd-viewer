import type { Camera, Object3D } from 'three';
import type { NeedleThreeHydraHandle } from './create.three.js';
import type { USDStage } from './bindings.js';
export * from './sources.js';
export interface VariantInfo { path: string; setName: string; choices: string[]; selection: string; }
export function hasAuthoredUsdLights(root?: Object3D | null, stage?: USDStage | null): boolean;
export function stageVariants(stage: USDStage): VariantInfo[];
export function stageLayers(stage: USDStage): (ReturnType<USDStage['GetLayerStack']>[number] & {role:'root' | 'sublayer' | 'session' | 'layer'})[];
export interface PrimInfo { path: string; name: string; type: string; specifier: string; active: boolean; visible: boolean; imageable: boolean; loaded: boolean; payload: boolean; reference: boolean; instance: boolean; variants: VariantInfo[]; }
export interface StageInfo { prims: PrimInfo[]; time: { start: number; end: number } | null; variants: VariantInfo[]; payloads: PrimInfo[]; layers: ReturnType<USDStage['GetLayerStack']>; errors: string[]; }
export function inspectStage(stage: USDStage, time?: number): StageInfo;
/** Supports both native runtimes, including remotely loaded value clips. */
export function inspectStageAsync(stage: USDStage, time?: number): Promise<StageInfo>;
export function inspectPrimAsync(stage: USDStage, path: string, time?: number): Promise<ReturnType<typeof inspectPrim>>;
export function inspectPrim(stage: USDStage, path: string, time?: number): null | {
  path: string; type: string; metadata: Record<string, string>;
  attributes: { name: string; path: string; type: string; value: string; connections: string[]; resolveInfo?: import('./bindings.js').USDResolveInfo; authored: boolean }[];
  relationships: { name: string; path: string; targets: string[] }[];
};
export function setVariant(handle: NeedleThreeHydraHandle, path: string, setName: string, value: string): Promise<unknown>;
export function setPayloadLoaded(handle: NeedleThreeHydraHandle, path: string, loaded: boolean): Promise<unknown>;
export function setPrimActive(handle: NeedleThreeHydraHandle, path: string, active: boolean): Promise<unknown>;
export function setPrimVisible(handle: NeedleThreeHydraHandle, path: string, visible: boolean): Promise<unknown>;
export function stageCameras(scene: Object3D): Camera[];
