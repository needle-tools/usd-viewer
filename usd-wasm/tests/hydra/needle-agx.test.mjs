import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AgXToneMapping, ACESFilmicToneMapping, ShaderChunk } from 'three';
import NodeLibrary from 'three/src/renderers/common/nodes/NodeLibrary.js';
import { configureNeedleAgx, needleAgxToneMapping } from '../../src/renderers/needleAgx.js';

test('Needle AgX replaces only the renderer-local AgX mapping without modifying GLSL or display settings', () => {
  const first = new NodeLibrary(), second = new NodeLibrary();
  const existing = () => {}, aces = () => {};
  first.addToneMapping(existing, AgXToneMapping); second.addToneMapping(existing, AgXToneMapping);
  first.addToneMapping(aces, ACESFilmicToneMapping);
  const renderer = {library:first, toneMapping:ACESFilmicToneMapping, toneMappingExposure:2};
  const glsl = ShaderChunk.tonemapping_pars_fragment;
  assert.equal(configureNeedleAgx(renderer), true);
  assert.equal(configureNeedleAgx(renderer), true);
  assert.equal(first.getToneMappingFunction(AgXToneMapping), needleAgxToneMapping);
  assert.equal(first.getToneMappingFunction(ACESFilmicToneMapping), aces);
  assert.equal(second.getToneMappingFunction(AgXToneMapping), existing);
  assert.equal(renderer.toneMapping, ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, 2);
  assert.equal(ShaderChunk.tonemapping_pars_fragment, glsl);
  assert.equal(configureNeedleAgx({isWebGLRenderer:true}), false);
});
