/** Data extracted from a composed UsdPhysics stage; no simulation runtime is required. */
export type PhysicsVector = [number, number, number];
export type PhysicsRotation = [number, number, number, number];
export type PhysicsIssue = {
    path: string;
    type?: string;
    reason: string;
};
export type PhysicsMass = {
    mass?: number | null;
    density?: number | null;
    centerOfMass?: PhysicsVector;
    diagonalInertia?: PhysicsVector;
    principalAxes?: PhysicsRotation;
};
export type PhysicsBody = PhysicsMass & {
    path: string;
    position: PhysicsVector;
    rotation: PhysicsRotation;
    scale?: PhysicsVector;
    rigidBodyEnabled?: boolean;
    kinematicBody?: boolean;
    startsAsleep?: boolean;
    linearVelocity?: PhysicsVector;
    angularVelocity?: PhysicsVector;
    filteredCollisions?: string[];
    simulationOwners?: string[];
};
export type PhysicsShape = PhysicsMass & {
    path: string;
    type: string;
    body?: string;
    position?: PhysicsVector;
    rotation?: PhysicsRotation;
    scale?: PhysicsVector;
    collisionEnabled?: boolean;
    simulationOwners?: string[];
    materials?: string[];
    filteredCollisions?: string[];
    collisionGroups?: string[];
    halfExtents?: PhysicsVector;
    radius?: number;
    halfHeight?: number;
    axis?: "X" | "Y" | "Z";
    approximation?: string;
    meshScale?: PhysicsVector;
    points?: number[] | Float32Array;
    indices?: number[] | Int32Array | Uint16Array | Uint32Array;
};
export type PhysicsLimit = {
    enabled: boolean;
    lower: number | null;
    upper: number | null;
};
export type PhysicsDrive = {
    enabled: boolean;
    targetPosition: number;
    targetVelocity: number;
    stiffness: number;
    damping: number;
    acceleration?: boolean;
    forceLimit?: number | null;
};
export type PhysicsJoint = {
    path: string;
    type: string;
    body0?: string;
    body1?: string;
    position0?: PhysicsVector;
    position1?: PhysicsVector;
    rotation0?: PhysicsRotation;
    rotation1?: PhysicsRotation;
    jointEnabled?: boolean;
    collisionEnabled?: boolean;
    excludeFromArticulation?: boolean;
    axis?: "X" | "Y" | "Z";
    limit?: PhysicsLimit;
    drive?: PhysicsDrive;
    minEnabled?: boolean;
    maxEnabled?: boolean;
    breakForce?: number | null;
    breakTorque?: number | null;
    minDistance?: number;
    maxDistance?: number;
    mimic?: {
        joint: string;
        multiplier: number;
        offset: number;
    };
};
export type PhysicsArticulation = {
    path: string;
    rootPrims: string[];
    filteredCollisions: string[];
    articulatedJoints: string[];
    articulatedBodies: string[];
};
export type UsdPhysicsSnapshot = {
    articulations?: PhysicsArticulation[];
    metersPerUnit?: number;
    kilogramsPerUnit?: number;
    upAxis?: string;
    scenes: {
        path: string;
        gravityDirection?: PhysicsVector;
        gravityMagnitude?: number;
    }[];
    bodies: PhysicsBody[];
    shapes: PhysicsShape[];
    joints: PhysicsJoint[];
    materials: {
        path: string;
        staticFriction?: number;
        dynamicFriction?: number;
        restitution?: number;
        density?: number;
    }[];
    groups: {
        path: string;
        filteredGroups?: string[];
        invertFilteredGroups?: boolean;
        mergedGroups?: string[];
    }[];
    unsupported?: PhysicsIssue[];
};
