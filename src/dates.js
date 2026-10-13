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

const dayFormatters = new Map();

export function formatStudyDate(value, locale) {
  const parsed = studyDate(value);
  if (!parsed) return 'Date unknown';
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', ...(parsed.calendar ? { timeZone: 'UTC' } : {}) }).format(parsed.date);
}

export function studyDateKey(value) {
  return studyDate(value)?.date.toISOString() || '';
}

export function localDayKey(value, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en', { timeZone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const fields = Object.fromEntries(parts.filter((part) => ['year', 'month', 'day'].includes(part.type)).map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
