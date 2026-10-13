import { Chess } from 'chess.js';
import { variationUci } from './domain.js';

export function isDuplicateImportedGame(existing, incoming) {
  // The saved name is a display label (and multi-game imports add a sequence
  // suffix). It must not turn the same PGN plus import metadata into a new game.
  return existing?.kind === 'game'
    && incoming?.kind === 'game'
    && existing.pgn === incoming.pgn
    && (existing.opponent || '') === (incoming.opponent || '')
    && (existing.color || '') === (incoming.color || '');
}

export function deduplicateImportedGames(existing = [], incoming = []) {
  const seen = existing.filter((record) => record?.kind === 'game');
  const unique = [];
  const duplicates = [];
  for (const game of incoming) {
    if (seen.some((saved) => isDuplicateImportedGame(saved, game))) duplicates.push(game);
    else { unique.push(game); seen.push(game); }
  }
  return { unique, duplicates };
}

export function linkedRecordsForGame(records, gameId) {
  return records.filter((record) => record.id === gameId || record.gameId === gameId);
}

export function supersededReviewIds(records, gameId, replacementId) {
  return records
    .filter((record) => record.kind === 'review' && record.gameId === gameId && record.id !== replacementId)
    .map((record) => record.id);
}

export function repertoireCardExists(records, line, fen, targetUci) {
  return records.some((record) => record.kind === 'training' && record.sourceType === 'repertoire'
    && record.fen === fen && record.targetUci === targetUci
    && (record.sourceLineId === line.id || (!record.sourceLineId && record.sourceName === line.name)));
}


export function reconcileRepertoirePractice(records, previous, next, now = new Date().toISOString()) {
  const chess = new Chess(next.startFen);
  const positions = new Set();
  for (const san of next.moves) {
    const fen = chess.fen();
    const move = chess.move(san, { strict: true });
    if (move.color === next.color) positions.add(`${fen}|${variationUci(move)}`);
  }
  return records.filter((card) => card.kind === 'training' && card.sourceType === 'repertoire'
    && (card.sourceLineId === previous.id || (!card.sourceLineId && card.sourceName === previous.name)))
    .map((card) => {
      const updated = { ...card, sourceLineId: next.id, sourceName: next.name, name: `${next.name} · ${card.targetSan}`, updatedAt: now };
      if (positions.has(`${card.fen}|${card.targetUci}`)) { delete updated.retiredAt; delete updated.retirementReason; }
      else { updated.retiredAt = card.retiredAt || now; updated.retirementReason = 'Prepared line changed'; }
      return updated;
    });
}

export function patchTournamentRound(tournament, roundId, patch) {
  if (!tournament.rounds?.some((round) => round.id === roundId)) throw new Error('That round no longer exists.');
  if (patch.status != null && !['planned', 'prepared', 'played'].includes(patch.status)) throw new Error('Invalid round status.');
  return { ...tournament, updatedAt: new Date().toISOString(), rounds: tournament.rounds.map((round) => {
    if (round.id !== roundId) return round;
    if (patch.taskId) {
      if (typeof patch.done !== 'boolean' || !round.tasks?.some((task) => task.id === patch.taskId)) throw new Error('That preparation task no longer exists.');
      return { ...round, tasks: round.tasks.map((task) => task.id === patch.taskId ? { ...task, done: patch.done } : task) };
    }
    return { ...round, ...(patch.status != null ? { status: patch.status } : {}) };
  }) };
}
