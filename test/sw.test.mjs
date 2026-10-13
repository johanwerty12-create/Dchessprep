import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')).replace('__APP_CACHE_VERSION__', 'new').replace('__ENGINE_CACHE_VERSION__', 'engine');
function worker({ failManifest = false, offline = false } = {}) {
  const listeners = {}, deleted = [], stores = new Map([['chessdesk-app-old', new Map()], ['other-product-data', new Map()]]);
  let skipped = 0, claimed = 0;
  const shell = new Response('<h1>cached app</h1>');
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (key) => { deleted.push(key); return stores.delete(key); },
    open: async (key) => {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return { addAll: async (urls) => { for (const url of urls) store.set(url, shell); }, match: async (url) => store.get(typeof url === 'string' ? url : url.url), put: async (url, response) => store.set(url.url || url, response) };
    },
  };
  vm.runInNewContext(source, { self: { location: { origin: 'https://qa.example' }, clients: { claim: async () => { claimed++; } }, skipWaiting: async () => { skipped++; }, addEventListener: (type, fn) => { listeners[type] = fn; } }, caches, URL, Response, fetch: async (url) => {
    if (offline) throw new Error('offline');
    if (url === '/offline-assets.json') return new Response(failManifest ? '{}' : '["/assets/app.js"]', { status: failManifest ? 500 : 200 });
    return new Response('network');
  } });
  const lifecycle = async (type) => { let task; listeners[type]({ waitUntil: (promise) => { task = promise; } }); await task; };
  const request = async (pathname, mode) => { let result; listeners.fetch({ request: { method: 'GET', url: `https://qa.example${pathname}`, mode }, respondWith: (promise) => { result = promise; } }); return await result; };
  return { lifecycle, request, stores, deleted, counters: () => ({ skipped, claimed }) };
}

test('service-worker updates wait for old clients and preserve unrelated caches', async () => {
  const w = worker();
  await w.lifecycle('install');
  assert.equal(w.counters().skipped, 0);
  assert.ok(w.stores.has('chessdesk-app-old'));
  await w.lifecycle('activate');
  assert.deepEqual(w.deleted, ['chessdesk-app-old']);
  assert.ok(w.stores.has('other-product-data'));
  assert.equal(w.counters().claimed, 1);
});

test('interrupted app installation retains the previous offline shell', async () => {
  const w = worker({ failManifest: true });
  await assert.rejects(w.lifecycle('install'), /manifest failed/);
  assert.ok(w.stores.has('chessdesk-app-old'));
  assert.equal(w.stores.has('chessdesk-app-new'), false);
});

test('offline navigation serves installed shell and uncached engine fails explicitly', async () => {
  const w = worker({ offline: true });
  w.stores.set('chessdesk-app-new', new Map([['/index.html', new Response('offline shell')]]));
  assert.equal(await (await w.request('/review', 'navigate')).text(), 'offline shell');
  assert.equal((await w.request('/engine/stockfish.wasm', 'cors')).status, 503);
});

test('offline PWA serves its cached icons and manifest', async () => {
  const w = worker({ offline: true });
  w.stores.set('chessdesk-app-new', new Map([
    ['https://qa.example/icons/icon.svg', new Response('cached mark')],
    ['https://qa.example/icons/icon-192.png', new Response('cached install icon')],
    ['https://qa.example/manifest.webmanifest', new Response('{"name":"Chessdesk"}')],
  ]));
  assert.equal(await (await w.request('/icons/icon.svg', 'no-cors')).text(), 'cached mark');
  assert.equal(await (await w.request('/icons/icon-192.png', 'no-cors')).text(), 'cached install icon');
  assert.equal(await (await w.request('/manifest.webmanifest', 'cors')).text(), '{"name":"Chessdesk"}');
});
