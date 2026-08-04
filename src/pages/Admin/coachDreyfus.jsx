// ---------------------------------------------------------------------------
// Shared Dreyfus grade rendering for the Coach admin surfaces.
//
// The v2 coach grades on the Dreyfus scale (0-5 per skill). Pass/fail is
// window-relative — held-or-improved on a majority of assessed skills vs the
// builder's own prior — so there is NO 0-100 pass bar and the UI never shows
// the derived overallScore as a grade. These helpers + SkillAssessmentTable are
// the single source of truth for that rendering, used by both CoachRuns (the
// per-run timeline) and CoachEvals (the per-case detail, where the coach's own
// grade is shown next to the judge's verdict on it).
// ---------------------------------------------------------------------------

export const DREYFUS_LABELS = ['Below Novice', 'Novice', 'Advanced Beginner', 'Competent', 'Proficient', 'Expert'];

/**
 * A Dreyfus stage as its NAME only — "Proficient", not "L4 Proficient".
 * The L-number was dropped from every Coach surface (2026-08-03): staff read the
 * stage name, and the digit added nothing while implying a score.
 *
 * An out-of-range level falls back to `Level <n>` rather than rendering empty —
 * the old implementation trimmed to a bare "L6", so a grader emitting a level
 * beyond the scale stayed visible. Keep it visible.
 */
export const levelLabel = (level) => {
  if (!Number.isInteger(level)) return 'N/A';
  return DREYFUS_LABELS[level] || `Level ${level}`;
};

/** "improved from Novice" / "held Competent" / "below prior Proficient" / "new skill". */
export const vsPriorLabel = (a) => {
  if (!Number.isInteger(a.level)) return null;
  if (!Number.isInteger(a.prior)) return 'new skill';
  const prior = levelLabel(a.prior);
  if (a.level > a.prior) return `↑ improved from ${prior}`;
  if (a.level === a.prior) return `held ${prior}`;
  return `↓ below prior ${prior}`;
};

/** Why the run passed/failed, from the window-relative rule. Null when the run
 *  pre-dates the engine exposing metCount/held. */
export const gradeReason = (sr) => {
  if (Number.isInteger(sr.metCount) && Number.isInteger(sr.assessedCount)) {
    return `held or improved on ${sr.metCount} of ${sr.assessedCount} skill${sr.assessedCount === 1 ? '' : 's'}`;
  }
  const withHeld = (sr.skillAssessments || []).filter((a) => typeof a.held === 'boolean');
  if (withHeld.length) {
    return `held or improved on ${withHeld.filter((a) => a.held).length} of ${withHeld.length} skill${withHeld.length === 1 ? '' : 's'}`;
  }
  return null;
};

/** Highest assessed Dreyfus level in a grade — the run's headline achievement
 *  badge ("Proficient" next to Passed). Null when no per-skill assessments. */
export const topLevel = (assessments) => {
  const levels = (Array.isArray(assessments) ? assessments : [])
    .map((a) => a.level).filter(Number.isInteger);
  return levels.length ? Math.max(...levels) : null;
};

export const GRADE_ERROR_TEXT = '⚠️ Grading error — a system issue prevented evaluation. Not a reflection of the builder\'s work.';

// Self-contained level chip so the table doesn't depend on either page's local
// Chip component (their tone maps differ — CoachEvals has no 'blue').
const LEVEL_TONES = {
  green: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  blue: 'bg-blue-100 text-blue-700 border-blue-300',
  red: 'bg-rose-100 text-rose-700 border-rose-300',
  slate: 'bg-slate-100 text-slate-600 border-slate-300',
};
const levelTone = (level) =>
  Number.isInteger(level) ? (level >= 3 ? 'green' : level >= 1 ? 'blue' : 'red') : 'slate';

export const LevelChip = ({ level }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${LEVEL_TONES[levelTone(level)]}`}>
    {levelLabel(level)}
  </span>
);

/** Per-skill Dreyfus assessments incl. the grader's rationale + evidence. */
export const SkillAssessmentTable = ({ assessments }) => {
  if (!Array.isArray(assessments) || assessments.length === 0) return null;
  return (
    <div className="border border-[#E3E3E3] rounded-md overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-[#F7F7F9] text-slate-600">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Skill</th>
            <th className="text-left px-3 py-2 font-semibold w-36">Level</th>
            <th className="text-left px-3 py-2 font-semibold w-32">vs prior</th>
            <th className="text-left px-3 py-2 font-semibold">Grader&apos;s rationale</th>
            <th className="text-left px-3 py-2 font-semibold">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {assessments.map((a, i) => (
            <tr key={i} className="border-t border-[#EEE] align-top">
              <td className="px-3 py-2 text-slate-800 capitalize">{(a.skill_slug || '—').replace(/-/g, ' ')}</td>
              <td className="px-3 py-2"><LevelChip level={a.level} /></td>
              <td className="px-3 py-2 text-slate-600">{vsPriorLabel(a) || '—'}</td>
              <td className="px-3 py-2 text-slate-600">{a.rationale || '—'}</td>
              <td className="px-3 py-2 text-slate-500 italic">{a.evidence || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
