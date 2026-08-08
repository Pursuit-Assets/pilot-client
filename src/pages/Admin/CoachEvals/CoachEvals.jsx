import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { listSuites, runEval, listBatches, getBatch, getCase, saveAnnotation } from '../../../services/coachEvalsApi';
import { SkillAssessmentTable, gradeReason, topLevel, levelLabel, GRADE_ERROR_TEXT } from '../coachDreyfus';
import { LLM_MODELS } from '../../../constants/llmModels';

// ── Pursuit design tokens ────────────────────────────────────────────────────
const BRAND = '#4242EA';        // Pursuit Purple
const BRAND_HOVER = '#3535C7';
const CARD = 'bg-white rounded-[18px] border border-[#E3E3E3] shadow-[0_2px_4px_rgba(0,0,0,0.05)]';

// The 8 judge dimensions (coachEvalJudges.js). teaching_method_adherence and
// remediation are CONDITIONAL — they only score when the run had a declared
// teaching style / actually remediated; when absent we show a muted "not scored"
// row rather than silently dropping them.
const DIMENSION_LABELS = {
  teaching: 'Teaching',
  teaching_method_adherence: 'Method adherence',
  challenge_design: 'Challenge design',
  grading_quality: 'Grading quality',
  grading_consistency: 'Grading consistency',
  remediation: 'Remediation',
  completion: 'Completion',
  end_to_end: 'End-to-end',
};

// Why a dimension is absent — shown on the muted "not scored" row so "not
// applicable to this run" reads differently from "we forgot to measure it".
const DIMENSION_ABSENT_REASON = {
  teaching_method_adherence: 'no declared teaching style',
  remediation: 'passed first attempt — no remediation turn',
  grading_consistency: 're-grade sampling produced no stable signal',
};

// grading_consistency is objective (computed level-stability), not an LLM
// opinion — flag it so reviewers read its score differently.
const OBJECTIVE_DIMENSIONS = new Set(['grading_consistency']);

const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString() : '—');
const scoreTone = (s) => (s == null ? 'slate' : s >= 80 ? 'green' : s >= 60 ? 'amber' : 'red');

const TONES = {
  slate: 'bg-slate-100 text-slate-600 border-slate-300',
  green: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  amber: 'bg-amber-100 text-amber-700 border-amber-300',
  red: 'bg-rose-100 text-rose-700 border-rose-300',
  purple: 'bg-[#4242EA]/10 text-[#4242EA] border-[#4242EA]/20',
};

const Chip = ({ children, tone = 'slate' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${TONES[tone]}`}>
    {children}
  </span>
);

// Status uses purple for "done" (brand), amber for running, rose for failed —
// distinct from scoreTone, which colors 0–100 judge scores.
const StatusBadge = ({ status }) => {
  const tone = status === 'done' ? 'purple' : status === 'failed' ? 'red' : 'amber';
  return <Chip tone={tone}>{status}</Chip>;
};

// ALL-CAPS letter-spaced section label (Pursuit style).
const Caps = ({ children, className = '' }) => (
  <div className={`text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 ${className}`}>{children}</div>
);

/** Styled select matching the Figma control boxes — native chrome stripped
 *  (appearance-none), a custom chevron, hairline border, 8px radius, purple
 *  focus ring. */
const SelectField = ({ label, value, onChange, widthClass = 'w-56', children }) => (
  <label className={`flex flex-col gap-1.5 ${widthClass}`}>
    <Caps>{label}</Caps>
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none rounded-lg border border-[#E3E3E3] bg-white pl-3 pr-9 py-2.5 text-sm text-[#1E1E1E] cursor-pointer transition-colors hover:border-[#C8C8C8] focus:outline-none focus:border-[#4242EA] focus:ring-2 focus:ring-[#4242EA]/15"
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">▾</span>
    </div>
  </label>
);

/** KPI stat card with the signature 7px purple top bar + big numeral. */
const StatCard = ({ label, value, sub, accent, warn }) => (
  <div className="flex-1 min-w-0 overflow-hidden bg-white rounded-[14px] border border-[#E3E3E3] shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
    <div className="h-1.5" style={{ backgroundColor: BRAND }} />
    <div className="p-4">
      <Caps>{label}</Caps>
      <div className="mt-1 text-[30px] font-bold leading-none" style={{ color: accent ? BRAND : warn ? '#C73A3A' : '#1E1E1E' }}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  </div>
);

/** One dimension's aggregate score as a labeled bar (the scannable replacement
 *  for the old chip soup). Null score → muted "not scored" with a reason. */
const DimensionBar = ({ dim, score }) => {
  const objective = OBJECTIVE_DIMENSIONS.has(dim);
  return (
    <div className="flex items-center gap-3">
      <div className="w-[190px] shrink-0 flex items-center gap-1.5">
        <span className="text-[13px] font-medium text-slate-700">{DIMENSION_LABELS[dim] || dim}</span>
        {objective && (
          <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5">objective</span>
        )}
      </div>
      {score == null ? (
        <span className="text-xs italic text-slate-400">not scored · {DIMENSION_ABSENT_REASON[dim] || 'n/a for this run'}</span>
      ) : (
        <>
          <div className="flex-1 h-2.5 rounded-full bg-[#E3E3E3]/70 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, score))}%`, backgroundColor: BRAND }} />
          </div>
          <span className={`w-8 shrink-0 text-right text-[13px] font-semibold ${score < 75 ? 'text-rose-600' : 'text-slate-800'}`}>{score}</span>
        </>
      )}
    </div>
  );
};

