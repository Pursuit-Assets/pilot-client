import { useState, useEffect, useCallback, useRef } from 'react';
import useAuthStore from '../../../stores/authStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell
} from 'recharts';
import {
  DollarSign, TrendingUp, Clock, CheckCircle, BarChart3,
  ChevronDown, ChevronRight, AlertTriangle, Users
} from 'lucide-react';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt$ = (n) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const fmt$Precise = (n) => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtPct = (n) => n == null ? '—' : `${n}%`;
const toInputDate = (d) => d.toISOString().slice(0, 10);

// ─── Upcoming Bond Complete ───────────────────────────────────────────────────
// Fellows expected to reach Bond Complete within the next 3 months. The list itself
// comes from GET /api/job-outcomes/exec-summary — it names real people and their
// outstanding balances, so it is not carried in the bundle.
//
// Rows arrive snake_case from the API; normalizeCompletion maps them to the camelCase
// shape the projection helpers below already expect.
const normalizeCompletion = (row) => ({
  fellowName: row.fellow_name,
  path: row.completion_path,
  remainingAmount: row.remaining_amount,
  monthlyPayment: row.monthly_payment,
  planEstablished: row.plan_established,
  invoicesSent: row.invoices_sent,
  invoicesToComplete: row.invoices_to_complete,
  invoiceAmount: row.invoice_amount,
  detail: row.detail,
});

function monthsUntilBondComplete(entry, asOf = new Date()) {
  if (entry.path === 'payment_plan') {
    if (!entry.monthlyPayment || entry.monthlyPayment <= 0) return null;
    return Math.ceil(entry.remainingAmount / entry.monthlyPayment);
  }
  if (entry.path === 'invoice_count') {
    return Math.max(0, (entry.invoicesToComplete || 0) - (entry.invoicesSent || 0));
  }
  return null;
}

function remainingAmountForEntry(entry) {
  if (entry.path === 'payment_plan') return entry.remainingAmount;
  if (entry.path === 'invoice_count') {
    const left = Math.max(0, (entry.invoicesToComplete || 0) - (entry.invoicesSent || 0));
    return left * (entry.invoiceAmount || 0);
  }
  return null;
}

function getUpcomingBondComplete(entries = [], asOf = new Date(), withinMonths = 3) {
  return entries
    .map((entry) => {
      const monthsRemaining = monthsUntilBondComplete(entry, asOf);
      return {
        ...entry,
        monthsRemaining,
        remainingAmount: remainingAmountForEntry(entry),
      };
    })
    .filter((e) => e.monthsRemaining != null && e.monthsRemaining > 0 && e.monthsRemaining <= withinMonths)
    .sort((a, b) => a.monthsRemaining - b.monthsRemaining);
}

function formatEtaLabel(monthsRemaining) {
  if (monthsRemaining == null) return '—';
  if (monthsRemaining === 1) return '~1 month';
  return `~${monthsRemaining} months`;
}

// Curated V1: no one is currently on pause — ignore Sheet-driven list.
const CURATED_PAUSE_WATCHLIST = [];

// Explanatory copy for the two repayment methods. This is program narrative, not
// per-person data, so it stays in the component — but the enrolment COUNTS and the
// name lists beside it are read from the API (they were hardcoded, which both leaked
// fellows' repayment details into the bundle and left the counts to go stale: the
// Pursuit-Managed figure said 4 when the queue already held 5).
const PAYMENT_METHOD_COPY = {
  methodsIntro:
    'To improve long-term payment compliance, we recently introduced two new repayment methods that move payments closer to the source of income.',
  methods: [
    {
      title: 'Pursuit-Managed Payments',
      // Matches alumni_invoice_actions.payment_method, which is how the count is joined.
      methodKey: 'Pursuit Managed',
      body: 'For Builders paid through Pursuit PBC, Good Job Agreement payments are withheld during the payment process and routed directly to Pursuit.org.',
    },
    {
      title: 'Direct Deposit',
      methodKey: 'Direct Deposit',
      body: 'For Fellows and Builders not paid through Pursuit PBC, direct deposit is now the preferred repayment method, providing a simpler, Builder-controlled payment experience.',
    },
  ],
};

