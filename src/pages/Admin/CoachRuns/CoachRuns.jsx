import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { listCoachRuns, getCoachRun } from '../../../services/coachRunsApi';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../../../components/ui/sheet';

const BRAND = '#4242EA';

// Order + display labels for the v2 coach graph nodes (Developer view).
const NODE_META = {
  init:          { label: 'Init',           color: 'bg-slate-100 text-slate-700 border-slate-300' },
  learn:         { label: 'Learn',          color: 'bg-blue-100 text-blue-700 border-blue-300' },
  generateApply: { label: 'Generate Apply', color: 'bg-violet-100 text-violet-700 border-violet-300' },
  apply:         { label: 'Apply',          color: 'bg-amber-100 text-amber-700 border-amber-300' },
  grade:         { label: 'Grade',          color: 'bg-rose-100 text-rose-700 border-rose-300' },
  remediate:     { label: 'Remediate',      color: 'bg-orange-100 text-orange-700 border-orange-300' },
  complete:      { label: 'Complete',       color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
};

// Plain-language meaning of each node for the Story view — what a non-technical
// colleague would call this part of the coaching session.
const PHASE_META = {
  init:          { label: 'Getting started', icon: '👋', bar: '#94a3b8', tint: 'bg-slate-100 text-slate-700 border-slate-200' },
  learn:         { label: 'Teaching',        icon: '📘', bar: '#3b82f6', tint: 'bg-blue-100 text-blue-700 border-blue-200' },
  generateApply: { label: 'Challenge set',   icon: '🎯', bar: '#8b5cf6', tint: 'bg-violet-100 text-violet-700 border-violet-200' },
  apply:         { label: 'Working on it',   icon: '🛠️', bar: '#f59e0b', tint: 'bg-amber-100 text-amber-700 border-amber-200' },
  grade:         { label: 'Grading',         icon: '✅', bar: '#f43f5e', tint: 'bg-rose-100 text-rose-700 border-rose-200' },
  remediate:     { label: 'Extra coaching',  icon: '🔁', bar: '#f97316', tint: 'bg-orange-100 text-orange-700 border-orange-200' },
  complete:      { label: 'Wrap-up',         icon: '🎉', bar: '#10b981', tint: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};
const phaseMeta = (node) => PHASE_META[node] || { label: node, icon: '•', bar: '#94a3b8', tint: 'bg-slate-100 text-slate-700 border-slate-200' };

// Friendly descriptions of the teaching methods the coach can pick (mirrors the
// 7 styles in the server's VALID_TEACHING_METHODS).
const TEACHING_METHOD_LABEL = {
  socratic:      'Socratic — learns by answering guiding questions',
  direct:        'Direct instruction — clear step-by-step explanation',
  example_based: 'Example-based — learns from worked examples',
  demonstration: 'Demonstration — “I do, we do, you do”',
  inquiry_based: 'Guided inquiry — open questions with hints',
  problem_based: 'Problem-first — starts with a real problem',
  experiential:  'Experiential — hands-on, try then reflect',
};

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString() : '—');
const fmtMs = (ms) => (ms == null ? '—' : `${ms.toLocaleString()} ms`);
const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString());

// Human-readable duration: "840 ms" → "0.8s", "192300 ms" → "3m 12s".
const fmtDuration = (ms) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${Math.round(totalSec * 10) / 10}s`;
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}m ${s}s`;
};

// USD cost — tiny amounts to 4dp, larger to cents.
const fmtCost = (usd) => {
  if (usd == null || usd === 0) return '$0';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
};

/** Collapsible labeled text panel (system prompt, raw output, etc.) */
const Panel = ({ title, children, mono = true, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  if (children == null || children === '') return null;
  return (
    <div className="border border-[#E3E3E3] rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#F7F7F9] hover:bg-[#EFEFF3] text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</span>
        <span className="text-slate-400 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <pre
          className={`px-3 py-2 text-xs text-slate-800 whitespace-pre-wrap break-words max-h-96 overflow-auto bg-white ${mono ? 'font-mono' : ''}`}
        >
          {typeof children === 'string' ? children : JSON.stringify(children, null, 2)}
        </pre>
      )}
    </div>
  );
};

const Chip = ({ children, tone = 'slate' }) => {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 border-slate-300',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    red: 'bg-rose-100 text-rose-700 border-rose-300',
    blue: 'bg-blue-100 text-blue-700 border-blue-300',
    violet: 'bg-violet-100 text-violet-700 border-violet-300',
    amber: 'bg-amber-100 text-amber-700 border-amber-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${tones[tone]}`}>
      {children}
    </span>
  );
};

