/**
 * Shared cohort utilities for the admin dashboard.
 * Uses the staff-accessible /api/permissions/cohorts endpoint (not admin-only org management).
 * Converts names to legacy format (with dash) for legacy API calls.
 */

const API_URL = import.meta.env.VITE_API_URL;

/**
 * Fetch active builder cohorts from the staff-accessible permissions endpoint.
 * Returns array of { name, legacyName, cohort_id, is_active, curriculum_day_count }
 */
export const fetchPursuitBuilderCohorts = async (token) => {
  const res = await fetch(`${API_URL}/api/permissions/cohorts?type=builder`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Cohorts API error: ${res.status}`);
  const data = await res.json();
  const cohorts = data.cohorts || [];

  return cohorts
    .map(c => ({
      name: c.name,
      legacyName: toLegacyFormat(c.name),
      cohort_id: c.cohort_id,
      is_active: true,
      curriculum_day_count: parseInt(c.curriculum_day_count) || 0,
    }))
    .sort((a, b) => b.name.localeCompare(a.name));
};

/**
 * Which cohort the Cohort Hub should land on when the viewer has no saved choice.
 *
 * Prefers the most recent **L1 that actually has builders enrolled**. Recency alone is
 * wrong — the next cohort is created and sits at zero enrollment for weeks before it
 * starts, so a plain "newest" rule lands on an empty dashboard. Level alone is wrong for
 * the same reason in reverse: a finished cohort still has enrollments.
 *
 * This replaced a hardcoded `DEFAULT_COHORT_NAME = 'March 2026 L1'`, which had gone stale
 * — that cohort finished in May and is down to 3 enrollments, so everyone without a saved
 * choice (including interview candidates) landed on a completed cohort.
 *
 * Degrades for programs that have no L1 at all (Goldman Sachs Pilot, LaGCC, UFT…):
 * newest enrolled cohort of any level, then simply the newest cohort.
 *
 * Expects rows from `GET /api/admin/dashboard/program-cohorts` (`cohort_id`, `level`,
 * `start_date`, `enrolled_count`). Sorts defensively rather than trusting the endpoint's
 * ORDER BY.
 *
 * @param {Array} cohorts
 * @returns {string} cohort_id, or '' when the list is empty
 */
export const pickDefaultCohortId = (cohorts = []) => {
  const newestFirst = [...cohorts].sort(
    (a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0)
  );
  const enrolled = newestFirst.filter((c) => Number(c.enrolled_count) > 0);

  const chosen =
    enrolled.find((c) => c.level === 'L1') ||
    enrolled[0] ||
    newestFirst[0];

  return chosen?.cohort_id || '';
};

/**
 * Convert org management name to legacy API format.
 * "December 2025 L1" → "December 2025 - L1"
 * "March 2025 L3+" → "March 2025 - L3+"
 * "March 2025" → "March 2025" (no level, no change)
 */
export const toLegacyFormat = (name) => {
  if (!name) return '';
  // Match "Month Year Level" pattern
  const match = name.match(/^(\w+ \d{4})\s+(L\S+)$/);
  if (match) return `${match[1]} - ${match[2]}`;
  return name;
};

/**
 * Convert legacy format back to org management format.
 * "December 2025 - L1" → "December 2025 L1"
 */
export const fromLegacyFormat = (name) => {
  if (!name) return '';
  return name.replace(/\s+-\s+/, ' ');
};
