import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/repl-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main></main></body></html>' }));
  await page.goto('/repl-test');
  await page.evaluate(async () => {
    const { mountRepl } = await import(/* @vite-ignore */ '/usd/viewer/repl.js');
    const w = window as any;
    w.calls = []; w.edits = 0;
    class NativePrim { path = '/World'; GetPath() { w.calls.push('GetPath'); return this.path; } }
    class NativeStage {
      value = 4;
      GetPrimAtPath() { w.calls.push('GetPrimAtPath'); return new NativePrim(); }
      read() { w.calls.push('read'); return this.value; }
      write(value: number) { w.calls.push('write'); this.value = value; }
      callback(fn: (value: NativePrim) => unknown) { return fn(new NativePrim()); }
    }
    w.newContext = () => ({ USD: { Prim: NativePrim }, handle: {}, stage: new NativeStage(), selection: { path: '/World', instanceIndex: 2, native: new NativePrim() }, api: {
      select(identity: unknown) { w.calls.push(['select', identity]); return identity; },
      follow(identity: unknown) { w.calls.push(['follow', identity]); return identity; },
      inspect(identity: unknown) { return { identity, kind: 'Mesh' }; },
    } });
    w.context = w.newContext();
    w.mount = (stateKey = 'repl-test-history') => mountRepl({
      container: document.querySelector('main'), style: false, stateKey,
      getContext: () => w.context,
      edit: async (callback: any) => {
        w.edits++; w.calls.push('before'); if (w.editGate) await w.editGate;
        const value = await callback(w.context.stage); w.calls.push('after'); return value;
      },
    });
    localStorage.removeItem('repl-test-history'); w.repl = w.mount();
  });
});
const run = (page: any, source: string) => page.evaluate((source: string) => (window as any).repl.run(source), source);

test('results produced in a hidden dock follow its output when the dock opens and resizes',async({page})=>{
  await page.addStyleTag({content:'.usd-repl-output {height:60px;overflow:auto;}'});
  await page.locator('main').evaluate(el=>{el.hidden=true;});
  await run(page,'"late result"');
  await page.locator('main').evaluate(el=>{el.hidden=false;});
  const output=page.getByRole('log',{name:'JavaScript output'});
  await expect.poll(()=>output.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(2);
  await page.addStyleTag({content:'.usd-repl-output {height:25px;}'});
  await expect.poll(()=>output.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(2);
});

test('expressions, top-level await, statements and recovery without duplicate evaluation', async ({ page }) => {
  expect(await run(page, '2 + 3')).toBe(5);
  expect(await run(page, 'await Promise.resolve(7)')).toBe(7);
  expect(await run(page, 'const {a, b} = {a: 2, b: 3}; return a + b;')).toBe(5);
  expect(await run(page, '({text: "const { x } = 3;", values: [1, 2]})')).toEqual({ text: 'const { x } = 3;', values: [1, 2] });
  await expect(run(page, 'const =')).rejects.toThrow('SyntaxError');
  await run(page, 'scratch.count = 0');
  await expect(run(page, 'scratch.count++; throw new SyntaxError("runtime");')).rejects.toThrow('runtime');
  expect(await run(page, 'scratch.count')).toBe(1);
  await expect(run(page, 'await Promise.reject(new Error("promise failure"))')).rejects.toThrow('promise failure');
  expect(await run(page, 'await Promise.resolve(9)')).toBe(9);
  await run(page, 'let local = 12;');
  expect(await run(page, 'typeof local')).toBe('undefined');
});

test('reads and navigation are cheap; edits use the host lifecycle and receiver binding', async ({ page }) => {
  expect(await run(page, 'stage.read()')).toBe(4);
  expect(await run(page, '(new USD.Prim()).GetPath()')).toBe('/World');
  expect(await run(page, '(new USD.Prim()) instanceof USD.Prim')).toBe(true);
  await run(page, 'select(selection.path)'); await run(page, 'follow("/World")');
  expect(await page.evaluate(() => (window as any).edits)).toBe(0);
  expect(await run(page, 'await edit(async stage => { await Promise.resolve(); stage.write(8); return stage.read(); })')).toBe(8);
  expect(await page.evaluate(() => (window as any).calls)).toEqual(['read', 'GetPath', ['select', '/World'], ['follow', '/World'], 'before', 'write', 'read', 'after']);
  expect(await run(page, 'inspect(selection.path).kind')).toBe('Mesh');
  expect(await run(page, 'selection')).toEqual({ path: '/World', instanceIndex: 2, native: undefined });
  expect(await run(page, 'context.selection.path')).toBe('/World');
  await run(page, 'scratch.prim = stage.GetPrimAtPath("/World")');
  expect(await run(page, 'scratch.prim.GetPath()')).toBe('/World');
  await expect(run(page, 'await edit(async () => { throw new Error("edit failed"); })')).rejects.toThrow('edit failed');
  expect(await run(page, 'stage.read()')).toBe(8);
});

test('multiline keyboard input, draft-preserving history, remount persistence and clear', async ({ page }) => {
  const input = page.getByRole('textbox', { name: 'JavaScript input' });
  await input.fill('const a = 4;'); await input.press('End'); await input.press('Enter'); await input.press('a');
  await expect(input).toHaveValue('const a = 4;\na');
  await input.fill('6 * 7'); await input.press('Control+Enter');
  await expect(page.locator('.usd-repl-result').last()).toHaveText('42');
  await input.fill('draft'); await input.press('Alt+ArrowUp'); await expect(input).toHaveValue('6 * 7');
  await input.press('Alt+ArrowDown'); await expect(input).toHaveValue('draft');
  await page.evaluate(() => { const w = window as any; w.repl.dispose(); w.repl = w.mount(); w.repl.focus(); });
  await expect(input).toBeFocused(); await input.press('Alt+ArrowUp'); await expect(input).toHaveValue('6 * 7');
  await input.press('Meta+Enter'); await expect(page.locator('.usd-repl-result').last()).toHaveText('42');
  await page.getByRole('button', { name: 'Clear', exact: true }).click(); await expect(page.locator('.usd-repl-entry')).toHaveCount(0);
});

test('blocked/corrupt storage is harmless; output is escaped, bounded and avoids getters', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any; w.repl.dispose(); localStorage.setItem('repl-test-history', '{invalid'); w.repl = w.mount();
    Object.defineProperty(Storage.prototype, 'setItem', { value() { throw new Error('denied'); } });
  });
  expect(await run(page, '3')).toBe(3);
  await run(page, 'scratch.cycle = {}; scratch.cycle.self = scratch.cycle; print(scratch.cycle); print({get secret() { throw new Error("getter ran"); }}); return "<img src=x onerror=alert(1)>";');
  await expect(page.locator('.usd-repl-output')).toContainText('[Circular]');
  await expect(page.locator('.usd-repl-output')).toContainText('[Getter]');
  await expect(page.locator('.usd-repl-output img')).toHaveCount(0);
  await run(page, 'for (let i = 0; i < 200; i++) print("x".repeat(10000));');
  expect(await page.locator('.usd-repl-entry').count()).toBe(160);
  expect(await page.locator('.usd-repl-entry').evaluateAll(rows => Math.max(...rows.map(row => row.textContent!.length)))).toBeLessThanOrEqual(8000);
});

