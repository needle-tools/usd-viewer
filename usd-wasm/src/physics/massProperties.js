import { Matrix4, Quaternion, Vector3 } from 'three';

const vec = value => Array.isArray(value) || ArrayBuffer.isView(value)
    ? new Vector3().fromArray(value) : new Vector3().copy(value);
const quat = value => Array.isArray(value) || ArrayBuffer.isView(value)
    ? new Quaternion().fromArray(value) : new Quaternion().copy(value);

/**
 * Move a computed inertia tensor to an authored center of mass, following
 * UsdPhysicsMassProperties::TranslateInertia. Inputs share one body-local,
 * scale-free frame; mass and diagonalInertia must already use the same units.
 * Returns Rapier-compatible diagonal moments and their local principal frame.
 */
export function shiftInertiaToCenterOfMass(diagonalInertia, principalAxes, mass, oldCenterOfMass, newCenterOfMass) {
    const diagonal = vec(diagonalInertia);
    const frame = quat(principalAxes);
    const delta = vec(newCenterOfMass).sub(vec(oldCenterOfMass));
    if (![...diagonal.toArray(), ...frame.toArray(), ...delta.toArray(), mass].every(Number.isFinite)
        || mass < 0 || diagonal.toArray().some(value => value < 0) || frame.lengthSq() === 0) {
        throw new RangeError('Inertia translation requires finite mass properties, nonnegative moments and a valid principal frame.');
    }
    frame.normalize();
    if (mass === 0 || delta.lengthSq() === 0) return { diagonalInertia: diagonal, principalAxes: frame };

    const rotation = new Matrix4().makeRotationFromQuaternion(frame).elements;
    const moments = diagonal.toArray(), displacement = delta.toArray();
    const tensor = new Array(9).fill(0);
    // R diag(I) R^T + m (|d|² identity - d d^T), stored row-major.
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
        for (let axis = 0; axis < 3; axis++) tensor[row * 3 + col] += rotation[axis * 4 + row] * moments[axis] * rotation[axis * 4 + col];
        tensor[row * 3 + col] += mass * ((row === col ? delta.lengthSq() : 0) - displacement[row] * displacement[col]);
    }

    // Jacobi rotations diagonalize this symmetric 3x3 matrix. Accumulating
    // rotations preserves a right-handed orthonormal principal frame, including
    // repeated eigenvalues. No eigenvalue sorting/sign convention is required.
    const basis = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let iteration = 0; iteration < 32; iteration++) {
        let p = 0, q = 1;
        for (const [row, col] of [[0, 2], [1, 2]]) {
            if (Math.abs(tensor[row * 3 + col]) > Math.abs(tensor[p * 3 + q])) { p = row; q = col; }
        }
        const offDiagonal = tensor[p * 3 + q];
        const scale = Math.max(Math.abs(tensor[0]), Math.abs(tensor[4]), Math.abs(tensor[8]));
        if (Math.abs(offDiagonal) <= Number.EPSILON * 32 * scale) break;
        const tau = (tensor[q * 3 + q] - tensor[p * 3 + p]) / (2 * offDiagonal);
        const tangent = (tau < 0 ? -1 : 1) / (Math.abs(tau) + Math.hypot(1, tau));
        const cosine = 1 / Math.hypot(1, tangent), sine = tangent * cosine;
        tensor[p * 3 + p] -= tangent * offDiagonal;
        tensor[q * 3 + q] += tangent * offDiagonal;
        tensor[p * 3 + q] = tensor[q * 3 + p] = 0;
        for (let k = 0; k < 3; k++) {
            if (k !== p && k !== q) {
                const kp = tensor[k * 3 + p], kq = tensor[k * 3 + q];
                tensor[k * 3 + p] = tensor[p * 3 + k] = cosine * kp - sine * kq;
                tensor[k * 3 + q] = tensor[q * 3 + k] = sine * kp + cosine * kq;
            }
            const kp = basis[k * 3 + p], kq = basis[k * 3 + q];
            basis[k * 3 + p] = cosine * kp - sine * kq;
            basis[k * 3 + q] = sine * kp + cosine * kq;
        }
    }
    const principalMatrix = new Matrix4().set(
        basis[0], basis[1], basis[2], 0,
        basis[3], basis[4], basis[5], 0,
        basis[6], basis[7], basis[8], 0,
        0, 0, 0, 1,
    );
    return {
        diagonalInertia: new Vector3(Math.max(0, tensor[0]), Math.max(0, tensor[4]), Math.max(0, tensor[8])),
        principalAxes: new Quaternion().setFromRotationMatrix(principalMatrix).normalize(),
    };
}
