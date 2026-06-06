import { defineConfig } from '@playwright/test';
import { webgpuDefaults } from '@needle-tools/three-test-matrix';

export default defineConfig({
    testDir: '.',
    timeout: 900_000,
    expect: {
        timeout: 60_000,
    },
    use: {
        ...webgpuDefaults.playwright,
        baseURL: 'http://127.0.0.1:5192',
    },
    webServer: {
        command: 'npx vite --config vite.config.js --host 127.0.0.1 --port 5192',
        port: 5192,
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
