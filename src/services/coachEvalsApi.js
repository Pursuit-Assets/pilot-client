/**
 * Coach Evals API Service
 * Admin/staff harness for running and reviewing automated quality evaluations
 * of the v2 coach agent. Backed by /api/admin/coach-evals
 * (controllers/coachEvalController.js).
 */

import { fetchWithAuth } from '../utils/api';

/** List available eval suites for the run picker. */
export const listSuites = async (token) =>
  fetchWithAuth('/api/admin/coach-evals/suites', { method: 'GET' }, token);

/** Start an eval batch. Returns { batchId, totalCases, status } (202). */
export const runEval = async (token, { suiteKey, modelUnderTest, judgeModel }) =>
  fetchWithAuth(
    '/api/admin/coach-evals/run',
    { method: 'POST', body: JSON.stringify({ suiteKey, modelUnderTest, judgeModel }) },
    token
  );

/** List recent batches (aggregates + status). */
export const listBatches = async (token) =>
  fetchWithAuth('/api/admin/coach-evals', { method: 'GET' }, token);

/** Get one batch + its cases. */
export const getBatch = async (token, batchId) =>
  fetchWithAuth(`/api/admin/coach-evals/${batchId}`, { method: 'GET' }, token);

/** Get one case's full verdicts (also returns `coachGrade` + `myAnnotation`). */
export const getCase = async (token, caseId) =>
  fetchWithAuth(`/api/admin/coach-evals/cases/${caseId}`, { method: 'GET' }, token);

/** Save (upsert) the current reviewer's human review of a case. */
export const saveAnnotation = async (token, caseId, body) =>
  fetchWithAuth(
    `/api/admin/coach-evals/cases/${caseId}/annotation`,
    { method: 'POST', body: JSON.stringify(body) },
    token
  );

/** Judge↔human alignment report (κ per dimension + biggest disagreements). */
export const getAlignment = async (token, { suiteKey, sinceDays } = {}) => {
  const qs = new URLSearchParams();
  if (suiteKey) qs.set('suiteKey', suiteKey);
  if (sinceDays) qs.set('sinceDays', String(sinceDays));
  const q = qs.toString();
  return fetchWithAuth(`/api/admin/coach-evals/alignment${q ? `?${q}` : ''}`, { method: 'GET' }, token);
};
