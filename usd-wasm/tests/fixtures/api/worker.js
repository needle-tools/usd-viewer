import { getUsdModule } from '/usd/bindings/index.js';
import { replExamples, apiExampleAssets } from './examples.js';
import { testAssetLibrary, fixtureUrl } from '../test-asset-library.js';
import { executeExample } from './execute.js';

self.onmessage = async ({ data: id }) => {
  try {
    const index = apiExampleAssets.findIndex(asset => asset.executable === id);
    if (index < 0) throw new Error(`Unknown API example: ${id}`);
    const USD = await getUsdModule({ print() {}, printErr: message => console.warn(message), setStatus() {} });
    const result = await executeExample(USD, replExamples[index], {
      fixtureCatalog: testAssetLibrary,
      async readFixture(path) {
        const response = await fetch(fixtureUrl(path));
        if (!response.ok) throw new Error(`Could not load ${path}: HTTP ${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
      },
    });
    self.postMessage({ result }, result.files.map(file => file.bytes.buffer));
  } catch (error) {
    self.postMessage({ error: error?.message || String(error) });
  }
};
