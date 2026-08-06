import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ReferenceLine, LabelList, Sankey, Layer,
} from 'recharts';
import useAuthStore from '../../stores/authStore';

// ─────────────────────────────────────────────────────────────────────────────
// TEMP PAGE — attendance dashboard revamp mockups, driven by REAL cohort data
// via GET /api/admin/dashboard/attendance-viz (see test-pilot-server).
// Definitions from the 2026-07-17 data-definitions meeting; the denominator
// switcher compares the three candidate attendance denominators:
//   ever enrolled · active enrollment (per-day) · initial enrollment
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7001';
const DEFAULT_COHORT_NAME = 'L1 - July 2026';
const DATA_DICTIONARY_URL = 'https://data-dictionary-866060457933.us-central1.run.app/';
// Dictionary metrics (bedrock.dd_metrics) that back this page — definitions are
// pulled live so they're never hardcoded. In requested display order.
const DICTIONARY_METRIC_IDS = [165, 155, 154, 105]; // funnel, enrollment, active/withdrawn, attendance

const INK = '#1E1E1E';
const INK_MUTED = '#898781';
const GRID = '#E3E3E3';
const ACCENT = '#4242EA'; // Pursuit Purple — main series
const CONTEXT_GRAY = '#898781'; // de-emphasis series (initial enrollment reference)

// Ordinal blue ramp (validated) — Sankey funnel stages, light→dark = deeper in funnel
const STAGE_RAMP = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab'];
const EXIT_GRAY = '#c3c2b7';

// Status colors (reserved; always paired with a label)
const STATUS = {
  present: '#0ca30c',
  late: '#fab219',
  excused: '#ec835a',
  absent: '#d03b3b',
};

// Sequential blue ramp for the heatmap (steps light→dark)
const HEAT_RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];

const WEEK_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayOf = (dateStr) => new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });

const DENOM_OPTIONS = [
  { key: 'active', label: 'Active enrollment (per-day)', short: 'active enrollment' },
  { key: 'initial', label: 'Initial enrollment', short: 'initial enrollment' },
  { key: 'ever', label: 'Ever enrolled', short: 'ever enrolled' },
];

const SANKEY_NODE_COLORS = {
  'Offer extended': STAGE_RAMP[0],
  'Offer accepted': STAGE_RAMP[1],
  'Initial enrollment': STAGE_RAMP[2],
  'Active enrollment': STAGE_RAMP[3],
  // Attendance-consistency tiers — one hue, more-is-darker
  'Attends 90%+': '#0d366b',
  'Attends 75–90%': '#3987e5',
  'Attends under 75%': '#86b6ef',
  // Signed-and-accepted side inflow — legitimate (blue), not a gray problem
  'Accepted — other cohort': STAGE_RAMP[1],
  // Daily attendance Sankey (per-day modal) — status palette + counted rollup
  'On the roster': STAGE_RAMP[3],
  'Present': STATUS.present,
  'Late': STATUS.late,
  'Excused': STATUS.excused,
  'Absent (no check-in)': STATUS.absent,
  'Counted present': '#006300',
  'Counted absent': '#a51f1f',
};

const SankeyNode = ({ x, y, width, height, payload, containerWidth }) => {
  const isRightHalf = x > containerWidth / 2;
  const labelX = isRightHalf ? x - 8 : x + width + 8;
  return (
    <Layer>
      <rect x={x} y={y} width={width} height={height} rx={2}
        fill={SANKEY_NODE_COLORS[payload.name] || EXIT_GRAY} />
      <text x={labelX} y={y + height / 2 - 4} textAnchor={isRightHalf ? 'end' : 'start'}
        fontSize={13} fontWeight={600} fill={INK}>
        {payload.name}
      </text>
      <text x={labelX} y={y + height / 2 + 12} textAnchor={isRightHalf ? 'end' : 'start'}
        fontSize={12} fill={INK_MUTED}>
        {payload.value} builders
      </text>
    </Layer>
  );
};

// ── Shared chrome ────────────────────────────────────────────────────────────
const Card = ({ id, option, title, answers, footnote, children }) => (
  <section id={id} className="bg-white rounded-lg border border-[#E3E3E3] p-6 scroll-mt-24">
    <div className="flex items-baseline gap-3 mb-1">
      <span className="text-xs font-bold uppercase tracking-wide text-[#4242EA]">{option}</span>
      <h2 className="text-lg font-bold text-[#1E1E1E]" style={{ fontFamily: 'var(--font-family)' }}>
        {title}
      </h2>
    </div>
    <p className="text-sm text-slate-500 mb-4">{answers}</p>
    {children}
    {footnote && <p className="text-xs text-slate-400 mt-3">{footnote}</p>}
  </section>
);

const tooltipStyle = {
  backgroundColor: '#fff', border: `1px solid ${GRID}`, borderRadius: 8,
  fontSize: 13, padding: '10px 12px', maxWidth: 320,
};

const NamesList = ({ names, max = 10 }) => {
  if (!names?.length) return null;
  const shown = names.slice(0, max);
  return (
    <ul className="mt-1 space-y-0.5">
      {shown.map((n, i) => <li key={i} className="text-xs text-slate-600">· {n}</li>)}
      {names.length > max && <li className="text-xs text-slate-400">…and {names.length - max} more</li>}
    </ul>
  );
};

