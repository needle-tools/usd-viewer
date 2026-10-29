import type { Camera, Object3D } from 'three';
import type { NeedleThreeHydraHandle } from './create.three.js';
import type { USDStage } from './bindings.js';
export interface VariantInfo { path: string; setName: string; choices: string[]; selection: string; }
export interface PrimInfo { path: string; name: string; type: string; active: boolean; loaded: boolean; payload: boolean; reference: boolean; instance: boolean; variants: VariantInfo[]; }
export interface StageInfo { prims: PrimInfo[]; variants: VariantInfo[]; payloads: PrimInfo[]; layers: ReturnType<USDStage['GetLayerStack']>; errors: string[]; }
export function inspectStage(stage: USDStage): StageInfo;
export function inspectPrim(stage: USDStage, path: string, time?: number): null | {
  path: string; type: string; metadata: Record<string, string>;
  attributes: { name: string; type: string; value: string }[];
  relationships: { name: string; targets: string[] }[];
};
export function setVariant(handle: NeedleThreeHydraHandle, path: string, setName: string, value: string): Promise<unknown>;
export function setPayloadLoaded(handle: NeedleThreeHydraHandle, path: string, loaded: boolean): Promise<unknown>;
export function stageCameras(scene: Object3D): Camera[];
