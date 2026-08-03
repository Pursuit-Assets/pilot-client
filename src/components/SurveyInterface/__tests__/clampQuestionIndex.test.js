import { describe, it, expect } from 'vitest';
import { clampQuestionIndex } from '../SurveyInterface';

describe('clampQuestionIndex', () => {
  it('passes through an index already in range', () => {
    expect(clampQuestionIndex(0, 5)).toBe(0);
    expect(clampQuestionIndex(3, 5)).toBe(3);
    expect(clampQuestionIndex(4, 5)).toBe(4);
  });

  // The 2026-06-30 weekly survey: builders saved a position against the
  // 10-question template, then the 'weekly' template was replaced with a
  // 5-question one. The stale index blank-screened the Learning page.
  it('clamps an index left over from a longer template', () => {
    expect(clampQuestionIndex(9, 5)).toBe(4);
    expect(clampQuestionIndex(5, 5)).toBe(4);
  });

  it('floors negative and non-numeric indexes at 0', () => {
    expect(clampQuestionIndex(-1, 5)).toBe(0);
    expect(clampQuestionIndex(undefined, 5)).toBe(0);
    expect(clampQuestionIndex(null, 5)).toBe(0);
    expect(clampQuestionIndex('not a number', 5)).toBe(0);
    expect(clampQuestionIndex(NaN, 5)).toBe(0);
  });

  it('coerces numeric strings and truncates fractions', () => {
    expect(clampQuestionIndex('2', 5)).toBe(2);
    expect(clampQuestionIndex(2.9, 5)).toBe(2);
    expect(clampQuestionIndex('99', 5)).toBe(4);
  });

  it('returns 0 when there are no questions rather than -1', () => {
    expect(clampQuestionIndex(0, 0)).toBe(0);
    expect(clampQuestionIndex(3, 0)).toBe(0);
  });
});
