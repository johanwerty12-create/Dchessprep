// Practice results describe recall of a saved line, not playing strength.
export const PRACTICE_OUTCOMES = ['recalled', 'assisted', 'missed', 'revealed'];
export const PRACTICE_LOG_LIMIT = 30;

export function duePracticeCards(records, now = Date.now(), limit = Infinity) {
  return records.filter((card) => card.kind === 'training' && !card.retiredAt && Date.parse(card.dueAt || card.createdAt) <= now)
    .sort((a, b) => Date.parse(a.dueAt || a.createdAt) - Date.parse(b.dueAt || b.createdAt) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function scheduledPracticeCards(records, now = Date.now()) {
  const dueTime = (card) => {
    const value = Date.parse(card.dueAt || card.createdAt);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };
  const rank = (card) => card.retiredAt ? 2 : dueTime(card) <= now ? 0 : 1;
  return records.filter((card) => card.kind === 'training')
    .slice()
    .sort((a, b) => rank(a) - rank(b) || dueTime(a) - dueTime(b) || a.id.localeCompare(b.id));
}

export function practiceSummary(records, now = Date.now()) {
  const attempts = records.filter((r) => r.kind === 'training').flatMap((r) => r.practiceLog || [])
    .filter((a) => Date.parse(a.at) <= now && Date.parse(a.at) >= now - 7 * 86400000);
  return { total: attempts.length, recalled: attempts.filter((a) => a.outcome === 'recalled').length,
    assisted: attempts.filter((a) => a.outcome === 'assisted').length,
    revisit: attempts.filter((a) => ['missed', 'revealed'].includes(a.outcome)).length };
}

export function recordPracticeAttempt(card, attempt, now = Date.now()) {
  if (!attempt?.id || !PRACTICE_OUTCOMES.includes(attempt.outcome)) throw new Error('Invalid practice result.');
  if (card.practiceLog?.some((entry) => entry.id === attempt.id)) return card;
  const quality = { recalled: 5, assisted: 2, missed: 2, revealed: 1 }[attempt.outcome];
  const easeFactor = Math.max(1.3, (card.easeFactor || 2.5) + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const repetitions = quality < 3 ? 0 : (card.repetitions || 0) + 1;
  const intervalDays = quality < 3 ? 0 : repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round((card.intervalDays || 6) * easeFactor));
  const at = new Date(now).toISOString();
  return { ...card, easeFactor, repetitions, intervalDays, reviews: (card.reviews || 0) + 1,
    lastQuality: quality, lastReviewedAt: at,
    dueAt: new Date(now + (quality < 3 ? 600000 : intervalDays * 86400000)).toISOString(),
    practiceLog: [...(card.practiceLog || []), { id: attempt.id, at, outcome: attempt.outcome, playedUci: attempt.playedUci || null }].slice(-PRACTICE_LOG_LIMIT) };
}

export function validatePracticeLog(log, legalMoves) {
  if (log == null) return true; // Backups created before practice tracking remain valid.
  return Array.isArray(log) && log.length <= PRACTICE_LOG_LIMIT &&
    new Set(log.map((a) => a?.id)).size === log.length && log.every((a) =>
      a && typeof a.id === 'string' && a.id.length > 0 && a.id.length <= 150 &&
      typeof a.at === 'string' && Number.isFinite(Date.parse(a.at)) &&
      PRACTICE_OUTCOMES.includes(a.outcome) && (a.playedUci === null || legalMoves.includes(a.playedUci)));
}