const monthLabel = (ym) => {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  // Built in UTC: `new Date('2026-08-01')` is midnight UTC and renders as July 31 in any
  // negative-offset timezone, which would put the wrong month in the heading.
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
};

// ─── Preset ranges ────────────────────────────────────────────────────────────
function getPresetRange(preset) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const fmt = (dt) => toInputDate(dt);
  const ymd = (yr, mo, dy) => fmt(new Date(yr, mo, dy));
  switch (preset) {
    case 'today':       return { start: ymd(y, m, d),   end: ymd(y, m, d) };
    case 'yesterday':   return { start: ymd(y, m, d-1), end: ymd(y, m, d-1) };
    case 'thisWeek': {
      const dow = now.getDay(); // 0=Sun
      return { start: ymd(y, m, d - dow), end: ymd(y, m, d) };
    }
    case 'lastWeek': {
      const dow = now.getDay();
      return { start: ymd(y, m, d - dow - 7), end: ymd(y, m, d - dow - 1) };
    }
    case 'last7':       return { start: ymd(y, m, d - 6), end: ymd(y, m, d) };
    case 'mtd':         return { start: ymd(y, m, 1),   end: ymd(y, m, d) };
    case 'lastMonth':   return { start: ymd(y, m-1, 1), end: ymd(y, m, 0) };
    case 'qtd': {
      const qStart = Math.floor(m / 3) * 3;
      return { start: ymd(y, qStart, 1), end: ymd(y, m, d) };
    }
    case 'lastQuarter': {
      const qStart = Math.floor(m / 3) * 3;
      const lqStart = qStart - 3;
      return { start: ymd(y, lqStart, 1), end: ymd(y, qStart, 0) };
    }
    case 'ytd':         return { start: ymd(y, 0, 1),   end: ymd(y, m, d) };
    default: return null;
  }
}

// ─── KPI color logic ──────────────────────────────────────────────────────────
function kpiColor(value, targets) {
  if (value == null || !targets) return 'gray';
  const { green, yellow } = targets;
  if (green != null) {
    if (typeof green === 'function' ? green(value) : value >= green) return 'green';
    if (typeof yellow === 'function' ? yellow(value) : value >= yellow) return 'yellow';
    return 'red';
  }
  // lower-is-better targets use `bad` / `warn`
  const { bad, warn } = targets;
  if (value >= bad) return 'red';
  if (value >= warn) return 'yellow';
  return 'green';
}

const COLOR_CLASSES = {
  green: { bg: 'bg-green-50', border: 'border-green-200', value: 'text-green-700', label: 'text-green-600', icon: 'text-green-600' },
  yellow: { bg: 'bg-amber-50', border: 'border-amber-200', value: 'text-amber-700', label: 'text-amber-600', icon: 'text-amber-600' },
  red:   { bg: 'bg-red-50',   border: 'border-red-200',   value: 'text-red-700',   label: 'text-red-600',   icon: 'text-red-600' },
  gray:  { bg: 'bg-gray-50',  border: 'border-gray-200',  value: 'text-gray-700',  label: 'text-gray-500',  icon: 'text-gray-400' },
};

