import { writeFileSync } from 'node:fs';
import { kinematicsAssets } from './kinematics-assets.mjs';

for (const [name, contents] of kinematicsAssets) {
  writeFileSync(new URL('../public/modules/' + name, import.meta.url), contents);
}
