import { defineConfig } from '@playwright/test';
import shared from '../three-matrix/playwright.config';

export default defineConfig({
    ...shared,
    testDir: '.',
    testMatch: 'preview-primvars.spec.ts',
    use: { ...shared.use, baseURL: 'http://127.0.0.1:5198' },
    webServer: {
        command: 'npx vite --config vite.config.js --host 127.0.0.1 --port 5198',
        port: 5198,
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
