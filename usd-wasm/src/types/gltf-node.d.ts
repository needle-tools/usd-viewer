import type {GltfExportOptions} from './gltf.js';

/** Export a GLB to a local file while spooling binary buffers to disk. */
export function exportSimreadyGltfToFile(options: Omit<GltfExportOptions, 'output'>, destination: string): Promise<void>;
