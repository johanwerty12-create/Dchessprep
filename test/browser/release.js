import { listRecords, putRecords, replaceAllRecords } from './db.js';
import { StockfishEngine, cacheEngineAsset, ENGINE_JS, ENGINE_WASM } from './engine.js';
import { makeBackup, validateBackup, variationPositions } from './domain.js';
const output = document.querySelector('#output');
const log = (text) => { output.textContent += `${text}\n`; };
const check = (condition, message) => { if (!condition) throw new Error(message); log(`PASS ${message}`); };
const run = (fn) => async () => { output.textContent = ''; try { await fn(); } catch (error) { log(`FAIL ${error.name}: ${error.message}`); } };
const original = [{ id: 'qa-original', kind: 'opponent', name: 'Atomic restore sentinel', updatedAt: '2026-01-01' }];
document.querySelector('#data').onclick = run(async () => {
  await replaceAllRecords(original);
  // Real IndexedDB throws DataCloneError after clear and the first queued put.
  try { await replaceAllRecords([{ id: 'first', name: 'Queued before failure' }, { id: 'bad', cannotClone: () => {} }]); throw new Error('Unexpected success'); }
  catch (error) { check(error.name === 'DataCloneError', 'synchronous clone failure is reported'); }
  check(JSON.stringify(await listRecords()) === JSON.stringify(original), 'synchronous failure rolls back clear and all queued writes');
  try { await putRecords([{ id: 'bulk-first' }, { id: 'bulk-bad', cannotClone: () => {} }]); throw new Error('Unexpected success'); }
  catch (error) { check(error.name === 'DataCloneError', 'bulk import clone failure is reported'); }
  check(JSON.stringify(await listRecords()) === JSON.stringify(original), 'bulk import failure does not partially commit');
  const put = IDBObjectStore.prototype.put;
  for (const failure of ['AbortError', 'QuotaExceededError']) {
    let count = 0;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === 'chessdesk-release-qa' && ++count === 2) {
        this.transaction.abort();
        throw new DOMException('Injected transaction interruption', failure);
      }
      return put.apply(this, args);
    };
    try { await replaceAllRecords([{ id: 'first' }, { id: 'second' }]); throw new Error('Unexpected success'); }
    catch (error) { log(`Reported injected ${failure}: ${error.message}`); }
    finally { IDBObjectStore.prototype.put = put; }
    check(JSON.stringify(await listRecords()) === JSON.stringify(original), `${failure} injection leaves original records unchanged`);
  }
  await replaceAllRecords([{ id: 'replacement', name: 'Complete replacement' }]);
  check((await listRecords()).map((r) => r.id).join() === 'replacement', 'successful replacement commits the whole library');
});
document.querySelector('#status').onclick = run(async () => {
  log(JSON.stringify(await navigator.storage.estimate(), null, 2));
  const reg = await navigator.serviceWorker.getRegistration('/');
  log(JSON.stringify({ controller: navigator.serviceWorker.controller?.scriptURL, active: reg?.active?.state, waiting: reg?.waiting?.state, installing: reg?.installing?.state, caches: await caches.keys(), memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize } : 'unavailable' }, null, 2));
});
document.querySelector('#engine').onclick = run(async () => {
  await cacheEngineAsset(ENGINE_JS);
  const names = await caches.keys();
  const cache = await caches.open(names.find((n) => n.startsWith('chessdesk-engine-')));
  await cache.delete(ENGINE_WASM);
  const controller = new AbortController();
  try { await cacheEngineAsset(ENGINE_WASM, (p) => { if (p.loaded > 0 && !p.cached) controller.abort(); }, controller.signal); throw new Error('Unexpected success'); }
  catch (error) { check(error.name === 'AbortError', 'engine stream cancellation reports AbortError'); }
  // The service worker may independently finish and cache its clone; any stored
  // body is still required to pass the runtime digest before engine startup.
  await cache.put(ENGINE_JS, new Response(new Uint8Array(20670)));
  await cacheEngineAsset(ENGINE_JS);
  const repaired = await cache.match(ENGINE_JS);
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await repaired.arrayBuffer()))].map((b) => b.toString(16).padStart(2, '0')).join('');
  check(digest === '2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe', 'same-length corrupt engine cache recovers authentic bytes');
  let maxGap = 0, last = performance.now(), samples = 0;
  const timer = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; samples++; }, 20);
  const engine = new StockfishEngine();
  try {
    const start = performance.now();
    const name = await engine.ensureEngine();
    log(`Browser engine initialization ${Math.round(performance.now() - start)} ms; ${name}`);
    const searchStart = performance.now();
    const result = await engine.analyze('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', { depth: 12, multipv: 3 });
    check(result.bestmove === 'h5f7' && result.variations[0]?.score.kind === 'mate' && result.variations[0]?.score.value === 1, 'actual browser Stockfish finds Qxf7#');
    log(`Browser depth-12 search ${Math.round(performance.now() - searchStart)} ms; 20 ms timer max gap ${Math.round(maxGap)} ms over ${samples} samples`);
    log(`Main-page heap (excludes worker/WASM): ${JSON.stringify(performance.memory || 'unavailable')}`);
    log(`Storage ${JSON.stringify(await navigator.storage.estimate())}`);
  } finally { clearInterval(timer); engine.restart(); }
});

