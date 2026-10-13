const ENGINE_JS = '/engine/stockfish-18-lite-single.js';
const ENGINE_WASM = '/engine/stockfish-18-lite-single.wasm';
const ENGINE_CACHE = typeof __ENGINE_CACHE_NAME__ === 'string' ? __ENGINE_CACHE_NAME__ : 'chessdesk-engine-sf18-v1';
const ENGINE_VERSION = 'Stockfish 18';
const ENGINE_ASSET_BYTES = new Map([[ENGINE_JS, 20_670], [ENGINE_WASM, 7_295_411]]);
const ENGINE_ASSET_SHA256 = new Map([
  [ENGINE_JS, '2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe'],
  [ENGINE_WASM, 'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1'],
]);
const START_TIMEOUT_MS = 20_000;
const SEARCH_TIMEOUT_MS = 120_000;
const LIVE_SEARCH_TIMEOUT_MS = 5 * 60_000;

function scoreFromInfo(line) {
  const match = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  if (!match) return null;
  // UCI scores are always reported from the root position's side-to-move POV.
  return { kind: match[1], value: Number(match[2]), perspective: 'side-to-move' };
}

function parseInfo(line) {
  const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1] || 0);
  const multipv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1] || 1);
  const nodes = Number(line.match(/\bnodes\s+(\d+)/)?.[1] || 0);
  const time = Number(line.match(/\btime\s+(\d+)/)?.[1] || 0);
  const pv = line.match(/\bpv\s+(.+)$/)?.[1]?.trim().split(/\s+/) || [];
  const bound = /\blowerbound\b/.test(line) ? 'lower' : /\bupperbound\b/.test(line) ? 'upper' : null;
  return { depth, multipv, nodes, time, pv, score: bound ? null : scoreFromInfo(line), bound, raw: line };
}

function timeoutPromise(milliseconds, label) {
  return new Promise((_resolve, reject) => setTimeout(() => reject(new Error(`${label} timed out. Restart the engine and try again.`)), milliseconds));
}

async function cacheEngineAsset(url, onProgress, signal) {
  const cache = await caches.open(ENGINE_CACHE);
  const expectedBytes = ENGINE_ASSET_BYTES.get(url);
  const expectedDigest = ENGINE_ASSET_SHA256.get(url);
  const matchesDigest = async (buffer) => {
    if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify the Stockfish files. Open Chessdesk over HTTPS and retry.');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
    return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('') === expectedDigest;
  };
  const existing = await cache.match(url);
  if (existing) {
    const cachedBody = await existing.clone().arrayBuffer();
    if (cachedBody.byteLength === expectedBytes && await matchesDigest(cachedBody)) {
      onProgress?.({ loaded: expectedBytes, total: expectedBytes, cached: true, asset: url });
      return existing;
    }
    await cache.delete(url);
  }
  const response = await fetch(url, { cache: 'no-cache', signal });
  if (!response.ok) throw new Error(`Could not download the chess engine (${response.status}). Check the connection and retry.`);
  const makeCacheResponse = (blob, bytes) => {
    const headers = new Headers();
    headers.set('content-type', response.headers.get('content-type') || (url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'));
    headers.set('content-length', String(bytes));
    return new Response(blob, { status: response.status, statusText: response.statusText, headers });
  };
  // Content-Length can describe a compressed transfer, while Fetch exposes the decoded body.
  const declaredLength = Number(response.headers.get('content-length')) || 0;
  const total = declaredLength === expectedBytes ? declaredLength : expectedBytes;
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size !== expectedBytes || !await matchesDigest(await blob.arrayBuffer())) {
      await cache.delete(url);
      throw new Error('The Stockfish 18 download did not match the verified package. Reconnect and retry the engine download.');
    }
    const cached = makeCacheResponse(blob, blob.size);
    await cache.put(url, cached.clone());
    onProgress?.({ loaded: blob.size, total: total || blob.size, cached: false, asset: url });
    return cached;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    if (signal?.aborted) { await reader.cancel(); throw new DOMException('Engine download cancelled.', 'AbortError'); }
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total, cached: false, asset: url });
  }
  if (loaded !== expectedBytes) {
    await cache.delete(url);
    throw new Error('The Stockfish 18 download was incomplete. Reconnect and retry the engine download.');
  }
  const blob = new Blob(chunks);
  if (!await matchesDigest(await blob.arrayBuffer())) {
    await cache.delete(url);
    throw new Error('The downloaded Stockfish 18 files failed their integrity check. Reconnect and retry.');
  }
  const cached = makeCacheResponse(blob, loaded);
  await cache.put(url, cached.clone());
  return cached;
}

