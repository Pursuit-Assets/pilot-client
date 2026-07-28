/**
 * Teaching Lab API Service
 * Admin mock environment for the onboarding teaching-method classifier (the
 * behavioral pass over anchor #9, "how they like to learn"). Feeds a typed mock
 * answer (or a transcript) through the REAL classifier and returns the predicted
 * style + confidence + evidence, the 0.7 confidence-floor verdict, and the
 * effective method the coach would use (style or the neutral 'balanced' fallback)
 * plus the guidance directive injected into the learn prompt. READ-ONLY — no
 * profile writes. Backed by /api/admin/onboarding-lab (onboardingLabController.js).
 */

import { fetchWithAuth } from '../utils/api';

/**
 * The curated example-answer gallery + the anchor-#9 question + the confidence
 * floor + the selectable Dreyfus levels and the sample task the lab teaches.
 * @param {string} token
 * @returns {Promise<{ presets: Object[], question: string, floor: number, levelOptions: Array<{level: number|null, label: string}>, task: { title: string, learning_goal: string, skill: string } }>}
 */
export const listLabPresets = async (token) => {
  return fetchWithAuth('/api/admin/onboarding-lab/presets', { method: 'GET' }, token);
};

/**
 * Run the real classifier over a mock answer (or transcript).
 * @param {string} token
 * @param {{ answer?: string, transcript?: Array }} payload
 * @returns {Promise<{ raw: object|null, wouldPersist: boolean, effectiveMethod: string, floor: number, guidance: string, model: string, question: string }>}
 */
export const classifyTeachingMethod = async (token, { answer, transcript } = {}) => {
  return fetchWithAuth(
    '/api/admin/onboarding-lab/classify',
    { method: 'POST', body: JSON.stringify(transcript ? { transcript } : { answer }) },
    token
  );
};

/**
 * Generate ONE real coach learn-phase turn in the given teaching method and at
 * the given builder skill level, using the same prompt + model the live coach
 * uses (stateless — no thread/DB). With no messages, the coach produces its
 * first teaching turn (server seeds a builder opener, returned as
 * `seededOpener`).
 *
 * `skillLevel` is a Dreyfus level 0-5, or null/omitted for an unassessed
 * builder. The server builds a synthetic profile at that level and runs the REAL
 * deriveLearnStrategy, returning the resulting decision as `decision`.
 *
 * @param {string} token
 * @param {{ teachingMethod: string, skillLevel?: number|null, messages?: Array<{role:'user'|'assistant', content:string}> }} payload
 * @returns {Promise<{ reply: string, method: string, model: string, decision: LabDecision, seededOpener: string|null, task: { title: string, learning_goal: string } }>}
 */
export const coachTurn = async (token, { teachingMethod, skillLevel, messages } = {}) => {
  return fetchWithAuth(
    '/api/admin/onboarding-lab/coach-turn',
    {
      method: 'POST',
      body: JSON.stringify({
        teachingMethod,
        skillLevel: skillLevel ?? null,
        messages: messages || [],
      }),
    },
    token
  );
};

/**
 * Generate the APPLY-phase challenge for the lab's sample task via the real
 * generateApply prompt — the surface that shows the same lesson producing a
 * harder or easier challenge as the builder's skill level changes. Stateless.
 *
 * @param {string} token
 * @param {{ teachingMethod?: string, skillLevel?: number|null, messages?: Array<{role:'user'|'assistant', content:string}> }} payload
 * @returns {Promise<{ challenge: string, method: string, model: string, decision: LabDecision, task: { title: string, learning_goal: string } }>}
 */
export const generateChallenge = async (token, { teachingMethod, skillLevel, messages } = {}) => {
  return fetchWithAuth(
    '/api/admin/onboarding-lab/challenge',
    {
      method: 'POST',
      body: JSON.stringify({
        teachingMethod,
        skillLevel: skillLevel ?? null,
        messages: messages || [],
      }),
    },
    token
  );
};

/**
 * @typedef {Object} LabDecision - the coach's real derived difficulty decision
 * @property {number|null} currentLevel  - resolved Dreyfus level 0-5
 * @property {string|null} currentLabel  - e.g. "Competent"
 * @property {number|null} targetLevel   - the level the challenge targets, 1-5
 * @property {string|null} targetLabel   - e.g. "Proficient"
 * @property {string|null} difficultyLevel - the 6-value band slug
 * @property {string|null} levelSource   - 'proficiency' | 'legacy_ema' | 'unassessed'
 */
