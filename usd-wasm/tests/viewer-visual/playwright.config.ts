import { defineConfig } from '@playwright/test';
import { webgpuDefaults } from '@needle-tools/three-test-matrix';

const useBundledChromium = process.env.USD_VIEWER_VISUAL_BROWSER === 'chromium';
const runHeaded = process.env.USD_VIEWER_VISUAL_HEADED === '1';
const useOptions = {
    ...webgpuDefaults.playwright,
    baseURL: 'http://127.0.0.1:5193',
    headless: !runHeaded,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
};

if (useBundledChromium) {
    delete useOptions.channel;
}

export default defineConfig({
    testDir: '.',
    snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
    timeout: 180_000,
    expect: {
        timeout: 45_000,
        toMatchSnapshot: {
            maxDiffPixelRatio: 0.04,
            threshold: 0.22,
        },
    },
    use: useOptions,
    webServer: {
        command: 'npm --prefix examples run dev -- --host 127.0.0.1 --port 5193',
        cwd: '../..',
        port: 5193,
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
