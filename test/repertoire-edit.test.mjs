import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { reconcileRepertoirePractice } from '../src/record-utils.js';
import { duePracticeCards } from '../src/practice.js';
import { makeBackup, validateBackup } from '../src/domain.js';

const line = { id: 'line', kind: 'repertoire', name: 'Original', color: 'w', startFen: new Chess().fen(), moves: ['e4', 'e5', 'Nf3'], pgn: '1. e4 e5 2. Nf3 *' };
const chess = new Chess(); chess.move('e4'); chess.move('e5');
const cards = [
  { id: 'first', kind: 'training', sourceType: 'repertoire', sourceLineId: 'line', sourceName: 'Original', fen: line.startFen, targetUci: 'e2e4', targetSan: 'e4', dueAt: '2020-01-01', repetitions: 4, reviews: 7, practiceLog: [{ id: 'attempt', outcome: 'recalled', at: '2026-10-12T00:00:00Z', playedUci: 'e2e4' }] },
  { id: 'second', kind: 'training', sourceType: 'repertoire', sourceLineId: 'line', sourceName: 'Original', fen: chess.fen(), targetUci: 'g1f3', targetSan: 'Nf3', dueAt: '2020-01-01' },
];
test('repertoire rename preserves practice identity, schedules and recall evidence', () => {
  const updated = reconcileRepertoirePractice(cards, line, { ...line, name: 'Renamed' });
  assert.deepEqual(updated.map((c) => c.id), cards.map((c) => c.id));
  assert.equal(updated[0].sourceName, 'Renamed');
  assert.equal(updated[0].repetitions, 4);
  assert.deepEqual(updated[0].practiceLog, cards[0].practiceLog);
  assert.equal(updated[0].dueAt, cards[0].dueAt);
  assert.equal(cards[0].sourceName, 'Original');
});
test('changed lines pause removed positions without deleting history and reactivate restored positions', () => {
  const shorter = { ...line, moves: ['e4', 'e5'], pgn: '1. e4 e5 *' };
  const updated = reconcileRepertoirePractice(cards, line, shorter);
  assert.equal(updated[0].retiredAt, undefined);
  assert.ok(updated[1].retiredAt);
  assert.deepEqual(duePracticeCards(updated).map((c) => c.id), ['first']);
  assert.equal(validateBackup(makeBackup([shorter, ...updated])).length, 3);
  const restored = reconcileRepertoirePractice(updated, shorter, line);
  assert.equal(restored[1].retiredAt, undefined);
  assert.equal(restored[1].id, 'second');
  assert.equal(restored[1].dueAt, cards[1].dueAt);
});

test('restored notes and paused practice dates reject corrupt values before replacement', () => {
  assert.throws(() => validateBackup(makeBackup([{ id: 'opponent', kind: 'opponent', name: 'Player', notes: { text: 'bad' } }])), /notes are malformed/);
  assert.throws(() => validateBackup(makeBackup([{ ...cards[0], retiredAt: 'invalid' }])), /invalid date/);
});