/**
 * The COACH's own Dreyfus grade for the case — the artifact the grading_quality
 * judge is judging. Sourced from the run's latest grade step (attached to the
 * case by the server as `coachGrade`). Shown next to the judge verdicts so a
 * reviewer sees what was graded, not just the opinion of it.
 */
const CoachGradePanel = ({ grade }) => {
  const assessments = Array.isArray(grade?.skillAssessments) ? grade.skillAssessments : [];
  const top = topLevel(assessments);
  return (
    <div>
      <Caps className="mb-2">What the coach graded</Caps>
      {!grade ? (
        <p className="text-xs text-slate-400 italic">No coach grade recorded for this case.</p>
      ) : grade.gradeError ? (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{GRADE_ERROR_TEXT}</div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {grade.passed ? <Chip tone="purple">✓ passed</Chip> : <Chip tone="red">✗ not passed</Chip>}
            {gradeReason(grade) && <span className="text-xs text-slate-600">{gradeReason(grade)}</span>}
            {top != null && <Chip tone="slate">🏅 {levelLabel(top)}</Chip>}
            {grade.gradeSamples > 1 && <Chip tone="slate">consensus of {grade.gradeSamples} re-grades</Chip>}
          </div>
          {assessments.length > 0
            ? <SkillAssessmentTable assessments={assessments} />
            : <p className="text-xs text-slate-400 italic">Legacy grade — no per-skill Dreyfus assessments recorded.</p>}
        </>
      )}
    </div>
  );
};

/** Expanded per-case detail: coach's Dreyfus grade beside the judge verdicts. */
// Reviewer's human call on a case — the ground truth the Judge Alignment report
// scores judges against. Never changes the coach's grade or a builder record.
const OUTCOME_OPTS = [['agree', 'Agree'], ['disagree', 'Disagree'], ['unsure', 'Unsure']];
const FLAG_OPTS = [
  ['grading_too_lenient', 'Grading too lenient'],
  ['grading_too_harsh', 'Grading too harsh'],
  ['challenge_off_target', 'Challenge off-target'],
  ['system_error', 'System / grading error'],
];
const LEVEL_OPTS = ['na', '0', '1', '2', '3', '4', '5'];

