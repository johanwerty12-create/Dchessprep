import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stockfish = path.join(root, 'node_modules', 'stockfish');
const dist = path.join(root, 'dist');
const engineDir = path.join(dist, 'engine');
const licenseDir = path.join(dist, 'licenses');
await mkdir(engineDir, { recursive: true });
await mkdir(licenseDir, { recursive: true });
for (const file of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) {
  await cp(path.join(stockfish, 'src', file), path.join(engineDir, file));
}
await cp(path.join(stockfish, 'Copying.txt'), path.join(licenseDir, 'Stockfish-GPL-3.0.txt'));
await cp(path.join(stockfish, 'AUTHORS'), path.join(licenseDir, 'Stockfish-AUTHORS.txt'));
await cp(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(licenseDir, 'THIRD_PARTY_NOTICES.md'));
await writeFile(path.join(licenseDir, 'Stockfish-SOURCE.txt'), [
  'Corresponding source for the unmodified Stockfish.js v18.0.0 release assets bundled with Chessdesk:',
  'Stockfish.js source and build instructions: https://github.com/nmrugg/stockfish.js/tree/v18.0.0',
  'Stockfish.js source archive: https://github.com/nmrugg/stockfish.js/archive/refs/tags/v18.0.0.tar.gz',
  'Underlying Stockfish engine source at upstream commit cb3d4ee: https://github.com/official-stockfish/Stockfish/tree/cb3d4ee',
  '',
].join('\n'));
for (const [packageName, fileName] of [['react', 'LICENSE'], ['react-dom', 'LICENSE'], ['scheduler', 'LICENSE'], ['vite', 'LICENSE.md'], ['chess.js', 'LICENSE']]) {
  const source = path.join(root, 'node_modules', packageName, fileName);
  await cp(source, path.join(licenseDir, `${packageName}-license.txt`));
}
const entries = (await readdir(path.join(dist, 'assets'))).sort();
const pieceEntries = (await readdir(path.join(dist, 'pieces', 'chessnut'))).sort();
const iconEntries = ['icon.svg', 'icon-192.png', 'icon-512.png'];
const offlineUrls = ['/', '/index.html', '/manifest.webmanifest', ...iconEntries.map((entry) => `/icons/${entry}`), ...entries.map((entry) => `/assets/${entry}`), ...pieceEntries.map((entry) => `/pieces/chessnut/${entry}`)];
await writeFile(path.join(dist, 'offline-assets.json'), JSON.stringify(offlineUrls, null, 2));
const appHash = createHash('sha256').update(offlineUrls.join('\n'));
for (const relative of ['index.html', 'manifest.webmanifest', ...iconEntries.map((entry) => `icons/${entry}`), 'sw.js', ...entries.map((entry) => `assets/${entry}`), ...pieceEntries.map((entry) => `pieces/chessnut/${entry}`)]) {
  appHash.update(await readFile(path.join(dist, relative)));
}
const appCacheVersion = appHash.digest('hex').slice(0, 12);
const engineCacheVersion = createHash('sha256')
  .update(await readFile(path.join(engineDir, 'stockfish-18-lite-single.js')))
  .update(await readFile(path.join(engineDir, 'stockfish-18-lite-single.wasm')))
  .digest('hex').slice(0, 12);
const serviceWorkerPath = path.join(dist, 'sw.js');
const serviceWorker = await readFile(serviceWorkerPath, 'utf8');
if (!serviceWorker.includes('__APP_CACHE_VERSION__') || !serviceWorker.includes('__ENGINE_CACHE_VERSION__')) {
  throw new Error('A service worker cache version placeholder is missing.');
}
await writeFile(serviceWorkerPath, serviceWorker
  .replace('__APP_CACHE_VERSION__', appCacheVersion)
  .replace('__ENGINE_CACHE_VERSION__', engineCacheVersion));
