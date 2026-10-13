// Temporary local test page; run after build. A subsequent build removes it.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { rewriteAcceptanceSource, rewriteReleaseSource } from './browser-check-utils.js';
const output = new URL('../dist/__qa__/', import.meta.url);
await mkdir(output, { recursive: true });
const sw = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
const cache = sw.match(/const ENGINE_CACHE = '([^']+)'/)[1];
const db = await readFile(new URL('../src/db.js', import.meta.url), 'utf8');
await writeFile(new URL('db.js', output), db.replace("'chessdesk-local'", "'chessdesk-release-qa'"));
const engine = await readFile(new URL('../src/engine.js', import.meta.url), 'utf8');
await writeFile(new URL('engine.js', output), `const __ENGINE_CACHE_NAME__ = ${JSON.stringify(cache)};\n${engine}`);
await copyFile(new URL('../test/browser/release.html', import.meta.url), new URL('index.html', output));
const releaseSource = await readFile(new URL('../test/browser/release.js', import.meta.url), 'utf8');
await writeFile(new URL('release.js', output), rewriteReleaseSource(releaseSource));
await copyFile(new URL('../node_modules/chess.js/dist/esm/chess.js', import.meta.url), new URL('chess.js', output));
const domain = await readFile(new URL('../src/domain.js', import.meta.url), 'utf8');
await writeFile(new URL('domain.js', output), domain.replace("from 'chess.js'", "from './chess.js'"));
console.log('Local-only browser harness prepared at /__qa__/index.html. Uses a separate QA IndexedDB; rebuild before shipping.');

await copyFile(new URL('../src/practice.js', import.meta.url), new URL('practice.js', output));
await copyFile(new URL('../src/db.js', import.meta.url), new URL('app-db.js', output));
await copyFile(new URL('../test/browser/practice.html', import.meta.url), new URL('practice.html', output));
await copyFile(new URL('../test/browser/practice-ui.js', import.meta.url), new URL('practice-ui.js', output));
await copyFile(new URL('../test/browser/acceptance.html', import.meta.url), new URL('acceptance.html', output));
const acceptanceSource = await readFile(new URL('../test/browser/acceptance.js', import.meta.url), 'utf8');
await writeFile(new URL('acceptance.js', output), rewriteAcceptanceSource(acceptanceSource));
await copyFile(new URL('./browser-check-utils.js', import.meta.url), new URL('browser-check-utils.js', output));
await copyFile(new URL('../test/browser/update-lifecycle.html', import.meta.url), new URL('update-lifecycle.html', output));
await copyFile(new URL('../test/browser/update-lifecycle.js', import.meta.url), new URL('update-lifecycle.js', output));
