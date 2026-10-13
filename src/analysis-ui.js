import { formatScore, scoreToWhite } from './domain.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// A bounded visual scale only: the bar is not a win-probability estimate.
// Mate and terminal results remain categorical and are never converted to cp.
export function evaluationBarModel(score, sideToMove = 'w', terminal = null) {
  if (terminal) {
    if (terminal.winner === 'w') return { state: 'white-win', label: 'White wins · checkmate', description: 'Terminal checkmate. White won.', whiteShare: 100 };
    if (terminal.winner === 'b') return { state: 'black-win', label: 'Black wins · checkmate', description: 'Terminal checkmate. Black won.', whiteShare: 0 };
    return { state: 'draw', label: terminal.label || 'Draw', description: `Terminal drawn position. ${terminal.label || 'Draw'}.`, whiteShare: 50 };
  }

  const whiteScore = scoreToWhite(score, sideToMove);
  if (!whiteScore) return { state: 'unavailable', label: '—', description: 'No engine evaluation yet. Start Stockfish analysis.', whiteShare: null };
  if (whiteScore.kind === 'terminal') {
    if (whiteScore.result === 'draw') return { state: 'draw', label: `Draw · ${whiteScore.termination}`, description: `Terminal drawn position: ${whiteScore.termination}.`, whiteShare: 50 };
    const winner = whiteScore.result === 'win' ? 'White' : 'Black';
    return { state: winner === 'White' ? 'white-win' : 'black-win', label: `${winner} wins · ${whiteScore.termination}`, description: `${winner} won by ${whiteScore.termination}.`, whiteShare: winner === 'White' ? 100 : 0 };
  }
  if (whiteScore.kind === 'cp') {
    const whiteShare = 50 + clamp(whiteScore.value, -800, 800) / 16;
    const pawns = Math.abs(whiteScore.value / 100).toFixed(1);
    const advantage = whiteScore.value === 0 ? 'Equal' : `${whiteScore.value > 0 ? 'White' : 'Black'} +${pawns}`;
    return { state: 'scored', label: formatScore(whiteScore), description: `${advantage} pawns by Stockfish score. The bar is a clipped centipawn visualization, not a win chance.`, whiteShare };
  }
  if (whiteScore.kind === 'mate' && whiteScore.value !== 0) {
    const winner = whiteScore.value > 0 ? 'White' : 'Black';
    return { state: winner === 'White' ? 'white-mate' : 'black-mate', label: formatScore(whiteScore), description: `Stockfish reports forced mate for ${winner} in ${Math.abs(whiteScore.value)}.`, whiteShare: winner === 'White' ? 100 : 0 };
  }
  return { state: 'unavailable', label: '—', description: 'Stockfish did not return a displayable score for this position.', whiteShare: null };
}
