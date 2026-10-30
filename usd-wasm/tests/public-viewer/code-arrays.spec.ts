import { test, expect } from "@playwright/test";
import { openAppMenu, stageReady } from "./workbench-menus";
test.beforeEach(async ({ page }) => {
  (page as any).arrayErrors = [];
  page.on("pageerror", (error) =>
    (page as any).arrayErrors.push(error.message),
  );
});
test.afterEach(async ({ page }) => {
  expect((page as any).arrayErrors).toEqual([]);
});
async function code(page: any) {
  await openAppMenu(page, "window");
  await page.getByRole("checkbox", { name: "Show Code" }).check();
  await expect(page.locator(".usd-code")).toBeVisible();
}
async function root(page: any) {
  const pane = page.locator(".usd-code-source");
  const key = await pane
    .locator("option")
    .evaluateAll(
      (options: any[]) => options.find((o) => o.dataset.role === "root").value,
    );
  await page.evaluate(key => (window as any).usdWorkbench.code.select(key), key);
}
const url = (viewer = "three") =>
  `/?viewer=${viewer}&render=beauty&assetCache=0&file=${encodeURIComponent("/test-fixtures/api/examples.js#hello-world")}`;
for (const viewer of ["three", "needle"])
  test(`${viewer}: typed point tables edit the live layer with reversible USD commands`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url(viewer));
    await stageReady(page);
    await code(page);
    await root(page);
    const buttons = page.getByRole("button", {
      name: "Open points array",
      exact: true,
    });
    await expect(buttons.first()).toBeVisible();
    const before = await page.evaluate(async () => {
      const w = window as any;
      return await w.usdStage
        .GetPrimAtPath("/hello/Orbit/Path")
        .GetAttribute("points")
        .Get(NaN);
    });
    await buttons.first().click();
    const table = page.locator(".usd-code .usd-array-editor");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(32);
    await expect(
      table.getByRole("columnheader", { name: "X", exact: true }),
    ).toBeVisible();
    await table
      .getByRole("textbox", { name: "Row 0 X", exact: true })
      .fill(String(before[0][0] + 0.5));
    await table.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(table).toHaveCount(0);
    const read = () =>
      page.evaluate(
        async () =>
          await (window as any).usdStage
            .GetPrimAtPath("/hello/Orbit/Path")
            .GetAttribute("points")
            .Get(NaN),
      );
    await expect
      .poll(async () => (await read())[0][0])
      .toBeCloseTo(before[0][0] + 0.5, 5);
    await page
      .getByRole("button", { name: "Undo array edit", exact: true })
      .click();
    await expect.poll(read).toEqual(before);
    await page
      .getByRole("button", { name: "Redo array edit", exact: true })
      .click();
    await expect
      .poll(async () => (await read())[0][0])
      .toBeCloseTo(before[0][0] + 0.5, 5);
    await buttons.first().click();
    await table.getByRole("button", { name: "Next rows", exact: true }).click();
    await expect(
      table.getByRole("textbox", { name: "Row 32 X", exact: true }),
    ).toBeVisible();
    await table
      .getByRole("textbox", { name: "Row 32 X", exact: true })
      .fill("NaN");
    await table.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(table.getByRole("status")).toContainText("invalid");
    // Invalid cells cannot silently submit the preceding value.
    await expect(table).toBeVisible();
    await table.getByRole("button", { name: "Close data" }).click();
    await page
      .locator(".usd-code")
      .screenshot({ path: info.outputPath(`${viewer}-point-data.png`) });
    expect(errors).toEqual([]);
  });
