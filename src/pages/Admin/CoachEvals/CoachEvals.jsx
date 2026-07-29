import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { listSuites, runEval, listBatches, getBatch, getCase } from '../../../services/coachEvalsApi';
import { SkillAssessmentTable, gradeReason, topLevel, levelLabel, GRADE_ERROR_TEXT } from '../coachDreyfus';

const BRAND = '#4242EA';

// The 8 judge dimensions (coachEvalJudges.js). teaching_method_adherence and
// remediation are CONDITIONAL — they only score when the run had a declared
// teaching style / actually remediated; when absent the case detail shows a
// muted "not scored" row rather than silently dropping them.
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
  teaching_method_adherence: 'builder has no declared teaching style',
  remediation: 'builder passed first attempt — no remediation turn',
  grading_consistency: 're-grade sampling did not produce a stable signal',
};

// Short, unambiguous labels for the compact per-case dimension chips.
// (The slice(0,4) approach collapsed "Grading quality" and "Grading
// consistency" both to "Grad".)
const DIMENSION_SHORT = {
  teaching: 'Teach',
  teaching_method_adherence: 'Method',
  challenge_design: 'Chall',
  grading_quality: 'Grade',
  grading_consistency: 'Consist',
  remediation: 'Remed',
  completion: 'Compl',
  end_to_end: 'E2E',
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
};

