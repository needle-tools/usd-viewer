import { defineConfig } from '@playwright/test';

const runHeaded = process.env.USD_VIEWER_VISUAL_HEADED === '1';

export default defineConfig({
    testDir: '.',
    // Tests are independent. Without this, a file's tests run one after another in a
    // single worker, and the large lifecycle file alone set the suite's duration.
    fullyParallel: true,
    // Each worker is a Chrome with WebGL/WebGPU; more than a few slow the machine down.
    // USD_TEST_WORKERS raises or lowers the limit.
    workers: Number(process.env.USD_TEST_WORKERS) || 3,
    // Fail fast. A test that genuinely needs longer says so with test.slow().
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    reporter: [['line'], ['json', {outputFile: 'test-results/report.json'}]],
    use: {
        baseURL: 'http://127.0.0.1:5199',
        channel: 'chrome',
        headless: !runHeaded,
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
        // Existing workspace tests exercise Studio. Product-mode tests start
        // with empty storage to cover the first-visit Viewer experience.
        storageState: { cookies: [], origins: [{origin: 'http://127.0.0.1:5199', localStorage: [
            {name: 'needle-usd-product-mode', value: JSON.stringify('studio')},
        ]}] },
    },
    webServer: {
        command: 'npm run prepare:public && PORT=5199 npm run start',
        cwd: '../../..',
        port: 5199,
        // Always start the server from the current tree; a reused one can serve stale code.
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
