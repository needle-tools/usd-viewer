import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStageSourcePaths} from '../../src/scene/source-paths.js';

test('public paths use the root folder and round-trip dependencies above it', () => {
  const base = '/tmp/hdEmscripten-http/5/url-0/1/1/1/1/1/1/';
  const root = 'https://example.com/assets/model/scene.usda';
  const paths = createStageSourcePaths(base + 'scene.usda', {resolveUrl: path =>
    path.startsWith(base) ? new URL(path.slice(base.length), root).href :
      path === '/tmp/hdEmscripten-http/5/url-1/1/1/1/1/1/1/normal.png' ? 'https://example.com/Some/Folder/Textures/normal.png' : ''});
  assert.equal(paths.path(base + 'scene.usda'), 'scene.usda');
  assert.equal(paths.path(base + 'Textures/normal.png'), 'Textures/normal.png');
  const parent = '/tmp/hdEmscripten-http/5/url-1/1/1/1/1/1/1/normal.png';
  assert.equal(paths.path(parent), '../../Some/Folder/Textures/normal.png');
  assert.equal(paths.resolve('../../Some/Folder/Textures/normal.png'), parent);
  assert.equal(paths.resolve('Textures/new.png'), base + 'Textures/new.png');
  assert.equal(paths.path('https://elsewhere.test/normal.png'), 'https://elsewhere.test/normal.png');
});

test('local paths preserve duplicate filenames, parent traversal and authored directory names', () => {
  const paths = createStageSourcePaths('/needle/7/shot/scene.usda');
  for (const path of ['geo/shared.usda', 'looks/shared.usda', '../../textures/normal.png', '1/1/Textures/a.png']) {
    assert.equal(paths.path(paths.resolve(path)), path);
  }
  assert.equal(paths.path('/needle/7/shot/geo/../Textures/a.png'), 'Textures/a.png');
});

test('package member paths round-trip inside nested archives', () => {
  const paths = createStageSourcePaths('/needle/3/asset.usdz[shot/scene.usda]');
  assert.equal(paths.path('/needle/3/asset.usdz[Textures/a.png]'), 'asset.usdz[Textures/a.png]');
  assert.equal(paths.resolve('asset.usdz[Textures/a.png]'), '/needle/3/asset.usdz[Textures/a.png]');
  assert.equal(paths.path('/needle/3/Textures/a.png'), 'Textures/a.png');
  assert.equal(paths.resolve('Textures/a.png'), '/needle/3/Textures/a.png');
  const nested = createStageSourcePaths('/needle/3/asset.usdz[geo.usdz[mesh.usda]]');
  assert.equal(nested.path('/needle/3/asset.usdz[geo.usdz[Textures/a.png]]'), 'asset.usdz[geo.usdz[Textures/a.png]]');
  assert.equal(nested.resolve('asset.usdz[geo.usdz[Textures/a.png]]'), '/needle/3/asset.usdz[geo.usdz[Textures/a.png]]');
});

test('HTTP paths retain URL encoding, signed queries and ordinary brackets', () => {
  const paths = createStageSourcePaths('https://example.test/shot/scene.usda?token=a');
  for (const suffix of ['Textures/a%20b.png?token=b', '../looks/a%2Fb.usda', 'image%5B1%5D.png', 'normal.png?filter[]=x']) {
    const url = new URL(suffix, 'https://example.test/shot/scene.usda').href;
    assert.equal(paths.path(url), suffix);
    assert.equal(paths.resolve(suffix), url);
  }
});

test('Sdf-normalized HTTP identifiers remain navigable URLs', () => {
  const paths = createStageSourcePaths('https:/example.test/shot/root.usda');
  assert.equal(paths.path('https:/example.test/shot/root.usda'), 'root.usda');
  assert.equal(paths.path('https:/example.test/Textures/normal.png'), '../Textures/normal.png');
  assert.equal(paths.resolve('../Textures/normal.png'), 'https:/example.test/Textures/normal.png');
  assert.equal(paths.resolve('extras/new.txt'), 'https://example.test/shot/extras/new.txt');
});

test('relative MEMFS identities do not duplicate the root mount or escape public round trips',()=>{
  const native='needle/7/https:__assets.example_Archive.usdz';
  const source='https://assets.example/Archive.usdz';
  const paths=createStageSourcePaths(native,{resolveUrl:path=>path==='/'+native?source:''});
  assert.equal(paths.path(native),'Archive.usdz');
  assert.equal(paths.path('/'+native),'Archive.usdz');
  const member=native+'[Textures/normal.png]';
  const publicPath=paths.path(member);
  assert.equal(publicPath,'Archive.usdz[Textures/normal.png]');
  assert.equal(paths.path(publicPath),publicPath);
  assert.equal(paths.resolve(publicPath),'/'+member);
  assert.equal(paths.path('needle/7/Textures/normal.png'),'Textures/normal.png');
});