/** Renders the grade node's criteria scores as a table. */
const CriteriaTable = ({ criteriaScores }) => {
  if (!Array.isArray(criteriaScores) || criteriaScores.length === 0) return null;
  return (
    <div className="border border-[#E3E3E3] rounded-md overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-[#F7F7F9] text-slate-600">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Criterion</th>
            <th className="text-left px-3 py-2 font-semibold w-16">Score</th>
            <th className="text-left px-3 py-2 font-semibold w-16">Met</th>
            <th className="text-left px-3 py-2 font-semibold">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {criteriaScores.map((c, i) => (
            <tr key={i} className="border-t border-[#EEE]">
              <td className="px-3 py-2 text-slate-800">{c.criterion || '—'}</td>
              <td className="px-3 py-2 text-slate-800">{c.score ?? '—'}</td>
              <td className="px-3 py-2">
                {c.met ? <Chip tone="green">yes</Chip> : <Chip tone="red">no</Chip>}
              </td>
              <td className="px-3 py-2 text-slate-600">{c.evidence || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dreyfus grade display. The engine grades each skill on the Dreyfus scale
// (0-5) and passes a run when the builder held-or-improved vs their own
// established level on a majority of assessed skills — there is NO 0-100 pass
// bar. The derived overallScore is legacy-only and shown only for old runs
// that carry no per-skill assessments.
// ---------------------------------------------------------------------------

const DREYFUS_LABELS = ['Below Novice', 'Novice', 'Advanced Beginner', 'Competent', 'Proficient', 'Expert'];

const levelLabel = (level) =>
  Number.isInteger(level) ? `L${level} ${DREYFUS_LABELS[level] || ''}`.trim() : 'N/A';

/** "improved from L2" / "held L3" / "below prior L4" / "new skill" (needs a.prior from the engine). */
const vsPriorLabel = (a) => {
  if (!Number.isInteger(a.level)) return null;
  if (!Number.isInteger(a.prior)) return 'new skill';
  if (a.level > a.prior) return `↑ improved from L${a.prior}`;
  if (a.level === a.prior) return `held L${a.prior}`;
  return `↓ below prior L${a.prior}`;
};

/** Why the run passed/failed, from the window-relative rule. Null when the run
 *  pre-dates the engine exposing metCount/held. */
const gradeReason = (sr) => {
  if (Number.isInteger(sr.metCount) && Number.isInteger(sr.assessedCount)) {
    return `held or improved on ${sr.metCount} of ${sr.assessedCount} skill${sr.assessedCount === 1 ? '' : 's'}`;
  }
  const withHeld = (sr.skillAssessments || []).filter((a) => typeof a.held === 'boolean');
  if (withHeld.length) {
    return `held or improved on ${withHeld.filter((a) => a.held).length} of ${withHeld.length} skill${withHeld.length === 1 ? '' : 's'}`;
  }
  return null;
};

/**
 * Human-readable difficulty for the init step's learn strategy.
 *
 * Difficulty became Dreyfus-native on 2026-07-28 (`currentLevel` → `targetLevel`,
 * one stage up; `difficultyLevel` is now one of 6 level slugs). Runs recorded
 * BEFORE that date carry the retired 3-band vocabulary
 * ('beginner'/'intermediate'/'advanced') with no levels, so this renders both —
 * historical `agent_run_steps` rows are never rewritten.
 */
const LEGACY_DIFFICULTY_BANDS = ['beginner', 'intermediate', 'advanced'];

const formatRunDifficulty = (strat) => {
  if (Number.isInteger(strat.targetLevel)) {
    const target = `targets ${levelLabel(strat.targetLevel)}`;
    const from = Number.isInteger(strat.currentLevel)
      ? ` — builder was at ${levelLabel(strat.currentLevel)}`
      : ' — builder unassessed on these skills';
    return (
      <>
        {target}
        <span className="text-slate-500">{from}</span>
      </>
    );
  }
  // Pre-migration run: show the band it actually used, labelled as legacy so the
  // number isn't mistaken for a Dreyfus level.
  const isLegacy = LEGACY_DIFFICULTY_BANDS.includes(strat.difficultyLevel);
  return (
    <>
      <span className="capitalize">{strat.difficultyLevel}</span>
      {strat.avgLevel != null && (
        <span className="text-slate-500"> (avg skill {Math.round(strat.avgLevel)}/100)</span>
      )}
      {isLegacy && (
        <span
          className="text-slate-400 text-xs ml-1"
          title="Recorded before difficulty moved to the Dreyfus scale on 2026-07-28. The 3 old bands collapsed Dreyfus 2↔3 and 4↔5 onto the same challenge."
        >
          · legacy 3-band
        </span>
      )}
    </>
  );
};

/** Plain-text form of the above, for the copyable run summary. */
const difficultySummaryText = (strat) => {
  const modifier = strat.difficultyModifier === '+20%' ? ' · +20% for interview weak area' : '';
  if (Number.isInteger(strat.targetLevel)) {
    const from = Number.isInteger(strat.currentLevel)
      ? `builder at ${levelLabel(strat.currentLevel)}`
      : 'builder unassessed';
    return `targets ${levelLabel(strat.targetLevel)} (${from})${modifier}`;
  }
  if (!strat.difficultyLevel) return '';
  const avg = strat.avgLevel != null ? ` (avg skill ${Math.round(strat.avgLevel)})` : '';
  const legacy = LEGACY_DIFFICULTY_BANDS.includes(strat.difficultyLevel) ? ' · legacy 3-band' : '';
  return `${strat.difficultyLevel}${avg}${legacy}${modifier}`;
};

/** Highest assessed Dreyfus level in a grade — the run's headline achievement
 *  badge ("Proficient" next to Passed). Null when no per-skill assessments. */
const topLevel = (assessments) => {
  const levels = (Array.isArray(assessments) ? assessments : [])
    .map((a) => a.level).filter(Number.isInteger);
  return levels.length ? Math.max(...levels) : null;
};

const GRADE_ERROR_TEXT = '⚠️ Grading error — a system issue prevented evaluation. Not a reflection of the builder\'s work.';

/** Per-skill Dreyfus assessments incl. the grader's rationale + evidence. */
const SkillAssessmentTable = ({ assessments }) => {
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
              <td className="px-3 py-2">
                <Chip tone={Number.isInteger(a.level) ? (a.level >= 3 ? 'green' : a.level >= 1 ? 'blue' : 'red') : 'slate'}>
                  {levelLabel(a.level)}
                </Chip>
              </td>
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

// ===========================================================================
// DEVELOPER VIEW — one card per agent step (the original technical timeline).
// ===========================================================================

/** One agent step in the timeline. */
const StepCard = ({ step }) => {
  const meta = NODE_META[step.node] || { label: step.node, color: 'bg-slate-100 text-slate-700 border-slate-300' };
  const sr = step.structured_result || {};
  const isGrade = step.node === 'grade';

  return (
    <div className="relative pl-8 pb-6">
      {/* timeline rail + dot */}
      <div className="absolute left-2.5 top-2 bottom-0 w-px bg-[#E3E3E3]" />
      <div className={`absolute left-0 top-1 w-5 h-5 rounded-full border-2 ${meta.color}`} />

      <div className="bg-white border border-[#E3E3E3] rounded-lg p-4 shadow-sm">
        {/* header */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold border ${meta.color}`}>
            {meta.label}
          </span>
          <span className="text-[11px] text-slate-400">
            {step.phase_in}{step.phase_out && step.phase_out !== step.phase_in ? ` → ${step.phase_out}` : ''}
          </span>
          <span className="flex-1" />
          {step.model && <Chip>{step.model}</Chip>}
          <Chip>{fmtMs(step.latency_ms)}</Chip>
          {step.total_tokens != null && <Chip>{fmtNum(step.total_tokens)} tok</Chip>}
        </div>

        {/* markers / quick facts */}
        <div className="flex flex-wrap gap-2 mb-3 text-[11px] text-slate-500">
          {step.learn_turn_count != null && step.node === 'learn' && <span>turn {step.learn_turn_count}</span>}
          {step.attempt_number != null && <span>attempt {step.attempt_number}</span>}
          {sr.readyForApply === true && <Chip tone="green">READY_FOR_APPLY</Chip>}
          {sr.applySubmitted === true && <Chip tone="green">APPLY_SUBMITTED</Chip>}
          {sr.gradeError ? (
            <Chip tone="amber">⚠ grading error</Chip>
          ) : Array.isArray(sr.skillAssessments) && sr.skillAssessments.length > 0 ? (
            <>
              <Chip tone={sr.passed ? 'green' : 'red'}>{sr.passed ? 'passed' : 'did not pass'}</Chip>
              {sr.skillAssessments.map((a, i) => (
                <Chip key={i} tone="blue">{(a.skill_slug || '').replace(/-/g, ' ')} · {levelLabel(a.level)}</Chip>
              ))}
            </>
          ) : typeof sr.overallScore === 'number' ? (
            <Chip tone={sr.passed ? 'green' : 'red'}>score {sr.overallScore} · {sr.passed ? 'passed' : 'failed'}</Chip>
          ) : null}
          {sr.applyMode && <span>mode: {sr.applyMode}</span>}
          {step.thinking_label && <span className="italic">“{step.thinking_label}”</span>}
          <span className="ml-auto">{fmtTime(step.created_at)}</span>
        </div>

        {/* grade assessment inline — Dreyfus table when available, legacy criteria otherwise */}
        {isGrade && (
          <div className="mb-3">
            {sr.gradeError && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">{GRADE_ERROR_TEXT}</p>
            )}
            {Array.isArray(sr.skillAssessments) && sr.skillAssessments.length > 0
              ? <SkillAssessmentTable assessments={sr.skillAssessments} />
              : sr.criteriaScores ? <CriteriaTable criteriaScores={sr.criteriaScores} /> : null}
            {sr.feedback && <p className="mt-2 text-xs text-slate-600 italic">{sr.feedback}</p>}
          </div>
        )}

        {/* collapsible detail panels */}
        <div className="space-y-2">
          {step.user_message && <Panel title="Builder Input">{step.user_message}</Panel>}
          <Panel title="System Prompt">{step.system_prompt}</Panel>
          {step.raw_output && step.raw_output !== step.visible_output && (
            <Panel title="Raw LLM Output (pre-strip)">{step.raw_output}</Panel>
          )}
          {step.visible_output && <Panel title="Visible Output" defaultOpen>{step.visible_output}</Panel>}
          <Panel title="Structured Result">{sr}</Panel>
          {step.error && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              Error: {step.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===========================================================================
// STORY VIEW — plain-language, share-friendly summary of a run.
// ===========================================================================

/** A labeled stat in the summary card. */
const StatPill = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-[11px] uppercase tracking-wide text-slate-400">{label}</span>
    <span className="text-sm font-semibold text-slate-800">{value}</span>
  </div>
);

/** Section divider in the transcript marking a new phase of the session. */
const PhaseDivider = ({ node, anchorId }) => {
  const meta = phaseMeta(node);
  return (
    <div id={anchorId} className="flex items-center gap-2 my-4 scroll-mt-4">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.tint}`}>
        <span>{meta.icon}</span> {meta.label}
      </span>
      <span className="flex-1 h-px bg-[#E8E8EE]" />
    </div>
  );
};

/** One chat bubble — builder (right) or coach (left). */
const TranscriptBubble = ({ who, text }) => {
  const isCoach = who === 'coach';
  return (
    <div className={`flex gap-2 mb-3 ${isCoach ? '' : 'flex-row-reverse'}`}>
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm"
        style={{ backgroundColor: isCoach ? '#EDEDFE' : '#F1F5F9' }}
      >
        {isCoach ? '🤖' : '🧑'}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isCoach ? 'bg-white border border-[#E3E3E3] text-slate-800' : 'text-slate-800'
        }`}
        style={isCoach ? undefined : { backgroundColor: '#F1F5F9' }}
      >
        <div className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${isCoach ? 'text-[#4242EA]' : 'text-slate-400'}`}>
          {isCoach ? 'Coach' : 'Builder'}
        </div>
        {text}
      </div>
    </div>
  );
};

/**
 * Grading summary shown inline after the grading phase — the outcome, WHY it
 * passed/failed (window-relative rule), and the grader's per-skill thought
 * process (level + vs-prior + rationale + evidence) plus the builder-facing
 * feedback. Legacy runs without per-skill assessments fall back to the old
 * score/criteria rendering.
 */
const GradeResult = ({ sr }) => {
  const assessments = Array.isArray(sr.skillAssessments) ? sr.skillAssessments : [];
  const crit = Array.isArray(sr.criteriaScores) ? sr.criteriaScores : [];
  const met = crit.filter((c) => c.met).length;
  const [open, setOpen] = useState(false);

  if (sr.gradeError) {
    return (
      <div className="ml-9 mb-3 -mt-1 max-w-2xl">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          {GRADE_ERROR_TEXT}
          {sr.feedback && <p className="mt-1 italic">{sr.feedback}</p>}
        </div>
      </div>
    );
  }

  // Dreyfus path — the grading summary card.
  if (assessments.length > 0) {
    const reason = gradeReason(sr);
    return (
      <div className="ml-9 mb-3 -mt-1 max-w-2xl">
        <div className="bg-[#FAFAFC] border border-[#E8E8EE] rounded-lg p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={sr.passed ? 'green' : 'red'}>{sr.passed ? '✓ Passed' : '✗ Did not pass'}</Chip>
            {reason && <span className="text-xs text-slate-600">{reason}</span>}
          </div>
          <div className="mt-2.5 space-y-2.5">
            {assessments.map((a, i) => (
              <div key={i} className="border-l-2 pl-2.5" style={{ borderColor: BRAND }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800 capitalize">{(a.skill_slug || '').replace(/-/g, ' ')}</span>
                  <Chip tone={Number.isInteger(a.level) ? (a.level >= 3 ? 'green' : a.level >= 1 ? 'blue' : 'red') : 'slate'}>
                    {levelLabel(a.level)}
                  </Chip>
                  {vsPriorLabel(a) && <span className="text-[11px] text-slate-500">{vsPriorLabel(a)}</span>}
                </div>
                {a.rationale && (
                  <p className="text-xs text-slate-600 mt-1"><span className="font-semibold">Why:</span> {a.rationale}</p>
                )}
                {a.evidence && (
                  <p className="text-xs text-slate-500 italic mt-0.5"><span className="font-semibold not-italic">Evidence:</span> “{a.evidence}”</p>
                )}
              </div>
            ))}
          </div>
          {sr.feedback && (
            <p className="text-xs text-slate-600 mt-2.5 pt-2 border-t border-[#EEE]">
              <span className="font-semibold">Feedback to builder:</span> {sr.feedback}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Legacy path (pre-Dreyfus runs) — score + criteria table.
  if (typeof sr.overallScore !== 'number' && crit.length === 0) return null;
  return (
    <div className="ml-9 mb-3 -mt-1">
      <div className="inline-flex flex-wrap items-center gap-2 bg-[#FAFAFC] border border-[#E8E8EE] rounded-lg px-3 py-2">
        {typeof sr.overallScore === 'number' && (
          <Chip tone={sr.passed ? 'green' : 'red'}>
            {sr.passed ? '✓ Passed' : '✗ Not passed'} · {sr.overallScore}/100
          </Chip>
        )}
        {crit.length > 0 && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-slate-600 hover:text-slate-900 underline-offset-2 hover:underline"
          >
            Met {met} of {crit.length} criteria {open ? '▾' : '▸'}
          </button>
        )}
      </div>
      {open && crit.length > 0 && (
        <div className="mt-2 max-w-2xl">
          <CriteriaTable criteriaScores={crit} />
        </div>
      )}
    </div>
  );
};

/** "How the coach personalized this run" — built from the init step decision. */
const PersonalizationCard = ({ strat }) => {
  if (!strat || (!strat.teachingMethod && !strat.difficultyLevel)) return null;
  const methodLabel = TEACHING_METHOD_LABEL[strat.teachingMethod] || strat.teachingMethod;
  return (
    <div className="bg-white border border-[#E3E3E3] rounded-xl p-4 mb-4">
      <h3 className="text-sm font-bold text-[#1E1E1E] mb-3">How the coach personalized this run</h3>
      <ul className="space-y-2 text-sm text-slate-700">
        {strat.teachingMethod && (
          <li className="flex gap-2"><span>📘</span><span><span className="font-semibold">Teaching style:</span> {methodLabel}</span></li>
        )}
        {(strat.difficultyLevel || Number.isInteger(strat.targetLevel)) && (
          <li className="flex gap-2">
            <span>🎚️</span>
            <span>
              <span className="font-semibold">Difficulty:</span>{' '}
              {formatRunDifficulty(strat)}
            </span>
          </li>
        )}
        {strat.difficultyModifier === '+20%' && (
          <li className="flex gap-2">
            <span>🎯</span>
            <span>
              <span className="font-semibold">Made 20% harder</span> to target a mock-interview weak area
              {Array.isArray(strat.interviewWeaknessContext) && strat.interviewWeaknessContext.length > 0 && (
                <span className="text-slate-500"> ({strat.interviewWeaknessContext.join(', ')})</span>
              )}
            </span>
          </li>
        )}
      </ul>
      <p className="text-[11px] text-slate-400 mt-3">These are the coach’s deterministic choices, made before any teaching began.</p>
    </div>
  );
};

/** Proportional-duration timeline bar; click a segment to jump to it. */
const DurationTimeline = ({ phaseDurations, totalMs, totalUsd, onJump }) => {
  if (!phaseDurations.length) return null;
  return (
    <div className="bg-white border border-[#E3E3E3] rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-[#1E1E1E]">Session timeline</h3>
        <span className="text-[11px] text-slate-400">
          {fmtDuration(totalMs)} of coach processing{totalUsd > 0 ? ` · ${fmtCost(totalUsd)}` : ''}
        </span>
      </div>
      <div className="flex w-full h-7 rounded-md overflow-hidden border border-[#E8E8EE]">
        {phaseDurations.map((p, i) => {
          const pct = Math.max((p.ms / (totalMs || 1)) * 100, 4);
          const meta = phaseMeta(p.node);
          return (
            <button
              key={`${p.node}-${i}`}
              onClick={() => onJump(p.node)}
              title={`${meta.label} · ${fmtDuration(p.ms)}${p.usd > 0 ? ` · ${fmtCost(p.usd)}` : ''}`}
              className="h-full hover:opacity-80 transition-opacity"
              style={{ width: `${pct}%`, backgroundColor: meta.bar }}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {phaseDurations.map((p, i) => {
          const meta = phaseMeta(p.node);
          return (
            <span key={`${p.node}-legend-${i}`} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: meta.bar }} />
              {meta.icon} {meta.label}{' '}
              <span className="text-slate-400">· {fmtDuration(p.ms)}{p.usd > 0 ? ` · ${fmtCost(p.usd)}` : ''}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** A single skill level (0–100) as a labeled bar. */
const SkillBar = ({ label, value }) => (
  <div className="flex items-center gap-2">
    <span className="w-44 shrink-0 text-xs text-slate-600 truncate capitalize" title={label}>{label}</span>
    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: BRAND }} />
    </div>
    <span className="w-8 text-right text-xs font-semibold text-slate-700">{Math.round(value)}</span>
  </div>
);

const CtxLabel = ({ children }) => (
  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{children}</div>
);

/**
 * "What the coach saw" — the exact structured builder profile the LLM received,
 * captured on the init step (builder_context). Skills, learning profile,
 * interview weak areas, task history, plus a raw-JSON fallback so nothing is
 * hidden.
 */
const BuilderContextPanel = ({ context }) => {
  const [open, setOpen] = useState(true);
  const [rawOpen, setRawOpen] = useState(false);
  if (!context) return null;

  const comp = context.competencies || {};
  const skills = Object.entries(comp.skillLevels || {}).sort((a, b) => b[1] - a[1]);
  // Operative Dreyfus proficiency (preferred display). The /100 bars are the
  // legacy EMA and only shown for snapshots that predate skill_proficiency.
  const proficiency = Object.entries(comp.skillProficiency || {})
    .filter(([, v]) => Number.isInteger(v?.level))
    .sort((a, b) => b[1].level - a[1].level);
  const method = comp.modalityPreferences?.preferred;
  const weaknesses = comp.interviewThemes?.recurring_weaknesses || [];
  const lp = context.learningProfile || {};
  const lpFields = lp.fields || {};
  const counts = context.performance?.taskCounts || {};
  const bg = context.background?.markdown;
  const goals = context.goals?.markdown;

  return (
    <div className="bg-white border border-[#E3E3E3] rounded-xl p-4 mb-4">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
        <div>
          <h3 className="text-sm font-bold text-[#1E1E1E]">What the coach saw</h3>
          <p className="text-[11px] text-slate-400">The exact builder profile fed to the LLM</p>
        </div>
        <span className="text-slate-400 text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {context.identity?.level && <Chip>Level {context.identity.level}</Chip>}
            {context.identity?.cohort && <Chip>{context.identity.cohort}</Chip>}
            {method && <Chip tone="violet">prefers {String(method).replace(/_/g, ' ')}</Chip>}
            {counts.total != null && <Chip>{counts.completed ?? 0}/{counts.total} tasks done</Chip>}
          </div>

          {proficiency.length > 0 ? (
            <div>
              <CtxLabel>Skill proficiency (Dreyfus)</CtxLabel>
              <div className="space-y-1.5">
                {proficiency.map(([slug, v]) => (
                  <div key={slug} className="flex items-center gap-2">
                    <span className="w-44 shrink-0 text-xs text-slate-600 truncate capitalize" title={slug}>
                      {slug.replace(/-/g, ' ')}
                    </span>
                    <Chip tone={v.level >= 3 ? 'green' : v.level >= 1 ? 'blue' : 'red'}>
                      {levelLabel(v.level)}
                    </Chip>
                    {v.observations === 0 && (
                      <span className="text-[10px] text-slate-400" title="Seeded prior — not yet confirmed by a graded task">· seed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : skills.length > 0 && (
            <div>
              <CtxLabel>Skill levels (/100 — legacy)</CtxLabel>
              <div className="space-y-1.5">
                {skills.map(([slug, v]) => <SkillBar key={slug} label={slug.replace(/-/g, ' ')} value={v} />)}
              </div>
            </div>
          )}

          {(lp.markdown || Object.keys(lpFields).length > 0) && (
            <div>
              <CtxLabel>Learning profile</CtxLabel>
              {lp.markdown
                ? <p className="text-sm text-slate-700 whitespace-pre-wrap">{lp.markdown}</p>
                : (
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(lpFields).map(([k, v]) => (
                      <Chip key={k}>{k.replace(/_/g, ' ')}: {String(v)}</Chip>
                    ))}
                  </div>
                )}
            </div>
          )}

          {weaknesses.length > 0 && (
            <div>
              <CtxLabel>Mock-interview weak areas</CtxLabel>
              <div className="flex flex-wrap gap-1.5">{weaknesses.map((w) => <Chip key={w} tone="red">{w}</Chip>)}</div>
            </div>
          )}

          {bg && (
            <div>
              <CtxLabel>Background</CtxLabel>
              <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-6">{bg}</p>
            </div>
          )}
          {goals && (
            <div>
              <CtxLabel>Goals</CtxLabel>
              <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-6">{goals}</p>
            </div>
          )}

          <div>
            <button
              onClick={() => setRawOpen((o) => !o)}
              className="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
            >
              Full context (raw JSON) {rawOpen ? '▾' : '▸'}
            </button>
            {rawOpen && (
              <pre className="mt-2 px-3 py-2 text-[11px] text-slate-700 bg-[#F7F7F9] border border-[#E8E8EE] rounded-md whitespace-pre-wrap break-words max-h-96 overflow-auto font-mono">
                {JSON.stringify(context, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const StoryView = ({ run, onViewSummary }) => {
  const steps = run.steps || [];
  const id = run.identity || {};

  // --- derive the story from the raw steps -------------------------------
  const initStep = steps.find((s) => s.node === 'init');
  const strat = initStep?.structured_result || {};

  const gradeSteps = steps.filter((s) => s.node === 'grade');
  const lastGrade = gradeSteps[gradeSteps.length - 1];
  const gradeSr = lastGrade?.structured_result || {};
  const completed = steps.some((s) => s.node === 'complete');

  const score = typeof gradeSr.overallScore === 'number'
    ? gradeSr.overallScore
    : (run.outcomes?.[0]?.overall_score ?? null);
  const passed = typeof gradeSr.passed === 'boolean'
    ? gradeSr.passed
    : (run.outcomes?.[0]?.passed ?? null);
  const gradeError = !!gradeSr.gradeError;
  const assessments = Array.isArray(gradeSr.skillAssessments) ? gradeSr.skillAssessments : [];
  const reason = gradeReason(gradeSr);

  // Outcome banner. Dreyfus runs show the outcome + why; the 0-100 number is
  // shown only for legacy runs with no per-skill assessments.
  let status = { text: 'In progress', tone: 'bg-slate-100 text-slate-600 border-slate-200', icon: '⏳' };
  if (gradeError) status = { text: 'Grading error', tone: 'bg-amber-100 text-amber-700 border-amber-200', icon: '⚠️' };
  else if (completed && passed) status = { text: 'Passed', tone: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '✅' };
  else if (gradeSteps.length > 0 && passed === false) status = { text: 'Did not pass yet', tone: 'bg-rose-100 text-rose-700 border-rose-200', icon: '❌' };
  else if (completed) status = { text: 'Completed', tone: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: '✅' };
  const legacyScoreSuffix = assessments.length === 0 && !gradeError && score != null ? ` · ${score}/100` : '';

  // Build the chat transcript + phase anchors (first occurrence of each phase
  // gets a scroll anchor so the timeline can jump to it).
  const seenPhases = new Set();
  const items = [];
  let lastNode = null;
  for (const s of steps) {
    if (s.node !== lastNode) {
      const first = !seenPhases.has(s.node);
      if (first) seenPhases.add(s.node);
      items.push({ kind: 'divider', node: s.node, anchorId: first ? `phase-${s.node}` : undefined });
      lastNode = s.node;
    }
    if (s.user_message) items.push({ kind: 'bubble', who: 'builder', text: s.user_message });
    if (s.visible_output) items.push({ kind: 'bubble', who: 'coach', text: s.visible_output });
    if (s.node === 'grade') items.push({ kind: 'grade', sr: s.structured_result || {} });
  }
  const msgCount = items.filter((it) => it.kind === 'bubble').length;

  // Phase durations + cost (first-occurrence order, summed across repeated nodes)
  const order = [];
  const idx = {};
  for (const s of steps) {
    const ms = s.latency_ms || 0;
    const usd = s.estimated_cost_usd || 0;
    if (idx[s.node] == null) { idx[s.node] = order.length; order.push({ node: s.node, ms, usd }); }
    else { order[idx[s.node]].ms += ms; order[idx[s.node]].usd += usd; }
  }
  const totalMs = order.reduce((a, b) => a + b.ms, 0);
  const totalUsd = order.reduce((a, b) => a + (b.usd || 0), 0);

  // The structured profile the LLM saw is captured on the init step.
  const builderContext = initStep?.builder_context || null;

  const jump = (node) => {
    const el = document.getElementById(`phase-${node}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="max-w-3xl">
      {/* Summary card */}
      <div className="bg-white border border-[#E3E3E3] rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[#1E1E1E] truncate">
              {id.first_name} {id.last_name}
            </h2>
            <p className="text-sm text-slate-500 truncate">{id.task_title}</p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-2">
            {topLevel(assessments) != null && (
              <Chip tone="violet">🏅 {levelLabel(topLevel(assessments))}</Chip>
            )}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border ${status.tone}`}>
              <span>{status.icon}</span> {status.text}{legacyScoreSuffix}
            </span>
          </span>
        </div>

        {(reason || assessments.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {reason && <span className="text-xs text-slate-500">{status.text === 'Passed' || passed ? 'Passed:' : 'Outcome:'} {reason}</span>}
            {assessments.map((a, i) => (
              <Chip key={i} tone={Number.isInteger(a.level) ? (a.level >= 3 ? 'green' : a.level >= 1 ? 'blue' : 'red') : 'slate'}>
                {(a.skill_slug || '').replace(/-/g, ' ')} · {levelLabel(a.level)}
              </Chip>
            ))}
          </div>
        )}

        {id.v2_learning_goal && (
          <p className="text-sm text-slate-600 mt-2"><span className="font-semibold">Goal:</span> {id.v2_learning_goal}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-[#F0F0F0]">
          <StatPill label="Messages" value={msgCount} />
          <StatPill label="Attempts" value={gradeSteps.length || '—'} />
          <StatPill label="Coach time" value={fmtDuration(totalMs)} />
          <StatPill label="Est. cost" value={totalUsd > 0 ? fmtCost(totalUsd) : '—'} />
        </div>
      </div>

      <PersonalizationCard strat={strat} />
      <BuilderContextPanel context={builderContext} />
      <DurationTimeline phaseDurations={order} totalMs={totalMs} totalUsd={totalUsd} onJump={jump} />

      {/* Conversation */}
      <div className="bg-white border border-[#E3E3E3] rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-[#1E1E1E]">Conversation</h3>
          <button
            onClick={onViewSummary}
            className="text-xs px-2.5 py-1 rounded-md border border-[#E3E3E3] hover:bg-[#F7F7F9] text-slate-600"
          >
            📋 View summary
          </button>
        </div>
        {items.length === 0 && <p className="text-sm text-slate-400">No conversation recorded.</p>}
        {items.map((it, i) => {
          if (it.kind === 'divider') return <PhaseDivider key={i} node={it.node} anchorId={it.anchorId} />;
          if (it.kind === 'grade') return <GradeResult key={i} sr={it.sr} />;
          return <TranscriptBubble key={i} who={it.who} text={it.text} />;
        })}
      </div>
    </div>
  );
};

// ===========================================================================

// Structured run-summary model — pure. Shared by the readable summary sheet
// (rendered as labelled sections) and the plain-text clipboard recap.
const buildRunSummaryModel = (run) => {
  const id = run.identity || {};
  const steps = run.steps || [];
  const strat = steps.find((s) => s.node === 'init')?.structured_result || {};
  const gradeSteps = steps.filter((s) => s.node === 'grade');
  const gradeSr = gradeSteps[gradeSteps.length - 1]?.structured_result || {};
  const score = typeof gradeSr.overallScore === 'number' ? gradeSr.overallScore : (run.outcomes?.[0]?.overall_score ?? null);
  const passed = typeof gradeSr.passed === 'boolean' ? gradeSr.passed : (run.outcomes?.[0]?.passed ?? null);
  const gradeError = !!gradeSr.gradeError;
  const assessments = Array.isArray(gradeSr.skillAssessments) ? gradeSr.skillAssessments : [];
  const reason = gradeReason(gradeSr);
  const completed = steps.some((s) => s.node === 'complete');

  const outcomeLabel = gradeError
    ? 'Grading error (system issue)'
    : completed && passed
      ? 'Passed'
      : (gradeSteps.length && passed === false ? 'Did not pass yet' : (completed ? 'Completed' : 'In progress'));
  const outcomeTone = gradeError ? 'amber' : passed ? 'green' : (gradeSteps.length && passed === false ? 'red' : 'slate');
  // Dreyfus runs report per-skill levels; the 0-100 number is only meaningful
  // for legacy runs without per-skill assessments.
  const outcomeDetail = assessments.length === 0 && !gradeError && score != null ? `${score}/100` : (reason || '');

  return {
    builder: `${id.first_name || ''} ${id.last_name || ''}`.trim() || '—',
    task: id.task_title || '—',
    goal: id.v2_learning_goal || '',
    outcomeLabel,
    outcomeTone,
    outcomeDetail,
    skills: assessments.map((a) => ({
      name: (a.skill_slug || '').replace(/-/g, ' '),
      level: levelLabel(a.level),
      vsPrior: (vsPriorLabel(a) || '').replace(/^[↑↓] /, ''),
      rationale: a.rationale || '',
    })),
    teachingStyle: strat.teachingMethod ? (TEACHING_METHOD_LABEL[strat.teachingMethod] || strat.teachingMethod) : '',
    // Plain-text twin of formatRunDifficulty — same both-vocabularies rule.
    difficulty: difficultySummaryText(strat),
    attempts: gradeSteps.length || 0,
  };
};

// Plain-text recap (Slack/email) derived from the model — blank lines between
// sections so a paste reads cleanly instead of as one block.
const runSummaryText = (m) => {
  if (!m) return '';
  const sections = [
    [`Coach run — ${m.builder}`, `Task: ${m.task}`, m.goal ? `Goal: ${m.goal}` : null].filter(Boolean).join('\n'),
    `Outcome: ${m.outcomeLabel}${m.outcomeDetail ? ` — ${m.outcomeDetail}` : ''}`,
  ];
  if (m.skills.length) {
    sections.push(['Skills assessed:', ...m.skills.map((s) =>
      `  • ${s.name}: ${s.level}${s.vsPrior ? ` (${s.vsPrior})` : ''}${s.rationale ? `\n      ${s.rationale}` : ''}`
    )].join('\n'));
  }
  const pers = [
    m.teachingStyle ? `  Teaching style: ${m.teachingStyle}` : null,
    m.difficulty ? `  Difficulty: ${m.difficulty}` : null,
  ].filter(Boolean);
  if (pers.length) sections.push(['Personalization:', ...pers].join('\n'));
  sections.push(`Attempts: ${m.attempts || '—'}`);
  return sections.join('\n\n');
};

// Small uppercase section label for the summary sheet.
const SummaryLabel = ({ children }) => (
  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">{children}</div>
);

// Right-slide sheet that displays the run summary in-app as labelled sections
// (not one block of text), with a plain-text copy button for Slack/email.
const SummarySheet = ({ open, onOpenChange, model, text }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — ignore */ }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg flex flex-col font-proxima">
        <SheetHeader>
          <SheetTitle>Run summary</SheetTitle>
          <SheetDescription>A readable recap of this coach run.</SheetDescription>
        </SheetHeader>

        {!model ? (
          <div className="mt-4 text-sm text-slate-400">No summary available.</div>
        ) : (
          <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
            {/* Builder + task */}
            <div>
              <div className="text-base font-bold text-[#1E1E1E]">{model.builder}</div>
              <div className="text-sm text-slate-500">{model.task}</div>
            </div>

            {/* Outcome */}
            <section>
              <SummaryLabel>Outcome</SummaryLabel>
              <div className="flex items-center gap-2 flex-wrap">
                <Chip tone={model.outcomeTone}>{model.outcomeLabel}</Chip>
                {model.outcomeDetail && <span className="text-sm text-slate-600">{model.outcomeDetail}</span>}
              </div>
            </section>

            {/* Skills assessed */}
            {model.skills.length > 0 && (
              <section>
                <SummaryLabel>Skills assessed</SummaryLabel>
                <div className="space-y-2">
                  {model.skills.map((s, i) => (
                    <div key={i} className="bg-[#F7F7F9] border border-[#E3E3E3] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800 capitalize">{s.name}</span>
                        <Chip tone="blue">{s.level}</Chip>
                        {s.vsPrior && <span className="text-[11px] text-slate-500">{s.vsPrior}</span>}
                      </div>
                      {s.rationale && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{s.rationale}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Personalization */}
            {(model.teachingStyle || model.difficulty) && (
              <section>
                <SummaryLabel>How it was personalized</SummaryLabel>
                <dl className="text-sm text-slate-600 space-y-1">
                  {model.teachingStyle && <div><span className="text-slate-400">Teaching style: </span>{model.teachingStyle}</div>}
                  {model.difficulty && <div><span className="text-slate-400">Difficulty: </span>{model.difficulty}</div>}
                </dl>
              </section>
            )}

            {/* Details */}
            <section>
              <SummaryLabel>Details</SummaryLabel>
              <dl className="text-sm text-slate-600 space-y-1">
                {model.goal && <div><span className="text-slate-400">Goal: </span>{model.goal}</div>}
                <div><span className="text-slate-400">Attempts: </span>{model.attempts || '—'}</div>
              </dl>
            </section>
          </div>
        )}

        <div className="mt-4 shrink-0 border-t border-[#E3E3E3] pt-4">
          <button
            onClick={copy}
            className="text-sm px-4 py-2 rounded-md text-white font-medium"
            style={{ backgroundColor: BRAND }}
          >
            {copied ? '✓ Copied to clipboard' : '📋 Copy to clipboard'}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const RunDetail = ({ token, threadId }) => {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('story'); // 'story' | 'developer'

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCoachRun(token, threadId);
      setRun(data);
    } catch (e) {
      setError(e.message || 'Failed to load run');
    } finally {
      setLoading(false);
    }
  }, [token, threadId]);

  useEffect(() => { load(); }, [load]);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const summaryModel = useMemo(() => (run ? buildRunSummaryModel(run) : null), [run]);
  const summaryText = useMemo(() => runSummaryText(summaryModel), [summaryModel]);

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading run…</div>;
  if (error) return <div className="p-8 text-rose-600 text-sm">{error}</div>;
  if (!run) return null;

  const id = run.identity || {};
  const totals = run.usageTotals || {};

  return (
    <div className="p-6">
      {/* run header + view toggle */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-[#1E1E1E]">
            {id.first_name} {id.last_name} <span className="text-slate-400 font-normal">· {id.task_title}</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {id.email} · {id.cohort} · thread #{run.thread_id} · {run.steps.length} steps
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* segmented toggle */}
          <div className="inline-flex bg-slate-100 border border-[#E3E3E3] rounded-lg p-0.5">
            {[['story', 'Readable'], ['developer', 'Developer']].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${
                  view === v ? 'bg-white text-[#4242EA] shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 rounded-md border border-[#E3E3E3] hover:bg-[#F7F7F9] text-slate-600"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {view === 'story' ? (
        <StoryView run={run} onViewSummary={() => setSummaryOpen(true)} />
      ) : (
        <>
          {/* run-level usage strip */}
          <div className="flex flex-wrap gap-4 mb-6 text-xs bg-[#F7F7F9] border border-[#E3E3E3] rounded-lg px-4 py-3">
            <div><span className="text-slate-400">LLM calls</span> <span className="font-semibold text-slate-700">{fmtNum(totals.call_count)}</span></div>
            <div><span className="text-slate-400">Prompt tok</span> <span className="font-semibold text-slate-700">{fmtNum(totals.prompt_tokens)}</span></div>
            <div><span className="text-slate-400">Completion tok</span> <span className="font-semibold text-slate-700">{fmtNum(totals.completion_tokens)}</span></div>
            <div><span className="text-slate-400">Total tok</span> <span className="font-semibold text-slate-700">{fmtNum(totals.total_tokens)}</span></div>
            <div><span className="text-slate-400">Est. cost</span> <span className="font-semibold text-slate-700">${Number(totals.estimated_cost_usd || 0).toFixed(4)}</span></div>
          </div>

          {/* agent timeline */}
          <div>
            {run.steps.map((step) => <StepCard key={step.id} step={step} />)}
          </div>
        </>
      )}

      <SummarySheet open={summaryOpen} onOpenChange={setSummaryOpen} model={summaryModel} text={summaryText} />
    </div>
  );
};

const CoachRuns = ({ embedded = false, openThreadId = null }) => {
  const token = useAuthStore((s) => s.token);
  const { canAccessPage } = usePermissions();

  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(openThreadId);

  // Search is server-side: with a term we scan ALL runs (name/email/task/cohort),
  // not just the recent-window default, so a match outside the latest 100 is
  // still found. A term raises the limit to the server cap so a broad match
  // (e.g. a task title shared by many builders) isn't itself truncated.
  const loadRuns = useCallback(async (searchTerm = '') => {
    setLoading(true);
    setError(null);
    try {
      const term = (searchTerm || '').trim();
      const data = await listCoachRuns(token, term ? { search: term, limit: 500 } : {});
      setRuns(data.runs || []);
    } catch (e) {
      setError(e.message || 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Debounce the search box into the server query (also drives the initial
  // load, with an empty term → default recent list).
  useEffect(() => {
    const t = setTimeout(() => { loadRuns(search); }, 300);
    return () => clearTimeout(t);
  }, [search, loadRuns]);

  // Open a specific run when requested (e.g. the Coach Evals tab passes the
  // eval case's thread). RunDetail loads by thread id independently of the
  // list, so this works even for eval-cohort threads filtered out below.
  useEffect(() => {
    if (openThreadId != null) setSelected(openThreadId);
  }, [openThreadId]);

  if (!canAccessPage('coach')) {
    return (
      <div className="min-h-screen bg-[#EFEFEF] p-8 flex items-center justify-center">
        <div className="bg-red-50 text-red-600 px-6 py-8 rounded-lg border border-red-200 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p>You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  // Hide synthetic eval-harness personas from the real run list (they still
  // open via the ?thread= deep-link from Coach Evals). Golden Dataset runs ARE
  // shown so staff can inspect archetype runs alongside real ones — the Cohort
  // column ("Golden Dataset") distinguishes them and search can isolate them.
  // Name/task/cohort search runs server-side (see loadRuns) so it reaches every
  // run, not just the loaded window. The only client-side filter left is the
  // eval-harness belt-and-suspenders (the server already excludes it).
  const filtered = runs.filter((r) => r.cohort !== 'Eval Harness');

  return (
    <div className={`flex flex-col min-h-0 font-proxima ${embedded ? 'h-full' : 'h-screen bg-[#EFEFEF]'}`}>
      {!embedded && (
        <div className="shrink-0 bg-white border-b border-[#E3E3E3] px-8 py-4">
          <h1 className="text-2xl font-bold text-[#1E1E1E]">Coach Runs</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Per-agent observability for v2 personalized-task runs
          </p>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* left: run list — scrolls independently */}
        <aside className="w-96 shrink-0 border-r border-[#E3E3E3] bg-white flex flex-col min-h-0">
          <div className="shrink-0 p-3 border-b border-[#E3E3E3] flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search builder, task, cohort…"
              className="flex-1 text-sm px-3 py-1.5 border border-[#E3E3E3] rounded-md focus:outline-none focus:ring-1"
              style={{ '--tw-ring-color': BRAND }}
            />
            <button
              onClick={() => loadRuns(search)}
              className="text-xs px-3 py-1.5 rounded-md border border-[#E3E3E3] hover:bg-[#F7F7F9] text-slate-600"
            >
              ↻
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading && <div className="p-4 text-slate-400 text-sm">Loading…</div>}
            {error && <div className="p-4 text-rose-600 text-sm">{error}</div>}
            {!loading && filtered.length === 0 && (
              <div className="p-4 text-slate-400 text-sm">
                {search.trim() ? `No runs match “${search.trim()}”.` : 'No coach runs recorded yet.'}
              </div>
            )}
            {filtered.map((r) => {
              const active = selected === r.thread_id;
              const meta = NODE_META[r.last_node] || {};
              return (
                <button
                  key={r.thread_id}
                  onClick={() => setSelected(r.thread_id)}
                  className={`w-full text-left px-4 py-3 border-b border-[#F0F0F0] hover:bg-[#F7F7F9] ${active ? 'bg-[#F0F0FF]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 truncate">
                      {r.first_name} {r.last_name}
                    </span>
                    {r.grade_error ? (
                      <Chip tone="amber">⚠ grading error</Chip>
                    ) : r.passed != null && (
                      <Chip tone={r.passed ? 'green' : 'red'}>
                        {r.passed ? '✓ passed' : '✗ not passed'}
                        {topLevel(r.skill_assessments) != null ? ` · ${DREYFUS_LABELS[topLevel(r.skill_assessments)]}` : ''}
                      </Chip>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{r.task_title}</div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                    <span className={`px-1.5 py-0.5 rounded border ${meta.color || 'border-slate-200'}`}>
                      {meta.label || r.last_node}
                    </span>
                    <span>{r.step_count} steps</span>
                    <span className="ml-auto">{fmtTime(r.last_step_at)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* right: detail — scrolls independently */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-[#EFEFEF]">
          {selected ? (
            <RunDetail token={token} threadId={selected} />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              Select a run to inspect its agent timeline.
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default CoachRuns;
