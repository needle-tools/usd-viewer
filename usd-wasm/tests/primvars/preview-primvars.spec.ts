import { expect, test } from '@playwright/test';

const base = `/@fs${new URL('../..', import.meta.url).pathname.replace(/\/$/, '')}`;

for (const fixture of ['custom_vertex_geomprops', 'custom_geomprops_usdshade', 'referenced_geomprop_overrides', 'geomprop_float_constant', 'geomprop_float_uniform', 'geomprop_float_vertex', 'geomprop_float_varying', 'geomprop_color_facevarying', 'geomprop_color_indexed', 'geomprop_vector_vertex', 'geomprop_vector_indexed']) {
    test(`Shader primvar readers render ${fixture}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto('/preview-primvars.html');
        await page.waitForFunction(() => !!window.previewPrimvarThree);
        const result = await page.evaluate(async ({ fixture, base }) => {
            const THREE = window.previewPrimvarThree;
            const { getUsdModule } = await import(`${base}/src/bindings/index.js`);
            const { createThreeHydra } = await import(`${base}/src/create.three.js`);
            const USD = await getUsdModule();
            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0.9, 0.9, 0.9);
            scene.add(new THREE.AmbientLight(0xffffff, 2));
            const light = new THREE.DirectionalLight(0xffffff, 2);
            light.position.set(0, 2, 5);
            scene.add(light);
            const root = new THREE.Group();
            scene.add(root);
            const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('canvas')! });
            renderer.setSize(640, 320);
            const handle = await createThreeHydra({ USD, scene: root, renderer,
                url: `${base}/tests/fixtures/${fixture.startsWith('geomprop_') ? 'coverage/shading' : 'usd-concepts'}/${fixture}.usda` });
            try {
                await handle.ready();
                await handle.materialsReady();
                const bounds = new THREE.Box3().setFromObject(root);
                const center = bounds.getCenter(new THREE.Vector3());
                const size = bounds.getSize(new THREE.Vector3());
                const camera = new THREE.OrthographicCamera(-size.x * 0.6, size.x * 0.6, size.x * 0.3, -size.x * 0.3, 0.01, 100);
                camera.position.copy(center).add(new THREE.Vector3(0, 0, 10));
                camera.lookAt(center);
                renderer.render(scene, camera);
                const gl = renderer.getContext();
                const pixels = new Uint8Array(640 * 320 * 4);
                gl.readPixels(0, 0, 640, 320, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let coloredPixels = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 20) coloredPixels++;
                }
                const meshes: any[] = [];
                root.traverse(object => {
                    if (!object.isMesh) return;
                    meshes.push({ name: object.name, geomprops: Object.fromEntries(
                        Object.entries(object.geometry.attributes).filter(([name]) => name.startsWith('i_geomprop_'))
                            .map(([name, attribute]) => [name, Array.from(attribute.array)])), bindings: Object.fromEntries(
                        (object.material.userData.usdPreviewPrimvars || []).map(binding => [binding.input,
                            Array.from(object.geometry.getAttribute(binding.attribute).array)])) });
                });
                return { meshes, coloredPixels, triangles: renderer.info.render.triangles };
            } finally {
                await handle.dispose();
                renderer.dispose();
            }
        }, { fixture, base });
        await testInfo.attach('render', { body: await page.screenshot(), contentType: 'image/png' });
        expect(errors).toEqual([]);
        expect(result.triangles).toBeGreaterThan(0);
        expect(result.coloredPixels).toBeGreaterThan(1000);
        if (fixture === 'custom_vertex_geomprops') {
            const colors = result.meshes[0].bindings.diffuseColor;
            expect(colors).toHaveLength(18 * 3);
            expect(colors[0]).toBeCloseTo(0.05);
            expect(colors[1]).toBeCloseTo(0.2);
            expect(colors[2]).toBeCloseTo(0.85);
            expect(new Set(colors).size).toBeGreaterThan(10);
        } else if (fixture === 'custom_geomprops_usdshade') {
            const warm = result.meshes.find(mesh => mesh.name === 'WarmPrimvars').bindings;
            const cool = result.meshes.find(mesh => mesh.name === 'CoolPrimvars').bindings;
            expect(warm.roughness[0]).toBeCloseTo(0.18);
            expect(cool.roughness[0]).toBeCloseTo(0.82);
            expect(warm.metallic[0]).toBeCloseTo(0.95);
            expect(cool.metallic[0]).toBeCloseTo(0.35);
            expect(warm.diffuseColor[0]).toBeCloseTo(1);
            expect(cool.diffuseColor[2]).toBeCloseTo(1);
        } else if (fixture.startsWith('geomprop_')) {
            const values = result.meshes.find(mesh => mesh.name === 'Artifact').geomprops.i_geomprop_finish;
            expect(values.length).toBeGreaterThan(100);
            if (fixture === 'geomprop_float_constant') {
                expect(values[0]).toBeCloseTo(0.65);
                expect(new Set(values).size).toBe(1);
            } else if (fixture.startsWith('geomprop_float_')) {
                expect(new Set(values).size).toBeGreaterThan(100);
                expect(Math.min(...values)).toBeCloseTo(0);
                expect(Math.max(...values)).toBeCloseTo(1);
            } else {
                const palette = [...new Set(values)].sort((a, b) => a - b);
                const expected = [0.02, 0.03, 0.12, 0.15, 0.4, 0.45, 0.5, 0.6, 0.7, 0.95];
                expect(palette).toHaveLength(expected.length);
                palette.forEach((value, index) => expect(value).toBeCloseTo(expected[index]));
            }
        } else {
            const roughness = result.meshes.map(mesh => mesh.bindings.roughness[0]).sort();
            expect(roughness[0]).toBeCloseTo(0.18);
            expect(roughness[1]).toBeCloseTo(0.72);
            expect(result.meshes.some(mesh => Math.abs(mesh.bindings.diffuseColor[2] - 1) < 0.001)).toBe(true);
        }
    });
}