// Sankey hover: node → definition + who's in the bucket; link → conversion rate
const SankeyTooltip = ({ active, payload, nodeInfo }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload || {};
  const link = p.payload && p.payload.source && p.payload.target ? p.payload : (p.source && p.target ? p : null);
  if (link) {
    const pct = link.source?.value ? Math.round((link.value / link.source.value) * 100) : null;
    return (
      <div style={tooltipStyle}>
        <div className="font-semibold text-[#1E1E1E]">{link.source.name} → {link.target.name}</div>
        <div className="text-[#1E1E1E]">{link.value} builders{pct != null && ` — ${pct}% of ${link.source.name.toLowerCase()}`}</div>
      </div>
    );
  }
  const name = p.name || payload[0]?.name;
  const value = p.value ?? payload[0]?.value;
  const info = nodeInfo[name];
  return (
    <div style={tooltipStyle}>
      <div className="font-semibold text-[#1E1E1E]">{name} — {value} builders</div>
      {info?.def && <div className="text-slate-500 mt-0.5">{info.def}</div>}
      {info?.lines?.map((l, i) => <div key={i} className="text-slate-600 text-xs mt-1">{l}</div>)}
      <NamesList names={info?.names} />
    </div>
  );
};

const AttendanceTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={tooltipStyle}>
      <div className="font-semibold text-[#1E1E1E]">{label} — {d.attended} attended across {d.classDays} class days</div>
      <div className="text-[#1E1E1E] mt-1">vs active enrollment: <strong>{d.rateActive}%</strong></div>
      <div className="text-[#1E1E1E]">vs initial enrollment: <strong>{d.rateInitial}%</strong></div>
      <div className="text-[#1E1E1E]">vs ever enrolled: <strong>{d.rateEver}%</strong></div>
      <div className="text-slate-500 mt-1">{d.excused} excused (counted as absent)</div>
    </div>
  );
};

const DailyTooltip = ({ active, payload, denomShort }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    (() => {
      const extraAbsent = d.basisAbsent - (d.absentNames?.length || 0); // present only on initial/ever bases
      return (
        <div style={tooltipStyle}>
          <div className="font-semibold text-[#1E1E1E]">{d.date} — {d.basisRate}% of {denomShort}</div>
          <div className="text-[#1E1E1E]">Present {d.present} · Late {d.late} · Excused {d.excused} · Absent {d.basisAbsent}</div>
          <div className="text-slate-500 text-xs">sums to {d.basisDenom} {denomShort}</div>
          {d.excused > 0 && (
            <div className="mt-1">
              <div className="text-xs font-semibold text-slate-500">Excused ({d.excused}) — counted absent</div>
              <NamesList names={d.excusedNames} max={8} />
            </div>
          )}
          {d.basisAbsent > 0 && (
            <div className="mt-1">
              <div className="text-xs font-semibold text-slate-500">No check-in ({d.basisAbsent})</div>
              <NamesList names={d.absentNames} max={8} />
              {extraAbsent > 0 && <div className="text-xs text-slate-400">+ {extraAbsent} not on the active roster that day</div>}
            </div>
          )}
        </div>
      );
    })()
  );
};

const WeeklyBarTooltip = ({ active, payload, denomShort }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={tooltipStyle}>
      <div className="font-semibold text-[#1E1E1E]">{d.label} — {d.basisRate}% of {denomShort}</div>
      <div className="text-slate-500 text-xs">Pooled across {d.classDays} class {d.classDays === 1 ? 'day' : 'days'} (builder-days)</div>
      <div className="text-[#1E1E1E] mt-1">Present {d.present} · Late {d.late}</div>
      <div className="text-[#1E1E1E]">Excused {d.excused} (absent) · No check-in {d.basisAbsent}</div>
      <div className="text-slate-500">of {d.basisDenom} builder-days</div>
    </div>
  );
};

// Direct label on the last point of a line only (selective labeling).
// dy separates labels when two series end on the same value.
const endLabel = (lastIndex, format, fill, dy = 4) => ({ x, y, value, index }) => {
  if (index !== lastIndex) return null;
  return (
    <text x={x + 10} y={y + dy} fontSize={12} fontWeight={600} fill={fill}>
      {format(value)}
    </text>
  );
};

const StatTile = ({ label, value, delta, deltaGood, sub }) => (
  <div className="bg-white rounded-lg border border-[#E3E3E3] p-4 flex-1 min-w-[160px]">
    <div className="text-xs text-slate-500 font-medium">{label}</div>
    <div className="text-3xl font-semibold text-[#1E1E1E] mt-1">{value}</div>
    <div className="flex items-baseline gap-2 mt-1">
      {delta && (
        <span className="text-xs font-semibold" style={{ color: deltaGood ? '#006300' : '#d03b3b' }}>
          {delta}
        </span>
      )}
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  </div>
);

