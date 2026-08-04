import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import useAuthStore from '../../../stores/authStore';
import { usePermissions } from '../../../hooks/usePermissions';
import { listCohortsWithRuns, getCohortInsights } from '../../../services/coachRunsApi';

const BRAND = '#4242EA';
const GREW = '#0f7a48';
const DECLINED = '#c62a3e';
const SLATE = '#94a3b8';

// Descriptive scatter zones — a visual guide over the real axes (avg level ×
// skills improved), NOT a ranking or an L2 verdict. Thresholds are transparent
// and intentionally simple; the decision stays with staff reading the table.
const GROUP = {
  good: { label: 'Engine teaching well', color: GREW },
  adv:  { label: 'Entered strong, held high', color: BRAND },
  hard: { label: 'Hard to teach', color: DECLINED },
  typ:  { label: 'Typical of cohort', color: SLATE },
};
const classifyBuilder = (b) => {
  const lvl = b.avg_level;
  if (lvl != null && lvl >= 2.8) return 'adv';
  if (lvl != null && lvl < 1.0) return 'hard';
  if ((b.declined || 0) > (b.improved || 0)) return 'hard';
  if ((b.improved || 0) >= 6) return 'good';
  return 'typ';
};

const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
// A MEAN across a builder's skills, so it stays numeric — an average of 3.2 is
// not a Dreyfus stage and can't be named. The `L` prefix was dropped with the
// rest of the Coach surfaces (2026-08-03).
const fmtLevel = (l) => (l == null ? '—' : Number(l).toFixed(2));

const DEFAULT_COHORT_NAME = 'L1 - July 2026';

// ---------------------------------------------------------------------------

const KpiCard = ({ value, label, sub, accent = BRAND }) => (
  <div className="bg-white border border-[#E3E3E3] rounded-xl p-4 relative overflow-hidden">
    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: accent }} />
    <div className="text-[26px] font-bold text-[#1E1E1E] leading-none tabular-nums">{value}</div>
    <div className="text-[13px] text-slate-600 mt-2 font-medium">{label}</div>
    {sub && <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">{sub}</div>}
  </div>
);

