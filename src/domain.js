import { validatePracticeLog } from './practice.js';
import { Chess, validateFen } from 'chess.js';

export const APP_VERSION = 1;
export const MAX_PGN_BYTES = 5_000_000;
export const MAX_GAME_PLIES = 2_000;

export function makeId(prefix = 'item') {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
}

export function cleanText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function tokenizePgnMoves(text) {
  const tokens = [];
  const pattern = /\{[^}]*\}|;[^\r\n]*|\$\d+|\(|\)|1-0|0-1|1\/2-1\/2|\*|\d+\.(?:\.\.)?|[^\s(){};$]+/g;
  for (const match of text.matchAll(pattern)) tokens.push(match[0]);
  return tokens;
}

function parseHeaders(pgn) {
  const headers = {};
  const pattern = /^\s*\[([A-Za-z][A-Za-z0-9_]*)\s+"((?:\\.|[^"\\])*)"\s*\]\s*$/gm;
  const moveText = pgn.replace(pattern, (_all, key, value) => {
    headers[key] = value.replace(/\\(["\\])/g, '$1');
    return '';
  });
  return { headers, moveText };
}

export function parsePgnTree(input, options = {}) {
  const pgn = String(input ?? '');
  const byteLength = new TextEncoder().encode(pgn).byteLength;
  if (!pgn.trim()) throw new Error('Paste a PGN before importing.');
  if (byteLength > (options.maxBytes ?? MAX_PGN_BYTES)) throw new Error('This PGN is larger than 5 MB. Split large databases into smaller imports.');

  const { headers, moveText } = parseHeaders(pgn);
  const startFen = headers.SetUp === '1' && headers.FEN ? headers.FEN : new Chess().fen();
  const validFen = validateFen(startFen);
  if (!validFen.ok) throw new Error(`The PGN starting position is invalid: ${validFen.error}`);
  const root = { id: 'root', san: '', fen: startFen, comment: '', nags: [], children: [], parent: null, ply: 0, headers };
  let current = root;
  let previous = null;
  const stack = [];
  let plies = 0;
  let result = headers.Result || '*';

  for (const raw of tokenizePgnMoves(moveText)) {
    if (raw.startsWith(';')) continue;
    if (raw.startsWith('{')) {
      current.comment = `${current.comment}${current.comment ? ' ' : ''}${raw.slice(1, -1).trim()}`.slice(0, 2_000);
      continue;
    }
    if (/^\$\d+$/.test(raw)) {
      current.nags.push(Number(raw.slice(1)));
      continue;
    }
    if (raw === '(') {
      if (!previous?.parent) throw new Error('The PGN contains a variation without a move to branch from.');
      stack.push({ current, previous });
      current = previous.parent;
      previous = null;
      continue;
    }
    if (raw === ')') {
      const resume = stack.pop();
      if (!resume) throw new Error('The PGN contains an unmatched closing parenthesis.');
      current = resume.current;
      previous = resume.previous;
      continue;
    }
    if (/^(?:\d+\.(?:\.\.)?|1-0|0-1|1\/2-1\/2|\*)$/.test(raw)) {
      if (/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(raw)) result = raw;
      continue;
    }
    if (/^[!?]{1,2}$/.test(raw)) {
      current.nags.push(raw);
      continue;
    }
    if (/^e\.?p\.?$/i.test(raw)) continue;
    if (++plies > (options.maxPlies ?? MAX_GAME_PLIES)) throw new Error(`This game exceeds the ${MAX_GAME_PLIES.toLocaleString()}-ply safety limit.`);

    const san = raw.replace(/[!?]+$/g, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
    const position = new Chess(current.fen);
    let move;
    try {
      move = position.move(san, { strict: true });
    } catch {
      throw new Error(`Illegal or unsupported move “${raw}” at ply ${plies}. Check the PGN notation and starting FEN.`);
    }
    const node = {
      id: `p${plies}_${current.children.length}`,
      san: move.san,
      fen: position.fen(),
      from: move.from,
      to: move.to,
      color: move.color,
      comment: '',
      nags: [],
      children: [],
      parent: current,
      ply: current.ply + 1,
      move,
    };
    current.children.push(node);
    current = node;
    previous = node;
  }
  if (stack.length) throw new Error('The PGN contains an unmatched opening parenthesis.');
  if (plies === 0) throw new Error('No legal moves were found in this PGN.');

  const mainline = [];
  for (let node = root.children[0]; node; node = node.children[0]) mainline.push(node);
  const replay = new Chess(startFen);
  const positions = [{ fen: startFen, ply: 0, move: null }];
  for (const node of mainline) {
    const move = replay.move(node.san, { strict: true });
    positions.push({ fen: replay.fen(), ply: positions.length, move });
  }
  return { headers, result, root, mainline, positions, startFen, pgn };
}

export function parsePgn(input) {
  const parsed = parsePgnTree(input);
  const replay = new Chess(parsed.startFen);
  try {
    // chess.js validates game metadata, SAN, and terminal markers as a second independent pass.
    replay.loadPgn(input, { strict: true });
  } catch (error) {
    throw new Error(`PGN could not be validated: ${error.message}`);
  }
  const mainline = replay.history({ verbose: true });
  if (!mainline.length) throw new Error('No legal moves were found in this PGN.');
  return { ...parsed, mainline, positions: buildPositions(parsed.startFen, mainline) };
}

export function buildPositions(startFen, mainline) {
  const chess = new Chess(startFen);
  const positions = [{ fen: chess.fen(), ply: 0, move: null }];
  for (const move of mainline) {
    const next = chess.move(move.san ?? move, { strict: true });
    positions.push({ fen: chess.fen(), ply: positions.length, move: next });
  }
  return positions;
}

function formatMoveNumber(node) {
  const moveNumber = Math.ceil(node.ply / 2);
  return node.ply % 2 ? `${moveNumber}.` : `${moveNumber}...`;
}

function lineFrom(node, includeNumber = true) {
  const parts = [];
  let cursor = node;
  let first = true;
  while (cursor) {
    if (includeNumber || !first && cursor.ply % 2 === 1) parts.push(formatMoveNumber(cursor));
    parts.push(cursor.san);
    if (cursor.comment) parts.push(`{ ${cursor.comment.replace(/[{}]/g, '')} }`);
    for (const sibling of cursor.parent?.children.slice(1) ?? []) {
      if (sibling === cursor) continue;
      parts.push(`(${lineFrom(sibling)})`);
    }
    cursor = cursor.children[0] ?? null;
    first = false;
    includeNumber = true;
  }
  return parts.join(' ');
}

export function serializePgnTree(tree, headers = {}) {
  const tags = { ...headers };
  if (tree.root.fen !== new Chess().fen()) {
    tags.SetUp = '1';
    tags.FEN = tree.root.fen;
  }
  const headerText = Object.entries(tags).map(([key, value]) => `[${key} "${String(value).replace(/["\\]/g, '\\$&')}"]`).join('\n');
  const body = tree.root.children.length ? lineFrom(tree.root.children[0]) : '';
  return `${headerText}${headerText ? '\n\n' : ''}${body} ${headers.Result ?? '*'}`.trim();
}

export function studyMainlineResult(root) {
  const chess = new Chess(root.fen);
  for (let node = root.children?.[0]; node; node = node.children?.[0]) chess.move(node.san, { strict: true });
  if (chess.isCheckmate()) return chess.turn() === 'b' ? '1-0' : '0-1';
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return '1/2-1/2';
  // Claimable repetition/fifty-move draws and resignation cannot be inferred.
  return '*';
}

export function gameFromPgn(pgn, extra = {}) {
  const parsed = parsePgn(pgn);
  const headers = parsed.headers;
  const now = new Date().toISOString();
  const moves = parsed.mainline.map((move) => move.san);
  const openingKey = moves.slice(0, 8).join(' ');
  return {
    id: makeId('game'),
    kind: 'game',
    name: cleanText(extra.name || `${headers.White || 'White'} vs ${headers.Black || 'Black'}`, 120),
    white: cleanText(headers.White || '', 100),
    black: cleanText(headers.Black || '', 100),
    whiteElo: cleanText(headers.WhiteElo || '', 12),
    blackElo: cleanText(headers.BlackElo || '', 12),
    result: cleanText(parsed.result, 16),
    event: cleanText(headers.Event || '', 120),
    date: cleanText(headers.Date || '', 32),
    site: cleanText(headers.Site || '', 120),
    eco: cleanText(headers.ECO || '', 12),
    opening: cleanText(headers.Opening || (openingKey ? `${openingKey}${moves.length > 8 ? ' …' : ''}` : 'Unclassified line'), 160),
    openingKey,
    pgn: parsed.pgn,
    startFen: parsed.startFen,
    moveCount: parsed.mainline.length,
    opponent: cleanText(extra.opponent || '', 100),
    color: extra.color === 'b' ? 'b' : extra.color === 'w' ? 'w' : '',
    createdAt: now,
    updatedAt: now,
  };
}

export function materialPhase(fen) {
  const chess = new Chess(fen);
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const remaining = chess.board().flat().reduce((sum, piece) => sum + (piece ? values[piece.type] : 0), 0);
  if (remaining >= 58) return 'opening';
  if (remaining >= 26) return 'middlegame';
  return 'endgame';
}

export const LOSS_THRESHOLDS = {
  opening: { excellent: 20, good: 40, inaccuracy: 75, mistake: 170 },
  middlegame: { excellent: 25, good: 50, inaccuracy: 90, mistake: 190 },
  endgame: { excellent: 30, good: 60, inaccuracy: 105, mistake: 210 },
};

export const REVIEW_METHOD = 'same-root-move-v2';

export function reviewUsesCurrentMethod(review) {
  return review?.kind === 'review' && review.reviewMethod === REVIEW_METHOD && Array.isArray(review.moves) && review.moves.every((move) => move?.scoreStage === REVIEW_METHOD);
}

export function scoreAsCp(score) {
  if (!score) return null;
  if (score.kind === 'cp') return score.value;
  return null;
}

function oppositePerspective(perspective) {
  return perspective === 'w' ? 'b' : perspective === 'b' ? 'w' : perspective;
}

export function invertScore(score) {
  if (!score) return null;
  if (score.kind === 'terminal') {
    const result = score.result === 'win' ? 'loss' : score.result === 'loss' ? 'win' : score.result;
    return { ...score, result, perspective: oppositePerspective(score.perspective) };
  }
  return { ...score, value: -score.value, perspective: oppositePerspective(score.perspective) };
}

export function scoreToWhite(score, moverColor) {
  if (!score) return null;
  const sourcePerspective = score.perspective === 'w' || score.perspective === 'b' ? score.perspective : moverColor;
  const whiteScore = sourcePerspective === 'w' ? score : invertScore(score);
  return { ...whiteScore, perspective: 'w' };
}

export function terminalScore(chess, perspective, { finalResult = '*' } = {}) {
  let termination = '';
  let winner = null;
  if (chess.isCheckmate()) {
    termination = 'checkmate';
    winner = chess.turn() === 'w' ? 'b' : 'w';
  } else if (chess.isStalemate()) termination = 'stalemate';
  else if (chess.isInsufficientMaterial()) termination = 'insufficient material';
  else if (finalResult === '1/2-1/2' && chess.isDraw()) termination = chess.isDrawByFiftyMoves() ? '50-move rule' : 'repetition or draw rule';
  if (!termination) return null;
  return {
    kind: 'terminal',
    result: winner ? (winner === perspective ? 'win' : 'loss') : 'draw',
    termination,
    winner,
    perspective,
  };
}

function classification(label, phase, lossCp = null) { return { label, lossCp, phase }; }

export function classifyMove(bestScore, playedScore, phase = 'middlegame', { equivalent = false } = {}) {
  if (equivalent) return classification(bestScore?.kind === 'mate' && bestScore.value < 0 ? 'Best defense' : 'Best', phase, bestScore?.kind === 'cp' ? 0 : null);
  if (!bestScore || !playedScore) return { label: 'Unrated', lossCp: null, phase };
  if (bestScore.perspective && playedScore.perspective && bestScore.perspective !== playedScore.perspective) return { label: 'Unrated', lossCp: null, phase };
  if (bestScore.kind === 'terminal') return { label: 'Unrated', lossCp: null, phase };

  if (playedScore.kind === 'terminal') {
    if (playedScore.result === 'win') return classification(bestScore.kind === 'mate' && bestScore.value < 0 ? 'Best defense' : 'Best', phase);
    if (playedScore.result === 'loss') return classification(bestScore.kind === 'mate' && bestScore.value > 0 ? 'Missed win' : 'Blunder', phase);
    if (bestScore.kind === 'mate' && bestScore.value > 0) return classification('Missed win', phase);
    if (bestScore.kind === 'mate' && bestScore.value < 0) return classification('Best defense', phase);
    const bestCp = scoreAsCp(bestScore);
    if (bestCp == null || bestCp <= 0) return classification('Best defense', phase, 0);
    const thresholds = LOSS_THRESHOLDS[phase] ?? LOSS_THRESHOLDS.middlegame;
    if (bestCp <= thresholds.excellent) return classification('Best', phase, bestCp);
    if (bestCp <= thresholds.good) return classification('Good', phase, bestCp);
    if (bestCp <= thresholds.inaccuracy) return classification('Inaccuracy', phase, bestCp);
    if (bestCp <= thresholds.mistake) return classification('Mistake', phase, bestCp);
    return classification('Blunder', phase, bestCp);
  }

  if (bestScore.kind === 'mate' && bestScore.value > 0) {
    if (playedScore.kind === 'cp') {
      if (playedScore.value <= 0) return classification('Missed win', phase);
      return classification('Unrated', phase);
    }
    if (playedScore.kind !== 'mate' || playedScore.value <= 0) return classification('Missed win', phase);
    const slowerBy = Math.max(0, playedScore.value - bestScore.value);
    if (slowerBy === 0) return classification('Best', phase);
    if (slowerBy === 1) return classification('Good', phase);
    if (slowerBy <= 5) return classification('Inaccuracy', phase);
    if (slowerBy <= 10) return classification('Mistake', phase);
    return classification('Blunder', phase);
  }
  if (bestScore.kind === 'mate' && bestScore.value < 0 && playedScore.kind === 'mate' && playedScore.value < 0) {
    const bestDistance = Math.abs(bestScore.value);
    const playedDistance = Math.abs(playedScore.value);
    if (playedDistance >= bestDistance) return classification('Best defense', phase);
    const acceleratedMate = bestDistance - playedDistance;
    if (acceleratedMate <= 2) return classification('Inaccuracy', phase);
    if (acceleratedMate <= 5) return classification('Mistake', phase);
    return classification('Blunder', phase);
  }
  if (bestScore.kind === 'mate' && bestScore.value < 0 && !(playedScore.kind === 'mate' && playedScore.value < 0)) {
    return classification('Best defense', phase);
  }
  if (playedScore.kind === 'mate' && playedScore.value < 0) return classification('Blunder', phase);
  if (playedScore.kind === 'mate' && playedScore.value > 0) return classification('Best', phase);

  const bestCp = scoreAsCp(bestScore);
  const playedCp = scoreAsCp(playedScore);
  if (bestCp == null || playedCp == null) return { label: 'Unrated', lossCp: null, phase };
  const lossCp = Math.max(0, bestCp - playedCp);
  const thresholds = LOSS_THRESHOLDS[phase] ?? LOSS_THRESHOLDS.middlegame;
  if (lossCp <= thresholds.excellent) return classification('Best', phase, lossCp);
  if (lossCp <= thresholds.good) return classification('Good', phase, lossCp);
  if (lossCp <= thresholds.inaccuracy) return classification('Inaccuracy', phase, lossCp);
  if (lossCp <= thresholds.mistake) return classification('Mistake', phase, lossCp);
  return classification('Blunder', phase, lossCp);
}

export function acceptableReviewMoves(entry) {
  const candidates = [entry?.bestUci];
  for (const line of entry?.lines ?? []) {
    const uci = line?.pv?.[0];
    if (!uci || !line.score) continue;
    const label = classifyMove(entry.bestScore, line.score, entry.phase).label;
    if (['Best', 'Good', 'Best defense'].includes(label)) candidates.push(uci);
  }
  return [...new Set(candidates.filter((uci) => typeof uci === 'string' && uci))];
}

export function formatScore(score) {
  if (!score) return '—';
  if (score.kind === 'terminal') return score.result === 'draw' ? `Draw · ${score.termination}` : `${score.result === 'win' ? 'Win' : 'Loss'} · ${score.termination}`;
  if (score.kind === 'mate') return score.value > 0 ? `+M${score.value}` : score.value < 0 ? `−M${Math.abs(score.value)}` : 'M0';
  const pawns = score.value / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export function variationUci(move) {
  if (!move) return '';
  return `${move.from}${move.to}${move.promotion || ''}`;
}

export function variationPositions(fen, pv = []) {
  const chess = new Chess(fen);
  const positions = [{ fen: chess.fen(), move: null }];
  for (const uci of pv) {
    const candidate = chess.moves({ verbose: true }).find((move) => variationUci(move) === uci);
    if (!candidate) break;
    const move = chess.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion });
    positions.push({ fen: chess.fen(), move });
  }
  return positions;
}

function positionKey(fen) { return String(fen || '').trim().split(/\s+/).slice(0, 5).join(' '); }

export function compareRepertoireLine(prepared, game, preparedColor, opponentSide) {
  if (opponentSide !== 'w' && opponentSide !== 'b') return { matched: false, reason: 'unknown-opponent-color' };
  if ((preparedColor !== 'w' && preparedColor !== 'b') || preparedColor === opponentSide) return { matched: false, reason: 'color-mismatch' };
  if (!prepared?.positions?.length || !prepared?.mainline || !game?.positions?.length || !game?.mainline) return { matched: false, reason: 'invalid-line' };

  let best = null;
  for (let lineIndex = 0; lineIndex < prepared.positions.length; lineIndex++) {
    const key = positionKey(prepared.positions[lineIndex]?.fen);
    if (!key) continue;
    for (let gameIndex = 0; gameIndex < game.positions.length; gameIndex++) {
      if (positionKey(game.positions[gameIndex]?.fen) !== key) continue;
      let matchedPlies = 0;
      while (lineIndex + matchedPlies < prepared.mainline.length && gameIndex + matchedPlies < game.mainline.length && variationUci(prepared.mainline[lineIndex + matchedPlies]) === variationUci(game.mainline[gameIndex + matchedPlies])) matchedPlies++;
      if (matchedPlies && (!best || matchedPlies > best.matchedPlies)) {
        best = {
          matched: true,
          type: lineIndex === 0 && gameIndex === 0 ? 'exact' : 'transposition',
          linePly: lineIndex,
          gamePly: gameIndex,
          matchedPlies,
          linePlies: prepared.mainline.length - lineIndex,
        };
      }
    }
  }
  return best || { matched: false, reason: 'line-not-reached' };
}

export function sameUciMove(first, second) {
  return typeof first === 'string' && typeof second === 'string' && first.trim().toLowerCase() !== '' && first.trim().toLowerCase() === second.trim().toLowerCase();
}

export function evaluationGraphValues(moves) {
  const initial = moves[0]?.bestScore ? scoreToWhite(moves[0].bestScore, moves[0].color) : null;
  return [
    { ply: 0, value: initial?.kind === 'cp' ? initial.value / 100 : null },
    ...moves.map((move) => ({ ply: move.ply, value: move.whiteScore?.kind === 'cp' ? move.whiteScore.value / 100 : null })),
  ];
}

export function resumableReviewPlyCount(review, { gameId, positions, mainline, depth, movetime, multipv, engineBuild }) {
  if (!review || review.kind !== 'review' || review.complete || review.gameId !== gameId) return null;
  if (!reviewUsesCurrentMethod(review)) return null;
  if (review.engineBuild !== engineBuild || review.depth !== (movetime ? null : depth) || review.movetime !== (movetime || null) || review.multipv !== multipv) return null;
  if (!Array.isArray(review.moves) || review.moves.length > mainline.length || review.totalPlies !== mainline.length) return null;
  for (let index = 0; index < review.moves.length; index++) {
    const saved = review.moves[index];
    const played = mainline[index];
    if (saved?.ply !== index + 1 || saved?.san !== played?.san || saved?.uci !== variationUci(played) || saved?.fenBefore !== positions[index]?.fen || saved?.fenAfter !== positions[index + 1]?.fen || saved?.color !== played?.color) return null;
    if (!saved.bestScore || !saved.playedScore || !saved.whiteScore || !['cp', 'mate', 'terminal'].includes(saved.playedScore.kind)) return null;
    if (saved.bestScore.perspective !== saved.color || saved.playedScore.perspective !== saved.color || saved.whiteScore.perspective !== 'w') return null;
  }
  return review.moves.length;
}

export function makeBackup(records) {
  return { format: 'chessdesk-backup', schemaVersion: APP_VERSION, exportedAt: new Date().toISOString(), records };
}

export function withReviewLearningNote(review, ply, value) {
  if (review?.kind !== 'review' || !Number.isInteger(ply) || !review.moves?.some((move) => move.ply === ply)) throw new Error('Choose an analyzed move before saving a takeaway.');
  if (typeof value !== 'string' || value.length > 1000) throw new Error('Keep a takeaway to 1,000 characters or fewer.');
  const learningNotes = { ...(review.learningNotes || {}) };
  const text = value.trim();
  if (text) learningNotes[ply] = text;
  else delete learningNotes[ply];
  return { ...review, learningNotes };
}

export function validateBackup(value) {
  if (!value || value.format !== 'chessdesk-backup' || value.schemaVersion !== APP_VERSION || !Array.isArray(value.records)) {
    throw new Error(`This is not a Chessdesk version ${APP_VERSION} backup.`);
  }
  if (value.records.length > 50_000) throw new Error('This backup contains too many records to restore safely.');
  const ids = new Set();
  for (const record of value.records) {
    if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id)) throw new Error('The backup has a missing or duplicate record ID.');
    if (!['game', 'review', 'opponent', 'repertoire', 'training', 'tournament'].includes(record.kind)) throw new Error('The backup contains an unsupported record type.');
    ids.add(record.id);
    if (record.kind === 'game') {
      const parsed = parsePgn(record.pgn);
      if (!Number.isInteger(record.moveCount) || record.moveCount !== parsed.mainline.length || record.moveCount < 1 || record.moveCount > MAX_GAME_PLIES) throw new Error('A saved game has an invalid move count.');
    }
    if (record.kind === 'review' && (!Array.isArray(record.moves) || record.moves.length > MAX_GAME_PLIES)) throw new Error('A saved review has an invalid move list.');
    if (record.kind === 'review' && record.learningNotes != null && (typeof record.learningNotes !== 'object' || Array.isArray(record.learningNotes) || Object.entries(record.learningNotes).some(([ply, note]) => !/^\d+$/.test(ply) || Number(ply) < 1 || Number(ply) > (record.totalPlies || record.moves.length) || typeof note !== 'string' || note.length > 1000))) throw new Error('Saved learning notes are malformed.');
    if (record.kind === 'repertoire' && (!Array.isArray(record.moves) || !record.moves.every((move) => typeof move === 'string'))) throw new Error('A repertoire line is malformed.');
    if (record.kind === 'training' && typeof record.fen !== 'string') throw new Error('A training position is missing its FEN.');
    if (record.kind === 'training' && !validateFen(record.fen).ok) throw new Error('A training position has an invalid FEN.');
    if (record.kind === 'repertoire') {
      if (!['w', 'b'].includes(record.color)) throw new Error('A repertoire line has an invalid color.');
      try { const chess = new Chess(record.startFen); for (const san of record.moves) chess.move(san, { strict: true }); }
      catch { throw new Error('A repertoire line contains an invalid position or move.'); }
    }
    if (record.kind === 'training') {
      const legal = new Chess(record.fen).moves({ verbose: true }).map(variationUci);
      if (!validatePracticeLog(record.practiceLog, legal)) throw new Error('A practice history is malformed.');
      if (record.retiredAt != null && (typeof record.retiredAt !== 'string' || !Number.isFinite(Date.parse(record.retiredAt)))) throw new Error('A paused practice position has an invalid date.');
      if (!legal.includes(record.targetUci) || (record.acceptableUci && (!Array.isArray(record.acceptableUci) || record.acceptableUci.some((uci) => !legal.includes(uci))))) throw new Error('A training position has an illegal target move.');
    }
    if (['opponent', 'repertoire', 'tournament'].includes(record.kind) && (typeof record.name !== 'string' || !record.name.trim())) throw new Error('A saved record is missing its name.');
    if (record.kind === 'opponent' && record.notes != null && (typeof record.notes !== 'string' || record.notes.length > 2000)) throw new Error('Opponent notes are malformed.');
    if (record.kind === 'tournament' && record.rounds != null && (!Array.isArray(record.rounds) || record.rounds.some((round) => !round || typeof round.opponent !== 'string' || (round.tasks != null && !Array.isArray(round.tasks))))) throw new Error('Tournament round notes are malformed.');
  }
  const gameIds = new Set(value.records.filter((record) => record.kind === 'game').map((record) => record.id));
  for (const record of value.records) {
    if ((record.kind === 'review' || record.gameId != null) && !gameIds.has(record.gameId)) throw new Error('A review or training record references a missing game.');
  }
  return value.records;
}

export function openingPrefix(moves, count = 8) {
  return (moves ?? []).slice(0, count).join(' ');
}
