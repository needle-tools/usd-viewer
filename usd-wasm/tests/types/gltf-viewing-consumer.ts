import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {exportSimreadyGltf} from '@needle-tools/usd/gltf';
import type {NeedleThreeHydraHandle} from '@needle-tools/usd/three';

declare const handle:NeedleThreeHydraHandle;
const bytes:Promise<ArrayBuffer>=exportSimreadyGltf({handle,exporter:new GLTFExporter()});
void bytes;
