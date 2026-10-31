import {expect,test} from '@playwright/test';
import {openSettings,stageReady} from './workbench-menus';
const asset='/test-fixtures/coverage/lighting-mdl/studio-variants.usda';
const url=(viewer='three')=>`/?viewer=${viewer}&file=${asset}`;

for(const viewer of ['three','needle'])test(`${viewer}: Adaptive defaults and selected detail survive a fresh URL`,async({page})=>{
  await page.goto(url(viewer));await stageReady(page);await openSettings(page);
  await expect(page.getByRole('combobox',{name:'USD detail',exact:true})).toHaveValue('adaptive');
  expect(await page.evaluate(()=>(window as any).usdHydra.driver.GetComplexity())).toBeCloseTo(1.3);
  expect(await page.evaluate(()=>(window as any).usdHydra.driver.GetAdaptiveSubdivision())).toBe(true);
  if(viewer==='three')await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.mode)).toBe('beauty');
  await page.getByRole('combobox',{name:'USD detail',exact:true}).selectOption('high');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('needle-usd-render-settings')||'{}').detail)).toBe('high');
  await page.goto(url(viewer));await stageReady(page);await openSettings(page);
  await expect(page.getByRole('combobox',{name:'USD detail',exact:true})).toHaveValue('high');
  expect(await page.evaluate(()=>(window as any).usdHydra.driver.GetComplexity())).toBeCloseTo(1.2);
  expect(await page.evaluate(()=>(window as any).usdHydra.driver.GetAdaptiveSubdivision())).toBe(false);
});

test('render mode and tracer quality survive fresh URLs, including Basic',async({page})=>{
  await page.goto(url());await stageReady(page);await openSettings(page);
  const mode=page.getByRole('combobox',{name:'Render mode',exact:true});await expect(mode).toHaveValue('beauty');
  await mode.selectOption('pathtraced');await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.mode)).toBe('pathtraced');
  for(const [name,value] of [['Samples','24'],['Bounces','4'],['Exposure','1.3']]){const field=page.getByRole('spinbutton',{name,exact:true});await field.fill(value);await field.press('Tab');}
  await page.getByRole('combobox',{name:'Denoiser',exact:true}).selectOption('none');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('needle-usd-render-settings')!).maxSamples)).toBe(24);
  await page.goto(url());await stageReady(page);await openSettings(page);
  await expect(mode).toHaveValue('pathtraced');await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.mode)).toBe('pathtraced');
  for(const [name,value] of [['Samples','24'],['Bounces','4'],['Exposure','1.3']])await expect(page.getByRole('spinbutton',{name,exact:true})).toHaveValue(value);
  await expect(page.getByRole('combobox',{name:'Denoiser',exact:true})).toHaveValue('none');
  await mode.selectOption('pathtraced-gk');await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.mode)).toBe('pathtraced-gk');
  await page.getByRole('combobox',{name:'Denoiser',exact:true}).selectOption('none');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('needle-usd-render-settings')!).gkDenoiser)).toBe(null);
  await page.goto(url());await stageReady(page);await openSettings(page);
  await expect(mode).toHaveValue('pathtraced-gk');await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.mode)).toBe('pathtraced-gk');
  await expect(page.getByRole('combobox',{name:'Denoiser',exact:true})).toHaveValue('none');
  await mode.selectOption('basic');await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('needle-usd-render-settings')!).mode)).toBe('basic');
  expect(new URL(page.url()).searchParams.get('render')).toBe('basic');
  await page.goto(url());await stageReady(page);await openSettings(page);await expect(mode).toHaveValue('basic');
  expect(await page.evaluate(()=>(window as any).usdRenderModes.settings)).toMatchObject({maxSamples:24,bounces:4,denoiser:null});
});

test('explicit URL render/detail overrides remembered preferences',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('needle-usd-render-settings',JSON.stringify({mode:'beauty',detail:'high',maxSamples:24})));
  await page.goto(url()+'&render=basic&complexity=low');await stageReady(page);await openSettings(page);
  await expect(page.getByRole('combobox',{name:'Render mode',exact:true})).toHaveValue('basic');
  await expect(page.getByRole('combobox',{name:'USD detail',exact:true})).toHaveValue('low');
  expect(await page.evaluate(()=>(window as any).usdHydra.driver.GetComplexity())).toBe(1);
});

for(const blocked of [false,true])test(`${blocked?'blocked':'invalid'} storage leaves defaults and controls usable`,async({page})=>{
  await page.addInitScript(blocked=>{if(blocked)Object.defineProperty(Storage.prototype,'getItem',{value(){throw new Error('blocked');}});else localStorage.setItem('needle-usd-render-settings','{invalid');},blocked);
  await page.goto(url());await stageReady(page);await openSettings(page);
  const mode=page.getByRole('combobox',{name:'Render mode',exact:true});await expect(mode).toHaveValue('beauty');await expect(page.getByRole('combobox',{name:'USD detail',exact:true})).toHaveValue('adaptive');
  await mode.selectOption('basic');await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.mode)).toBe('basic');
  await page.getByRole('combobox',{name:'USD detail',exact:true}).selectOption('low');await expect.poll(()=>page.evaluate(()=>(window as any).usdHydra.driver.GetComplexity())).toBe(1);
  if(!blocked)await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('needle-usd-render-settings')!))).toMatchObject({mode:'basic',detail:'low'});
});

test('a mode chosen before opening a file remains selected when it loads',async({page})=>{
  await page.goto('/?viewer=three');await expect(page.getByRole('button',{name:'Examples',exact:true})).toBeEnabled();await openSettings(page);
  const mode=page.getByRole('combobox',{name:'Render mode',exact:true});await expect(mode).toHaveValue('beauty');await mode.selectOption('basic');
  await page.locator('input[type=file]').setInputFiles({name:'cube.usda',mimeType:'text/plain',buffer:Buffer.from('#usda 1.0\ndef Cube "Cube" {}\n')});await stageReady(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).usdRenderModes.mode)).toBe('basic');
});
