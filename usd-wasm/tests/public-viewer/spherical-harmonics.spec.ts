import { test, expect } from './test';

// Sample corresponding particle centers, not whole-frame differences: orbiting
// changes projection even if a renderer silently drops the directional bands.
test('Gaussian SH coefficients change color across opposing camera views', async ({ page }) => {
    await page.goto('/?viewer=three&file=/test-fixtures/coverage/advanced/splat-harmonics.usda');
    await page.waitForFunction(() => !!(window as any).usdHydra);
    await page.evaluate(async () => { const w=window as any; await w.usdHydra.ready(); await w.usdHydra.materialsReady(); });
    const state=await page.evaluate(()=>{const w=window as any;let mesh:any;w.usdRoot.traverse((o:any)=>{if(o.extSplats)mesh=o});return {count:mesh.extSplats.numSplats,degree:mesh.extSplats.getNumSh(),sh1:Array.from(mesh.extSplats.extra.sh1.slice(0,4))};});
    expect(state.count).toBe(18);expect(state.degree).toBe(1);
    // Verify authored non-power-of-two coefficients survived native transport
    // and texture quantization; Spark 2.1's encoder clipped 0.85 to 0.5.
    const zBand=state.sh1[1] as number;
    expect((zBand>>>24)&7).toBe(1);
    const unit=2 ** ((zBand>>>27)-15)/255;
    expect(-(zBand&255)*unit).toBeCloseTo(-.85,2);
    expect(((zBand>>>16)&255)*unit).toBeCloseTo(.85,2);
    const samples=[];
    for(const side of [1,-1,1]) {
        const points=await page.evaluate(side=>{
            const w=window as any;
            w._controls.enabled=false;w._controls.enableDamping=false;w._controls.target.set(0,0,0);
            w.camera.fov=45;w.camera.updateProjectionMatrix();w.camera.position.set(0,0,6*side);w.camera.lookAt(0,0,0);w.camera.updateMatrixWorld(true);w._controls.update();
            let mesh:any;w.usdRoot.traverse((o:any)=>{if(o.extSplats)mesh=o});mesh.updateWorldMatrix(true,false);
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
    expect(samples[0][0]-samples[0][2]).toBeGreaterThan(150);
    expect(samples[1][2]-samples[1][0]).toBeGreaterThan(150);
    expect(Math.abs(samples[0][1]-samples[1][1])).toBeLessThan(3);
    expect(Math.max(...samples[0].map((v,i)=>Math.abs(v-samples[2][i])))).toBeLessThan(2);
});
