import { describe, it, expect } from 'vitest';
import { pickDefaultCohortId } from '../cohortUtils';

/**
 * The Cohort Hub's landing cohort. This replaced a hardcoded name that had gone stale
 * (everyone without a saved choice landed on a cohort that finished in May), so the
 * point of these cases is that the rule stays derived from the data.
 */

const c = (name, level, start_date, enrolled_count) => ({
  cohort_id: name, name, level, start_date, enrolled_count,
});

// Shape of the real ai-native-builder program on 2026-08-06.
const PROGRAM = [
  c('oct-l1', 'L1', '2026-10-10', 0),   // created, nobody enrolled yet
  c('aug-l3', 'L3', '2026-08-15', 0),
  c('jul-l1', 'L1', '2026-07-06', 74),  // the live one
  c('jun-l2', 'L2', '2026-06-06', 45),
  c('mar-l1p', 'L1+', '2026-03-16', 19),
  c('mar-l1', 'L1', '2026-03-14', 3),   // finished; the old hardcoded default
];

describe('pickDefaultCohortId', () => {
  it('lands on the newest L1 that has builders enrolled', () => {
    expect(pickDefaultCohortId(PROGRAM)).toBe('jul-l1');
  });

  it('skips a newer L1 that nobody has enrolled in yet', () => {
    // The next cohort exists for weeks before anyone joins — landing there shows an
    // empty dashboard, which is what a plain "newest" rule would do.
    expect(pickDefaultCohortId(PROGRAM)).not.toBe('oct-l1');
  });

  it('does not fall back to a finished L1 while a live one exists', () => {
    expect(pickDefaultCohortId(PROGRAM)).not.toBe('mar-l1');
  });

  it('ignores the order the endpoint returned rows in', () => {
    const shuffled = [PROGRAM[5], PROGRAM[0], PROGRAM[3], PROGRAM[2], PROGRAM[1]];
    expect(pickDefaultCohortId(shuffled)).toBe('jul-l1');
  });

  it('falls back to the newest enrolled cohort when the program has no L1', () => {
    // Partner programs (Goldman Sachs Pilot, LaGCC, UFT…) have no L1 level.
    const partner = [
      c('new-empty', 'Cohort 3', '2026-09-01', 0),
      c('live', 'Cohort 2', '2026-05-01', 12),
      c('old', 'Cohort 1', '2025-05-01', 8),
    ];
    expect(pickDefaultCohortId(partner)).toBe('live');
  });

  it('falls back to the newest cohort when nothing has enrollments', () => {
    const empty = [c('a', 'L1', '2026-01-01', 0), c('b', 'L1', '2026-06-01', 0)];
    expect(pickDefaultCohortId(empty)).toBe('b');
  });

  it('returns empty string for an empty or missing list', () => {
    expect(pickDefaultCohortId([])).toBe('');
    expect(pickDefaultCohortId()).toBe('');
  });

  it('treats a string count from the API as a number', () => {
    // pg returns COUNT(*) as a string unless cast; the query casts to ::int, but the
    // picker must not silently depend on that.
    const rows = [c('empty', 'L1', '2026-09-01', '0'), c('has', 'L1', '2026-07-01', '74')];
    expect(pickDefaultCohortId(rows)).toBe('has');
  });

  it('does not mutate the array it was given', () => {
    const rows = [...PROGRAM];
    pickDefaultCohortId(rows);
    expect(rows.map((r) => r.cohort_id)).toEqual(PROGRAM.map((r) => r.cohort_id));
  });
});
