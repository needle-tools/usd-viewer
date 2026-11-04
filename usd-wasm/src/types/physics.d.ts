import type { Object3D } from 'three';
import type { NeedleThreeHydraHandle } from './create.three.js';

export type {PhysicsVector,PhysicsRotation,PhysicsIssue,PhysicsMass,PhysicsBody,PhysicsShape,PhysicsLimit,PhysicsDrive,PhysicsJoint,PhysicsArticulation,UsdPhysicsSnapshot} from './physics-data.js';
import type {PhysicsVector,PhysicsRotation,PhysicsIssue,PhysicsBody,UsdPhysicsSnapshot} from './physics-data.js';

// Structural interfaces keep Rapier optional for consumers that only render USD.
export interface RapierBody {
    translation(): { x: number; y: number; z: number };
    rotation(): { x: number; y: number; z: number; w: number };
    isDynamic(): boolean;
}
export interface UsdPhysicsSimulation {
    readonly root: Object3D;
    readonly unsupported: PhysicsIssue[];
    play(): void;
    pause(): void;
    isPlaying(): boolean;
    update(dt: number): void;
    reset(): void;
    bodyForObject(object: Object3D, instanceIndex?: number): { data: PhysicsBody; body: RapierBody } | null;
    /** Positions are in USD stage coordinates, before the root up-axis transform. */
    beginDrag(path: string, position: { x: number; y: number; z: number }): boolean;
    moveDrag(position: { x: number; y: number; z: number }): void;
    endDrag(): void;
    dispose(): void;
}
export function readUsdPhysics(handle: NeedleThreeHydraHandle, options?: {meshGeometry?:boolean}): Promise<UsdPhysicsSnapshot>;
export function getUsdPhysicsLimitations(snapshot:UsdPhysicsSnapshot):PhysicsIssue[];
/** Scene, movable body and joint paths; does not allocate collider geometry. */
export function inspectUsdPhysics(handle: NeedleThreeHydraHandle): Promise<{scenes:{path:string}[];dynamic:boolean;bodies:string[];joints:string[]}>;
export interface UsdDynamicsSimulation extends UsdPhysicsSimulation {
    readonly world:object;
    readonly bodies:ReadonlyMap<string,{data:PhysicsBody;body:RapierBody}>;
    step(dt?:number):void;
    /** Degrees for hinges; stage units for independent sliders, world units for shared sliders. */
    getJointValue(path:string):number|null;
    setJointTarget(path:string,target:{position?:number;velocity?:number}):boolean;
}
export type UsdPhysicsOptions = {
    handle: NeedleThreeHydraHandle;
    root?: Object3D;
    snapshot?: UsdPhysicsSnapshot;
    /** Instance identity within a shared simulation world. */
    id?:string;
    position?:PhysicsVector;
    rotation?:PhysicsRotation;
    scenePath?: string;
    /** Reject incomplete simulation when false. Defaults to true for compatibility. */
    allowPartial?: boolean;
    /** Interaction solves joint constraints with a held base; gravity and contacts are disabled. */
    mode?: 'simulation' | 'interaction';
} & (
    { /** Initialized Rapier module for an independent stage-coordinate simulation. */ rapier:object; world?:undefined }
    | { /** SimReady world adapter, not a raw Rapier World. The host owns stepping. */ world:import('@needle-tools/simready/rapier').SimulationWorld; rapier?:object }
);

export function createUsdPhysics(options:UsdPhysicsOptions):Promise<UsdDynamicsSimulation>;
