import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getUsdModule} from '../runtime.mjs';
import {readPreviewNetwork, layerRelativeAsset} from '../../src/hydra/previewNetwork.js';

test('interchange preview graphs retain forwarded inputs and layer-relative texture references', async () => {
	const USD = await getUsdModule();
	const path = '/tmp/preview-network.usda';
	const source = `#usda 1.0
def Material "Material" {
	color3f inputs:tint = (0.2, 0.4, 0.6)
	token outputs:surface.connect = </Material/PBR.outputs:surface>
	def Shader "PBR" {
		uniform token info:id = "UsdPreviewSurface"
		color3f inputs:diffuseColor.connect = </Material.inputs:tint>
		normal3f inputs:normal.connect = </Material/Graph.outputs:normal>
		token outputs:surface
	}
	def NodeGraph "Graph" {
		normal3f outputs:normal.connect = </Material/Texture.outputs:rgb>
	}
	def Shader "Texture" {
		uniform token info:id = "UsdUVTexture"
		asset inputs:file = @./textures/normal.png@
		token inputs:sourceColorSpace = "raw"
		float3 outputs:rgb
	}
}`;
	USD.FS_createDataFile('/tmp', 'preview-network.usda', new TextEncoder().encode(source), true, true);
	const stage = await USD.OpenStage(path);
	try {
		const network = await readPreviewNetwork(stage, '/Material', 0);
		assert.deepEqual(network.nodes['/Material/PBR'].diffuseColor.map(value => Math.round(value * 10) / 10), [.2, .4, .6]);
		assert.equal(network.nodes['/Material/Texture'].file, './textures/normal.png');
		assert.equal(network.nodes['/Material/Texture']['file:resolvedPath'], '/tmp/textures/normal.png');
		assert.deepEqual(network.relationships, [{inputId: '/Material/Texture', inputName: 'rgb', outputId: '/Material/PBR', outputName: 'normal'}]);
		assert.equal(await readPreviewNetwork(stage, '/Missing', 0), null);
	} finally {USD.ReleaseStage(stage); USD.FS_unlink(path);}
});

test('preview texture paths retain URL and package resolver anchors', () => {
	assert.equal(layerRelativeAsset('../textures/albedo.png', 'https://example.test/asset/materials/surface.usd'), 'https://example.test/asset/textures/albedo.png');
	assert.equal(layerRelativeAsset('../textures/a.png', '/asset.usdz[materials/surface.usd]'), '/asset.usdz[textures/a.png]');
	assert.equal(layerRelativeAsset('https://example.test/a.png', '/materials/a.usda'), 'https://example.test/a.png');
});