document.querySelector('#board').onclick = run(async () => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'display:block;width:390px;max-width:100%;height:844px;border:1px solid';
  frame.src = '/';
  document.body.append(frame);
  await new Promise((resolve) => frame.onload = resolve);
  const win = frame.contentWindow, doc = win.document;
  const wait = async (condition) => { const start = performance.now(); while (!condition()) { if (performance.now() - start > 10000) throw new Error('App did not render'); await new Promise((r) => setTimeout(r, 20)); } };
  await wait(() => doc.querySelector('button[aria-label="Board"]'));
  const initial = win.performance.getEntriesByType('resource').map((r) => ({ name: new URL(r.name).pathname, transfer: r.transferSize, decoded: r.decodedBodySize }));
  log(`Initial app resource bytes ${JSON.stringify(initial)} (Cache Storage may make transfer zero)`);
  doc.querySelector('button[aria-label="Board"]').click();
  await wait(() => doc.querySelector('.chess-board'));
  check(doc.documentElement.scrollWidth === doc.documentElement.clientWidth, '390px iframe app has no horizontal overflow');
  check(doc.querySelectorAll('.board-row').length === 8 && doc.querySelectorAll('.square[tabindex="0"]').length === 1, 'board exposes rows and one Tab entry point');
  await Promise.all([...doc.querySelectorAll('.piece-svg')].map((img) => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; })));
  check([...doc.querySelectorAll('.piece-svg')].every((img) => img.naturalWidth > 0), 'all starting-position SVG pieces decode');
  const geometry = () => {
    const rects = [...doc.querySelectorAll('.square')].map((square) => square.getBoundingClientRect());
    const widths = rects.map((r) => r.width), heights = rects.map((r) => r.height);
    check(rects.length === 64 && Math.max(...widths) - Math.min(...widths) < .1 && Math.max(...heights) - Math.min(...heights) < .1 && rects.every((r) => Math.abs(r.width - r.height) < .1), 'all 64 rendered cells are equal squares within 0.1 CSS pixel');
    log(`Geometry ${JSON.stringify({ minWidth: Math.min(...widths), maxWidth: Math.max(...widths), minHeight: Math.min(...heights), maxHeight: Math.max(...heights) })}`);
  };
  geometry();
  const fen = () => doc.querySelector('[aria-label="Current FEN"]').value;
  const before = fen();
  const board = doc.querySelector('.chess-board'), e2 = doc.querySelector('[data-square="e2"]');
  const p = e2.getBoundingClientRect();
  e2.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, pointerId: 91, isPrimary: true, pointerType: 'touch', button: 0, clientX: p.x + p.width / 2, clientY: p.y + p.height / 2 }));
  board.dispatchEvent(new win.PointerEvent('pointercancel', { bubbles: true, pointerId: 91, isPrimary: true }));
  check(fen() === before, 'synthetic touch pointer cancellation leaves position unchanged');
  const times = [];
  const nextPaint = () => new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));
  const more = doc.querySelector('button[aria-label="More workspaces"]');
  more.focus(); more.click(); await nextPaint();
  check(doc.querySelector('[role="dialog"]')?.contains(doc.activeElement), 'More dialog receives keyboard focus');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextPaint();
  check(doc.activeElement === more, 'closing More restores focus after navigation becomes visible');
  const clickVisible = (label) => {
    const button = [...doc.querySelectorAll('button')].find((b) => b.textContent.trim() === label && b.getClientRects().length);
    check(Boolean(button), `${label} is reachable on mobile`);
    button.click();
  };
  clickVisible('Engine'); await nextPaint();
  check(doc.querySelector('.lab-engine-panel').getClientRects().length > 0 && !doc.querySelector('.position-tools').getClientRects().length, 'Engine selector shows only engine tools');
  clickVisible('FEN / PGN'); await nextPaint();
  check(doc.querySelector('.position-tools').getClientRects().length > 0 && !doc.querySelector('.lab-engine-panel').getClientRects().length, 'FEN / PGN selector shows only position tools');
  check(fen() === before, 'panel changes preserve the chess position');
  for (let i = 0; i < 10; i++) {
    clickVisible('FEN / PGN'); await nextPaint();
    clickVisible('New board'); await nextPaint();
    clickVisible('Moves');
    await nextPaint();
    const start = performance.now();
    doc.querySelector('[data-square="e2"]').click();
    await nextPaint();
    doc.querySelector('[data-square="e4"]').click();
    await nextPaint();
    times.push(performance.now() - start);
    check(fen().includes('4P3'), `legal move sample ${i + 1} reaches e4`);
  }
  log(`Ten tap-pair to paint samples (four animation frames per sample): mean ${Math.round(times.reduce((a,b) => a+b,0)/times.length)} ms; max ${Math.round(Math.max(...times))} ms`);
  log(`Main-page heap excludes worker: ${JSON.stringify(win.performance.memory ? { used: win.performance.memory.usedJSHeapSize, total: win.performance.memory.totalJSHeapSize } : 'unavailable')}`);
  log(`Storage: ${JSON.stringify(await navigator.storage.estimate())}`);
  geometry();
  frame.style.width = '320px'; frame.style.height = '568px';
  win.scrollTo(0, 0); await nextPaint();
  geometry();
  check(doc.documentElement.scrollWidth === doc.documentElement.clientWidth, '320px phone has no horizontal overflow');
  check(doc.querySelector('.board-controls').getBoundingClientRect().bottom <= doc.querySelector('.mobile-nav').getBoundingClientRect().top, '320 by 568 phone shows board controls above navigation even after feedback');
});

