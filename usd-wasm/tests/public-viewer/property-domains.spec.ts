import {expect, test} from '@playwright/test';
import {openAppMenu, stageReady} from './workbench-menus';

const fixture = `#usda 1.0
(
    startTimeCode = 1
    endTimeCode = 2
)
def Cube "Test" (documentation = "metadata-doc") {
    custom string typeName = "custom-value"
    custom string documentation.timeSamples = {1: "attribute-doc", 2: "second-doc"}
}
`;

for (const viewer of ['three', 'needle']) {
  test(`${viewer}: metadata and attributes with the same name remain separate after seeking`, async ({page}) => {
    await page.goto(`/?viewer=${viewer}&render=basic&file=/test-fixtures/coverage/core/animated-translation.usda`);
    await stageReady(page);
    await openAppMenu(page, 'file');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: 'Open…', exact: true}).click();
    await (await chooser).setFiles({name: 'property-domains.usda', mimeType: 'text/plain', buffer: Buffer.from(fixture)});
    await page.locator('[data-prim-path="/Test"]').click();
    await openAppMenu(page, 'window');
    await page.getByRole('checkbox', {name: 'Show Timeline', exact: true}).check();
    const play = page.getByRole('button', {name: 'Play or pause'});
    if (await play.getAttribute('aria-pressed') === 'true') await play.click();
    await page.getByRole('button', {name: 'First frame', exact: true}).click();
    const values = (name: string) => page.locator('[data-panel=properties] tr').filter({has: page.getByRole('rowheader', {name, exact: true})}).locator('td');
    await expect(values('typeName')).toHaveText(['Cube', 'custom-value']);
    await expect(values('documentation')).toHaveText(['metadata-doc', 'attribute-doc']);
    await page.getByRole('button', {name: 'Last frame', exact: true}).click();
    await expect(values('typeName')).toHaveText(['Cube', 'custom-value']);
    await expect(values('documentation')).toHaveText(['metadata-doc', 'second-doc']);
  });
}
