function studyDate(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('?')) return null;
  const calendar = value.match(/^(\d{4})[.-](\d{2})[.-](\d{2})$/);
  if (calendar) {
    const [, year, month, day] = calendar.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { date, calendar: true };
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? { date, calendar: false } : null;
}

export function formatStudyDate(value, locale) {
  const parsed = studyDate(value);
  if (!parsed) return 'Date unknown';
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', ...(parsed.calendar ? { timeZone: 'UTC' } : {}) }).format(parsed.date);
}

export function studyDateKey(value) {
  return studyDate(value)?.date.toISOString() || '';
}
