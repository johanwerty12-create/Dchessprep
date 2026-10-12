import test from 'node:test';
import assert from 'node:assert/strict';
import { patchTournamentRound } from '../src/record-utils.js';
import { createSerialTaskQueue } from '../src/task-queue.js';

const base = { id: 'event', kind: 'tournament', name: 'Open', date: '2026-10-20', rounds: [{ id: 'round', number: '1', opponent: 'Player', status: 'planned', notes: 'Preserve this preparation', tasks: [{ id: 'a', done: false }, { id: 'b', done: false }] }] };

test('rapid task and status updates preserve both tasks, notes and event date', async () => {
  let saved = base;
  const queue = createSerialTaskQueue();
  const update = (patch) => queue('event', async () => {
    const current = saved;
    await new Promise((r) => setTimeout(r, 2));
    saved = patchTournamentRound(current, 'round', patch);
  });
  await Promise.all([update({ taskId: 'a', done: true }), update({ taskId: 'b', done: true }), update({ status: 'prepared' })]);
  assert.deepEqual(saved.rounds[0].tasks.map((t) => t.done), [true, true]);
  assert.equal(saved.date, base.date);
  assert.equal(saved.rounds[0].notes, base.rounds[0].notes);
  assert.equal(saved.rounds[0].status, 'prepared');
  assert.equal(base.rounds[0].status, 'planned');
});

test('invalid round/task patches cannot silently change saved preparation', () => {
  assert.throws(() => patchTournamentRound(base, 'missing', { status: 'played' }), /no longer/);
  assert.throws(() => patchTournamentRound(base, 'round', { taskId: 'missing', done: true }), /no longer/);
  assert.throws(() => patchTournamentRound(base, 'round', { status: 'bad' }), /Invalid/);
  assert.equal(base.rounds[0].tasks[0].done, false);
});
