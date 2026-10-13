import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rewriteAcceptanceSource, rewriteReleaseSource, withWindowConfirm } from '../scripts/browser-check-utils.js';

test('prepared browser acceptance imports its staged production helpers', async () => {
  const source = await readFile(new URL('./browser/acceptance.js', import.meta.url), 'utf8');
  const prepared = rewriteAcceptanceSource(source);

  assert.match(prepared, /from '\.\/app-db\.js'/);
  assert.match(prepared, /from '\.\/practice\.js'/);
  assert.match(prepared, /from '\.\/browser-check-utils\.js'/);
  assert.doesNotMatch(prepared, /from '\.\.\/\.\.\/src\//);
});

test('browser acceptance keeps a confirmation stub until async persistence finishes', async () => {
  const originalConfirm = () => false;
  const windowRef = { confirm: originalConfirm };
  let result;

  await withWindowConfirm(windowRef, () => true, async () => {
    await Promise.resolve();
    result = windowRef.confirm('Replace the local library?');
  });

  assert.equal(result, true);
  assert.equal(windowRef.confirm, originalConfirm);
});

test('prepared release browser checks use the staged genuine engine and domain modules', async () => {
  const source = await readFile(new URL('./browser/release.js', import.meta.url), 'utf8');
  const prepared = rewriteReleaseSource(source);

  assert.match(prepared, /from '\.\/engine\.js'/);
  assert.match(prepared, /from '\.\/domain\.js'/);
  assert.doesNotMatch(prepared, /from '\.\.\/\.\.\/src\//);
});

test('service-worker failure checks use the new app cache after successful activation', async () => {
  const source = await readFile(new URL('./browser/update-lifecycle.js', import.meta.url), 'utf8');

  assert.match(source, /const activeApp = keys\.find\(\(key\) => key\.startsWith\('chessdesk-app-'\)\)/);
  assert.match(source, /JSON\.stringify\(\{ \.\.\.baseline, app: activeApp \}\)/);
});
