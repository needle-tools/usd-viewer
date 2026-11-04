import { cpSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import './prepare-static-assets.mjs';
import './prepare-kinematics.mjs';
import moduleVersions from './module-versions.js';

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

const copies = [
  { from: join(root, 'node_modules', '@needle-tools', 'simready', 'src'), to: join(root, 'public', 'simready'), label: '/simready' },
  { from: join(root, 'node_modules', 'three-mesh-bvh', 'build', 'index.umd.cjs'), to: join(root, 'public', 'modules', 'mesh-bvh.umd.js'), label: '/modules/mesh-bvh.umd.js' },
  { from: join(root, 'node_modules', 'dockview-core', 'dist'), to: join(root, 'public', 'dockview'), label: '/dockview' },
  ...['three-gpu-pathtracer', 'three-mesh-bvh'].map(name => ({ from: join(root, 'node_modules', name), to: join(root, 'public', name), label: '/' + name })),
  { from: join(root, "node_modules", "@meimu", "mutracer"), to: join(root, "public", "mutracer"), label: "/mutracer" },
  { from: join(root, "node_modules", "oidn-webgpu"), to: join(root, "public", "oidn-webgpu"), label: "/oidn-webgpu" },
  {
    from: join(root, 'node_modules', '@dimforge', 'rapier3d-compat', 'dist'),
    to: join(root, 'public', 'rapier'),
    label: '/rapier',
  },
  {
    from: join(root, "usd-wasm", "src"),
    to: join(root, "public", "usd"),
    label: "/usd",
  },
  {
    from: join(root, "node_modules", "@needle-tools", "materialx"),
    to: join(root, "public", "materialx"),
    label: "/materialx",
  },
  {
    from: join(root, "usd-wasm", "tests", "fixtures"),
    to: join(root, "public", "test-fixtures"),
    label: "/test-fixtures",
  },
];

for (const copy of copies) {
  if (!existsSync(copy.from)) {
    throw new Error(`Missing ${copy.from}. Run npm install before preparing ${copy.label}.`);
  }
  rmSync(copy.to, { recursive: true, force: true });
  cpSync(copy.from, copy.to, {
    recursive: true,
    dereference: true,
    filter(source) {
      if (copy.label === '/rapier') {
        return source === copy.from || source === join(copy.from, 'rapier.mjs') || source === join(copy.from, 'package.json');
      }
      const relativeSource = source.startsWith(copy.from) ? source.slice(copy.from.length) : source;
      if (copy.label === '/test-fixtures' && (
        /validation\.json$/.test(relativeSource)
        || /[\\/]lighting-mdl[\\/]references[\\/]mdl-[^\\/]+\.json$/.test(relativeSource)
      )) return false;
      return !relativeSource.split(/[\\/]/).includes("node_modules")
        && !(source.endsWith("/dist") && copy.label !== "/oidn-webgpu" && copy.label !== "/dockview")
        && !source.endsWith("/.DS_Store");
    },
  });
  console.log(`Prepared ${copy.label}: ${copy.to}`);
}

// Static uploads use the same versioned imports as the local server.
writeFileSync(join(root,'public/viewer-module-versions.json'),JSON.stringify(await moduleVersions.createModuleVersions(root)())+'\n');
