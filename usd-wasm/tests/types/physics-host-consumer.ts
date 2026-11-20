import type { Object3D } from 'three';
import type { NeedleThreeHydraHandle } from '@needle-tools/usd';
import { createUsdPhysics } from '@needle-tools/usd/physics';
import type { Simulation, SimulationHost } from '@needle-tools/simready/rapier';

type HostAsset = Omit<Simulation, 'world' | 'bodyForObject'> & {
    readonly components: ReadonlyMap<string, { enabled: boolean }>;
    bodyForObject(object: unknown, instanceIndex?: number): unknown;
};

declare const handle: NeedleThreeHydraHandle;
declare const host: SimulationHost<HostAsset> & { readonly kilogramsPerUnit: number };
declare const object: Object3D;

const simulation = await createUsdPhysics({ handle, world: host });
simulation.components.get('/Body')?.enabled;
simulation.root.updateMatrixWorld();
simulation.bodyForObject(object)?.body.translation();
simulation.play();
simulation.dispose();

// @ts-expect-error The host owns its raw world; the imported asset does not expose one.
simulation.world;
// @ts-expect-error Engine-style host adapters accept simulation, not interaction mode.
await createUsdPhysics({ handle, world: host, mode: 'interaction' });
// @ts-expect-error A raw backend object is not a simulation host adapter.
await createUsdPhysics({ handle, world: {} });
