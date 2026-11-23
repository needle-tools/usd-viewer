const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function viewerBuild(root, revision = process.env.SOURCE_COMMIT) {
  const viewer = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const sdk = JSON.parse(readFileSync(join(root, 'usd-wasm', 'package.json'), 'utf8'));
  return {
    viewerVersion: viewer.version,
    sdkVersion: sdk.version,
    ...(/^[a-f0-9]{40}$/i.test(revision || '') && { revision }),
  };
}

exports.viewerBuild = viewerBuild;
