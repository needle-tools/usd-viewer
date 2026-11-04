import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getUsdModule } from '../runtime.mjs';

const assembly = `#usda 1.0
(defaultPrim = "Rig")
def Xform "Rig" {
    def Xform "A" (prepend apiSchemas = ["PhysicsRigidBodyAPI", "PhysicsMassAPI", "PhysicsFilteredPairsAPI"]) {
        float physics:mass = 3
        vector3f physics:angularVelocity = (0, 0, 90)
        rel physics:filteredPairs = </Rig/B>
        double3 xformOp:translate = (0, 2, 0)
        float3 xformOp:scale = (2, 1, 1)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
        def Cube "Collider" (prepend apiSchemas = ["PhysicsCollisionAPI", "PhysicsMassAPI", "MaterialBindingAPI"]) {
            double size = 2
            float physics:density = 5
            double3 xformOp:translate = (0.5, 0, 0)
            uniform token[] xformOpOrder = ["xformOp:translate"]
            rel material:binding:physics = </Rig/Material>
        }
    }
    def Sphere "B" (prepend apiSchemas = ["PhysicsRigidBodyAPI", "PhysicsCollisionAPI", "PhysicsMassAPI"]) {
        double radius = 0.5
        float physics:mass = 7
        point3f physics:centerOfMass = (0.1, 0.2, 0.3)
        float3 physics:diagonalInertia = (1, 2, 3)
        quatf physics:principalAxes = (1, 0, 0, 0)
        double3 xformOp:translate = (0, 5, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
    def PhysicsRevoluteJoint "Joint" (prepend apiSchemas = ["PhysicsDriveAPI:angular"]) {
        rel physics:body0 = </Rig/A/Collider>
        rel physics:body1 = </Rig/B>
        point3f physics:localPos0 = (1, 0, 0)
        point3f physics:localPos1 = (0, -1, 0)
        uniform token physics:axis = "Z"
        float physics:lowerLimit = -25
        float physics:upperLimit = 35
        float drive:angular:physics:stiffness = 20
        float drive:angular:physics:damping = 2
        float drive:angular:physics:targetVelocity = 40
    }
    def Material "Material" (prepend apiSchemas = ["PhysicsMaterialAPI"]) {
        float physics:staticFriction = 0.6
        float physics:dynamicFriction = 0.4
        float physics:restitution = 0.2
    }
}`;
const source = `#usda 1.0
(
    metersPerUnit = 0.01
    kilogramsPerUnit = 0.001
    upAxis = "Z"
)
def Xform "World" {
    def Xform "Rig" (prepend references = @physics-assembly.usda@</Rig>) {
        double3 xformOp:translate = (10, 0, 0)
        float3 xformOp:scale = (1, 2, 1)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
    }
    def PhysicsScene "Earth" {}
    def PhysicsScene "Moon" {
        vector3f physics:gravityDirection = (0, -1, 0)
        float physics:gravityMagnitude = 162
    }
    def Mesh "Ground" (prepend apiSchemas = ["PhysicsCollisionAPI", "PhysicsMeshCollisionAPI"]) {
        point3f[] points = [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)]
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        token physics:approximation = "none"
        double3 xformOp:translate = (0, 0, -1)
        float3 xformOp:scale = (2, 3, 1)
        uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
    }
    def Xform "UnknownCollider" (prepend apiSchemas = ["PhysicsCollisionAPI"]) {}
    def Xform "InvalidArticulation" (prepend apiSchemas = ["PhysicsArticulationRootAPI"]) {}
    def PhysicsCollisionGroup "GroupA" {
        rel collection:colliders:includes = </World/Rig/A>
        rel physics:filteredGroups = </World/GroupB>
    }
    def PhysicsCollisionGroup "GroupB" {
        rel collection:colliders:includes = </World/Rig/B>
    }
}`;

// Export these strings for the same focused native-CLI probe before relinking.
export { assembly, source };