document.querySelector('#lessons').onclick = run(async () => {
  const db = await new Promise((resolve, reject) => { const request = indexedDB.open('chessdesk-local', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const records = await new Promise((resolve, reject) => { const request = db.transaction('records', 'readonly').objectStore('records').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  db.close();
  const review = records.find((r) => r.kind === 'review' && r.complete && Object.keys(r.learningNotes || {}).length);
  check(Boolean(review), 'a complete real review includes a saved personal takeaway');
  for (const move of review.moves) {
    check(move.playedVariation?.pv?.[0] === move.uci, `ply ${move.ply} played line begins with actual played move`);
    check(variationPositions(move.fenBefore, move.playedVariation.pv).length === move.playedVariation.pv.length + 1, `ply ${move.ply} played line is fully legal from the pre-move board`);
    check(move.playedVariation.score.perspective === move.color && move.bestScore.perspective === move.color && move.whiteScore.perspective === 'w', `ply ${move.ply} score perspectives agree`);
  }
  const backup = JSON.parse(JSON.stringify(makeBackup(records)));
  check(validateBackup(backup).length === records.length, 'actual saved library including takeaways validates after backup JSON serialization');
  const restored = backup.records.find((r) => r.id === review.id);
  check(JSON.stringify(restored.learningNotes) === JSON.stringify(review.learningNotes) && JSON.stringify(restored.moves) === JSON.stringify(review.moves), 'notes and exact engine evidence survive backup serialization');
  log(`Read-only check: ${records.length} QA records; ${review.moves.length} reviewed moves; ${Object.keys(review.learningNotes).length} saved takeaway(s). This is serialization validation, not an import UI round trip.`);
});
