import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engineAssets = [
  '/engine/stockfish-18-lite-single.js',
  '/engine/stockfish-18-lite-single.wasm',
];

function watchBrowser(page) {
  const issues = { console: [], page: [], requests: [], responses: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') issues.console.push(message.text());
  });
  page.on('pageerror', (error) => issues.page.push(error.message));
  page.on('requestfailed', (request) => {
    issues.requests.push(`${request.url()} — ${request.failure()?.errorText || 'request failed'}`);
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === 'http://127.0.0.1:4173' && response.status() >= 400) {
      issues.responses.push(`${response.status()} ${url.pathname}`);
    }
  });
  return issues;
}

function expectCleanBrowser(issues) {
  expect(issues.console, 'browser console errors').toEqual([]);
  expect(issues.page, 'uncaught page errors').toEqual([]);
  expect(issues.requests, 'failed browser requests').toEqual([]);
  expect(issues.responses, 'failed same-origin responses').toEqual([]);
}

async function readLibrary(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('chessdesk-local', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('records', 'readonly');
      const getAll = transaction.objectStore('records').getAll();
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
      transaction.oncomplete = () => db.close();
      transaction.onabort = () => reject(transaction.error);
    };
  }));
}

test('production UI backup round-trip and genuine offline Stockfish analysis', async ({ page, context }) => {
  const issues = watchBrowser(page);
  const engineResponses = [];
  page.on('response', async (response) => {
    if (engineAssets.some((asset) => new URL(response.url()).pathname === asset)) {
      engineResponses.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
        contentType: await response.headerValue('content-type'),
      });
    }
  });

  await page.goto('/__qa__/acceptance.html');
  const runAcceptance = page.getByRole('button', { name: 'Run isolated product acceptance' });
  await expect(runAcceptance).toBeVisible();
  await runAcceptance.click();
  const transcript = page.locator('#output');
  await expect.poll(() => transcript.textContent(), { timeout: 540_000 }).toMatch(/COMPLETE:|FAIL /);
  const acceptance = await transcript.textContent();
  for (const evidence of [
    'actual export contains every saved record',
    'malformed JSON restore leaves native IndexedDB records unchanged',
    'structurally malformed backup is rejected before native IndexedDB writes',
    'interrupted native IndexedDB restore preserves every pre-existing record',
    'actual restore preserves exact games, reviews, opponents, repertoire, tournaments and training records',
  ]) expect(acceptance).toContain(`PASS ${evidence}`);
  expect(acceptance).not.toContain('FAIL ');

  const recordsBeforeOffline = await readLibrary(page.frames().find((frame) => frame.url().endsWith('/')));
  expect(recordsBeforeOffline.some((record) => record.kind === 'game' && record.name === 'QA Acceptance Scholar')).toBe(true);
  expect(recordsBeforeOffline.some((record) => record.kind === 'review' && record.complete)).toBe(true);
  expect(recordsBeforeOffline.some((record) => record.kind === 'training' && record.practiceLog?.length)).toBe(true);

  await page.goto('/');
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL || ''), { timeout: 30_000 }).toContain('/sw.js');
  const activeWorker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return { state: registration.active?.state, scope: registration.scope };
  });
  expect(activeWorker.state).toBe('activated');
  expect(activeWorker.scope).toBe(`${new URL(page.url()).origin}/`);
  const expectedHashes = Object.fromEntries(await Promise.all(engineAssets.map(async (asset) => {
    const file = path.join(projectRoot, 'dist', asset.slice(1).replaceAll('/', path.sep));
    const bytes = await readFile(file);
    return [asset, createHash('sha256').update(bytes).digest('hex')];
  })));
  const cachedEngine = await page.evaluate(async (assets) => {
    const name = (await caches.keys()).find((key) => key.startsWith('chessdesk-engine-'));
    if (!name) throw new Error('The production service worker did not create its versioned engine cache.');
    const cache = await caches.open(name);
    const results = {};
    for (const asset of assets) {
      const response = await cache.match(new Request(new URL(asset, location.origin)));
      if (!response) throw new Error(`The production service worker did not cache ${asset}.`);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      results[asset] = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return { name, results };
  }, engineAssets);
  expect(cachedEngine.name).toMatch(/^chessdesk-engine-/);
  expect(cachedEngine.results).toEqual(expectedHashes);
  expect(engineResponses.some((response) => response.path.endsWith('.wasm') && response.status === 200 && /application\/wasm/i.test(response.contentType || ''))).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.offline-pill.is-offline')).toBeVisible();
  await page.locator('nav[aria-label="Main navigation"] button[aria-label="Game review"]').click();
  const savedGame = page.locator('.saved-game-card').filter({ hasText: 'QA Acceptance Player' });
  await expect(savedGame).toBeVisible();
  await savedGame.click();
  await expect(page.locator('.review-workspace')).toContainText('QA Acceptance Scholar');
  await page.getByLabel('Search limit').selectOption('depth-10');
  await page.getByRole('button', { name: 'Analyze full game' }).click();
  await expect(page.locator('.toast')).toContainText('Stockfish 18 analyzed 7 plies', { timeout: 300_000 });
  const offlineReview = (await readLibrary(page)).find((record) => record.kind === 'review' && record.depth === 10 && record.complete);
  expect(offlineReview?.engineName).toMatch(/Stockfish 18/);
  expect(offlineReview?.moves).toHaveLength(7);
  expect(offlineReview.moves.at(-1).label).toBe('Best');
  expect(offlineReview.moves.at(-1).whiteScore.kind).toBe('terminal');
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  expectCleanBrowser(issues);
});