test('physics export preserves composed body/collider/joint frames, units and optional mass data', async () => {
    const USD = await getUsdModule({ print() {}, printErr() {} });
    for (const [name, text] of [['physics-assembly.usda', assembly], ['physics-scene.usda', source]])
        USD.FS_createDataFile('/', name, new TextEncoder().encode(text), true, true, true);
    const delegate = { createRPrim() {}, createSPrim() {}, createBPrim() {}, CommitResources() {} };
    const driver = await (USD.CreateHdWebSyncDriver?.(delegate, 'physics-scene.usda')
        ?? new USD.HdWebSyncDriver(delegate, 'physics-scene.usda'));
    try {
        const raw = await driver.GetPhysicsSceneJson();
        assert.doesNotMatch(raw, /\b(?:NaN|Infinity)\b/);
        const data = JSON.parse(raw);
        assert.equal(data.metersPerUnit, 0.01); assert.equal(data.kilogramsPerUnit, 0.001); assert.equal(data.upAxis, 'Z');
        assert.equal(data.bodies.length, 2); assert.equal(data.scenes.length, 2);
        const body = data.bodies.find(b => b.path === '/World/Rig/A');
        assert.deepEqual(body.position, [10, 4, 0]); assert.deepEqual(body.scale, [2, 2, 1]);
        assert.equal(body.mass, 3); assert.equal(body.density, 0);
        assert.deepEqual(body.angularVelocity, [0, 0, 90]);
        assert.deepEqual(body.filteredCollisions, ['/World/Rig/B']);
        assert.equal('centerOfMass' in body, false); assert.equal('diagonalInertia' in body, false); assert.equal('principalAxes' in body, false);
        const second = data.bodies.find(b => b.path === '/World/Rig/B');
        assert.equal(second.mass, 7); assert.deepEqual(second.diagonalInertia, [1, 2, 3]); assert.deepEqual(second.principalAxes, [0, 0, 0, 1]);
        assert.ok(Math.abs(second.centerOfMass[0] - 0.1) < 1e-6);
        const collider = data.shapes.find(s => s.path.endsWith('/A/Collider'));
        assert.equal(collider.body, body.path); assert.deepEqual(collider.position, [1, 0, 0]);
        assert.deepEqual(collider.halfExtents, [2, 2, 1]); assert.equal(collider.density, 5);
        assert.deepEqual(collider.materials, ['/World/Rig/Material']);
        const ground = data.shapes.find(s => s.path === '/World/Ground');
        assert.equal(ground.body, ''); assert.equal(ground.type, 'mesh'); assert.deepEqual(ground.position, [0, 0, -1]);
        assert.deepEqual(ground.meshScale, [2, 3, 1]); assert.equal(ground.points.length, 12); assert.deepEqual(ground.indices, [0, 1, 2, 0, 2, 3]);
        const joint = data.joints[0];
        assert.equal(joint.body0, body.path); assert.equal(joint.body1, second.path); assert.equal(joint.type, 'revolute');
        assert.deepEqual(joint.position0, [3, 0, 0]); assert.deepEqual(joint.position1, [0, -2, 0]);
        assert.equal(joint.axis, 'Z'); assert.deepEqual(joint.limit, {enabled:true, lower:-25, upper:35});
        assert.equal(joint.drive.targetVelocity, 40); assert.equal(joint.drive.stiffness, 20);
        const earth = data.scenes.find(s => s.path.endsWith('/Earth'));
        assert.deepEqual(earth.gravityDirection, [0, 0, -1]); assert.ok(Math.abs(earth.gravityMagnitude - 981) < 0.01);
        assert.deepEqual(data.groups.find(g => g.path.endsWith('/GroupA')).filteredGroups, ['/World/GroupB']);
        assert.ok(data.groups.every(group => group.invertFilteredGroups === false), 'unauthored collision filtering is not inverted');
        assert.equal(data.materials.length, 1); assert.ok(Math.abs(data.materials[0].dynamicFriction - .4) < 1e-6);
        assert.ok(data.unsupported.some(issue => issue.path === '/World/UnknownCollider' && issue.reason.includes('not recognized')));
        assert.ok(data.unsupported.some(issue => issue.path === '/World/InvalidArticulation' && issue.reason.includes('Invalid OpenUSD')));
        assert.equal(await driver.GetPhysicsSceneJson(), raw, 'read-only extraction must be deterministic');
    } finally {
        driver.delete();
        USD.FS_unlink('/physics-assembly.usda'); USD.FS_unlink('/physics-scene.usda');
    }
});

test('physics scene precedence follows stage traversal and unauthored collision filtering stays false', async () => {
    const USD = await getUsdModule({print(){}, printErr(){}});
    const source = `#usda 1.0
def PhysicsScene "ZFirst" {}
def PhysicsScene "ASecond" {}
def PhysicsCollisionGroup "Default" {}
def PhysicsCollisionGroup "Inverted" {
    bool physics:invertFilteredGroups = true
}
`;
    USD.FS_createDataFile('/', 'physics-defaults.usda', new TextEncoder().encode(source), true, true, true);
    const delegate = {createRPrim(){}, createSPrim(){}, createBPrim(){}, CommitResources(){}};
    const driver = await (USD.CreateHdWebSyncDriver?.(delegate, 'physics-defaults.usda')
        ?? new USD.HdWebSyncDriver(delegate, 'physics-defaults.usda'));
    try {
        for (let i=0; i<20; i++) {
            const data=JSON.parse(await driver.GetPhysicsSceneJson());
            assert.deepEqual(data.scenes.map(scene=>scene.path), ['/ZFirst','/ASecond']);
            assert.equal(data.groups.find(group=>group.path==='/Default').invertFilteredGroups, false);
            assert.equal(data.groups.find(group=>group.path==='/Inverted').invertFilteredGroups, true);
        }
    } finally {driver.delete();USD.FS_unlink('/physics-defaults.usda');}
});