// Per-task content-effectiveness rows: pass-rate bar + a cap-hit marker, both
// on a shared 0–100% scale.
const TaskEffectiveness = ({ tasks, maxLearnTurns }) => {
  if (!tasks.length) return <p className="text-sm text-slate-400">No task data for this cohort.</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {tasks.map((t) => {
        const pass = t.pass_rate;
        const cap = t.pct_hit_cap;
        return (
          <div key={t.task_id} className="grid grid-cols-[minmax(150px,240px)_1fr_44px] items-center gap-3" title={`${t.sessions} sessions · avg ${t.avg_turns ?? '—'} turns`}>
            <div className="text-[13px] text-slate-700 truncate" title={t.task_title}>
              {t.task_title.replace(/^Learn:\s*/, '')}
            </div>
            <div className="relative h-[22px] bg-slate-100 rounded-md overflow-visible">
              <div
                className="h-full rounded-md transition-all"
                style={{ width: `${pass ?? 0}%`, backgroundColor: GREW }}
              />
              {/* cap-hit marker (ring) on the same 0–100 scale */}
              {cap != null && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[13px] h-[13px] rounded-full bg-white"
                  style={{ left: `${cap}%`, border: `2.5px solid ${BRAND}` }}
                  title={`Hit the ${maxLearnTurns}-turn cap in ${cap}% of sessions`}
                />
              )}
            </div>
            <div className="text-[12px] font-semibold text-slate-700 text-right tabular-nums">
              {pass == null ? '—' : `${pass}%`}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const ScatterTip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const b = payload[0].payload;
  return (
    <div className="bg-[#1E1E1E] text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-[240px]">
      <div className="font-bold mb-1">{b.name}</div>
      <div className="flex justify-between gap-4"><span className="text-slate-300">Avg level</span><span className="tabular-nums">{fmtLevel(b.avg_level)}</span></div>
      <div className="flex justify-between gap-4"><span className="text-slate-300">Skills improved</span><span className="tabular-nums">{b.improved}</span></div>
      <div className="flex justify-between gap-4"><span className="text-slate-300">Sessions</span><span className="tabular-nums">{b.sessions}</span></div>
      {b.pass_pct != null && <div className="flex justify-between gap-4"><span className="text-slate-300">Pass rate</span><span className="tabular-nums">{b.pass_pct}%</span></div>}
      <div className="mt-1" style={{ color: GROUP[b._group].color }}>{GROUP[b._group].label}</div>
    </div>
  );
};

const SortHeader = ({ label, col, sort, setSort, align = 'right' }) => {
  const active = sort.col === col;
  return (
    <th
      onClick={() => setSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }))}
      className={`px-3 py-2 font-semibold text-slate-600 cursor-pointer select-none hover:text-slate-900 ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {label}{active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  );
};

// ---------------------------------------------------------------------------

const CohortInsights = ({ embedded = false, onViewSnapshot = null }) => {
  const token = useAuthStore((s) => s.token);
  const { canAccessPage } = usePermissions();

  const [cohorts, setCohorts] = useState([]);
  const [cohortId, setCohortId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ col: 'improved', dir: 'desc' });

  // Load cohort list once, default to L1 - July 2026 (else most runs).
  useEffect(() => {
    if (!token) return;
    listCohortsWithRuns(token)
      .then((res) => {
        const list = res.cohorts || [];
        setCohorts(list);
        const def = list.find((c) => c.name === DEFAULT_COHORT_NAME) || list[0];
        if (def) setCohortId(def.cohort_id);
      })
      .catch((e) => setError(e.message || 'Failed to load cohorts'));
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !cohortId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getCohortInsights(token, cohortId);
      setData(res);
    } catch (e) {
      setError(e.message || 'Failed to load cohort insights');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, cohortId]);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary;
  const tasks = data?.tasks || [];
  const builders = data?.builders || [];

  // Builders positioned on the scatter (need a graded avg level); the rest are
  // surfaced in the table with a note so they're never silently dropped.
  const scatterAll = useMemo(
    () => builders.filter((b) => b.avg_level != null).map((b) => ({ ...b, name: `${b.first_name} ${b.last_name}`.trim(), _group: classifyBuilder(b) })),
    [builders],
  );
  const scatterByGroup = useMemo(() => {
    const g = { good: [], adv: [], hard: [], typ: [] };
    scatterAll.forEach((b) => g[b._group].push(b));
    return g;
  }, [scatterAll]);
  const notShown = builders.length - scatterAll.length;

  const sortedBuilders = useMemo(() => {
    const rows = [...builders];
    const { col, dir } = sort;
    rows.sort((a, a2) => {
      const av = a[col], bv = a2[col];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;            // nulls last
      if (bv == null) return -1;
      if (typeof av === 'string') return dir === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      return dir === 'desc' ? bv - av : av - bv;
    });
    return rows;
  }, [builders, sort]);

  const openSnapshot = (userId) => {
    if (onViewSnapshot) onViewSnapshot(userId);
    else window.open(`/admin/coach?tab=snapshot&userId=${userId}`, '_blank');
  };

  if (!canAccessPage('coach')) {
    return (
      <div className="p-8 text-center text-rose-600">You do not have permission to view this page.</div>
    );
  }

  const yMax = Math.max(6, ...scatterAll.map((b) => b.improved || 0));

  return (
    <div className={`font-proxima ${embedded ? 'h-full overflow-y-auto' : 'min-h-screen bg-[#EFEFEF]'} `}>
      <div className="p-6 max-w-[1180px] mx-auto">
        {/* header + cohort picker */}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
          <div>
            <h2 className="text-xl font-bold text-[#1E1E1E]">Cohort Insights</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              What the coach engine did across a cohort — content effectiveness, builder growth, and the L1→L2 signal.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Cohort</label>
            <select
              value={cohortId}
              onChange={(e) => setCohortId(e.target.value)}
              className="text-sm border border-[#E3E3E3] rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-1"
              style={{ '--tw-ring-color': BRAND }}
            >
              {cohorts.map((c) => (
                <option key={c.cohort_id} value={c.cohort_id}>
                  {c.name}{c.level ? ` (${c.level})` : ''} · {c.run_count} runs
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <div className="py-16 text-center text-slate-400 text-sm">Loading cohort insights…</div>}
        {error && <div className="py-6 text-center text-rose-600 text-sm">{error}</div>}

        {!loading && !error && summary && (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 mb-6">
              <KpiCard value={`${pct(summary.active_builders, summary.enrolled)}%`} label="Builder adoption" sub={`${summary.active_builders} of ${summary.enrolled} enrolled`} />
              <KpiCard value={summary.sessions.toLocaleString()} label="Coaching sessions" sub={`${builders.length} active builders`} />
              <KpiCard value={`${pct(summary.completed_sessions, summary.sessions)}%`} label="Ran the full loop" sub={`${summary.completed_sessions} completed`} />
              <KpiCard value={`${pct(summary.improved + summary.held, summary.assessments_with_prior)}%`} label="Held or improved" sub={`${summary.improved} improved a level`} accent={GREW} />
              <KpiCard value={summary.grade_errors} label="Grading errors" sub={`of ${summary.graded} graded`} accent={summary.grade_errors ? DECLINED : GREW} />
              <KpiCard value={`${pct(summary.passed, summary.graded)}%`} label="Sessions passed" sub={`${summary.passed} of ${summary.graded}`} accent={GREW} />
            </div>

            {/* Section 1 — content effectiveness */}
            <div className="bg-white border border-[#E3E3E3] rounded-xl p-5 mb-4">
              <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
                <h3 className="text-[15px] font-bold text-[#1E1E1E]">Which content works</h3>
                <div className="flex items-center gap-4 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: GREW }} /> Pass rate</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-[11px] h-[11px] rounded-full bg-white" style={{ border: `2px solid ${BRAND}` }} /> Hit the {data.maxLearnTurns}-turn cap</span>
                </div>
              </div>
              <p className="text-[12px] text-slate-400 mb-4">Hardest to pass at top. The ring shows how often the teaching conversation ran out of turns before the builder was ready.</p>
              <TaskEffectiveness tasks={tasks} maxLearnTurns={data.maxLearnTurns} />
            </div>

            {/* Section 2 — proficiency vs growth scatter */}
            <div className="bg-white border border-[#E3E3E3] rounded-xl p-5 mb-4">
              <h3 className="text-[15px] font-bold text-[#1E1E1E] mb-1">Every builder: proficiency vs. growth</h3>
              <p className="text-[12px] text-slate-400 mb-3">
                Horizontal = current average skill level (Dreyfus 0–5); vertical = skills the engine measured improving a level. Top-right = strong and still climbing; far left = at the floor and hard to move.
                {notShown > 0 && <span className="text-slate-500"> {notShown} builder{notShown === 1 ? '' : 's'} not shown (no graded work yet — see table).</span>}
              </p>
              <div style={{ width: '100%', height: 380 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid stroke="#EEE" />
                    <XAxis
                      type="number" dataKey="avg_level" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      label={{ value: 'Average skill level (Dreyfus 0–5)', position: 'bottom', offset: 12, fontSize: 12, fill: '#64748b' }}
                    />
                    <YAxis
                      type="number" dataKey="improved" domain={[0, yMax]} allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      label={{ value: 'Skills improved', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#64748b' }}
                    />
                    <ZAxis type="number" dataKey="sessions" range={[40, 220]} />
                    <RTooltip content={<ScatterTip />} cursor={{ strokeDasharray: '3 3' }} />
                    <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    {['good', 'adv', 'hard', 'typ'].map((g) => (
                      <Scatter key={g} name={GROUP[g].label} data={scatterByGroup[g]} fill={GROUP[g].color} fillOpacity={g === 'typ' ? 0.5 : 0.9} />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Section 3 — per-builder decision aid */}
            <div className="bg-white border border-[#E3E3E3] rounded-xl p-5">
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <h3 className="text-[15px] font-bold text-[#1E1E1E]">Builder engine signals</h3>
                <span className="text-[11px] text-slate-400">Click a name to open their Builder Snapshot</span>
              </div>
              <p className="text-[12px] text-slate-400 mb-3">
                The engine measures the one thing the L2 offer decision otherwise can't see — whether a builder actually learned. Sort by any column; these are inputs for the human call, not a score. Record the formal offer (strong/maybe/drop) in <span className="font-medium text-slate-500">L2 Selections</span> on the Admin Dashboard.
              </p>
              <div className="overflow-x-auto border border-[#EEE] rounded-lg">
                <table className="w-full text-[13px]">
                  <thead className="bg-[#F7F7F9]">
                    <tr>
                      <SortHeader label="Builder" col="last_name" sort={sort} setSort={setSort} align="left" />
                      <SortHeader label="Sessions" col="sessions" sort={sort} setSort={setSort} />
                      <SortHeader label="Done" col="completed" sort={sort} setSort={setSort} />
                      <SortHeader label="Pass %" col="pass_pct" sort={sort} setSort={setSort} />
                      <SortHeader label="Improved" col="improved" sort={sort} setSort={setSort} />
                      <SortHeader label="Held" col="held" sort={sort} setSort={setSort} />
                      <SortHeader label="Declined" col="declined" sort={sort} setSort={setSort} />
                      <SortHeader label="Avg level" col="avg_level" sort={sort} setSort={setSort} />
                      <SortHeader label="Cap %" col="pct_cap" sort={sort} setSort={setSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBuilders.map((b) => (
                      <tr key={b.user_id} className="border-t border-[#F0F0F0] hover:bg-[#FAFAFC]">
                        <td className="px-3 py-2 text-left">
                          <button onClick={() => openSnapshot(b.user_id)} className="text-[#4242EA] hover:underline font-medium">
                            {b.first_name} {b.last_name}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{b.sessions}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{b.completed}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{b.pass_pct == null ? '—' : `${b.pass_pct}%`}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: b.improved ? GREW : '#94a3b8' }}>{b.improved || 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{b.held || 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: b.declined ? DECLINED : '#94a3b8' }}>{b.declined || 0}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtLevel(b.avg_level)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{b.pct_cap == null ? '—' : `${b.pct_cap}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mt-4">
              Personalized-task runs only (the v2 engine); basic/conversation tasks are excluded. Scoped to everyone ever enrolled in this cohort; dummy accounts excluded. Outcomes are the latest grade per session (Dreyfus level vs the builder's own prior) — there is no 0–100 pass bar. Reflects what the coach did, not separately-measured job outcomes.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default CohortInsights;
