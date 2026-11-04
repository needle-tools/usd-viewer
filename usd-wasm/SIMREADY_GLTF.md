# SimReady glTF export and runtime

Install the optional SimReady package for GLB export and runtime loading:

```sh
npm install @needle-tools/simready
```

Export a composed USD stage through `@needle-tools/usd/gltf`:

```js
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {exportSimreadyGltf} from '@needle-tools/usd/gltf';

activeSimulation?.reset();
const glb = await exportSimreadyGltf({handle, exporter:new GLTFExporter()});
```

The host owns exporter texture utilities. Export waits for the stage and its
materials, expands render instances using composed USD pick identities, keeps
rigid parts independent, and emits visual meshes in glTF meters with Y up.
The root transform maps the original stage coordinates into that frame.
Reset active physics or mechanism manipulation before exporting; current USD
timeline geometry is a visual snapshot, not a baked animation clip.
Export temporarily pauses timeline playback, restores it afterwards, and rejects
if the stage revision or timeline position changes while it is being written.

## Contract: `NEEDLE_simready`, version 1

The top-level extension is listed in `extensionsUsed`. Assets with bodies,
colliders, joints or collision groups also list it in `extensionsRequired`.
Ordinary scenes retain their cameras, lights, points and lines alongside meshes,
and can be opened without the SimReady runtime.
Ordinary glTF nodes and meshes provide the portable visual representation.
The required extension prevents a supporting optimizer or runtime from
silently treating the assembly as a static asset.

| Field | Meaning |
| --- | --- |
| `version` | Integer `1`. Incompatible readers reject other versions. |
| `stageNode` | glTF node index for the stage-to-glTF coordinate transform. |
| `snapshot` | Complete `UsdPhysicsSnapshot` from the composed stage, including collision geometry, units, scenes, groups, mass properties, joints, drives, mimic relationships and unsupported-feature diagnostics. Mesh shapes use ordinary glTF `mesh` indices; other values use JSON. Original USD units and identities are retained. |
| `bindings` | Array of `{node, path, body?, instance?}`. `node` is a glTF node index; `path` is the composed USD identity. Optional `body` is the explicit owning body path; optional `instance` retains the resolver's instance identity. Several visuals may share a prototype path. |
| `usdMetadata` | Additional semantic data: authored stage metadata (including `customLayerData`), schema identifiers, typed properties not already represented by the runtime snapshot, authored property metadata, connections, samples, relationships and variant choices/selections. Render material face lists, shader inputs and schema UI/default descriptions are excluded. Custom material semantics and nonvisual physical properties are retained. |
| `mappingIssues` | USD features retained by the Needle contract without an exact Khronos projection. |

`stageNode` and `bindings[].node` are glTF node indices. For mesh shapes,
`snapshot.shapes[].mesh` references an ordinary glTF mesh with POSITION and
optional indices; `points` and `indices` are not serialized in the snapshot.
The loader resolves the mesh through GLTFLoader into ordinary snapshot arrays.
Collision positions stay in their source local frame; `meshScale` remains in
the snapshot and is also applied to the portable collider node. Supported
Khronos colliders share the same collision mesh. SDF colliders retain their
source mesh and USD approximation settings without a fake triangle projection.
Convex point clouds use standard point primitives. Collision meshes have no
visual materials or UVs and are outside the render scene unless a portable
physics node references them. Positions must round-trip exactly through glTF
FLOAT/VEC3; export rejects higher precision rather than silently rounding it.
Snapshot relationships and instance identities use USD paths and must not be
reinterpreted as glTF indices. Optimizers must retain referenced nodes, their
frames and semantic data; remap indices when writing. Collision meshes
are independent of visual meshes and may be outside the render scenes.

No source USD, layer text, original render mesh or backup texture package is
embedded. `usdMetadata` has `{version:1,time,stage,prims}`. Each prim has
`{path,type,active?,metadata?,attributes?,relationships?,variants?}`. Empty fields
are omitted and active defaults to true. Attributes carry
`{name,type,value,metadata?,connections?,default?,samples?}`; samples are
`{time,value}` records. Relationships carry `{name,metadata,targets}`. USD paths
remain identities and do not require index remapping. Nonfinite numbers use
`{$usdNumber:"Infinity"|"-Infinity"|"NaN"}`; big integers use
`{$usdInteger:"<decimal>"}`. Values unavailable as structured JS are retained as
`{$usdValue:"<USD value text>"}` together with the attribute's USD type.