// ─── Delta badge ──────────────────────────────────────────────────────────────
function DeltaBadge({ current, prior }) {
  if (prior == null || prior === 0) return null;
  const delta = current - prior;
  const pct = Math.round(Math.abs(delta) / prior * 100);
  const up = delta >= 0;
  return (
    <span className={`text-sm font-medium ml-2 ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {fmt$(Math.abs(delta))} ({pct}%)
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color, na }) {
  const cls = COLOR_CLASSES[na ? 'gray' : color] || COLOR_CLASSES.gray;
  return (
    <div className={`rounded-xl border p-4 ${cls.bg} ${cls.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${cls.icon}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${cls.label}`}>{label}</span>
      </div>
      <p className={`text-2xl font-bold ${na ? 'text-gray-300' : cls.value}`}>
        {na ? 'Coming soon' : value}
      </p>
      {sub && !na && <p className={`text-xs mt-1 ${cls.label}`}>{sub}</p>}
    </div>
  );
}

// ─── AR Aging bar ─────────────────────────────────────────────────────────────
function AgingBar({ current, late1to90, late90plus }) {
  const total = (current || 0) + (late1to90 || 0) + (late90plus || 0);
  if (!total) return null;
  const pctC = Math.round(current / total * 100);
  const pct1 = Math.round(late1to90 / total * 100);
  const pct9 = 100 - pctC - pct1;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-[#4242EA]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">AR Aging Distribution</span>
        <span className="ml-auto text-lg font-bold text-gray-900">{fmt$(total)}</span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex gap-0.5 mb-3">
        {pctC > 0 && <div className="bg-green-400 rounded-l-full" style={{ width: `${pctC}%` }} />}
        {pct1 > 0 && <div className="bg-amber-400" style={{ width: `${pct1}%` }} />}
        {pct9 > 0 && <div className="bg-red-400 rounded-r-full" style={{ width: `${pct9}%` }} />}
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        {[['bg-green-400', 'Current', current], ['bg-amber-400', '1–90 days late', late1to90], ['bg-red-400', '90+ days late', late90plus]].map(([c, l, v]) => (
          <div key={l}>
            <span className={`inline-block w-2.5 h-2.5 rounded-full ${c} mr-1.5`} />
            <span className="text-gray-600">{l}</span>
            <p className="font-semibold text-gray-900 mt-0.5">{fmt$(v)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Cohort multi-select ──────────────────────────────────────────────────────
function CohortFilter({ cohorts, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const toggle = (c) => onChange(selected.includes(c) ? selected.filter(x => x !== c) : [...selected, c]);
  const label = selected.length === 0 || selected.length === cohorts.length ? 'All Cohorts' : `Cohort ${selected.join(', ')}`;

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const handleEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 text-gray-700 min-w-[140px]">
        <span className="flex-1 text-left truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[160px] py-1">
          <button onClick={() => { onChange([]); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">All Cohorts</button>
          <div className="border-t border-gray-100 my-1" />
          {cohorts.map(c => (
            <label key={c} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} className="rounded border-gray-300" />
              Cohort {c}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Action queue section ─────────────────────────────────────────────────────
// ─── Chart tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-800 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium text-gray-900">{fmt$(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'thisWeek', label: 'This Week' },
  { key: 'lastWeek', label: 'Last Week' },
  { key: 'mtd', label: 'MTD' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'qtd', label: 'QTD' },
  { key: 'lastQuarter', label: 'Last Quarter' },
  { key: 'ytd', label: 'YTD' },
];

// ─── Compliance Lists (Not Compliant / At Risk / Compliant) ───────────────────

const LIST_META = {
  NOT_COMPLIANT: {
    label: 'Not Compliant List',
    sub: 'Invoiced this year or on a plan · no payment this month · last paid more than 90 days ago',
    card: 'border-red-300 bg-red-50',
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500',
  },
  AT_RISK: {
    label: 'At Risk',
    sub: 'Partial payment this month, or no payment with last paid 30–90 days ago',
    card: 'border-amber-300 bg-amber-50',
    badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-amber-500',
  },
  COMPLIANT: {
    label: 'Compliance List',
    sub: 'Invoiced this year or on a plan · paid full invoice or payment plan amount this month',
    card: 'border-green-300 bg-green-50',
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-green-500',
  },
};

function fmtListDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function listRowsToCSV(rows) {
  const headers = ['Name', 'Cohort', 'On Plan', 'Total Owed', 'Monthly Obligation', 'Paid This Month', 'Shortfall', 'Last Payment Date', 'Days Since Last Payment', 'Last Payment Amount', 'Open Invoices', 'Plan Description'];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach((r) => {
    lines.push([
      r.fellowName,
      r.cohort ?? '',
      r.onPlan ? 'Yes' : 'No',
      r.totalOutstanding,
      r.obligationAmount ?? '',
      r.paidInMonth,
      r.shortfall ?? '',
      r.lastPaymentDate ? new Date(r.lastPaymentDate).toISOString().slice(0, 10) : '',
      r.daysSinceLastPayment ?? '',
      r.lastPaymentAmount ?? '',
      r.openInvoices,
      r.planDescription ?? '',
    ].map(esc).join(','));
  });
  return lines.join('\n');
}

function exportListCSV(items, statusKey, month) {
  const blob = new Blob([listRowsToCSV(items)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${statusKey.toLowerCase()}-${month}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ComplianceListCard({ status, items, month, defaultOpen }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const meta = LIST_META[status];
  const count = items?.length || 0;
  const isCompliant = status === 'COMPLIANT';

  return (
    <div className={`rounded-xl border ${meta.card} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-800 text-sm">{meta.label}</div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">{meta.sub}</div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>{count}</span>
        {count > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); exportListCSV(items, status, month); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); exportListCSV(items, status, month); } }}
            className="text-xs px-2 py-1 rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          >
            CSV
          </span>
        )}
        <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        count === 0 ? (
          <div className="border-t border-gray-200/60 px-4 py-6 text-center text-sm text-gray-400 bg-white/40">
            No fellows in this list for the selected month.
          </div>
        ) : (
          <div className="border-t border-gray-200/60 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 uppercase tracking-wide bg-white/60">
                  <th className="px-4 py-2 text-left font-medium">Fellow</th>
                  <th className="px-3 py-2 text-right font-medium">Total owed</th>
                  <th className="px-3 py-2 text-right font-medium">Monthly</th>
                  <th className="px-3 py-2 text-right font-medium">Paid this mo.</th>
                  <th className="px-3 py-2 text-right font-medium">Shortfall</th>
                  <th className="px-3 py-2 text-left font-medium">Last payment</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr
                    key={r.fellowId || `${r.fellowName}-${i}`}
                    className="border-t border-gray-200/60 bg-white/40 hover:bg-white/80"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">{r.fellowName}</div>
                      <div className="text-xs text-gray-400">
                        {r.cohort ? `Cohort ${r.cohort}` : 'No cohort'}
                        {r.onPlan && ' · on plan'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-900">{fmt$(r.totalOutstanding)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{r.obligationAmount != null ? fmt$(r.obligationAmount) : '—'}</td>
                    <td className={`px-3 py-2.5 text-right ${r.paidInMonth > 0 ? (isCompliant ? 'text-green-700 font-medium' : 'text-gray-900') : 'text-gray-400'}`}>
                      {fmt$(r.paidInMonth)}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${r.shortfall ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                      {r.shortfall ? fmt$(r.shortfall) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-left">
                      {r.lastPaymentDate ? (
                        <div>
                          <div className="text-xs text-gray-700">{fmtListDate(r.lastPaymentDate)}</div>
                          <div className="text-xs text-gray-400">
                            {r.daysSinceLastPayment != null ? `${r.daysSinceLastPayment}d ago` : ''}
                            {r.lastPaymentAmount != null ? ` · ${fmt$(r.lastPaymentAmount)}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Never recorded</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const MetricsDashboard = () => {
  const token = useAuthStore((s) => s.token);
  const mtd = getPresetRange('mtd');
  const [startDate, setStartDate] = useState(mtd.start);
  const [endDate, setEndDate] = useState(mtd.end);
  const [activePreset, setActivePreset] = useState('mtd');
  const [selectedCohorts, setSelectedCohorts] = useState([]);
  const [activeTab, setActiveTab] = useState('executive');
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Always-on Past Week snapshot for Executive Summary (independent of filter presets)
  const [weekSnap, setWeekSnap] = useState(null);
  // Executive-summary highlights: repayment-method enrolments, the invoice pipeline and
  // the bond-completion watchlist. Server-derived from the invoice queue.
  const [execSummary, setExecSummary] = useState(null);

  // Compliance Lists (Not Compliant / At Risk / Compliant) state
  const [ncMonth, setNcMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [ncData, setNcData] = useState(null);
  const [ncLoading, setNcLoading] = useState(false);

  const fetchMetricsRange = useCallback(async (range) => {
    const params = new URLSearchParams({ startDate: range.start, endDate: range.end });
    if (selectedCohorts.length > 0) params.set('cohort', selectedCohorts.join(','));
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/payment/admin/metrics?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to load metrics');
    return res.json();
  }, [selectedCohorts, token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMetrics(await fetchMetricsRange({ start: startDate, end: endDate }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, fetchMetricsRange]);

  useEffect(() => { load(); }, [load]);

  // Always load rolling last-7 for the Executive Summary past-week card
  useEffect(() => {
    let cancelled = false;
    const weekRange = getPresetRange('last7');
    fetchMetricsRange(weekRange)
      .then((weekData) => {
        if (cancelled) return;
        setWeekSnap({
          total: weekData.totalCollections,
          prior: weekData.priorCollections,
          start: weekRange.start,
          end: weekRange.end,
        });
      })
      .catch(() => {
        if (!cancelled) setWeekSnap(null);
      });
    return () => { cancelled = true; };
  }, [fetchMetricsRange]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.VITE_API_URL}/api/job-outcomes/exec-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((s) => { if (!cancelled) setExecSummary(s); })
      .catch(() => { if (!cancelled) setExecSummary(null); });
    return () => { cancelled = true; };
  }, [token]);

  // Fetch compliance lists on mount + whenever month changes (powers tab badge too)
  useEffect(() => {
    let cancelled = false;
    setNcLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/payment/admin/noncompliance?month=${ncMonth}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load compliance lists'))))
      .then((data) => { if (!cancelled) setNcData(data); })
      .catch(() => { if (!cancelled) setNcData(null); })
      .finally(() => { if (!cancelled) setNcLoading(false); });
    return () => { cancelled = true; };
  }, [ncMonth, token]);

  const applyPreset = (key) => {
    const range = getPresetRange(key);
    if (!range) return;
    setActivePreset(key);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const handleCustomDate = (field, val) => {
    setActivePreset(null);
    if (field === 'start') setStartDate(val);
    else setEndDate(val);
  };

  const cohorts = metrics?.cohorts || [];
  const ncCounts = ncData?.counts || {};
  const totalQueueItems = (ncCounts.NOT_COMPLIANT || 0) + (ncCounts.AT_RISK || 0);

  const generatedAt = metrics?.generatedAt
    ? new Date(metrics.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  const selectedPeriodLabel = activePreset
    ? (PRESETS.find((p) => p.key === activePreset)?.label || 'Selected Period')
    : 'Custom Range';

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-5 space-y-4">

        {/* ── Header + filters ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-[#4242EA]" />
            <span className="text-base font-semibold text-gray-900">Collections Dashboard</span>
            {generatedAt && (
              <span className="ml-auto text-xs text-gray-400">Updated {generatedAt}</span>
            )}
          </div>

          {/* Preset buttons */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  activePreset === p.key
                    ? 'bg-[#4242EA] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5 ml-2">
              <input type="date" value={startDate} onChange={e => handleCustomDate('start', e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-[#4242EA]" />
              <span className="text-gray-400 text-xs">—</span>
              <input type="date" value={endDate} onChange={e => handleCustomDate('end', e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-[#4242EA]" />
            </div>
            <div className="ml-auto">
              <CohortFilter cohorts={cohorts} selected={selectedCohorts} onChange={setSelectedCohorts} />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-200 -mb-4 pt-1">
            {[
              { key: 'executive', label: 'Executive Summary' },
              { key: 'operator', label: `Operator View${totalQueueItems > 0 ? ` (${totalQueueItems})` : ''}` },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-[#4242EA] text-[#4242EA]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600 px-1">{error}</p>}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
                <div className="h-7 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : metrics ? (
          <>
            {/* ════ EXECUTIVE SUMMARY TAB ════ */}
            {activeTab === 'executive' && (
              <div className="space-y-4">

                {/* Hero: selected-period + Past-week collections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-gradient-to-r from-[#4242EA] to-[#8b5cf6] rounded-2xl p-6 text-white">
                    <p className="text-sm font-medium text-white/70 uppercase tracking-wide mb-1">
                      {selectedPeriodLabel} Collections
                    </p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-4xl font-bold">{fmt$(metrics.totalCollections)}</p>
                      <DeltaBadge current={metrics.totalCollections} prior={metrics.priorCollections} />
                    </div>
                    <p className="text-sm text-white/60 mt-2">
                      {startDate} — {endDate}
                      {selectedCohorts.length > 0 && ` · Cohort ${selectedCohorts.join(', ')}`}
                      {metrics.priorCollections != null && (
                        <span className="ml-2">· Prior period: {fmt$(metrics.priorCollections)}</span>
                      )}
                    </p>
                  </div>
                  <div className="bg-gradient-to-r from-[#1e1b4b] to-[#4242EA] rounded-2xl p-6 text-white">
                    <p className="text-sm font-medium text-white/70 uppercase tracking-wide mb-1">Past Week Collections</p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-4xl font-bold">{fmt$(weekSnap?.total)}</p>
                      <DeltaBadge current={weekSnap?.total} prior={weekSnap?.prior} />
                    </div>
                    <p className="text-sm text-white/60 mt-2">
                      {weekSnap
                        ? `${weekSnap.start} — ${weekSnap.end} · rolling last 7 days`
                        : 'Rolling last 7 days'}
                      {weekSnap?.prior != null && (
                        <span className="ml-2">· Prior 7 days: {fmt$(weekSnap.prior)}</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Last-week highlights */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">Highlights — Last Week</h3>
                    {execSummary?.headline && (
                      <p className="text-sm text-gray-700 mt-2">{execSummary.headline}</p>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-800 mb-1">Payment Operations</h4>
                    <p className="text-sm text-gray-600 mb-3">{PAYMENT_METHOD_COPY.methodsIntro}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {PAYMENT_METHOD_COPY.methods.map((method) => (
                        <div key={method.title} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                          <p className="text-sm font-semibold text-gray-900">{method.title}</p>
                          <p className="text-sm text-gray-600 mt-1">{method.body}</p>
                          {execSummary && (
                            <p className="text-xs font-medium text-[#4242EA] mt-2">
                              YTD: {execSummary.ytdEnrolledByMethod?.[method.methodKey] ?? 0} Builders enrolled.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {!!execSummary?.pursuitManagedActive?.length && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-800 mb-2">Pursuit-Managed (active)</h4>
                      <ul className="text-sm text-gray-700 space-y-1">
                        {execSummary.pursuitManagedActive.map((row) => (
                          <li key={row.fellow_name}>
                            <span className="font-medium text-gray-900">{row.fellow_name}</span>
                            <span className="text-gray-500"> — {row.notes}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!!execSummary?.pipeline?.length && (
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                        <h4 className="text-sm font-semibold text-gray-800">
                          Start invoicing in {monthLabel(execSummary.pipelineMonth)}
                        </h4>
                        <p className="text-xs text-gray-500">
                          Pipeline total:{' '}
                          <span className="font-semibold text-gray-800">
                            {fmt$Precise(execSummary.pipeline.reduce((s, r) => s + (r.monthly_amount || 0), 0))}
                          </span>
                          /mo
                        </p>
                      </div>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                              <th className="text-left font-medium px-3 py-2">Name</th>
                              <th className="text-right font-medium px-3 py-2">Monthly Amount</th>
                              <th className="text-left font-medium px-3 py-2">Payment Method</th>
                              <th className="text-left font-medium px-3 py-2">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {execSummary.pipeline.map((row) => (
                              <tr key={row.fellow_name} className="border-t border-gray-100">
                                <td className="px-3 py-2 font-medium text-gray-900">{row.fellow_name}</td>
                                <td className="px-3 py-2 text-right text-gray-800">{fmt$Precise(row.monthly_amount)}</td>
                                <td className="px-3 py-2 text-gray-700">{row.payment_method}</td>
                                <td className="px-3 py-2 text-gray-500">{row.notes}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <KpiCard
                    icon={DollarSign} label="Total AR Outstanding"
                    value={fmt$(metrics.totalAR)}
                    color="gray"
                  />
                  <KpiCard
                    icon={CheckCircle} label="On-Time Rate"
                    value={fmtPct(metrics.onTimeRate)}
                    sub="Portfolio-level"
                    color={kpiColor(metrics.onTimeRate, { green: 80, yellow: 65 })}
                  />
                  <KpiCard
                    icon={Clock} label="Avg Days Past Due"
                    value={metrics.avgDaysPastDue != null ? `${metrics.avgDaysPastDue}d` : '—'}
                    sub="Weighted by balance · target ≤30d"
                    color={kpiColor(metrics.avgDaysPastDue, { bad: 60, warn: 30 })}
                  />
                </div>

                {/* AR Aging bar */}
                <AgingBar
                  current={metrics.outstanding?.current}
                  late1to90={metrics.outstanding?.late1to90}
                  late90plus={metrics.outstanding?.late90plus}
                />

                {/* All-time portfolio stats */}
                {metrics.allTimeStats && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">All-Time Portfolio</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Invoiced</p>
                        <p className="text-xl font-bold text-gray-900">{fmt$(metrics.allTimeStats.totalInvoiced)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Collected</p>
                        <p className="text-xl font-bold text-gray-900">{fmt$(metrics.allTimeStats.totalCollected)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Collection Rate</p>
                        <p className="text-xl font-bold text-[#4242EA]">{fmtPct(metrics.allTimeStats.allTimeCollectionRate)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Avg Paid / Fellow</p>
                        <p className="text-xl font-bold text-gray-900">{fmt$(metrics.allTimeStats.avgPaidPerFellow)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{metrics.allTimeStats.fellowCount} fellows</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 6-month collections chart */}
                {metrics.trendlines?.monthlyCollections?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Monthly Collections — Last 6 Months</h3>
                    <p className="text-xs text-gray-500 mb-4">Cash collected per calendar month (Payments - Final ledger)</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={metrics.trendlines.monthlyCollections} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="total" name="Collections" radius={[4, 4, 0, 0]}>
                          {metrics.trendlines.monthlyCollections.map((entry, i, arr) => (
                            <Cell key={i} fill={i === arr.length - 1 ? '#4242EA' : '#c7d2fe'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Salary averages by cohort */}
                {metrics.salaryCohorts?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Average Salary by Cohort</h3>
                    <p className="text-xs text-gray-500 mb-4">From employment records · {metrics.salaryCohorts.reduce((s, c) => s + c.placement_count, 0)} placements total</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={metrics.salaryCohorts.map(c => ({ ...c, label: `C${c.cohort}` }))}
                        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v, name) => [fmt$(v), name]}
                          labelFormatter={label => `Cohort ${label.replace('C', '')}`}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload;
                            return (
                              <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
                                <p className="font-semibold text-gray-800 mb-1">Cohort {d?.cohort}</p>
                                <p>Avg salary: <strong>{fmt$(d?.avg_salary)}</strong></p>
                                <p>Range: {fmt$(d?.min_salary)} – {fmt$(d?.max_salary)}</p>
                                <p className="text-gray-400">{d?.placement_count} placement{d?.placement_count !== 1 ? 's' : ''}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="avg_salary" name="Avg Salary" radius={[4, 4, 0, 0]} fill="#4242EA" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* ════ OPERATOR VIEW TAB ════ */}
            {activeTab === 'operator' && (
              <div className="space-y-4">

                {/* Compliance Lists (Not Compliant · At Risk · Compliant) */}
                <div>
                  <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-3 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800">Compliance Lists</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {ncData?.monthLabel || '—'} · only fellows invoiced this year or on a payment plan
                      </p>
                    </div>
                    <input
                      type="month"
                      value={ncMonth}
                      onChange={(e) => setNcMonth(e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:border-[#4242EA]"
                    />
                  </div>
                  <div className="space-y-2">
                    {ncLoading && !ncData ? (
                      <div className="rounded-xl border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-400">
                        Loading compliance lists…
                      </div>
                    ) : ncData ? (
                      <>
                        <ComplianceListCard status="NOT_COMPLIANT" items={ncData.notCompliant || []} month={ncMonth} defaultOpen={true} />
                        <ComplianceListCard status="AT_RISK"       items={ncData.atRisk || []}       month={ncMonth} defaultOpen={false} />
                        <ComplianceListCard status="COMPLIANT"     items={ncData.compliant || []}    month={ncMonth} defaultOpen={false} />
                      </>
                    ) : (
                      <div className="rounded-xl border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-400">
                        No data available
                      </div>
                    )}
                  </div>
                </div>

                {/* Pause Watchlist (curated V1 — empty until live filtering returns) */}
                <div className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-violet-100 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-gray-800">Pause Watchlist</span>
                    <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                      {CURATED_PAUSE_WATCHLIST.length}
                    </span>
                  </div>
                  {CURATED_PAUSE_WATCHLIST.length > 0 ? (
                    <div className="divide-y divide-violet-100">
                      {CURATED_PAUSE_WATCHLIST.map((p, i) => (
                        <div key={i} className="px-4 py-3 bg-white/60 flex items-center justify-between gap-3">
                          <span className="font-medium text-gray-900 text-sm">{p.fellowName}</span>
                          <span className="text-xs text-gray-600 flex-shrink-0">
                            {p.startLabel} — {p.endLabel}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-5 text-sm text-gray-400 text-center">No active pauses</p>
                  )}
                </div>

                {/* Upcoming Bond Complete (within 3 months) */}
                {(() => {
                  const upcomingBondComplete = getUpcomingBondComplete(
                    (execSummary?.upcomingBondComplete || []).map(normalizeCompletion)
                  );
                  return (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
                      <div className="px-4 py-3 border-b border-emerald-100 flex items-center gap-2 flex-wrap">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        <span className="text-sm font-semibold text-gray-800">Upcoming Bond Complete</span>
                        <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          {upcomingBondComplete.length}
                        </span>
                        <span className="text-xs text-gray-500 ml-auto">Within next 3 months</span>
                      </div>
                      {upcomingBondComplete.length > 0 ? (
                        <div className="divide-y divide-emerald-100">
                          {upcomingBondComplete.map((entry) => (
                            <div
                              key={entry.fellowName}
                              className="px-4 py-3 bg-white/60 flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <span className="font-medium text-gray-900 text-sm">{entry.fellowName}</span>
                                <p className="text-xs text-gray-600 mt-0.5">{entry.detail}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="text-sm font-semibold text-emerald-800">
                                  {fmt$(entry.remainingAmount)} left
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {formatEtaLabel(entry.monthsRemaining)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="px-4 py-5 text-sm text-gray-400 text-center">
                          No Bond Completes expected in the next 3 months
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Payment performance by invoice month table */}
                {metrics.byInvoiceMonth?.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-800">Payment Performance by Invoice Month</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Grouped by invoice date · first 2 rows are in progress</p>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                          <th className="px-4 py-2.5 text-left font-medium">Month</th>
                          <th className="px-3 py-2.5 text-right font-medium">Sent $</th>
                          <th className="px-3 py-2.5 text-right font-medium"># Invoices</th>
                          <th className="px-3 py-2.5 text-right font-medium">Total Collected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.byInvoiceMonth.map((row) => (
                          <tr
                            key={row.month}
                            className={`border-t border-gray-100 ${row.inProgress ? 'opacity-50 italic' : 'hover:bg-gray-50'}`}
                          >
                            <td className="px-4 py-2.5 font-medium text-gray-800">
                              {row.label}
                              {row.inProgress && <span className="ml-1.5 text-xs text-gray-400 not-italic">(in progress)</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-900">{fmt$(row.sentAmount)}</td>
                            <td className="px-3 py-2.5 text-right text-gray-500">{row.sentCount}</td>
                            <td className="px-3 py-2.5 text-right font-medium text-gray-900">{fmt$(row.collectedITD)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default MetricsDashboard;
