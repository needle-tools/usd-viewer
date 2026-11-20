/** Hold floating assemblies and isolated rigid assets without changing their USD data. */
export function holdAssemblyBases(snapshot, {scenePath} = {}) {
	const scene = scenePath ? snapshot.scenes?.find(item => item.path === scenePath) : snapshot.scenes?.[0];
	const bodies = new Map((snapshot.bodies || []).filter(body => body.simulationOwners?.length
		? scene && body.simulationOwners.includes(scene.path)
		: !scene || scene === snapshot.scenes[0]).map(body => [body.path, body]));
	const edges = new Map([...bodies.keys()].map(path => [path, []]));
	const worldAnchored = new Set();
	const incoming = new Map();
	const isolatedAsset = bodies.size === 1 && !(snapshot.scenes || []).length
		&& !(snapshot.shapes || []).some(shape => !shape.body && shape.collisionEnabled !== false);
	for (const joint of snapshot.joints || []) {
		if (joint.jointEnabled === false) continue;
		const {body0, body1} = joint;
		if (body0 && !bodies.has(body0) || body1 && !bodies.has(body1)) continue;
		if (body0 && body1) {
			edges.get(body0).push(body1);
			edges.get(body1).push(body0);
			incoming.set(body1, (incoming.get(body1) || 0) + 1);
		} else if (body0 || body1) worldAnchored.add(body0 || body1);
	}
	const authoredRoots = new Set((snapshot.articulations || []).flatMap(item => item.rootPrims || []));
	const visited = new Set();
	const roots = [];
	for (const path of bodies.keys()) {
		if (visited.has(path)) continue;
		const component = [];
		const pending = [path];
		while (pending.length) {
			const next = pending.pop();
			if (visited.has(next)) continue;
			visited.add(next);
			component.push(next);
			pending.push(...edges.get(next));
		}
		// Loose bodies in physics scenes still follow their physics. Existing world anchors,
		// static bodies and kinematic bodies already hold their whole component.
		if ((component.length < 2 && !isolatedAsset) || component.some(id => worldAnchored.has(id)
			|| bodies.get(id).rigidBodyEnabled === false || bodies.get(id).kinematicBody)) continue;
		component.sort((a, b) => Number(authoredRoots.has(b)) - Number(authoredRoots.has(a))
			|| (incoming.get(a) || 0) - (incoming.get(b) || 0) || a.localeCompare(b));
		roots.push(component[0]);
	}
	if (!roots.length) return {snapshot, roots};
	const held = new Set(roots);
	return {snapshot: {...snapshot, bodies: snapshot.bodies.map(body => held.has(body.path)
		? {...body, kinematicBody: true, linearVelocity: [0, 0, 0], angularVelocity: [0, 0, 0]} : body)}, roots};
}

/** Match ordinary Engine bodies when an asset does not specify damping. */
export function withViewerDamping(snapshot) {
	return {...snapshot, bodies: snapshot.bodies.map(body => ({
		...body,
		linearDamping: body.linearDamping ?? 0,
		angularDamping: body.angularDamping ?? 1,
	}))};
}
