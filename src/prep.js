import { studyDateKey } from './dates.js';
import { parsePgn } from './domain.js';

export function opponentColor(game) {
  if (game.color === 'w' || game.color === 'b') return game.color;
  if (game.opponent && game.white?.toLowerCase() === game.opponent.toLowerCase()) return 'w';
  if (game.opponent && game.black?.toLowerCase() === game.opponent.toLowerCase()) return 'b';
  return '';
}

export function summarizeOpponentGames(games, color = 'all') {
  const rows = [];
  for (const game of games) {
    const side = opponentColor(game);
    if (color !== 'all' && side !== color) continue;
    let parsed;
    try { parsed = parsePgn(game.pgn); } catch { continue; }
    const san = parsed.mainline.map((move) => move.san);
    const prefix = san.slice(0, 8).join(' ');
    if (!prefix) continue;
    const position = parsed.positions[Math.min(san.length, 8)]?.fen || '';
    const transpositionKey = position.split(' ').slice(0, 4).join(' ');
    let row = rows.find((item) => item.prefix === prefix);
    if (!row) {
      row = { id: prefix, prefix, count: 0, colors: { w: 0, b: 0, unknown: 0 }, games: [], transpositionKeys: new Set(), latest: '', moves: san, continuations: {} };
      rows.push(row);
    }
    row.count++;
    row.colors[side || 'unknown']++;
    row.games.push(game);
    if (transpositionKey) row.transpositionKeys.add(transpositionKey);
    const continuation = san.slice(8, 12).join(' ');
    if (continuation) row.continuations[continuation] = (row.continuations[continuation] || 0) + 1;
    const date = studyDateKey(game.date) || studyDateKey(game.createdAt);
    if (date && date > row.latest) row.latest = date;
  }
  return rows.map((row) => ({ ...row, typicalContinuation: Object.entries(row.continuations).sort((a, b) => b[1] - a[1])[0]?.[0] || '', transpositionKeys: [...row.transpositionKeys], transposed: rows.filter((candidate) => candidate !== row && [...candidate.transpositionKeys].some((key) => row.transpositionKeys.has(key))).map((candidate) => candidate.prefix) })).sort((a, b) => b.count - a.count || String(b.latest).localeCompare(String(a.latest)));
}
