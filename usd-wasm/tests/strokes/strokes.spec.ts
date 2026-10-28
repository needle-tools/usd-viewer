import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const base = `/@fs${new URL('../..', import.meta.url).pathname.replace(/\/$/, '')}`;
for (const fixture of ['core/points-widths', 'advanced/point-velocities', 'core/bezier-curves', 'advanced/periodic-bspline', 'advanced/nurbs-curve', 'advanced/nurbs-patch']) {
    test(`USD primitive renders ${fixture}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
        await page.goto('/strokes.html');
        await page.waitForFunction(() => !!window.strokeThree);
        const result = await page.evaluate(async ({ fixture, base }) => {
            const THREE = window.strokeThree;
            const { getUsdModule } = await import(`${base}/src/bindings/index.js`);
            const { createThreeHydra } = await import(`${base}/src/create.three.js`);
            const USD = await getUsdModule();
            const scene = new THREE.Scene(); scene.background = new THREE.Color(0.05, 0.05, 0.05);
            scene.add(new THREE.AmbientLight(0xffffff, 2));
            const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(0, 3, 5); scene.add(light);
            const root = new THREE.Group(); scene.add(root);
            const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')! }); renderer.setSize(512, 512);
            const handle = await createThreeHydra({ USD, scene: root, renderer, url: `${base}/tests/fixtures/coverage/${fixture}.usda` });
            try {
                await handle.ready(); await handle.materialsReady();
                const bounds = new THREE.Box3().setFromObject(root), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
                const radius = Math.max(size.x, size.y, size.z) * 0.65;
                const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, .01, 100);
                camera.position.copy(center).add(fixture.endsWith('nurbs-patch') ? new THREE.Vector3(3, 6, 5) : new THREE.Vector3(0, 0, 10)); camera.lookAt(center);
                renderer.render(scene, camera);
                const gl = renderer.getContext(), pixels = new Uint8Array(512 * 512 * 4);
                gl.readPixels(0, 0, 512, 512, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let visiblePixels = 0, coloredPixels = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 100) visiblePixels++;
                    if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 25) coloredPixels++;
                }
                const primitives: any[] = [];
                root.traverse(object => { if (object.userData.usdPrimitiveType) primitives.push({type: object.userData.usdPrimitiveType, count: object.count, samples: object.geometry.userData.usdCurveSamples, widths: object.userData.usdStrokeData.primvars.widths?.values, colors: object.instanceColor ? [...object.instanceColor.array] : undefined, error: object.userData.usdStrokeError }); });
                window.strokeCapture = renderer.domElement.toDataURL();
                return { visiblePixels, coloredPixels, triangles: renderer.info.render.triangles, primitives };
            } finally { await handle.dispose(); renderer.dispose(); }
        }, { fixture, base });
        expect(errors).toEqual([]);
        expect(result.visiblePixels).toBeGreaterThan(500);
        expect(result.triangles).toBeGreaterThan(100);
        expect(result.primitives).toHaveLength(1);
        expect(result.primitives[0].error).toBeUndefined();
        if (fixture === 'advanced/nurbs-patch') expect(result.primitives[0].type).toBe('nurbsPatch');
        if (fixture === 'core/points-widths') {
            expect(result.primitives[0].count).toBe(4);
            expect(result.primitives[0].widths).toEqual([expect.closeTo(.35), .5, expect.closeTo(.35), .5]);
        }
        if (fixture === 'advanced/point-velocities') {
            expect(result.primitives[0].count).toBe(12);
            expect(result.coloredPixels).toBeGreaterThan(500);
        }
        const capture = await page.evaluate(() => window.strokeCapture);
        const capturePath = testInfo.outputPath('render.png');
        await writeFile(capturePath, Buffer.from(capture.split(',')[1], 'base64'));
        await writeFile(testInfo.outputPath('result.json'), JSON.stringify(result, null, 2));
        await testInfo.attach('render', { path: capturePath, contentType: 'image/png' });
    });
}
