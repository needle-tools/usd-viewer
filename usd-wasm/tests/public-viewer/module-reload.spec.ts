import {test, expect} from './test';

// Reloads must never mix cached modules with newer ones. The server sends app and
// SDK code with Cache-Control: no-cache and a validator, so the browser revalidates
// each file and unchanged files cost only a 304.
for (const path of ['/viewer-app.js', '/usd/scene/index.js', '/css/workbench.css', '/usd/bindings/emHdBindings.wasm']) {
  test(`${path} is revalidated on every load`, async ({request}) => {
    const first = await request.get(path, {headers: {'accept-encoding': 'identity'}});
    expect(first.status()).toBe(200);
    expect(first.headers()['cache-control']).toBe('no-cache');
    const etag = first.headers()['etag'];
    expect(etag).toBeTruthy();
    const second = await request.get(path, {headers: {'if-none-match': etag, 'accept-encoding': 'identity'}});
    expect(second.status()).toBe(304);
  });
}
