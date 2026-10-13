import test from 'node:test';
import assert from 'node:assert/strict';
import { formatStudyDate, localDayKey, studyDateKey } from '../src/dates.js';

test('unknown PGN dates and corrupt timestamps cannot crash a workspace', () => {
  for (const value of ['????.??.??', '2024.??.01', 'bad', '', null, undefined, {}]) assert.equal(formatStudyDate(value, 'en-US'), 'Date unknown');
});

test('calendar dates preserve the PGN day and reject impossible dates', () => {
  assert.equal(formatStudyDate('2024.02.29', 'en-US'), 'Feb 29, 2024');
  assert.equal(formatStudyDate('2024-02-29', 'en-US'), 'Feb 29, 2024');
  assert.equal(formatStudyDate('2023.02.29', 'en-US'), 'Date unknown');
  assert.equal(formatStudyDate('2024.02.30', 'en-US'), 'Date unknown');
  assert.equal(studyDateKey('2024.02.29'), '2024-02-29T00:00:00.000Z');
  assert.equal(studyDateKey('2026-10-12T10:00:00Z'), '2026-10-12T10:00:00.000Z');
});

test('daily practice grouping follows the player’s timezone, not UTC date boundaries', () => {
  const reviewAt = '2026-10-13T02:00:00.000Z';
  assert.equal(localDayKey(reviewAt, 'Asia/Taipei'), '2026-10-13');
  assert.equal(localDayKey(reviewAt, 'America/Los_Angeles'), '2026-10-12');
  assert.equal(localDayKey('invalid', 'Asia/Taipei'), '');
});