This exports the composed configuration. Variant choices and selections are
descriptive metadata; alternate geometry and source-layer editing are not
reconstructed from them. Unknown schemas and sampled properties remain explicit
metadata available to applications; their execution requires a matching
implementation. The current physics and mechanism solvers operate on the
exported snapshot and report their limitations.

## Khronos projection

The export also declares draft `KHR_physics_rigid_bodies` and, when needed,
`KHR_implicit_shapes`. Rigid-body nodes carry motion, mass, inertia and velocity
data. Child collider nodes carry analytic shapes or collision-only mesh
references. Separate joint frame nodes describe fixed, revolute, prismatic and
unlimited spherical joints, with supported limits and drives. Physical scalar
values are converted to SI, while the stage root maps geometric coordinates.
`KHR_implicit_shapes` covers analytic planes, boxes, spheres, capsules and
cylinders/cones; it does not define arbitrary SDF mesh colliders.

The Khronos projection is not a complete USD serialization. The Needle snapshot
remains authoritative for simulation owners, sleep state, density inheritance,
collision groups/filter relationships, mimic joints, break thresholds, runtime
limitations and other USD-specific behavior. Typed schema metadata retains
semantic data beyond the snapshot. The public physics draft can evolve independently; a change
to this snapshot contract or interpretation requires an extension version change.

Primary specifications: [glTF physics draft](https://github.com/eoineoineoin/glTF_Physics/blob/master/extensions/2.0/Khronos/KHR_physics_rigid_bodies/README.md),
[implicit shapes](https://github.com/eoineoineoin/glTF_Physics/blob/master/extensions/2.0/Khronos/KHR_implicit_shapes/README.md),
[NVIDIA SimReady physics](https://docs.omniverse.nvidia.com/simready/latest/sim-needs/phys-and-behaviors.html).

MaterialX and arbitrary shader graphs are not native glTF PBR materials. The
portable visual export projects their exposed PBR properties and textures onto
a physical material, records that approximation in `mappingIssues`, and retains
custom material semantics and nonvisual properties. The source shader graph is
not duplicated into metadata. This is not an arbitrary-shader appearance bake.
Per-instance color is retained independently when expanding instances.

## Loading and operating the result

```js
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {registerSimreadyLoader} from '@needle-tools/simready/gltf';

const gltf = await registerSimreadyLoader(new GLTFLoader()).loadAsync('/assembly.glb');
scene.add(gltf.scene);
const runtime = gltf.userData.simready;
const mechanism = await runtime.createMechanism();
mechanism.setJointValue('/Assembly/Hinge', 45); // degrees; sliders use USD units
// mechanism.dispose();
// const simulation = await runtime.createSimulation({rapier: initializedRapier});
// simulation.play(); simulation.update(deltaSeconds); simulation.dispose();
// const schemaData = runtime.usdMetadata;
```

Loading attaches the runtime without starting or downloading a solver. Mechanism
creation dynamically loads the existing joint solver; simulation uses a supplied
Rapier module. Dispose the active controller before switching. Simulation rejects
unsupported features by default. Explicit partial simulation retains the existing
adapter's diagnostics. Mechanism control retains its existing supported joint,
mimic and closed-loop behavior and reports limitations.

Register this loader explicitly in a downstream glTF consumer. The Needle Engine
USD plugin only handles USD loading; it does not register glTF extensions.
The glTF loader is exported by `@needle-tools/simready/gltf`; the USD `/gltf`
entry only exports conversion from USD.
USD Viewer keeps its existing file-loading routes and does not activate a
SimReady runtime for glTF inputs. Mesh Effects `useLoader` can register the same
handler through its optional SimReady peer. No second physics implementation is involved.

## Regression workflow

```sh
node --test usd-wasm/tests/hydra/simready-gltf.test.mjs
node usd-wasm/scripts/export-simready-fixture.mjs /tmp/assembly.glb
node usd-wasm/scripts/test-baker-simready.mjs /path/to/baker
cd usd-wasm
npx playwright test -c tests/public-viewer/simready-gltf.config.ts
```

The cross-repository gate compares native USD simulation against the optimized
GLB in the same simulator, checks structured semantic metadata without embedding
source USD, exercises limits and attached-part motion, and loads
through automatic Mesh Effects registration. It requires matching feature
checkouts or packed artifacts of USD and SimReady; earlier published USD packages
do not necessarily include this entry point.
