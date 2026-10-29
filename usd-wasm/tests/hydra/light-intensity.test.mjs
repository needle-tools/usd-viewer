import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lightIntensity} from '../../src/hydra/lightIntensity.js';
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('sphere luminance scales with projected area; normalization preserves power as radius changes', () => {
  for (const radius of [0.1, 0.5, 2]) {
    close(lightIntensity({intensity:40, radius}, 'sphereLight').intensity, 40 * Math.PI * radius ** 2);
    close(lightIntensity({intensity:40, radius, normalize:true}, 'sphereLight').intensity, 10);
  }
});
test('rectangle normalization accounts for world-space area and Three dimensions include USD scale', () => {
  const transform = [2,0,0,0, 0,3,0,0, 0,0,4,0, 5,6,7,1];
  const value = lightIntensity({intensity:120,width:2,height:5,transform,normalize:true}, 'rectLight');
  assert.deepEqual([value.width,value.height], [4,15]); close(value.intensity,2);
  close(lightIntensity({intensity:120,width:2,height:5,transform}, 'rectLight').intensity,120);
});
test('disk rectangle approximation preserves power and normalized power is radius independent', () => {
  for (const radius of [0.1, 1, 3]) {
    const ordinary = lightIntensity({intensity:80,radius}, 'diskLight');
    close(ordinary.intensity * ordinary.width * ordinary.height, 80 * Math.PI * radius ** 2);
    const normalized = lightIntensity({intensity:80,radius,normalize:true}, 'diskLight');
    close(normalized.intensity * normalized.width * normalized.height,80);
  }
});
test('distant angular size converts luminance to illuminance, normalized lux remain constant', () => {
  for (const angle of [0,0.53,10,180,270,360]) {
    const theta = angle * Math.PI / 360;
    const size = angle === 0 ? 1 : Math.PI * (theta <= Math.PI / 2 ? Math.sin(theta) ** 2 : 2 - Math.sin(theta) ** 2);
    close(lightIntensity({intensity:50000,angle}, 'distantLight').intensity,50000*size);
    close(lightIntensity({intensity:50000,angle,normalize:true}, 'distantLight').intensity,50000);
  }
});
test('cylinder approximation conserves total power while dimensions and normalization change', () => {
  for (const radius of [0.1,0.5]) for (const length of [1,4]) {
    close(lightIntensity({intensity:20,radius,length}, 'cylinderLight').intensity,20*2*Math.PI*radius*length/4);
    close(lightIntensity({intensity:20,radius,length,normalize:true}, 'cylinderLight').intensity,5);
  }
});
test('shaped area lights keep candela consistent with area and normalization', () => {
  close(lightIntensity({intensity:50,width:2,height:3},'rectLight',true).intensity,300);
  close(lightIntensity({intensity:50,width:2,height:3,normalize:true},'rectLight',true).intensity,50);
});
test('invalid or degenerate data remains finite, and zero light stays dark', () => {
  for (const type of ['sphereLight','rectLight','diskLight','distantLight','cylinderLight']) {
    assert.equal(lightIntensity({intensity:0},type).intensity,0);
    assert.ok(Number.isFinite(lightIntensity({intensity:5,radius:0,width:0,height:0,normalize:true},type).intensity));
  }
});
