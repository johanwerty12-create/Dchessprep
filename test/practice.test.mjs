import test from 'node:test';
import assert from 'node:assert/strict';
import { duePracticeCards, practiceSummary, recordPracticeAttempt, scheduledPracticeCards, validatePracticeLog } from '../src/practice.js';
import { makeBackup, validateBackup } from '../src/domain.js';

const now = Date.parse('2026-10-12T10:00:00Z');
const base = { id: 'card', kind: 'training', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', targetUci: 'e2e4', createdAt: new Date(now).toISOString(), dueAt: new Date(now).toISOString() };

test('short practice takes the five oldest due cards without including future or invalid dates', () => {
  const cards = Array.from({ length: 8 }, (_, i) => ({ ...base, id: String(i), dueAt: new Date(now - i * 1000).toISOString() }));
  cards.push({ ...base, id: 'future', dueAt: new Date(now + 1).toISOString() }, { ...base, id: 'invalid', dueAt: 'bad' });
  assert.deepEqual(duePracticeCards(cards, now, 5).map((c) => c.id), ['7', '6', '5', '4', '3']);
  assert.equal(cards.length, 10);
});

test('saved schedule shows due cards first, upcoming by date, and paused positions last', () => {
  const now = Date.parse('2026-10-13T00:00:00.000Z');
  const cards = [
    { id: 'paused', kind: 'training', dueAt: '2026-10-01T00:00:00.000Z', retiredAt: '2026-10-02T00:00:00.000Z' },
    { id: 'late', kind: 'training', dueAt: '2026-10-12T00:00:00.000Z' },
    { id: 'future-late', kind: 'training', dueAt: '2026-10-20T00:00:00.000Z' },
    { id: 'future-soon', kind: 'training', dueAt: '2026-10-14T00:00:00.000Z' },
    { id: 'unrelated', kind: 'game', dueAt: '2026-10-01T00:00:00.000Z' },
  ];
  assert.deepEqual(scheduledPracticeCards(cards, now).map((card) => card.id), ['late', 'future-soon', 'future-late', 'paused']);
});

test('unaided recall advances spacing, while hint, miss and reveal return in ten minutes', () => {
  let card = recordPracticeAttempt(base, { id: 'one', outcome: 'recalled', playedUci: 'e2e4' }, now);
  assert.equal(card.intervalDays, 1);
  card = recordPracticeAttempt(card, { id: 'two', outcome: 'recalled', playedUci: 'e2e4' }, now + 86400000);
  assert.equal(card.intervalDays, 6);
  for (const outcome of ['assisted', 'missed', 'revealed']) {
    const result = recordPracticeAttempt(card, { id: outcome, outcome, playedUci: 'e2e4' }, now);
    assert.equal(result.repetitions, 0);
    assert.equal(Date.parse(result.dueAt), now + 600000);
    assert.notEqual(result.lastQuality, 5);
  }
  assert.equal(base.practiceLog, undefined);
});

test('retrying the same saved attempt cannot advance schedule or duplicate history', () => {
  const attempt = { id: 'retry-safe', outcome: 'recalled', playedUci: 'e2e4' };
  const saved = recordPracticeAttempt(base, attempt, now);
  assert.deepEqual(recordPracticeAttempt(saved, attempt, now + 5000), saved);
});

test('practice history is bounded and the summary excludes old, future and untracked legacy attempts', () => {
  let card = { ...base, reviews: 100 };
  assert.equal(practiceSummary([card], now).total, 0);
  for (let i = 0; i < 35; i++) card = recordPracticeAttempt(card, { id: String(i), outcome: i % 2 ? 'assisted' : 'recalled' }, now - i * 1000);
  assert.equal(card.practiceLog.length, 30);
  assert.deepEqual(practiceSummary([card], now), { total: 30, recalled: 15, assisted: 15, revisit: 0 });
  assert.equal(practiceSummary([card], now + 8 * 86400000).total, 0);
  assert.equal(practiceSummary([card], now - 86400000).total, 0);
});

test('backup round trip preserves recall evidence and rejects malformed or illegal practice history', () => {
  const saved = recordPracticeAttempt(base, { id: 'one', outcome: 'recalled', playedUci: 'e2e4' }, now);
  const roundtrip = JSON.parse(JSON.stringify(makeBackup([saved])));
  assert.deepEqual(validateBackup(roundtrip)[0].practiceLog, saved.practiceLog);
  for (const patch of [{ outcome: 'mastered' }, { at: 'bad' }, { playedUci: 'e2e5' }, { id: '' }]) {
    const invalid = { ...saved, practiceLog: [{ ...saved.practiceLog[0], ...patch }] };
    assert.throws(() => validateBackup(makeBackup([invalid])), /practice history/);
  }
  assert.equal(validatePracticeLog(undefined, ['e2e4']), true);
  assert.equal(validatePracticeLog([saved.practiceLog[0], saved.practiceLog[0]], ['e2e4']), false);
});
