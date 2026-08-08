import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { getAlignment } from '../../../services/coachEvalsApi';

const BRAND = '#4242EA';
const CARD = 'bg-white rounded-[18px] border border-[#E3E3E3] shadow-[0_2px_4px_rgba(0,0,0,0.05)]';

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

const Caps = ({ children, className = '' }) => (
  <div className={`text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400 ${className}`}>{children}</div>
);

// Agreement-strength signal palette — SEPARATE from the purple brand accent so a
// weak judge reads at a glance. κ ≥ 0.61 substantial+, 0.40–0.60 moderate, <0.40 below bar.
const strengthTone = (k) => (k == null ? 'slate' : k >= 0.61 ? 'good' : k >= 0.4 ? 'warn' : 'bad');
const STRENGTH = {
  good: { bar: '#1F9D6B', text: 'text-emerald-700', label: 'Substantial+' },
  warn: { bar: '#C07C10', text: 'text-amber-700', label: 'Moderate' },
  bad: { bar: '#C7443E', text: 'text-rose-700', label: 'Below bar' },
  slate: { bar: '#CBD5E1', text: 'text-slate-400', label: '—' },
};
const BIAS = {
  calibrated: 'bg-emerald-100 text-emerald-700',
  lenient: 'bg-amber-100 text-amber-700',
  harsh: 'bg-[#4242EA]/10 text-[#4242EA]',
  mixed: 'bg-slate-100 text-slate-600',
};
const BIAS_LABEL = { calibrated: 'Calibrated', lenient: 'Runs lenient', harsh: 'Runs harsh', mixed: 'Mixed' };
const kappaLabel = (k) => {
  if (k == null) return 'n/a';
  if (k >= 0.81) return 'Almost perfect';
  if (k >= 0.61) return 'Substantial';
  if (k >= 0.41) return 'Moderate';
  if (k >= 0.21) return 'Fair';
  return 'Slight';
};

const StatCard = ({ label, value, sub, accent, warn }) => (
  <div className="flex-1 min-w-0 overflow-hidden bg-white rounded-[14px] border border-[#E3E3E3] shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
    <div className="h-1.5" style={{ backgroundColor: warn ? '#C7443E' : BRAND }} />
    <div className="p-4">
      <Caps>{label}</Caps>
      <div className="mt-1 text-[28px] font-bold leading-none tabular-nums" style={{ color: accent ? BRAND : warn ? '#C73A3A' : '#1E1E1E' }}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  </div>
);

