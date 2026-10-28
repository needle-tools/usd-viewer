import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeSparkShRgb, packSparkSphericalHarmonics } from '../../src/hydra/sparkSphericalHarmonics.js';

// Decode the published texture layout used by Spark's GLSL decodeExtRgb.
function decode(word) {
    const unit = 2 ** ((word >>> 27) - 15) / 255;
    return [0, 1, 2].map(channel => ((word >>> (channel * 8)) & 255) * unit * ((word & (1 << (24 + channel))) ? -1 : 1));
}

test('SH quantization preserves signed coefficients between powers of two', () => {
    for (const rgb of [[0,0,0], [.1,-.07,.02], [-.85,.3,.61], [1.9,-2.7,.45], [1,-.5,.25]]) {
        const actual = decode(encodeSparkShRgb(...rgb));
        const tolerance = Math.max(2 ** -15, 2 ** Math.ceil(Math.log2(Math.max(...rgb.map(Math.abs)) || 1))) / 510;
        actual.forEach((value, channel) => assert.ok(Math.abs(value-rgb[channel]) <= tolerance + 1e-8, `${rgb}: channel ${channel} decoded ${value}`));
    }
});

test('all 15 directional RGB coefficients retain their order across degree-2 and degree-3 textures', () => {
    const coefficients = new Float32Array(2 * 16 * 3);
    for (let i=0;i<coefficients.length;i++) coefficients[i] = (i%2 ? -1 : 1) * (i+1)/100;
    const extra=Object.fromEntries(['sh1','sh2','sh3a','sh3b'].map(key=>[key,new Uint32Array(8)]));
    for(let particle=0;particle<2;particle++) packSparkSphericalHarmonics(extra,particle,coefficients,particle*48,3);
    for(let particle=0;particle<2;particle++) {
        const at=particle*4;
        const words=[...extra.sh1.slice(at,at+4),...extra.sh2.slice(at,at+4),...extra.sh3a.slice(at,at+4),...extra.sh3b.slice(at,at+3)];
        for(let coefficient=1;coefficient<=15;coefficient++) decode(words[coefficient-1]).forEach((value,channel)=>assert.ok(Math.abs(value-coefficients[particle*48+coefficient*3+channel])<.004, `particle ${particle}, coefficient ${coefficient}, channel ${channel}`));
    }
});
