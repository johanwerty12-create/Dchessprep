import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { acceptableReviewMoves, classifyMove, compareRepertoireLine, evaluationGraphValues, formatScore, invertScore, parsePgn, parsePgnTree, resumableReviewPlyCount, REVIEW_METHOD, reviewUsesCurrentMethod, sameUciMove, scoreAsCp, scoreToWhite, serializePgnTree, terminalScore, validateBackup, makeBackup, variationPositions, variationUci } from '../src/domain.js';
import { parseUciInfo } from '../src/engine.js';
import { studyMainlineResult, withReviewLearningNote } from '../src/domain.js';

test('replays legal SAN and retains PGN comments and mainline', () => {
  const parsed = parsePgn('[Event "Club"]\n[White "A"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 {question} 1-0');
  assert.deepEqual(parsed.mainline.map((move) => move.san), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  assert.equal(parsed.result, '1-0');
  assert.equal(parsed.positions.length, 7);
  assert.match(parsed.pgn, /question/);
});

test('parses legal PGN variations and exports a branchable RAV tree', () => {
  const parsed = parsePgn('[Event "RAV"]\n[Result "*"]\n\n1. e4 (1. d4 d5 2. c4) e5 2. Nf3 (2. Bc4 Nc6) Nc6 *');
  assert.equal(parsed.root.children.length, 2);
  assert.deepEqual(parsed.mainline.map((move) => move.san), ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.equal(parsed.root.children[1].san, 'd4');
  assert.equal(parsed.root.children[0].children[0].children[1].san, 'Bc4');
  const pgn = serializePgnTree(parsed, parsed.headers);
  const again = parsePgn(pgn);
  assert.deepEqual(again.mainline.map((move) => move.san), parsed.mainline.map((move) => move.san));
  assert.equal(again.root.children.length, 2);
  assert.equal(again.root.children[0].children[0].children.length, 2);
});

test('handles castling, en passant, promotion, and non-starting FEN positions', () => {
  const castle = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O *');
  assert.equal(castle.mainline.at(-1).san, 'O-O');
  const ep = parsePgn('[SetUp "1"]\n[FEN "rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3"]\n[Result "*"]\n\n3. exd6 *');
  assert.equal(ep.mainline[0].san, 'exd6');
  assert.equal(new Chess(ep.positions[1].fen).get('d5'), undefined);
  const promotion = parsePgn('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n[Result "*"]\n\n1. a8=Q+ *');
  assert.equal(promotion.mainline[0].promotion, 'q');
  assert.equal(new Chess(promotion.positions[1].fen).get('a8').type, 'q');
});

test('chess.js adjudicates checkmate, stalemate, threefold repetition, and the fifty-move rule', () => {
  const mate = new Chess('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');
  assert.equal(mate.isCheckmate(), true);
  const stalemate = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(stalemate.isStalemate(), true);
  const repetition = new Chess();
  for (let cycle = 0; cycle < 2; cycle++) for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) repetition.move(san);
  assert.equal(repetition.isThreefoldRepetition(), true);
  assert.equal(repetition.isDraw(), true);
  const fiftyMove = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 100 51');
  assert.equal(fiftyMove.isDrawByFiftyMoves(), true);
  assert.equal(fiftyMove.isDraw(), true);
});

test('rejects malformed and illegal PGN instead of saving it', () => {
  assert.throws(() => parsePgn('1. e4 e5 2. e5 *'), /Illegal|could not be validated/);
  assert.throws(() => parsePgn(''), /Paste a PGN/);
  assert.throws(() => parsePgnTree('1. e4 (1. Zz9) e5 *'), /Illegal or unsupported move/);
});

test('move quality thresholds vary by material phase and treat forced mate separately', () => {
  assert.equal(classifyMove({ kind: 'cp', value: 80 }, { kind: 'cp', value: 60 }, 'opening').label, 'Best');
  assert.equal(classifyMove({ kind: 'cp', value: 100 }, { kind: 'cp', value: 60 }, 'middlegame').label, 'Good');
  assert.equal(classifyMove({ kind: 'cp', value: 200 }, { kind: 'cp', value: 100 }, 'middlegame').label, 'Mistake');
  assert.equal(classifyMove({ kind: 'cp', value: 250 }, { kind: 'cp', value: 0 }, 'endgame').label, 'Blunder');
  assert.equal(classifyMove({ kind: 'mate', value: 3 }, { kind: 'cp', value: 200 }, 'middlegame').label, 'Unrated', 'positive centipawns do not prove that a forced mate was lost');
  assert.equal(classifyMove({ kind: 'mate', value: 5 }, { kind: 'mate', value: 10 }, 'middlegame').label, 'Inaccuracy');
  assert.equal(classifyMove({ kind: 'mate', value: -8 }, { kind: 'mate', value: -10 }, 'middlegame').label, 'Best defense');
  assert.equal(classifyMove({ kind: 'mate', value: -8 }, { kind: 'mate', value: -4 }, 'middlegame').label, 'Mistake');
  assert.equal(classifyMove({ kind: 'mate', value: -8 }, { kind: 'mate', value: -1 }, 'middlegame').label, 'Blunder');
});

test('UCI scores retain their side-to-move perspective and convert once to mover and White POV', () => {
  const whiteRoot = parseUciInfo('info depth 14 score cp 125 nodes 100 pv e2e4');
  const blackRoot = parseUciInfo('info depth 14 score mate -3 nodes 100 pv e7e5');
  const terminalMate = parseUciInfo('info depth 0 score mate 0');
  const bounded = parseUciInfo('info depth 14 score cp 125 lowerbound nodes 100 pv e2e4');
  assert.deepEqual(whiteRoot.score, { kind: 'cp', value: 125, perspective: 'side-to-move' });
  assert.deepEqual(blackRoot.score, { kind: 'mate', value: -3, perspective: 'side-to-move' });
  assert.deepEqual(terminalMate.score, { kind: 'mate', value: 0, perspective: 'side-to-move' }, 'UCI mate zero parses without being mistaken for a win/loss sign');
  assert.equal(bounded.score, null, 'an aspiration-window bound is not treated as a final evaluation');
  assert.equal(bounded.bound, 'lower');
  const afterBlackMove = { kind: 'cp', value: -85, perspective: 'w' };
  const blackMoverScore = invertScore(afterBlackMove);
  assert.deepEqual(blackMoverScore, { kind: 'cp', value: 85, perspective: 'b' });
  assert.deepEqual(scoreToWhite(blackMoverScore, 'b'), { kind: 'cp', value: -85, perspective: 'w' });
  assert.equal(scoreAsCp({ kind: 'mate', value: 4 }), null, 'mate is not coerced into fabricated centipawns');
  assert.equal(formatScore({ kind: 'mate', value: 3, perspective: 'w' }), '+M3');
  assert.equal(formatScore({ kind: 'mate', value: -3, perspective: 'b' }), '−M3');
});

test('Scholar’s Mate checkmate is a terminal White win, not a missed win or negative graph score', () => {
  const parsed = parsePgn('[Event "Scholar\'s Mate"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
  assert.equal(parsed.mainline.at(-1).san, 'Qxf7#');
  const final = new Chess(parsed.positions.at(-1).fen);
  assert.equal(final.isCheckmate(), true);
  const played = terminalScore(final, 'w', { finalResult: parsed.result });
  assert.deepEqual(played, { kind: 'terminal', result: 'win', termination: 'checkmate', winner: 'w', perspective: 'w' });
  assert.deepEqual(scoreToWhite(played, 'w'), played);
  assert.deepEqual(evaluationGraphValues([{ ply: 8, whiteScore: played }]), [{ ply: 0, value: null }, { ply: 8, value: null }], 'terminal wins do not become fake ±5-pawn graph points');
  assert.equal(classifyMove({ kind: 'mate', value: 1, perspective: 'w' }, played, 'opening', { equivalent: true }).label, 'Best');
  assert.equal(formatScore(played), 'Win · checkmate');
  assert.equal(parsed.positions.length, parsed.mainline.length + 1, 'FEN at ply n is after ply n; analysis must use indices n−1/n');
});

test('Fool’s Mate records Black’s win while keeping a White-perspective terminal result', () => {
  const parsed = parsePgn('[Event "Fool\'s Mate"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  const final = new Chess(parsed.positions.at(-1).fen);
  assert.equal(final.isCheckmate(), true);
  const blackMover = terminalScore(final, 'b', { finalResult: parsed.result });
  assert.equal(blackMover.result, 'win');
  assert.deepEqual(scoreToWhite(blackMover, 'b'), { ...blackMover, result: 'loss', perspective: 'w' });
  assert.equal(classifyMove({ kind: 'mate', value: 1, perspective: 'b' }, blackMover, 'opening', { equivalent: true }).label, 'Best');
});

test('mate avoidance and mate-distance comparisons never mix mate scores with centipawns', () => {
  assert.equal(classifyMove({ kind: 'mate', value: -8 }, { kind: 'cp', value: -500, perspective: 'w' }).label, 'Best defense');
  assert.equal(classifyMove({ kind: 'mate', value: -8 }, { kind: 'mate', value: -10 }).label, 'Best defense');
  assert.equal(classifyMove({ kind: 'mate', value: 2 }, { kind: 'mate', value: 2 }).label, 'Best');
  assert.equal(classifyMove({ kind: 'mate', value: 2 }, { kind: 'mate', value: 3 }).label, 'Good');
  assert.equal(classifyMove({ kind: 'mate', value: 2 }, { kind: 'cp', value: 150 }).label, 'Unrated', 'a shallow non-mate score cannot disprove a forced win');
  assert.deepEqual(evaluationGraphValues([{ ply: 1, bestScore: { kind: 'mate', value: 5, perspective: 'w' }, color: 'w', whiteScore: { kind: 'mate', value: 5, perspective: 'w' } }]), [{ ply: 0, value: null }, { ply: 1, value: null }], 'mate-in-N stays categorical instead of being clamped to the graph limit');
  assert.equal(classifyMove({ kind: 'cp', value: 100 }, { kind: 'cp', value: 100 }).lossCp, 0);
  assert.equal(classifyMove({ kind: 'cp', value: 100, perspective: 'w' }, { kind: 'cp', value: -100, perspective: 'b' }).label, 'Unrated', 'opposite POV values are never subtracted as if they shared a perspective');
});

test('evaluation graph starts from the engine score before the first move in White perspective', () => {
  assert.deepEqual(evaluationGraphValues([
    { ply: 1, color: 'b', bestScore: { kind: 'cp', value: 35, perspective: 'b' }, whiteScore: { kind: 'cp', value: -20, perspective: 'w' } },
  ]), [{ ply: 0, value: -0.35 }, { ply: 1, value: -0.2 }]);
});

test('partial reviews resume only when configuration and every saved move still match the PGN', () => {
  const parsed = parsePgn('1. e4 e5 2. Nf3 Nc6 *');
  const config = { gameId: 'g1', positions: parsed.positions, mainline: parsed.mainline, depth: 12, movetime: 0, multipv: 2, engineBuild: `Stockfish 18 · ${REVIEW_METHOD}` };
  const move = parsed.mainline[0];
  const partial = {
    id: 'r1', kind: 'review', reviewMethod: REVIEW_METHOD, gameId: 'g1', complete: false, totalPlies: 4,
    engineBuild: `Stockfish 18 · ${REVIEW_METHOD}`, depth: 12, movetime: null, multipv: 2,
    moves: [{ ply: 1, san: move.san, uci: variationUci(move), color: move.color, fenBefore: parsed.positions[0].fen, fenAfter: parsed.positions[1].fen, scoreStage: REVIEW_METHOD, bestScore: { kind: 'cp', value: 20, perspective: 'w' }, playedScore: { kind: 'cp', value: 10, perspective: 'w' }, whiteScore: { kind: 'cp', value: 10, perspective: 'w' } }],
  };
  assert.equal(reviewUsesCurrentMethod(partial), true);
  assert.equal(reviewUsesCurrentMethod({ ...partial, reviewMethod: undefined }), false, 'older persisted score methods are never silently presented as current');
  assert.equal(resumableReviewPlyCount(partial, config), 1);
  assert.equal(resumableReviewPlyCount(partial, { ...config, depth: 16 }), null);
  assert.equal(resumableReviewPlyCount({ ...partial, moves: [{ ...partial.moves[0], playedScore: { kind: 'cp', value: 10, perspective: 'b' } }] }, config), null, 'reviews with mixed score POV cannot be resumed');
  assert.equal(resumableReviewPlyCount({ ...partial, moves: [{ ...partial.moves[0], fenAfter: 'corrupt' }] }, config), null);
  assert.equal(resumableReviewPlyCount({ ...partial, complete: true }, config), null);
});

test('stalemate and final rule draws are terminal draws, and a forced win lost to stalemate is a missed win', () => {
  const stalemate = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  const drawn = terminalScore(stalemate, 'w', { finalResult: '1/2-1/2' });
  assert.deepEqual(drawn, { kind: 'terminal', result: 'draw', termination: 'stalemate', winner: null, perspective: 'w' });
  assert.equal(classifyMove({ kind: 'mate', value: 3 }, drawn).label, 'Missed win');
  const fiftyMove = new Chess('8/8/8/8/8/2k5/8/2K4R w - - 100 51');
  assert.equal(terminalScore(fiftyMove, 'w', { finalResult: '1/2-1/2' }).result, 'draw');
  assert.equal(terminalScore(fiftyMove, 'w', { finalResult: '*' }), null, 'a claimable draw is not treated as an automatic game end without a drawn PGN result');
  const insufficient = new Chess('8/8/8/8/8/8/4k3/7K w - - 0 1');
  assert.equal(terminalScore(insufficient, 'b').termination, 'insufficient material');
  const repetition = new Chess();
  for (let cycle = 0; cycle < 2; cycle++) for (const san of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) repetition.move(san);
  assert.equal(terminalScore(repetition, 'w', { finalResult: '1/2-1/2' }).termination, 'repetition or draw rule');
});

test('equal evaluations and a played UCI identical to the engine best move are never penalized', () => {
  const score = { kind: 'cp', value: 42, perspective: 'w' };
  assert.equal(classifyMove(score, score).label, 'Best');
  assert.equal(sameUciMove('h5f7', 'h5f7'), true);
  assert.equal(sameUciMove('h5f7', 'h5f6'), false);
  assert.equal(classifyMove({ kind: 'mate', value: 1 }, null, 'opening', { equivalent: sameUciMove('h5f7', 'h5f7') }).label, 'Best');
  assert.equal(classifyMove({ kind: 'cp', value: 250 }, { kind: 'cp', value: -50 }, 'endgame', { equivalent: true }).label, 'Best');
});

test('validates a whole backup before restore', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 *';
  const record = { id: 'game-1', kind: 'game', pgn, moveCount: 4 };
  assert.deepEqual(validateBackup(makeBackup([record])), [record]);
  assert.throws(() => validateBackup({ format: 'chessdesk-backup', schemaVersion: 1, records: [{ ...record }, { ...record }] }), /duplicate/);
  assert.throws(() => validateBackup(makeBackup([{ ...record, pgn: '1. e4 Qh9 *' }])), /Illegal|could not be validated/);
  assert.throws(() => validateBackup(makeBackup([{ id: 'card-1', kind: 'training', fen: 'not a fen' }])), /invalid FEN/);
});

test('corrupted backup metadata and broken links are rejected before library replacement', () => {
  const game = { id: 'game', kind: 'game', pgn: '1. e4 e5 *', moveCount: 2 };
  assert.throws(() => validateBackup(makeBackup([{ ...game, moveCount: undefined }])), /move count/);
  assert.throws(() => validateBackup(makeBackup([{ ...game, moveCount: 99 }])), /move count/);
  assert.throws(() => validateBackup(makeBackup([{ id: 'review', kind: 'review', gameId: 'missing', moves: [] }])), /missing game/);
  assert.throws(() => validateBackup(makeBackup([{ id: 'line', kind: 'repertoire', name: 'Bad', color: 'w', moves: ['e4', 'e4'] }])), /invalid position or move/);
  assert.throws(() => validateBackup(makeBackup([{ id: 'card', kind: 'training', fen: new Chess().fen(), targetUci: 'e2e5' }])), /illegal target/);
  assert.throws(() => validateBackup(makeBackup([{ id: 'opponent', kind: 'opponent' }])), /name/);
  const review = { id: 'review', kind: 'review', gameId: game.id, moves: [] };
  assert.deepEqual(validateBackup(makeBackup([game, review])), [game, review]);
});

test('UCI move encoding includes promotion suffix', () => {
  const parsed = parsePgn('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n[Result "*"]\n\n1. a8=Q+ *');
  assert.equal(variationUci(parsed.mainline[0]), 'a7a8q');
});

test('principal variations replay as legal positions and stop safely at an invalid UCI move', () => {
  const parsed = parsePgn('1. e4 e5 *');
  const positions = variationPositions(parsed.startFen, ['e2e4', 'e7e5', 'e5e4']);
  assert.equal(positions.length, 3);
  assert.equal(positions.at(-1).fen, parsed.positions.at(-1).fen);
});

test('repertoire comparisons require the prepared side and match legal transpositions by position', () => {
  const line = parsePgn('1. e4 e5 2. Nf3 *');
  const exactGame = parsePgn('1. e4 e5 2. Nf3 Nc6 *');
  assert.deepEqual(compareRepertoireLine(line, exactGame, 'w', 'b'), { matched: true, type: 'exact', linePly: 0, gamePly: 0, matchedPlies: 3, linePlies: 3 });

  const transposedLine = parsePgn('1. Nf3 d5 2. g3 c5 3. Bg2 *');
  const transposedGame = parsePgn('1. g3 d5 2. Nf3 c5 3. Bg2 *');
  assert.deepEqual(compareRepertoireLine(transposedLine, transposedGame, 'w', 'b'), { matched: true, type: 'transposition', linePly: 4, gamePly: 4, matchedPlies: 1, linePlies: 1 });
  assert.equal(compareRepertoireLine(line, exactGame, 'b', 'b').reason, 'color-mismatch');
  assert.equal(compareRepertoireLine(line, exactGame, 'w', '').reason, 'unknown-opponent-color');
});

test('critical-moment training accepts only stored lines within the documented best/good band', () => {
  const entry = {
    bestUci: 'e2e4', phase: 'middlegame', bestScore: { kind: 'cp', value: 100, perspective: 'w' },
    lines: [
      { pv: ['e2e4'], score: { kind: 'cp', value: 100, perspective: 'w' } },
      { pv: ['d2d4'], score: { kind: 'cp', value: 75, perspective: 'w' } },
      { pv: ['c2c4'], score: { kind: 'cp', value: 49, perspective: 'w' } },
      { pv: ['g1f3'], score: { kind: 'cp', value: 0, perspective: 'b' } },
    ],
  };
  assert.deepEqual(acceptableReviewMoves(entry), ['e2e4', 'd2d4']);
});

test('saved study result follows its mainline terminal board, never the current side branch or a claimable draw', () => {
  assert.equal(studyMainlineResult(parsePgnTree('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# *').root), '1-0');
  assert.equal(studyMainlineResult(parsePgnTree('1. f3 e5 2. g4 Qh4# *').root), '0-1');
  const root = { fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', children: [{ san: 'Qe6', children: [] }] };
  assert.equal(studyMainlineResult(root), '1/2-1/2');
  assert.equal(studyMainlineResult(parsePgnTree('1. e4 e5 2. Nf3 (2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#) Nc6 *').root), '*');
  assert.equal(studyMainlineResult(parsePgnTree('1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *').root), '*');
});

test('personal takeaways survive backups without changing engine evidence or previous notes', () => {
  const game = { id: 'lesson-game', kind: 'game', pgn: '1. e4 e5 *', moveCount: 2 };
  const move = { ply: 1, bestScore: { kind: 'cp', value: 30, perspective: 'w' }, playedScore: { kind: 'cp', value: 25, perspective: 'w' }, playedVariation: { pv: ['e2e4', 'e7e5'], san: 'e4 e5' }, label: 'Best' };
  const review = { id: 'lesson-review', kind: 'review', gameId: game.id, totalPlies: 2, moves: [move], learningNotes: { 2: 'Check their reply.' } };
  const noted = withReviewLearningNote(review, 1, '  Check forcing moves first.  ');
  assert.equal(noted.learningNotes[1], 'Check forcing moves first.');
  assert.equal(noted.learningNotes[2], review.learningNotes[2]);
  assert.equal(noted.moves, review.moves);
  assert.equal(review.learningNotes[1], undefined);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(makeBackup([game, noted]))))[1], noted);
  assert.equal(withReviewLearningNote(noted, 1, '').learningNotes[1], undefined);
  assert.throws(() => withReviewLearningNote(review, 0, 'invalid ply'), /analyzed move/);
  assert.throws(() => withReviewLearningNote(review, 1, 'x'.repeat(1001)), /1,000/);
  assert.throws(() => validateBackup(makeBackup([game, { ...review, learningNotes: { 3: 'out of range' } }])), /notes/);
});
