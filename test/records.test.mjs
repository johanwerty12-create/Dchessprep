import test from 'node:test';
import assert from 'node:assert/strict';
import { isDuplicateImportedGame, linkedRecordsForGame, repertoireCardExists, supersededReviewIds } from '../src/record-utils.js';

test('re-importing an unchanged PGN and matching game metadata is idempotent', () => {
  const saved = { id: 'game-1', kind: 'game', pgn: '1. e4 e5 *', name: 'A vs B', opponent: 'B', color: 'w' };
  assert.equal(isDuplicateImportedGame(saved, { ...saved, id: 'game-2' }), true);
  assert.equal(isDuplicateImportedGame(saved, { ...saved, id: 'game-2', opponent: 'C' }), false);
  assert.equal(isDuplicateImportedGame(saved, { ...saved, id: 'game-2', pgn: '1. d4 d5 *' }), false);
  assert.equal(isDuplicateImportedGame({ ...saved, kind: 'review' }, saved), false);
});

test('game deletion cascades to linked reviews and training cards only', () => {
  const records = [
    { id: 'game-1', kind: 'game' },
    { id: 'review-1', kind: 'review', gameId: 'game-1' },
    { id: 'card-1', kind: 'training', gameId: 'game-1' },
    { id: 'game-2', kind: 'game' },
    { id: 'card-2', kind: 'training', gameId: 'game-2' },
  ];
  assert.deepEqual(linkedRecordsForGame(records, 'game-1').map((record) => record.id), ['game-1', 'review-1', 'card-1']);
});

test('successful review replacement removes only superseded reviews for that game', () => {
  const records = [
    { id: 'review-old', kind: 'review', gameId: 'game-1' },
    { id: 'review-partial', kind: 'review', gameId: 'game-1' },
    { id: 'review-other-game', kind: 'review', gameId: 'game-2' },
    { id: 'training', kind: 'training', gameId: 'game-1' },
  ];
  assert.deepEqual(supersededReviewIds(records, 'game-1', 'review-partial'), ['review-old']);
});

test('re-adding repertoire practice preserves existing cards and handles renamed lines and legacy backups', () => {
  const line = { id: 'line-1', name: 'Renamed opening' };
  const card = { id: 'card', kind: 'training', sourceType: 'repertoire', sourceLineId: 'line-1', sourceName: 'Old opening name', fen: 'position', targetUci: 'e2e4', reviews: 9, intervalDays: 30 };
  assert.equal(repertoireCardExists([card], line, 'position', 'e2e4'), true);
  assert.equal(repertoireCardExists([{ ...card, sourceLineId: undefined, sourceName: line.name }], line, 'position', 'e2e4'), true);
  assert.equal(repertoireCardExists([card], line, 'position', 'd2d4'), false);
  assert.equal(repertoireCardExists([{ ...card, sourceType: 'critical' }], line, 'position', 'e2e4'), false);
  assert.equal(repertoireCardExists([{ ...card, sourceLineId: 'other-line' }], line, 'position', 'e2e4'), false);
  assert.equal(card.reviews, 9);
});