test('close cancels awaiting and queued work, blocks saved methods, and permits a new document', async ({ page }) => {
  await run(page, 'scratch.prim = stage.GetPrimAtPath("/World"); globalThis.savedPrim = scratch.prim; globalThis.savedStage = stage;');
  await page.evaluate(() => {
    const w = window as any;
    w.pending = w.repl.run('await new Promise(resolve => { globalThis.resumeRepl = resolve; }); stage.read();').catch((e: Error) => e.message);
    w.queued = w.repl.run('stage.write(99)').catch((e: Error) => e.message);
  });
  await expect.poll(() => page.evaluate(() => typeof (window as any).resumeRepl)).toBe('function');
  await page.evaluate(() => { (window as any).context = null; });
  expect(await page.evaluate(() => (window as any).pending)).toContain('no longer current');
  expect(await page.evaluate(() => (window as any).queued)).toContain('no longer current');
  expect(await page.evaluate(() => { try { (window as any).savedPrim.GetPath(); return 'unsafe'; } catch (e) { return (e as Error).message; } })).toContain('no longer current');
  await expect(run(page, 'stage.read()')).rejects.toThrow('No USD stage');
  await page.evaluate(() => { const w = window as any; w.context = w.newContext(); w.resumeRepl(); });
  expect(await run(page, 'stage.read()')).toBe(4);
  expect(await run(page, 'scratch.prim')).toBeUndefined();
  expect(await page.evaluate(() => (window as any).calls)).toEqual(['GetPrimAtPath', 'read']);
});

test('edit callbacks recheck generation after the host waits; dispose rejects pending work', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.editGate = new Promise(resolve => { w.releaseEdit = resolve; });
    w.pending = w.repl.run('await edit(async stage => stage.write(99))').catch((e: Error) => e.message);
  });
  await expect.poll(() => page.evaluate(() => (window as any).edits)).toBe(1);
  await page.evaluate(() => { const w = window as any; w.context = w.newContext(); w.releaseEdit(); });
  expect(await page.evaluate(() => (window as any).pending)).toContain('no longer current');
  expect(await page.evaluate(() => (window as any).context.stage.value)).toBe(4);
  await page.evaluate(() => {
    const w = window as any; w.pending = w.repl.run('await new Promise(() => {})').catch((e: Error) => e.message);
  });
  await page.evaluate(() => (window as any).repl.dispose());
  expect(await page.evaluate(() => (window as any).pending)).toContain('no longer current');
  await expect(page.locator('.usd-repl')).toHaveCount(0);
  await expect(run(page, '1')).rejects.toThrow('disposed');
});

