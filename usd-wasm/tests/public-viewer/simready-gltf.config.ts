import {defineConfig} from '@playwright/test';
import base from './playwright.config';
const port=Number(process.env.USD_SIMREADY_TEST_PORT||5207);
export default defineConfig(base,{
 testMatch:['simready-gltf.spec.ts','download-component.spec.ts','download.spec.ts','runtime-imports.spec.ts','workbench.spec.ts','workbench-layout.spec.ts','examples-presentation.spec.ts'],workers:1,expect:{timeout:15000},
 use:{baseURL:`http://127.0.0.1:${port}`,actionTimeout:10000,storageState:{cookies:[],origins:[{origin:`http://127.0.0.1:${port}`,localStorage:[{name:'needle-usd-product-mode',value:JSON.stringify('studio')}]}]}},
 webServer:{command:`node scripts/prepare-kinematics.mjs && PORT=${port} npm start`,cwd:'../../..',port,reuseExistingServer:false,timeout:180000},
});
