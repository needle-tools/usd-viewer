import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {Group, Raycaster, Vector3} from 'three';
import {getUsdModule} from '../../src/bindings/index.js';
import {createThreeHydra} from '../../src/create.three.js';

const source = await readFile(new URL('../fixtures/coverage/curved-surfaces/animated-subdivision-buddies.usda', import.meta.url));
for (const complexity of ['very-high', 'adaptive']) {
    test(`${complexity}: animated subdivision tags and holes seek independently and restore`, async () => {
        const USD = await getUsdModule({print() {}, printErr() {}}), scene = new Group();
        const handle = await createThreeHydra({USD, scene, buffer: source, url: `animated-subdivision-${complexity}.usda`, complexity});
        function mesh(path) {
            let result;
            scene.traverse(object => {if (object.isMesh && object.userData.usdPath === path) result = object;});
            assert.ok(result, path);
            return result;
        }
        function positions(path) {
            const array = mesh(path).geometry.attributes.position.array;
            let radius = 0;
            for (let i = 0; i < array.length; i += 3)
                radius = Math.max(radius, Math.hypot(array[i], array[i+1], array[i+2]));
            return {hash:createHash('sha256').update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)).digest('hex'), radius};
        }
        // Local ray stops inside the shell: the back wall and the separate glow
        // cannot conceal whether the animated front-left eye face is present.
        function eyeHits() {
            scene.updateMatrixWorld(true);
            const shell = mesh('/World/Pip/Shell');
            const from = new Vector3(-.36, .36, 2).applyMatrix4(shell.matrixWorld);
            const to = new Vector3(-.36, .36, .5).applyMatrix4(shell.matrixWorld);
            return new Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to)).intersectObject(shell, false).length;
        }
        try {
            await handle.ready();
            assert.equal(handle.driver.GetAdaptiveSubdivision(), complexity === 'adaptive');
            await handle.setTime(1);
            const smooth = positions('/World/Pop/Morph');
            assert.equal(eyeHits(), 0, 'left eye starts open');
            await handle.setTime(25);
            assert.ok(eyeHits() > 0, 'held hole indices close the left eyelid');
            await handle.setTime(33);
            assert.equal(eyeHits(), 0, 'left eye opens again');
            await handle.setTime(61);
            const sharp = positions('/World/Pop/Morph');
            assert.notEqual(sharp.hash, smooth.hash, 'the stationary control cage must change through crease/corner tags alone');
            assert.ok(sharp.radius > smooth.radius + .2, 'sharp cube expands to its authored corners');
            for (const path of ['/World/Pop/Morph', '/World/Pip/Shell']) {
                const geometry = mesh(path).geometry;
                for (const attribute of ['position', 'normal']) assert.ok(geometry.attributes[attribute].array.every(Number.isFinite));
            }
            await handle.setTime(1);
            assert.deepEqual(positions('/World/Pop/Morph'), smooth, 'backward seek restores the original shape');
            assert.equal(eyeHits(), 0);
            await handle.setTime(121);
            assert.deepEqual(positions('/World/Pop/Morph'), smooth, 'loop endpoint has the original subdivision shape');
        } finally {await handle.dispose();}
    });
}

// Exercise each varying attribute separately. A changing transform, hole or
// another tag must not incidentally make an otherwise frozen crease look right.
for (const complexity of ['very-high', 'adaptive']) for (const tag of [
    'creaseIndices', 'creaseLengths', 'creaseSharpnesses', 'cornerIndices', 'cornerSharpnesses',
]) {
    test(`${complexity}: ${tag} alone invalidates the rendered subdivision`, async () => {
        const defaults = {
            creaseIndices: '[0,1,3,5,7,6]', creaseLengths: '[2,4]', creaseSharpnesses: '[0,0]',
            cornerIndices: '[0]', cornerSharpnesses: '[0]',
        };
        const samples = {
            creaseIndices: ['[0,1,3,2,0]', '[6,7,5,4,6]'],
            creaseLengths: ['[2,4]', '[4,2]'],
            creaseSharpnesses: ['[0,0]', '[4,4]'],
            cornerIndices: ['[0]', '[7]'],
            cornerSharpnesses: ['[0]', '[4]'],
        };
        if (tag === 'creaseIndices') {defaults.creaseLengths = '[5]'; defaults.creaseSharpnesses = '[4]';}
        if (tag === 'creaseLengths') defaults.creaseSharpnesses = '[4,4]';
        if (tag === 'cornerIndices') defaults.cornerSharpnesses = '[4]';
        const attributes = Object.entries(defaults).map(([name, value]) => {
            const type = name.endsWith('Sharpnesses') ? 'float[]' : 'int[]';
            return name === tag ? `${type} ${name}.timeSamples={1:${samples[tag][0]},2:${samples[tag][1]}}` : `${type} ${name}=${value}`;
        });
        const buffer = new TextEncoder().encode(`#usda 1.0
(startTimeCode=1;endTimeCode=2)
def Mesh "Morph" {
 point3f[] points=[(-.5,-.5,.5),(.5,-.5,.5),(-.5,.5,.5),(.5,.5,.5),(-.5,.5,-.5),(.5,.5,-.5),(-.5,-.5,-.5),(.5,-.5,-.5)]
 int[] faceVertexCounts=[4,4,4,4,4,4]
 int[] faceVertexIndices=[0,1,3,2,2,3,5,4,4,5,7,6,6,7,1,0,1,7,5,3,6,0,2,4]
 ${attributes.join('\n ')}
}`);
        const USD = await getUsdModule({print() {}, printErr() {}}), scene = new Group();
        const handle = await createThreeHydra({USD, scene, buffer, url: `animated-${tag}-${complexity}.usda`, complexity});
        const state = () => {
            const mesh = scene.children.find(object => object.isMesh), array = mesh.geometry.attributes.position.array;
            assert.ok(array.every(Number.isFinite));
            return createHash('sha256').update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
        };
        try {
            await handle.ready();
            assert.equal(handle.driver.GetAdaptiveSubdivision(), complexity === 'adaptive');
            await handle.setTime(1); const first = state();
            await handle.setTime(2); assert.notEqual(state(), first, tag);
            await handle.setTime(1); assert.equal(state(), first, `${tag}: backward seek`);
        } finally {await handle.dispose();}
    });
}
