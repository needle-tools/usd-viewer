import { defineConfig } from '@playwright/test';
import shared from '../three-matrix/playwright.config';

export default defineConfig({
    ...shared,
    testDir: '.',
    testMatch: 'strokes.spec.ts',
    use: { ...shared.use, baseURL: 'http://127.0.0.1:5199' },
    webServer: {
        command: 'npx vite --config vite.config.js --host 127.0.0.1 --port 5199',
        port: 5199,
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