test("JavaScript table edits remain a draft until Run and preserve a useful source view", async ({
  page,
}, info) => {
  await page.goto(url());
  await stageReady(page);
  await code(page);
  await page.getByRole("button", { name: "Edit source", exact: true }).click();
  const input = page.getByRole("textbox", { name: "JavaScript source" });
  const original = await input.inputValue();
  await input.fill(
    original +
      "\nconst samplePoints = [[1,2,3],[4,5,6],[7,8,9]];\nprint(samplePoints[0][0]);",
  );
  await page.getByRole("button", { name: "Edit source", exact: true }).click();
  await page
    .getByRole("button", { name: "Open samplePoints array", exact: true })
    .click();
  const editor = page.locator(".usd-code .usd-array-editor");
  await editor
    .getByRole("textbox", { name: "Row 0 X", exact: true })
    .fill("42");
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).usdWorkbench.code.text))
    .toContain("[[42, 2, 3]");
  await page
    .getByRole("button", { name: "Undo array edit", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).usdWorkbench.code.text))
    .toContain("[[1,2,3]");
  await page
    .getByRole("button", { name: "Redo array edit", exact: true })
    .click();
  await page
    .locator(".usd-code")
    .getByRole("button", { name: "Run", exact: true })
    .click();
  await stageReady(page);
  await expect(page.locator(".usd-repl-output")).toContainText("42");
  await expect
    .poll(() => page.evaluate(() => (window as any).usdWorkbench.code.text))
    .toContain("[[42, 2, 3]");
  await page
    .locator(".usd-code")
    .screenshot({ path: info.outputPath("javascript-arrays.png") });
  await page.reload();
  await stageReady(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).usdWorkbench.code.text))
    .toContain("[[42, 2, 3]");
  await expect(
    page.locator(".usd-code").getByRole("button", { name: "Run", exact: true }),
  ).toBeEnabled();
});

test("UVs, colors, time samples and matrices retain their native types and compact layouts", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem("needle-usd-theme", JSON.stringify("dark")),
  );
  await page.route("**/array-table.usda", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body: `#usda 1.0
(upAxis = "Y")
def Xform "World" {
 def Mesh "Quad" {
  int[] faceVertexCounts = [4]
  int[] faceVertexIndices = [0,1,2,3]
  point3f[] points = [(-1,0,0),(1,0,0),(1,2,0),(-1,2,0)]
  point3f[] points.timeSamples = {2: [(-1,0,0),(1,0,0),(1,2,0),(-1,2,0)]}
  texCoord2f[] primvars:st = [(0,0),(1,0),(1,1),(0,1)] (interpolation = "vertex")
  color3f[] primvars:displayColor = [(0.25,0.5,0.75)]
  custom matrix4d[] frames = [((1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,0,1))]
 }
}`,
    }),
  );
  await page.goto(
    "/?viewer=three&render=beauty&file=" +
      encodeURIComponent("/array-table.usda"),
  );
  await stageReady(page);
  await code(page);
  await root(page);
  const editor = page.locator(".usd-code .usd-array-editor");
  await page
    .getByRole("button", { name: "Open primvars:st array", exact: true })
    .click();
  await expect(
    editor.getByRole("columnheader", { name: "U", exact: true }),
  ).toBeVisible();
  await editor
    .getByRole("textbox", { name: "Row 0 U", exact: true })
    .fill("0.25");
  await editor
    .getByRole("textbox", { name: "Row 0 U", exact: true })
    .press("Tab");
  await expect(
    editor.getByRole("textbox", { name: "Row 0 V", exact: true }),
  ).toBeFocused();
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          await (window as any).usdStage
            .GetPrimAtPath("/World/Quad")
            .GetAttribute("primvars:st")
            .Get(NaN),
      ),
    )
    .toEqual([
      [0.25, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  await page
    .getByRole("button", {
      name: "Open primvars:displayColor array",
      exact: true,
    })
    .click();
  await expect(editor.getByLabel("Row 0 color")).toHaveAttribute(
    "type",
    "color",
  );
  await editor.getByRole("button", { name: "Close data" }).click();
  await page
    .getByRole("button", { name: "Open frames array", exact: true })
    .click();
  await expect(editor.locator(".usd-array-matrix")).toHaveCount(1);
  await expect(editor.locator(".usd-array-matrix input")).toHaveCount(16);
  await editor
    .getByRole("textbox", { name: "Row 0 m30", exact: true })
    .fill("3");
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (
            await (window as any).usdStage
              .GetPrimAtPath("/World/Quad")
              .GetAttribute("frames")
              .Get(NaN)
          )[0][3][0],
      ),
    )
    .toBe(3);
  await page
    .getByRole("button", { name: "Open points array", exact: true })
    .last()
    .click();
  await editor
    .getByRole("textbox", { name: "Row 0 X", exact: true })
    .fill("-2");
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (
            await (window as any).usdStage
              .GetPrimAtPath("/World/Quad")
              .GetAttribute("points")
              .Get(2)
          )[0][0],
      ),
    )
    .toBe(-2);
  expect(
    await page.evaluate(
      async () =>
        (
          await (window as any).usdStage
            .GetPrimAtPath("/World/Quad")
            .GetAttribute("points")
            .Get(NaN)
        )[0][0],
    ),
  ).toBe(-1);
  await page
    .getByRole("button", { name: "Open frames array", exact: true })
    .click();
  await page
    .locator(".usd-code")
    .screenshot({ path: info.outputPath("matrix-dark.png") });
});