// Compact per-section denominator toggle (B, C, D each get their own)
const DenomToggle = ({ basis, setBasis, view }) => (
  <div className="flex items-center gap-2 mb-3 flex-wrap">
    <span className="text-xs text-slate-500 font-medium">Denominator:</span>
    <div className="flex rounded-md border border-[#E3E3E3] overflow-hidden">
      {DENOM_OPTIONS.map(o => {
        const n = o.key === 'active' ? (view.lastWeek?.active ?? '') : o.key === 'initial' ? view.funnel.initialEnrollment : view.funnel.enrollTotal;
        return (
          <button key={o.key} onClick={() => setBasis(o.key)}
            className={`px-3 py-1 text-xs font-medium transition-colors ${basis === o.key
              ? 'bg-[#4242EA] text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            {o.label} <span className={basis === o.key ? 'text-indigo-200' : 'text-slate-400'}>({n})</span>
          </button>
        );
      })}
    </div>
  </div>
);

// Build a one-day attendance Sankey: the day's active roster → present / late /
// excused / absent → counted-present vs counted-absent (reconciles to the rate).
const buildDailySankey = (d) => {
  const NAMES = ['On the roster', 'Present', 'Late', 'Excused', 'Absent (no check-in)', 'Counted present', 'Counted absent'];
  const raw = [
    { source: 0, target: 1, value: d.present },
    { source: 0, target: 2, value: d.late },
    { source: 0, target: 3, value: d.excused },
    { source: 0, target: 4, value: d.absent },
    { source: 1, target: 5, value: d.present },
    { source: 2, target: 5, value: d.late },
    { source: 3, target: 6, value: d.excused },
    { source: 4, target: 6, value: d.absent },
  ].filter(l => l.value > 0);
  const used = [...new Set(raw.flatMap(l => [l.source, l.target]))].sort((a, b) => a - b);
  const idx = new Map(used.map((o, i) => [o, i]));
  const nodes = used.map(i => ({ name: NAMES[i] }));
  const links = raw.map(l => ({ source: idx.get(l.source), target: idx.get(l.target), value: l.value }));
  const nodeInfo = {
    'On the roster': { def: `Active enrollment on ${d.date} — the day's denominator (${d.denom}).` },
    'Present': { def: 'Checked in on time.', names: d.presentNames || [] },
    'Late': { def: 'Checked in late (still counts as attended).', names: d.lateNames || [] },
    'Excused': { def: 'Gave notice — but counts as ABSENT in the rate.', names: d.excusedNames || [] },
    'Absent (no check-in)': { def: 'On the roster, no check-in that day.', names: d.absentNames || [] },
    'Counted present': { def: '(present + late) — the numerator of the day’s attendance rate.' },
    'Counted absent': { def: 'excused + no check-in — everyone not counted present.' },
  };
  return { nodes, links, nodeInfo };
};

const DailyAttendanceModal = ({ day, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!day) return null;
  const { nodes, links, nodeInfo } = buildDailySankey(day);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-lg font-bold text-[#1E1E1E]" style={{ fontFamily: 'var(--font-family)' }}>
              {day.day}, {day.date} — {day.rate}% attendance
            </h3>
            <p className="text-sm text-slate-500">
              {day.present + day.late} of {day.denom} active builders counted present · {day.excused} excused (absent) · {day.absent} no check-in
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-[#1E1E1E] text-2xl leading-none px-2">×</button>
        </div>
        <div style={{ width: '100%', height: 340 }}>
          <ResponsiveContainer>
            <Sankey data={{ nodes, links }} node={<SankeyNode />} nodePadding={28}
              margin={{ top: 12, right: 150, bottom: 12, left: 12 }}
              link={{ stroke: '#cbd5e1', strokeOpacity: 0.45 }}>
              <Tooltip trigger="hover" content={<SankeyTooltip nodeInfo={nodeInfo} />} />
            </Sankey>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-slate-400 mt-2">Hover any node for the builders in it. Excused counts as absent in the rate; the two right-hand nodes are the rate's numerator and its complement.</p>
      </div>
    </div>
  );
};

const heatColor = (rate) => {
  // 75% → lightest step, 100% → darkest
  const t = Math.max(0, Math.min(1, (rate - 75) / 25));
  return HEAT_RAMP[Math.min(HEAT_RAMP.length - 1, Math.floor(t * HEAT_RAMP.length))];
};
const heatInk = (rate) => ((rate - 75) / 25 >= 0.5 ? '#ffffff' : '#0b0b0b');

const OPTIONS_NAV = [
  { id: 'option-a', label: 'A · Funnel (Sankey)' },
  { id: 'option-b', label: 'B · Attendance rate over time' },
  { id: 'option-c', label: 'C · Attendance bars (week / day)' },
  { id: 'option-d', label: 'D · Retro KPIs + heatmap' },
];

// ── Page ─────────────────────────────────────────────────────────────────────
const AttendanceVizLab = () => {
  const token = useAuthStore((s) => s.token);
  const [cohorts, setCohorts] = useState([]);
  const [cohortId, setCohortId] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/admin/dashboard/program-cohorts`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json())
      .then(d => {
        if (!d.success) return;
        setCohorts(d.cohorts);
        const preferred = d.cohorts.find(c => c.name === DEFAULT_COHORT_NAME) || d.cohorts[0];
        if (preferred) setCohortId(preferred.cohort_id);
      })
      .catch(() => setError('Could not load cohorts'));
  }, [token]);

  useEffect(() => {
    if (!token || !cohortId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/admin/dashboard/attendance-viz?cohortId=${cohortId}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json())
      .then(d => {
        if (d.success) setData(d);
        else setError(d.error || 'Failed to load attendance data');
      })
      .catch(() => setError('Failed to load attendance data'))
      .finally(() => setLoading(false));
  }, [token, cohortId]);

  const view = useMemo(() => {
    if (!data) return null;
    const { funnel, daily, weekly, initialFrozen, cohort } = data;
    const people = funnel.people || {};

    const pct = (num, den) => (den ? Math.round((num / den) * 100) : null);

    // Basis-INDEPENDENT base rows; each section applies its own denominator via
    // projectBasis() below, so B/C/D can be switched individually.
    const dailyBase = daily.map(d => ({
      ...d,
      day: weekdayOf(d.date),
      attended: d.present + d.late,
    }));
    // Weekday columns come from the actual class days (curriculum), so a Mon–Thu
    // cohort shows only Mon–Thu — no always-empty Friday column.
    const weekdays = WEEK_ORDER.filter(wd => dailyBase.some(d => d.day === wd));

    const weeklyBase = weekly.map(w => ({
      ...w,
      label: `Wk ${w.week}`,
      initial: funnel.initialEnrollment,
      active: w.activeEnd,
      rateActive: pct(w.attended, w.denomSum),
      rateInitial: pct(w.attended, w.classDays * funnel.initialEnrollment),
      rateEver: pct(w.attended, w.classDays * funnel.enrollTotal),
    }));

    const lastWeek = weeklyBase[weeklyBase.length - 1] || null;
    const prevWeek = weeklyBase[weeklyBase.length - 2] || null;

    // Sankey — one person-resolved flow. Signed applicants are matched to
    // platform accounts by email OR name (server-side), so every flow is a real
    // per-person intersection and the columns stay conservation-correct.
    const didntSign = Math.max(0, funnel.offerExtended - funnel.offerAccepted);
    const NODE_NAMES = [
      'Offer extended',               // 0
      'Offer accepted',               // 1
      'Didn’t sign both docs',        // 2
      'Accepted — other cohort',      // 3 (side inflow — signed both docs, application assigned elsewhere)
      'Missing paperwork',            // 4 (side inflow — no docs, or only one of the two)
      'Initial enrollment',           // 5
      'Never showed',                 // 6
      'Signed — no account found',    // 7
      'Active enrollment',            // 8
      'Withdrawn / deferred',         // 9
      'Attends 90%+',                 // 10
      'Attends 75–90%',               // 11
      'Attends under 75%',            // 12
    ];
    const rawLinks = [
      { source: 0, target: 1, value: funnel.offerAccepted },
      { source: 0, target: 2, value: didntSign },
      { source: 1, target: 5, value: funnel.sankey.signedAttended },
      { source: 1, target: 6, value: funnel.sankey.signedNeverShowed },
      { source: 1, target: 7, value: funnel.sankey.signedNoAccount },
      { source: 3, target: 5, value: funnel.sankey.elsewhereAttended },
      { source: 3, target: 6, value: funnel.sankey.elsewhereNeverShowed },
      { source: 4, target: 5, value: funnel.sankey.paperworkAttended },
      { source: 4, target: 6, value: funnel.sankey.paperworkNeverShowed },
      { source: 5, target: 8, value: funnel.sankey.attendedActive },
      { source: 5, target: 9, value: funnel.sankey.attendedExited },
      { source: 8, target: 10, value: funnel.sankey.tierHigh },
      { source: 8, target: 11, value: funnel.sankey.tierMid },
      { source: 8, target: 12, value: funnel.sankey.tierLow },
    ].filter(l => l.value > 0);
    // Drop nodes with no surviving links (e.g. zero withdrawals) and reindex
    const usedIdx = [...new Set(rawLinks.flatMap(l => [l.source, l.target]))].sort((a, b) => a - b);
    const idxMap = new Map(usedIdx.map((orig, i) => [orig, i]));
    const nodes = usedIdx.map(i => ({ name: NODE_NAMES[i] }));
    const links = rawLinks.map(l => ({ source: idxMap.get(l.source), target: idxMap.get(l.target), value: l.value }));

    const nodeInfo = {
      'Offer extended': {
        def: 'Admission status "accepted" — we offered a seat in this cohort.',
        lines: [`${pct(funnel.offerAccepted, funnel.offerExtended)}% went on to sign both documents.`],
      },
      'Offer accepted': {
        def: 'Signed BOTH the Good Jobs Agreement and the Pledge — the aligned enrollment moment. Matched to platform accounts by email or name.',
      },
      'Didn’t sign both docs': {
        def: 'Offer extended but one or both documents are missing.',
        names: (people.didntSign || []).map(p => `${p.name} — missing ${p.missing}`),
      },
      'Accepted — other cohort': {
        def: 'Accepted the offer — signed BOTH the pledge and the GJA (verifiable via DocuSign on the Applicants page). Their application is just assigned to a different cohort (deferrals, returning builders). A cohort-assignment note, NOT a paperwork gap.',
        names: (people.docsElsewhere || []).map(p =>
          `${p.name} — ${p.cohort}${p.attended ? '' : ' (never attended)'}${p.enrollStatus !== 'in_progress' ? ` [${p.enrollStatus}]` : ''}`),
      },
      'Missing paperwork': {
        def: 'On the roster with no signed docs under ANY cohort (or only one of the two). The real paperwork-chase list.',
        names: (people.missingPaperwork || []).map(p =>
          `${p.name} — missing ${p.missing}${p.attended ? '' : ' (never attended)'}${p.hasApplicant ? '' : ' · no applicant record'}`),
      },
      'Signed — no account found': {
        def: 'Signed both documents but no platform account matched their email or name — they may need accounts created (or a name/email fix).',
        names: people.signedNoAccount || [],
      },
      'Initial enrollment': {
        def: `Attended at least one class in weeks 1–2. ${initialFrozen ? 'Frozen.' : 'Still forming — freezes at the end of week 2.'} The persistence/completion denominator.`,
      },
      'Never showed': {
        def: 'Enrolled on the platform but no present/late check-in in weeks 1–2.',
        names: (people.neverShowed || []).map(p => `${p.name}${p.stillActive ? ' — STILL MARKED ACTIVE' : ''}`),
      },
      'Active enrollment': {
        def: 'Attended at least once and still actively enrolled today — the attendance denominator. Fans out into attendance-consistency tiers on the right.',
        lines: funnel.sankey.neverShowedStillActive
          ? [`Plus ${funnel.sankey.neverShowedStillActive} never-showed builder(s) still marked active — see Never showed.`] : [],
      },
      'Withdrawn / deferred': {
        def: 'Attended at least once, then withdrew or deferred.',
        names: people.exitedAfterAttending || [],
      },
      'Attends 90%+': {
        def: 'Personal attendance ≥90% — attended class days ÷ class days while enrolled (present or late; excused counts absent).',
        names: (people.attendanceTiers?.high || []).map(p => `${p.name} — ${p.rate}%`),
      },
      'Attends 75–90%': {
        def: 'Personal attendance 75–89% of class days while enrolled.',
        names: (people.attendanceTiers?.mid || []).map(p => `${p.name} — ${p.rate}%`),
      },
      'Attends under 75%': {
        def: 'Personal attendance below 75% — the coaching-attention list.',
        names: (people.attendanceTiers?.low || []).map(p => `${p.name} — ${p.rate}%`),
      },
    };

    const activeDelta = lastWeek && prevWeek ? lastWeek.active - prevWeek.active : null;
    const excusedDelta = lastWeek && prevWeek ? lastWeek.excused - prevWeek.excused : null;
    // Retention = still-active among those who actually started (never-showed
    // actives would otherwise push this over 100%)
    const retention = funnel.initialEnrollment ? pct(funnel.sankey.attendedActive, funnel.initialEnrollment) : null;

    const notes = [];
    if (funnel.excludedDummyAccounts > 0) {
      notes.push(`${funnel.excludedDummyAccounts} dummy/test account(s) (carlosgodoy* emails) are excluded from every number on this page.`);
    }
    if (funnel.matchedByNameOnly > 0) {
      notes.push(`Pre-created accounts break email linkage — ${funnel.matchedByNameOnly} of the ${funnel.signedOnPlatform} traceable enrollments were matched to their signed application by name instead of email (backfilling backup_email would make this exact).`);
    }
    if (people.docsElsewhere?.length || people.missingPaperwork?.length || people.signedNoAccount?.length) {
      notes.push(`Roster rows not tied to a signed application for THIS cohort: ${people.docsElsewhere?.length || 0} DID accept the offer — signed both docs (visible via DocuSign on the Applicants page), their application is just assigned to another cohort (deferrals/returners); only ${people.missingPaperwork?.length || 0} are genuinely missing paperwork (hover each funnel node for names), and ${people.signedNoAccount?.length || 0} signers have no platform account at all.`);
    }
    if (!initialFrozen) {
      notes.push(`Initial enrollment (${funnel.initialEnrollment}) is still forming — it freezes at the end of week 2 of ${cohort.name}.`);
    }
    const totalLate = daily.reduce((s, d) => s + d.late, 0);
    if (daily.length && totalLate <= 2) {
      notes.push('The "late" status is essentially unused in this cohort’s check-ins — every on-time and late arrival is recorded as "present."');
    }
    if (funnel.sankey.neverShowedStillActive > 0) {
      const nm = (people.neverShowed || []).filter(p => p.stillActive).map(p => p.name).join(', ');
      notes.push(`${funnel.sankey.neverShowedStillActive} builder(s) never attended a class but are still marked actively enrolled (${nm}). This is why the active denominator (${funnel.enrollActive}) is higher than the funnel's "Active enrollment" node (${funnel.sankey.attendedActive}, attended ≥1) — they count as absent every day.`);
    }

    return {
      weeklyBase, dailyBase, weekdays, lastWeek, prevWeek, nodes, links, nodeInfo,
      activeDelta, excusedDelta, retention, notes, funnel, cohort,
    };
  }, [data]);

  // Per-section denominators (B, C, D switch independently)
  const [basisB, setBasisB] = useState('active');
  const [basisC, setBasisC] = useState('active');
  const [basisD, setBasisD] = useState('active');
  const [cMode, setCMode] = useState('week'); // Option C: 'week' aggregate bars | 'day' daily bars
  const [cWeek, setCWeek] = useState(null); // Option C daily view: selected week (null → latest)
  const [modalDay, setModalDay] = useState(null); // heatmap cell → daily attendance Sankey
  const [definitions, setDefinitions] = useState(null); // live from bedrock.dd_metrics

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/admin/dashboard/dictionary-metrics?ids=${DICTIONARY_METRIC_IDS.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json())
      .then(d => { if (d.success) setDefinitions(d.metrics); })
      .catch(() => {});
  }, [token]);

  // Project the basis-independent base rows onto a chosen denominator.
  const projectBasis = (basis) => {
    if (!view) return null;
    const { funnel, weeklyBase, dailyBase } = view;
    const pct = (num, den) => (den ? Math.round((num / den) * 100) : null);
    const fixedDenom = basis === 'initial' ? funnel.initialEnrollment : funnel.enrollTotal;
    const weeklyRows = weeklyBase.map(w => ({
      ...w,
      basisRate: pct(w.attended, basis === 'active' ? w.denomSum : w.classDays * fixedDenom),
    }));
    const dailyRows = dailyBase.map(d => {
      const bd = basis === 'active' ? d.denom : fixedDenom;
      return { ...d, basisDenom: bd, basisAbsent: Math.max(0, bd - d.present - d.late - d.excused), basisRate: pct(d.present + d.late, bd) };
    });
    const lastWeek = weeklyRows[weeklyRows.length - 1] || null;
    const prevWeek = weeklyRows[weeklyRows.length - 2] || null;
    const currentWeekRows = lastWeek ? dailyRows.filter(d => d.week === lastWeek.week) : [];
    const heatmap = weeklyRows.map(w => ({
      week: w.label,
      cells: view.weekdays.map(day => dailyRows.find(d => d.week === w.week && d.day === day) || null),
    }));
    const denomMax = Math.max(75, Math.ceil(Math.max(0, ...dailyRows.map(d => d.basisDenom)) / 25) * 25);
    // Weekly aggregate bars — pooled builder-days per week (sum across class days)
    const wMap = new Map();
    for (const d of dailyRows) {
      let w = wMap.get(d.week);
      if (!w) { w = { week: d.week, label: `Wk ${d.week}`, present: 0, late: 0, excused: 0, basisAbsent: 0, basisDenom: 0, classDays: 0 }; wMap.set(d.week, w); }
      w.present += d.present; w.late += d.late; w.excused += d.excused;
      w.basisAbsent += d.basisAbsent; w.basisDenom += d.basisDenom; w.classDays += 1;
    }
    const weeklyBars = [...wMap.values()].sort((a, b) => a.week - b.week)
      .map(w => ({ ...w, day: w.label, basisRate: pct(w.present + w.late, w.basisDenom) }));
    const weeklyBarMax = Math.max(100, Math.ceil(Math.max(0, ...weeklyBars.map(w => w.basisDenom)) / 100) * 100);
    return {
      weeklyRows, dailyRows, currentWeekRows, heatmap, lastWeek, denomMax, weeklyBars, weeklyBarMax,
      availableWeeks: weeklyBars.map(w => w.week),
      lastIdx: weeklyRows.length - 1,
      rateDelta: lastWeek && prevWeek ? lastWeek.basisRate - prevWeek.basisRate : null,
      denomShort: DENOM_OPTIONS.find(o => o.key === basis).short,
      denomCount: basis === 'active' ? (lastWeek?.active ?? '—') : basis === 'initial' ? funnel.initialEnrollment : funnel.enrollTotal,
    };
  };
  const projB = projectBasis(basisB);
  const projC = projectBasis(basisC);
  const projD = projectBasis(basisD);
  // Option C daily view: which week (default latest), and that week's day rows
  const cWeekEff = cWeek ?? (projC?.lastWeek?.week ?? null);
  const cDayRows = projC ? projC.dailyRows.filter(d => d.week === cWeekEff) : [];

  return (
    <div className="min-h-screen bg-[#EFEFEF]">
      {/* Header */}
      <div className="bg-white border-b border-[#E3E3E3] px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[#1E1E1E]" style={{ fontFamily: 'var(--font-family)' }}>
                Attendance Viz Lab
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                Temp · live data
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">
              Candidate visualizations for the attendance dashboard revamp — hover any mark for detail.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {cohorts.length > 0 && (
              <select
                value={cohortId || ''}
                onChange={(e) => setCohortId(e.target.value)}
                className="px-3 py-1.5 text-sm border border-[#E3E3E3] rounded-md bg-white text-[#1E1E1E] focus:border-[#4242EA] focus:outline-none"
              >
                {cohorts.map(c => <option key={c.cohort_id} value={c.cohort_id}>{c.name}</option>)}
              </select>
            )}
            <div className="flex gap-2 flex-wrap">
              {OPTIONS_NAV.map(o => (
                <a key={o.id} href={`#${o.id}`}
                  className="text-xs font-medium px-3 py-1.5 rounded-full border border-[#E3E3E3] text-slate-600 hover:border-[#4242EA] hover:text-[#4242EA] transition-colors">
                  {o.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-6 space-y-6">
        {/* Definitions — pulled LIVE from the Data Dictionary (bedrock.dd_metrics),
            the source of truth. Editing a definition there updates this page. */}
        <section className="bg-white rounded-lg border border-[#E3E3E3] p-6">
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#1E1E1E]">
              Definitions <span className="font-medium normal-case text-slate-500">— live from the Data Dictionary</span>
            </h2>
            <a href={DATA_DICTIONARY_URL} target="_blank" rel="noopener noreferrer"
              className="text-xs font-medium text-[#4242EA] hover:underline">Open Data Dictionary ↗</a>
          </div>
          {!definitions ? (
            <p className="text-sm text-slate-400">Loading definitions from the dictionary…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              {definitions.map(m => (
                <div key={m.metric_id}>
                  <div className="font-semibold text-[#1E1E1E] flex items-center gap-1">
                    {m.name}{m.is_north_star && <span title="North-star metric">★</span>}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-0.5">{m.stage} · {m.subdomain}</div>
                  <p className="text-slate-500 mt-1">{m.definition}</p>
                  {(m.numerator || m.denominator) && (
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      {m.numerator && <>num: {m.numerator}<br /></>}
                      {m.denominator && <>den: {m.denominator}</>}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-4 border-t border-[#E3E3E3] pt-3">
            Two working definitions this page uses aren’t yet standalone dictionary metrics (Jul 17 alignment): <strong>Offer accepted</strong> = signed both the GJA and the Pledge; <strong>Initial enrollment</strong> = attended ≥1 in-person class, frozen after week 2. Codify these in the dictionary and they’ll render here too.
          </p>
        </section>

        {!loading && !error && view && view.weeklyBase.length > 0 && (
          <>
            {/* Data-quality callouts — real issues this page surfaced */}
            {view.notes.length > 0 && (
              <section className="bg-amber-50 rounded-lg border border-amber-200 p-5">
                <h2 className="text-sm font-bold uppercase tracking-wide text-amber-900 mb-2">
                  Data notes for {view.cohort.name}
                </h2>
                <ul className="list-disc pl-5 space-y-1 text-sm text-amber-900">
                  {view.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </section>
            )}

            {/* Option A — Sankey */}
            <Card id="option-a" option="Option A" title="Enrollment funnel — Sankey"
              answers="Offer → signed → showed up → still here → how consistently they attend. Every flow is a real per-person count. Hover a stage for its definition and the actual people; hover a flow for its conversion rate."
              footnote="Blue = the continuing cohort (darker = deeper in the funnel / higher attendance); gray = exits and unresolved records. Tier rates are personal: attended class days ÷ class days while enrolled, excused counts absent. Two side inflows explain why the roster can exceed the signed count: 'Accepted — other cohort' (blue) signed both docs (they accepted — a cohort-assignment note, not a gap); only 'Missing paperwork' (gray) needs signatures or removal from the roster.">
              <div style={{ width: '100%', height: 460 }}>
                <ResponsiveContainer>
                  <Sankey
                    data={{ nodes: view.nodes, links: view.links }}
                    node={<SankeyNode />}
                    nodePadding={36}
                    margin={{ top: 16, right: 190, bottom: 16, left: 16 }}
                    link={{ stroke: '#b7d3f6', strokeOpacity: 0.45 }}
                  >
                    {/* trigger must be EXPLICIT: Sankey checks tooltipItem.props.trigger,
                        and React 19's jsx runtime doesn't surface class defaultProps there */}
                    <Tooltip trigger="hover" content={<SankeyTooltip nodeInfo={view.nodeInfo} />} />
                  </Sankey>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Option B — attendance rate over time */}
            <Card id="option-b" option="Option B" title="Attendance rate over time"
              answers="The main retro question: is attendance holding? Weekly (present + late) ÷ the chosen denominator, against the 100% target. Hover the line to compare all three denominators at once."
              footnote={`Weekly rate = total (present + late) ÷ total builder-days across the week's class days, using ${projB.denomShort} (${projB.denomCount}). Excused counts as absent. Only the per-day-active basis lets withdrawals move the line.`}>
              <DenomToggle basis={basisB} setBasis={setBasisB} view={view} />
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={projB.weeklyRows} margin={{ top: 8, right: 120, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: INK_MUTED }} axisLine={{ stroke: GRID }} tickLine={false} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" tick={{ fontSize: 12, fill: INK_MUTED }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={<AttendanceTooltip />} />
                    <ReferenceLine y={100} stroke={INK_MUTED} strokeWidth={1} label={{ value: 'Target 100%', position: 'insideTopRight', fontSize: 11, fill: INK_MUTED }} />
                    <Line name="Attendance rate" dataKey="basisRate" stroke={ACCENT} strokeWidth={2}
                      dot={{ r: 4, fill: ACCENT, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false}>
                      <LabelList content={endLabel(projB.lastIdx, (v) => `${v}%`, INK)} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Option C — attendance bars: weekly roll-up OR a chosen week's days */}
            <Card id="option-c" option="Option C"
              title={cMode === 'week' ? 'Attendance by week' : `Attendance by day — week ${cWeekEff}`}
              answers="Is attendance holding week to week, and who was in the room on a given day? Switch between the weekly roll-up and any single week's days."
              footnote={`Stacked by status; the % on each bar is (present + late) ÷ ${projC.denomShort} (${projC.denomCount}), excused counts as absent. ${cMode === 'week' ? "Weekly bars pool builder-days across the week's class days." : 'Absent = roster with no check-in that day (absences aren\'t recorded as rows).'}`}>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div className="flex rounded-md border border-[#E3E3E3] overflow-hidden">
                  {[['week', 'By week'], ['day', 'By day']].map(([k, lab]) => (
                    <button key={k} onClick={() => setCMode(k)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${cMode === k ? 'bg-[#4242EA] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                      {lab}
                    </button>
                  ))}
                </div>
                {cMode === 'day' && projC.availableWeeks.length > 1 && (
                  <select value={cWeekEff} onChange={e => setCWeek(Number(e.target.value))}
                    className="px-2 py-1 text-xs border border-[#E3E3E3] rounded-md bg-white text-[#1E1E1E] focus:border-[#4242EA] focus:outline-none">
                    {projC.availableWeeks.map(w => <option key={w} value={w}>Week {w}</option>)}
                  </select>
                )}
                <DenomToggle basis={basisC} setBasis={setBasisC} view={view} />
              </div>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={cMode === 'week' ? projC.weeklyBars : cDayRows} margin={{ top: 24, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12, fill: INK_MUTED }} axisLine={{ stroke: GRID }} tickLine={false} />
                    <YAxis domain={[0, cMode === 'week' ? projC.weeklyBarMax : projC.denomMax]}
                      ticks={cMode === 'day' ? [0, 25, 50, 75, 100].filter(t => t <= projC.denomMax) : undefined}
                      tick={{ fontSize: 12, fill: INK_MUTED }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip content={cMode === 'week' ? <WeeklyBarTooltip denomShort={projC.denomShort} /> : <DailyTooltip denomShort={projC.denomShort} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar name="Present" dataKey="present" stackId="d" fill={STATUS.present} barSize={cMode === 'week' ? 44 : 24} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                    <Bar name="Late" dataKey="late" stackId="d" fill={STATUS.late} barSize={cMode === 'week' ? 44 : 24} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                    <Bar name="Excused (counts absent)" dataKey="excused" stackId="d" fill={STATUS.excused} barSize={cMode === 'week' ? 44 : 24} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
                    <Bar name="Absent" dataKey="basisAbsent" stackId="d" fill={STATUS.absent} barSize={cMode === 'week' ? 44 : 24} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      <LabelList dataKey="basisRate" position="top" fontSize={12} fill={INK} formatter={(v) => `${v}%`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {cMode === 'day' && <p className="text-xs text-slate-400 mt-2">Tip: Option D’s heatmap cells open a per-day Sankey with names.</p>}
            </Card>

            {/* Option D — retro KPIs + heatmap */}
            <Card id="option-d" option="Option D" title="Retro strip — KPIs + attendance heatmap"
              answers={`The 60-second weekly retro check: four numbers with week-over-week deltas, then a day × week heatmap to spot patterns at a glance. Rates use ${projD.denomShort}.`}>
              <DenomToggle basis={basisD} setBasis={setBasisD} view={view} />
              <div className="flex gap-4 flex-wrap mb-6">
                <StatTile label="Active enrollment" value={String(view.funnel.enrollActive)}
                  delta={view.activeDelta != null ? `${view.activeDelta >= 0 ? '+' : '−'}${Math.abs(view.activeDelta)} vs last week` : null}
                  deltaGood={view.activeDelta >= 0}
                  sub={view.funnel.sankey.neverShowedStillActive > 0
                    ? `incl. ${view.funnel.sankey.neverShowedStillActive} who never attended`
                    : `of ${view.funnel.initialEnrollment} initial`} />
                <StatTile label="Retention vs initial" value={view.retention != null ? `${view.retention}%` : '—'}
                  sub={`${view.funnel.sankey.attendedActive} / ${view.funnel.initialEnrollment} who started`} />
                <StatTile label="Attendance this week" value={`${projD.lastWeek.basisRate}%`}
                  delta={projD.rateDelta != null ? `${projD.rateDelta >= 0 ? '+' : '−'}${Math.abs(projD.rateDelta)} pts vs last week` : null}
                  deltaGood={projD.rateDelta >= 0} sub={`of ${projD.denomShort}`} />
                <StatTile label="Excused this week" value={String(view.lastWeek.excused)}
                  delta={view.excusedDelta != null ? `${view.excusedDelta >= 0 ? '+' : '−'}${Math.abs(view.excusedDelta)} vs last week` : null}
                  deltaGood={view.excusedDelta <= 0} sub="side count — not in the rate" />
              </div>
              <div className="overflow-x-auto">
                <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `64px repeat(${view.weekdays.length}, 72px)` }}>
                  <div />
                  {view.weekdays.map(d => (
                    <div key={d} className="text-xs text-slate-500 font-medium text-center pb-1">{d}</div>
                  ))}
                  {projD.heatmap.map(row => (
                    <React.Fragment key={row.week}>
                      <div className="text-xs text-slate-500 font-medium flex items-center">{row.week}</div>
                      {row.cells.map((cell, i) => (
                        cell == null ? (
                          <div key={i} className="h-10 rounded flex items-center justify-center text-xs bg-slate-100 text-slate-400">—</div>
                        ) : (
                          <button key={i} onClick={() => setModalDay(cell)}
                            className="h-10 rounded flex items-center justify-center text-xs font-semibold cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-[#4242EA] transition-all"
                            style={{ backgroundColor: heatColor(cell.basisRate), color: heatInk(cell.basisRate) }}
                            title={`${cell.date} — ${cell.basisRate}% (${cell.attended} of ${cell.basisDenom} ${projD.denomShort}; ${cell.excused} excused) · click for the day's breakdown`}>
                            {cell.basisRate}%
                          </button>
                        )
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Darker = higher attendance; “—” = no class that day. One hue, more-is-darker; the value is printed in every cell so color never carries the number alone. <strong>Click any cell</strong> for that day's attendance breakdown.
              </p>
            </Card>
          </>
        )}

        {loading && <div className="text-center text-slate-500 py-16">Loading real cohort data…</div>}
        {error && <div className="text-center text-red-600 py-16">{error}</div>}
        {!loading && !error && view && view.weeklyBase.length === 0 && (
          <div className="text-center text-slate-500 py-16">No class-day attendance recorded for {view.cohort.name} yet.</div>
        )}
      </div>

      <DailyAttendanceModal day={modalDay} onClose={() => setModalDay(null)} />
    </div>
  );
};

export default AttendanceVizLab;
