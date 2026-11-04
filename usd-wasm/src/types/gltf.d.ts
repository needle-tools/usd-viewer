import type {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import type {NeedleThreeHydraHandle} from './create.three.js';
import type {UsdPhysicsSnapshot} from './physics.js';
export const SIMREADY_EXTENSION:'NEEDLE_simready';
export type {SimreadyMetadata as UsdSemanticMetadata} from '@needle-tools/simready';
import type {SimreadyMetadata as UsdSemanticMetadata} from '@needle-tools/simready';
/** Export rigid visuals, physics and composed schema metadata without source USD.
 * Reset any active simulation before exporting. Re-exporting a loaded GLB requires
 * its snapshot and usdMetadata; a native USD handle reads both from the stage. */
export function exportSimreadyGltf(options:{handle:Pick<NeedleThreeHydraHandle,'scene'|'ready'|'setPlaying'|'isPlaying'> & Partial<NeedleThreeHydraHandle>;exporter:GLTFExporter;snapshot?:UsdPhysicsSnapshot;usdMetadata?:UsdSemanticMetadata;textureResolution?:'original'|'preview';signal?:AbortSignal;onProgress?:(progress:{phase:string;completed:number;total:number})=>void}):Promise<ArrayBuffer>;
