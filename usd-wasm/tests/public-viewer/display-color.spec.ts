import { expect, test } from './test';
import { readFileSync } from 'node:fs';

// Read the authored palette, not values derived from the renderer under test.
const source = readFileSync(new URL('../fixtures/coverage/curved-surfaces/subdivision-playground.usda', import.meta.url), 'utf8');
const palette = Object.fromEntries([...source.matchAll(/def Mesh "([^"]+)"\s*\{([\s\S]*?)\n    \}/g)].map(([, name, body]) => {
    const value = body.match(/primvars:displayColor = \[\(([^)]+)\)\]/)![1];
    return [`/World/${name}`, value.split(',').map(Number)];
}));

for (const viewer of ['three', 'needle']) test(`${viewer}: subdivision playground preserves every unbound display color`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/?viewer=${viewer}&file=/test-fixtures/coverage/curved-surfaces/subdivision-playground.usda`);
    await page.waitForFunction(() => !!(window as any).usdHydra);
    const colors = await page.evaluate(async () => {
        const w = window as any, handle = w.usdHydra;
        await handle.ready(); await handle.materialsReady(); handle.setPlaying(false);
        if (w._controls) { w._controls.enableDamping = false; w._controls.autoRotate = false; }
        const result: Record<string, number[]> = {};
        handle.scene.traverse((object: any) => {
            if (object.isMesh && object.userData.usdPath) result[object.userData.usdPath] = object.material.color.toArray();
        });
        return result;
    });
    expect(Object.keys(colors)).toHaveLength(17);
    for (const [path, expected] of Object.entries(palette)) {
        for (let channel = 0; channel < 3; channel++) expect(colors[path][channel], path).toBeCloseTo(expected[channel], 6);
    }
    const canvas = page.locator(viewer === 'three' ? 'canvas.usd-viewer-three-canvas' : 'needle-engine canvas').first();
    await page.waitForTimeout(200);
    const colored = await canvas.screenshot({ path: testInfo.outputPath('authored-palette.png') });
    // Actual GPU oracle: removing the palette must change substantial surface pixels.
    await page.evaluate(() => (window as any).usdHydra.scene.traverse((object: any) => {
        if (object.isMesh && object.userData.usdPath) object.material.color.setRGB(0.5, 0.5, 0.5);
    }));
    await page.waitForTimeout(200);
    const neutral = await canvas.screenshot({ path: testInfo.outputPath('neutral-comparison.png') });
    const changed = await page.evaluate(async ([a, b]) => {
        async function pixels(base64: string) {
            const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + base64)).blob());
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height).data;
        }
        const colored = await pixels(a), neutral = await pixels(b); let count = 0;
        for (let i = 0; i < colored.length; i += 4) {
            if (Math.abs(colored[i] - neutral[i]) + Math.abs(colored[i + 1] - neutral[i + 1]) + Math.abs(colored[i + 2] - neutral[i + 2]) > 25) count++;
        }
        return count;
    }, [colored.toString('base64'), neutral.toString('base64')]);
    console.log(viewer, 'display-color surface pixels', changed);
    expect(changed).toBeGreaterThan(5000);
    expect(errors).toEqual([]);
});