const AnnotationPanel = ({ token, caseId, coachGrade, dimensionKeys, initial }) => {
  const assessments = Array.isArray(coachGrade?.skillAssessments) ? coachGrade.skillAssessments : [];
  const [outcome, setOutcome] = useState(initial?.outcome_verdict || '');
  const [skillLevels, setSkillLevels] = useState(() => {
    const m = {};
    for (const a of assessments) m[a.skill_slug] = Number.isInteger(a.level) ? String(a.level) : 'na';
    for (const s of (initial?.skill_levels || [])) if (s.skill_slug) m[s.skill_slug] = s.human_level == null ? 'na' : String(s.human_level);
    return m;
  });
  const [dimRatings, setDimRatings] = useState(() => {
    const m = {};
    const r = initial?.dimension_ratings || {};
    for (const d of dimensionKeys) if (typeof r[d]?.pass === 'boolean') m[d] = r[d].pass;
    return m;
  });
  const [note, setNote] = useState(initial?.note || '');
  const [flags, setFlags] = useState(initial?.flags || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggleFlag = (f) => setFlags((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      const skillLevelsBody = assessments.map((a) => {
        const v = skillLevels[a.skill_slug];
        return {
          skill_slug: a.skill_slug,
          coach_level: Number.isInteger(a.level) ? a.level : null,
          human_level: v == null || v === 'na' ? null : Number(v),
        };
      });
      const dimensionRatings = {};
      for (const [d, pass] of Object.entries(dimRatings)) if (typeof pass === 'boolean') dimensionRatings[d] = { pass };
      await saveAnnotation(token, caseId, { outcomeVerdict: outcome || null, skillLevels: skillLevelsBody, dimensionRatings, note, flags });
      setSaved(true);
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-5 border-t border-[#E3E3E3] pt-4">
      <Caps className="mb-1">Your review</Caps>
      <p className="text-[11px] text-slate-400 mb-3">Ground truth for the Judge Alignment report — this never changes the coach&apos;s grade or a builder record.</p>

      <div className="mb-4">
        <div className="text-[11px] font-medium text-slate-500 mb-1.5">Do you agree the builder passed?</div>
        <div className="inline-flex rounded-lg border border-[#E3E3E3] overflow-hidden">
          {OUTCOME_OPTS.map(([v, label]) => {
            const on = outcome === v;
            const bg = on ? (v === 'disagree' ? '#C73A3A' : v === 'unsure' ? '#94a3b8' : BRAND) : undefined;
            return (
              <button key={v} onClick={() => setOutcome(v)} className={`px-4 py-1.5 text-xs font-semibold ${on ? 'text-white' : 'text-slate-600 bg-white hover:bg-[#F7F7F9]'}`} style={on ? { backgroundColor: bg } : undefined}>{label}</button>
            );
          })}
        </div>
      </div>

      {assessments.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-medium text-slate-500 mb-1.5">Per-skill level — correct the coach where it&apos;s off</div>
          <div className="space-y-1.5">
            {assessments.map((a) => (
              <div key={a.skill_slug} className="flex items-center gap-2 text-xs">
                <span className="flex-1 text-slate-700 capitalize truncate">{(a.skill_slug || '—').replace(/-/g, ' ')}</span>
                <span className="text-[11px] text-slate-400 font-mono">coach {Number.isInteger(a.level) ? `L${a.level}` : 'N/A'}</span>
                <select
                  value={skillLevels[a.skill_slug] ?? 'na'}
                  onChange={(e) => setSkillLevels((p) => ({ ...p, [a.skill_slug]: e.target.value }))}
                  className={`rounded-md border px-2 py-1 text-xs font-mono ${skillLevels[a.skill_slug] !== (Number.isInteger(a.level) ? String(a.level) : 'na') ? 'border-rose-400 text-rose-600' : 'border-[#E3E3E3] text-slate-700'}`}
                >
                  {LEVEL_OPTS.map((o) => <option key={o} value={o}>{o === 'na' ? 'N/A' : `L${o}`}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {dimensionKeys.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-medium text-slate-500 mb-1.5">Did the coach do each of these well? (your call, vs the judge)</div>
          <div className="space-y-1.5">
            {dimensionKeys.map((d) => (
              <div key={d} className="flex items-center gap-2 text-xs">
                <span className="flex-1 text-slate-700">{DIMENSION_LABELS[d] || d}</span>
                <div className="inline-flex rounded-md border border-[#E3E3E3] overflow-hidden">
                  <button onClick={() => setDimRatings((p) => ({ ...p, [d]: true }))} className={`px-2.5 py-1 text-[11px] font-semibold ${dimRatings[d] === true ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 hover:bg-[#F7F7F9]'}`}>👍 Yes</button>
                  <button onClick={() => setDimRatings((p) => ({ ...p, [d]: false }))} className={`px-2.5 py-1 text-[11px] font-semibold border-l border-[#E3E3E3] ${dimRatings[d] === false ? 'bg-rose-100 text-rose-700' : 'bg-white text-slate-500 hover:bg-[#F7F7F9]'}`}>👎 No</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="text-[11px] font-medium text-slate-500 mb-1.5">Note</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What did the coach or judge miss?" className="w-full rounded-lg border border-[#E3E3E3] px-3 py-2 text-xs text-[#1E1E1E] resize-y" />
      </div>

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {FLAG_OPTS.map(([v, label]) => (
          <label key={v} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={flags.includes(v)} onChange={() => toggleFlag(v)} className="accent-[#4242EA]" />
            {label}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="text-xs font-semibold text-white rounded-lg px-4 py-2 disabled:opacity-50" style={{ backgroundColor: BRAND }}>
          {saving ? 'Saving…' : 'Save review'}
        </button>
        {saved && <span className="text-xs text-emerald-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
};

const CaseDetail = ({ token, caseId, onViewTimeline }) => {
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    getCase(token, caseId).then((data) => { if (live) setC(data); }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [token, caseId]);

  if (loading) return <div className="px-4 py-4 text-slate-400 text-sm">Loading case…</div>;
  if (!c) return null;

  const dims = c.dimension_scores || {};
  const reasons = c.judge_reasoning || {};

  return (
    <div className="border-t border-[#EEE] bg-[#FBFBFE] px-4 py-4">
      <div className="flex items-center justify-end mb-3">
        {c.thread_id && (onViewTimeline ? (
          <button onClick={() => onViewTimeline(c.thread_id)} className="text-xs font-semibold" style={{ color: BRAND }}>
            View agent timeline →
          </button>
        ) : (
          <Link to={`/admin/coach?tab=runs&thread=${c.thread_id}`} className="text-xs font-semibold" style={{ color: BRAND }}>
            View agent timeline →
          </Link>
        ))}
      </div>

      {c.error && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">{c.error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CoachGradePanel grade={c.coachGrade} />

        <div>
          <Caps className="mb-2">Judge verdicts</Caps>
          <div className="space-y-2">
            {Object.keys(DIMENSION_LABELS).map((d) => {
              const dim = dims[d];
              if (!dim) {
                return (
                  <div key={d} className="border border-dashed border-[#E3E3E3] rounded-lg px-3 py-2 opacity-70">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-500">{DIMENSION_LABELS[d]}</span>
                      <Chip tone="slate">not scored</Chip>
                      {DIMENSION_ABSENT_REASON[d] && <span className="text-[11px] text-slate-400 italic">{DIMENSION_ABSENT_REASON[d]}</span>}
                    </div>
                  </div>
                );
              }
              return (
                <div key={d} className="border border-[#EEE] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700">{DIMENSION_LABELS[d]}</span>
                    {OBJECTIVE_DIMENSIONS.has(d) && <Chip tone="slate">objective</Chip>}
                    <Chip tone={scoreTone(dim.score)}>{dim.score}</Chip>
                    {dim.pass ? <Chip tone="purple">pass</Chip> : <Chip tone="red">review</Chip>}
                  </div>
                  {reasons[d]?.reasoning && <p className="text-xs text-slate-600">{reasons[d].reasoning}</p>}
                  {reasons[d]?.evidence && <p className="text-[11px] text-slate-400 mt-1 italic">{reasons[d].evidence}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <AnnotationPanel token={token} caseId={caseId} coachGrade={c.coachGrade} dimensionKeys={Object.keys(dims)} initial={c.myAnnotation} />
    </div>
  );
};

/** Selected batch: header · KPI stat row · dimension performance · cases. */
const BatchDetail = ({ token, batchId, onViewTimeline }) => {
  const [data, setData] = useState(null);
  const [openCase, setOpenCase] = useState(null);

  const load = useCallback(async () => {
    const d = await getBatch(token, batchId);
    setData(d);
  }, [token, batchId]);

  useEffect(() => { load(); setOpenCase(null); }, [load]);

  // Poll while the batch is still running.
  useEffect(() => {
    if (!data || data.batch.status !== 'running') return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [data, load]);

  if (!data) return <div className={`${CARD} p-6 text-slate-400 text-sm`}>Loading batch…</div>;
  const { batch, cases } = data;
  const agg = batch.aggregate_scores || {};
  const dims = agg.dimensions || {};
  const failed = cases.filter((c) => c.status === 'failed').length;
  const passPct = agg.pass_rate != null ? Math.round(agg.pass_rate * 100) : null;
  const snap = batch.prompt_snapshot;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <h2 className="text-xl font-bold text-[#1E1E1E]">Batch #{batch.id} · {batch.suite_key}</h2>
        <StatusBadge status={batch.status} />
        {snap ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            🧊 Frozen prompts
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            ⚠️ Legacy — live prompts
          </span>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {fmtTime(batch.started_at)} · judge {batch.judge_model || 'default'}{batch.model_under_test ? ` · coach ${batch.model_under_test}` : ''}
        </span>
      </div>

      {batch.error && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{batch.error}</div>}

      {/* KPI stat cards */}
      <div className="flex gap-4">
        <StatCard label="Overall score" value={agg.overall ?? '—'} sub="judge mean" accent />
        <StatCard label="Pass rate" value={passPct != null ? `${passPct}%` : '—'} sub={`${cases.filter((c) => c.passed).length} of ${cases.length} cases`} />
        <StatCard label="Cases" value={`${batch.completed_cases}/${batch.total_cases}`} sub={batch.status === 'running' ? 'running…' : 'complete'} />
        <StatCard label="Failed cases" value={failed} sub="errored / timed out" warn={failed > 0} />
      </div>

      {/* dimension performance */}
      {agg.dimensions && (
        <div className={`${CARD} p-5`}>
          <Caps>Dimension performance</Caps>
          <p className="text-xs text-slate-400 mt-0.5 mb-4">Judge scores across the 8 rubric dimensions (0–100)</p>
          <div className="space-y-3.5">
            {Object.keys(DIMENSION_LABELS).map((d) => (
              <DimensionBar key={d} dim={d} score={dims[d] ?? null} />
            ))}
          </div>
        </div>
      )}

      {/* cases */}
      <div className={`${CARD} p-5`}>
        <div className="flex items-center gap-2">
          <Caps>Cases</Caps>
          <span className="text-xs text-slate-400">{cases.length} case{cases.length === 1 ? '' : 's'} · click a row to inspect</span>
        </div>
        <div className="mt-3">
          {/* header */}
          <div className="flex items-center gap-3 px-2 py-2 border-b border-[#E3E3E3]">
            <div className="w-40 shrink-0"><Caps>Persona</Caps></div>
            <div className="flex-1 min-w-0"><Caps>Task</Caps></div>
            <div className="w-24 shrink-0"><Caps>Status</Caps></div>
            <div className="w-16 shrink-0 text-right"><Caps>Overall</Caps></div>
            <div className="w-6 shrink-0" />
          </div>
          {cases.map((c) => {
            const open = openCase === c.id;
            return (
              <div key={c.id} className={`border-b border-[#EEE] ${open ? 'bg-[#F3F3FE] rounded-lg' : ''}`}>
                <button
                  onClick={() => setOpenCase(open ? null : c.id)}
                  className="w-full flex items-center gap-3 px-2 py-3 text-left hover:bg-[#F7F7F9] rounded-lg"
                >
                  <div className="w-40 shrink-0 text-[13px] font-medium text-slate-800 truncate">{c.persona_key}</div>
                  <div className="flex-1 min-w-0 text-[13px] text-slate-500 truncate">Task #{c.task_id}</div>
                  <div className="w-24 shrink-0"><StatusBadge status={c.status} /></div>
                  <div className="w-16 shrink-0 text-right">
                    {c.overall_score != null ? <Chip tone={scoreTone(c.overall_score)}>{c.overall_score}</Chip> : <span className="text-slate-300">—</span>}
                  </div>
                  <div className="w-6 shrink-0 text-center text-slate-400">{open ? '▴' : '▾'}</div>
                </button>
                {open && <CaseDetail token={token} caseId={c.id} onViewTimeline={onViewTimeline} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// One-line summary of a batch's frozen prompt snapshot, for the compare view.
const snapshotSummary = (snap) => {
  if (!snap) return 'legacy — no frozen prompts';
  const t = Object.keys(snap.v2_templates || {}).length;
  const c = Object.keys(snap.v2_config || {}).length;
  const s = Object.keys(snap.skill_taxonomy?.skills || {}).length;
  return `🧊 ${t} templates · ${c} config · ${s} skills`;
};

/**
 * Side-by-side comparison of two batches — the payoff of frozen prompt
 * snapshots: "did my prompt edit help or regress?" Compares aggregate dimension
 * scores + pass rate + overall, and surfaces each batch's snapshot so a
 * reviewer sees WHAT changed between the two runs.
 */
const BatchCompare = ({ token, batchIds }) => {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    setA(null); setB(null); setError(null);
    Promise.all(batchIds.map((id) => getBatch(token, id)))
      .then(([ra, rb]) => { if (live) { setA(ra); setB(rb); } })
      .catch((e) => { if (live) setError(e.message || 'Failed to load one or both batches'); });
    return () => { live = false; };
  }, [token, batchIds]);

  if (error) {
    return (
      <div className={`${CARD} p-4`}>
        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          Couldn&apos;t load the comparison: {error}
        </div>
      </div>
    );
  }

  if (!a || !b) return <div className={`${CARD} p-6 text-slate-400 text-sm`}>Loading comparison…</div>;

  const aggA = a.batch.aggregate_scores || {};
  const aggB = b.batch.aggregate_scores || {};
  const dimsA = aggA.dimensions || {};
  const dimsB = aggB.dimensions || {};
  const dimKeys = Object.keys(DIMENSION_LABELS).filter((d) => dimsA[d] != null || dimsB[d] != null);

  const deltaCell = (va, vb, unit = '') => {
    if (va == null || vb == null) return <td className="px-3 py-2 text-slate-400">—</td>;
    const d = vb - va;
    const tone = d > 0 ? 'text-emerald-600' : d < 0 ? 'text-rose-600' : 'text-slate-400';
    return <td className={`px-3 py-2 font-semibold ${tone}`}>{d > 0 ? '+' : ''}{d}{unit}</td>;
  };
  const passPct = (agg) => (agg.pass_rate != null ? Math.round(agg.pass_rate * 100) : null);

  return (
    <div className={`${CARD} p-6`}>
      <h2 className="text-xl font-bold text-[#1E1E1E] mb-1">Compare · #{a.batch.id} vs #{b.batch.id}</h2>
      <p className="text-xs text-slate-500 mb-4">
        A = #{a.batch.id} {a.batch.suite_key} ({fmtTime(a.batch.started_at)}) · B = #{b.batch.id} {b.batch.suite_key} ({fmtTime(b.batch.started_at)})
      </p>

      <table className="w-full text-xs border border-[#E3E3E3] rounded-lg overflow-hidden mb-4">
        <thead className="bg-[#F7F7F9] text-slate-600">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Metric</th>
            <th className="text-left px-3 py-2 font-semibold">A · #{a.batch.id}</th>
            <th className="text-left px-3 py-2 font-semibold">B · #{b.batch.id}</th>
            <th className="text-left px-3 py-2 font-semibold">Δ (B − A)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-[#EEE] font-semibold">
            <td className="px-3 py-2 text-slate-800">Overall</td>
            <td className="px-3 py-2 text-slate-700">{aggA.overall ?? '—'}</td>
            <td className="px-3 py-2 text-slate-700">{aggB.overall ?? '—'}</td>
            {deltaCell(aggA.overall, aggB.overall)}
          </tr>
          <tr className="border-t border-[#EEE] font-semibold">
            <td className="px-3 py-2 text-slate-800">Pass rate</td>
            <td className="px-3 py-2 text-slate-700">{passPct(aggA) != null ? `${passPct(aggA)}%` : '—'}</td>
            <td className="px-3 py-2 text-slate-700">{passPct(aggB) != null ? `${passPct(aggB)}%` : '—'}</td>
            {deltaCell(passPct(aggA), passPct(aggB), ' pts')}
          </tr>
          {dimKeys.map((d) => (
            <tr key={d} className="border-t border-[#EEE]">
              <td className="px-3 py-2 text-slate-700">{DIMENSION_LABELS[d]}</td>
              <td className="px-3 py-2 text-slate-600">{dimsA[d] ?? '—'}</td>
              <td className="px-3 py-2 text-slate-600">{dimsB[d] ?? '—'}</td>
              {deltaCell(dimsA[d], dimsB[d])}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-[11px] text-slate-500 space-y-1">
        <div><span className="font-semibold text-slate-600">A prompts:</span> {snapshotSummary(a.batch.prompt_snapshot)}</div>
        <div><span className="font-semibold text-slate-600">B prompts:</span> {snapshotSummary(b.batch.prompt_snapshot)}</div>
        <p className="text-slate-400 pt-1">Green Δ = batch B scored higher. Both batches froze their prompts, so a score change reflects the prompt/config edit, not drift.</p>
      </div>
    </div>
  );
};

const CoachEvals = ({ embedded = false, onViewTimeline = null }) => {
  const token = useAuthStore((s) => s.token);
  const { canAccessPage } = usePermissions();

  const [suites, setSuites] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [suiteKey, setSuiteKey] = useState('');
  const [modelUnderTest, setModelUnderTest] = useState('');
  const [judgeModel, setJudgeModel] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const pollRef = useRef(null);

  const selectedSuite = suites.find((s) => s.key === suiteKey) || null;

  // In compare mode, clicking a batch toggles it into a max-2 selection instead
  // of opening it. Third pick drops the oldest.
  const toggleCompare = (id) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2));
  };

  const loadBatches = useCallback(async () => {
    const d = await listBatches(token);
    setBatches(d.batches || []);
    return d.batches || [];
  }, [token]);

  useEffect(() => {
    listSuites(token).then((d) => {
      setSuites(d.suites || []);
      if (d.suites?.length) setSuiteKey(d.suites[0].key);
    }).catch((e) => setError(e.message));
    loadBatches().catch((e) => setError(e.message));
  }, [token, loadBatches]);

  // Refresh the batch list periodically while any batch is running.
  useEffect(() => {
    const anyRunning = batches.some((b) => b.status === 'running');
    if (!anyRunning) return;
    pollRef.current = setInterval(() => loadBatches(), 5000);
    return () => clearInterval(pollRef.current);
  }, [batches, loadBatches]);

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

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const { batchId } = await runEval(token, {
        suiteKey,
        modelUnderTest: modelUnderTest.trim() || undefined,
        judgeModel: judgeModel.trim() || undefined,
      });
      await loadBatches();
      setCompareMode(false);
      setSelectedBatch(batchId);
    } catch (e) {
      setError(e.message || 'Failed to start eval');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={`font-proxima bg-[#EFEFEF] flex flex-col min-h-0 ${embedded ? 'h-full' : 'h-screen'}`}>
      {!embedded && (
        <div className="shrink-0 bg-white border-b border-[#E3E3E3] px-8 py-4">
          <h1 className="text-2xl font-bold text-[#1E1E1E]">Coach Evals</h1>
          <p className="text-slate-500 text-sm mt-0.5">Automated quality evaluation of the v2 coach agent</p>
        </div>
      )}

      {/* run controls — pinned to the top; the two panes below scroll independently */}
      <div className="shrink-0 px-8 pt-3 pb-4">
        <div className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-end gap-4">
            <SelectField label="Suite" value={suiteKey} onChange={(e) => setSuiteKey(e.target.value)} widthClass="w-64">
              {suites.map((s) => <option key={s.key} value={s.key}>{s.key}</option>)}
            </SelectField>
            <SelectField label="Coach model" value={modelUnderTest} onChange={(e) => setModelUnderTest(e.target.value)} widthClass="w-56">
              <option value="">Default (production coach)</option>
              {LLM_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </SelectField>
            <SelectField label="Judge model" value={judgeModel} onChange={(e) => setJudgeModel(e.target.value)} widthClass="w-56">
              <option value="">Default (independent judge)</option>
              {LLM_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </SelectField>

            <div className="w-full lg:w-auto lg:flex-1 min-w-[16px]" />

            <button
              onClick={handleRun}
              disabled={running || !suiteKey}
              className="text-sm font-semibold text-white rounded-lg px-5 py-2.5 disabled:opacity-50 transition"
              style={{ backgroundColor: BRAND }}
              onMouseEnter={(e) => { if (!running && suiteKey) e.currentTarget.style.backgroundColor = BRAND_HOVER; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = BRAND; }}
            >
              {running ? 'Starting…' : 'Run eval'}
            </button>
            <button
              onClick={() => { setCompareMode((m) => !m); setCompareIds([]); }}
              className={`text-sm font-semibold rounded-lg px-5 py-2.5 border transition ${compareMode ? 'text-white border-transparent' : 'text-slate-700 border-[#E3E3E3] bg-white hover:bg-[#F7F7F9]'}`}
              style={compareMode ? { backgroundColor: BRAND } : undefined}
              title="Pick two batches to compare their scores side by side"
            >
              {compareMode ? 'Exit compare' : 'Compare batches'}
            </button>
          </div>

          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
          {selectedSuite && !compareMode && (
            <p className="mt-3 text-[11px] text-slate-500">
              {selectedSuite.personaCount} persona{selectedSuite.personaCount === 1 ? '' : 's'} × {selectedSuite.taskCount} task{selectedSuite.taskCount === 1 ? '' : 's'}
              {selectedSuite.focus && <span className="text-slate-400"> · {selectedSuite.focus}</span>}
            </p>
          )}
          {compareMode && (
            <p className="mt-3 text-[11px]" style={{ color: BRAND }}>
              Compare mode — select two batches from the list ({compareIds.length}/2 selected).
            </p>
          )}
        </div>
      </div>

      {/* body: two independently-scrolling panes (batches left, results right) */}
      <div className="flex-1 min-h-0 px-8 pb-6 flex gap-6">
        <aside className="w-80 shrink-0 flex flex-col min-h-0">
          <div className={`${CARD} p-4 flex flex-col min-h-0 flex-1`}>
            <Caps className="mb-3 shrink-0">Batches</Caps>
            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1 min-h-0">
                {batches.length === 0 && <div className="text-slate-400 text-sm py-2">No eval batches yet.</div>}
                {batches.map((b) => {
                  const active = compareMode ? compareIds.includes(b.id) : selectedBatch === b.id;
                  const agg = b.aggregate_scores || {};
                  return (
                    <button
                      key={b.id}
                      onClick={() => (compareMode ? toggleCompare(b.id) : setSelectedBatch(b.id))}
                      className={`w-full text-left rounded-xl border p-3 transition ${active ? 'border-[#4242EA] bg-[#F3F3FE]' : 'border-[#E3E3E3] hover:bg-[#F7F7F9]'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-slate-800 truncate">
                          {compareMode && <span className="mr-1">{compareIds.includes(b.id) ? '☑' : '☐'}</span>}
                          #{b.id} {b.suite_key}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1.5">
                        <span className="text-[22px] font-bold leading-none" style={{ color: b.status === 'failed' ? '#94a3b8' : BRAND }}>
                          {agg.overall ?? '—'}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">overall</span>
                        {agg.pass_rate != null && (
                          <span className="text-[10px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">pass {Math.round(agg.pass_rate * 100)}%</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1.5">{b.completed_cases}/{b.total_cases} cases · {fmtTime(b.started_at)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <main className="flex-1 min-w-0 overflow-y-auto pr-1">
            {compareMode ? (
              compareIds.length === 2 ? (
                <BatchCompare token={token} batchIds={compareIds} />
              ) : (
                <div className={`${CARD} p-10 text-center text-slate-400 text-sm`}>Select two batches to compare.</div>
              )
            ) : selectedBatch ? (
              <BatchDetail token={token} batchId={selectedBatch} onViewTimeline={onViewTimeline} />
            ) : (
              <div className={`${CARD} p-10 text-center text-slate-400 text-sm`}>Run a suite or select a batch to see its results.</div>
            )}
          </main>
        </div>
      </div>
  );
};

export default CoachEvals;
