import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { buildNurbsPatchGeometry, evaluateNurbsPatch, prepareNurbsPatch } from '../../src/hydra/nurbsPatchGeometry.js';

const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const dome = { uCount: 4, vCount: 4, uOrder: 4, vOrder: 4,
    uKnots: [0,0,0,0,1,1,1,1], vKnots: [0,0,0,0,1,1,1,1],
    points: Array.from({length:16}, (_, i) => { const u = i % 4, v = Math.floor(i / 4); return [u - 1.5, u > 0 && u < 3 && v > 0 && v < 3 ? .375 : 0, v - 1.5]; }) };

test('NURBS patch evaluates its surface rather than the Catmull-Clark control cage', () => {
    const patch = prepareNurbsPatch(dome);
    const center = evaluateNurbsPatch(patch, .5, .5);
    near(center.position.y, .2109375);
    const sample = evaluateNurbsPatch(patch, .25, .5);
    near(sample.position.x, -.75); near(sample.position.y, .158203125);
    near(sample.du.x, 3); near(sample.du.y, .421875); near(sample.dv.z, 3);
    const geometry = buildNurbsPatchGeometry({...dome, subdivisions:32});
    assert.equal(geometry.attributes.position.count, 33 * 33);
    const p = geometry.attributes.position, n = geometry.attributes.normal, idx = geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
        const a = new Vector3().fromBufferAttribute(p, idx[i]);
        const b = new Vector3().fromBufferAttribute(p, idx[i + 1]);
        const c = new Vector3().fromBufferAttribute(p, idx[i + 2]);
        const face = b.sub(a).cross(c.sub(a)).normalize();
        for (const j of idx.slice(i, i + 3)) assert.ok(face.dot(new Vector3().fromBufferAttribute(n, j)) > .998);
    }
    near(n.getY(16 * 33 + 16), -1);
    geometry.dispose();
});

test('asymmetric rational patch preserves U-fast ordering and analytic cylinder normals', () => {
    const data = { uCount:3, vCount:2, uOrder:3, vOrder:2, uKnots:[0,0,0,1,1,1], vKnots:[0,0,1,1],
        points:[[1,0,0],[1,1,0],[0,1,0],[1,0,2],[1,1,2],[0,1,2]], weights:[1,Math.SQRT1_2,1,1,Math.SQRT1_2,1] };
    const patch = prepareNurbsPatch(data), sample = evaluateNurbsPatch(patch, .5, .25);
    near(sample.position.x, Math.SQRT1_2); near(sample.position.y, Math.SQRT1_2); near(sample.position.z, .5);
    const normal = sample.du.clone().cross(sample.dv).normalize();
    near(normal.x, Math.SQRT1_2); near(normal.y, Math.SQRT1_2); near(normal.z, 0);
    for (const axis of ['u','v']) {
        const epsilon = 1e-6;
        const lower = evaluateNurbsPatch(patch, .5 - (axis === 'u' ? epsilon : 0), .25 - (axis === 'v' ? epsilon : 0));
        const upper = evaluateNurbsPatch(patch, .5 + (axis === 'u' ? epsilon : 0), .25 + (axis === 'v' ? epsilon : 0));
        assert.ok(upper.position.sub(lower.position).divideScalar(2 * epsilon).distanceTo(sample[axis === 'u' ? 'du' : 'dv']) < 1e-8);
    }
    const trimmedRange = buildNurbsPatchGeometry({...data,uRange:[.25,.75],vRange:[.25,.75]});
    near(trimmedRange.attributes.position.getZ(0), .5);
    near(trimmedRange.attributes.position.getZ(trimmedRange.attributes.position.count - 1), 1.5);
    trimmedRange.dispose();
});

test('patch orientation reverses both normals and winding; invalid/trimmed patches fail explicitly', () => {
    const right = buildNurbsPatchGeometry(dome), left = buildNurbsPatchGeometry({...dome,orientation:'leftHanded'});
    assert.deepEqual([...left.index.array.slice(0,3)], [right.index.array[0],right.index.array[2],right.index.array[1]]);
    near(right.attributes.normal.getY(8 * 17 + 8), -left.attributes.normal.getY(8 * 17 + 8));
    assert.throws(() => prepareNurbsPatch({...dome, uKnots:[0,1]}), /Invalid NURBS/);
    assert.throws(() => prepareNurbsPatch({...dome, trimCounts:[1]}), /Trimmed NURBS/);
    right.dispose(); left.dispose();
});

test('multispan patch samples every nonzero knot span and preserves rational control primvars', () => {
    const data={uCount:5,vCount:2,uOrder:3,vOrder:2,uKnots:[0,0,0,1,2,3,3,3],vKnots:[0,0,1,1],
      points:Array.from({length:10},(_,i)=>[i%5,Math.sin(i%5),Math.floor(i/5)]),
      weights:[1,2,1,2,1,1,2,1,2,1],primvars:{displayColor:{interpolation:'vertex',values:Array.from({length:10},(_,i)=>[i%5/4,0,0])}}};
    const geometry=buildNurbsPatchGeometry(data),samples=geometry.userData.usdNurbsSamples;
    assert.equal(samples.u.length,49);assert.equal(samples.v.length,17);
    assert.ok(samples.u.includes(1)&&samples.u.includes(2));
    for(let i=0;i<geometry.attributes.position.count;i++) near(geometry.attributes.color.getX(i),geometry.attributes.position.getX(i)/4);
    geometry.dispose();
});
