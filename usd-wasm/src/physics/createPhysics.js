import { Quaternion, Vector3 } from 'three';
import { shiftInertiaToCenterOfMass } from './massProperties.js';
import {bindPhysicsVisuals} from './visualBindings.js';
import {readJointMetadata} from './jointMetadata.js';

const vector = (a = [0, 0, 0]) => ({ x: a[0], y: a[1], z: a[2] });
const rotation = (a = [0, 0, 0, 1]) => ({ x: a[0], y: a[1], z: a[2], w: a[3] });
const q = a => new Quaternion().fromArray(a || [0, 0, 0, 1]);
const axis = name => new Vector3(...(name === 'X' ? [1, 0, 0] : name === 'Z' ? [0, 0, 1] : [0, 1, 0]));
const contains = (parent, child) => child === parent || child.startsWith(parent + '/');

// Loading a scene only needs body flags and scene names. Extracting the full
// collider snapshot here also copies every collision mesh into JSON.
export async function inspectUsdPhysics(handle) {
  await handle.ready();
  return handle.readStage(async stage => {
  // The Hydra handle owns the stage; only the child/attribute wrappers below are temporary.
  const pending=[stage.GetPrimAtPath('/')],scenes=[],bodies=[],joints=[];
  let dynamic=false;
  const flag=async(prim,name,fallback)=>{
    const attribute=prim.GetAttribute(name);
    try{const value=attribute.IsValid()?await attribute.Get(handle.getTime()):undefined;return typeof value==='boolean'?value:fallback;}
    finally{attribute.delete?.();}
  };
  try{
    while(pending.length){
      const prim=pending.pop();
      try{
        const type=prim.GetTypeName();
        if(type==='PhysicsScene')scenes.push({path:prim.GetPath()});
        if(/^Physics.*Joint$/.test(type))joints.push(prim.GetPath());
        if(await flag(prim,'physics:rigidBodyEnabled',false)&&!await flag(prim,'physics:kinematicEnabled',false)){dynamic=true;bodies.push(prim.GetPath());}
        const children=prim.GetChildren();
        try{for(let i=0;i<children.size();i++)pending.push(children.get(i));}
        finally{children.delete?.();}
      }finally{prim.delete?.();}
    }
    return {scenes,dynamic,bodies,joints};
  }finally{for(const prim of pending)prim.delete?.();}
  });
}

/** Read physics from the composed stage, including referenced layers and relationships. */
export async function readUsdPhysics(handle, {meshGeometry = true} = {}) {
    await handle.ready();
    const snapshot=await handle.readStage(async (_stage, driver) => {
        if (!driver.GetPhysicsSceneJson) throw new Error('This USD runtime does not include physics extraction.');
        const compact = driver.GetPhysicsSceneMetadataJson && (!meshGeometry || driver.GetPhysicsMeshBuffers);
        const raw = await (compact ? driver.GetPhysicsSceneMetadataJson() : driver.GetPhysicsSceneJson());
        if (!raw) throw new Error('USD physics extraction returned no data.');
        const result = JSON.parse(raw);
        if (driver.GetPhysicsMeshBuffers && meshGeometry) {
            for (const shape of result.shapes || []) if (shape.type === 'mesh' && shape.collisionEnabled !== false) {
                try { Object.assign(shape, await driver.GetPhysicsMeshBuffers(shape.path)); }
                catch (error) {
                    result.unsupported.push({path:shape.path,type:'mesh',reason:error.message || String(error)});
                    shape.collisionEnabled = false;
                }
            }
        }
        return result;
    });
    await readJointMetadata(handle,snapshot);
    return snapshot;
}

/** Descriptors the Rapier adapter cannot simulate, known before loading its runtime. */
export function getUsdPhysicsLimitations(snapshot) {
    const issues=[...(snapshot.unsupported||[])];
    for(const shape of snapshot.shapes||[])if(shape.collisionEnabled!==false && shape.type==='mesh' && shape.approximation && !['none','convexHull'].includes(shape.approximation))
        issues.push({path:shape.path,type:'mesh',reason:`Mesh approximation ${shape.approximation} is not supported.`});
    for(const joint of snapshot.joints||[])if(joint.mimic)issues.push({path:joint.path,type:joint.type,reason:"Mimic joint coupling is not supported by this contact adapter."});
    return issues;
}