test('SDK callback arguments and returned native values remain guarded across reload', async ({ page }) => {
  expect(await run(page, 'stage.callback(prim => { globalThis.callbackPrim = prim; return prim.GetPath(); })')).toBe('/World');
  await page.evaluate(() => { const w = window as any; w.context = w.newContext(); });
  expect(await page.evaluate(() => { try { (window as any).callbackPrim.GetPath(); return 'unsafe'; } catch (e) { return (e as Error).message; } })).toContain('no longer current');
  expect(await run(page, 'stage.read()')).toBe(4);
});

test('a suspended edit cannot mutate its captured stage after replacement', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as any;
    w.pending = w.repl.run('await edit(async stage => { await new Promise(resolve => { globalThis.resumeEdit = resolve; }); stage.write(55); })').catch((e: Error) => e.message);
  });
  await expect.poll(() => page.evaluate(() => typeof (window as any).resumeEdit)).toBe('function');
  await page.evaluate(() => { const w = window as any; w.context = w.newContext(); w.resumeEdit(); });
  expect(await page.evaluate(() => (window as any).pending)).toContain('no longer current');
  expect(await page.evaluate(() => (window as any).calls)).toEqual(['before']);
  expect(await run(page, 'stage.read()')).toBe(4);
});

test('history is bounded and storage reads may be disabled', async ({ page }) => {
  await page.evaluate(async () => { for (let i = 0; i < 105; i++) await (window as any).repl.run(String(i)); });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('repl-test-history')!))).toHaveLength(100);
  await page.evaluate(() => {
    const w = window as any; w.repl.dispose();
    Object.defineProperty(Storage.prototype, 'getItem', { value() { throw new Error('denied'); } });
    w.repl = w.mount();
  });
  expect(await run(page, '42')).toBe(42);
});

test('array input creates typed data and edits existing literals with paste and undo',async({page})=>{
  await page.addStyleTag({url:'/usd/viewer/style.css'});
  const input=page.getByRole('textbox',{name:'JavaScript input'});
  await input.fill('scratch.points = ');await input.press('End');await page.getByRole('button',{name:'Array',exact:true}).click();
  const editor=page.locator('.usd-array-editor');await editor.getByRole('combobox',{name:'Array type'}).selectOption('point3f');
  await editor.getByRole('spinbutton',{name:'Initial rows'}).fill('3');await editor.getByRole('spinbutton',{name:'Initial rows'}).press('Tab');
  const first=editor.getByRole('textbox',{name:'Row 0 X',exact:true});
  await first.evaluate((el:HTMLInputElement)=>{
    const data=new DataTransfer();data.setData('text/plain','1\t2\t3\n4\t5\t6');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  });
  await expect(editor.getByRole('textbox',{name:'Row 1 Y',exact:true})).toHaveValue('5');
  await editor.getByRole('button',{name:'Undo',exact:true}).click();await expect(editor.getByRole('textbox',{name:'Row 1 Y',exact:true})).toHaveValue('0');
  await editor.getByRole('button',{name:'Redo',exact:true}).click();
  await editor.getByRole('button',{name:'Apply',exact:true}).click();await expect(input).toHaveValue('scratch.points = [[1, 2, 3], [4, 5, 6], [0, 0, 0]]');
  await input.press('Control+Enter');expect(await run(page,'scratch.points')).toEqual([[1,2,3],[4,5,6],[0,0,0]]);
  await input.fill('const positions = [[1,2,3],[4,5,6],[7,8,9]];');await input.evaluate((el:HTMLTextAreaElement)=>el.setSelectionRange(25,25));
  await page.getByRole('button',{name:'Array',exact:true}).click();await expect(editor.getByRole('textbox',{name:'Row 0 X',exact:true})).toHaveValue('1');
  await editor.getByRole('button',{name:'Raw',exact:true}).click();await editor.getByRole('textbox',{name:'Array source'}).fill('[[1,2],[3]]');await editor.getByRole('button',{name:'Apply',exact:true}).click();await expect(editor.getByRole('status')).toContainText('rectangular');
  await editor.getByRole('textbox',{name:'Array source'}).fill('[[9,2,3],[4,5,6],[7,8,9]]');await editor.getByRole('button',{name:'Apply',exact:true}).click();await expect(input).toHaveValue('const positions = [[9, 2, 3], [4, 5, 6], [7, 8, 9]];');
});

test('new empty point arrays keep XYZ columns when their first row is added',async({page})=>{
 await page.addStyleTag({url:'/usd/viewer/style.css'});const input=page.getByRole('textbox',{name:'JavaScript input'});
 await input.fill('scratch.points = ');await input.press('End');await page.getByRole('button',{name:'Array',exact:true}).click();const editor=page.locator('.usd-array-editor');
 await editor.getByRole('spinbutton',{name:'Initial rows'}).fill('0');await editor.getByRole('spinbutton',{name:'Initial rows'}).press('Tab');
 await editor.getByRole('button',{name:'Add row',exact:true}).click();await expect(editor.getByRole('textbox',{name:'Row 0 Z',exact:true})).toHaveValue('0');
 await editor.getByRole('button',{name:'Apply',exact:true}).click();await expect(input).toHaveValue('scratch.points = [[0, 0, 0]]');
});