test('collision buffers are owned typed arrays and joint metadata excludes collider topology',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}});
 for(const [name,text] of [['physics-assembly.usda',assembly],['physics-buffers.usda',source]])USD.FS_createDataFile('/',name,new TextEncoder().encode(text),true,true,true);
 const delegate={createRPrim(){},createSPrim(){},createBPrim(){},CommitResources(){}};
 const driver=await (USD.CreateHdWebSyncDriver?.(delegate,'physics-buffers.usda')??new USD.HdWebSyncDriver(delegate,'physics-buffers.usda'));
 try{
  const metadata=JSON.parse(await driver.GetPhysicsSceneMetadataJson()),full=JSON.parse(await driver.GetPhysicsSceneJson());
  assert.deepEqual(metadata.joints,full.joints);assert.deepEqual(metadata.bodies,full.bodies);
  const shape=metadata.shapes.find(s=>s.path==='/World/Ground');assert.ok(shape);assert.equal(shape.points,undefined);assert.equal(shape.indices,undefined);
  const buffers=await driver.GetPhysicsMeshBuffers(shape.path),expected=full.shapes.find(s=>s.path===shape.path);
  assert.ok(buffers.points instanceof Float32Array);assert.ok(buffers.indices instanceof Int32Array);
  assert.deepEqual([...buffers.points],expected.points);assert.deepEqual([...buffers.indices],expected.indices);
  buffers.points[0]=500;assert.equal((await driver.GetPhysicsMeshBuffers(shape.path)).points[0],-1);
  await assert.rejects(async()=>await driver.GetPhysicsMeshBuffers('/World/Missing'));
 }finally{driver.delete();for(const name of ['physics-assembly.usda','physics-buffers.usda'])USD.FS_unlink('/'+name);}
});

test('articulation export retains parsed roots, members, filtering and excluded attachments',async()=>{
 const USD=await getUsdModule({print(){},printErr(){}});
 const file='physics-articulation.usda',text=`#usda 1.0
(defaultPrim = "Robot")
def Xform "Robot" (prepend apiSchemas = ["PhysicsArticulationRootAPI", "PhysicsFilteredPairsAPI"]) {
 rel physics:filteredPairs = </Obstacle>
 def Xform "Base" (prepend apiSchemas = ["PhysicsRigidBodyAPI"]) {
  def Cube "Collider" (prepend apiSchemas = ["PhysicsCollisionAPI"]) {}
 }
 def Xform "Link" (prepend apiSchemas = ["PhysicsRigidBodyAPI"]) {
  def Cube "Collider" (prepend apiSchemas = ["PhysicsCollisionAPI"]) {}
 }
 def Xform "Tool" (prepend apiSchemas = ["PhysicsRigidBodyAPI"]) {
  def Cube "Collider" (prepend apiSchemas = ["PhysicsCollisionAPI"]) {}
 }
 def PhysicsFixedJoint "Anchor" {
  rel physics:body1 = </Robot/Base>
 }
 def PhysicsRevoluteJoint "Hinge" {
  rel physics:body0 = </Robot/Base>
  rel physics:body1 = </Robot/Link>
 }
 def PhysicsFixedJoint "Attachment" {
  rel physics:body0 = </Robot/Link>
  rel physics:body1 = </Robot/Tool>
  bool physics:excludeFromArticulation = true
 }
}
def Cube "Obstacle" (prepend apiSchemas = ["PhysicsCollisionAPI"]) {}
`;
 USD.FS_createDataFile('/',file,new TextEncoder().encode(text),true,true,true);
 const delegate={createRPrim(){},createSPrim(){},createBPrim(){},CommitResources(){}};
 const driver=await(USD.CreateHdWebSyncDriver?.(delegate,file)??new USD.HdWebSyncDriver(delegate,file));
 try{
  const snapshot=JSON.parse(await driver.GetPhysicsSceneJson());
  assert.deepEqual(snapshot.unsupported,[]);
  assert.equal(snapshot.articulations.length,1);
  const articulation=snapshot.articulations[0];
  assert.equal(articulation.path,'/Robot');
  // Excluding the attachment creates a separate floating root under the same API subtree.
  assert.deepEqual([...articulation.rootPrims].sort(),['/Robot/Anchor','/Robot/Tool']);
  assert.deepEqual(articulation.filteredCollisions,['/Obstacle']);
  assert.deepEqual([...articulation.articulatedBodies].sort(),['','/Robot/Base','/Robot/Link','/Robot/Tool']);
  // OpenUSD includes incident excluded joints; their own exclusion flag distinguishes them.
  assert.deepEqual([...articulation.articulatedJoints].sort(),['/Robot/Anchor','/Robot/Attachment','/Robot/Hinge']);
  assert.equal(snapshot.joints.find(joint=>joint.path==='/Robot/Hinge').excludeFromArticulation,false);
  assert.equal(snapshot.joints.find(joint=>joint.path==='/Robot/Attachment').excludeFromArticulation,true);
  const metadata=JSON.parse(await driver.GetPhysicsSceneMetadataJson());
  assert.deepEqual(metadata.articulations,snapshot.articulations);
 }finally{driver.delete();USD.FS_unlink('/'+file);}
});