const JudgeAlignment = () => {
  const token = useAuthStore((s) => s.token);
  const { canAccessPage } = usePermissions();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setReport(await getAlignment(token)); }
    catch (e) { setError(e.message || 'Failed to load alignment report'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (!canAccessPage('coach')) {
    return <div className="p-8 text-slate-500">You do not have permission to view this page.</div>;
  }

  const belowBar = (report?.dimensions || []).filter((d) => d.kappa != null && d.kappa < 0.4).length;
  const overallK = report?.overall?.kappa;

  return (
    <div className="font-proxima bg-[#EFEFEF] h-full overflow-y-auto">
      <div className="px-8 py-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-[#1E1E1E]">Judge Alignment</h2>
          <p className="text-sm text-slate-500 mt-0.5">How closely each LLM judge agrees with human reviewers — the check on our evaluators. Cohen&apos;s κ over human-labeled eval cases.</p>
        </div>

        {loading && <div className={`${CARD} p-10 text-center text-slate-400 text-sm`}>Loading…</div>}
        {error && <div className={`${CARD} p-4 text-sm text-rose-600`}>{error}</div>}

        {!loading && !error && report && report.labeledPairs === 0 && (
          <div className={`${CARD} p-10 text-center`}>
            <div className="text-slate-600 font-semibold mb-1">No human reviews yet</div>
            <p className="text-sm text-slate-400">Open a case in <span className="font-medium">Coach Evals</span> and fill in <span className="font-medium">Your review</span>. Once a few cases are labeled, this report shows how far each judge drifts from the human call.</p>
          </div>
        )}

        {!loading && !error && report && report.labeledPairs > 0 && (
          <>
            <div className="flex gap-4">
              <StatCard label="Overall agreement" value={overallK == null ? '—' : `κ ${overallK.toFixed(2)}`} sub={`${kappaLabel(overallK)} · ${report.dimensions.length} judges`} accent />
              <StatCard label="Runs annotated" value={report.runsAnnotated} sub="human-labeled eval cases" />
              <StatCard label="Reviewers" value={report.reviewers} sub="staff annotators" />
              <StatCard label="Judges below bar" value={belowBar} sub="κ < 0.40 — need a look" warn={belowBar > 0} />
            </div>

            <div className={`${CARD} p-5`}>
              <Caps>Per-dimension alignment</Caps>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">How each judge tracks human reviewers — weakest at the bottom is where to spend prompt work.</p>
              <div className="flex items-center gap-3 px-1 pb-2 border-b border-[#E3E3E3]">
                <div className="w-[190px] shrink-0"><Caps>Dimension</Caps></div>
                <div className="flex-1"><Caps>Agreement (κ)</Caps></div>
                <div className="w-14 text-right"><Caps>Agree</Caps></div>
                <div className="w-10 text-right"><Caps>n</Caps></div>
                <div className="w-28 text-right"><Caps>Judge bias</Caps></div>
              </div>
              {report.dimensions.map((d) => {
                const tone = STRENGTH[strengthTone(d.kappa)];
                return (
                  <div key={d.dimension} className="flex items-center gap-3 px-1 py-3 border-b border-[#EEE] last:border-0">
                    <div className="w-[190px] shrink-0 text-[13px] font-medium text-slate-700">{DIMENSION_LABELS[d.dimension] || d.dimension}</div>
                    <div className="flex-1 flex items-center gap-3">
                      <div className="flex-1 h-2.5 rounded-full bg-[#E3E3E3]/70 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (d.kappa ?? 0) * 100))}%`, backgroundColor: tone.bar }} />
                      </div>
                      <span className={`w-9 shrink-0 text-right text-[13px] font-mono font-semibold ${tone.text}`}>{d.kappa == null ? '—' : d.kappa.toFixed(2)}</span>
                      <span className="w-24 shrink-0 text-[10.5px] text-slate-400">{kappaLabel(d.kappa)}</span>
                    </div>
                    <div className="w-14 text-right text-xs font-mono text-slate-600">{d.agreement == null ? '—' : `${Math.round(d.agreement * 100)}%`}</div>
                    <div className="w-10 text-right text-xs font-mono text-slate-500">{d.n}</div>
                    <div className="w-28 text-right"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${BIAS[d.bias] || BIAS.mixed}`}>{BIAS_LABEL[d.bias] || d.bias}</span></div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: STRENGTH.good.bar }} /> κ ≥ 0.61</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: STRENGTH.warn.bar }} /> 0.40–0.60</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: STRENGTH.bad.bar }} /> &lt; 0.40 below bar</span>
                <span>n = labeled cases · agree = raw pass/fail match</span>
              </div>
            </div>

            <div className={`${CARD} p-5`}>
              <Caps>Biggest disagreements</Caps>
              <p className="text-xs text-slate-400 mt-0.5 mb-3">Where judge and human diverged — start here to fix a judge prompt.</p>
              {report.disagreements.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No disagreements in the labeled set.</p>
              ) : (
                <div>
                  {report.disagreements.map((x, i) => (
                    <div key={i} className="flex items-center gap-3 py-2.5 border-t border-[#EEE] first:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-slate-800 truncate">{x.persona_key} · {DIMENSION_LABELS[x.dimension] || x.dimension}</div>
                        <div className="text-[11px] text-slate-400">{x.reviewer ? `reviewed by ${x.reviewer}` : 'reviewed'}{x.judge_score != null ? ` · judge scored ${x.judge_score}` : ''}</div>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${x.judge_pass && !x.human_pass ? 'bg-amber-100 text-amber-700' : 'bg-[#4242EA]/10 text-[#4242EA]'}`}>
                        {x.judge_pass ? 'judge: pass' : 'judge: fail'} · {x.human_pass ? 'you: pass' : 'you: fail'}
                      </span>
                      {x.thread_id != null && (
                        <Link to={`/admin/coach?tab=runs&thread=${x.thread_id}`} className="text-xs font-semibold whitespace-nowrap" style={{ color: BRAND }}>View run →</Link>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default JudgeAlignment;