test('mobile touch workflows stay usable at 320px and 390px', async ({ browser }) => {
  for (const width of [320, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'allow',
    });
    const page = await context.newPage();
    const issues = watchBrowser(page);
    try {
      await page.goto('/');
      await page.getByRole('button', { name: 'Board', exact: true }).tap();
      await expect(page.locator('.chess-board')).toBeVisible();
      const layout = await page.evaluate(() => {
        const squares = [...document.querySelectorAll('.square')].map((square) => {
          const rect = square.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        });
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, squares };
      });
      expect(layout.width).toBe(width);
      expect(layout.scrollWidth).toBeLessThanOrEqual(width);
      expect(layout.squares).toHaveLength(64);
      expect(layout.squares.every((square) => Math.abs(square.width - square.height) < 0.1)).toBe(true);

      await page.locator('[data-square="e2"]').tap();
      await page.locator('[data-square="e4"]').tap();
      await expect(page.locator('[data-square="e4"]')).toHaveAttribute('aria-label', /white pawn/i);
      await page.locator('[data-square="d7"]').tap();
      await page.locator('[data-square="d5"]').tap();
      await page.locator('[data-square="e4"]').tap();
      await page.locator('[data-square="d5"]').tap();
      await expect(page.locator('[data-square="d5"]')).toHaveAttribute('aria-label', /white pawn/i);
      await page.getByRole('button', { name: 'Previous move' }).tap();
      await expect(page.locator('[data-square="d5"]')).toHaveAttribute('aria-label', /black pawn/i);
      await page.getByRole('button', { name: 'Continue main line' }).tap();
      await expect(page.locator('[data-square="d5"]')).toHaveAttribute('aria-label', /white pawn/i);

      await page.getByRole('button', { name: 'Flip chessboard' }).tap();
      await expect(page.locator('.square').first()).toHaveAttribute('data-square', 'h1');
      await page.getByRole('button', { name: 'Flip chessboard' }).tap();
      await page.getByRole('button', { name: 'FEN / PGN', exact: true }).tap();
      await page.getByLabel('Load FEN').fill('7k/P7/8/8/8/8/8/7K w - - 0 1');
      await page.getByRole('button', { name: 'Load', exact: true }).tap();
      await page.locator('[data-square="a7"]').tap();
      await page.locator('[data-square="a8"]').tap();
      await page.getByRole('button', { name: 'Promote to queen' }).tap();
      await expect(page.locator('[data-square="a8"]')).toHaveAttribute('aria-label', /white queen/i);

      await page.getByRole('button', { name: 'Train', exact: true }).tap();
      await expect(page.locator('[data-workspace="training"]')).toBeVisible();
      await page.getByRole('button', { name: 'Board', exact: true }).tap();
      await expect(page.locator('[data-workspace="board"]')).toBeVisible();

      const metrics = await page.evaluate(() => ({ height: innerHeight, scrollHeight: document.documentElement.scrollHeight }));
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.height);
      await page.evaluate(() => window.scrollTo(0, 0));
      const cdp = await context.newCDPSession(page);
      const x = Math.round(width * 0.88);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, x, y: 660, radiusX: 5, radiusY: 5, force: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x, y: 140, radiusX: 5, radiusY: 5, force: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await cdp.detach();
      expectCleanBrowser(issues);
    } finally {
      await context.close();
    }
  }
});
