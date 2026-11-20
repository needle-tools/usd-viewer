import {
	BoxGeometry, BufferGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry,
	DoubleSide, EdgesGeometry, Float32BufferAttribute, Group, LineBasicMaterial,
	LineSegments, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3,
} from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';

const identity = [0, 0, 0, 1];
const zero = [0, 0, 0];
const vector = value => Array.isArray(value) ? new Vector3().fromArray(value) : new Vector3().copy(value);

function meshGeometry(points, indices, convex = false) {
	if (convex && !indices?.length) {
		const vertices = [];
		for (let i = 0; i < points.length; i += 3) vertices.push(new Vector3(points[i], points[i + 1], points[i + 2]));
		return new ConvexGeometry(vertices);
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
	if (indices?.length) geometry.setIndex(Array.from(indices));
	return geometry;
}

function sourceGeometry(shape) {
	switch (shape.type) {
		case 'cube': return new BoxGeometry(...shape.halfExtents.map(value => value * 2));
		case 'sphere': return new SphereGeometry(shape.radius, 20, 12);
		case 'capsule': return new CapsuleGeometry(shape.radius, shape.halfHeight * 2, 6, 16);
		case 'cylinder': return new CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 20);
		case 'cone': return new ConeGeometry(shape.radius, shape.halfHeight * 2, 20);
		case 'plane': return new PlaneGeometry(2, 2);
		case 'mesh': return meshGeometry(Array.from(shape.points || [], (value, i) => value * (shape.meshScale?.[i % 3] ?? 1)),
			shape.approximation === 'convexHull' ? null : shape.indices, shape.approximation === 'convexHull');
		default: return null;
	}
}

// Rapier's public shape types. Reading shapes does not load another physics runtime.
function nativeGeometry(shape) {
	switch (shape.type) {
		case 0: return new SphereGeometry(shape.radius, 20, 12);
		case 1: return new BoxGeometry(shape.halfExtents.x * 2, shape.halfExtents.y * 2, shape.halfExtents.z * 2);
		case 2: return new CapsuleGeometry(shape.radius, shape.halfHeight * 2, 6, 16);
		case 6: return meshGeometry(shape.vertices, shape.indices);
		case 9: return meshGeometry(shape.vertices, shape.indices, true);
		case 10: return new CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 20);
		case 11: return new ConeGeometry(shape.radius, shape.halfHeight * 2, 20);
		case 17: return new PlaneGeometry(2, 2);
		default: return null;
	}
}

/** Show source collision geometry or the active solver's shapes, including compound pieces. */
export function createColliderOverlay({parent, snapshot, simulation, nativeCollider, worldSpace = false}) {
	const group = new Group();
	group.name = 'Collision geometry';
	group.userData.usdExcludeFromBounds = true;
	group.userData.usdHelperFor = '/';
	group.userData.usdHelperPickable = false;
	if (worldSpace) group.matrixAutoUpdate = false;
	const faces = new MeshBasicMaterial({color: 0x35dc70, transparent: true, opacity: .04,
		depthTest: false, depthWrite: false, side: DoubleSide, toneMapped: false});
	const edges = new LineBasicMaterial({color: 0x25d95b, transparent: true, opacity: .75,
		depthTest: false, depthWrite: false, toneMapped: false});
	const geometries = [], bindings = [];
	const bodies = new Map((snapshot.bodies || []).map(body => [body.path, body]));
	function draw(geometry, holder, path) {
		if (!geometry) return;
		const outline = new EdgesGeometry(geometry, 20);
		geometries.push(geometry, outline);
		for (const object of [new Mesh(geometry, faces), new LineSegments(outline, edges)]) {
			Object.assign(object.userData, {usdHelperFor: path, usdHelperPickable: false, usdExcludeFromBounds: true});
			object.raycast = () => {};
			object.renderOrder = 10000;
			holder.add(object);
		}
	}
	function native(shape, holder, path) {
		if (shape.type === 8) {
			for (let i = 0; i < shape.shapes.length; i++) {
				const part = new Group();
				part.position.copy(shape.positions[i]); part.quaternion.copy(shape.rotations[i]);
				holder.add(part); native(shape.shapes[i], part, path);
			}
		} else {
			const local = new Group(); holder.add(local);
			if (shape.type === 17) local.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), vector(shape.normal));
			draw(nativeGeometry(shape), local, path);
		}
	}
	try {
		for (const shape of snapshot.shapes || []) {
			if (shape.collisionEnabled === false) continue;
			const collider = nativeCollider?.(shape.path);
			if (nativeCollider && !collider) continue;
			const holder = new Group(); group.add(holder);
			if (collider) {
				native(collider.shape, holder, shape.path);
				bindings.push(() => {holder.position.copy(collider.translation()); holder.quaternion.copy(collider.rotation());});
			} else {
				const geometry = sourceGeometry(shape), local = new Group(); holder.add(local);
				local.position.fromArray(shape.position || zero); local.quaternion.fromArray(shape.rotation || identity);
				if (['capsule', 'cylinder', 'cone'].includes(shape.type)) local.quaternion.multiply(new Quaternion().setFromUnitVectors(
					new Vector3(0, 1, 0), new Vector3(...(shape.axis === 'X' ? [1, 0, 0] : shape.axis === 'Z' ? [0, 0, 1] : [0, 1, 0]))));
				if (shape.type === 'plane') local.quaternion.multiply(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1),
					new Vector3(...(shape.axis === 'Y' ? [0, 1, 0] : shape.axis === 'Z' ? [0, 0, 1] : [1, 0, 0]))));
				draw(geometry, local, shape.path);
				const body = simulation?.bodies.get(shape.body)?.body, source = bodies.get(shape.body);
				bindings.push(() => {
					if (body) {holder.position.copy(body.translation()); holder.quaternion.copy(body.rotation());}
					else if (source) {holder.position.fromArray(source.position); holder.quaternion.fromArray(source.rotation);}
				});
			}
		}
		parent.add(group);
	} catch (error) {
		for (const geometry of geometries) geometry.dispose();
		faces.dispose(); edges.dispose(); throw error;
	}
	return {
		group,
		update() {
			if (worldSpace) {parent.updateWorldMatrix(true, false); group.matrix.copy(parent.matrixWorld).invert();}
			for (const update of bindings) update();
			group.updateWorldMatrix(true, true);
		},
		dispose() {group.removeFromParent(); for (const geometry of geometries) geometry.dispose(); faces.dispose(); edges.dispose();},
	};
}
