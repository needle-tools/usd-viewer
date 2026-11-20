import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Vector2} from 'three';
import {isUdimPath,udimPath,matchUdimTiles,udimLayout} from '../../src/hydra/udim.js';

test('UDIM discovery retains sparse tiles and supports encoded URL tokens',()=>{
 assert.equal(isUdimPath('https://assets.test/color.%3CUDIM%3E.png'),true);
 assert.equal(udimPath('color.<UDIM>.png',1011),'color.1011.png');
 assert.deepEqual(matchUdimTiles('color.%3CUDIM%3E.png',['/textures/color.1001.png','/textures/color.1013.png','/textures/color.1003.png','/textures/color.1101.png','/textures/other.1001.png','/textures/color.abc.png']).map(t=>t.tile),[1001,1003,1013]);
 assert.deepEqual(matchUdimTiles('/needle/1/left/color.<UDIM>.png',['left/color.1001.png','right/color.1001.png']).map(t=>t.path),['left/color.1001.png']);
});

test('UDIM atlas coordinates preserve horizontal, vertical and sparse offsets',()=>{
 const layout=udimLayout([{tile:1003},{tile:1014}]);
 assert.deepEqual([layout.minU,layout.minV,layout.columns,layout.rows],[2,0,2,2]);
 assert.deepEqual(new Vector2(2,0).applyMatrix3(layout.matrix).toArray(),[0,0]);
 assert.deepEqual(new Vector2(4,2).applyMatrix3(layout.matrix).toArray(),[1,1]);
 assert.deepEqual(new Vector2(3.5,1.5).applyMatrix3(layout.matrix).toArray(),[.75,.75]);
 assert.throws(()=>udimLayout([]),/no available tiles/);
});
