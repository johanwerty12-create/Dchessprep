import test from 'node:test';
import assert from 'node:assert/strict';
import { createSerialTaskQueue } from '../src/task-queue.js';

test('rapid additions for one game observe saved cards and cannot create duplicate positions', async () => {
  const queue = createSerialTaskQueue();
  const saved = new Set();
  const add = (plies) => queue('game', async () => {
    const newPlies = plies.filter((ply) => !saved.has(ply));
    await new Promise((r) => setTimeout(r, 2));
    newPlies.forEach((ply) => saved.add(ply));
    return newPlies.length;
  });
  assert.deepEqual(await Promise.all([add([2, 4]), add([2, 4]), add([4, 6])]), [2, 0, 1]);
  assert.deepEqual([...saved], [2, 4, 6]);
});

test('failed source writes do not prevent retry, and independent sources can continue', async () => {
  const queue = createSerialTaskQueue();
  let release;
  const slow = queue('a', () => new Promise((r) => release = r));
  const independent = queue('b', () => 'ready');
  assert.equal(await independent, 'ready');
  release(); await slow;
  await assert.rejects(queue('a', () => { throw new Error('full'); }), /full/);
  assert.equal(await queue('a', () => 'retried'), 'retried');
});
