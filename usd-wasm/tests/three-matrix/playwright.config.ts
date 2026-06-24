import { defineConfig } from '@playwright/test';
import { webgpuDefaults } from '@needle-tools/three-test-matrix';

const useBundledChromium = process.env.USD_THREE_MATRIX_BROWSER === 'chromium';
const runHeaded = process.env.USD_THREE_MATRIX_HEADED === '1';
const useOptions = {
    ...webgpuDefaults.playwright,
    baseURL: 'http://127.0.0.1:5192',
    headless: !runHeaded,
};

if (useBundledChromium) {
    delete useOptions.channel;
}

export default defineConfig({
    testDir: '.',
    timeout: 900_000,
    expect: {
        timeout: 60_000,
    },
    use: useOptions,
    webServer: {
        command: 'npx vite --config vite.config.js --host 127.0.0.1 --port 5192',
        port: 5192,
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