export class StockfishEngine {
  constructor({ onStatus, onInfo } = {}) {
    this.onStatus = onStatus;
    this.onInfo = onInfo;
    this.worker = null;
    this.pending = [];
    this.ready = false;
    this.busy = false;
    this.name = '';
    this.search = null;
    this.starting = null;
  }

  async ensureEngine({ onDownload, signal } = {}) {
    if (this.ready) return this.name;
    if (this.starting) return this.starting;
    this.starting = this.#start({ onDownload, signal }).finally(() => { this.starting = null; });
    return this.starting;
  }

  async #start({ onDownload, signal }) {
    if (!('Worker' in globalThis) || !('WebAssembly' in globalThis)) throw new Error('This browser does not support the local Stockfish WebAssembly engine.');
    if (!('indexedDB' in globalThis) || !('caches' in globalThis)) throw new Error('Offline engine caching is not available in this browser.');
    const controller = new AbortController();
    let rejectCancelled;
    const cancelled = new Promise((_resolve, reject) => { rejectCancelled = reject; });
    const relayAbort = () => {
      controller.abort();
      rejectCancelled(new DOMException('Engine startup cancelled.', 'AbortError'));
    };
    signal?.addEventListener('abort', relayAbort, { once: true });
    try {
      if (signal?.aborted) relayAbort();
      this.onStatus?.('engine-download');
      await Promise.all([
        cacheEngineAsset(ENGINE_JS, onDownload, controller.signal),
        cacheEngineAsset(ENGINE_WASM, onDownload, controller.signal),
      ]);
      if (signal?.aborted) throw new DOMException('Engine download cancelled.', 'AbortError');
      this.onStatus?.('engine-starting');
      this.worker = new Worker(ENGINE_JS, { name: 'stockfish-18-analysis' });
      this.worker.addEventListener('message', (event) => this.#onMessage(String(event.data)));
      this.worker.addEventListener('error', () => this.#fail(new Error('Stockfish stopped unexpectedly. You can restart the engine and retry.')));
      this.worker.addEventListener('messageerror', () => this.#fail(new Error('The engine returned an unreadable message and was restarted.')));
      this.#post('uci');
      await Promise.race([this.#waitFor((line) => line === 'uciok', START_TIMEOUT_MS, 'Stockfish initialization'), timeoutPromise(START_TIMEOUT_MS, 'Stockfish initialization'), cancelled]);
      if (!/Stockfish\s+18\b/i.test(this.name)) {
        this.#terminate();
        throw new Error(`Engine identity check failed. Expected Stockfish 18; received “${this.name || 'unknown engine'}”.`);
      }
      this.#post('setoption name Threads value 1');
      this.#post('setoption name Hash value 32');
      this.#post('isready');
      await Promise.race([this.#waitFor((line) => line === 'readyok', 10_000, 'Stockfish readiness'), timeoutPromise(10_000, 'Stockfish readiness'), cancelled]);
      this.ready = true;
      this.onStatus?.('ready');
      return this.name;
    } catch (error) {
      controller.abort();
      this.#terminate(error);
      this.onStatus?.(error?.name === 'AbortError' ? 'idle' : 'failed');
      throw error;
    } finally {
      signal?.removeEventListener('abort', relayAbort);
    }
  }

  #post(command) {
    if (!this.worker) throw new Error('The Stockfish worker is not running.');
    this.worker.postMessage(command);
  }

  #waitFor(predicate, timeoutMs, label) {
    return new Promise((resolve, reject) => {
      const entry = { predicate, resolve, reject, timer: setTimeout(() => {
        this.pending = this.pending.filter((item) => item !== entry);
        reject(new Error(`${label} timed out. Restart the engine and try again.`));
      }, timeoutMs) };
      this.pending.push(entry);
    });
  }

  #onMessage(line) {
    if (line.startsWith('id name ')) this.name = line.slice(8).trim();
    if (line.startsWith('info ')) {
      const info = parseInfo(line);
      if (info.score && this.search) {
        const rootedInfo = { ...info, score: { ...info.score, perspective: this.search.perspective }, rootFen: this.search.fen };
        this.search.lines.set(info.multipv, rootedInfo);
        this.onInfo?.({ ...rootedInfo, currentLines: [...this.search.lines.values()] });
      } else if (info.score) this.onInfo?.(info);
    }
    for (const entry of [...this.pending]) {
      let matched = false;
      try { matched = entry.predicate(line); } catch { /* a parser error never escapes a worker event */ }
      if (matched) {
        clearTimeout(entry.timer);
        this.pending = this.pending.filter((item) => item !== entry);
        entry.resolve(line);
      }
    }
    if (line.startsWith('bestmove ')) {
      const search = this.search;
      if (!search) return;
      this.search = null;
      clearTimeout(search.timer);
      const bestmove = line.split(/\s+/)[1];
      search.resolve({ bestmove, variations: [...search.lines.values()].sort((a, b) => a.multipv - b.multipv) });
    }
  }

  async analyze(fen, { depth = 12, movetime, multipv = 2, searchMoves = [], infinite = false } = {}) {
    if (this.busy) throw new Error('Stockfish is already analyzing another position. Wait for that search or stop it first.');
    this.busy = true;
    try {
      if (!this.ready) await this.ensureEngine();
      const allowedMoves = Array.isArray(searchMoves) ? searchMoves : [];
      if (allowedMoves.some((move) => !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) throw new Error('Stockfish received an invalid restricted move.');
      const lines = new Map();
      const perspective = fen.trim().split(/\s+/)[1] === 'b' ? 'b' : 'w';
      this.#post(`setoption name MultiPV value ${Math.max(1, Math.min(3, multipv))}`);
      this.#post('isready');
      await Promise.race([this.#waitFor((line) => line === 'readyok', 10_000, 'Stockfish readiness'), timeoutPromise(10_000, 'Stockfish readiness')]);
      this.#post(`position fen ${fen}`);
      const finish = new Promise((resolve, reject) => {
        this.search = { lines, perspective, fen, resolve, reject, timer: setTimeout(() => this.#fail(new Error(`Stockfish ${infinite ? 'live analysis' : 'analysis'} exceeded its safety limit. Restart the engine and try again.`)), infinite ? LIVE_SEARCH_TIMEOUT_MS : SEARCH_TIMEOUT_MS) };
      });
      this.onStatus?.('analyzing');
      const limit = infinite ? 'infinite' : movetime ? `movetime ${Math.max(50, Math.min(5_000, Math.round(movetime)))}` : `depth ${Math.max(6, Math.min(24, Math.round(depth)))}`;
      const searchMovesText = allowedMoves.length ? ` searchmoves ${allowedMoves.join(' ')}` : '';
      this.#post(`go ${limit}${searchMovesText}`);
      return await finish;
    } finally {
      this.busy = false;
      if (!this.search && this.ready) this.onStatus?.('ready');
    }
  }

  async stop() {
    if (!this.search || !this.worker) return null;
    const current = this.search;
    this.#post('stop');
    const guard = setTimeout(() => {
      if (this.search === current) this.#fail(new Error('Stockfish did not stop cleanly and has been restarted.'));
    }, 3_000);
    try { return await Promise.race([new Promise((resolve) => {
      const original = current.resolve;
      current.resolve = (result) => { original(result); resolve(result); };
    }), timeoutPromise(4_000, 'Stockfish cancellation')]); }
    finally { clearTimeout(guard); }
  }

  cancel() {
    if (this.search && this.worker) {
      try { this.#post('stop'); } catch { /* the worker may already be gone */ }
    }
  }

  restart() {
    this.#terminate(new DOMException('Stockfish was restarted.', 'AbortError'));
    this.onStatus?.('idle');
  }

  #fail(error) {
    const search = this.search;
    this.search = null;
    if (search) { clearTimeout(search.timer); search.reject(error); }
    for (const entry of this.pending) { clearTimeout(entry.timer); entry.reject(error); }
    this.pending = [];
    this.#terminate();
    this.onStatus?.('failed');
  }

  #terminate(reason = new Error('Stockfish worker was stopped.')) {
    if (this.search) {
      clearTimeout(this.search.timer);
      this.search.reject(reason);
      this.search = null;
    }
    for (const entry of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(reason);
    }
    this.pending = [];
    this.ready = false;
    if (this.worker) {
      try { this.worker.postMessage('quit'); this.worker.terminate(); } catch { /* best-effort shutdown */ }
    }
    this.worker = null;
  }
}

export function parseUciInfo(line) { return parseInfo(line); }
export { cacheEngineAsset };
export { ENGINE_JS, ENGINE_WASM, ENGINE_VERSION };
