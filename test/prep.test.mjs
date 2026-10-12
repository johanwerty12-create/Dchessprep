import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOpponentGames, opponentColor } from '../src/prep.js';

const game = (id, moves, extras = {}) => ({ id, kind: 'game', white: 'Player', black: 'Opponent', opponent: 'Opponent', pgn: moves, createdAt: '2026-10-12T00:00:00Z', ...extras });

test('two distinct opening rows render without treating Sets as arrays', () => {
  const rows = summarizeOpponentGames([game('a', '1. e4 e5 2. Nf3 Nc6 *'), game('b', '1. d4 d5 2. c4 e6 *')]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.transposed), [[], []]);
  assert.ok(rows.every((r) => r.count === 1 && r.colors.b === 1));
});

test('legal opening transpositions connect different move orders at the same position', () => {
  const rows = summarizeOpponentGames([
    game('a', '1. Nf3 d5 2. g3 Nf6 3. Bg2 g6 4. O-O Bg7 *'),
    game('b', '1. g3 d5 2. Nf3 Nf6 3. Bg2 g6 4. O-O Bg7 *'),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].transposed, [rows[1].prefix]);
  assert.deepEqual(rows[1].transposed, [rows[0].prefix]);
});

test('opening counts, opponent color and continuation frequency use actual compatible games', () => {
  const prefix = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6';
  const games = [game('a', prefix + ' 5. O-O Be7 *'), game('b', prefix + ' 5. O-O Be7 *'), game('c', prefix + ' 5. d3 b5 *'), game('bad', '1. e5 *')];
  const rows = summarizeOpponentGames(games, 'b');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].count, 3);
  assert.equal(rows[0].typicalContinuation, 'O-O Be7');
  assert.equal(summarizeOpponentGames(games, 'w').length, 0);
  assert.equal(opponentColor({ opponent: 'unknown', white: 'A', black: 'B' }), '');
  assert.equal(summarizeOpponentGames([game('u', '1. e4 *', { opponent: 'unknown' })])[0].colors.unknown, 1);
});
