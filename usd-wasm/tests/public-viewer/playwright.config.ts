import { defineConfig } from '@playwright/test';

const runHeaded = process.env.USD_VIEWER_VISUAL_HEADED === '1';

export default defineConfig({
    testDir: '.',
    timeout: 180_000,
    expect: {
        timeout: 60_000,
    },
    use: {
        baseURL: 'http://127.0.0.1:5199',
        channel: 'chrome',
        headless: !runHeaded,
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
    },
    webServer: {
        command: 'PORT=5199 npm run start',
        cwd: '../../..',
        port: 5199,
        reuseExistingServer: true,
        timeout: 30_000,
    },
});