const Chip = ({ children, tone = 'slate' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${TONES[tone]}`}>
    {children}
  </span>
);

const StatusBadge = ({ status }) => {
  const tone = status === 'done' ? 'green' : status === 'failed' ? 'red' : 'amber';
  return <Chip tone={tone}>{status}</Chip>;
};

/**
 * The COACH's own Dreyfus grade for the case — the artifact the grading_quality
 * judge is judging. Sourced from the run's latest grade step (attached to the
 * case by the server as `coachGrade`). Shown next to the judge verdicts so a
 * reviewer can see what was graded, not just the opinion of it.
 */
const CoachGradePanel = ({ grade }) => {
  if (!grade) return null;
  const assessments = Array.isArray(grade.skillAssessments) ? grade.skillAssessments : [];
  const top = topLevel(assessments);
  return (
    <div className="border border-[#E3E3E3] rounded-lg bg-[#FBFBFE] p-3 mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">What the coach graded</div>
      {grade.gradeError ? (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">{GRADE_ERROR_TEXT}</div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {grade.passed
              ? <Chip tone="green">✓ passed</Chip>
              : <Chip tone="red">✗ not passed</Chip>}
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

/** Per-case verdict detail panel. */
const CaseDetail = ({ token, caseId, onClose, onViewTimeline }) => {
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    getCase(token, caseId).then((data) => { if (live) setC(data); }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [token, caseId]);

  if (loading) return <div className="p-4 text-slate-400 text-sm">Loading case…</div>;
  if (!c) return null;

  const dims = c.dimension_scores || {};
  const reasons = c.judge_reasoning || {};

  return (
    <div className="border border-[#E3E3E3] rounded-lg bg-white p-4 mt-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-slate-800">
          {c.persona_key} · task {c.task_id}
          {c.overall_score != null && <span className="ml-2"><Chip tone={scoreTone(c.overall_score)}>overall {c.overall_score}</Chip></span>}
        </div>
        <div className="flex items-center gap-3">
          {c.thread_id && (onViewTimeline ? (
            <button onClick={() => onViewTimeline(c.thread_id)} className="text-xs font-medium" style={{ color: BRAND }}>
              View agent timeline →
            </button>
          ) : (
            <Link to={`/admin/coach?tab=runs&thread=${c.thread_id}`} className="text-xs font-medium" style={{ color: BRAND }}>
              View agent timeline →
            </Link>
          ))}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
        </div>
      </div>

      {c.error && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-3">{c.error}</div>}

      <CoachGradePanel grade={c.coachGrade} />

      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Judge verdicts</div>
      <div className="space-y-2">
        {Object.keys(DIMENSION_LABELS).map((d) => {
          const dim = dims[d];
          if (!dim) {
            return (
              <div key={d} className="border border-dashed border-[#EEE] rounded-md p-3 opacity-70">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-slate-500">{DIMENSION_LABELS[d]}</span>
                  <Chip tone="slate">not scored</Chip>
                  {DIMENSION_ABSENT_REASON[d] && <span className="text-[11px] text-slate-400 italic">{DIMENSION_ABSENT_REASON[d]}</span>}
                </div>
              </div>
            );
          }
          return (
            <div key={d} className="border border-[#EEE] rounded-md p-3">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-semibold text-slate-700">{DIMENSION_LABELS[d]}</span>
                {OBJECTIVE_DIMENSIONS.has(d) && <Chip tone="slate">objective</Chip>}
                <Chip tone={scoreTone(dim.score)}>{dim.score}</Chip>
                {dim.pass ? <Chip tone="green">pass</Chip> : <Chip tone="red">fail</Chip>}
              </div>
              {reasons[d]?.reasoning && <p className="text-xs text-slate-600">{reasons[d].reasoning}</p>}
              {reasons[d]?.evidence && <p className="text-[11px] text-slate-400 mt-1 italic">{reasons[d].evidence}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Selected batch: cases table + case detail. */
const BatchDetail = ({ token, batchId, onViewTimeline }) => {
  const [data, setData] = useState(null);
  const [openCase, setOpenCase] = useState(null);

  const load = useCallback(async () => {
    const d = await getBatch(token, batchId);
    setData(d);
  }, [token, batchId]);

  useEffect(() => { load(); }, [load]);

  // Poll while the batch is still running.
  useEffect(() => {
    if (!data || data.batch.status !== 'running') return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [data, load]);

  if (!data) return <div className="p-6 text-slate-400 text-sm">Loading batch…</div>;
  const { batch, cases } = data;
  const agg = batch.aggregate_scores || {};

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-lg font-bold text-[#1E1E1E]">Batch #{batch.id} · {batch.suite_key}</h2>
        <StatusBadge status={batch.status} />
        <span className="text-xs text-slate-400">{batch.completed_cases}/{batch.total_cases} cases</span>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        {fmtTime(batch.started_at)} · model {batch.model_under_test || 'default'} · judge {batch.judge_model || 'default'}
      </p>
      {batch.prompt_snapshot ? (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5 inline-flex items-center gap-1.5 mb-4">
          <span aria-hidden>🧊</span>
          Frozen prompts — {Object.keys(batch.prompt_snapshot.v2_templates || {}).length} templates,{' '}
          {Object.keys(batch.prompt_snapshot.v2_config || {}).length} config values,{' '}
          {Object.keys(batch.prompt_snapshot.skill_taxonomy?.skills || {}).length} skills
          {batch.prompt_snapshot.captured_at && (
            <span className="text-emerald-600/70 ml-1">· captured {fmtTime(batch.prompt_snapshot.captured_at)}</span>
          )}
        </p>
      ) : (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 inline-flex items-center gap-1.5 mb-4">
          <span aria-hidden>⚠️</span>
          No prompt snapshot — scores reflect live values, not a frozen baseline (legacy batch).
        </p>
      )}

      {batch.status === 'done' && (
        <div className="flex flex-wrap gap-4 mb-5 bg-[#F7F7F9] border border-[#E3E3E3] rounded-lg px-4 py-3 text-xs">
          <div><span className="text-slate-400">Overall</span> <span className="font-semibold text-slate-700">{agg.overall ?? '—'}</span></div>
          <div><span className="text-slate-400">Pass rate</span> <span className="font-semibold text-slate-700">{agg.pass_rate != null ? `${Math.round(agg.pass_rate * 100)}%` : '—'}</span></div>
          {agg.dimensions && Object.entries(agg.dimensions).map(([d, s]) => (
            <div key={d}><span className="text-slate-400">{DIMENSION_LABELS[d] || d}</span> <span className="font-semibold text-slate-700">{s}</span></div>
          ))}
        </div>
      )}
      {batch.error && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2 mb-4">{batch.error}</div>}

      <table className="w-full text-xs border border-[#E3E3E3] rounded-md overflow-hidden">
        <thead className="bg-[#F7F7F9] text-slate-600">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Persona</th>
            <th className="text-left px-3 py-2 font-semibold">Task</th>
            <th className="text-left px-3 py-2 font-semibold">Status</th>
            <th className="text-left px-3 py-2 font-semibold">Overall</th>
            <th className="text-left px-3 py-2 font-semibold">Dimensions</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.id} className="border-t border-[#EEE] hover:bg-[#F7F7F9] cursor-pointer" onClick={() => setOpenCase(openCase === c.id ? null : c.id)}>
              <td className="px-3 py-2 text-slate-800">{c.persona_key}</td>
              <td className="px-3 py-2 text-slate-600">{c.task_id}</td>
              <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
              <td className="px-3 py-2">{c.overall_score != null ? <Chip tone={scoreTone(c.overall_score)}>{c.overall_score}</Chip> : '—'}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {Object.entries(c.dimension_scores || {}).map(([d, v]) => (
                    <Chip key={d} tone={scoreTone(v.score)}>{DIMENSION_SHORT[d] || d} {v.score}</Chip>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2 text-slate-400">{c.passed ? '✓' : c.status === 'done' ? '✗' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {openCase && <CaseDetail token={token} caseId={openCase} onClose={() => setOpenCase(null)} onViewTimeline={onViewTimeline} />}
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

  useEffect(() => {
    let live = true;
    setA(null); setB(null);
    Promise.all(batchIds.map((id) => getBatch(token, id)))
      .then(([ra, rb]) => { if (live) { setA(ra); setB(rb); } })
      .catch(() => { /* leave loading */ });
    return () => { live = false; };
  }, [token, batchIds]);

  if (!a || !b) return <div className="p-6 text-slate-400 text-sm">Loading comparison…</div>;

  const aggA = a.batch.aggregate_scores || {};
  const aggB = b.batch.aggregate_scores || {};
  const dimsA = aggA.dimensions || {};
  const dimsB = aggB.dimensions || {};
  const dimKeys = Object.keys(DIMENSION_LABELS).filter((d) => dimsA[d] != null || dimsB[d] != null);

  const deltaCell = (va, vb, unit = '') => {
    if (va == null || vb == null) return <td className="px-3 py-2 text-slate-400">—</td>;
    const d = vb - va;
    const tone = d > 0 ? 'text-emerald-600' : d < 0 ? 'text-rose-600' : 'text-slate-400';
    return <td className={`px-3 py-2 font-medium ${tone}`}>{d > 0 ? '+' : ''}{d}{unit}</td>;
  };
  const passPct = (agg) => (agg.pass_rate != null ? Math.round(agg.pass_rate * 100) : null);

  return (
    <div className="p-6">
      <h2 className="text-lg font-bold text-[#1E1E1E] mb-1">Compare · #{a.batch.id} vs #{b.batch.id}</h2>
      <p className="text-xs text-slate-500 mb-4">
        A = #{a.batch.id} {a.batch.suite_key} ({fmtTime(a.batch.started_at)}) · B = #{b.batch.id} {b.batch.suite_key} ({fmtTime(b.batch.started_at)})
      </p>

      <table className="w-full text-xs border border-[#E3E3E3] rounded-md overflow-hidden mb-4">
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
      setSelectedBatch(batchId);
    } catch (e) {
      setError(e.message || 'Failed to start eval');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={`flex flex-col min-h-0 font-proxima ${embedded ? 'h-full' : 'h-screen bg-[#EFEFEF]'}`}>
      {!embedded && (
        <div className="shrink-0 bg-white border-b border-[#E3E3E3] px-8 py-4">
          <h1 className="text-2xl font-bold text-[#1E1E1E]">Coach Evals</h1>
          <p className="text-slate-500 text-sm mt-0.5">Automated quality evaluation of the v2 coach agent</p>
        </div>
      )}

      {/* run bar */}
      <div className="shrink-0 bg-white border-b border-[#E3E3E3] px-8 py-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">
          <div className="mb-1">Suite</div>
          <select value={suiteKey} onChange={(e) => setSuiteKey(e.target.value)} className="text-sm border border-[#E3E3E3] rounded-md px-2 py-1.5 min-w-48">
            {suites.map((s) => <option key={s.key} value={s.key}>{s.key} — {s.description}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          <div className="mb-1">Model under test (optional)</div>
          <input value={modelUnderTest} onChange={(e) => setModelUnderTest(e.target.value)} placeholder="default" className="text-sm border border-[#E3E3E3] rounded-md px-2 py-1.5 w-56" />
        </label>
        <label className="text-xs text-slate-500">
          <div className="mb-1">Judge model (optional)</div>
          <input value={judgeModel} onChange={(e) => setJudgeModel(e.target.value)} placeholder="default" className="text-sm border border-[#E3E3E3] rounded-md px-2 py-1.5 w-56" />
        </label>
        <button
          onClick={handleRun}
          disabled={running || !suiteKey}
          className="text-sm font-medium text-white rounded-md px-4 py-2 disabled:opacity-50"
          style={{ backgroundColor: BRAND }}
        >
          {running ? 'Starting…' : 'Run eval'}
        </button>
        <button
          onClick={() => { setCompareMode((m) => !m); setCompareIds([]); }}
          className={`text-sm font-medium rounded-md px-4 py-2 border ${compareMode ? 'text-white border-transparent' : 'text-slate-700 border-[#E3E3E3] bg-white'}`}
          style={compareMode ? { backgroundColor: BRAND } : undefined}
          title="Pick two batches to compare their scores side by side"
        >
          {compareMode ? 'Exit compare' : 'Compare batches'}
        </button>
        {error && <span className="text-xs text-rose-600">{error}</span>}

        {/* Selected-suite metadata (focus + coverage) so the reviewer knows what
            the run will exercise before starting it. */}
        {selectedSuite && (
          <div className="w-full text-[11px] text-slate-500 pt-1">
            {selectedSuite.personaCount} persona{selectedSuite.personaCount === 1 ? '' : 's'} × {selectedSuite.taskCount} task{selectedSuite.taskCount === 1 ? '' : 's'}
            {selectedSuite.focus && <span className="text-slate-400"> · {selectedSuite.focus}</span>}
          </div>
        )}
        {compareMode && (
          <div className="w-full text-[11px] text-indigo-600 pt-0.5">
            Compare mode — select two batches from the list ({compareIds.length}/2 selected).
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* batch list — scrolls independently */}
        <aside className="w-80 shrink-0 border-r border-[#E3E3E3] bg-white overflow-y-auto min-h-0">
          {batches.length === 0 && <div className="p-4 text-slate-400 text-sm">No eval batches yet.</div>}
          {batches.map((b) => {
            const active = compareMode ? compareIds.includes(b.id) : selectedBatch === b.id;
            const agg = b.aggregate_scores || {};
            return (
              <button key={b.id} onClick={() => (compareMode ? toggleCompare(b.id) : setSelectedBatch(b.id))} className={`w-full text-left px-4 py-3 border-b border-[#F0F0F0] hover:bg-[#F7F7F9] ${active ? 'bg-[#F0F0FF]' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {compareMode && <span className="mr-1">{compareIds.includes(b.id) ? '☑' : '☐'}</span>}
                    #{b.id} {b.suite_key}
                  </span>
                  <StatusBadge status={b.status} />
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                  {agg.overall != null && <Chip tone={scoreTone(agg.overall)}>{agg.overall}</Chip>}
                  <span>{b.completed_cases}/{b.total_cases}</span>
                  <span className="ml-auto">{fmtTime(b.started_at)}</span>
                </div>
              </button>
            );
          })}
        </aside>

        <main className="flex-1 min-h-0 overflow-y-auto bg-[#EFEFEF]">
          {compareMode ? (
            compareIds.length === 2 ? (
              <BatchCompare token={token} batchIds={compareIds} />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">Select two batches to compare.</div>
            )
          ) : selectedBatch ? (
            <BatchDetail token={token} batchId={selectedBatch} onViewTimeline={onViewTimeline} />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">Run a suite or select a batch.</div>
          )}
        </main>
      </div>
    </div>
  );
};

export default CoachEvals;
