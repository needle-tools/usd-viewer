const { cpSync, existsSync, readFileSync, rmSync } = require('node:fs');
const { join, resolve } = require('node:path');

function sparkRuntime(root) {
  if (process.env.USD_VIEWER_SPARK === '0') return;
  const packageDirectory = resolve(root, process.env.USD_VIEWER_SPARK_PACKAGE || 'node_modules/@ludicon/spark.js');
  const distribution = join(packageDirectory, 'dist');
  const license = join(packageDirectory, 'LICENSE');
  if (!existsSync(join(distribution, 'spark.esm.js')) || !existsSync(license)) {
    throw new Error('Missing spark.js runtime or license. Run npm ci or check USD_VIEWER_SPARK_PACKAGE.');
  }
  return { distribution, license };
}

function prepareSparkRuntime(root, publicDirectory) {
  const runtime = sparkRuntime(root);
  const output = join(publicDirectory, 'spark-textures');
  rmSync(output, { recursive: true, force: true });
  if (runtime) {
    cpSync(runtime.distribution, output, { recursive: true });
    cpSync(runtime.license, join(output, 'LICENSE'));
  }
  return !!runtime;
}

function viewerBuild(root, { revision = process.env.SOURCE_COMMIT, sparkTextures = false } = {}) {
  const viewer = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const sdk = JSON.parse(readFileSync(join(root, 'usd-wasm', 'package.json'), 'utf8'));
  return {
    viewerVersion: viewer.version,
    sdkVersion: sdk.version,
    ...(sparkTextures && { sparkTextures: true }),
    ...(/^[a-f0-9]{40}$/i.test(revision || '') && { revision }),
  };
}

exports.viewerBuild = viewerBuild;
exports.sparkRuntime = sparkRuntime;
exports.prepareSparkRuntime = prepareSparkRuntime;
