import type {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import type {NeedleThreeHydraHandle} from './create.three.js';
import type {UsdPhysicsSnapshot} from './physics-data.js';
export const SIMREADY_EXTENSION:'NEEDLE_simready';
export type UsdSemanticMetadata = {
    version: 1;
    time: number;
    stage: Record<string, unknown>;
    prims: Array<{
        path: string;
        type: string;
        active?: false;
        metadata?: Record<string, unknown>;
        attributes?: Array<{
            name: string;
            type: string;
            value: unknown;
            metadata?: Record<string, unknown>;
            connections?: string[];
            default?: unknown;
            samples?: Array<{
                time: number;
                value: unknown;
            }>;
        }>;
        relationships?: Array<{
            name: string;
            metadata?: Record<string, unknown>;
            targets: string[];
        }>;
        variants?: Array<{
            name: string;
            selection: string;
            choices: string[];
        }>;
    }>;
};
/** Export ordinary visuals as standard glTF. Authored SimReady or USD physics
 * data uses the optional SimReady package to preserve physics and schema metadata.
 * Reset any active simulation before exporting. A native USD handle reads its
 * snapshot and metadata from the stage. When re-exporting a loaded GLB, adapt
 * runtime.snapshot with fromGltfPhysicsSnapshot from @needle-tools/simready/gltf
 * and pass runtime.usdMetadata explicitly. */
export interface GltfExportOptions {
    handle: Pick<NeedleThreeHydraHandle,'scene'|'ready'|'setPlaying'|'isPlaying'> & Partial<NeedleThreeHydraHandle>;
    exporter: GLTFExporter;
    snapshot?: UsdPhysicsSnapshot;
    usdMetadata?: UsdSemanticMetadata;
    textureResolution?: 'original' | 'preview';
    /** Blob output avoids allocating a contiguous GLB buffer for downloads. */
    output?: 'arraybuffer' | 'blob';
    signal?: AbortSignal;
    onProgress?: (progress: {phase: string; completed: number; total: number}) => void;
}
export function exportSimreadyGltf(options: GltfExportOptions & {output: 'blob'}): Promise<Blob>;
export function exportSimreadyGltf(options: GltfExportOptions & {output?: 'arraybuffer'}): Promise<ArrayBuffer>;
export function exportSimreadyGltf(options: GltfExportOptions): Promise<ArrayBuffer | Blob>;
