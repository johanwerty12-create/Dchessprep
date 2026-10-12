import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const engineSource = path.join(projectRoot, 'node_modules', 'stockfish', 'src');
const engineCacheVersion = createHash('sha256')
  .update(await readFile(path.join(engineSource, 'stockfish-18-lite-single.js')))
  .update(await readFile(path.join(engineSource, 'stockfish-18-lite-single.wasm')))
  .digest('hex').slice(0, 12);

export default defineConfig({
  base: '/',
  define: { __ENGINE_CACHE_NAME__: JSON.stringify(`chessdesk-engine-${engineCacheVersion}`) },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
  },
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