test("array tables stay beside source with a remembered width and flat cells", async ({ page }, info) => {
  await page.goto(url());
  await stageReady(page);
  await code(page);
  await page.evaluate(() => (window as any).usdWorkbench.dock.getPanel('code').api.maximize());
  await root(page);
  const open = page.getByRole('button', {name:'Open points array', exact:true}).first();
  await open.click();
  const sidebar = page.getByRole('complementary', {name:'Array editor',exact:true});
  const divider = page.getByRole('separator', {name:'Array editor width',exact:true});
  const source = page.locator('.usd-code-view');
  const cell = sidebar.getByRole('textbox', {name:'Row 0 X',exact:true});
  await expect(sidebar).toBeVisible();
  const a = (await source.boundingBox())!, b = (await sidebar.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(a.x+a.width);
  expect(Math.abs(a.y-b.y)).toBeLessThan(2);
  expect(await cell.evaluate(el => ({border:getComputedStyle(el).borderWidth,radius:getComputedStyle(el).borderRadius,background:getComputedStyle(el).backgroundColor})))
    .toEqual({border:'0px',radius:'0px',background:'rgba(0, 0, 0, 0)'});
  await divider.focus();
  const before=Number(await divider.getAttribute('aria-valuenow'));
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow',String(before+40));
  const handle=(await divider.boundingBox())!;
  await page.mouse.move(handle.x+2,handle.y+50);await page.mouse.down();await page.mouse.move(handle.x-38,handle.y+50);await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow',String(before+80));
  await page.locator('.usd-code').screenshot({path:info.outputPath('array-sidebar-light.png')});
  await page.reload();await stageReady(page);
  await page.getByRole('button', {name:'Open points array',exact:true}).first().click();
  await expect(divider).toHaveAttribute('aria-valuenow',String(before+80));
  await page.evaluate(() => {document.documentElement.dataset.theme='dark';});
  await page.locator('.usd-code').screenshot({path:info.outputPath('array-sidebar-dark.png')});
  await page.evaluate(() => {const panel=(window as any).usdWorkbench.dock.getPanel('code');panel.api.exitMaximized();panel.api.setSize({width:420});});
  await expect(page.locator('.usd-code')).toHaveAttribute('data-sidebar','false');
  await expect(sidebar).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const narrowSource=(await source.boundingBox())!,narrowSidebar=(await sidebar.boundingBox())!;
  expect(narrowSidebar.x).toBeGreaterThanOrEqual(narrowSource.x+narrowSource.width);
  await page.locator('.usd-code').screenshot({path:info.outputPath('array-sidebar-narrow.png')});
  await sidebar.getByRole('button',{name:'Close data'}).click();
  await expect(sidebar).toBeHidden();await expect(divider).toBeHidden();
  await page.evaluate(() => (window as any).usdWorkbench.code.select('example'));
  await page.getByRole('button',{name:'Edit source',exact:true}).click();
  await page.getByRole('button',{name:'Array',exact:true}).click();
  await expect(sidebar.locator('.usd-array-editor')).toBeVisible();
  await sidebar.getByRole('button',{name:'Close data'}).click();
  await expect(sidebar).toBeHidden();
});
