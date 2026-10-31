import type { Object3D } from 'three';
import type { NeedleThreeHydraHandle } from './create.three.js';

export type PhysicsVector = [number, number, number];
export type PhysicsRotation = [number, number, number, number];
export type PhysicsIssue = { path: string; type?: string; reason: string };
export type PhysicsMass = {
    mass?: number; density?: number; centerOfMass?: PhysicsVector;
    diagonalInertia?: PhysicsVector; principalAxes?: PhysicsRotation;
};
export type PhysicsBody = PhysicsMass & {
    path: string; position: PhysicsVector; rotation: PhysicsRotation; scale: PhysicsVector;
    rigidBodyEnabled: boolean; kinematicBody: boolean; startsAsleep: boolean;
    linearVelocity: PhysicsVector; angularVelocity: PhysicsVector;
    filteredCollisions: string[]; simulationOwners: string[];
};
export type PhysicsShape = PhysicsMass & {
    path: string; type: string; body: string; position: PhysicsVector; rotation: PhysicsRotation;
    scale: PhysicsVector; collisionEnabled: boolean; simulationOwners: string[];
    materials: string[]; filteredCollisions: string[]; collisionGroups: string[];
    halfExtents?: PhysicsVector; radius?: number; halfHeight?: number; axis?: 'X' | 'Y' | 'Z';
    approximation?: string; meshScale?: PhysicsVector; points?: number[]; indices?: number[];
};
export type PhysicsLimit = { enabled: boolean; lower: number; upper: number };
export type PhysicsDrive = {
    enabled: boolean; targetPosition: number; targetVelocity: number; stiffness: number;
    damping: number; acceleration: boolean; forceLimit: number | null;
};
export type PhysicsJoint = {
    path: string; type: string; body0: string; body1: string;
    position0: PhysicsVector; position1: PhysicsVector; rotation0: PhysicsRotation; rotation1: PhysicsRotation;
    jointEnabled: boolean; collisionEnabled: boolean; axis?: 'X' | 'Y' | 'Z';
    limit?: PhysicsLimit; drive?: PhysicsDrive; minEnabled?: boolean; maxEnabled?: boolean;
    breakForce: number | null; breakTorque: number | null;
};
export type UsdPhysicsSnapshot = {
    metersPerUnit: number; kilogramsPerUnit: number; upAxis: string;
    scenes: { path: string; gravityDirection: PhysicsVector; gravityMagnitude: number }[];
    bodies: PhysicsBody[]; shapes: PhysicsShape[]; joints: PhysicsJoint[];
    materials: { path: string; staticFriction: number; dynamicFriction: number; restitution: number; density: number }[];
    groups: { path: string; filteredGroups: string[]; invertFilteredGroups: boolean; mergedGroups: string[] }[];
    unsupported: PhysicsIssue[];
};

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
    bodyForObject(object: Object3D): { data: PhysicsBody; body: RapierBody } | null;
    /** Positions are in USD stage coordinates, before the root up-axis transform. */
    beginDrag(path: string, position: { x: number; y: number; z: number }): boolean;
    moveDrag(position: { x: number; y: number; z: number }): void;
    endDrag(): void;
    dispose(): void;
}
export function readUsdPhysics(handle: NeedleThreeHydraHandle): Promise<UsdPhysicsSnapshot>;
/** Body flags and scene paths only; does not allocate collider geometry. */
export function inspectUsdPhysics(handle: NeedleThreeHydraHandle): Promise<{scenes:{path:string}[];dynamic:boolean}>;
export function createUsdPhysics(options: {
    handle: NeedleThreeHydraHandle;
    /** An initialized @dimforge/rapier3d-compat module (tested with 0.19.3 and 0.21.0). */
    rapier: object;
    root?: Object3D;
    snapshot?: UsdPhysicsSnapshot;
    scenePath?: string;
}): Promise<UsdPhysicsSimulation>;
