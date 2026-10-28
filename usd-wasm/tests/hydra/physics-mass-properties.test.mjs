import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Quaternion, Vector3 } from 'three';
import { shiftInertiaToCenterOfMass } from '../../src/physics/massProperties.js';

const close = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
function rotationalEnergy(moments, frame, omega) {
    const local = omega.clone().applyQuaternion(frame.clone().invert());
    return moments.x * local.x ** 2 + moments.y * local.y ** 2 + moments.z * local.z ** 2;
}
function checkEnergy(moments, frame, mass, from, to, tolerance = 1e-10) {
    const result = shiftInertiaToCenterOfMass(moments, frame, mass, from, to);
    const delta = to.clone().sub(from);
    // Independent quadratic-form oracle: angular kinetic energy plus the
    // point-mass term m |d × omega|². Mixed axes exercise off-diagonal terms.
    for (const omega of [...axes, new Vector3(1, 1, 0), new Vector3(1, -2, 3), new Vector3(-.3, .7, 1.1)]) {
        const expected = rotationalEnergy(moments, frame, omega) + mass * delta.clone().cross(omega).lengthSq();
        close(rotationalEnergy(result.diagonalInertia, result.principalAxes, omega), expected, tolerance * Math.max(expected, 1e-30));
    }
    close(result.principalAxes.length(), 1);
    close(result.diagonalInertia.x + result.diagonalInertia.y + result.diagonalInertia.z,
        moments.x + moments.y + moments.z + 2 * mass * delta.lengthSq(), tolerance * Math.max(moments.length(), mass * delta.lengthSq(), 1e-30));
    assert.ok(result.diagonalInertia.toArray().every(value => Number.isFinite(value) && value >= 0));
    return result;
}

test('moving a cube center of mass applies the parallel-axis theorem', () => {
    const result = shiftInertiaToCenterOfMass([4/3, 4/3, 4/3], [0, 0, 0, 1], 2, [0, 0, 0], [1, 0, 0]);
    result.diagonalInertia.toArray().forEach((value, i) => close(value, [4/3, 10/3, 10/3][i]));
    close(result.principalAxes.angleTo(new Quaternion()), 0);
});

test('rotated asymmetric inertia and oblique COM offsets retain every tensor component', () => {
    for (let i = 1; i <= 20; i++) {
        const frame = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), i * .137);
        checkEnergy(new Vector3(1.3, 2.7, 4.2), frame, .3 + i * .2,
            new Vector3(2, -1, 3), new Vector3(-.4, 2.3, i * .11));
    }
});

test('tensor translation is covariant under body-frame rotation', () => {
    const moments = new Vector3(2, 3, 5), frame = new Quaternion().setFromAxisAngle(axes[2], .65);
    const from = new Vector3(.2, -.3, 1), to = new Vector3(-.4, .8, .1);
    const turn = new Quaternion().setFromAxisAngle(new Vector3(2, -1, 3).normalize(), 1.2);
    const original = checkEnergy(moments, frame, 2.5, from, to);
    const rotated = checkEnergy(moments, turn.clone().multiply(frame), 2.5, from.clone().applyQuaternion(turn), to.clone().applyQuaternion(turn));
    for (const omega of axes) close(
        rotationalEnergy(original.diagonalInertia, original.principalAxes, omega),
        rotationalEnergy(rotated.diagonalInertia, rotated.principalAxes, omega.clone().applyQuaternion(turn)), 1e-10);
});

test('degenerate tensors and very small stage-unit moments stay finite and accurate', () => {
    checkEnergy(new Vector3(), new Quaternion(), 2, new Vector3(), new Vector3(1, 2, 3));
    checkEnergy(new Vector3(1e-20, 2e-20, 3e-20), new Quaternion(), 4e-20, new Vector3(), new Vector3(.2, -.3, .1));
    const frame = new Quaternion().setFromAxisAngle(axes[1], .4), moments = new Vector3(2, 3, 4);
    const unchanged = shiftInertiaToCenterOfMass(moments, frame, 5, [1, 2, 3], [1, 2, 3]);
    assert.deepEqual(unchanged.diagonalInertia.toArray(), moments.toArray());
    close(unchanged.principalAxes.angleTo(frame), 0);
    assert.deepEqual(moments.toArray(), [2, 3, 4], 'caller values are not mutated');
});
