import {test,expect} from './test';

test('a dataset folder supplied by URL opens as a collection without a custom manifest',async({page})=>{
 const url='https://huggingface.co/datasets/agibot-assets/simready-assets/tree/main/g2_swiftpicker';
 const failures:string[]=[];page.on('pageerror',error=>failures.push(error.message));
 await page.goto('/?workspace=studio&viewer=three&collection='+encodeURIComponent(url));
 const id='collection:'+encodeURIComponent(url);
 await expect(page.locator('#gallery-grid')).toHaveAttribute('data-example-group',id);
 const folder=page.locator('[data-sample-group]').filter({hasText:'agibot-assets/simready-assets/g2_swiftpicker'});
 await expect(folder).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.gallery-card:visible')).toHaveCount(1);
 await expect.poll(()=>page.locator('.gallery-card img').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBeGreaterThan(0);
 await page.reload();await expect(page.locator('#gallery-grid')).toHaveAttribute('data-example-group',id);
 expect(failures).toEqual([]);
});