/**
 * Create a simulation in stage coordinates. Supply an initialized Rapier module;
 * importing the USD renderer alone does not download another WASM runtime.
 */
export async function createUsdPhysics({ handle, rapier: R, root = handle.scene, snapshot, scenePath, mode = 'simulation', allowPartial = true }) {
    snapshot ||= await readUsdPhysics(handle);
    if (!root) throw new Error('A USD scene root is required.');
    const scenes = snapshot.scenes || [];
    if (scenes.length > 1 && !scenePath) throw new Error('Select a USD physics scene before simulating.');
    const scene = scenePath ? scenes.find(s => s.path === scenePath) : scenes[0];
    if (scenePath && !scene) throw new Error(`USD physics scene not found: ${scenePath}`);
    const mpu = snapshot.metersPerUnit > 0 ? snapshot.metersPerUnit : 0.01;
    const kgpu = snapshot.kilogramsPerUnit > 0 ? snapshot.kilogramsPerUnit : 1;
    const direction = scene?.gravityDirection || (snapshot.upAxis === 'Z' ? [0, 0, -1] : [0, -1, 0]);
    const magnitude = Number.isFinite(scene?.gravityMagnitude) && scene.gravityMagnitude >= 0 ? scene.gravityMagnitude : 9.81 / mpu;
    const gravity = new Vector3().fromArray(direction).normalize().multiplyScalar(magnitude);
    const world = new R.World(mode === 'interaction' ? {x:0,y:0,z:0} : gravity);
    // Rapier dispatches contact hooks only through stepWithEvents.
    const events = new R.EventQueue(true);
    world.timestep = 1 / 120;
    world.lengthUnit = 1 / mpu;
    world.numSolverIterations = 12;
    const bodies = new Map(), colliders = new Map(), joints = new Map();
    // Joint inspection does not solve contacts or require PhysX SDF colliders
    // or a reduced-coordinate articulation. Its dependent joints still share
    // one constraint solver, including closed loops and fixed attachments.
    const unsupported = getUsdPhysicsLimitations(snapshot).filter(item=>mode!=='interaction'||!/Shape$|^mesh$|^Articulation$/.test(item.type||''));
    const warn = (item, reason) => {if(!unsupported.some(issue=>issue.path===item.path&&issue.reason===reason))unsupported.push({ path: item.path, type: item.type, reason });};
    const inScene = item => item.simulationOwners?.length ? !!scene && item.simulationOwners.includes(scene.path)
        : !scene || scene.path === scenes[0]?.path;
    let playing = false, disposed = false, accumulator = 0, drag = null;
    const wasPlaying = handle.isPlaying?.() || false;
    // USD animation must settle before overlaying physics poses.
    handle.setPlaying(false);
    await handle.ready();

    try {
        for (const data of snapshot.bodies || []) {
            if (!inScene(data)) continue;
            const desc = data.rigidBodyEnabled === false ? R.RigidBodyDesc.fixed()
                : data.kinematicBody ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
            desc.setTranslation(...data.position).setRotation(rotation(data.rotation));
            desc.setLinvel(...(data.linearVelocity || [0, 0, 0]));
            desc.setAngvel(new Vector3().fromArray(data.angularVelocity || [0, 0, 0]).multiplyScalar(Math.PI / 180));
            desc.setSleeping(!!data.startsAsleep);
            if (!data.kinematicBody && data.rigidBodyEnabled !== false) desc.setCcdEnabled(true);
            bodies.set(data.path, { data, body: world.createRigidBody(desc), colliders: [] });
        }
        const materialMap = new Map((snapshot.materials || []).map(m => [m.path, m]));
        for (const data of mode === 'interaction' ? [] : snapshot.shapes || []) {
            if (data.collisionEnabled === false || !inScene(data)) continue;
            const owner = bodies.get(data.body);
            if (data.body && !owner) continue;
            let desc, extraRotation = new Quaternion();
            switch (data.type) {
                case 'cube': desc = R.ColliderDesc.cuboid(...data.halfExtents); break;
                case 'sphere': desc = R.ColliderDesc.ball(data.radius); break;
                case 'capsule': desc = R.ColliderDesc.capsule(data.halfHeight, data.radius); break;
                case 'cylinder': desc = R.ColliderDesc.cylinder(data.halfHeight, data.radius); break;
                case 'cone': desc = R.ColliderDesc.cone(data.halfHeight, data.radius); break;
                case 'plane': desc = R.ColliderDesc.halfspace(axis(data.axis)); break;
                case 'mesh': {
                    const points = Float32Array.from(data.points || [], (v, i) => v * (data.meshScale?.[i % 3] ?? 1));
                    if (!points.length) { warn(data, 'Mesh collision points are unavailable.'); continue; }
                    if (data.approximation === 'convexHull') desc = R.ColliderDesc.convexHull(points);
                    else if (!data.approximation || data.approximation === 'none') {
                        if (owner?.body.isDynamic()) { warn(data, 'Dynamic triangle meshes require an authored convex approximation.'); continue; }
                        desc = R.ColliderDesc.trimesh(points, Uint32Array.from(data.indices || []));
                    } else { warn(data, `Mesh approximation ${data.approximation} is not supported.`); continue; }
                    break;
                }
                default: warn(data, 'Collider type is not supported.'); continue;
            }
            if (!desc) { warn(data, 'Collider could not be constructed.'); continue; }
            if (['capsule', 'cylinder', 'cone'].includes(data.type)) extraRotation.setFromUnitVectors(new Vector3(0, 1, 0), axis(data.axis));
            const r = q(data.rotation).multiply(extraRotation);
            desc.setTranslation(...(data.position || [0, 0, 0])).setRotation(r);
            const material = data.materials?.map(path => materialMap.get(path)).find(Boolean);
            desc.setFriction(material?.dynamicFriction ?? 0.5).setRestitution(material?.restitution ?? 0);
            const density = data.density > 0 ? data.density : owner?.data.density > 0 ? owner.data.density : material?.density;
            desc.setDensity(density > 0 ? density * kgpu : 1000 * mpu ** 3);
            if (data.mass > 0) desc.setMass(data.mass * kgpu);
            if (data.path !== owner?.data.path && (data.centerOfMass || data.diagonalInertia || data.principalAxes)) {
                warn(data, 'Collider-local center of mass and inertia overrides are not supported.');
            }
            desc.setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS);
            const collider = world.createCollider(desc, owner?.body);
            colliders.set(collider.handle, { data, collider, owner });
            owner?.colliders.push(collider);
        }
        for (const { data, body, colliders: owned } of bodies.values()) {
            body.recomputeMassPropertiesFromColliders();
            if (mode!=='interaction' && !(data.mass > 0) && !data.centerOfMass && !data.diagonalInertia && !data.principalAxes) continue;
            const oldMass = body.mass(), mass = data.mass > 0 ? data.mass * kgpu : oldMass || (mode==='interaction'?1:0);
            let inertia = data.diagonalInertia ? new Vector3().fromArray(data.diagonalInertia).multiplyScalar(kgpu)
                : new Vector3().copy(body.principalInertia()).multiplyScalar(oldMass > 0 ? mass / oldMass : 1);
            const com = data.centerOfMass ? new Vector3().fromArray(data.centerOfMass).multiply(new Vector3().fromArray(data.scale || [1, 1, 1])) : body.localCom();
            let frame = body.principalInertiaLocalFrame();
            if(mode==='interaction'&&!data.diagonalInertia&&inertia.lengthSq()===0)inertia.setScalar(mass);
            if (data.centerOfMass && !data.diagonalInertia) {
                const shifted = shiftInertiaToCenterOfMass(inertia, frame, mass, body.localCom(), com);
                inertia = shifted.diagonalInertia; frame = shifted.principalAxes;
            }
            if (data.principalAxes) frame = rotation(data.principalAxes);
            for (const collider of owned) collider.setDensity(0);
            body.setAdditionalMassProperties(mass, com, inertia, frame, false);
            body.recomputeMassPropertiesFromColliders();
        }
        const fixedWorld = world.createRigidBody(R.RigidBodyDesc.fixed());
        for (const data of snapshot.joints || []) {
            if (data.jointEnabled === false) continue;
            const b0 = data.body0 ? bodies.get(data.body0)?.body : fixedWorld;
            const b1 = data.body1 ? bodies.get(data.body1)?.body : fixedWorld;
            if (!b0 || !b1) { warn(data, 'A joint body is outside the selected simulation scene.'); continue; }
            const a0 = vector(data.position0), a1 = vector(data.position1), r0 = rotation(data.rotation0), r1 = rotation(data.rotation1);
            let desc;
            if (data.type === 'fixed') desc = R.JointData.fixed(a0, r0, a1, r1);
            else if (data.type === 'spherical') {
                if (data.limit?.enabled) { warn(data, 'Spherical joint cone limits are not supported.'); continue; }
                desc = R.JointData.spherical(a0, a1);
            } else if (data.type === 'revolute' || data.type === 'prismatic') {
                // Rapier's public unit-joint API accepts a shared local axis/frame.
                // Never discard independently authored frames or their limit origin.
                if (!R.ImpulseJoint?.prototype.setLocalFrame1 && (q(data.rotation0).angleTo(q(data.rotation1)) > 1e-5 ||
                    (data.type === 'prismatic' && q(data.rotation0).angleTo(new Quaternion()) > 1e-5))) {
                    warn(data, 'Independent joint frame rotations are not supported by this Rapier adapter.'); continue;
                }
                const jointAxis = axis(data.axis).applyQuaternion(q(data.rotation0));
                desc = R.JointData[data.type](a0, a1, jointAxis);
            } else if (data.type === 'distance' && !data.minEnabled && data.maxEnabled) {
                desc = R.JointData.rope(data.limit?.upper ?? data.maxDistance, a0, a1);
            } else { warn(data, 'Joint type or limits are not supported.'); continue; }
            if (Number.isFinite(data.breakForce) || Number.isFinite(data.breakTorque)) {
                warn(data, 'Joint breaking thresholds are not supported.');
            }
            const joint = world.createImpulseJoint(desc, b0, b1, true);
            if ((data.type === 'revolute' || data.type === 'prismatic') && joint.setLocalFrame1) {
                // Rapier unit joints use X in their local frame. Rotate that
                // basis into USD's authored axis, then apply each local frame.
                const basis = new Quaternion().setFromUnitVectors(new Vector3(1,0,0),axis(data.axis));
                joint.setLocalFrame1(a0,q(data.rotation0).multiply(basis));
                joint.setLocalFrame2(a1,q(data.rotation1).multiply(basis));
            }
            joint.setContactsEnabled(!!data.collisionEnabled);
            const angular = data.type === 'revolute', unit = angular ? Math.PI / 180 : 1;
            if (data.limit?.enabled && joint.setLimits) joint.setLimits((data.limit.lower ?? -Infinity) * unit, (data.limit.upper ?? Infinity) * unit);
            if (data.drive?.enabled && joint.configureMotor) {
                const d = data.drive;
                if (Number.isFinite(d.forceLimit)) {
                    if(joint.setMotorMaxForce)joint.setMotorMaxForce(d.forceLimit*kgpu);
                    else warn(data, 'Drive force limits are not supported by this Rapier version.');
                }
                joint.configureMotorModel(d.acceleration ? R.MotorModel.AccelerationBased : R.MotorModel.ForceBased);
                const gainScale = (d.acceleration ? 1 : kgpu) / unit;
                joint.configureMotor(d.targetPosition * unit, d.targetVelocity * unit, d.stiffness * gainScale, d.damping * gainScale);
            }
            joints.set(data.path, joint);
        }

        const groupMap = new Map((snapshot.groups || []).map(g => [g.path, g]));
        const groupAliases = new Map();
        for (const group of snapshot.groups || []) for (const path of [group.path, ...(group.mergedGroups || [])]) groupAliases.set(path, group.path);
        const canonicalGroup = path => groupAliases.get(path) || path;
        const excludes = (a, b) => (a.data.filteredCollisions || []).some(p => contains(p, b.data.path) || p === b.data.body)
            || (a.owner?.data.filteredCollisions || []).some(p => contains(p, b.data.path) || p === b.data.body);
        const groupExcludes = (a, b) => (a.data.collisionGroups || []).some(path => {
            const g = groupMap.get(canonicalGroup(path));
            if (!g) return false;
            const filtered = (b.data.collisionGroups || []).some(other => (g.filteredGroups || []).some(target => canonicalGroup(target) === canonicalGroup(other)));
            return g.invertFilteredGroups ? !filtered : filtered;
        });
        const hooks = {
            filterContactPair(a, b) {
                const c0 = colliders.get(a), c1 = colliders.get(b);
                return c0 && c1 && (excludes(c0, c1) || excludes(c1, c0) || groupExcludes(c0, c1) || groupExcludes(c1, c0))
                    ? null : R.SolverFlags.COMPUTE_IMPULSE;
            },
            filterIntersectionPair() { return true; },
        };
        if(!allowPartial && unsupported.length)throw new Error(`Simulation unavailable: ${unsupported[0].reason}${unsupported.length>1?` (${unsupported.length} unsupported features)`:''}`);
        const visuals = await bindPhysicsVisuals(handle,root,bodies,warn);
        const sync=visuals.sync;
        function endDrag() {
            if (!drag) return;
            world.removeImpulseJoint(drag.joint, true); world.removeRigidBody(drag.anchor);
            for(const {body,type} of drag.pinned){body.setBodyType(type,true);body.setLinvel(vector(),true);body.setAngvel(vector(),true);}
            drag = null;
        }
        function reset() {
            if (disposed) return;
            endDrag(); playing = false; accumulator = 0;
            for (const { body, data } of bodies.values()) {
                body.setTranslation(vector(data.position), true); body.setRotation(rotation(data.rotation), true);
                body.setLinvel(vector(data.linearVelocity), true);
                body.setAngvel(new Vector3().fromArray(data.angularVelocity || [0, 0, 0]).multiplyScalar(Math.PI / 180), true);
                body.resetForces(true); body.resetTorques(true);
                if (data.startsAsleep) body.sleep();
            }
            visuals.reset();
        }
        return {
            world, bodies, joints, unsupported, root,
            play() { if (!disposed) { playing = true; handle.setPlaying(false); } },
            pause() { playing = false; endDrag(); },
            isPlaying: () => playing,
            update(dt) {
                if (!playing || disposed) return;
                accumulator += Math.min(0.1, Math.max(0, dt));
                while (accumulator >= world.timestep) { world.step(events, hooks); accumulator -= world.timestep; }
                sync();
            },
            reset,
            bodyForObject: visuals.bodyForObject,
            beginDrag(path, position) {
                endDrag();
                const body = bodies.get(path)?.body;
                if (!body?.isDynamic() || !playing) return false;
                const local = new Vector3().copy(position).sub(body.translation()).applyQuaternion(new Quaternion().copy(body.rotation()).invert());
                const anchor = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z));
                // A rigid mouse constraint fights the mechanism's own limits
                // when the pointer moves beyond its range. A damped spring
                // lets the grab yield while the authored joints stay rigid.
                const mass=Math.max(body.mass(),1e-6);
                const joint = world.createImpulseJoint(R.JointData.spring(0,400*mass,40*mass,local,vector()), body, anchor, true);
                const pinned=[];
                if(mode==='interaction'){
                    // Hold the mechanism's base while inspecting a movable
                    // part. All dependent links remain in the same solver.
                    const connected=new Set([path]);let changed=true;
                    while(changed){changed=false;for(const item of snapshot.joints||[]){
                      if(!joints.has(item.path)||!connected.has(item.body0)&&!connected.has(item.body1))continue;
                      for(const target of [item.body0,item.body1])if(target&&!connected.has(target)){connected.add(target);changed=true;}
                    }}
                    const links=(snapshot.joints||[]).filter(item=>joints.has(item.path)&&connected.has(item.body0));
                    const roots=links.filter(item=>!links.some(other=>other.body1===item.body0)).map(item=>item.body0);
                    const base=[...new Set(roots)].map(key=>bodies.get(key)).find(item=>item&&item.body!==body);
                    if(base?.body.isDynamic()){
                      pinned.push({body:base.body,type:base.body.bodyType()});base.body.setBodyType(R.RigidBodyType.Fixed,true);
                    }
                }
                drag = { anchor, joint, pinned }; return true;
            },
            moveDrag(position) { drag?.anchor.setNextKinematicTranslation(position); },
            endDrag,
            dispose() {
                if (disposed) return;
                reset(); disposed = true; events.free(); world.free();
                handle.setPlaying(wasPlaying);
            },
        };
    } catch (error) { events.free(); world.free(); handle.setPlaying(wasPlaying); throw error; }
}
