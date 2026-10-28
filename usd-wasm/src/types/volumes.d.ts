import { MaterialXVolumeFactory, UsdVolumeFactory } from './hydra.js';

/** Bounded MaterialX volumes for a compatible WebGPURenderer with antialias: false. */
export declare const createMaterialXVolumeMaterial: MaterialXVolumeFactory;
/** Decode real OpenVDB fields and render them using the bounded-medium renderer. */
export declare const createVdbVolumeMesh: UsdVolumeFactory;
