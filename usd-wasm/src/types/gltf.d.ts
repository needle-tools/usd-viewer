import type {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import type {Matrix4} from 'three';
import type {NeedleThreeHydraHandle, UsdExportBodyTransform} from './create.three.js';
import type {UsdPhysicsSnapshot} from './physics-data.js';
export const SIMREADY_EXTENSION:'NEEDLE_simready';
/** Export ordinary visuals as standard glTF. Authored SimReady or USD physics
 * data uses the optional SimReady package to export runtime physics and semantic labels.
 * A native USD handle reads its
 * snapshot and supported labels from the stage. When re-exporting a loaded GLB, adapt
 * runtime.snapshot with fromGltfPhysicsSnapshot from @needle-tools/simready/gltf
 * and pass runtime.semantics explicitly. */
export interface GltfExportOptions {
    handle: Pick<NeedleThreeHydraHandle,'scene'|'ready'|'setPlaying'|'isPlaying'> & Partial<NeedleThreeHydraHandle>;
    exporter: GLTFExporter;
    snapshot?: UsdPhysicsSnapshot;
    semantics?: Array<{path:string;taxonomy:string;labels:string[]}>;
    textureResolution?: 'original' | 'preview';
    /** Blob output avoids allocating a contiguous GLB buffer for downloads. */
    output?: 'arraybuffer' | 'blob';
    signal?: AbortSignal;
    /** Capture current body poses, or transforms that undo movement in the rendered scene. */
    capturePose?: {
        (changed: true): ReadonlyMap<string, UsdExportBodyTransform>;
        (changed: false): ReadonlyMap<string, Matrix4>;
    };
    exportChangedPose?: boolean;
    onProgress?: (progress: {phase: string; completed: number; total: number}) => void;
}
export function exportSimreadyGltf(options: GltfExportOptions & {output: 'blob'}): Promise<Blob>;
export function exportSimreadyGltf(options: GltfExportOptions & {output?: 'arraybuffer'}): Promise<ArrayBuffer>;
export function exportSimreadyGltf(options: GltfExportOptions): Promise<ArrayBuffer | Blob>;
