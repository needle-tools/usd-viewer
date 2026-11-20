import { test, expect } from './test';

// Sample corresponding particle centers, not whole-frame differences: orbiting
// changes projection even if a renderer silently drops the directional bands.
test('Gaussian SH coefficients change color across opposing camera views', async ({ page }) => {
    await page.goto('/?viewer=three&file=/test-fixtures/coverage/advanced/splat-harmonics.usda');
    await page.waitForFunction(() => !!(window as any).usdHydra);
    // Measure the splats' radiance without the display transform, which compresses saturated colors.
    await page.evaluate(async () => { const w=window as any; await w.usdHydra.ready(); await w.usdHydra.materialsReady(); w.renderer.toneMapping=(await import('three')).NoToneMapping; });
    const state=await page.evaluate(()=>{const w=window as any;let mesh:any;w.scene.traverse((o:any)=>{if(o.userData?.usdGaussianData)mesh=o});
        const sh=mesh.splatGeometry.userData.usdSphericalHarmonics;return {count:mesh.userData.usdGaussianData.positions.length/3,degree:sh.degree,zBand:Array.from(sh.coefficients.slice(6,9))};});
    expect(state.count).toBe(18);expect(state.degree).toBe(1);
    // Authored non-power-of-two coefficients survive native transport at full precision
    // (Spark 2.1's encoder clipped 0.85 to 0.5).
    expect(state.zBand[0]).toBeCloseTo(-.85,5);
    expect(state.zBand[1]).toBeCloseTo(0,5);
    expect(state.zBand[2]).toBeCloseTo(.85,5);
    const samples=[];
    for(const side of [1,-1,1]) {
        const points=await page.evaluate(side=>{
            const w=window as any;
            w._controls.enabled=false;w._controls.enableDamping=false;w._controls.target.set(0,0,0);
            w.camera.fov=45;w.camera.updateProjectionMatrix();w.camera.position.set(0,0,6*side);w.camera.lookAt(0,0,0);w.camera.updateMatrixWorld(true);w._controls.update();
            let mesh:any;w.scene.traverse((o:any)=>{if(o.userData?.usdGaussianData)mesh=o});mesh.updateWorldMatrix(true,false);
            return Array.from({length:18},(_,i)=>{const a=i*Math.PI*2/18;const p=mesh.position.clone().set(Math.cos(a)*1.2,Math.sin(a)*1.2,.2*Math.sin(i*3));mesh.localToWorld(p);p.project(w.camera);return [p.x,p.y];});
        },side);
        await page.waitForTimeout(350);
        const screenshot=await page.locator('canvas.usd-viewer-three-canvas').screenshot({path:`.cache/coverage-validation/sh-view-${side}.png`});
        samples.push(await page.evaluate(async ({base64,points})=>{
            const im=await createImageBitmap(await(await fetch('data:image/png;base64,'+base64)).blob());const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d')!;ctx.drawImage(im,0,0);const rgb=[0,0,0];
            for(const p of points){const x=Math.round((p[0]+1)*im.width/2),y=Math.round((1-p[1])*im.height/2);const d=ctx.getImageData(x-1,y-1,3,3).data;for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++)rgb[k]+=d[i+k]/(9*points.length);}return rgb;
        },{base64:screenshot.toString('base64'),points}));
    }
    console.log('SH opposing-view RGB',JSON.stringify(samples));
    // The z band (-0.85, 0, 0.85) gives linear R ≈ 0.91 and B ≈ 0.09 facing the camera, swapped
    // from behind. At opacity 0.8 over the light background that is about 244 and 137 in sRGB;
    // without the directional bands R and B would be equal.
    expect(samples[0][0]-samples[0][2]).toBeGreaterThan(100);
    expect(samples[1][2]-samples[1][0]).toBeGreaterThan(100);
    expect(Math.abs(samples[0][1]-samples[1][1])).toBeLessThan(3);
    expect(Math.max(...samples[0].map((v,i)=>Math.abs(v-samples[2][i])))).toBeLessThan(2);
});
