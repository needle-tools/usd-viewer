import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {exportSimreadyGltf, type UsdSemanticMetadata} from '@needle-tools/usd/gltf';
import type {NeedleThreeHydraHandle} from '@needle-tools/usd/three';

declare const handle:NeedleThreeHydraHandle;
const metadata:UsdSemanticMetadata={version:1,time:0,stage:{customLayerData:{author:'Example'}},prims:[]};
const bytes:Promise<ArrayBuffer>=exportSimreadyGltf({handle,exporter:new GLTFExporter(),usdMetadata:metadata});
void bytes;
