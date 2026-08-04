/**
 * Builder Profile Inspector API Service
 *
 * Admin tool for the v2 coach Profiles tab — search builders, fetch their
 * BuilderProfileSnapshot, and run mock-flow scenarios against the real
 * profile-write pipeline with the LLM call mocked at the aiClient layer.
 *
 * Backed by /api/admin/builder-profiles/* (test-pilot-server).
 * Gated by page:coach (admin via wildcard).
 */

import { fetchWithAuth } from '../utils/api';

/**
 * Search for builders by first name, last name, or email (ILIKE).
 * Server limits to 20 results.
 * @param {string} token
 * @param {string} q - substring to search
 * @returns {Promise<{ results: Array<{ user_id, first_name, last_name, email, cohort }> }>}
 */
export const searchUsers = async (token, q) => {
  const params = new URLSearchParams();
  if (q) params.append('q', q);
  const qs = params.toString();
  return fetchWithAuth(
    `/api/admin/builder-profiles/search${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
    token,
  );
};

/**
 * Fetch the full BuilderProfileSnapshot for a single user.
 * @param {string} token
 * @param {number} userId
 * @returns {Promise<Object>} BuilderProfileSnapshot
 */
export const getSnapshot = async (token, userId) => {
  return fetchWithAuth(
    `/api/admin/builder-profiles/${userId}`,
    { method: 'GET' },
    token,
  );
};

/**
 * Generate (or regenerate) the builder's evidence-cited narrative summary.
 *
 * This costs one LLM call over the builder's full graded history, so it is only
 * ever fired by an explicit user action — never on page load. The cached copy
 * arrives on the snapshot as `narrative`, carrying a `stale` flag when the
 * builder has been graded since it was written.
 *
 * Expected non-200s worth handling in the UI:
 *   422 INSUFFICIENT_EVIDENCE — fewer than 3 graded evidence items
 *   502 GENERATION_FAILED / PARSE_FAILURE / NO_VERIFIABLE_CLAIMS
 *
 * @param {string} token
 * @param {number} userId
 * @returns {Promise<{summary, stale, generated_at, model, sessions_considered, dropped_claims}>}
 */
export const generateNarrative = async (token, userId) => {
  return fetchWithAuth(
    `/api/admin/builder-profiles/${userId}/narrative`,
    { method: 'POST' },
    token,
  );
};

/**
 * Trigger a mock-flow scenario for the given user (or a sentinel mock user
 * if userId is omitted). Server refuses to operate on builders outside the
 * designated mock test cohort.
 *
 * @param {string} token
 * @param {Object} params
 * @param {string} params.scenario - ScenarioKey (see contract)
 * @param {number} [params.userId]
 * @param {boolean} [params.resetFirst]
 * @returns {Promise<Object>} { userId, scenario, stages_run, final_snapshot }
 */
export const runMockFlow = async (token, { scenario, userId, resetFirst } = {}) => {
  const body = { scenario };
  if (userId != null) body.userId = userId;
  if (resetFirst) body.resetFirst = true;
  return fetchWithAuth(
    '/api/admin/builder-profiles/mock-run',
    { method: 'POST', body: JSON.stringify(body) },
    token,
  );
};
